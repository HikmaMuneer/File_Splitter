# PDF Invoice Analyzer Edge Function

This Supabase Edge Function converts PDF pages to individual page documents and analyzes them using OpenAI's vision API to extract structured invoice data.

## Features

- **PDF Page Processing**: Converts multi-page PDFs into individual page documents for better analysis
- **Document Type Detection**: Identifies if the document is an invoice, credit memo, or other document type
- **Multi-Invoice Support**: Can detect and extract multiple invoices from a single PDF
- **Vendor Name Extraction**: Extracts and normalizes vendor names with specific business rules
- **Invoice Number Cleaning**: Extracts and cleans invoice numbers according to specific patterns
- **Page Range Detection**: Identifies start and end pages for each invoice
- **High-Quality Analysis**: Processes up to 10 pages with high detail for accurate OCR

## Setup

1. **Environment Variables**: Set your OpenAI API key in Supabase:
   ```bash
   supabase secrets set OPENAI_API_KEY=your_openai_api_key_here
   ```

2. **Deploy the Function**:
   ```bash
   supabase functions deploy analyze-pdf-invoice
   ```

## Usage

### Request

```bash
curl -X POST 'https://your-project.supabase.co/functions/v1/analyze-pdf-invoice' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "base64": "JVBERi0xLjQKJcOkw7zDtsO..."
  }'
```

### JavaScript Example

```javascript
const { data, error } = await supabase.functions.invoke('analyze-pdf-invoice', {
  body: {
    base64: pdfBase64String
  }
});

if (error) {
  console.error('Error:', error);
} else {
  console.log('Analysis result:', data.result);
}
```

### Response Format

```json
{
  "success": true,
  "pages_processed": 4,
  "result": {
    "type": "invoice",
    "number_of_invoices": 2,
    "vendor_name": "VH Blackinton",
    "invoice_details": [
      {
        "invoice_number": "12345",
        "start_page": 1,
        "end_page": 2,
        "vendor_name": "VH Blackinton"
      },
      {
        "invoice_number": "12346",
        "start_page": 3,
        "end_page": 4,
        "vendor_name": "VH Blackinton"
      }
    ]
  }
}
```

## Processing Details

- **Page Limit**: Processes up to 10 pages per PDF to manage API costs and response times
- **Page Conversion**: Each PDF page is converted to a separate document for individual analysis
- **High Detail**: Uses OpenAI's "high" detail setting for better text recognition
- **Model**: Uses GPT-4o for superior vision capabilities

## Business Rules

### Invoice Number Extraction
- Only extracts numbers labeled as "INVOICE", "INVOICE NO", "Invoice#", or "Invoice Number"
- Ignores PO Numbers, Customer Numbers, Document Numbers, etc.
- Cleans numbers by removing prefixes and special characters
- For formats like "ABC-12345", extracts only "12345"

### Vendor Name Normalization
- Excludes "Read's Uniforms" (your company name)
- Normalizes common variations:
  - "V.H. Blackinton Co., Inc." → "VH Blackinton"
  - "Asti Manufacturing LLC" → "Asti Manufacturing"
- Returns "Unknown Vendor" if not found

### Document Type Detection
- Identifies invoices vs credit memos vs other documents
- Stops processing if document is not an invoice
- Returns appropriate error message for non-invoice documents

## Error Handling

The function handles various error scenarios:

- Missing base64 data (400)
- Missing OpenAI API key (500)
- OpenAI API failures (500)
- JSON parsing errors (returns raw result)
- General server errors (500)

## CORS Support

The function includes CORS headers to allow cross-origin requests from web applications.

## Integration with PDF Splitter

This function can be used in conjunction with your PDF splitter service to:

1. First analyze the PDF to identify invoice boundaries
2. Generate splitting instructions based on the analysis
3. Split the PDF using the existing `/api/split-pdf` endpoint
4. Name the resulting files using the extracted invoice numbers and vendor names

Example workflow:
```javascript
// 1. Analyze PDF
const analysis = await supabase.functions.invoke('analyze-pdf-invoice', {
  body: { base64: pdfBase64 }
});

console.log(`Processed ${analysis.data.pages_processed} pages`);

// 2. Generate split instructions
const instructions = analysis.data.result.invoice_details
  .map(invoice => `${invoice.start_page}-${invoice.end_page}`)
  .join(', ');

// 3. Split PDF using your existing API
const formData = new FormData();
formData.append('pdf', pdfFile);
formData.append('instructions', instructions);

const splitResponse = await fetch('/api/split-pdf', {
  method: 'POST',
  body: formData
});
```