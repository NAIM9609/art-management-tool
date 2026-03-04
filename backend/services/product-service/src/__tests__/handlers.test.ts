/**
 * Unit tests for Product Service Lambda Handlers
 */

// Set environment variables before any imports
process.env.DYNAMODB_TABLE_NAME = 'test-products';
process.env.AWS_REGION = 'us-east-1';
process.env.JWT_SECRET = 'test-secret';

import jwt from 'jsonwebtoken';

// ──────────────────────────────────────────────────────────────────────────────
// Mocks
// ──────────────────────────────────────────────────────────────────────────────

const mockListProducts = jest.fn();
const mockGetProductBySlug = jest.fn();
const mockGetProductById = jest.fn();
const mockCreateProduct = jest.fn();
const mockUpdateProduct = jest.fn();
const mockDeleteProduct = jest.fn();
const mockAddVariant = jest.fn();
const mockUpdateVariant = jest.fn();
const mockListImages = jest.fn();
const mockDeleteImage = jest.fn();

jest.mock('../../../../src/services/ProductService', () => ({
  ProductService: jest.fn().mockImplementation(() => ({
    listProducts: mockListProducts,
    getProductBySlug: mockGetProductBySlug,
    getProductById: mockGetProductById,
    createProduct: mockCreateProduct,
    updateProduct: mockUpdateProduct,
    deleteProduct: mockDeleteProduct,
    addVariant: mockAddVariant,
    updateVariant: mockUpdateVariant,
    listImages: mockListImages,
    deleteImage: mockDeleteImage,
  })),
  ProductStatus: {
    PUBLISHED: 'published',
    DRAFT: 'draft',
    ARCHIVED: 'archived',
  },
}));

const mockFindAll = jest.fn();
const mockFindBySlug = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockSoftDelete = jest.fn();

jest.mock('../../../../src/services/dynamodb/repositories/CategoryRepository', () => ({
  CategoryRepository: jest.fn().mockImplementation(() => ({
    findAll: mockFindAll,
    findBySlug: mockFindBySlug,
    create: mockCreate,
    update: mockUpdate,
    softDelete: mockSoftDelete,
  })),
}));

const mockGeneratePresignedUploadUrl = jest.fn();

jest.mock('../../../../src/services/s3/S3Service', () => ({
  S3Service: jest.fn().mockImplementation(() => ({
    generatePresignedUploadUrl: mockGeneratePresignedUploadUrl,
  })),
}));

jest.mock('../../../../src/services/dynamodb/DynamoDBOptimized', () => ({
  DynamoDBOptimized: jest.fn().mockImplementation(() => ({})),
}));

// ──────────────────────────────────────────────────────────────────────────────
// Import handlers AFTER mocks are set up
// ──────────────────────────────────────────────────────────────────────────────

import {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
} from '../handlers/product.handler';

import {
  listVariants,
  createVariant,
  updateVariant,
  updateStock,
} from '../handlers/variant.handler';

import {
  getUploadUrl,
  listImages,
  deleteImage,
} from '../handlers/image.handler';

import {
  listCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../handlers/category.handler';

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function makeAdminToken(): string {
  return jwt.sign({ id: 1, username: 'admin' }, 'test-secret');
}

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    httpMethod: 'GET',
    path: '/',
    pathParameters: null,
    queryStringParameters: null,
    headers: {},
    body: null,
    ...overrides,
  };
}

const ADMIN_HEADERS = { Authorization: `Bearer ${makeAdminToken()}` };

// ──────────────────────────────────────────────────────────────────────────────
// Product Handlers
// ──────────────────────────────────────────────────────────────────────────────

describe('Product Handlers', () => {
  beforeEach(() => jest.clearAllMocks());

  // ── listProducts ────────────────────────────────────────────────────────────

  describe('listProducts', () => {
    it('returns 200 with products list', async () => {
      const products = [{ id: 1, title: 'Test', slug: 'test', base_price: 10, status: 'published' }];
      mockListProducts.mockResolvedValueOnce({ products, total: 1 });

      const result = await listProducts(makeEvent());

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.products).toHaveLength(1);
      expect(body.total).toBe(1);
      expect(body.page).toBe(1);
      expect(body.per_page).toBe(20);
      expect(result.headers?.['Cache-Control']).toMatch(/public/);
      expect(result.headers?.['ETag']).toBeTruthy();
    });

    it('passes filters from query string', async () => {
      mockListProducts.mockResolvedValueOnce({ products: [], total: 0 });

      await listProducts(
        makeEvent({
          queryStringParameters: {
            category: 'prints',
            search: 'art',
            min_price: '10',
            max_price: '100',
            page: '2',
            per_page: '10',
          },
        })
      );

      expect(mockListProducts).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'prints',
          search: 'art',
          minPrice: 10,
          maxPrice: 100,
        }),
        2,
        10
      );
    });

    it('ignores invalid status filter', async () => {
      mockListProducts.mockResolvedValueOnce({ products: [], total: 0 });

      await listProducts(makeEvent({ queryStringParameters: { status: 'bad-status' } }));

      expect(mockListProducts).toHaveBeenCalledWith(
        expect.not.objectContaining({ status: 'bad-status' }),
        1,
        20
      );
    });

    it('returns 500 on service error', async () => {
      mockListProducts.mockRejectedValueOnce(new Error('DynamoDB error'));

      const result = await listProducts(makeEvent());

      expect(result.statusCode).toBe(500);
    });
  });

  // ── getProduct ──────────────────────────────────────────────────────────────

  describe('getProduct', () => {
    it('returns 200 with product', async () => {
      const product = { id: 1, title: 'Test', slug: 'test', updated_at: '2024-01-01' };
      mockGetProductBySlug.mockResolvedValueOnce(product);

      const result = await getProduct(makeEvent({ pathParameters: { slug: 'test' } }));

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toEqual(product);
      expect(result.headers?.['ETag']).toBeTruthy();
    });

    it('returns 404 when product not found', async () => {
      mockGetProductBySlug.mockResolvedValueOnce(null);

      const result = await getProduct(makeEvent({ pathParameters: { slug: 'missing' } }));

      expect(result.statusCode).toBe(404);
    });

    it('returns 400 when slug is missing', async () => {
      const result = await getProduct(makeEvent());

      expect(result.statusCode).toBe(400);
    });
  });

  // ── createProduct ───────────────────────────────────────────────────────────

  describe('createProduct', () => {
    const validBody = { title: 'New Art', slug: 'new-art', base_price: 50 };

    it('returns 201 on success', async () => {
      const product = { id: 10, ...validBody };
      mockCreateProduct.mockResolvedValueOnce(product);

      const result = await createProduct(
        makeEvent({ headers: ADMIN_HEADERS, body: JSON.stringify(validBody) })
      );

      expect(result.statusCode).toBe(201);
      expect(JSON.parse(result.body)).toEqual(product);
    });

    it('returns 401 without token', async () => {
      const result = await createProduct(makeEvent({ body: JSON.stringify(validBody) }));

      expect(result.statusCode).toBe(401);
    });

    it('returns 400 when title is missing', async () => {
      const result = await createProduct(
        makeEvent({
          headers: ADMIN_HEADERS,
          body: JSON.stringify({ slug: 'art', base_price: 10 }),
        })
      );

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toContain('title');
    });

    it('returns 400 when slug is missing', async () => {
      const result = await createProduct(
        makeEvent({
          headers: ADMIN_HEADERS,
          body: JSON.stringify({ title: 'Art', base_price: 10 }),
        })
      );

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toContain('slug');
    });

    it('returns 400 when base_price is negative', async () => {
      const result = await createProduct(
        makeEvent({
          headers: ADMIN_HEADERS,
          body: JSON.stringify({ title: 'Art', slug: 'art', base_price: -5 }),
        })
      );

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toContain('base_price');
    });

    it('returns 400 for invalid JSON body', async () => {
      const result = await createProduct(
        makeEvent({ headers: ADMIN_HEADERS, body: 'not-json' })
      );

      expect(result.statusCode).toBe(400);
    });

    it('returns 400 when body is missing', async () => {
      const result = await createProduct(makeEvent({ headers: ADMIN_HEADERS }));

      expect(result.statusCode).toBe(400);
    });
  });

  // ── updateProduct ───────────────────────────────────────────────────────────

  describe('updateProduct', () => {
    it('returns 200 on success', async () => {
      const product = { id: 1, title: 'Updated' };
      mockUpdateProduct.mockResolvedValueOnce(product);

      const result = await updateProduct(
        makeEvent({
          headers: ADMIN_HEADERS,
          pathParameters: { id: '1' },
          body: JSON.stringify({ title: 'Updated' }),
        })
      );

      expect(result.statusCode).toBe(200);
    });

    it('returns 401 without token', async () => {
      const result = await updateProduct(
        makeEvent({ pathParameters: { id: '1' }, body: JSON.stringify({ title: 'x' }) })
      );

      expect(result.statusCode).toBe(401);
    });

    it('returns 400 for invalid id', async () => {
      const result = await updateProduct(
        makeEvent({
          headers: ADMIN_HEADERS,
          pathParameters: { id: 'abc' },
          body: JSON.stringify({ title: 'x' }),
        })
      );

      expect(result.statusCode).toBe(400);
    });

    it('returns 400 for empty body', async () => {
      const result = await updateProduct(
        makeEvent({
          headers: ADMIN_HEADERS,
          pathParameters: { id: '1' },
          body: JSON.stringify({}),
        })
      );

      expect(result.statusCode).toBe(400);
    });

    it('returns 404 when product not found', async () => {
      mockUpdateProduct.mockRejectedValueOnce(new Error('Product with id 999 not found'));

      const result = await updateProduct(
        makeEvent({
          headers: ADMIN_HEADERS,
          pathParameters: { id: '999' },
          body: JSON.stringify({ title: 'x' }),
        })
      );

      expect(result.statusCode).toBe(404);
    });
  });

  // ── deleteProduct ───────────────────────────────────────────────────────────

  describe('deleteProduct', () => {
    it('returns 200 on success', async () => {
      mockDeleteProduct.mockResolvedValueOnce(undefined);

      const result = await deleteProduct(
        makeEvent({ headers: ADMIN_HEADERS, pathParameters: { id: '1' } })
      );

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).message).toBe('Product deleted');
    });

    it('returns 401 without token', async () => {
      const result = await deleteProduct(makeEvent({ pathParameters: { id: '1' } }));

      expect(result.statusCode).toBe(401);
    });

    it('returns 400 for missing id', async () => {
      const result = await deleteProduct(makeEvent({ headers: ADMIN_HEADERS }));

      expect(result.statusCode).toBe(400);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Variant Handlers
// ──────────────────────────────────────────────────────────────────────────────

describe('Variant Handlers', () => {
  beforeEach(() => jest.clearAllMocks());

  // ── listVariants ────────────────────────────────────────────────────────────

  describe('listVariants', () => {
    it('returns 200 with variants', async () => {
      const variants = [{ id: 'v1', sku: 'SKU-1', name: 'Small' }];
      mockGetProductById.mockResolvedValueOnce({ id: 1, variants });

      const result = await listVariants(makeEvent({ pathParameters: { id: '1' } }));

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).variants).toHaveLength(1);
    });

    it('returns 404 when product not found', async () => {
      mockGetProductById.mockResolvedValueOnce(null);

      const result = await listVariants(makeEvent({ pathParameters: { id: '999' } }));

      expect(result.statusCode).toBe(404);
    });

    it('returns 400 for missing id', async () => {
      const result = await listVariants(makeEvent());

      expect(result.statusCode).toBe(400);
    });

    it('returns 400 for invalid id', async () => {
      const result = await listVariants(makeEvent({ pathParameters: { id: 'xyz' } }));

      expect(result.statusCode).toBe(400);
    });
  });

  // ── createVariant ───────────────────────────────────────────────────────────

  describe('createVariant', () => {
    const validBody = { sku: 'SKU-001', name: 'Small', stock: 10 };

    it('returns 201 on success', async () => {
      const variant = { id: 'v1', ...validBody };
      mockAddVariant.mockResolvedValueOnce(variant);

      const result = await createVariant(
        makeEvent({
          headers: ADMIN_HEADERS,
          pathParameters: { id: '1' },
          body: JSON.stringify(validBody),
        })
      );

      expect(result.statusCode).toBe(201);
      expect(JSON.parse(result.body)).toEqual(variant);
    });

    it('returns 401 without token', async () => {
      const result = await createVariant(
        makeEvent({ pathParameters: { id: '1' }, body: JSON.stringify(validBody) })
      );

      expect(result.statusCode).toBe(401);
    });

    it('returns 400 when sku is missing', async () => {
      const result = await createVariant(
        makeEvent({
          headers: ADMIN_HEADERS,
          pathParameters: { id: '1' },
          body: JSON.stringify({ name: 'Small' }),
        })
      );

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toContain('sku');
    });

    it('returns 400 when name is missing', async () => {
      const result = await createVariant(
        makeEvent({
          headers: ADMIN_HEADERS,
          pathParameters: { id: '1' },
          body: JSON.stringify({ sku: 'SKU-1' }),
        })
      );

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toContain('name');
    });
  });

  // ── updateVariant ───────────────────────────────────────────────────────────

  describe('updateVariant', () => {
    it('returns 200 on success', async () => {
      const variant = { id: 'v1', name: 'Large' };
      mockUpdateVariant.mockResolvedValueOnce(variant);

      const result = await updateVariant(
        makeEvent({
          headers: ADMIN_HEADERS,
          pathParameters: { id: 'v1' },
          body: JSON.stringify({ name: 'Large' }),
        })
      );

      expect(result.statusCode).toBe(200);
    });

    it('returns 401 without token', async () => {
      const result = await updateVariant(
        makeEvent({ pathParameters: { id: 'v1' }, body: JSON.stringify({ name: 'x' }) })
      );

      expect(result.statusCode).toBe(401);
    });

    it('returns 400 for empty body', async () => {
      const result = await updateVariant(
        makeEvent({
          headers: ADMIN_HEADERS,
          pathParameters: { id: 'v1' },
          body: JSON.stringify({}),
        })
      );

      expect(result.statusCode).toBe(400);
    });
  });

  // ── updateStock ─────────────────────────────────────────────────────────────

  describe('updateStock', () => {
    it('returns 200 on success', async () => {
      const variant = { id: 'v1', stock: 25 };
      mockUpdateVariant.mockResolvedValueOnce(variant);

      const result = await updateStock(
        makeEvent({
          headers: ADMIN_HEADERS,
          pathParameters: { id: 'v1' },
          body: JSON.stringify({ quantity: 25 }),
        })
      );

      expect(result.statusCode).toBe(200);
      expect(mockUpdateVariant).toHaveBeenCalledWith('v1', { stock: 25 });
    });

    it('returns 400 when quantity is missing', async () => {
      const result = await updateStock(
        makeEvent({
          headers: ADMIN_HEADERS,
          pathParameters: { id: 'v1' },
          body: JSON.stringify({}),
        })
      );

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toContain('quantity');
    });

    it('returns 400 when quantity is not a number', async () => {
      const result = await updateStock(
        makeEvent({
          headers: ADMIN_HEADERS,
          pathParameters: { id: 'v1' },
          body: JSON.stringify({ quantity: 'lots' }),
        })
      );

      expect(result.statusCode).toBe(400);
    });

    it('returns 400 when quantity is negative', async () => {
      const result = await updateStock(
        makeEvent({
          headers: ADMIN_HEADERS,
          pathParameters: { id: 'v1' },
          body: JSON.stringify({ quantity: -1 }),
        })
      );

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toContain('non-negative');
    });

    it('returns 401 without token', async () => {
      const result = await updateStock(
        makeEvent({ pathParameters: { id: 'v1' }, body: JSON.stringify({ quantity: 5 }) })
      );

      expect(result.statusCode).toBe(401);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Image Handlers
// ──────────────────────────────────────────────────────────────────────────────

describe('Image Handlers', () => {
  beforeEach(() => jest.clearAllMocks());

  // ── getUploadUrl ────────────────────────────────────────────────────────────

  describe('getUploadUrl', () => {
    it('returns 200 with upload URL', async () => {
      mockGeneratePresignedUploadUrl.mockResolvedValueOnce({
        uploadUrl: 'https://s3.example.com/upload',
        cdnUrl: 'https://cdn.example.com/image.jpg',
        key: 'products/1/image.jpg',
      });

      const result = await getUploadUrl(
        makeEvent({
          headers: ADMIN_HEADERS,
          pathParameters: { id: '1' },
          queryStringParameters: { content_type: 'image/jpeg' },
        })
      );

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.upload_url).toBeTruthy();
      expect(body.cdn_url).toBeTruthy();
      expect(body.key).toBeTruthy();
      expect(body.expires_in).toBe(300);
    });

    it('returns 400 for invalid content type', async () => {
      const result = await getUploadUrl(
        makeEvent({
          headers: ADMIN_HEADERS,
          pathParameters: { id: '1' },
          queryStringParameters: { content_type: 'application/pdf' },
        })
      );

      expect(result.statusCode).toBe(400);
    });

    it('returns 401 without token', async () => {
      const result = await getUploadUrl(makeEvent({ pathParameters: { id: '1' } }));

      expect(result.statusCode).toBe(401);
    });

    it('returns 400 for missing id', async () => {
      const result = await getUploadUrl(makeEvent({ headers: ADMIN_HEADERS }));

      expect(result.statusCode).toBe(400);
    });

    it('defaults to image/jpeg content type', async () => {
      mockGeneratePresignedUploadUrl.mockResolvedValueOnce({
        uploadUrl: 'https://s3.example.com/upload',
        cdnUrl: 'https://cdn.example.com/image.jpg',
        key: 'products/1/image.jpg',
      });

      await getUploadUrl(
        makeEvent({ headers: ADMIN_HEADERS, pathParameters: { id: '1' } })
      );

      expect(mockGeneratePresignedUploadUrl).toHaveBeenCalledWith(
        'product-1',
        'image/jpeg',
        'products/1'
      );
    });
  });

  // ── listImages ──────────────────────────────────────────────────────────────

  describe('listImages', () => {
    it('returns 200 with images', async () => {
      const images = [{ id: 'img1', url: '/image.jpg', alt_text: 'Art', position: 0 }];
      mockListImages.mockResolvedValueOnce(images);

      const result = await listImages(makeEvent({ pathParameters: { id: '1' } }));

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).images).toHaveLength(1);
    });

    it('returns 400 for missing id', async () => {
      const result = await listImages(makeEvent());

      expect(result.statusCode).toBe(400);
    });

    it('returns 400 for invalid id', async () => {
      const result = await listImages(makeEvent({ pathParameters: { id: 'bad' } }));

      expect(result.statusCode).toBe(400);
    });
  });

  // ── deleteImage ─────────────────────────────────────────────────────────────

  describe('deleteImage', () => {
    it('returns 200 on success', async () => {
      mockDeleteImage.mockResolvedValueOnce(undefined);

      const result = await deleteImage(
        makeEvent({
          headers: ADMIN_HEADERS,
          pathParameters: { id: '1', imageId: 'img1' },
        })
      );

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).message).toBe('Image deleted');
    });

    it('returns 401 without token', async () => {
      const result = await deleteImage(
        makeEvent({ pathParameters: { id: '1', imageId: 'img1' } })
      );

      expect(result.statusCode).toBe(401);
    });

    it('returns 400 for missing imageId', async () => {
      const result = await deleteImage(
        makeEvent({ headers: ADMIN_HEADERS, pathParameters: { id: '1' } })
      );

      expect(result.statusCode).toBe(400);
    });

    it('returns 404 when image not found', async () => {
      mockDeleteImage.mockRejectedValueOnce(new Error('Image with id img99 not found'));

      const result = await deleteImage(
        makeEvent({
          headers: ADMIN_HEADERS,
          pathParameters: { id: '1', imageId: 'img99' },
        })
      );

      expect(result.statusCode).toBe(404);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Category Handlers
// ──────────────────────────────────────────────────────────────────────────────

describe('Category Handlers', () => {
  beforeEach(() => jest.clearAllMocks());

  // ── listCategories ──────────────────────────────────────────────────────────

  describe('listCategories', () => {
    it('returns 200 with categories', async () => {
      const cats = [{ id: 1, name: 'Prints', slug: 'prints' }];
      mockFindAll.mockResolvedValueOnce({ items: cats, lastEvaluatedKey: undefined });

      const result = await listCategories(makeEvent());

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.categories).toHaveLength(1);
      expect(body.total).toBe(1);
      expect(result.headers?.['Cache-Control']).toMatch(/public/);
      expect(result.headers?.['ETag']).toBeTruthy();
    });

    it('respects limit query param', async () => {
      mockFindAll.mockResolvedValueOnce({ items: [], lastEvaluatedKey: undefined });

      await listCategories(makeEvent({ queryStringParameters: { limit: '25' } }));

      expect(mockFindAll).toHaveBeenCalledWith({ limit: 25 });
    });

    it('caps limit at 100', async () => {
      mockFindAll.mockResolvedValueOnce({ items: [], lastEvaluatedKey: undefined });

      await listCategories(makeEvent({ queryStringParameters: { limit: '999' } }));

      expect(mockFindAll).toHaveBeenCalledWith({ limit: 100 });
    });

    it('passes parsed last_key to repository', async () => {
      mockFindAll.mockResolvedValueOnce({ items: [], lastEvaluatedKey: undefined });

      await listCategories(
        makeEvent({
          queryStringParameters: {
            last_key: JSON.stringify({ PK: 'CATEGORY#1', SK: 'METADATA' }),
          },
        })
      );

      expect(mockFindAll).toHaveBeenCalledWith({
        limit: 50,
        lastEvaluatedKey: { PK: 'CATEGORY#1', SK: 'METADATA' },
      });
    });

    it('returns 400 for invalid last_key JSON', async () => {
      const result = await listCategories(
        makeEvent({ queryStringParameters: { last_key: 'not-json' } })
      );

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toContain('last_key');
    });

    it('returns 500 on service error', async () => {
      mockFindAll.mockRejectedValueOnce(new Error('DB error'));

      const result = await listCategories(makeEvent());

      expect(result.statusCode).toBe(500);
    });
  });

  // ── getCategory ─────────────────────────────────────────────────────────────

  describe('getCategory', () => {
    it('returns 200 with category', async () => {
      const cat = { id: 1, name: 'Prints', slug: 'prints', updated_at: '2024-01-01' };
      mockFindBySlug.mockResolvedValueOnce(cat);

      const result = await getCategory(makeEvent({ pathParameters: { slug: 'prints' } }));

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toEqual(cat);
      expect(result.headers?.['ETag']).toBeTruthy();
    });

    it('returns 404 when category not found', async () => {
      mockFindBySlug.mockResolvedValueOnce(null);

      const result = await getCategory(makeEvent({ pathParameters: { slug: 'missing' } }));

      expect(result.statusCode).toBe(404);
    });

    it('returns 400 when slug is missing', async () => {
      const result = await getCategory(makeEvent());

      expect(result.statusCode).toBe(400);
    });
  });

  // ── createCategory ──────────────────────────────────────────────────────────

  describe('createCategory', () => {
    const validBody = { name: 'Prints', slug: 'prints' };

    it('returns 201 on success', async () => {
      const cat = { id: 5, ...validBody };
      mockCreate.mockResolvedValueOnce(cat);

      const result = await createCategory(
        makeEvent({ headers: ADMIN_HEADERS, body: JSON.stringify(validBody) })
      );

      expect(result.statusCode).toBe(201);
      expect(JSON.parse(result.body)).toEqual(cat);
    });

    it('returns 401 without token', async () => {
      const result = await createCategory(makeEvent({ body: JSON.stringify(validBody) }));

      expect(result.statusCode).toBe(401);
    });

    it('returns 400 when name is missing', async () => {
      const result = await createCategory(
        makeEvent({ headers: ADMIN_HEADERS, body: JSON.stringify({ slug: 'prints' }) })
      );

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toContain('name');
    });

    it('returns 400 when slug is missing', async () => {
      const result = await createCategory(
        makeEvent({ headers: ADMIN_HEADERS, body: JSON.stringify({ name: 'Prints' }) })
      );

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toContain('slug');
    });

    it('returns 400 when slug has invalid characters', async () => {
      const result = await createCategory(
        makeEvent({
          headers: ADMIN_HEADERS,
          body: JSON.stringify({ name: 'Prints', slug: 'UPPER_CASE' }),
        })
      );

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toContain('slug');
    });
  });

  // ── updateCategory ──────────────────────────────────────────────────────────

  describe('updateCategory', () => {
    it('returns 200 on success', async () => {
      const cat = { id: 1, name: 'Updated Prints', slug: 'prints' };
      mockUpdate.mockResolvedValueOnce(cat);

      const result = await updateCategory(
        makeEvent({
          headers: ADMIN_HEADERS,
          pathParameters: { id: '1' },
          body: JSON.stringify({ name: 'Updated Prints' }),
        })
      );

      expect(result.statusCode).toBe(200);
    });

    it('returns 401 without token', async () => {
      const result = await updateCategory(
        makeEvent({ pathParameters: { id: '1' }, body: JSON.stringify({ name: 'x' }) })
      );

      expect(result.statusCode).toBe(401);
    });

    it('returns 400 for empty body', async () => {
      const result = await updateCategory(
        makeEvent({
          headers: ADMIN_HEADERS,
          pathParameters: { id: '1' },
          body: JSON.stringify({}),
        })
      );

      expect(result.statusCode).toBe(400);
    });

    it('returns 404 when category not found', async () => {
      mockUpdate.mockResolvedValueOnce(null);

      const result = await updateCategory(
        makeEvent({
          headers: ADMIN_HEADERS,
          pathParameters: { id: '999' },
          body: JSON.stringify({ name: 'x' }),
        })
      );

      expect(result.statusCode).toBe(404);
    });

    it('returns 400 when slug has invalid format', async () => {
      const result = await updateCategory(
        makeEvent({
          headers: ADMIN_HEADERS,
          pathParameters: { id: '1' },
          body: JSON.stringify({ slug: 'Bad Slug!' }),
        })
      );

      expect(result.statusCode).toBe(400);
    });
  });

  // ── deleteCategory ──────────────────────────────────────────────────────────

  describe('deleteCategory', () => {
    it('returns 200 on success', async () => {
      mockSoftDelete.mockResolvedValueOnce({ id: 1 });

      const result = await deleteCategory(
        makeEvent({ headers: ADMIN_HEADERS, pathParameters: { id: '1' } })
      );

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).message).toBe('Category deleted');
    });

    it('returns 401 without token', async () => {
      const result = await deleteCategory(makeEvent({ pathParameters: { id: '1' } }));

      expect(result.statusCode).toBe(401);
    });

    it('returns 404 when category not found', async () => {
      mockSoftDelete.mockResolvedValueOnce(null);

      const result = await deleteCategory(
        makeEvent({ headers: ADMIN_HEADERS, pathParameters: { id: '999' } })
      );

      expect(result.statusCode).toBe(404);
    });

    it('returns 400 for missing id', async () => {
      const result = await deleteCategory(makeEvent({ headers: ADMIN_HEADERS }));

      expect(result.statusCode).toBe(400);
    });

    it('returns 400 for invalid id', async () => {
      const result = await deleteCategory(
        makeEvent({ headers: ADMIN_HEADERS, pathParameters: { id: 'xyz' } })
      );

      expect(result.statusCode).toBe(400);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Auth middleware
// ──────────────────────────────────────────────────────────────────────────────

describe('Auth middleware (requireAuth)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('accepts demo-token-12345 for backward compatibility', async () => {
    mockCreateProduct.mockResolvedValueOnce({ id: 1, title: 'x', slug: 'x', base_price: 1 });

    const result = await createProduct(
      makeEvent({
        headers: { Authorization: 'Bearer demo-token-12345' },
        body: JSON.stringify({ title: 'Art', slug: 'art', base_price: 10 }),
      })
    );

    expect(result.statusCode).toBe(201);
  });

  it('rejects malformed Authorization header', async () => {
    const result = await createProduct(
      makeEvent({
        headers: { Authorization: 'Token bad-format' },
        body: JSON.stringify({ title: 'Art', slug: 'art', base_price: 10 }),
      })
    );

    expect(result.statusCode).toBe(401);
  });

  it('rejects expired JWT', async () => {
    const expiredToken = jwt.sign({ id: 1, username: 'admin' }, 'test-secret', {
      expiresIn: -1,
    });

    const result = await createProduct(
      makeEvent({
        headers: { Authorization: `Bearer ${expiredToken}` },
        body: JSON.stringify({ title: 'Art', slug: 'art', base_price: 10 }),
      })
    );

    expect(result.statusCode).toBe(401);
  });

  it('accepts lowercase authorization header', async () => {
    mockCreateProduct.mockResolvedValueOnce({ id: 1, title: 'Art', slug: 'art', base_price: 10 });

    const token = makeAdminToken();
    const result = await createProduct(
      makeEvent({
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: 'Art', slug: 'art', base_price: 10 }),
      })
    );

    expect(result.statusCode).toBe(201);
  });
});
