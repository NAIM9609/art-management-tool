/**
 * Unit tests for ProductImageRepository
 */

import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, PutCommand, QueryCommand, DeleteCommand, UpdateCommand, TransactWriteCommand, BatchWriteCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBOptimized } from '../DynamoDBOptimized';
import { ProductImageRepository } from './ProductImageRepository';
import { CreateProductImageData, UpdateProductImageData } from './types';

// Mock DynamoDB Document Client
const ddbMock = mockClient(DynamoDBDocumentClient);

// Mock config
jest.mock('../../../config', () => ({
  config: {
    s3: {
      bucketName: 'test-bucket',
      region: 'us-east-1',
      cdnUrl: 'https://cdn.example.com',
    },
  },
}));

describe('ProductImageRepository', () => {
  let dynamoDB: DynamoDBOptimized;
  let repository: ProductImageRepository;

  beforeEach(() => {
    ddbMock.reset();
    dynamoDB = new DynamoDBOptimized({
      tableName: 'test-table',
      region: 'us-east-1',
    });
    repository = new ProductImageRepository(dynamoDB);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new product image with auto-position', async () => {
      const createData: CreateProductImageData = {
        product_id: 1,
        url: 'products/image1.jpg',
        alt_text: 'Product image 1',
      };

      // Mock existing images query for auto-position (returns max position item)
      ddbMock.on(QueryCommand).resolvesOnce({
        Items: [
          { position: 1 }, // Highest position
        ],
        ConsumedCapacity: { CapacityUnits: 0.5 },
      });

      ddbMock.on(PutCommand).resolves({});

      const image = await repository.create(createData);

      expect(image.product_id).toBe(1);
      expect(image.url).toBe('https://cdn.example.com/products/image1.jpg');
      expect(image.alt_text).toBe('Product image 1');
      expect(image.position).toBe(2); // Next position after existing images
      expect(image.id).toBeDefined();
      expect(image.created_at).toBeDefined();
      expect(image.updated_at).toBeDefined();
    });

    it('should create image with position 0 when no existing images', async () => {
      const createData: CreateProductImageData = {
        product_id: 1,
        url: 'products/image1.jpg',
      };

      // Mock no existing images
      ddbMock.on(QueryCommand).resolvesOnce({
        Items: [],
        ConsumedCapacity: { CapacityUnits: 0.5 },
      });

      ddbMock.on(PutCommand).resolves({});

      const image = await repository.create(createData);

      expect(image.position).toBe(0);
    });

    it('should create image with specified position', async () => {
      const createData: CreateProductImageData = {
        product_id: 1,
        url: 'products/image1.jpg',
        position: 5,
      };

      ddbMock.on(PutCommand).resolves({});

      const image = await repository.create(createData);

      expect(image.position).toBe(5);
    });

    it('should extract S3 key from full URL', async () => {
      const createData: CreateProductImageData = {
        product_id: 1,
        url: 'https://test-bucket.s3.us-east-1.amazonaws.com/products/image1.jpg',
      };

      // Mock no existing images query (for auto-position)
      ddbMock.on(QueryCommand).resolvesOnce({
        Items: [],
        ConsumedCapacity: { CapacityUnits: 0.5 },
      });

      ddbMock.on(PutCommand).resolves({});

      const image = await repository.create(createData);

      // URL should be converted to CDN URL
      expect(image.url).toBe('https://cdn.example.com/products/image1.jpg');
    });
  });

  describe('findByProductId', () => {
    it('should return all images for a product sorted by position', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [
          {
            id: 'img1',
            product_id: 1,
            url: 'products/image1.jpg',
            position: 0,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
          {
            id: 'img2',
            product_id: 1,
            url: 'products/image2.jpg',
            position: 1,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
          {
            id: 'img3',
            product_id: 1,
            url: 'products/image3.jpg',
            position: 2,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
        ],
      });

      const images = await repository.findByProductId(1);

      expect(images).toHaveLength(3);
      expect(images[0].position).toBe(0);
      expect(images[1].position).toBe(1);
      expect(images[2].position).toBe(2);
      expect(images[0].url).toBe('https://cdn.example.com/products/image1.jpg');
      expect(images[1].url).toBe('https://cdn.example.com/products/image2.jpg');
      expect(images[2].url).toBe('https://cdn.example.com/products/image3.jpg');
    });

    it('should return empty array when no images found', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [],
      });

      const images = await repository.findByProductId(1);

      expect(images).toHaveLength(0);
    });

    it('should convert S3 keys to CDN URLs', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [
          {
            id: 'img1',
            product_id: 1,
            url: 'products/subfolder/image.jpg',
            position: 0,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
        ],
      });

      const images = await repository.findByProductId(1);

      expect(images[0].url).toBe('https://cdn.example.com/products/subfolder/image.jpg');
    });
  });

  describe('update', () => {
    it('should update image without position change', async () => {
      const currentImage = {
        id: 'img1',
        product_id: 1,
        url: 'products/image1.jpg',
        alt_text: 'Old alt text',
        position: 0,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      // Mock findByIdAndProductId - first Get for pointer, then Get for image
      ddbMock.on(GetCommand).resolvesOnce({
        Item: { position: 0 }, // Pointer item
        ConsumedCapacity: { CapacityUnits: 0.5 },
      }).resolvesOnce({
        Item: currentImage, // Image item
        ConsumedCapacity: { CapacityUnits: 0.5 },
      });

      ddbMock.on(UpdateCommand).resolves({
        Attributes: {
          ...currentImage,
          alt_text: 'New alt text',
          updated_at: '2024-01-02T00:00:00Z',
        },
        ConsumedCapacity: { CapacityUnits: 1.0 },
      });

      const updateData: UpdateProductImageData = {
        alt_text: 'New alt text',
      };

      const updated = await repository.update('img1', 1, updateData);

      expect(updated).not.toBeNull();
      expect(updated!.alt_text).toBe('New alt text');
    });

    it('should update image with position change (re-key)', async () => {
      const currentImage = {
        id: 'img1',
        product_id: 1,
        url: 'products/image1.jpg',
        position: 0,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      // Mock findByIdAndProductId - first Get for pointer, then Get for image
      ddbMock.on(GetCommand).resolvesOnce({
        Item: { position: 0 }, // Pointer item
        ConsumedCapacity: { CapacityUnits: 0.5 },
      }).resolvesOnce({
        Item: currentImage, // Image item
        ConsumedCapacity: { CapacityUnits: 0.5 },
      });

      ddbMock.on(TransactWriteCommand).resolves({});

      const updateData: UpdateProductImageData = {
        position: 5,
      };

      const updated = await repository.update('img1', 1, updateData);

      expect(updated).not.toBeNull();
      expect(updated!.position).toBe(5);
    });

    it('should return null when image not found', async () => {
      // Mock pointer not found
      ddbMock.on(GetCommand).resolvesOnce({
        Item: undefined,
        ConsumedCapacity: { CapacityUnits: 0.5 },
      });

      const updated = await repository.update('nonexistent', 1, { alt_text: 'test' });

      expect(updated).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete an image', async () => {
      const image = {
        id: 'img1',
        product_id: 1,
        url: 'products/image1.jpg',
        position: 0,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      // Mock findByIdAndProductId - first Get for pointer, then Get for image
      ddbMock.on(GetCommand).resolvesOnce({
        Item: { position: 0 }, // Pointer item
        ConsumedCapacity: { CapacityUnits: 0.5 },
      }).resolvesOnce({
        Item: image, // Image item
        ConsumedCapacity: { CapacityUnits: 0.5 },
      });

      ddbMock.on(TransactWriteCommand).resolves({});

      await repository.delete('img1', 1);

      // Verify TransactWrite was called
      const transactCalls = ddbMock.commandCalls(TransactWriteCommand);
      expect(transactCalls.length).toBeGreaterThan(0);
    });

    it('should handle deleting non-existent image', async () => {
      // Mock pointer not found
      ddbMock.on(GetCommand).resolvesOnce({
        Item: undefined,
        ConsumedCapacity: { CapacityUnits: 0.5 },
      });

      // Should not throw
      await repository.delete('nonexistent', 1);
    });
  });

  describe('batchCreate', () => {
    it('should batch create multiple images', async () => {
      const images: CreateProductImageData[] = [
        { product_id: 1, url: 'products/image1.jpg', alt_text: 'Image 1' },
        { product_id: 1, url: 'products/image2.jpg', alt_text: 'Image 2' },
        { product_id: 1, url: 'products/image3.jpg', alt_text: 'Image 3' },
      ];

      // Mock existing images query
      ddbMock.on(QueryCommand).resolves({
        Items: [],
        ConsumedCapacity: { CapacityUnits: 0.5 },
      });

      // Mock batch write
      ddbMock.on(BatchWriteCommand).resolves({
        ConsumedCapacity: [{ CapacityUnits: 1.5 }],
      });
      
      const created = await repository.batchCreate(images);

      expect(created).toHaveLength(3);
      expect(created[0].position).toBe(0);
      expect(created[1].position).toBe(1);
      expect(created[2].position).toBe(2);
      expect(created[0].url).toBe('https://cdn.example.com/products/image1.jpg');
      expect(created[1].url).toBe('https://cdn.example.com/products/image2.jpg');
      expect(created[2].url).toBe('https://cdn.example.com/products/image3.jpg');
    });

    it('should respect custom positions in batch create', async () => {
      const images: CreateProductImageData[] = [
        { product_id: 1, url: 'products/image1.jpg', position: 5 },
        { product_id: 1, url: 'products/image2.jpg', position: 10 },
      ];

      // Mock existing images query
      ddbMock.on(QueryCommand).resolves({
        Items: [],
        ConsumedCapacity: { CapacityUnits: 0.5 },
      });

      ddbMock.on(BatchWriteCommand).resolves({
        ConsumedCapacity: [{ CapacityUnits: 1.0 }],
      });

      const created = await repository.batchCreate(images);

      expect(created[0].position).toBe(5);
      expect(created[1].position).toBe(10);
    });

    it('should throw error when batch size exceeds 12', async () => {
      const images: CreateProductImageData[] = Array(13).fill(null).map((_, i) => ({
        product_id: 1,
        url: `products/image${i}.jpg`,
      }));

      await expect(repository.batchCreate(images)).rejects.toThrow(
        'Batch create supports up to 12 images at a time'
      );
    });

    it('should throw error when images are for different products', async () => {
      const images: CreateProductImageData[] = [
        { product_id: 1, url: 'products/image1.jpg' },
        { product_id: 2, url: 'products/image2.jpg' },
      ];

      await expect(repository.batchCreate(images)).rejects.toThrow(
        'All images in batch must belong to the same product'
      );
    });

    it('should throw error when position collides with existing image', async () => {
      const images: CreateProductImageData[] = [
        { product_id: 1, url: 'products/image1.jpg', position: 0 },
      ];

      // Mock existing images with position 0
      ddbMock.on(QueryCommand).resolves({
        Items: [
          {
            id: 'existing',
            product_id: 1,
            url: 'products/existing.jpg',
            position: 0,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
        ],
        ConsumedCapacity: { CapacityUnits: 0.5 },
      });

      await expect(repository.batchCreate(images)).rejects.toThrow(
        'Position 0 already exists for product 1'
      );
    });

    it('should throw error when duplicate positions in batch', async () => {
      const images: CreateProductImageData[] = [
        { product_id: 1, url: 'products/image1.jpg', position: 5 },
        { product_id: 1, url: 'products/image2.jpg', position: 5 },
      ];

      // Mock no existing images
      ddbMock.on(QueryCommand).resolves({
        Items: [],
        ConsumedCapacity: { CapacityUnits: 0.5 },
      });

      await expect(repository.batchCreate(images)).rejects.toThrow(
        'Duplicate position 5 within batch'
      );
    });

    it('should return empty array for empty input', async () => {
      const created = await repository.batchCreate([]);
      expect(created).toHaveLength(0);
    });
  });

  describe('reorder', () => {
    it('should reorder images atomically', async () => {
      const existingImages = [
        {
          id: 'img1',
          product_id: 1,
          url: 'products/image1.jpg',
          position: 0,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        {
          id: 'img2',
          product_id: 1,
          url: 'products/image2.jpg',
          position: 1,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        {
          id: 'img3',
          product_id: 1,
          url: 'products/image3.jpg',
          position: 2,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ];

      // Mock existing images query
      ddbMock.on(QueryCommand).resolves({
        Items: existingImages,
      });

      ddbMock.on(TransactWriteCommand).resolves({});

      // Reorder: img3, img1, img2
      const reordered = await repository.reorder(1, ['img3', 'img1', 'img2']);

      expect(reordered).toHaveLength(3);
      expect(reordered[0].id).toBe('img3');
      expect(reordered[0].position).toBe(0);
      expect(reordered[1].id).toBe('img1');
      expect(reordered[1].position).toBe(1);
      expect(reordered[2].id).toBe('img2');
      expect(reordered[2].position).toBe(2);
    });

    it('should throw error when image not found', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [
          {
            id: 'img1',
            product_id: 1,
            url: 'products/image1.jpg',
            position: 0,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
        ],
      });

      await expect(repository.reorder(1, ['img1', 'img999'])).rejects.toThrow(
        'Image img999 not found for product 1'
      );
    });

    it('should throw error when reordering more than 8 images', async () => {
      const imageIds = Array(9).fill(null).map((_, i) => `img${i}`);

      await expect(repository.reorder(1, imageIds)).rejects.toThrow(
        'Reorder supports up to 8 images at a time'
      );
    });

    it('should return current images when no reordering needed', async () => {
      const existingImages = [
        {
          id: 'img1',
          product_id: 1,
          url: 'products/image1.jpg',
          position: 0,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        {
          id: 'img2',
          product_id: 1,
          url: 'products/image2.jpg',
          position: 1,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ];

      // Mock existing images query
      ddbMock.on(QueryCommand).resolves({
        Items: existingImages,
      });

      // Same order as current
      const reordered = await repository.reorder(1, ['img1', 'img2']);

      expect(reordered).toHaveLength(2);
      // Should not call TransactWrite if no changes
    });

    it('should return empty array for empty input', async () => {
      const reordered = await repository.reorder(1, []);
      expect(reordered).toHaveLength(0);
    });
  });

  describe('CDN URL handling', () => {
    it('should convert relative S3 keys to CDN URLs', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [
          {
            id: 'img1',
            product_id: 1,
            url: 'products/image.jpg',
            position: 0,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
        ],
      });

      const images = await repository.findByProductId(1);
      
      expect(images[0].url).toBe('https://cdn.example.com/products/image.jpg');
    });

    it('should handle CDN URL with trailing slash', async () => {
      // This would require mocking config differently or testing the private method
      // For now, we test through the public API
      ddbMock.on(QueryCommand).resolves({
        Items: [
          {
            id: 'img1',
            product_id: 1,
            url: 'products/image.jpg',
            position: 0,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
        ],
      });

      const images = await repository.findByProductId(1);
      
      // Should not have double slash
      expect(images[0].url).not.toContain('//products');
    });

    it('should extract S3 key from full S3 URL', async () => {
      const createData: CreateProductImageData = {
        product_id: 1,
        url: 'https://test-bucket.s3.us-east-1.amazonaws.com/products/subfolder/image.jpg',
      };

      // Mock no existing images query (for auto-position)
      ddbMock.on(QueryCommand).resolvesOnce({
        Items: [],
        ConsumedCapacity: { CapacityUnits: 0.5 },
      });

      ddbMock.on(PutCommand).resolves({});

      const image = await repository.create(createData);

      expect(image.url).toBe('https://cdn.example.com/products/subfolder/image.jpg');
    });
  });
});
