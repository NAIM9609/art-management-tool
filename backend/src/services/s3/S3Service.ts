/**
 * S3 Service for Image Management
 * 
 * Provides methods for managing images in S3 with CloudFront CDN support
 */

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommandInput,
  DeleteObjectCommandInput,
  HeadObjectCommandInput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../../config';
import {
  validateImageType,
  generateUniqueFileName,
  getImageDimensions,
  optimizeImage,
} from '../../utils/imageProcessing';

// Pre-signed URL expiration time (5 minutes)
const PRESIGNED_URL_EXPIRATION = 300; // seconds

export interface PresignedUploadUrlResponse {
  uploadUrl: string;
  cdnUrl: string;
  key: string;
}

export interface UploadImageResponse {
  cdnUrl: string;
  key: string;
}

export interface ImageDimensions {
  width: number;
  height: number;
}

export class S3Service {
  private s3Client: S3Client;
  private bucketName: string;
  private cdnUrl: string;
  private region: string;

  constructor(
    bucketName?: string,
    region?: string,
    cdnUrl?: string
  ) {
    this.bucketName = bucketName || config.s3.bucketName;
    this.cdnUrl = cdnUrl || config.s3.cdnUrl;
    this.region = region || config.s3.region;

    if (!this.bucketName) {
      throw new Error('S3_BUCKET_NAME is required');
    }

    this.s3Client = new S3Client({
      region: this.region,
    });
  }

  /**
   * Generate a pre-signed URL for direct upload to S3
   * @param fileName Original file name
   * @param contentType MIME type of the file
   * @param folder Optional folder path in S3
   * @returns Object with uploadUrl, cdnUrl, and key
   */
  async generatePresignedUploadUrl(
    fileName: string,
    contentType: string,
    folder?: string
  ): Promise<PresignedUploadUrlResponse> {
    // Validate content type
    if (!validateImageType(contentType)) {
      throw new Error(`Invalid content type: ${contentType}. Only image types are allowed (jpg, png, webp, avif)`);
    }

    // Generate unique file name
    const uniqueFileName = generateUniqueFileName(fileName);
    const key = folder ? `${folder}/${uniqueFileName}` : uniqueFileName;

    // Create PutObject command
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    });

    // Generate pre-signed URL
    const uploadUrl = await getSignedUrl(this.s3Client, command, {
      expiresIn: PRESIGNED_URL_EXPIRATION,
    });

    // Generate CDN URL
    const cdnUrl = this.getImageUrl(key);

    return {
      uploadUrl,
      cdnUrl,
      key,
    };
  }

  /**
   * Upload an image file directly to S3
   * @param file File buffer
   * @param folder Optional folder path in S3
   * @param fileName Original file name
   * @param contentType MIME type of the file
   * @returns Object with cdnUrl and key
   */
  async uploadImage(
    file: Buffer,
    folder: string,
    fileName: string,
    contentType: string
  ): Promise<UploadImageResponse> {
    // Validate content type
    if (!validateImageType(contentType)) {
      throw new Error(`Invalid content type: ${contentType}. Only image types are allowed (jpg, png, webp, avif)`);
    }

    // Optimize image if needed
    const optimizedBuffer = await optimizeImage(file, contentType);

    // Generate unique file name
    const uniqueFileName = generateUniqueFileName(fileName);
    const key = folder ? `${folder}/${uniqueFileName}` : uniqueFileName;

    // Upload to S3
    const params: PutObjectCommandInput = {
      Bucket: this.bucketName,
      Key: key,
      Body: optimizedBuffer,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    };

    try {
      await this.s3Client.send(new PutObjectCommand(params));
      
      // Generate CDN URL
      const cdnUrl = this.getImageUrl(key);

      return {
        cdnUrl,
        key,
      };
    } catch (error) {
      throw new Error(`Failed to upload image: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete an image from S3
   * @param key S3 object key
   */
  async deleteImage(key: string): Promise<void> {
    const params: DeleteObjectCommandInput = {
      Bucket: this.bucketName,
      Key: key,
    };

    try {
      await this.s3Client.send(new DeleteObjectCommand(params));
    } catch (error) {
      throw new Error(`Failed to delete image: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get the CDN URL for an image
   * @param key S3 object key
   * @returns CDN URL or S3 URL if CDN not configured
   */
  getImageUrl(key: string): string {
    if (this.cdnUrl) {
      // Remove trailing slash from CDN URL if present
      const baseUrl = this.cdnUrl.endsWith('/') ? this.cdnUrl.slice(0, -1) : this.cdnUrl;
      return `${baseUrl}/${key}`;
    }
    
    // Fallback to S3 URL if CDN not configured
    return `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${key}`;
  }

  /**
   * Check if an image exists in S3
   * @param key S3 object key
   * @returns true if exists, false otherwise
   */
  async imageExists(key: string): Promise<boolean> {
    const params: HeadObjectCommandInput = {
      Bucket: this.bucketName,
      Key: key,
    };

    try {
      await this.s3Client.send(new HeadObjectCommand(params));
      return true;
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw new Error(`Failed to check image existence: ${error.message}`);
    }
  }

  /**
   * Get the S3 client instance (for testing purposes)
   */
  getClient(): S3Client {
    return this.s3Client;
  }
}
