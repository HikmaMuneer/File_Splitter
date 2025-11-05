import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer, { type Multer } from "multer";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";
import { splitInstructionsSchema } from "@shared/schema";
import path from "path";
import fs from "fs";

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

function parseInstructions(instructions: string): number[][] {
  const ranges: number[][] = [];
  const parts = instructions.split(',').map(s => s.trim());
  
  for (const part of parts) {
    if (part.includes('-')) {
      // Range like "1-3"
      const [start, end] = part.split('-').map(s => parseInt(s.trim()));
      if (isNaN(start) || isNaN(end) || start > end || start < 1) {
        throw new Error(`Invalid range: ${part}`);
      }
      const range = [];
      for (let i = start; i <= end; i++) {
        range.push(i);
      }
      ranges.push(range);
    } else {
      // Individual page like "5"
      const page = parseInt(part);
      if (isNaN(page) || page < 1) {
        throw new Error(`Invalid page number: ${part}`);
      }
      ranges.push([page]);
    }
  }
  
  return ranges;
}

async function splitPdf(pdfBuffer: Buffer, ranges: number[][], originalFilename: string) {
  const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  const totalPages = pdfDoc.getPageCount();
  
  // Validate all page numbers
  for (const range of ranges) {
    for (const pageNum of range) {
      if (pageNum > totalPages) {
        throw new Error(`Page ${pageNum} does not exist. PDF has ${totalPages} pages.`);
      }
    }
  }
  
  const results = [];
  const baseFilename = path.parse(originalFilename).name;
  
  for (let i = 0; i < ranges.length; i++) {
    const range = ranges[i];
    const newPdf = await PDFDocument.create();
    
    for (const pageNum of range) {
      const [copiedPage] = await newPdf.copyPages(pdfDoc, [pageNum - 1]); // Convert to 0-based
      newPdf.addPage(copiedPage);
    }
    
    const pdfBytes = await newPdf.save();
    
    // Generate filename
    let filename;
    if (range.length === 1) {
      filename = `${baseFilename}-page-${range[0]}.pdf`;
    } else {
      filename = `${baseFilename}-pages-${range[0]}-${range[range.length - 1]}.pdf`;
    }
    
    results.push({
      filename,
      data: pdfBytes,
      pages: range,
      size: pdfBytes.length
    });
  }
  
  return results;
}

export async function registerRoutes(app: Express): Promise<Server> {
  
  app.post("/api/split-pdf", upload.single("pdf"), async (req: Request & { file?: Express.Multer.File }, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No PDF file uploaded" });
      }
      
      if (req.file.mimetype !== "application/pdf") {
        return res.status(400).json({ message: "File must be a PDF" });
      }
      
      const { instructions } = req.body;
      const validation = splitInstructionsSchema.safeParse({ instructions });
      
      if (!validation.success) {
        return res.status(400).json({ 
          message: "Invalid instructions", 
          errors: validation.error.errors 
        });
      }
      
      // Create job record
      const job = await storage.createPdfJob({
        originalFilename: req.file.originalname,
        instructions: instructions,
      });
      
      try {
        // Parse instructions
        const ranges = parseInstructions(instructions);
        
        // Split PDF
        const splitResults = await splitPdf(req.file.buffer, ranges, req.file.originalname);
        
        // Create ZIP file
        const zip = new JSZip();
        
        for (const result of splitResults) {
          zip.file(result.filename, result.data);
        }
        
        const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
        
        // Update job status
        await storage.updatePdfJob(job.id, {
          status: "completed",
          resultFiles: splitResults.map(r => r.filename)
        });
        
        // Send ZIP file
        const zipFilename = `${path.parse(req.file.originalname).name}-split.zip`;
        
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);
        res.send(zipBuffer);
        
      } catch (error) {
        // Update job with error
        await storage.updatePdfJob(job.id, {
          status: "failed",
          errorMessage: error instanceof Error ? error.message : "Unknown error"
        });
        
        throw error;
      }
      
    } catch (error) {
      console.error("PDF split error:", error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to process PDF" 
      });
    }
  });
  
  app.get("/api/job/:id", async (req, res) => {
    try {
      const job = await storage.getPdfJob(req.params.id);
      if (!job) {
        return res.status(404).json({ message: "Job not found" });
      }
      res.json(job);
    } catch (error) {
      res.status(500).json({ message: "Failed to get job status" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
