import { PDFDocument } from 'npm:pdf-lib@1.17.1';

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
    const { base64_file, prompt_to_send } = await req.json();
    const apiKey = Deno.env.get('OPENAI_API_KEY');

    if (!apiKey) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'OpenAI API key not configured' 
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders,
          },
        }
      );
    }
    if (!base64_file || !prompt_to_send) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Missing base64_file or prompt_to_send' 
        }),
        { 
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders 
          }, 
          status: 400 
        }
      );
    }

    if (!apiKey) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'OpenAI API key not configured' 
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders,
          },
        }
      );
    }

    console.log('Starting PDF rotation fix and analysis...');

    // --- Step 1: Save temp PDF ---
    const inputPath = `/tmp/input_${Date.now()}.pdf`;
    const fixedPath = `/tmp/fixed_${Date.now()}.pdf`;
    
    const inputBuffer = new Uint8Array(
      atob(base64_file)
        .split('')
        .map(char => char.charCodeAt(0))
    );
    
    await Deno.writeFile(inputPath, inputBuffer);
    console.log('Temporary PDF saved');

    // --- Step 2: Fix rotation ---
    const inputBytes = await Deno.readFile(inputPath);
    const pdfDoc = await PDFDocument.load(inputBytes);
    const pages = pdfDoc.getPages();

    let rotationFixed = false;
    pages.forEach((page, index) => {
      const rotation = page.getRotation().angle;
      if (rotation !== 0) {
        console.log(`Fixing rotation on page ${index + 1}: ${rotation}° -> 0°`);
        page.setRotation({ angle: 0 });
        rotationFixed = true;
      }
    });

    if (rotationFixed) {
      console.log('PDF rotation fixed');
    } else {
      console.log('No rotation fixes needed');
    }

    const fixedBytes = await pdfDoc.save();
    await Deno.writeFile(fixedPath, fixedBytes);

    // --- Step 3: Convert back to base64 ---
    const fixedBuffer = await Deno.readFile(fixedPath);
    const fixedBase64 = btoa(String.fromCharCode(...fixedBuffer));
    console.log('PDF converted back to base64');

    // --- Step 4: Send to OpenAI Chat Completions API ---
    console.log('Sending to OpenAI for analysis...');
    
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              { 
                type: 'text', 
                text: prompt_to_send 
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:application/pdf;base64,${fixedBase64}`,
                  detail: 'high'
                }
              }
            ]
          }
        ],
        max_tokens: 4000
      })
    });

    if (!openaiResponse.ok) {
      const errorData = await openaiResponse.text();
      console.error("OpenAI API Error:", errorData);
      throw new Error(`OpenAI API failed: ${openaiResponse.status} ${errorData}`);
    }

    const result = await openaiResponse.json();
    console.log('OpenAI analysis completed');

    // --- Step 5: Clean up ---
    try {
      await Deno.remove(inputPath);
      await Deno.remove(fixedPath);
      console.log('Temporary files cleaned up');
    } catch (cleanupError) {
      console.log('Failed to cleanup temporary files:', cleanupError);
    }

    // --- Step 6: Extract response content ---
    const analysisResult = result.choices?.[0]?.message?.content || result;
    
    // Try to parse as JSON if it looks like JSON
    let parsedResult = analysisResult;
    if (typeof analysisResult === 'string' && analysisResult.trim().startsWith('{')) {
      try {
        parsedResult = JSON.parse(analysisResult);
      } catch (parseError) {
        console.log('Response is not valid JSON, returning as text');
      }
    }

    // --- Step 7: Return structured response ---
    return new Response(
      JSON.stringify({
        success: true,
        rotation_fixed: rotationFixed,
        file_id_analyzed: result.id || null,
        result: parsedResult,
      }),
      { 
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders 
        } 
      }
    );

  } catch (error) {
    console.error('Function error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Internal server error' 
      }),
      { 
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders 
        }, 
        status: 500 
      }
    );
  }
});