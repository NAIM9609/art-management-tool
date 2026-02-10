# S3 Service for Image Management

This service provides a complete solution for managing images in AWS S3 with CloudFront CDN support, including image validation, optimization, and pre-signed URL generation.

## Features

### S3 Operations
- ✅ Pre-signed URL generation for direct client uploads (5-minute expiration)
- ✅ Direct image upload with automatic optimization
- ✅ Image deletion
- ✅ CDN URL generation with CloudFront support
- ✅ Image existence checking

### Image Processing
- ✅ Image type validation (jpg, png, webp, avif only)
- ✅ UUID-based unique file naming
- ✅ Automatic image optimization for files > 500KB
- ✅ Image dimension extraction
- ✅ Cache-Control headers for optimal CDN performance

### Quality Assurance
- ✅ Comprehensive error handling
- ✅ Full unit test coverage (38 tests)
- ✅ TypeScript type safety
- ✅ Mocked S3Client for testing

## Installation

The required dependencies are already installed:
```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner sharp
```

## Configuration

Set the following environment variables:

```env
# Required
S3_BUCKET_NAME=your-bucket-name

# Optional (with defaults)
AWS_REGION=us-east-1
CDN_URL=https://your-cdn-domain.com
```

## Usage

### Basic Setup

```typescript
import { S3Service } from './services/s3';

const s3Service = new S3Service();
```

### Generate Pre-signed Upload URL

Generate a secure URL for client-side direct uploads:

```typescript
const { uploadUrl, cdnUrl, key } = await s3Service.generatePresignedUploadUrl(
  'photo.jpg',           // Original filename
  'image/jpeg',          // Content type
  'uploads/products'     // Optional folder path
);

// Client can upload directly to uploadUrl
// After upload, image will be available at cdnUrl
console.log('Upload to:', uploadUrl);
console.log('Image will be at:', cdnUrl);
console.log('S3 key:', key);
```

### Upload Image Directly

Upload from server-side with automatic optimization:

```typescript
import fs from 'fs';

const fileBuffer = fs.readFileSync('image.jpg');

const { cdnUrl, key } = await s3Service.uploadImage(
  fileBuffer,
  'uploads/products',
  'image.jpg',
  'image/jpeg'
);

console.log('Image uploaded to:', cdnUrl);
```

### Get Image URL

Convert S3 key to CDN URL:

```typescript
const cdnUrl = s3Service.getImageUrl('uploads/products/uuid-image.jpg');
// Returns: https://your-cdn-domain.com/uploads/products/uuid-image.jpg
```

### Delete Image

```typescript
await s3Service.deleteImage('uploads/products/uuid-image.jpg');
```

### Check Image Existence

```typescript
const exists = await s3Service.imageExists('uploads/products/uuid-image.jpg');
console.log('Image exists:', exists);
```

## Image Processing Utilities

### Validate Image Type

```typescript
import { validateImageType } from './utils/imageProcessing';

const isValid = validateImageType('image/jpeg'); // true
const isInvalid = validateImageType('image/gif'); // false
```

### Generate Unique Filename

```typescript
import { generateUniqueFileName } from './utils/imageProcessing';

const uniqueName = generateUniqueFileName('photo.jpg');
// Returns: e736dba4-b0af-413d-9f3b-72159eb6f2ea.jpg
```

### Get Image Dimensions

```typescript
import { getImageDimensions } from './utils/imageProcessing';

const buffer = fs.readFileSync('image.jpg');
const { width, height } = await getImageDimensions(buffer);
console.log(`Image size: ${width}x${height}`);
```

### Optimize Image

```typescript
import { optimizeImage } from './utils/imageProcessing';

const buffer = fs.readFileSync('large-image.jpg');
const optimized = await optimizeImage(buffer, 'image/jpeg');

// If buffer > 500KB, it will be compressed
// Otherwise, returns original buffer
console.log('Original size:', buffer.length);
console.log('Optimized size:', optimized.length);
```

## Allowed Image Types

Only the following image types are accepted:
- `image/jpeg`
- `image/jpg`
- `image/png`
- `image/webp`
- `image/avif`

## Cache Control

All uploaded images include cache headers:
```
Cache-Control: public, max-age=31536000, immutable
```

This ensures optimal CDN and browser caching (1 year TTL).

## Pre-signed URL Expiration

Pre-signed URLs expire after **5 minutes** (300 seconds) for security.

## Image Optimization

Images larger than **500KB** are automatically optimized:
- **JPEG/JPG**: Quality 80, progressive encoding
- **PNG**: Compression level 9, quality 80
- **WebP**: Quality 80
- **AVIF**: Quality 80

The optimization only applies the compressed version if it's actually smaller than the original.

## Error Handling

All S3 operations include comprehensive error handling:

```typescript
try {
  const result = await s3Service.uploadImage(buffer, 'uploads', 'image.jpg', 'image/jpeg');
  console.log('Success:', result.cdnUrl);
} catch (error) {
  console.error('Upload failed:', error.message);
  // Error messages include context:
  // - "Invalid content type: ..."
  // - "Failed to upload image: ..."
  // - "Failed to delete image: ..."
}
```

## Testing

Run the test suite:

```bash
npm test -- S3Service.test.ts
npm test -- imageProcessing.test.ts
```

All tests use mocked S3Client with `aws-sdk-client-mock`.

## Example: Integration with Express

```typescript
import express from 'express';
import multer from 'multer';
import { S3Service } from './services/s3';

const app = express();
const s3Service = new S3Service();
const upload = multer({ storage: multer.memoryStorage() });

// Generate pre-signed URL for client upload
app.post('/api/images/upload-url', async (req, res) => {
  try {
    const { filename, contentType } = req.body;
    
    const result = await s3Service.generatePresignedUploadUrl(
      filename,
      contentType,
      'uploads/products'
    );
    
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Direct server-side upload
app.post('/api/images/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const result = await s3Service.uploadImage(
      req.file.buffer,
      'uploads/products',
      req.file.originalname,
      req.file.mimetype
    );
    
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Delete image
app.delete('/api/images/:key(*)', async (req, res) => {
  try {
    await s3Service.deleteImage(req.params.key);
    res.json({ message: 'Image deleted successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
```

## Architecture

```
services/s3/
├── S3Service.ts          # Main S3 service class
├── S3Service.test.ts     # Unit tests (22 tests)
└── index.ts              # Exports

utils/
├── imageProcessing.ts      # Image utilities
└── imageProcessing.test.ts # Unit tests (16 tests)

config/
└── index.ts              # Configuration with S3 settings
```

## Security Considerations

1. **Pre-signed URLs** expire after 5 minutes
2. **Content type validation** prevents non-image uploads
3. **UUID-based naming** prevents filename collisions and enumeration
4. **Error messages** don't expose sensitive information
5. **S3 bucket** should have proper IAM policies and CORS configuration

## CDN Setup

When using CloudFront CDN:

1. Set `CDN_URL` environment variable
2. Configure CloudFront distribution with your S3 bucket as origin
3. The service automatically generates CDN URLs instead of S3 URLs
4. Cache-Control headers ensure proper CDN caching

Without CDN configuration, the service falls back to direct S3 URLs.
