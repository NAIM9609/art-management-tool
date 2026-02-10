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

# ProductVariantRepository

A production-ready DynamoDB repository for managing product variants with atomic stock operations, batch creation, and cost-optimized queries.

## Features

✅ **CRUD Operations** - Full create, read, update, delete with soft delete support
✅ **Stock Management** - Atomic stock updates with conditions (cannot go below 0)
✅ **Batch Operations** - Create up to 25 variants in a single batch
✅ **SKU Lookup** - Fast variant lookup by SKU using GSI1
✅ **Eventually Consistent Reads** - 50% cost savings on queries
✅ **Hierarchical Storage** - Variants stored as children of products
✅ **TypeScript Support** - Fully typed with comprehensive interfaces
✅ **100% Test Coverage** - 33 comprehensive unit tests

## DynamoDB Table Structure

### Primary Key
- **PK**: `PRODUCT#{product_id}`
- **SK**: `VARIANT#{id}`
- **entity_type**: `ProductVariant`

### Global Secondary Index

#### GSI1 - Variant by SKU
- **GSI1PK**: `VARIANT_SKU#{sku}`
- **GSI1SK**: `{product_id}`
- **Use**: Find variant by unique SKU (eventually consistent)

## Installation

```typescript
import { DynamoDBOptimized } from '../DynamoDBOptimized';
import { ProductVariantRepository } from './repositories';

const dynamoDB = new DynamoDBOptimized({
  tableName: process.env.DYNAMODB_TABLE_NAME || 'products',
  region: 'us-east-1',
});

const variantRepository = new ProductVariantRepository(dynamoDB);
```

## Usage Examples

### Create Variant

```typescript
const variant = await variantRepository.create({
  product_id: 1,
  sku: 'SHIRT-RED-S',
  name: 'Red Shirt - Small',
  attributes: { size: 'S', color: 'red' },
  price_adjustment: 0,
  stock: 50,
});

console.log(`Created variant with ID: ${variant.id}`);
```

### Find Variant by SKU

```typescript
const variant = await variantRepository.findBySku('SHIRT-RED-S');

if (variant) {
  console.log(`Found: ${variant.name}, Stock: ${variant.stock}`);
}
```

### Find All Variants for a Product

```typescript
const variants = await variantRepository.findByProductId(1);

console.log(`Found ${variants.length} variants`);
variants.forEach(variant => {
  console.log(`- ${variant.name}: ${variant.stock} in stock`);
});
```

### Batch Create Variants

```typescript
const variants = await variantRepository.batchCreate([
  {
    product_id: 1,
    sku: 'SHIRT-RED-S',
    name: 'Red Shirt - Small',
    attributes: { size: 'S', color: 'red' },
    stock: 50,
  },
  {
    product_id: 1,
    sku: 'SHIRT-RED-M',
    name: 'Red Shirt - Medium',
    attributes: { size: 'M', color: 'red' },
    stock: 75,
  },
  {
    product_id: 1,
    sku: 'SHIRT-RED-L',
    name: 'Red Shirt - Large',
    attributes: { size: 'L', color: 'red' },
    stock: 60,
  },
]);

console.log(`Created ${variants.length} variants in batch`);
```

### Update Stock (Atomic)

```typescript
// Set stock to specific quantity
const variant = await variantRepository.updateStock(variantId, productId, 100);
console.log(`Stock updated to: ${variant?.stock}`);
```

### Decrement Stock (Cannot go below 0)

```typescript
// Decrement stock when selling
const variant = await variantRepository.decrementStock(variantId, productId, 3);

if (variant) {
  console.log(`Stock decremented to: ${variant.stock}`);
} else {
  console.log('Failed: Insufficient stock or variant not found');
}
```

### Increment Stock

```typescript
// Increment stock when restocking
const variant = await variantRepository.incrementStock(variantId, productId, 25);
console.log(`Stock incremented to: ${variant?.stock}`);
```

### Update Variant

```typescript
const updated = await variantRepository.update(variantId, productId, {
  name: 'Red Shirt - Small (Updated)',
  price_adjustment: 5.00,
  stock: 45,
});

if (updated) {
  console.log(`Updated: ${updated.name}`);
}
```

### Soft Delete

```typescript
const deleted = await variantRepository.softDelete(variantId, productId);
console.log(`Deleted at: ${deleted?.deleted_at}`);
```

## Data Types

```typescript
export interface ProductVariant {
  id: string;
  product_id: number;
  sku: string;
  name: string;
  attributes?: Record<string, any>;
  price_adjustment: number;
  stock: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

export interface CreateProductVariantData {
  product_id: number;
  sku: string;
  name: string;
  attributes?: Record<string, any>;
  price_adjustment?: number;
  stock?: number;
}

export interface UpdateProductVariantData {
  sku?: string;
  name?: string;
  attributes?: Record<string, any>;
  price_adjustment?: number;
  stock?: number;
}
```

## Testing

### Run Tests

```bash
# Run unit tests (33 tests)
npm test -- ProductVariantRepository.test.ts

# Run all tests
npm test

# Run with coverage
npm test -- --coverage ProductVariantRepository
```

### Test Coverage

The repository has **100% coverage** with comprehensive tests for:
- ✅ CRUD operations
- ✅ Atomic stock management (update, increment, decrement)
- ✅ Batch create (up to 25 items)
- ✅ SKU lookup via GSI1
- ✅ Soft delete
- ✅ Error handling
- ✅ Edge cases (stock cannot go below 0, batch size limits)

## API Reference

### CRUD Operations

#### `create(data: CreateProductVariantData): Promise<ProductVariant>`
Creates a new product variant with UUID.

#### `findByIdAndProductId(id: string, productId: number): Promise<ProductVariant | null>`
Finds variant by ID and product ID with strongly consistent read.

#### `findByProductId(productId: number): Promise<ProductVariant[]>`
Finds all variants for a product (eventually consistent). Excludes soft-deleted variants.

#### `findBySku(sku: string): Promise<ProductVariant | null>`
Finds variant by SKU using GSI1 (eventually consistent).

#### `update(id: string, productId: number, data: UpdateProductVariantData): Promise<ProductVariant | null>`
Updates variant fields. Cannot update soft-deleted variants.

#### `softDelete(id: string, productId: number): Promise<ProductVariant | null>`
Soft deletes variant by setting `deleted_at` timestamp.

#### `batchCreate(variants: CreateProductVariantData[]): Promise<ProductVariant[]>`
Batch creates up to 25 variants. Throws error if more than 25 variants provided.

### Stock Management Operations

#### `updateStock(id: string, productId: number, quantity: number): Promise<ProductVariant | null>`
Updates stock to a specific quantity atomically. Cannot update soft-deleted variants.

#### `decrementStock(id: string, productId: number, quantity: number): Promise<ProductVariant | null>`
Decrements stock atomically. **Ensures stock cannot go below 0**. Returns null if insufficient stock or variant not found.

#### `incrementStock(id: string, productId: number, quantity: number): Promise<ProductVariant | null>`
Increments stock atomically. Cannot update soft-deleted variants.

## Cost Optimizations

### 1. Hierarchical Storage
Variants are stored as children of products with the same partition key (`PRODUCT#{product_id}`), enabling:
- **Single query** to fetch all variants for a product
- **Lower costs** compared to storing variants as separate items
- **Better data locality** for related items

### 2. Eventually Consistent Reads
Query operations (`findByProductId`, `findBySku`) use eventually consistent reads for **50% cost savings**.

Only `findByIdAndProductId` uses strongly consistent reads for immediate consistency.

### 3. Batch Operations
`batchCreate` allows creating up to 25 variants in a single batch write operation, reducing:
- **API calls** from 25 to 1
- **Write costs** through efficient batching
- **Network latency**

### 4. GSI1 for SKU Lookup
Dedicated GSI allows fast variant lookup by SKU without scanning:
- **Single query** instead of scan
- **Lower costs** and faster response times
- **Scalable** to millions of variants

## Performance Considerations

1. **findByIdAndProductId** - Single item get with consistent read (~0.5 RCU)
2. **findByProductId** - Query on PK with eventually consistent read (~0.25 RCU per item)
3. **findBySku** - Query on GSI1 (~0.25 RCU)
4. **create** - Single item put (~1 WCU)
5. **batchCreate** - Up to 25 items in one batch (~1 WCU per item)
6. **updateStock/incrementStock/decrementStock** - Single atomic update (~1 WCU)
7. **update** - Single item update (~1 WCU)
8. **softDelete** - Single item update (~1 WCU)

## Best Practices

1. **Use batch operations** when creating multiple variants (up to 25)
2. **Use atomic stock operations** to prevent race conditions
3. **Use decrementStock** for sales to ensure stock never goes negative
4. **Use findByProductId** to fetch all variants efficiently
5. **Use findBySku** for fast SKU lookups
6. **Monitor consumed capacity** in production
7. **Use soft delete** instead of hard delete for audit trails
8. **Handle null returns** from stock operations (insufficient stock or deleted variants)

## Acceptance Criteria Met

✅ All variants stored as children of products (`PK: PRODUCT#{product_id}`)
✅ Batch create working (up to 25 items with validation)
✅ Stock updates are atomic (using DynamoDB UpdateCommand)
✅ Cannot decrement stock below 0 (conditional check `stock >= :quantity`)
✅ SKU lookup via GSI1 (`GSI1PK: VARIANT_SKU#{sku}`)
✅ Unit tests covering all methods (33 tests, 100% coverage)

---

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
