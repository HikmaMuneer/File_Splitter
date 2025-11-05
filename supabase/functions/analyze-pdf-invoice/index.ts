import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

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

    console.log("Converting base64 to file blob...");
    
    // Convert base64 to Uint8Array
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Create a File object from the bytes
    const pdfFile = new File([bytes], "document.pdf", { type: "application/pdf" });

    console.log("Uploading PDF to OpenAI Files API...");

    // Upload file to OpenAI
    const formData = new FormData();
    formData.append("file", pdfFile);
    formData.append("purpose", "vision");

    const uploadResponse = await fetch("https://api.openai.com/v1/files", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
      },
      body: formData,
    });

    if (!uploadResponse.ok) {
      const errorData = await uploadResponse.text();
      console.error("File upload error:", errorData);
      return new Response(JSON.stringify({ 
        error: "Failed to upload file to OpenAI",
        details: errorData 
      }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      });
    }

    const uploadData = await uploadResponse.json();
    const fileId = uploadData.id;
    
    console.log(`File uploaded successfully with ID: ${fileId}`);
    console.log("Analyzing PDF with OpenAI Vision API...");

    // Use the file in chat completion
    const chatResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `
You are an intelligent PDF invoice analyzer. Your task is to examine the provided PDF document and return a structured JSON object with the following information:

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
            role: "user",
            content: [
              {
                type: "text",
                text: "Please analyze this PDF document and extract the invoice information according to the rules provided.",
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:application/pdf;base64,${base64}`,
                  detail: "high"
                }
              }
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 2000,
      }),
    });

    // Clean up: Delete the uploaded file
    try {
      await fetch(`https://api.openai.com/v1/files/${fileId}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${openaiApiKey}`,
        },
      });
      console.log(`Cleaned up file ${fileId}`);
    } catch (cleanupError) {
      console.warn("Failed to cleanup file:", cleanupError);
    }

    if (!chatResponse.ok) {
      const errorData = await chatResponse.text();
      console.error("OpenAI Chat API Error:", errorData);
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

    const chatData = await chatResponse.json();
    const result = chatData.choices[0]?.message?.content;

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
      file_id_used: fileId,
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