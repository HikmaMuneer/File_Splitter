import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";
import path from "path";

export interface SplitRange {
  pages: number[];
  filename: string;
}

export interface SplitResult {
  filename: string;
  data: Uint8Array;
  pages: number[];
  size: number;
}

export interface SplitPdfOptions {
  pdfBuffer: Buffer;
  ranges: number[][];
  originalFilename: string;
  returnZip?: boolean;
}

export interface SplitPdfResult {
  success: boolean;
  results: SplitResult[];
  zipBuffer?: Buffer;
  zipFilename?: string;
  error?: string;
}

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

export async function splitPdfFromInstructions(
  pdfBuffer: Buffer, 
  instructions: string, 
  originalFilename: string,
  returnZip: boolean = false
): Promise<SplitPdfResult> {
  try {
    const ranges = parseInstructions(instructions);
    return await splitPdf({
      pdfBuffer,
      ranges,
      originalFilename,
      returnZip
    });
  } catch (error) {
    return {
      success: false,
      results: [],
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}

export async function splitPdf(options: SplitPdfOptions): Promise<SplitPdfResult> {
  const { pdfBuffer, ranges, originalFilename, returnZip = false } = options;
  
  try {
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
    
    const results: SplitResult[] = [];
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
    
    let zipBuffer: Buffer | undefined;
    let zipFilename: string | undefined;
    
    if (returnZip) {
      const zip = new JSZip();
      
      for (const result of results) {
        zip.file(result.filename, result.data);
      }
      
      zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
      zipFilename = `${baseFilename}-split.zip`;
    }
    
    return {
      success: true,
      results,
      zipBuffer,
      zipFilename
    };
    
  } catch (error) {
    return {
      success: false,
      results: [],
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}