/**
 * Image Processing Utilities
 * 
 * Utilities for image validation, processing, and optimization
 */

import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

// Allowed image MIME types
const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/avif',
];

// Maximum file size before optimization (500KB in bytes)
const MAX_SIZE_BEFORE_OPTIMIZATION = 500 * 1024;

/**
 * Validate if the content type is an allowed image type
 * @param contentType The MIME type to validate
 * @returns true if allowed, false otherwise
 */
export function validateImageType(contentType: string): boolean {
  return ALLOWED_IMAGE_TYPES.includes(contentType.toLowerCase());
}

/**
 * Generate a unique file name based on UUID
 * @param originalName The original file name
 * @returns A unique file name with the original extension
 */
export function generateUniqueFileName(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase();
  const uuid = uuidv4();
  return `${uuid}${ext}`;
}

/**
 * Get image dimensions from a buffer
 * @param buffer The image buffer
 * @returns Object containing width and height
 */
export async function getImageDimensions(buffer: Buffer): Promise<{ width: number; height: number }> {
  try {
    const metadata = await sharp(buffer).metadata();
    
    if (!metadata.width || !metadata.height) {
      throw new Error('Unable to extract image dimensions');
    }
    
    return {
      width: metadata.width,
      height: metadata.height,
    };
  } catch (error) {
    throw new Error(`Failed to get image dimensions: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Optimize image by compressing if size is greater than 500KB
 * @param buffer The image buffer
 * @param contentType The image MIME type
 * @returns Optimized buffer or original if already small enough
 */
export async function optimizeImage(
  buffer: Buffer,
  contentType: string
): Promise<Buffer> {
  try {
    // If image is already small enough, return as is
    if (buffer.length <= MAX_SIZE_BEFORE_OPTIMIZATION) {
      return buffer;
    }

    // Get image format from content type
    const format = contentType.split('/')[1] as keyof sharp.FormatEnum;
    
    let sharpInstance = sharp(buffer);

    // Apply optimization based on format
    switch (format) {
      case 'jpeg':
      case 'jpg':
        sharpInstance = sharpInstance.jpeg({ quality: 80, progressive: true });
        break;
      case 'png':
        sharpInstance = sharpInstance.png({ compressionLevel: 9, quality: 80 });
        break;
      case 'webp':
        sharpInstance = sharpInstance.webp({ quality: 80 });
        break;
      case 'avif':
        sharpInstance = sharpInstance.avif({ quality: 80 });
        break;
      default:
        // Unknown format, return original
        return buffer;
    }

    const optimizedBuffer = await sharpInstance.toBuffer();
    
    // Return optimized only if it's actually smaller
    return optimizedBuffer.length < buffer.length ? optimizedBuffer : buffer;
  } catch (error) {
    // If optimization fails, return original buffer
    console.error('Image optimization failed:', error);
    return buffer;
  }
}

/**
 * Get all allowed image content types
 * @returns Array of allowed MIME types
 */
export function getAllowedImageTypes(): string[] {
  return [...ALLOWED_IMAGE_TYPES];
}
