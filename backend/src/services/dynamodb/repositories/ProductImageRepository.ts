/**
 * ProductImageRepository - DynamoDB implementation for Product Image CRUD operations
 * 
 * DynamoDB Structure:
 * PK: "PRODUCT#${product_id}"
 * SK: "IMAGE#${position}"
 * entity_type: "ProductImage"
 * 
 * Cost Optimizations:
 * - Store images as children of products (single query retrieval)
 * - Batch create for multiple images
 * - No GSI needed (query by PK only)
 * 
 * CDN URL Handling:
 * - Store relative paths (S3 keys) in DynamoDB
 * - Convert to CDN URLs when retrieving
 */

import { DynamoDBOptimized } from '../DynamoDBOptimized';
import { UpdateCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import {
  ProductImage,
  CreateProductImageData,
  UpdateProductImageData,
} from './types';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../../../config';

export class ProductImageRepository {
  private dynamoDB: DynamoDBOptimized;
  private tableName: string;
  private cdnUrl: string;
  
  constructor(dynamoDB: DynamoDBOptimized) {
    this.dynamoDB = dynamoDB;
    this.tableName = (dynamoDB as any).tableName || process.env.DYNAMODB_TABLE_NAME || 'products';
    this.cdnUrl = config.s3.cdnUrl || '';
  }

  /**
   * Convert S3 URL to CDN URL
   * Handles both full S3 URLs and relative keys
   */
  private convertToCdnUrl(urlOrKey: string): string {
    // Handle undefined/null
    if (!urlOrKey) {
      return urlOrKey;
    }

    if (!this.cdnUrl) {
      // If no CDN URL configured, return as-is
      return urlOrKey;
    }

    // If it's already a full URL (starts with http), extract the key
    if (urlOrKey.startsWith('http://') || urlOrKey.startsWith('https://')) {
      // Extract key from S3 URL
      const urlMatch = urlOrKey.match(/\.com\/(.+)$/);
      if (urlMatch) {
        const key = urlMatch[1];
        const baseUrl = this.cdnUrl.endsWith('/') ? this.cdnUrl.slice(0, -1) : this.cdnUrl;
        return `${baseUrl}/${key}`;
      }
      // If we can't extract the key, return as-is
      return urlOrKey;
    }

    // It's a relative key, convert to CDN URL
    const baseUrl = this.cdnUrl.endsWith('/') ? this.cdnUrl.slice(0, -1) : this.cdnUrl;
    return `${baseUrl}/${urlOrKey}`;
  }

  /**
   * Extract S3 key from URL
   * Returns the key to store in DynamoDB
   */
  private extractS3Key(url: string): string {
    // If it's a full URL, extract the key
    if (url.startsWith('http://') || url.startsWith('https://')) {
      const urlMatch = url.match(/\.com\/(.+)$/);
      if (urlMatch) {
        return urlMatch[1];
      }
    }
    // Otherwise, assume it's already a key
    return url;
  }

  /**
   * Map DynamoDB item to ProductImage interface
   */
  mapToImage(item: Record<string, any>): ProductImage {
    return {
      id: item.id,
      product_id: item.product_id,
      url: this.convertToCdnUrl(item.url),
      alt_text: item.alt_text,
      position: item.position,
      created_at: item.created_at,
      updated_at: item.updated_at,
    };
  }

  /**
   * Build DynamoDB item from ProductImage
   */
  buildImageItem(image: ProductImage): Record<string, any> {
    const item: Record<string, any> = {
      PK: `PRODUCT#${image.product_id}`,
      SK: `IMAGE#${String(image.position).padStart(10, '0')}`,
      entity_type: 'ProductImage',
      id: image.id,
      product_id: image.product_id,
      url: this.extractS3Key(image.url),
      position: image.position,
      created_at: image.created_at,
      updated_at: image.updated_at,
    };

    // Add optional fields
    if (image.alt_text !== undefined) item.alt_text = image.alt_text;

    return item;
  }

  /**
   * Create a new product image
   */
  async create(data: CreateProductImageData): Promise<ProductImage> {
    const now = new Date().toISOString();
    const id = uuidv4();

    // Get current max position if position not provided
    let position = data.position ?? 0;
    if (data.position === undefined) {
      const existingImages = await this.findByProductId(data.product_id);
      position = existingImages.length > 0 
        ? Math.max(...existingImages.map(img => img.position)) + 1 
        : 0;
    }

    const image: ProductImage = {
      id,
      product_id: data.product_id,
      url: this.extractS3Key(data.url),
      alt_text: data.alt_text,
      position,
      created_at: now,
      updated_at: now,
    };

    const item = this.buildImageItem(image);

    await this.dynamoDB.put({
      item,
      conditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
    });

    // Return with CDN URL
    return this.mapToImage(image);
  }

  /**
   * Find all images for a product (sorted by position)
   * Uses eventually consistent reads for cost optimization
   */
  async findByProductId(productId: number): Promise<ProductImage[]> {
    const result = await this.dynamoDB.queryEventuallyConsistent({
      keyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      expressionAttributeValues: {
        ':pk': `PRODUCT#${productId}`,
        ':sk': 'IMAGE#',
      },
    });

    // Sort by position (should already be sorted by SK, but ensure it)
    const images = result.data
      .map(item => this.mapToImage(item))
      .sort((a, b) => a.position - b.position);

    return images;
  }

  /**
   * Find image by ID and product ID
   */
  async findByIdAndProductId(id: string, productId: number): Promise<ProductImage | null> {
    // We need to query by product ID and filter by image ID
    const result = await this.dynamoDB.queryEventuallyConsistent({
      keyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      filterExpression: 'id = :id',
      expressionAttributeValues: {
        ':pk': `PRODUCT#${productId}`,
        ':sk': 'IMAGE#',
        ':id': id,
      },
    });

    if (result.data.length === 0) {
      return null;
    }

    return this.mapToImage(result.data[0]);
  }

  /**
   * Update image
   */
  async update(id: string, productId: number, data: UpdateProductImageData): Promise<ProductImage | null> {
    // First, find the current image to get its position
    const current = await this.findByIdAndProductId(id, productId);
    if (!current) {
      return null;
    }

    const now = new Date().toISOString();
    const updates: Record<string, any> = {
      updated_at: now,
    };

    // Build updates object with only provided fields
    if (data.url !== undefined) updates.url = this.extractS3Key(data.url);
    if (data.alt_text !== undefined) updates.alt_text = data.alt_text;
    
    // Position changes require re-keying (delete + create)
    if (data.position !== undefined && data.position !== current.position) {
      // Need to delete old item and create new one with new position
      const oldSK = `IMAGE#${String(current.position).padStart(10, '0')}`;
      const newSK = `IMAGE#${String(data.position).padStart(10, '0')}`;

      // Delete old item
      await this.dynamoDB.delete({
        key: {
          PK: `PRODUCT#${productId}`,
          SK: oldSK,
        },
      });

      // Create new item with new position
      const updatedImage: ProductImage = {
        ...current,
        url: data.url !== undefined ? this.extractS3Key(data.url) : this.extractS3Key(current.url),
        alt_text: data.alt_text !== undefined ? data.alt_text : current.alt_text,
        position: data.position,
        updated_at: now,
      };

      const item = this.buildImageItem(updatedImage);
      await this.dynamoDB.put({
        item,
      });

      return this.mapToImage(updatedImage);
    }

    // No position change, normal update
    try {
      const result = await this.dynamoDB.update({
        key: {
          PK: `PRODUCT#${productId}`,
          SK: `IMAGE#${String(current.position).padStart(10, '0')}`,
        },
        updates,
        conditionExpression: 'attribute_exists(PK)',
        returnValues: 'ALL_NEW',
      });

      if (!result.data) {
        return null;
      }

      return this.mapToImage(result.data);
    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException' || error.code === 'ConditionalCheckFailedException') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Hard delete image
   */
  async delete(id: string, productId: number): Promise<void> {
    // First, find the image to get its position
    const image = await this.findByIdAndProductId(id, productId);
    if (!image) {
      return;
    }

    await this.dynamoDB.delete({
      key: {
        PK: `PRODUCT#${productId}`,
        SK: `IMAGE#${String(image.position).padStart(10, '0')}`,
      },
    });
  }

  /**
   * Batch create images (up to 25 items)
   */
  async batchCreate(images: CreateProductImageData[]): Promise<ProductImage[]> {
    if (images.length === 0) {
      return [];
    }

    if (images.length > 25) {
      throw new Error('Batch create supports up to 25 images at a time');
    }

    // Validate all images are for the same product
    const productId = images[0].product_id;
    if (!images.every(img => img.product_id === productId)) {
      throw new Error('All images in batch must belong to the same product');
    }

    const now = new Date().toISOString();
    const createdImages: ProductImage[] = [];

    // Get current max position
    const existingImages = await this.findByProductId(productId);
    let nextPosition = existingImages.length > 0 
      ? Math.max(...existingImages.map(img => img.position)) + 1 
      : 0;

    // Build image items
    const items = images.map(data => {
      const id = uuidv4();
      const position = data.position ?? nextPosition++;
      
      const image: ProductImage = {
        id,
        product_id: data.product_id,
        url: this.extractS3Key(data.url),
        alt_text: data.alt_text,
        position,
        created_at: now,
        updated_at: now,
      };
      
      createdImages.push({
        ...image,
        url: this.convertToCdnUrl(image.url),
      });
      
      return this.buildImageItem(image);
    });

    // Use batch write
    await this.dynamoDB.batchWriteOptimized({
      items: items.map(item => ({ type: 'put' as const, item })),
    });

    return createdImages;
  }

  /**
   * Reorder images atomically
   * Updates all positions in a single transaction
   */
  async reorder(productId: number, imageIds: string[]): Promise<ProductImage[]> {
    if (imageIds.length === 0) {
      return [];
    }

    if (imageIds.length > 25) {
      throw new Error('Reorder supports up to 25 images at a time');
    }

    // Get current images
    const currentImages = await this.findByProductId(productId);
    
    // Validate all image IDs exist
    const currentImageMap = new Map(currentImages.map(img => [img.id, img]));
    for (const id of imageIds) {
      if (!currentImageMap.has(id)) {
        throw new Error(`Image ${id} not found for product ${productId}`);
      }
    }

    // Build transaction items
    const now = new Date().toISOString();
    const transactItems = imageIds.map((imageId, newPosition) => {
      const currentImage = currentImageMap.get(imageId)!;
      const oldSK = `IMAGE#${String(currentImage.position).padStart(10, '0')}`;
      const newSK = `IMAGE#${String(newPosition).padStart(10, '0')}`;

      // If position hasn't changed, skip
      if (currentImage.position === newPosition) {
        return null;
      }

      return {
        // Delete old item
        Delete: {
          TableName: this.tableName,
          Key: {
            PK: `PRODUCT#${productId}`,
            SK: oldSK,
          },
        },
        // Put new item with new position
        Put: {
          TableName: this.tableName,
          Item: this.buildImageItem({
            ...currentImage,
            url: this.extractS3Key(currentImage.url),
            position: newPosition,
            updated_at: now,
          }),
        },
      };
    }).filter(item => item !== null);

    // If no changes needed, return current images
    if (transactItems.length === 0) {
      return currentImages;
    }

    // Execute transaction
    const transactWrites = transactItems.flatMap(item => [
      { Delete: item!.Delete },
      { Put: item!.Put },
    ]);

    const command = new TransactWriteCommand({
      TransactItems: transactWrites,
    });

    const client = (this.dynamoDB as any).client;
    await client.send(command);

    // Return reordered images with CDN URLs
    return imageIds.map((imageId, position) => {
      const image = currentImageMap.get(imageId)!;
      return this.mapToImage({
        ...image,
        url: this.extractS3Key(image.url),
        position,
        updated_at: now,
      });
    });
  }
}
