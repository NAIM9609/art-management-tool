# ProductRepository

A production-ready DynamoDB repository for managing products with cost-optimized operations, relationships, and advanced querying capabilities.

## Features

✅ **CRUD Operations** - Full create, read, update, delete with soft delete support
✅ **Auto-increment IDs** - Atomic counter for sequential product IDs
✅ **Eventually Consistent Reads** - 50% cost savings on queries and listings
✅ **Projection Expressions** - Minimize data transfer for list operations
✅ **Sparse GSI** - Character index only created when needed
✅ **Relationship Management** - Product-category linking
✅ **Advanced Queries** - Search by status, character, or full-text search
✅ **Pagination Support** - Efficient cursor-based pagination
✅ **TypeScript Support** - Fully typed with comprehensive interfaces
✅ **95%+ Test Coverage** - 30 unit tests + 7 integration tests

## DynamoDB Table Structure

### Primary Key
- **PK**: `PRODUCT#{id}`
- **SK**: `METADATA`

### Global Secondary Indexes

#### GSI1 - Product by Slug
- **GSI1PK**: `PRODUCT_SLUG#{slug}`
- **GSI1SK**: `{created_at}`
- **Use**: Find product by unique slug (eventually consistent)

#### GSI2 - Products by Status
- **GSI2PK**: `PRODUCT_STATUS#{status}`
- **GSI2SK**: `{title}#{id}`
- **Use**: List products by status, ordered by title (eventually consistent)

#### GSI3 - Products by Character (Sparse)
- **GSI3PK**: `CHARACTER#{character_id}`
- **GSI3SK**: `{created_at}`
- **Use**: Find products for a specific character (sparse index, only set when character_id exists)

### Product-Category Relationships
- **PK**: `PRODUCT#{product_id}`
- **SK**: `CATEGORY#{category_id}`

## Installation

```typescript
import { DynamoDBOptimized } from '../DynamoDBOptimized';
import { ProductRepository } from './repositories';

const dynamoDB = new DynamoDBOptimized({
  tableName: process.env.DYNAMODB_TABLE_NAME || 'products',
  region: 'us-east-1',
});

const productRepository = new ProductRepository(dynamoDB);
```

## Usage Examples

### Create Product

```typescript
import { ProductStatus } from './repositories/types';

const product = await productRepository.create({
  slug: 'superman-comic-1',
  title: 'Superman Comic #1',
  short_description: 'First appearance of Superman',
  base_price: 199.99,
  currency: 'USD',
  status: ProductStatus.PUBLISHED,
  character_id: 123,
  character_value: 'Superman',
});

console.log(`Created product with ID: ${product.id}`);
```

### Find Product by ID (Strongly Consistent)

```typescript
const product = await productRepository.findById(1);

if (product) {
  console.log(`Found: ${product.title}`);
}
```

### Find Product by Slug (Eventually Consistent)

```typescript
const product = await productRepository.findBySlug('superman-comic-1');

if (product) {
  console.log(`Found: ${product.title}`);
}
```

### List All Published Products with Pagination

```typescript
const result = await productRepository.findAll({
  limit: 20,
});

console.log(`Found ${result.count} products`);
result.items.forEach(product => {
  console.log(`- ${product.title}: $${product.base_price}`);
});

// Get next page
if (result.lastEvaluatedKey) {
  const nextPage = await productRepository.findAll({
    limit: 20,
    lastEvaluatedKey: result.lastEvaluatedKey,
  });
}
```

### Update Product

```typescript
const updated = await productRepository.update(1, {
  title: 'Superman Comic #1 (Remastered)',
  base_price: 249.99,
  status: ProductStatus.PUBLISHED,
});

if (updated) {
  console.log(`Updated: ${updated.title}`);
}
```

### Soft Delete and Restore

```typescript
// Soft delete
const deleted = await productRepository.softDelete(1);
console.log(`Deleted at: ${deleted?.deleted_at}`);

// Restore
const restored = await productRepository.restore(1);
console.log(`Restored product: ${restored?.title}`);
```

### Manage Product Categories

```typescript
// Add categories
await productRepository.addCategory(1, 10); // Comics category
await productRepository.addCategory(1, 20); // Superhero category

// Get all categories for a product
const categories = await productRepository.getCategories(1);
console.log(`Product has ${categories.length} categories`);

// Remove a category
await productRepository.removeCategory(1, 20);
```

### Query by Status

```typescript
const published = await productRepository.findByStatus(
  ProductStatus.PUBLISHED,
  { limit: 50 }
);

console.log(`Found ${published.count} published products`);
```

### Query by Character (Sparse Index)

```typescript
const supermanProducts = await productRepository.findByCharacter(123, {
  limit: 30,
});

console.log(`Found ${supermanProducts.count} Superman products`);
```

### Search Products

```typescript
const searchResults = await productRepository.search('batman', {
  limit: 20,
});

console.log(`Found ${searchResults.count} products matching 'batman'`);
```

## Cost Optimizations

### 1. Eventually Consistent Reads
All query operations (`findBySlug`, `findAll`, `findByStatus`, `findByCharacter`, `search`) use eventually consistent reads for **50% cost savings** compared to strongly consistent reads.

Only `findById` uses strongly consistent reads for immediate consistency after writes.

### 2. Projection Expressions
List operations use projection expressions to return only essential fields:
- `id`, `slug`, `title`, `short_description`
- `base_price`, `currency`, `status`
- `created_at`, `updated_at`

This minimizes data transfer costs and improves performance.

### 3. Sparse GSI3
The character index (GSI3) is only created when `character_id` is present, saving storage and indexing costs for products without character associations.

### 4. Batch Operations Ready
The repository is designed to work with the `batchGetOptimized` method for fetching multiple products efficiently (up to 100 items per batch).

## Data Types

```typescript
export enum ProductStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
}

export interface Product {
  id: number;
  slug: string;
  title: string;
  short_description?: string;
  long_description?: string;
  base_price: number;
  currency: string;
  sku?: string;
  gtin?: string;
  status: ProductStatus;
  character_id?: number;
  character_value?: string;
  etsy_link?: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

export interface ProductCategory {
  product_id: number;
  category_id: number;
  created_at: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  lastEvaluatedKey?: Record<string, any>;
  count: number;
}
```

## Testing

### Run Tests

```bash
# Run unit tests (30 tests)
npm test -- ProductRepository.test.ts

# Run integration tests (7 tests)
npm test -- ProductRepository.integration.test.ts

# Run all ProductRepository tests
npm test -- ProductRepository

# Run with coverage
npm test -- --coverage ProductRepository
```

### Test Coverage

The repository has **95.04% line coverage** with comprehensive tests for:
- ✅ CRUD operations
- ✅ Auto-increment ID generation
- ✅ Soft delete and restore
- ✅ Product-category relationships
- ✅ Query operations
- ✅ Pagination
- ✅ Error handling
- ✅ Edge cases

## API Reference

### CRUD Operations

#### `create(data: CreateProductData): Promise<Product>`
Creates a new product with auto-increment ID.

#### `findById(id: number): Promise<Product | null>`
Finds product by ID with strongly consistent read.

#### `findBySlug(slug: string): Promise<Product | null>`
Finds product by slug using GSI1 (eventually consistent).

#### `findAll(params?: PaginationParams): Promise<PaginatedResponse<Product>>`
Lists published products with pagination (eventually consistent).

#### `update(id: number, data: UpdateProductData): Promise<Product | null>`
Updates product fields. Automatically updates GSI attributes when relevant fields change.

#### `softDelete(id: number): Promise<Product | null>`
Soft deletes product by setting `deleted_at` timestamp.

#### `restore(id: number): Promise<Product | null>`
Restores soft-deleted product by removing `deleted_at`.

### Relationship Methods

#### `getCategories(productId: number): Promise<ProductCategory[]>`
Gets all categories for a product.

#### `addCategory(productId: number, categoryId: number): Promise<ProductCategory>`
Adds a product-category link.

#### `removeCategory(productId: number, categoryId: number): Promise<void>`
Removes a product-category link.

### Query Methods

#### `findByStatus(status: ProductStatus, params?: PaginationParams): Promise<PaginatedResponse<Product>>`
Queries products by status using GSI2.

#### `findByCharacter(characterId: number, params?: PaginationParams): Promise<PaginatedResponse<Product>>`
Queries products by character using sparse GSI3.

#### `search(term: string, params?: PaginationParams): Promise<PaginatedResponse<Product>>`
Searches products by term in title and description (filter expression on GSI2).

### Utility Methods

#### `getNextId(): Promise<number>`
Gets next auto-increment ID using atomic counter.

#### `mapToProduct(item: Record<string, any>): Product`
Maps DynamoDB item to Product interface.

#### `buildProductItem(product: Product): Record<string, any>`
Builds DynamoDB item from Product with all keys and GSIs.

## Performance Considerations

1. **findById** - Single item get with consistent read (~0.5 RCU)
2. **findBySlug** - Query on GSI1 with eventually consistent read (~0.5 RCU for small items)
3. **findAll** - Query on GSI2 with projection (~0.25 RCU per item)
4. **findByStatus** - Query on GSI2 with projection (~0.25 RCU per item)
5. **findByCharacter** - Query on sparse GSI3 (~0.25 RCU per item)
6. **search** - Query with filter expression (may scan more items than returned)
7. **create** - 2 writes: counter update + item put (~2 WCU)
8. **update** - Single item update (~1 WCU)
9. **softDelete** - Single item update (~1 WCU)

## Best Practices

1. **Use findById for immediate consistency** after writes
2. **Use findBySlug, findAll, etc. for cost-effective listings**
3. **Implement pagination** for large result sets
4. **Use projection expressions** when you don't need all fields
5. **Batch operations** when fetching multiple products
6. **Monitor consumed capacity** in production
7. **Set appropriate GSI attributes** when creating/updating products
8. **Use soft delete** instead of hard delete for audit trails

## License

MIT
