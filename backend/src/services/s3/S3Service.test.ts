/**
 * Unit tests for S3Service
 */

import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { S3Service } from './S3Service';
import sharp from 'sharp';

// Mock getSignedUrl
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

// Mock S3 Client
const s3Mock = mockClient(S3Client);

describe('S3Service', () => {
  let s3Service: S3Service;

  beforeEach(() => {
    s3Mock.reset();
    jest.clearAllMocks();
    
    // Initialize service with test configuration
    s3Service = new S3Service('test-bucket', 'us-east-1', 'https://cdn.example.com');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with provided configuration', () => {
      expect(s3Service).toBeDefined();
    });

    it('should throw error if bucket name is not provided', () => {
      expect(() => new S3Service('', 'us-east-1', '')).toThrow('S3_BUCKET_NAME is required');
    });

    it('should throw error if region is not provided', () => {
      expect(() => new S3Service('test-bucket', '', '')).toThrow('S3_REGION is required');
    });
  });

  describe('generatePresignedUploadUrl', () => {
    beforeEach(() => {
      (getSignedUrl as jest.Mock).mockResolvedValue('https://s3.amazonaws.com/presigned-url');
    });

    it('should generate presigned URL for valid image type', async () => {
      const result = await s3Service.generatePresignedUploadUrl('test.jpg', 'image/jpeg', 'uploads');

      expect(result.uploadUrl).toBe('https://s3.amazonaws.com/presigned-url');
      expect(result.key).toMatch(/^uploads\//);
      expect(result.key).toMatch(/\.jpg$/);
      expect(result.cdnUrl).toMatch(/^https:\/\/cdn\.example\.com\/uploads\//);
      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.any(S3Client),
        expect.any(PutObjectCommand),
        { expiresIn: 300 }
      );
    });

    it('should generate presigned URL without folder', async () => {
      const result = await s3Service.generatePresignedUploadUrl('test.png', 'image/png');

      expect(result.key).not.toContain('/');
      expect(result.key).toMatch(/\.png$/);
    });

    it('should reject invalid content type', async () => {
      await expect(
        s3Service.generatePresignedUploadUrl('test.pdf', 'application/pdf', 'uploads')
      ).rejects.toThrow('Invalid content type');
    });

    it('should accept all allowed image types', async () => {
      const imageTypes = [
        { fileName: 'test.jpg', contentType: 'image/jpeg' },
        { fileName: 'test.jpg', contentType: 'image/jpg' },
        { fileName: 'test.png', contentType: 'image/png' },
        { fileName: 'test.webp', contentType: 'image/webp' },
        { fileName: 'test.avif', contentType: 'image/avif' },
      ];

      for (const { fileName, contentType } of imageTypes) {
        const result = await s3Service.generatePresignedUploadUrl(fileName, contentType);
        expect(result.uploadUrl).toBeDefined();
        expect(result.cdnUrl).toBeDefined();
        expect(result.key).toBeDefined();
      }
    });

    it('should set cache-control headers in S3 command', async () => {
      await s3Service.generatePresignedUploadUrl('test.jpg', 'image/jpeg', 'uploads');

      const mockCall = (getSignedUrl as jest.Mock).mock.calls[0];
      const command = mockCall[1] as PutObjectCommand;
      
      expect(command.input.CacheControl).toBe('public, max-age=31536000, immutable');
    });
  });

  describe('uploadImage', () => {
    let testImageBuffer: Buffer;

    beforeEach(async () => {
      // Create a small test image
      testImageBuffer = await sharp({
        create: {
          width: 100,
          height: 100,
          channels: 4,
          background: { r: 255, g: 0, b: 0, alpha: 1 },
        },
      })
        .jpeg()
        .toBuffer();

      s3Mock.on(PutObjectCommand).resolves({});
    });

    it('should upload image successfully', async () => {
      const result = await s3Service.uploadImage(
        testImageBuffer,
        'uploads',
        'test.jpg',
        'image/jpeg'
      );

      expect(result.key).toMatch(/^uploads\//);
      expect(result.key).toMatch(/\.jpg$/);
      expect(result.cdnUrl).toMatch(/^https:\/\/cdn\.example\.com\/uploads\//);
      expect(s3Mock.calls()).toHaveLength(1);
    });

    it('should reject invalid content type', async () => {
      await expect(
        s3Service.uploadImage(testImageBuffer, 'uploads', 'test.gif', 'image/gif')
      ).rejects.toThrow('Invalid content type');
    });

    it('should set cache-control headers', async () => {
      await s3Service.uploadImage(testImageBuffer, 'uploads', 'test.jpg', 'image/jpeg');

      const putObjectCall = s3Mock.call(0);
      const input = putObjectCall.args[0].input as any;
      expect(input.CacheControl).toBe('public, max-age=31536000, immutable');
    });

    it('should handle S3 upload errors', async () => {
      s3Mock.on(PutObjectCommand).rejects(new Error('S3 Error'));

      await expect(
        s3Service.uploadImage(testImageBuffer, 'uploads', 'test.jpg', 'image/jpeg')
      ).rejects.toThrow('Failed to upload image');
    });

    it('should validate and optimize images before upload', async () => {
      // Create a valid test image
      const testBuffer = await sharp({
        create: {
          width: 200,
          height: 200,
          channels: 4,
          background: { r: 128, g: 128, b: 128, alpha: 1 },
        },
      })
        .jpeg()
        .toBuffer();

      await s3Service.uploadImage(testBuffer, 'uploads', 'test.jpg', 'image/jpeg');

      const putObjectCall = s3Mock.call(0);
      const input = putObjectCall.args[0].input as any;
      const uploadedBuffer = input.Body as Buffer;
      
      // Should upload a valid buffer
      expect(uploadedBuffer).toBeDefined();
      expect(Buffer.isBuffer(uploadedBuffer)).toBe(true);
      expect(uploadedBuffer.length).toBeGreaterThan(0);
    });

    it('should reject invalid image buffers', async () => {
      const invalidBuffer = Buffer.from('not an image');

      await expect(
        s3Service.uploadImage(invalidBuffer, 'uploads', 'test.jpg', 'image/jpeg')
      ).rejects.toThrow('Invalid image data');
    });
  });

  describe('deleteImage', () => {
    it('should delete image successfully', async () => {
      s3Mock.on(DeleteObjectCommand).resolves({});

      await s3Service.deleteImage('uploads/test.jpg');

      expect(s3Mock.calls()).toHaveLength(1);
      const deleteCall = s3Mock.call(0);
      const input = deleteCall.args[0].input as any;
      expect(input.Key).toBe('uploads/test.jpg');
    });

    it('should handle delete errors', async () => {
      s3Mock.on(DeleteObjectCommand).rejects(new Error('Delete Error'));

      await expect(s3Service.deleteImage('uploads/test.jpg')).rejects.toThrow('Failed to delete image');
    });
  });

  describe('getImageUrl', () => {
    it('should return CDN URL when CDN is configured', () => {
      const url = s3Service.getImageUrl('uploads/test.jpg');
      expect(url).toBe('https://cdn.example.com/uploads/test.jpg');
    });

    it('should handle CDN URL with trailing slash', () => {
      const serviceWithTrailingSlash = new S3Service('test-bucket', 'us-east-1', 'https://cdn.example.com/');
      const url = serviceWithTrailingSlash.getImageUrl('uploads/test.jpg');
      expect(url).toBe('https://cdn.example.com/uploads/test.jpg');
    });

    it('should return S3 URL when CDN is not configured', () => {
      const serviceWithoutCDN = new S3Service('test-bucket', 'us-west-2', '');
      const url = serviceWithoutCDN.getImageUrl('uploads/test.jpg');
      expect(url).toBe('https://test-bucket.s3.us-west-2.amazonaws.com/uploads/test.jpg');
    });
  });

  describe('imageExists', () => {
    it('should return true if image exists', async () => {
      s3Mock.on(HeadObjectCommand).resolves({});

      const exists = await s3Service.imageExists('uploads/test.jpg');

      expect(exists).toBe(true);
      expect(s3Mock.calls()).toHaveLength(1);
    });

    it('should return false if image does not exist', async () => {
      const notFoundError: any = new Error('Not Found');
      notFoundError.name = 'NotFound';
      s3Mock.on(HeadObjectCommand).rejects(notFoundError);

      const exists = await s3Service.imageExists('uploads/nonexistent.jpg');

      expect(exists).toBe(false);
    });

    it('should return false for 404 status code', async () => {
      const notFoundError: any = new Error('Not Found');
      notFoundError.$metadata = { httpStatusCode: 404 };
      s3Mock.on(HeadObjectCommand).rejects(notFoundError);

      const exists = await s3Service.imageExists('uploads/nonexistent.jpg');

      expect(exists).toBe(false);
    });

    it('should throw error for other errors', async () => {
      s3Mock.on(HeadObjectCommand).rejects(new Error('Access Denied'));

      await expect(s3Service.imageExists('uploads/test.jpg')).rejects.toThrow('Failed to check image existence');
    });
  });

  describe('getClient', () => {
    it('should return S3Client instance', () => {
      const client = s3Service.getClient();
      expect(client).toBeInstanceOf(S3Client);
    });
  });
});
