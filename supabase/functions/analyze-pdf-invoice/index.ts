const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { fileId } = await req.json();

    if (!fileId) {
      return new Response(JSON.stringify({ error: "Missing fileId" }), {
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

    // Step 1: Create categorization assistant
    const categorizationResponse = await fetch("https://api.openai.com/v1/assistants", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
        "OpenAI-Beta": "assistants=v2",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        name: "Document Categorizer",
        instructions: `
You are a document classifier. Analyze the provided document and classify it as one of the following:
- invoice
- credit_memo
- not_an_invoice

Return only the classification word, nothing else.
        `.trim(),
        tools: [{ type: "file_search" }],
        tool_resources: {
          file_search: {
            vector_stores: [
              {
                file_ids: [fileId]
              }
            ]
          }
        }
      }),
    });

    if (!categorizationResponse.ok) {
      const errorData = await categorizationResponse.text();
      console.error("OpenAI Categorization Assistant Creation Error:", errorData);
      return new Response(JSON.stringify({ 
        error: "Failed to create categorization assistant",
        details: errorData 
      }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      });
    }

    const categorizationAssistant = await categorizationResponse.json();
    console.log("Created categorization assistant:", categorizationAssistant.id);

    // Create a thread for categorization
    const categorizationThreadResponse = await fetch("https://api.openai.com/v1/threads", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
        "OpenAI-Beta": "assistants=v2",
      },
      body: JSON.stringify({
        messages: [
          {
            role: "user",
            content: "Please classify this document type."
          }
        ],
      }),
    });

    const categorizationThread = await categorizationThreadResponse.json();

    // Run categorization
    const categorizationRunResponse = await fetch(`https://api.openai.com/v1/threads/${categorizationThread.id}/runs`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
        "OpenAI-Beta": "assistants=v2",
      },
      body: JSON.stringify({
        assistant_id: categorizationAssistant.id,
      }),
    });

    const categorizationRun = await categorizationRunResponse.json();

    // Wait for categorization completion
    let categorizationRunStatus = categorizationRun;
    while (categorizationRunStatus.status === "queued" || categorizationRunStatus.status === "in_progress") {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const statusResponse = await fetch(`https://api.openai.com/v1/threads/${categorizationThread.id}/runs/${categorizationRun.id}`, {
        headers: {
          "Authorization": `Bearer ${openaiApiKey}`,
          "OpenAI-Beta": "assistants=v2",
        },
      });
      
      categorizationRunStatus = await statusResponse.json();
    }

    // Get categorization result
    const categorizationMessagesResponse = await fetch(`https://api.openai.com/v1/threads/${categorizationThread.id}/messages`, {
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "OpenAI-Beta": "assistants=v2",
      },
    });

    const categorizationMessages = await categorizationMessagesResponse.json();
    const documentType = categorizationMessages.data[0]?.content[0]?.text?.value?.trim().toLowerCase();

    // Cleanup categorization assistant
    try {
      await fetch(`https://api.openai.com/v1/assistants/${categorizationAssistant.id}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${openaiApiKey}`,
          "OpenAI-Beta": "assistants=v2",
        },
      });
    } catch (cleanupError) {
      console.log("Failed to cleanup categorization assistant:", cleanupError);
    }

    console.log("Document type:", documentType);

    // If not an invoice, return simple response
    if (documentType !== "invoice") {
      return new Response(JSON.stringify({ 
        success: true,
        file_id_analyzed: fileId,
        result: {
          type: documentType,
          message: documentType === "not_an_invoice" 
            ? "This document is not an invoice and cannot be processed for invoice splitting."
            : `This document is a ${documentType}, not a standard invoice.`
        }
      }), {
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      });
    }

    // Step 2: If it's an invoice, proceed with detailed analysis using strict format
    const assistantResponse = await fetch("https://api.openai.com/v1/assistants", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
        "OpenAI-Beta": "assistants=v2",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        name: "PDF Invoice Analyzer",
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "invoice_analysis",
            strict: true,
            schema: {
              type: "object",
              properties: {
                type: {
                  type: "string",
                  enum: ["invoice", "credit_memo", "not_an_invoice"]
                },
                number_of_invoices: {
                  type: "integer",
                  minimum: 0
                },
                vendor_name: {
                  type: "string"
                },
                invoice_details: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      invoice_number: {
                        type: "string"
                      },
                      start_page: {
                        type: "integer",
                        minimum: 1
                      },
                      end_page: {
                        type: "integer",
                        minimum: 1
                      },
                      vendor_name: {
                        type: "string"
                      }
                    },
                    required: ["invoice_number", "start_page", "end_page", "vendor_name"],
                    additionalProperties: false
                  }
                }
              },
              required: ["type", "number_of_invoices", "vendor_name", "invoice_details"],
              additionalProperties: false
            }
          }
        },
        instructions: `
You are an intelligent PDF invoice analyzer. Your task is to examine the provided PDF document and return a structured JSON object with the following information:

IMPORTANT: This PDF may contain scanned images or be image-based. Use your vision capabilities to read text from images and scanned documents.

Step 1: Document Type Identification
- Determine whether the document is an invoice or a credit memo.
- If it is a shipment invoice, statement, or any other type of document, respond with: "This is not an invoice." and stop further processing.

Step 2: Invoice Extraction
If the document is an invoice, count how many different invoices are present across all pages.

OCR and Vision Instructions:
- Carefully examine each page, including scanned images
- Look for text in various orientations and qualities
- Pay special attention to headers, invoice numbers, and vendor information
- If text is unclear, make your best interpretation based on context

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

IMPORTANT: You must return ONLY valid JSON that matches the exact schema. Do not include any explanatory text, markdown formatting, or additional content outside the JSON structure.
        `.trim(),
        tools: [{ type: "file_search" }],
        tool_resources: {
          file_search: {
            vector_stores: [
              {
                file_ids: [fileId]
              }
            ]
          }
        }
      }),
    });

    if (!assistantResponse.ok) {
      const errorData = await assistantResponse.text();
      console.error("OpenAI Assistant Creation Error:", errorData);
      return new Response(JSON.stringify({ 
        error: "Failed to create assistant",
        details: errorData 
      }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      });
    }

    const assistant = await assistantResponse.json();
    console.log("Created assistant:", assistant.id);

    // Create a thread
    const threadResponse = await fetch("https://api.openai.com/v1/threads", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
        "OpenAI-Beta": "assistants=v2",
      },
      body: JSON.stringify({
        messages: [
          {
            role: "user",
            content: "Please analyze the PDF file and extract the invoice information according to the rules provided."
          }
        ],
      }),
    });

    if (!threadResponse.ok) {
      const errorData = await threadResponse.text();
      console.error("OpenAI Thread Creation Error:", errorData);
      return new Response(JSON.stringify({ 
        error: "Failed to create thread",
        details: errorData 
      }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      });
    }

    const thread = await threadResponse.json();
    console.log("Created thread:", thread.id);

    // Run the assistant
    const runResponse = await fetch(`https://api.openai.com/v1/threads/${thread.id}/runs`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
        "OpenAI-Beta": "assistants=v2",
      },
      body: JSON.stringify({
        assistant_id: assistant.id,
      }),
    });

    if (!runResponse.ok) {
      const errorData = await runResponse.text();
      console.error("OpenAI Run Creation Error:", errorData);
      return new Response(JSON.stringify({ 
        error: "Failed to run assistant",
        details: errorData 
      }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      });
    }

    const run = await runResponse.json();
    console.log("Started run:", run.id);

    // Wait for completion (simple polling)
    let runStatus = run;
    while (runStatus.status === "queued" || runStatus.status === "in_progress") {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const statusResponse = await fetch(`https://api.openai.com/v1/threads/${thread.id}/runs/${run.id}`, {
        headers: {
          "Authorization": `Bearer ${openaiApiKey}`,
          "OpenAI-Beta": "assistants=v2",
        },
      });
      
      runStatus = await statusResponse.json();
      console.log("Run status:", runStatus.status);
    }

    // Get the messages
    const messagesResponse = await fetch(`https://api.openai.com/v1/threads/${thread.id}/messages`, {
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "OpenAI-Beta": "assistants=v2",
      },
    });

    const messages = await messagesResponse.json();
    const result = messages.data[0]?.content[0]?.text?.value;

    // Cleanup: Delete the assistant
    try {
      await fetch(`https://api.openai.com/v1/assistants/${assistant.id}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${openaiApiKey}`,
          "OpenAI-Beta": "assistants=v2",
        },
      });
      console.log("Cleaned up assistant");
    } catch (cleanupError) {
      console.log("Failed to cleanup assistant:", cleanupError);
    }

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

    // Parse the structured JSON response
    let parsedResult;
    try {
      parsedResult = JSON.parse(result);
      
      // Validate the response structure
      if (!parsedResult.type || !parsedResult.hasOwnProperty('number_of_invoices') || 
          !parsedResult.vendor_name || !Array.isArray(parsedResult.invoice_details)) {
        throw new Error("Invalid response structure");
      }
      
    } catch (parseError) {
      console.error("Failed to parse structured response:", parseError);
      return new Response(JSON.stringify({ 
        error: "Invalid response format from OpenAI",
        details: parseError.message,
        raw_result: result
      }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      });
    }

    return new Response(JSON.stringify({ 
      success: true,
      file_id_analyzed: fileId,
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