# PDF Invoice Analyzer Edge Function

This Supabase Edge Function converts PDF pages to individual page documents and analyzes them using OpenAI's vision API to extract structured invoice data.

## Features

- **OpenAI File Upload**: Uploads PDF to OpenAI's File API for proper processing
- **Document Type Detection**: Identifies if the document is an invoice, credit memo, or other document type
- **Multi-Invoice Support**: Can detect and extract multiple invoices from a single PDF
- **Vendor Name Extraction**: Extracts and normalizes vendor names with specific business rules
- **Invoice Number Cleaning**: Extracts and cleans invoice numbers according to specific patterns
- **Page Range Detection**: Identifies start and end pages for each invoice
- **High-Quality Analysis**: Uses OpenAI's native PDF processing with high detail for accurate OCR
- **Automatic Cleanup**: Removes uploaded files from OpenAI after processing

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
curl -X POST 'https://hikmamuneer-file-spl-bawl.bolt.host/functions/v1/analyze-pdf-invoice' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "fileId": "file-abc123def456..."
  }'
```

### JavaScript Example

```javascript
const { data, error } = await supabase.functions.invoke('analyze-pdf-invoice', {
  body: {
    fileId: 'file-abc123def456...'
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
  "file_id_analyzed": "file-abc123...",
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

- **File Reference**: Uses existing OpenAI file ID for analysis
- **No Upload Overhead**: Skips file upload step for faster processing
- **High Detail**: Uses OpenAI's "high" detail setting for better text recognition
- **Model**: Uses GPT-4o for superior vision capabilities
- **File Management**: Assumes file is already uploaded to OpenAI

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

- Missing fileId (400)
- Missing OpenAI API key (500)
- OpenAI API failures (500)
- JSON parsing errors (returns raw result)
- General server errors (500)

## CORS Support

The function includes CORS headers to allow cross-origin requests from web applications.

## Integration with PDF Splitter

This function works perfectly with your PDF splitter service:

1. First analyze the PDF to identify invoice boundaries
2. Generate splitting instructions based on the analysis
3. Split the PDF using the existing `/api/split-pdf` endpoint
4. Name the resulting files using the extracted invoice numbers and vendor names

Example workflow:
```javascript
// 1. Upload PDF to OpenAI first (separate step)
const uploadFormData = new FormData();
uploadFormData.append('file', pdfFile);
uploadFormData.append('purpose', 'vision');

const uploadResponse = await fetch('https://api.openai.com/v1/files', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${openaiApiKey}` },
  body: uploadFormData
});
const { id: fileId } = await uploadResponse.json();

// 2. Analyze PDF using file ID
const analysis = await supabase.functions.invoke('analyze-pdf-invoice', {
  body: { fileId }
});

console.log(`Analyzed file ID: ${analysis.data.file_id_analyzed}`);

// 3. Generate split instructions
const instructions = analysis.data.result.invoice_details
  .map(invoice => `${invoice.start_page}-${invoice.end_page}`)
  .join(', ');

// 4. Split PDF using your existing API
const formData = new FormData();
formData.append('pdf', pdfFile);
formData.append('instructions', instructions);

const splitResponse = await fetch('/api/split-pdf', {
  method: 'POST',
  body: formData
});
```