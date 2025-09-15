# PDF Splitter API Documentation

## Base URL
```
https://hikmamuneer-file-spl-bawl.bolt.host
```

## Endpoints

### 1. Split PDF

**Endpoint:** `POST /api/split-pdf`

**Description:** Splits a PDF file into multiple documents based on specified page ranges or individual pages.

**Content-Type:** `multipart/form-data`

#### Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pdf` | File | Yes | PDF file to be split (max 50MB) |
| `instructions` | String | Yes | Page splitting instructions |

#### Instructions Format

The `instructions` parameter accepts the following formats:

- **Page ranges:** `1-3, 5-7, 10-15`
- **Individual pages:** `1, 3, 5, 8`
- **Mixed format:** `2-4, 7, 9-12`

#### Example Request (cURL)

```bash
curl -X POST https://hikmamuneer-file-spl-bawl.bolt.host/api/split-pdf \
  -F "pdf=@/path/to/your/document.pdf" \
  -F "instructions=1-3, 5-7, 10"
```

#### Example Request (JavaScript/Fetch)

```javascript
const formData = new FormData();
formData.append('pdf', pdfFile); // File object
formData.append('instructions', '1-3, 5-7, 10');

const response = await fetch('https://hikmamuneer-file-spl-bawl.bolt.host/api/split-pdf', {
  method: 'POST',
  body: formData
});

if (response.ok) {
  // Response is a ZIP file
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  
  // Create download link
  const a = document.createElement('a');
  a.href = url;
  a.download = 'split-files.zip';
  a.click();
} else {
  const error = await response.json();
  console.error('Error:', error.message);
}
```

#### Example Request (Python)

```python
import requests

url = 'https://hikmamuneer-file-spl-bawl.bolt.host/api/split-pdf'

with open('document.pdf', 'rb') as pdf_file:
    files = {'pdf': pdf_file}
    data = {'instructions': '1-3, 5-7, 10'}
    
    response = requests.post(url, files=files, data=data)
    
    if response.status_code == 200:
        # Save the ZIP file
        with open('split-files.zip', 'wb') as zip_file:
            zip_file.write(response.content)
        print('PDF split successfully!')
    else:
        error = response.json()
        print(f'Error: {error["message"]}')
```

#### Success Response

**Status Code:** `200 OK`

**Content-Type:** `application/zip`

**Response:** Binary ZIP file containing the split PDF documents

**Headers:**
```
Content-Type: application/zip
Content-Disposition: attachment; filename="document-split.zip"
```

#### Error Responses

**Status Code:** `400 Bad Request`

```json
{
  "message": "No PDF file uploaded"
}
```

```json
{
  "message": "File must be a PDF"
}
```

```json
{
  "message": "Invalid instructions",
  "errors": [
    {
      "code": "too_small",
      "minimum": 1,
      "type": "string",
      "inclusive": true,
      "exact": false,
      "message": "Instructions are required",
      "path": ["instructions"]
    }
  ]
}
```

```json
{
  "message": "Invalid range: 5-3"
}
```

```json
{
  "message": "Page 25 does not exist. PDF has 20 pages."
}
```

**Status Code:** `500 Internal Server Error`

```json
{
  "message": "Failed to process PDF"
}
```

### 2. Get Job Status (Optional - for tracking)

**Endpoint:** `GET /api/job/{jobId}`

**Description:** Retrieves the status of a PDF splitting job.

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `jobId` | String | Yes | Unique job identifier |

#### Example Request

```bash
curl -X GET https://hikmamuneer-file-spl-bawl.bolt.host/api/job/123e4567-e89b-12d3-a456-426614174000
```

#### Success Response

**Status Code:** `200 OK`

```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "originalFilename": "document.pdf",
  "instructions": "1-3, 5-7, 10",
  "status": "completed",
  "resultFiles": [
    "document-pages-1-3.pdf",
    "document-pages-5-7.pdf",
    "document-page-10.pdf"
  ],
  "errorMessage": null,
  "createdAt": "2024-01-15T10:30:00.000Z"
}
```

#### Error Response

**Status Code:** `404 Not Found`

```json
{
  "message": "Job not found"
}
```

## File Naming Convention

The split PDF files follow this naming pattern:

- **Single page:** `{original-filename}-page-{page-number}.pdf`
  - Example: `document-page-5.pdf`

- **Page range:** `{original-filename}-pages-{start}-{end}.pdf`
  - Example: `document-pages-1-3.pdf`

## Limitations

- Maximum file size: 50MB
- Supported format: PDF only
- Page numbers must be positive integers
- Page ranges must be valid (start ≤ end)
- All specified pages must exist in the source PDF

## Error Handling

The API returns appropriate HTTP status codes and JSON error messages:

- `400` - Bad request (invalid input, missing parameters)
- `404` - Resource not found
- `500` - Internal server error

Always check the response status code and handle errors appropriately in your application.

## Rate Limiting

Currently, there are no explicit rate limits, but please use the service responsibly to ensure availability for all users.

## Support

For issues or questions about the API, please refer to the application's documentation or contact support.