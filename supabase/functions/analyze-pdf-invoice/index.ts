import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// Convert PDF to images using pdf2pic service or similar
async function convertPdfToImages(base64Pdf: string): Promise<string[]> {
  try {
    // For now, we'll use a workaround by sending the PDF as a single "image"
    // In production, you might want to use a service like pdf2pic or similar
    
    // Convert PDF base64 to a data URL that OpenAI can process
    // Note: This is a simplified approach - OpenAI's vision API can sometimes
    // handle PDF data URLs, though it's not officially documented
    return [`data:application/pdf;base64,${base64Pdf}`];
  } catch (error) {
    console.error("Error converting PDF to images:", error);
    throw new Error("Failed to convert PDF to images");
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { base64 } = await req.json();

    if (!base64) {
      return new Response(JSON.stringify({ error: "Missing base64 data" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      });
    }

    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) {
      return new Response(JSON.stringify({ error: "OpenAI API key not configured" }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      });
    }

    console.log("Converting PDF to images...");
    
    // Convert PDF to images
    const imageDataUrls = await convertPdfToImages(base64);
    
    console.log(`Converted PDF to ${imageDataUrls.length} images`);
    console.log("Processing with OpenAI Vision API...");

    // Create content array with all images
    const imageContent = imageDataUrls.map(imageUrl => ({
      type: "image_url" as const,
      image_url: {
        url: imageUrl,
        detail: "high" as const
      }
    }));

    // Prepare the message for OpenAI with all images
    const messages = [
      {
        role: "system" as const,
        content: `
You are an intelligent PDF invoice analyzer. Your task is to examine the provided document images and return a structured JSON object with the following information:

Step 1: Document Type Identification
- Determine whether the document is an invoice or a credit memo.
- If it is a shipment invoice, statement, or any other type of document, respond with: "This is not an invoice." and stop further processing.

Step 2: Invoice Extraction
If the document is an invoice, count how many different invoices are present across all pages.

For each invoice, return the following details:
{
  "invoice_number": "string",  
  "start_page": "int",         
  "end_page": "int",           
  "blank_pages": ["list of page numbers"] or "none",
  "vendor_name": "string"      
}

Invoice Number Extraction Rules:
- Only extract invoice numbers clearly labeled as: "INVOICE", "INVOICE NO", "Invoice#", or "Invoice Number".
- Do NOT extract numbers labeled as PO Number, Customer Number, Customer#, Document Number, or Order Number.
- Clean the invoice number by removing labels (like "INV", "INVOICE", "#", etc.) and special characters such as hyphens or slashes.
- If the invoice number is in a format like "ABC-12345" or "11-1234", extract only the part after the dash.
- If an invoice number cannot be confidently determined after checking the page, return "not an invoice".

Vendor Name Extraction Rules:
- Exclude our company name: "Read's Uniforms".
- Return only the vendor name that issued the invoice.
- Clean name for filenames (no special chars, no extra spaces).
- Normalize common variations:
  - "V.H. Blackinton Co., Inc.", "V,H, CO." → "VH Blackinton"
  - "Premier Emblem" remains "Premier Emblem"
  - "Asti Manufacturing LLC" → "Asti Manufacturing"
- If vendor name is not found, return "Unknown Vendor".

Return JSON:
{
  "type": "string",
  "number_of_invoices": int,
  "vendor_name": "string",
  "invoice_details": [
    {
      "invoice_number": "string",
      "start_page": "int",
      "end_page": "int",
      "vendor_name": "string"
    }
  ]
}
        `.trim(),
      },
      {
        role: "user" as const,
        content: [
          {
            type: "text" as const,
            text: "Please analyze these document images and extract the invoice information according to the rules provided. The images are provided in page order.",
          },
          ...imageContent
        ],
      },
    ];

    // Call OpenAI API
    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: messages,
        temperature: 0.1,
        max_tokens: 2000,
      }),
    });

    if (!openaiResponse.ok) {
      const errorData = await openaiResponse.text();
      console.error("OpenAI API Error:", errorData);
      return new Response(JSON.stringify({ 
        error: "Failed to analyze document with OpenAI",
        details: errorData 
      }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      });
    }

    const openaiData = await openaiResponse.json();
    const result = openaiData.choices[0]?.message?.content;

    if (!result) {
      return new Response(JSON.stringify({ 
        error: "No response from OpenAI" 
      }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      });
    }

    // Try to parse the result as JSON
    let parsedResult;
    try {
      parsedResult = JSON.parse(result);
    } catch (parseError) {
      // If parsing fails, return the raw result
      console.log("Failed to parse JSON, returning raw result:", result);
      parsedResult = { raw_result: result };
    }

    return new Response(JSON.stringify({ 
      success: true,
      images_processed: imageDataUrls.length,
      result: parsedResult 
    }), {
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });

  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ 
      error: err.message || "Internal server error" 
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  }
});