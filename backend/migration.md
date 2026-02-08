Perfect! Now I have a complete understanding of your database schema. Let me create a comprehensive implementation prompt for migrating from PostgreSQL to DynamoDB while maintaining 100% feature parity.

---

# **COMPREHENSIVE PROMPT: Migrate Art Management Tool from PostgreSQL to DynamoDB**

## **📋 Project Overview**

Migrate the Art Management Tool backend from PostgreSQL + TypeORM to AWS DynamoDB to leverage AWS Free Tier (25GB storage, 25 WCU/RCU - **permanently free**). The system must maintain **identical API behavior** so the Next.js frontend hosted on AWS Amplify continues to work without any changes.

**Repository:** `NAIM9609/art-management-tool`

---

## **🎯 Objectives**

1. ✅ Replace PostgreSQL database with DynamoDB
2. ✅ Maintain 100% API compatibility (no frontend changes)
3. ✅ Deploy backend as AWS Lambda functions
4. ✅ Keep all existing features working identically
5. ✅ Optimize for AWS Free Tier (stay within limits)
6. ✅ Preserve all current data through migration

---

## **📊 Current Database Schema Analysis**

### **Entities to Migrate (17 tables)**

1. **Products** (`EnhancedProduct`)
   - Fields: id, slug, title, short_description, long_description, base_price, currency, sku, gtin, status, character_id, character_value, etsy_link
   - Relations: OneToMany → ProductImage, ProductVariant; ManyToMany → Category
   - Soft deletes: YES (deleted_at)

2. **Product Variants** (`ProductVariant`)
   - Fields: id, product_id, sku, name, attributes (JSON), price_adjustment, stock
   - Relations: ManyToOne → Product
   - Soft deletes: YES

3. **Product Images** (`ProductImage`)
   - Fields: id, product_id, url, alt_text, position
   - Relations: ManyToOne → Product

4. **Categories** (`Category`)
   - Fields: id, name, slug, description, parent_id
   - Relations: Self-referencing (parent/children), ManyToMany → Product
   - Soft deletes: YES

5. **Orders** (`Order`)
   - Fields: id, order_number, user_id, customer_email, customer_name, subtotal, tax, discount, total, currency, status, payment_status, shipping_address (JSON), billing_address (JSON), tracking_number, notes
   - Relations: OneToMany → OrderItem
   - Soft deletes: YES

6. **Order Items** (`OrderItem`)
   - Fields: id, order_id, product_id, variant_id, product_name, variant_name, sku, quantity, unit_price, total_price
   - Relations: ManyToOne → Order

7. **Carts** (`Cart`)
   - Fields: id, session_id (unique), user_id, discount_code, discount_amount
   - Relations: OneToMany → CartItem
   - TTL: Should expire after 30 days

8. **Cart Items** (`CartItem`)
   - Fields: id, cart_id, product_id, variant_id, quantity, price_at_time
   - Relations: ManyToOne → Cart

9. **Personaggi** (`Personaggio`)
   - Fields: id, name, description, icon, images (JSON array), backgroundColor, backgroundType, gradientFrom, gradientTo, backgroundImage, order
   - Soft deletes: YES

10. **Fumetti** (`Fumetto`)
    - Fields: id, title, description, coverImage, pages (JSON array), order
    - Soft deletes: YES

11. **Discount Codes** (`DiscountCode`)
    - Fields: id, code (unique), type (enum), value, min_order_value, max_uses, times_used, valid_from, valid_until, is_active
    - Soft deletes: YES

12. **Notifications** (`Notification`)
    - Fields: id, type (enum), title, message, metadata (JSON), is_read, read_at
    - TTL: Archive after 90 days

13. **Audit Logs** (`AuditLog`)
    - Fields: id, user_id, action, entity_type, entity_id, changes (JSON), ip_address
    - Append-only, no updates
    - TTL: Keep 1 year

14. **Shopify Links** (`ShopifyLink`)
    - Fields: id, local_product_id, shopify_product_id, shopify_variant_id, sync_status, last_synced_at

15. **Etsy OAuth Tokens** (`EtsyOAuthToken`)
    - Fields: id, shop_id (unique), access_token, refresh_token, token_type, expires_at, scope

16. **Etsy Sync Config** (`EtsySyncConfig`)
    - Fields: id, shop_id, enabled, sync_interval_products, sync_interval_inventory, last_product_sync, last_inventory_sync

17. **Etsy Products** (`EtsyProduct`)
    - Fields: id, local_product_id, etsy_listing_id, etsy_inventory_id, sync_status, last_synced_at

18. **Etsy Receipts** (`EtsyReceipt`)
    - Fields: id, etsy_receipt_id, local_order_id, shop_id, buyer_email, buyer_name, status, is_paid, is_shipped, grand_total, currency, etc.

19. **Etsy Inventory Sync Log** (`EtsyInventorySyncLog`)
    - Fields: id, sync_type, status, items_processed, errors, started_at, completed_at

---

## **🏗️ DynamoDB Table Design Strategy**

### **Single-Table Design** (Recommended for cost optimization)

Use **one DynamoDB table** with strategic partition keys and sort keys to handle all entities. This minimizes costs and maximizes free tier benefits.

#### **Table Name:** `ArtManagementTable`

#### **Primary Key Structure:**
- **PK** (Partition Key): Entity type + ID
- **SK** (Sort Key): Metadata or relationship identifier
- **GSI1PK/GSI1SK**: For secondary access patterns
- **GSI2PK/GSI2SK**: For additional queries
- **GSI3PK/GSI3SK**: For third access pattern

#### **Access Pattern Mapping:**

```typescript
// Product
PK: "PRODUCT#123"
SK: "METADATA"
GSI1PK: "PRODUCT_SLUG#shirt1"
GSI2PK: "PRODUCT_STATUS#published"

// Product Variant (child of Product)
PK: "PRODUCT#123"
SK: "VARIANT#456"
GSI1PK: "VARIANT#456" (for direct access)

// Product Image (child of Product)
PK: "PRODUCT#123"
SK: "IMAGE#789"

// Category
PK: "CATEGORY#10"
SK: "METADATA"
GSI1PK: "CATEGORY_SLUG#apparel"
GSI2PK: "CATEGORY_PARENT#5" (for hierarchical queries)

// Product-Category relationship
PK: "PRODUCT#123"
SK: "CATEGORY#10"
// AND reverse:
PK: "CATEGORY#10"
SK: "PRODUCT#123"

// Order
PK: "ORDER#500"
SK: "METADATA"
GSI1PK: "ORDER_NUMBER#ORD-00000500"
GSI2PK: "ORDER_EMAIL#user@example.com"
GSI3PK: "ORDER_STATUS#pending"

// Order Item (child of Order)
PK: "ORDER#500"
SK: "ITEM#1"

// Cart
PK: "CART#abc123sessiontoken"
SK: "METADATA"
TTL: expires_at (30 days)
GSI1PK: "USER#42" (for user cart lookup)

// Cart Item (child of Cart)
PK: "CART#abc123sessiontoken"
SK: "ITEM#1"

// Personaggio
PK: "PERSONAGGIO#7"
SK: "METADATA"
GSI1PK: "PERSONAGGIO_ORDER#2" (for sorted retrieval)

// Fumetto
PK: "FUMETTO#1"
SK: "METADATA"
GSI1PK: "FUMETTO_ORDER#0"

// Discount Code
PK: "DISCOUNT#15"
SK: "METADATA"
GSI1PK: "DISCOUNT_CODE#SAVE20"
GSI2PK: "DISCOUNT_ACTIVE#true"

// Notification
PK: "NOTIFICATION#100"
SK: "METADATA"
TTL: expires_at (90 days from created_at)
GSI1PK: "NOTIFICATION_READ#false"

// Audit Log
PK: "AUDIT#20250207#random-uuid"
SK: "METADATA"
TTL: expires_at (365 days)
GSI1PK: "AUDIT_ENTITY#PRODUCT#123"

// Etsy OAuth Token
PK: "ETSY_TOKEN#shop12345"
SK: "METADATA"

// Etsy Product
PK: "ETSY_PRODUCT#local123"
SK: "METADATA"
GSI1PK: "ETSY_LISTING#etsy987"

// Etsy Receipt
PK: "ETSY_RECEIPT#receipt456"
SK: "METADATA"
GSI1PK: "ETSY_ORDER#local500"
```

---

## **🔨 Implementation Requirements**

### **Phase 1: Database Layer**

#### **1.1 Create DynamoDB Client Wrapper**

Create `backend/src/database/dynamodb-client.ts`:

```typescript
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, UpdateCommand, DeleteCommand, BatchGetCommand, BatchWriteCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { config } from '../config';

// Initialize DynamoDB client
const client = new DynamoDBClient({
  region: config.aws.region || 'eu-west-1',
  ...(config.aws.endpoint && { endpoint: config.aws.endpoint }) // For local testing with DynamoDB Local
});

export const dynamoDB = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
    convertClassInstanceToMap: true,
  },
  unmarshallOptions: {
    wrapNumbers: false,
  },
});

export const TABLE_NAME = config.dynamodb.tableName || 'ArtManagementTable';

// Helper functions
export class DynamoDBHelper {
  static async get(pk: string, sk: string): Promise<any> {
    const result = await dynamoDB.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: pk, SK: sk },
    }));
    return result.Item;
  }

  static async put(item: Record<string, any>): Promise<void> {
    await dynamoDB.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: item,
    }));
  }

  static async query(params: {
    keyConditionExpression: string;
    expressionAttributeValues: Record<string, any>;
    expressionAttributeNames?: Record<string, string>;
    indexName?: string;
    limit?: number;
    scanIndexForward?: boolean;
  }): Promise<any[]> {
    const result = await dynamoDB.send(new QueryCommand({
      TableName: TABLE_NAME,
      ...params,
    }));
    return result.Items || [];
  }

  static async update(
    pk: string,
    sk: string,
    updateExpression: string,
    expressionAttributeValues: Record<string, any>,
    expressionAttributeNames?: Record<string, string>
  ): Promise<any> {
    const result = await dynamoDB.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: pk, SK: sk },
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ExpressionAttributeNames: expressionAttributeNames,
      ReturnValues: 'ALL_NEW',
    }));
    return result.Attributes;
  }

  static async delete(pk: string, sk: string): Promise<void> {
    await dynamoDB.send(new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { PK: pk, SK: sk },
    }));
  }

  // Soft delete implementation
  static async softDelete(pk: string, sk: string): Promise<any> {
    return this.update(
      pk,
      sk,
      'SET deleted_at = :deleted_at, updated_at = :updated_at',
      {
        ':deleted_at': new Date().toISOString(),
        ':updated_at': new Date().toISOString(),
      }
    );
  }

  // Batch operations
  static async batchGet(keys: Array<{PK: string; SK: string}>): Promise<any[]> {
    if (keys.length === 0) return [];
    
    const result = await dynamoDB.send(new BatchGetCommand({
      RequestItems: {
        [TABLE_NAME]: {
          Keys: keys,
        },
      },
    }));
    return result.Responses?.[TABLE_NAME] || [];
  }

  static async transactWrite(items: any[]): Promise<void> {
    await dynamoDB.send(new TransactWriteCommand({
      TransactItems: items,
    }));
  }
}
```

#### **1.2 Create Repository Pattern for Each Entity**

Create `backend/src/repositories/ProductRepository.ts`:

```typescript
import { DynamoDBHelper } from '../database/dynamodb-client';
import { v4 as uuidv4 } from 'uuid';

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
  status: string;
  character_id?: number;
  character_value?: string;
  etsy_link?: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

export class ProductRepository {
  
  // Create product
  static async create(data: Omit<Product, 'id' | 'created_at' | 'updated_at'>): Promise<Product> {
    const id = await this.getNextId();
    const now = new Date().toISOString();
    
    const product: Product = {
      ...data,
      id,
      created_at: now,
      updated_at: now,
    };

    await DynamoDBHelper.put({
      PK: `PRODUCT#${id}`,
      SK: 'METADATA',
      GSI1PK: `PRODUCT_SLUG#${data.slug}`,
      GSI2PK: `PRODUCT_STATUS#${data.status}`,
      entity_type: 'Product',
      ...product,
    });

    return product;
  }

  // Get by ID
  static async findById(id: number): Promise<Product | null> {
    const item = await DynamoDBHelper.get(`PRODUCT#${id}`, 'METADATA');
    if (!item || item.deleted_at) return null;
    return this.mapToProduct(item);
  }

  // Get by slug
  static async findBySlug(slug: string): Promise<Product | null> {
    const items = await DynamoDBHelper.query({
      indexName: 'GSI1',
      keyConditionExpression: 'GSI1PK = :gsi1pk',
      expressionAttributeValues: {
        ':gsi1pk': `PRODUCT_SLUG#${slug}`,
      },
      limit: 1,
    });

    if (items.length === 0 || items[0].deleted_at) return null;
    return this.mapToProduct(items[0]);
  }

  // Get all products (with pagination)
  static async findAll(filters?: {
    status?: string;
    limit?: number;
    lastEvaluatedKey?: any;
  }): Promise<{ products: Product[]; lastEvaluatedKey?: any }> {
    const params: any = {
      keyConditionExpression: 'GSI2PK = :status',
      expressionAttributeValues: {
        ':status': `PRODUCT_STATUS#${filters?.status || 'published'}`,
      },
      indexName: 'GSI2',
      limit: filters?.limit || 50,
    };

    if (filters?.lastEvaluatedKey) {
      params.ExclusiveStartKey = filters.lastEvaluatedKey;
    }

    const result = await DynamoDBHelper.query(params);
    const products = result.filter(item => !item.deleted_at).map(this.mapToProduct);

    return {
      products,
      lastEvaluatedKey: result.length > 0 ? result[result.length - 1] : undefined,
    };
  }

  // Update product
  static async update(id: number, data: Partial<Product>): Promise<Product> {
    const updates: string[] = [];
    const values: Record<string, any> = {};
    const names: Record<string, string> = {};

    Object.entries(data).forEach(([key, value], index) => {
      const attrName = `#attr${index}`;
      const attrValue = `:val${index}`;
      names[attrName] = key;
      values[attrValue] = value;
      updates.push(`${attrName} = ${attrValue}`);
    });

    values[':updated_at'] = new Date().toISOString();
    updates.push('#updated_at = :updated_at');
    names['#updated_at'] = 'updated_at';

    const result = await DynamoDBHelper.update(
      `PRODUCT#${id}`,
      'METADATA',
      `SET ${updates.join(', ')}`,
      values,
      names
    );

    return this.mapToProduct(result);
  }

  // Soft delete
  static async softDelete(id: number): Promise<void> {
    await DynamoDBHelper.softDelete(`PRODUCT#${id}`, 'METADATA');
  }

  // Helper: Get next ID (simulate auto-increment)
  private static async getNextId(): Promise<number> {
    // Use atomic counter in DynamoDB
    const result = await DynamoDBHelper.update(
      'COUNTER',
      'PRODUCT',
      'SET #counter = if_not_exists(#counter, :start) + :incr',
      {
        ':start': 0,
        ':incr': 1,
      },
      {
        '#counter': 'counter',
      }
    );
    return result.counter;
  }

  // Mapper
  private static mapToProduct(item: any): Product {
    const { PK, SK, GSI1PK, GSI2PK, entity_type, ...product } = item;
    return product as Product;
  }
}
```

**Repeat this pattern for all 19 entities**, creating:
- `ProductVariantRepository.ts`
- `ProductImageRepository.ts`
- `CategoryRepository.ts`
- `OrderRepository.ts`
- `OrderItemRepository.ts`
- `CartRepository.ts`
- `CartItemRepository.ts`
- `PersonaggioRepository.ts`
- `FumettoRepository.ts`
- `DiscountCodeRepository.ts`
- `NotificationRepository.ts`
- `AuditLogRepository.ts`
- `ShopifyLinkRepository.ts`
- `EtsyOAuthTokenRepository.ts`
- `EtsySyncConfigRepository.ts`
- `EtsyProductRepository.ts`
- `EtsyReceiptRepository.ts`
- `EtsyInventorySyncLogRepository.ts`

---

### **Phase 2: Service Layer Refactoring**

#### **2.1 Update Service Classes**

Modify all service classes to use the new repositories instead of TypeORM.

**Example:** `backend/src/services/ProductService.ts`

```typescript
// OLD (TypeORM)
import { Repository } from 'typeorm';
import { AppDataSource } from '../database/connection';
import { EnhancedProduct } from '../entities/EnhancedProduct';

export class ProductService {
  private productRepo: Repository<EnhancedProduct>;

  constructor() {
    this.productRepo = AppDataSource.getRepository(EnhancedProduct);
  }

  async getAllProducts() {
    return this.productRepo.find({ where: { status: 'published' } });
  }
}

// NEW (DynamoDB)
import { ProductRepository } from '../repositories/ProductRepository';
import { ProductImageRepository } from '../repositories/ProductImageRepository';
import { ProductVariantRepository } from '../repositories/ProductVariantRepository';

export class ProductService {
  
  async getAllProducts() {
    const { products } = await ProductRepository.findAll({ status: 'published' });
    
    // Fetch related images and variants
    for (const product of products) {
      product.images = await ProductImageRepository.findByProductId(product.id);
      product.variants = await ProductVariantRepository.findByProductId(product.id);
    }
    
    return products;
  }

  async getProductById(id: number) {
    const product = await ProductRepository.findById(id);
    if (!product) return null;
    
    product.images = await ProductImageRepository.findByProductId(id);
    product.variants = await ProductVariantRepository.findByProductId(id);
    product.categories = await this.getProductCategories(id);
    
    return product;
  }

  private async getProductCategories(productId: number) {
    // Query product-category relationships
    const items = await DynamoDBHelper.query({
      keyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      expressionAttributeValues: {
        ':pk': `PRODUCT#${productId}`,
        ':sk': 'CATEGORY#',
      },
    });
    
    // Fetch full category data
    const categoryIds = items.map(item => item.SK.replace('CATEGORY#', ''));
    const categories = await Promise.all(
      categoryIds.map(id => CategoryRepository.findById(parseInt(id)))
    );
    
    return categories.filter(c => c !== null);
  }
}
```

**Update all service files:**
- `ProductService.ts`
- `OrderService.ts`
- `NotificationService.ts`
- `CartService.ts`
- `PersonaggioService.ts` (if exists)
- `FumettoService.ts` (if exists)
- `EtsyService.ts`

---

### **Phase 3: Lambda Handler**

#### **3.1 Create Lambda Entry Point**

Create `backend/src/lambda.ts`:

```typescript
import 'reflect-metadata';
import serverlessExpress from '@vendia/serverless-express';
import express, { Express } from 'express';
import cookieParser from 'cookie-parser';
import { config } from './config';
import { corsMiddleware } from './middleware/cors';
import { setupRoutes } from './routes';

let cachedServer: any;

async function createServer(): Promise<Express> {
  const app = express();
  
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(corsMiddleware);
  
  setupRoutes(app);
  
  app.use((err: Error, req: any, res: any, next: any) => {
    console.error('Error:', err);
    res.status(500).json({
      error: 'Internal server error',
      message: config.server.environment === 'development' ? err.message : undefined,
    });
  });

  return app;
}

export const handler = async (event: any, context: any) => {
  // Enable connection reuse
  context.callbackWaitsForEmptyEventLoop = false;

  if (!cachedServer) {
    const app = await createServer();
    cachedServer = serverlessExpress({ app });
  }

  return cachedServer(event, context);
};
```

---

### **Phase 4: Infrastructure as Code**

#### **4.1 DynamoDB Table Definition**

Create `infrastructure/dynamodb-table.tf`:

```hcl
resource "aws_dynamodb_table" "art_management" {
  name           = "ArtManagementTable"
  billing_mode   = "PAY_PER_REQUEST"  # On-demand pricing (free tier eligible)
  hash_key       = "PK"
  range_key      = "SK"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  attribute {
    name = "GSI1PK"
    type = "S"
  }

  attribute {
    name = "GSI1SK"
    type = "S"
  }

  attribute {
    name = "GSI2PK"
    type = "S"
  }

  attribute {
    name = "GSI2SK"
    type = "S"
  }

  attribute {
    name = "GSI3PK"
    type = "S"
  }

  attribute {
    name = "GSI3SK"
    type = "S"
  }

  global_secondary_index {
    name            = "GSI1"
    hash_key        = "GSI1PK"
    range_key       = "GSI1SK"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "GSI2"
    hash_key        = "GSI2PK"
    range_key       = "GSI2SK"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "GSI3"
    hash_key        = "GSI3PK"
    range_key       = "GSI3SK"
    projection_type = "ALL"
  }

  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name        = "ArtManagementTable"
    Environment = "production"
  }
}
```

#### **4.2 Lambda Function Definition**

Create `infrastructure/lambda.tf`:

```hcl
resource "aws_lambda_function" "api" {
  filename      = "../backend/dist/lambda.zip"
  function_name = "art-management-api"
  role          = aws_iam_role.lambda_exec.arn
  handler       = "lambda.handler"
  runtime       = "nodejs18.x"
  timeout       = 30
  memory_size   = 512

  environment {
    variables = {
      DYNAMODB_TABLE_NAME = aws_dynamodb_table.art_management.name
      AWS_REGION         = var.aws_region
      ENVIRONMENT        = "production"
      JWT_SECRET         = var.jwt_secret
    }
  }

  depends_on = [aws_iam_role_policy_attachment.lambda_dynamodb]
}

resource "aws_iam_role" "lambda_exec" {
  name = "lambda_exec_role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_dynamodb" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = aws_iam_policy.lambda_dynamodb_policy.arn
}

resource "aws_iam_policy" "lambda_dynamodb_policy" {
  name = "lambda_dynamodb_policy"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:BatchGetItem",
          "dynamodb:BatchWriteItem"
        ]
        Resource = [
          aws_dynamodb_table.art_management.arn,
          "${aws_dynamodb_table.art_management.arn}/index/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      }
    ]
  })
}
```

#### **4.3 API Gateway Definition**

Create `infrastructure/api-gateway.tf`:

```hcl
resource "aws_apigatewayv2_api" "api" {
  name          = "art-management-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins     = ["*"]  # Update with your Amplify domain
    allow_methods     = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"]
    allow_headers     = ["*"]
    expose_headers    = ["*"]
    max_age           = 3600
  }
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id           = aws_apigatewayv2_api.api.id
  integration_type = "AWS_PROXY"
  integration_uri  = aws_lambda_function.api.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "default" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_stage" "prod" {
  api_id      = aws_apigatewayv2_api.api.id
  name        = "prod"
  auto_deploy = true
}

resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}

output "api_endpoint" {
  value = aws_apigatewayv2_stage.prod.invoke_url
}
```

---

### **Phase 5: Data Migration Script**

Create `backend/src/scripts/migrate-to-dynamodb.ts`:

```typescript
import 'reflect-metadata';
import { AppDataSource, initializeDatabase } from '../database/connection';
import { ProductRepository } from '../repositories/ProductRepository';
import { EnhancedProduct } from '../entities/EnhancedProduct';
// Import all other repositories...

async function migrate() {
  console.log('🚀 Starting PostgreSQL → DynamoDB migration...\n');

  // Initialize PostgreSQL connection
  await initializeDatabase();

  // Migrate Products
  console.log('📦 Migrating Products...');
  const productRepo = AppDataSource.getRepository(EnhancedProduct);
  const products = await productRepo.find({ withDeleted: true });
  
  for (const product of products) {
    await ProductRepository.create({
      slug: product.slug,
      title: product.title,
      short_description: product.short_description,
      long_description: product.long_description,
      base_price: product.base_price,
      currency: product.currency,
      sku: product.sku,
      gtin: product.gtin,
      status: product.status,
      character_id: product.character_id,
      character_value: product.character_value,
      etsy_link: product.etsy_link,
    });
    
    // Migrate images
    for (const image of product.images) {
      await ProductImageRepository.create({
        product_id: product.id,
        url: image.url,
        alt_text: image.alt_text,
        position: image.position,
      });
    }
    
    // Migrate variants
    for (const variant of product.variants) {
      await ProductVariantRepository.create({
        product_id: product.id,
        sku: variant.sku,
        name: variant.name,
        attributes: variant.attributes,
        price_adjustment: variant.price_adjustment,
        stock: variant.stock,
      });
    }
  }
  console.log(`✅ Migrated ${products.length} products\n`);

  // Repeat for all other entities...
  // Migrate Orders, Carts, Personaggi, Fumetti, etc.

  console.log('✅ Migration complete!');
  process.exit(0);
}

migrate().catch(error => {
  console.error('❌ Migration failed:', error);
  process.exit(1);
});
```

---

### **Phase 6: Testing & Validation**

#### **6.1 Create Integration Tests**

Create `backend/src/tests/dynamodb.integration.test.ts`:

```typescript
import { ProductRepository } from '../repositories/ProductRepository';
import { OrderRepository } from '../repositories/OrderRepository';

describe('DynamoDB Integration Tests', () => {
  test('Create and retrieve product', async () => {
    const product = await ProductRepository.create({
      slug: 'test-product',
      title: 'Test Product',
      base_price: 25.00,
      currency: 'EUR',
      status: 'published',
    });

    const retrieved = await ProductRepository.findById(product.id);
    expect(retrieved).toEqual(product);
  });

  test('Query products by status', async () => {
    const { products } = await ProductRepository.findAll({ status: 'published' });
    expect(products.length).toBeGreaterThan(0);
    expect(products[0].status).toBe('published');
  });

  test('Soft delete product', async () => {
    const product = await ProductRepository.create({
      slug: 'delete-test',
      title: 'Delete Test',
      base_price: 10.00,
      currency: 'EUR',
      status: 'draft',
    });

    await ProductRepository.softDelete(product.id);
    const retrieved = await ProductRepository.findById(product.id);
    expect(retrieved).toBeNull();
  });

  // Add tests for all critical operations...
});
```

---

### **Phase 7: Deployment**

#### **7.1 Build and Deploy Script**

Create `deploy.sh`:

```bash
#!/bin/bash

echo "🏗️  Building backend..."
cd backend
npm install
npm run build

echo "📦 Creating Lambda deployment package..."
cd dist
zip -r lambda.zip .
mv lambda.zip ../lambda.zip
cd ..

echo "🚀 Deploying infrastructure..."
cd ../infrastructure
terraform init
terraform apply -auto-approve

echo "🌐 Getting API endpoint..."
API_ENDPOINT=$(terraform output -raw api_endpoint)

echo "✅ Deployment complete!"
echo "📍 API Endpoint: $API_ENDPOINT"
echo ""
echo "Update your Amplify environment variable:"
echo "NEXT_PUBLIC_API_URL=$API_ENDPOINT"
```

#### **7.2 Update Amplify Environment**

In AWS Amplify console:
1. Go to your app → Environment variables
2. Update `NEXT_PUBLIC_API_URL` to your new API Gateway endpoint
3. Redeploy frontend

---

## **📋 Implementation Checklist**

### **Database Layer**
- [ ] Create `dynamodb-client.ts` with DynamoDBHelper
- [ ] Create 19 repository files (one per entity)
- [ ] Implement all CRUD operations with proper GSI queries
- [ ] Add soft delete support
- [ ] Add TTL support for Carts, Notifications, Audit Logs
- [ ] Implement atomic counter for ID generation

### **Service Layer**
- [ ] Refactor `ProductService.ts`
- [ ] Refactor `OrderService.ts`
- [ ] Refactor `NotificationService.ts`
- [ ] Refactor `CartService.ts`
- [ ] Refactor `EtsyService.ts`
- [ ] Update all other service files

### **API Layer**
- [ ] Verify all route handlers still work
- [ ] Test all endpoints manually
- [ ] Ensure error handling is preserved

### **Lambda**
- [ ] Create `lambda.ts` handler
- [ ] Configure serverless-express
- [ ] Add environment variable handling
- [ ] Test locally with sam local or serverless-offline

### **Infrastructure**
- [ ] Create `dynamodb-table.tf`
- [ ] Create `lambda.tf`
- [ ] Create `api-gateway.tf`
- [ ] Configure IAM roles and policies
- [ ] Set up CloudWatch logging

### **Migration**
- [ ] Create migration script
- [ ] Test migration on sample data
- [ ] Run full migration
- [ ] Verify data integrity
- [ ] Create rollback plan

### **Testing**
- [ ] Write unit tests for repositories
- [ ] Write integration tests for services
- [ ] Test all API endpoints
- [ ] Load test with Artillery or k6
- [ ] Verify frontend still works

### **Deployment**
- [ ] Deploy DynamoDB table
- [ ] Deploy Lambda function
- [ ] Deploy API Gateway
- [ ] Update Amplify environment variables
- [ ] Monitor CloudWatch logs
- [ ] Verify production functionality

---

## **🎁 Expected Benefits**

1. **Cost**: $0/month (within Free Tier limits)
2. **Scalability**: Auto-scaling with DynamoDB
3. **Performance**: Single-digit millisecond latency
4. **Maintenance**: Zero database management overhead
5. **Reliability**: 99.99% SLA from AWS

---

## **⚠️ Important Considerations**

### **Free Tier Limits (Monitor These)**
- DynamoDB: 25 GB storage, 25 WCU/RCU
- Lambda: 1M requests/month, 400,000 GB-seconds compute
- API Gateway: 1M calls/month (first 12 months)
- CloudWatch: 5 GB logs/month

### **Monitoring Setup**
- Create CloudWatch alarms for:
  - DynamoDB consumed capacity
  - Lambda invocation count
  - Lambda errors
  - API Gateway 4xx/5xx errors

### **Backup Strategy**
- Enable Point-in-Time Recovery on DynamoDB
- Set up daily exports to S3 (optional)
- Keep PostgreSQL backup for 30 days post-migration

---

## **🚀 Final Execution Command**

Once all code is ready, execute in this order:

```bash
# 1. Run migration locally (test first!)
npm run migrate:test

# 2. Deploy infrastructure
cd infrastructure
terraform apply

# 3. Run production migration
npm run migrate:production

# 4. Deploy Lambda
cd backend
npm run deploy

# 5. Update Amplify
# (Manual step in AWS Console)

# 6. Verify
curl $API_ENDPOINT/health
```

---

**This implementation maintains 100% API compatibility, ensuring your Next.js frontend on Amplify continues to work without any code changes.**