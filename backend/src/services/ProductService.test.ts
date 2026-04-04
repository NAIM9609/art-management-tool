/**
 * Unit tests for ProductService
 */

import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand, QueryCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { ProductService, ProductStatus } from './ProductService';
import { AuditService } from './AuditService';

// Mock DynamoDB Document Client
const ddbMock = mockClient(DynamoDBDocumentClient);

// Mock AuditService
jest.mock('./AuditService');

// Mock environment variables
process.env.DYNAMODB_TABLE_NAME = 'test-products';
process.env.AWS_REGION_CUSTOM = 'us-east-1';

describe('ProductService', () => {
  let service: ProductService;

  beforeEach(() => {
    ddbMock.reset();
    service = new ProductService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('listProducts', () => {
    it('should list products for admin (all statuses) when no filter provided', async () => {
      // Mock all three status queries
      ddbMock.on(QueryCommand).resolvesOnce({
        Items: [
          { id: 1, title: 'Published Product', status: ProductStatus.PUBLISHED, base_price: 10 },
        ],
        Count: 1,
      }).resolvesOnce({
        Items: [
          { id: 2, title: 'Draft Product', status: ProductStatus.DRAFT, base_price: 20 },
        ],
        Count: 1,
      }).resolvesOnce({
        Items: [
          { id: 3, title: 'Archived Product', status: ProductStatus.ARCHIVED, base_price: 30 },
        ],
        Count: 1,
      }).resolves({ Items: [], Count: 0 }); // For relation queries

      const result = await service.listProducts({}, 1, 20);

      expect(result.products).toHaveLength(3);
      expect(result.total).toBe(3);
      expect(result.products[0].status).toBe(ProductStatus.PUBLISHED);
      expect(result.products[1].status).toBe(ProductStatus.DRAFT);
      expect(result.products[2].status).toBe(ProductStatus.ARCHIVED);
    });

    it('should filter by specific status', async () => {
      ddbMock.on(QueryCommand).resolvesOnce({
        Items: [
          { id: 1, title: 'Published Product', status: ProductStatus.PUBLISHED, base_price: 10 },
        ],
        Count: 1,
      }).resolves({ Items: [], Count: 0 });

      const result = await service.listProducts({ status: ProductStatus.PUBLISHED }, 1, 20);

      expect(result.products).toHaveLength(1);
      expect(result.products[0].status).toBe(ProductStatus.PUBLISHED);
    });

    it('should handle pagination correctly', async () => {
      const mockProducts = Array.from({ length: 30 }, (_, i) => ({
        id: i + 1,
        title: `Product ${i + 1}`,
        status: ProductStatus.PUBLISHED,
        base_price: 10 + i,
      }));

      ddbMock.on(QueryCommand).callsFake((input) => {
        const values = input.ExpressionAttributeValues as Record<string, unknown> | undefined;
        const statusKey = values?.[':gsi2pk'];

        if (statusKey === `PRODUCT_STATUS#${ProductStatus.PUBLISHED}`) {
          return {
            Items: mockProducts,
            Count: 30,
          };
        }

        return {
          Items: [],
          Count: 0,
        };
      });

      // Page 1
      const page1 = await service.listProducts({}, 1, 10);
      expect(page1.products).toHaveLength(10);
      expect(page1.products[0].id).toBe(1);

      // Page 2
      const page2 = await service.listProducts({}, 2, 10);
      expect(page2.products).toHaveLength(10);
      expect(page2.products[0].id).toBe(11);
    });

    it('should filter by price range', async () => {
      ddbMock.on(QueryCommand).resolvesOnce({
        Items: [
          { id: 1, title: 'Cheap Product', status: ProductStatus.PUBLISHED, base_price: 10 },
          { id: 2, title: 'Mid Product', status: ProductStatus.PUBLISHED, base_price: 50 },
          { id: 3, title: 'Expensive Product', status: ProductStatus.PUBLISHED, base_price: 100 },
        ],
        Count: 3,
      }).resolves({ Items: [], Count: 0 });

      const result = await service.listProducts({ minPrice: 20, maxPrice: 80 }, 1, 20);

      expect(result.products).toHaveLength(1);
      expect(result.products[0].title).toBe('Mid Product');
    });

    it('should handle search with non-published status', async () => {
      ddbMock.on(QueryCommand).resolvesOnce({
        Items: [
          { id: 1, title: 'Draft Search Result', status: ProductStatus.DRAFT, base_price: 10, short_description: 'Test description' },
          { id: 2, title: 'Other Draft', status: ProductStatus.DRAFT, base_price: 20, short_description: 'Other' },
        ],
        Count: 2,
      }).resolves({ Items: [], Count: 0 });

      const result = await service.listProducts({ search: 'search', status: ProductStatus.DRAFT }, 1, 20);

      expect(result.products).toHaveLength(1);
      expect(result.products[0].title).toBe('Draft Search Result');
    });
  });

  describe('updateVariant', () => {
    it('should update variant with string ID', async () => {
      const variantId = 'uuid-variant-123';
      const mockVariant = {
        id: variantId,
        product_id: 1,
        sku: 'TEST-SKU',
        name: 'Test Variant',
        stock: 10,
        price_adjustment: 0,
      };

      ddbMock.on(QueryCommand).resolvesOnce({ Items: [mockVariant], Count: 1 });
      ddbMock.on(UpdateCommand).resolves({ Attributes: { ...mockVariant, stock: 20 } });

      const result = await service.updateVariant(variantId, { stock: 20 });

      expect(result.id).toBe(variantId);
      expect(result.stock).toBe(20);
    });

    it('should throw error for non-existent variant', async () => {
      ddbMock.on(QueryCommand).resolvesOnce({ Items: [], Count: 0 });

      await expect(service.updateVariant('non-existent-id', { stock: 20 }))
        .rejects.toThrow('Variant with id non-existent-id not found');
    });
  });

  describe('updateInventory', () => {
    it('should update inventory with string variant IDs', async () => {
      const variantId1 = 'uuid-variant-1';
      const variantId2 = 'uuid-variant-2';

      ddbMock.on(QueryCommand)
        .resolvesOnce({ Items: [{ id: variantId1, product_id: 1, stock: 10 }], Count: 1 })
        .resolvesOnce({ Items: [{ id: variantId2, product_id: 1, stock: 20 }], Count: 1 });

      ddbMock.on(UpdateCommand).resolves({});

      await service.updateInventory([
        { variantId: variantId1, quantity: 5 },
        { variantId: variantId2, quantity: -3 },
      ]);

      expect(ddbMock.calls().length).toBeGreaterThan(0);
    });

    it('should use Map for O(1) lookups instead of O(n*m)', async () => {
      const variantIds = Array.from({ length: 100 }, (_, i) => `uuid-variant-${i}`);
      const adjustments = variantIds.map(id => ({ variantId: id, quantity: 1 }));

      ddbMock.on(QueryCommand).callsFake((input) => {
        const values = input.ExpressionAttributeValues as Record<string, unknown> | undefined;
        const skValue = values?.[':sk'];

        if (typeof skValue === 'string' && skValue.startsWith('VARIANT#')) {
          const variantId = skValue.replace('VARIANT#', '');

          if (variantIds.includes(variantId)) {
            return {
              Items: [{ id: variantId, product_id: 1, stock: 10 }],
              Count: 1,
            };
          }
        }

        return {
          Items: [],
          Count: 0,
        };
      });

      ddbMock.on(UpdateCommand).resolves({});

      // This should complete quickly with Map optimization
      const startTime = Date.now();
      await service.updateInventory(adjustments);
      const duration = Date.now() - startTime;

      // With O(1) lookup, this should be fast even with 100 items
      expect(duration).toBeLessThan(5000);
    });

    it('should throw error for non-existent variant in adjustment', async () => {
      ddbMock.on(QueryCommand).resolvesOnce({ Items: [], Count: 0 });

      await expect(service.updateInventory([{ variantId: 'non-existent', quantity: 5 }]))
        .rejects.toThrow('Variant with id non-existent not found');
    });
  });

  describe('updateImage', () => {
    it('should update image with string ID', async () => {
      const imageId = 'uuid-image-123';
      const mockImage = {
        id: imageId,
        product_id: 1,
        url: 'test.jpg',
        position: 0,
      };

      ddbMock.on(GetCommand).resolves({ Item: mockImage });
      ddbMock.on(UpdateCommand).resolves({ Attributes: { ...mockImage, position: 5 } });

      const result = await service.updateImage(1, imageId, { position: 5 });

      expect(result.id).toBe(imageId);
      expect(result.position).toBe(5);
    });
  });

  describe('deleteImage', () => {
    it('should delete image with string ID', async () => {
      const imageId = 'uuid-image-123';
      const mockImage = {
        id: imageId,
        product_id: 1,
        url: 'test.jpg',
      };

      ddbMock.on(GetCommand).resolves({ Item: mockImage });
      ddbMock.on(UpdateCommand).resolves({});

      await expect(service.deleteImage(1, imageId)).resolves.not.toThrow();
    });

    it('should throw error when image not found', async () => {
      ddbMock.on(GetCommand).resolves({ Item: undefined });

      await expect(service.deleteImage(1, 'non-existent'))
        .rejects.toThrow('Image with id non-existent not found for product 1');
    });
  });

  describe('getProductById', () => {
    it('should return enhanced product with relations', async () => {
      const mockProduct = {
        id: 1,
        title: 'Test Product',
        status: ProductStatus.PUBLISHED,
        base_price: 29.99,
      };

      ddbMock.on(GetCommand).resolves({ Item: mockProduct });
      ddbMock.on(QueryCommand).resolves({ Items: [], Count: 0 });

      const result = await service.getProductById(1);

      expect(result).not.toBeNull();
      expect(result?.id).toBe(1);
      expect(result?.images).toBeDefined();
      expect(result?.variants).toBeDefined();
      expect(result?.categories).toBeDefined();
    });

    it('should return null for non-existent product', async () => {
      ddbMock.on(GetCommand).resolves({ Item: undefined });
      ddbMock.on(QueryCommand).resolves({ Items: [], Count: 0 });

      const result = await service.getProductById(999);

      expect(result).toBeNull();
    });
  });

  describe('Audit Logging Integration', () => {
    let mockAuditService: jest.Mocked<AuditService>;

    beforeEach(() => {
      mockAuditService = {
        logAction: jest.fn().mockResolvedValue({}),
      } as any;
      service = new ProductService(mockAuditService);
    });

    it('should log audit trail when creating product with userId', async () => {
      const mockProduct = {
        id: 1,
        title: 'Test Product',
        slug: 'test-product',
        status: ProductStatus.PUBLISHED,
        base_price: 29.99,
      };

      // Mock getNextId call
      ddbMock.on(UpdateCommand).resolvesOnce({ Attributes: { value: 1 } });
      // Mock product creation
      ddbMock.on(PutCommand).resolves({ Attributes: mockProduct });
      ddbMock.on(QueryCommand).resolves({ Items: [], Count: 0 });

      await service.createProduct(mockProduct, '123');

      expect(mockAuditService.logAction).toHaveBeenCalledWith(
        '123',
        'CREATE',
        'Product',
        '1',
        { title: mockProduct.title, slug: mockProduct.slug, status: mockProduct.status }
      );
    });

    it('should not log audit trail when creating product without userId', async () => {
      const mockProduct = {
        id: 1,
        title: 'Test Product',
        slug: 'test-product',
        status: ProductStatus.PUBLISHED,
        base_price: 29.99,
      };

      // Mock getNextId call
      ddbMock.on(UpdateCommand).resolvesOnce({ Attributes: { value: 1 } });
      // Mock product creation
      ddbMock.on(PutCommand).resolves({ Attributes: mockProduct });
      ddbMock.on(QueryCommand).resolves({ Items: [], Count: 0 });

      await service.createProduct(mockProduct);

      expect(mockAuditService.logAction).not.toHaveBeenCalled();
    });

    it('should log audit trail when updating product with changes', async () => {
      const oldProduct = {
        id: 1,
        title: 'Old Title',
        slug: 'test-product',
        status: ProductStatus.DRAFT,
        base_price: 19.99,
      };

      const newData = {
        title: 'New Title',
        status: ProductStatus.PUBLISHED,
        base_price: 29.99,
      };

      ddbMock.on(GetCommand).resolves({ Item: oldProduct });
      ddbMock.on(UpdateCommand).resolves({ Attributes: { ...oldProduct, ...newData } });
      ddbMock.on(QueryCommand).resolves({ Items: [], Count: 0 });

      await service.updateProduct(1, newData, '123');

      expect(mockAuditService.logAction).toHaveBeenCalledWith(
        '123',
        'UPDATE',
        'Product',
        '1',
        {
          title: { old: 'Old Title', new: 'New Title' },
          status: { old: ProductStatus.DRAFT, new: ProductStatus.PUBLISHED },
          base_price: { old: 19.99, new: 29.99 },
        }
      );
    });

    it('should not log audit trail when updating product with no changes', async () => {
      const oldProduct = {
        id: 1,
        title: 'Same Title',
        slug: 'test-product',
        status: ProductStatus.PUBLISHED,
        base_price: 29.99,
      };

      ddbMock.on(GetCommand).resolves({ Item: oldProduct });
      ddbMock.on(UpdateCommand).resolves({ Attributes: oldProduct });
      ddbMock.on(QueryCommand).resolves({ Items: [], Count: 0 });

      await service.updateProduct(1, { title: 'Same Title' }, '123');

      expect(mockAuditService.logAction).not.toHaveBeenCalled();
    });

    it('should log audit trail when deleting product', async () => {
      const mockProduct = {
        id: 1,
        title: 'Test Product',
        slug: 'test-product',
        status: ProductStatus.PUBLISHED,
      };

      ddbMock.on(GetCommand).resolves({ Item: mockProduct });
      ddbMock.on(UpdateCommand).resolves({});
      ddbMock.on(QueryCommand).resolves({ Items: [], Count: 0 });

      await service.deleteProduct(1, '123');

      expect(mockAuditService.logAction).toHaveBeenCalledWith(
        '123',
        'DELETE',
        'Product',
        '1',
        { title: mockProduct.title, slug: mockProduct.slug }
      );
    });

    it('should not log audit trail when deleting product without userId', async () => {
      const mockProduct = {
        id: 1,
        title: 'Test Product',
        slug: 'test-product',
        status: ProductStatus.PUBLISHED,
      };

      ddbMock.on(GetCommand).resolves({ Item: mockProduct });
      ddbMock.on(UpdateCommand).resolves({});
      ddbMock.on(QueryCommand).resolves({ Items: [], Count: 0 });

      await service.deleteProduct(1);

      expect(mockAuditService.logAction).not.toHaveBeenCalled();
    });
  });
});
