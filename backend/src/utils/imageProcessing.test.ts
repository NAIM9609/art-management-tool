/**
 * Unit tests for Image Processing Utilities
 */

import {
  validateImageType,
  generateUniqueFileName,
  getImageDimensions,
  optimizeImage,
  getAllowedImageTypes,
} from './imageProcessing';
import sharp from 'sharp';

describe('Image Processing Utilities', () => {
  describe('validateImageType', () => {
    it('should validate allowed image types', () => {
      expect(validateImageType('image/jpeg')).toBe(true);
      expect(validateImageType('image/jpg')).toBe(true);
      expect(validateImageType('image/png')).toBe(true);
      expect(validateImageType('image/webp')).toBe(true);
      expect(validateImageType('image/avif')).toBe(true);
    });

    it('should reject non-allowed image types', () => {
      expect(validateImageType('image/gif')).toBe(false);
      expect(validateImageType('image/svg+xml')).toBe(false);
      expect(validateImageType('image/bmp')).toBe(false);
      expect(validateImageType('application/pdf')).toBe(false);
      expect(validateImageType('text/plain')).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(validateImageType('IMAGE/JPEG')).toBe(true);
      expect(validateImageType('Image/Png')).toBe(true);
    });
  });

  describe('generateUniqueFileName', () => {
    it('should generate unique file names', () => {
      const fileName1 = generateUniqueFileName('test.jpg');
      const fileName2 = generateUniqueFileName('test.jpg');
      
      expect(fileName1).not.toBe(fileName2);
      expect(fileName1).toMatch(/\.jpg$/);
      expect(fileName2).toMatch(/\.jpg$/);
    });

    it('should preserve file extension', () => {
      const jpegFile = generateUniqueFileName('image.jpeg');
      const pngFile = generateUniqueFileName('photo.png');
      const webpFile = generateUniqueFileName('graphic.webp');
      
      expect(jpegFile).toMatch(/\.jpeg$/);
      expect(pngFile).toMatch(/\.png$/);
      expect(webpFile).toMatch(/\.webp$/);
    });

    it('should handle uppercase extensions', () => {
      const file = generateUniqueFileName('test.JPG');
      expect(file).toMatch(/\.jpg$/);
    });

    it('should handle files with no extension', () => {
      const file = generateUniqueFileName('test');
      expect(file).not.toMatch(/\./);
    });
  });

  describe('getImageDimensions', () => {
    it('should extract dimensions from a valid image', async () => {
      // Create a test image: 100x50 PNG
      const buffer = await sharp({
        create: {
          width: 100,
          height: 50,
          channels: 4,
          background: { r: 255, g: 0, b: 0, alpha: 1 },
        },
      })
        .png()
        .toBuffer();

      const dimensions = await getImageDimensions(buffer);
      
      expect(dimensions.width).toBe(100);
      expect(dimensions.height).toBe(50);
    });

    it('should throw error for invalid image buffer', async () => {
      const invalidBuffer = Buffer.from('not an image');
      
      await expect(getImageDimensions(invalidBuffer)).rejects.toThrow('Failed to get image dimensions');
    });
  });

  describe('optimizeImage', () => {
    it('should return original buffer if size <= 500KB', async () => {
      // Create small image (< 500KB)
      const smallBuffer = await sharp({
        create: {
          width: 100,
          height: 100,
          channels: 4,
          background: { r: 255, g: 0, b: 0, alpha: 1 },
        },
      })
        .png()
        .toBuffer();

      const result = await optimizeImage(smallBuffer, 'image/png');
      
      expect(result).toBe(smallBuffer);
    });

    it('should attempt to optimize images larger than 500KB', async () => {
      // Create a mock large buffer - doesn't need to be a valid image for this test
      // as we're testing the size threshold logic
      const largeBuffer = Buffer.alloc(600 * 1024); // 600KB buffer
      
      const result = await optimizeImage(largeBuffer, 'image/jpeg');
      
      // Since it's not a valid image, optimization will fail and return original
      expect(result).toBe(largeBuffer);
    });

    it('should handle all supported formats', async () => {
      const smallBuffer = await sharp({
        create: {
          width: 50,
          height: 50,
          channels: 4,
          background: { r: 255, g: 0, b: 0, alpha: 1 },
        },
      })
        .jpeg()
        .toBuffer();

      // Test all supported formats
      const formats = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/avif'];
      
      for (const format of formats) {
        const result = await optimizeImage(smallBuffer, format);
        expect(result).toBeDefined();
        expect(Buffer.isBuffer(result)).toBe(true);
      }
    });

    it('should return original buffer for unsupported format', async () => {
      const buffer = Buffer.from('test');
      const result = await optimizeImage(buffer, 'image/unknown');
      expect(result).toBe(buffer);
    });

    it('should return original buffer on optimization error', async () => {
      const invalidBuffer = Buffer.from('not an image');
      
      const result = await optimizeImage(invalidBuffer, 'image/jpeg');
      
      expect(result).toBe(invalidBuffer);
    });
  });

  describe('getAllowedImageTypes', () => {
    it('should return array of allowed image types', () => {
      const types = getAllowedImageTypes();
      
      expect(Array.isArray(types)).toBe(true);
      expect(types).toContain('image/jpeg');
      expect(types).toContain('image/jpg');
      expect(types).toContain('image/png');
      expect(types).toContain('image/webp');
      expect(types).toContain('image/avif');
      expect(types.length).toBe(5);
    });

    it('should return a new array each time (not mutate original)', () => {
      const types1 = getAllowedImageTypes();
      const types2 = getAllowedImageTypes();
      
      expect(types1).not.toBe(types2);
      expect(types1).toEqual(types2);
    });
  });
});
