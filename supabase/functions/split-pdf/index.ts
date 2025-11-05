import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

interface SplitRequest {
  base64_file: string;
  instructions: string;
  filename?: string;
}

interface SplitResult {
  filename: string;
  base64_data: string;
  pages: number[];
  size: number;
}

interface SplitResponse {
  success: boolean;
  results?: SplitResult[];
  zip_base64?: string;
  zip_filename?: string;
  error?: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

async function splitPdf(base64File: string, ranges: number[][], originalFilename: string): Promise<SplitResult[]> {
  // Import PDF-lib dynamically
  const { PDFDocument } = await import("https://cdn.skypack.dev/pdf-lib@1.17.1");
  const JSZip = await import("https://cdn.skypack.dev/jszip@3.10.1");
  
  // Convert base64 to Uint8Array
  const pdfBytes = Uint8Array.from(atob(base64File), c => c.charCodeAt(0));
  
  // Load PDF document
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
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
  const baseFilename = originalFilename.replace(/\.pdf$/i, '');
  
  for (let i = 0; i < ranges.length; i++) {
    const range = ranges[i];
    const newPdf = await PDFDocument.create();
    
    for (const pageNum of range) {
      const [copiedPage] = await newPdf.copyPages(pdfDoc, [pageNum - 1]); // Convert to 0-based
      newPdf.addPage(copiedPage);
    }
    
    const pdfBytesResult = await newPdf.save();
    
    // Generate filename
    let filename;
    if (range.length === 1) {
      filename = `${baseFilename}-page-${range[0]}.pdf`;
    } else {
      filename = `${baseFilename}-pages-${range[0]}-${range[range.length - 1]}.pdf`;
    }
    
    // Convert to base64
    const base64Data = btoa(String.fromCharCode(...pdfBytesResult));
    
    results.push({
      filename,
      base64_data: base64Data,
      pages: range,
      size: pdfBytesResult.length
    });
  }
  
  return results;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      throw new Error('Method not allowed');
    }

    const { base64_file, instructions, filename = 'document.pdf' }: SplitRequest = await req.json();

    if (!base64_file || !instructions) {
      throw new Error('Missing required fields: base64_file and instructions');
    }

    // Parse instructions and split PDF
    const ranges = parseInstructions(instructions);
    const results = await splitPdf(base64_file, ranges, filename);

    // Create ZIP file
    const JSZip = (await import("https://cdn.skypack.dev/jszip@3.10.1")).default;
    const zip = new JSZip();
    
    for (const result of results) {
      // Convert base64 back to binary for ZIP
      const binaryData = Uint8Array.from(atob(result.base64_data), c => c.charCodeAt(0));
      zip.file(result.filename, binaryData);
    }
    
    const zipBuffer = await zip.generateAsync({ type: "uint8array" });
    const zipBase64 = btoa(String.fromCharCode(...zipBuffer));
    const zipFilename = `${filename.replace(/\.pdf$/i, '')}-split.zip`;

    const response: SplitResponse = {
      success: true,
      results,
      zip_base64: zipBase64,
      zip_filename: zipFilename
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('PDF split error:', error);
    
    const errorResponse: SplitResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };

    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});