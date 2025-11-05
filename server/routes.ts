import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer, { type Multer } from "multer";
import { splitInstructionsSchema } from "@shared/schema";
import { splitPdfFromInstructions } from "./pdf-splitter";

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

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
        // Split PDF and create ZIP
        const splitResult = await splitPdfFromInstructions(
          req.file.buffer, 
          instructions, 
          req.file.originalname,
          true // return ZIP
        );
        
        if (!splitResult.success) {
          throw new Error(splitResult.error || "Failed to split PDF");
        }
        
        // Update job status
        await storage.updatePdfJob(job.id, {
          status: "completed",
          resultFiles: splitResult.results.map(r => r.filename)
        });
        
        // Send ZIP file
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${splitResult.zipFilename}"`);
        res.send(splitResult.zipBuffer);
        
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
