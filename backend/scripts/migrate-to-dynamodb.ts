/**
 * migrate-to-dynamodb.ts
 *
 * Migrates all data from PostgreSQL (via TypeORM) to DynamoDB.
 *
 * Migration order (respects foreign-key dependencies):
 *   1.  Categories
 *   2.  Products
 *   3.  ProductVariants
 *   4.  ProductImages
 *   5.  Product-Category links
 *   6.  Personaggi
 *   7.  Fumetti
 *   8.  DiscountCodes
 *   9.  Carts
 *   10. CartItems
 *   11. Orders
 *   12. OrderItems
 *   13. Notifications
 *   14. AuditLogs
 *   15. Etsy data  (tokens, products, receipts, sync-config)
 *
 * Note: EtsyInventorySyncLog and ShopifyLink have no DynamoDB repository
 * counterparts and remain in PostgreSQL only.
 *
 * Usage:
 *   npx ts-node scripts/migrate-to-dynamodb.ts
 *
 * Environment variables (required unless connecting to a local endpoint):
 *   DYNAMODB_TABLE_NAME        – DynamoDB table to write to (required)
 *   DATABASE_HOST / DATABASE_PORT / DATABASE_USER / DATABASE_PASSWORD / DATABASE_NAME
 *   AWS_REGION_CUSTOM / AWS_ENDPOINT_URL (for LocalStack)
 */

import 'reflect-metadata';
import crypto from 'crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

// ── TypeORM entities ──────────────────────────────────────────────────────────
import { Category }               from '../src/entities/Category';
import { EnhancedProduct }        from '../src/entities/EnhancedProduct';
import { ProductVariant }         from '../src/entities/ProductVariant';
import { ProductImage }           from '../src/entities/ProductImage';
import { Personaggio }            from '../src/entities/Personaggio';
import { Fumetto }                from '../src/entities/Fumetto';
import { DiscountCode }           from '../src/entities/DiscountCode';
import { Cart }                   from '../src/entities/Cart';
import { CartItem }               from '../src/entities/CartItem';
import { Order, PaymentStatus, FulfillmentStatus } from '../src/entities/Order';
import { OrderItem }              from '../src/entities/OrderItem';
import { Notification }           from '../src/entities/Notification';
import { AuditLog }               from '../src/entities/AuditLog';
import { EtsyOAuthToken }         from '../src/entities/EtsyOAuthToken';
import { EtsyProduct }            from '../src/entities/EtsyProduct';
import { EtsyReceipt }            from '../src/entities/EtsyReceipt';
import { EtsySyncConfig }         from '../src/entities/EtsySyncConfig';
// Imported only for the DataSource entities list; not migrated to DynamoDB:
import { EtsyInventorySyncLog }   from '../src/entities/EtsyInventorySyncLog';
import { ShopifyLink }            from '../src/entities/ShopifyLink';

// ── Helpers ───────────────────────────────────────────────────────────────────

const DYNAMO_BATCH_SIZE = 25; // DynamoDB BatchWrite limit

/** Sleep for `ms` milliseconds (used for throttle back-off). */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Convert a Date | undefined to an ISO string, or return undefined. */
function toISO(d: Date | undefined | null): string | undefined {
  return d ? d.toISOString() : undefined;
}

/** Convert a Date to an ISO string (non-nullable version). */
function toISORequired(d: Date): string {
  return d.toISOString();
}

/** Convert a decimal/string number column from TypeORM to a JS number. */
function toNumber(v: any): number {
  return typeof v === 'string' ? parseFloat(v) : Number(v);
}

/** TTL: 30 days from a given Date (or now if undefined), as a Unix timestamp (seconds). */
function cartTTL(from?: Date): number {
  const base = from ? from.getTime() : Date.now();
  return Math.floor(base / 1000) + 30 * 24 * 60 * 60;
}

/** TTL: `days` days from the given ISO string, as a Unix timestamp. */
function ttlFromISO(iso: string, days: number): number {
  const base = new Date(iso).getTime();
  return Math.floor(base / 1000) + days * 24 * 60 * 60;
}

/**
 * Map PostgreSQL payment_status + fulfillment_status to a DynamoDB OrderStatus value.
 *
 * DynamoDB OrderStatus: pending | processing | shipped | delivered | cancelled | refunded
 * PostgreSQL PaymentStatus: pending | paid | failed | refunded
 * PostgreSQL FulfillmentStatus: unfulfilled | fulfilled | partially_fulfilled
 */
function mapOrderStatus(
  paymentStatus: string | undefined,
  fulfillmentStatus: string | undefined,
): string {
  if (paymentStatus === PaymentStatus.REFUNDED)  return 'refunded';
  if (paymentStatus === PaymentStatus.FAILED)    return 'cancelled';
  if (paymentStatus === PaymentStatus.PAID) {
    if (fulfillmentStatus === FulfillmentStatus.FULFILLED) return 'delivered';
    return 'processing'; // unfulfilled or partially_fulfilled
  }
  return 'pending'; // PaymentStatus.PENDING or unknown
}

/**
 * Generate deterministic CartItem ID matching CartItemRepository.generateItemId().
 * Uses SHA-256 hash of `${cartId}:${productId}:${variantId ?? 'null'}`.
 */
function generateCartItemId(
  cartId: string,
  productId: number,
  variantId: string | undefined,
): string {
  const key = `${cartId}:${productId}:${variantId ?? 'null'}`;
  return crypto.createHash('sha256').update(key).digest('hex').substring(0, 32);
}

/**
 * Extract the S3 key from a URL (strips the hostname so only the path/key remains).
 * If the value is already a relative key, returns it unchanged.
 */
function extractS3Key(url: string): string {
  if (!url) return url;
  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      const parsed = new URL(url);
      return parsed.pathname.startsWith('/') ? parsed.pathname.substring(1) : parsed.pathname;
    } catch {
      return url;
    }
  }
  return url;
}

// ── DynamoDB client ───────────────────────────────────────────────────────────

function buildDynamoClient(): DynamoDBDocumentClient {
  const clientConfig: Record<string, any> = {
    region: process.env.AWS_REGION_CUSTOM || 'us-east-1',
  };
  if (process.env.AWS_ENDPOINT_URL) {
    clientConfig.endpoint = process.env.AWS_ENDPOINT_URL;
    clientConfig.credentials = {
      accessKeyId:     process.env.AWS_ACCESS_KEY_ID     || 'test',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
    };
  }
  const raw = new DynamoDBClient(clientConfig);
  return DynamoDBDocumentClient.from(raw, {
    marshallOptions: {
      removeUndefinedValues: true,
      convertEmptyValues:    false,
    },
  });
}

// ── Batch-write helper ────────────────────────────────────────────────────────

/**
 * Write items to DynamoDB in batches of 25, with exponential back-off on
 * provisioned-throughput errors.
 */
async function batchWrite(
  dynamo:    DynamoDBDocumentClient,
  tableName: string,
  items:     Record<string, any>[],
  label:     string,
): Promise<void> {
  if (items.length === 0) {
    console.log(`  [${label}] No items to write`);
    return;
  }

  let written = 0;
  for (let i = 0; i < items.length; i += DYNAMO_BATCH_SIZE) {
    const batch = items.slice(i, i + DYNAMO_BATCH_SIZE);
    const requests = batch.map(item => ({ PutRequest: { Item: item } }));

    let unprocessed: typeof requests = requests;
    let attempt = 0;

    while (unprocessed.length > 0) {
      try {
        const response = await dynamo.send(
          new BatchWriteCommand({ RequestItems: { [tableName]: unprocessed } }),
        );

        const remaining = response.UnprocessedItems?.[tableName];
        unprocessed = remaining && remaining.length > 0 ? (remaining as typeof requests) : [];

        if (unprocessed.length > 0) {
          const delay = Math.min(100 * Math.pow(2, attempt), 5000);
          console.log(`  [${label}] ${unprocessed.length} unprocessed – retrying in ${delay} ms`);
          await sleep(delay);
          attempt++;
        }
      } catch (err: any) {
        const retryable = [
          'ProvisionedThroughputExceededException',
          'ThrottlingException',
          'RequestLimitExceeded',
        ];
        if (retryable.includes(err.name) && attempt < 6) {
          const delay = Math.min(200 * Math.pow(2, attempt), 10000);
          console.log(`  [${label}] Throttled – retrying in ${delay} ms (attempt ${attempt + 1})`);
          await sleep(delay);
          attempt++;
        } else {
          throw err;
        }
      }
    }

    written += batch.length;
    console.log(`  [${label}] ${written}/${items.length} written`);
  }
}

// ── Transform functions (PostgreSQL entity → DynamoDB item) ───────────────────

function transformCategory(row: Category): Record<string, any> {
  const item: Record<string, any> = {
    PK:       `CATEGORY#${row.id}`,
    SK:       'METADATA',
    id:       row.id,
    name:     row.name,
    slug:     row.slug,
    created_at: toISORequired(row.created_at),
    updated_at: toISORequired(row.updated_at),
    // GSI1 – look up by slug
    GSI1PK: `CATEGORY_SLUG#${row.slug}`,
    GSI1SK: toISORequired(row.created_at),
    // GSI2 – look up by parent
    GSI2PK: `CATEGORY_PARENT#${row.parent_id ?? 'ROOT'}`,
    GSI2SK: `${row.name}#${row.id}`,
  };

  if (row.description) item.description = row.description;
  if (row.parent_id)   item.parent_id   = row.parent_id;
  if (row.deleted_at)  item.deleted_at  = toISO(row.deleted_at);

  return item;
}

function transformProduct(row: EnhancedProduct): Record<string, any> {
  const createdAt = toISORequired(row.created_at);
  const item: Record<string, any> = {
    PK:         `PRODUCT#${row.id}`,
    SK:         'METADATA',
    id:         row.id,
    slug:       row.slug,
    title:      row.title,
    base_price: toNumber(row.base_price),
    currency:   row.currency,
    status:     row.status,
    created_at: createdAt,
    updated_at: toISORequired(row.updated_at),
    // GSI1 – by slug
    GSI1PK: `PRODUCT_SLUG#${row.slug}`,
    GSI1SK: createdAt,
    // GSI2 – by status
    GSI2PK: `PRODUCT_STATUS#${row.status}`,
    GSI2SK: `${row.title}#${row.id}`,
  };

  if (row.short_description)  item.short_description  = row.short_description;
  if (row.long_description)   item.long_description   = row.long_description;
  if (row.sku)                item.sku                = row.sku;
  if (row.gtin)               item.gtin               = row.gtin;
  if (row.character_value)    item.character_value    = row.character_value;
  if (row.etsy_link)          item.etsy_link          = row.etsy_link;
  if (row.deleted_at)         item.deleted_at         = toISO(row.deleted_at);

  if (row.character_id != null) {
    item.character_id = row.character_id;
    item.GSI3PK       = `CHARACTER#${row.character_id}`;
    item.GSI3SK       = createdAt;
  }

  return item;
}

/**
 * Transform a ProductVariant row to its DynamoDB item.
 * Returns the new DynamoDB UUID id so the caller can build a legacy-id map.
 *
 * DynamoDB schema (matches ProductVariantRepository):
 *   PK: "PRODUCT#${product_id}"
 *   SK: "VARIANT#${uuid}"
 *   entity_type: "ProductVariant"
 *   GSI1PK: "VARIANT_SKU#${sku}"
 *   GSI1SK: "${product_id}"
 */
function transformProductVariant(
  row: ProductVariant,
): { item: Record<string, any>; dynamoId: string } {
  const dynamoId  = uuidv4();
  const createdAt = toISORequired(row.created_at);
  const updatedAt = toISORequired(row.updated_at);

  const item: Record<string, any> = {
    PK:               `PRODUCT#${row.product_id}`,
    SK:               `VARIANT#${dynamoId}`,
    entity_type:      'ProductVariant',
    id:               dynamoId,
    legacy_id:        row.id, // preserve original integer id
    product_id:       row.product_id,
    sku:              row.sku,
    name:             row.name,
    price_adjustment: toNumber(row.price_adjustment),
    stock:            row.stock,
    created_at:       createdAt,
    updated_at:       updatedAt,
    // GSI1 – lookup by SKU
    GSI1PK: `VARIANT_SKU#${row.sku}`,
    GSI1SK: `${row.product_id}`,
  };

  if (row.attributes) item.attributes = row.attributes;
  if (row.deleted_at) item.deleted_at = toISO(row.deleted_at);

  return { item, dynamoId };
}

/**
 * Transform a ProductImage row to main image item + pointer item.
 * Returns two DynamoDB items matching ProductImageRepository's schema:
 *   • Main: PK="PRODUCT#<id>" SK="IMAGE#<padded_position>"
 *   • Pointer: PK="PRODUCT#<id>" SK="IMAGE_ID#<uuid>"
 */
function transformProductImage(row: ProductImage): Record<string, any>[] {
  const imageId     = uuidv4();
  const paddedPos   = String(row.position).padStart(10, '0');
  const s3Key       = extractS3Key(row.url);
  const createdAt   = toISORequired(row.created_at);

  const mainItem: Record<string, any> = {
    PK:          `PRODUCT#${row.product_id}`,
    SK:          `IMAGE#${paddedPos}`,
    entity_type: 'ProductImage',
    id:          imageId,
    legacy_id:   row.id,
    product_id:  row.product_id,
    url:         s3Key,
    position:    row.position,
    created_at:  createdAt,
    // ProductImage entity has no updated_at column; use created_at as the initial value.
    updated_at:  createdAt,
  };
  if (row.alt_text) mainItem.alt_text = row.alt_text;

  const pointerItem: Record<string, any> = {
    PK:              `PRODUCT#${row.product_id}`,
    SK:              `IMAGE_ID#${imageId}`,
    entity_type:     'ProductImagePointer',
    position:        row.position,
    image_sort_key:  `IMAGE#${paddedPos}`,
  };

  return [mainItem, pointerItem];
}

/** Product-Category many-to-many link items (bidirectional). */
function transformProductCategoryLinks(
  product:    EnhancedProduct,
  categories: Category[],
): Record<string, any>[] {
  const items: Record<string, any>[] = [];
  const now = new Date().toISOString();

  for (const cat of categories) {
    // Product side
    items.push({
      PK:          `PRODUCT#${product.id}`,
      SK:          `CATEGORY#${cat.id}`,
      product_id:  product.id,
      category_id: cat.id,
      created_at:  now,
    });
    // Category side
    items.push({
      PK:          `CATEGORY#${cat.id}`,
      SK:          `PRODUCT#${product.id}`,
      product_id:  product.id,
      category_id: cat.id,
      created_at:  now,
    });
  }

  return items;
}

function transformPersonaggio(row: Personaggio): Record<string, any> {
  const item: Record<string, any> = {
    PK:         `PERSONAGGIO#${row.id}`,
    SK:         'METADATA',
    id:         row.id,
    name:       row.name,
    images:     JSON.stringify(row.images ?? []),
    order:      row.order,
    created_at: toISORequired(row.createdAt),
    updated_at: toISORequired(row.updatedAt),
    // GSI1 – by order (zero-padded for lexicographic sort)
    GSI1PK: `PERSONAGGIO_ORDER#${row.order.toString().padStart(10, '0')}`,
    GSI1SK: `${row.id}`,
  };

  if (row.description)      item.description      = row.description;
  if (row.icon)             item.icon             = row.icon;
  if (row.backgroundColor)  item.backgroundColor  = row.backgroundColor;
  if (row.backgroundType)   item.backgroundType   = row.backgroundType;
  if (row.gradientFrom)     item.gradientFrom     = row.gradientFrom;
  if (row.gradientTo)       item.gradientTo       = row.gradientTo;
  if (row.backgroundImage)  item.backgroundImage  = row.backgroundImage;
  if (row.deletedAt)        item.deleted_at       = toISO(row.deletedAt);

  return item;
}

function transformFumetto(row: Fumetto): Record<string, any> {
  const item: Record<string, any> = {
    PK:         `FUMETTO#${row.id}`,
    SK:         'METADATA',
    id:         row.id,
    title:      row.title,
    order:      row.order,
    pages:      row.pages ?? [],
    created_at: toISORequired(row.createdAt),
    updated_at: toISORequired(row.updatedAt),
    // GSI1 – all fumetti ordered by `order`
    GSI1PK: 'FUMETTO_ORDER',
    GSI1SK: `${String(row.order).padStart(10, '0')}#${row.id}`,
  };

  if (row.description)  item.description  = row.description;
  if (row.coverImage)   item.coverImage   = row.coverImage;
  if (row.deletedAt)    item.deleted_at   = toISO(row.deletedAt);

  return item;
}

function transformDiscountCode(row: DiscountCode): Record<string, any> {
  const item: Record<string, any> = {
    PK:             `DISCOUNT#${row.id}`,
    SK:             'METADATA',
    id:             row.id,
    code:           row.code,
    discount_type:  row.type,
    discount_value: toNumber(row.value),
    times_used:     row.times_used,
    is_active:      row.is_active,
    created_at:     toISORequired(row.created_at),
    updated_at:     toISORequired(row.updated_at),
    // GSI1 – look up by code
    GSI1PK: `DISCOUNT_CODE#${row.code}`,
    // GSI2 – active discounts
    GSI2PK: `DISCOUNT_ACTIVE#${row.is_active}`,
    GSI2SK: row.valid_until ? toISO(row.valid_until)! : '9999-12-31',
  };

  if (row.min_order_value != null)  item.min_purchase_amount = toNumber(row.min_order_value);
  if (row.max_uses != null)         item.max_uses            = row.max_uses;
  if (row.valid_from)               item.valid_from          = toISO(row.valid_from);
  if (row.valid_until)              item.valid_until         = toISO(row.valid_until);
  if (row.deleted_at)               item.deleted_at          = toISO(row.deleted_at);

  return item;
}

function transformCart(row: Cart): Record<string, any> {
  const id        = uuidv4(); // DynamoDB carts use UUID; preserve original as legacy_id
  const createdAt = toISORequired(row.created_at);
  const updatedAt = toISORequired(row.updated_at);
  const item: Record<string, any> = {
    PK:         `CART#${id}`,
    SK:         'METADATA',
    id,
    // Preserve the original PostgreSQL integer ID for cross-reference
    legacy_id:  row.id,
    session_id: row.session_id,
    created_at: createdAt,
    updated_at: updatedAt,
    // TTL: 30 days from the original cart creation time
    expires_at: cartTTL(row.created_at),
    // GSI1 – by session
    GSI1PK: `CART_SESSION#${row.session_id}`,
  };

  if (row.user_id != null) {
    item.user_id = row.user_id;
    item.GSI2PK  = `CART_USER#${row.user_id}`;
  }
  if (row.discount_code)   item.discount_code   = row.discount_code;
  if (row.discount_amount) item.discount_amount = toNumber(row.discount_amount);

  return item;
}

function transformCartItem(
  row:           CartItem,
  dynamoCartId:  string,
  variantIdMap:  Map<number, string>,
): Record<string, any> {
  // Resolve variant UUID from the migration map; log a warning for orphaned references.
  let variantId: string | undefined;
  if (row.variant_id != null) {
    const mappedId = variantIdMap.get(row.variant_id);
    if (!mappedId) {
      console.warn(
        `  [CartItem] variant_id ${row.variant_id} (cart item ${row.id}) not found in variant migration map – falling back to string id`,
      );
    }
    variantId = mappedId ?? String(row.variant_id);
  }

  // Use the same deterministic ID strategy as CartItemRepository.generateItemId()
  // so that future addItem() calls can upsert rather than create duplicates.
  const id = generateCartItemId(dynamoCartId, row.product_id, variantId);

  return {
    PK:         `CART#${dynamoCartId}`,
    SK:         `ITEM#${id}`,
    id,
    legacy_id:  row.id,
    cart_id:    dynamoCartId,
    product_id: row.product_id,
    variant_id: variantId,
    quantity:   row.quantity,
    created_at: toISORequired(row.created_at),
    updated_at: toISORequired(row.updated_at),
  };
}

function transformOrder(row: Order): Record<string, any> {
  const id      = uuidv4();
  const createdAt = toISORequired(row.created_at);

  // Map PG payment_status + fulfillment_status → DynamoDB OrderStatus
  const dynStatus = mapOrderStatus(row.payment_status, row.fulfillment_status);

  const item: Record<string, any> = {
    PK:          `ORDER#${id}`,
    SK:          'METADATA',
    id,
    legacy_id:   row.id,
    order_number: row.order_number,
    customer_email: row.customer_email,
    customer_name:  row.customer_name,
    subtotal: toNumber(row.subtotal),
    tax:      toNumber(row.tax),
    discount: toNumber(row.discount),
    total:    toNumber(row.total),
    currency: row.currency,
    status:             dynStatus,
    payment_status:     row.payment_status,
    fulfillment_status: row.fulfillment_status,
    created_at: createdAt,
    updated_at: toISORequired(row.updated_at),
    // GSIs
    GSI1PK: `ORDER_NUMBER#${row.order_number}`,
    GSI2PK: `ORDER_EMAIL#${row.customer_email}`,
    GSI2SK: createdAt,
    GSI3PK: `ORDER_STATUS#${dynStatus}`,
    GSI3SK: createdAt,
  };

  if (row.user_id != null)          item.user_id            = row.user_id;
  if (row.payment_intent_id)        item.payment_intent_id  = row.payment_intent_id;
  if (row.payment_method)           item.payment_method     = row.payment_method;
  if (row.shipping_address)         item.shipping_address   = row.shipping_address;
  if (row.billing_address)          item.billing_address    = row.billing_address;
  if (row.notes)                    item.notes              = row.notes;
  if (row.deleted_at)               item.deleted_at         = toISO(row.deleted_at);

  return item;
}

function transformOrderItem(
  row:           OrderItem,
  dynamoOrderId: string,
  variantIdMap:  Map<number, string>,
): Record<string, any> {
  const id = uuidv4();
  // Resolve variant UUID from the migration map; log a warning for orphaned references.
  let variantId: string | undefined;
  if (row.variant_id != null) {
    const mappedId = variantIdMap.get(row.variant_id);
    if (!mappedId) {
      console.warn(
        `  [OrderItem] variant_id ${row.variant_id} (order item ${row.id}) not found in variant migration map – falling back to string id`,
      );
    }
    variantId = mappedId ?? String(row.variant_id);
  }

  return {
    PK:           `ORDER#${dynamoOrderId}`,
    SK:           `ITEM#${id}`,
    entity_type:  'OrderItem',
    id,
    legacy_id:    row.id,
    order_id:     dynamoOrderId,
    product_id:   row.product_id,
    variant_id:   variantId,
    product_name: row.product_name,
    variant_name: row.variant_name,
    sku:          row.sku,
    quantity:     row.quantity,
    unit_price:   toNumber(row.unit_price),
    total_price:  toNumber(row.total_price),
    created_at:   toISORequired(row.created_at),
  };
}

function transformNotification(row: Notification): Record<string, any> {
  const id        = uuidv4();
  const createdAt = toISORequired(row.created_at);
  return {
    PK:         `NOTIFICATION#${id}`,
    SK:         'METADATA',
    id,
    legacy_id:  row.id,
    type:       row.type,
    title:      row.title,
    message:    row.message,
    metadata:   row.metadata,
    is_read:    row.is_read,
    read_at:    row.read_at ? toISO(row.read_at) : undefined,
    created_at: createdAt,
    updated_at: toISORequired(row.updated_at),
    expires_at: ttlFromISO(createdAt, 90),
    // GSI1 – unread/read notifications
    GSI1PK: `NOTIFICATION_READ#${row.is_read}`,
    GSI1SK: createdAt,
  };
}

function transformAuditLog(row: AuditLog): Record<string, any> {
  const id        = uuidv4();
  const createdAt = toISORequired(row.created_at);
  const datePart  = createdAt.slice(0, 10); // YYYY-MM-DD
  return {
    PK:          `AUDIT#${datePart}#${id}`,
    SK:          'METADATA',
    id,
    legacy_id:   row.id,
    entity_type: row.entity_type,
    entity_id:   row.entity_id != null ? String(row.entity_id) : '',
    user_id:     row.user_id   != null ? String(row.user_id)   : '',
    action:      row.action,
    changes:     row.changes,
    ip_address:  row.ip_address,
    created_at:  createdAt,
    expires_at:  ttlFromISO(createdAt, 365),
    // GSI1 – by entity
    GSI1PK: `AUDIT_ENTITY#${row.entity_type}#${row.entity_id ?? ''}`,
    GSI1SK: createdAt,
    // GSI2 – by user
    GSI2PK: `AUDIT_USER#${row.user_id ?? ''}`,
    GSI2SK: createdAt,
  };
}

function transformEtsyOAuthToken(row: EtsyOAuthToken): Record<string, any> {
  const item: Record<string, any> = {
    PK:            `ETSY_TOKEN#${row.shop_id}`,
    SK:            'METADATA',
    shop_id:       row.shop_id,
    access_token:  row.access_token,
    refresh_token: row.refresh_token,
    token_type:    row.token_type,
    expires_at:    toISORequired(row.expires_at),
    created_at:    toISORequired(row.created_at),
    updated_at:    toISORequired(row.updated_at),
  };

  if (row.scope) item.scope = row.scope;

  return item;
}

/**
 * Transform EtsyProduct to DynamoDB item matching EtsyProductRepository schema:
 *   PK: "ETSY_PRODUCT#${local_product_id}"
 *   SK: "METADATA"
 *   GSI1PK: "ETSY_LISTING#${etsy_listing_id}"
 *   GSI1SK: "METADATA"
 */
function transformEtsyProduct(row: EtsyProduct): Record<string, any> {
  const localId = row.local_product_id ?? row.id;
  const item: Record<string, any> = {
    PK:              `ETSY_PRODUCT#${localId}`,
    SK:              'METADATA',
    local_product_id: localId,
    etsy_listing_id: row.etsy_listing_id,
    title:           row.title,
    quantity:        row.quantity,
    sync_status:     row.sync_status,
    created_at:      toISORequired(row.created_at),
    updated_at:      toISORequired(row.updated_at),
    // GSI1 – lookup by Etsy listing ID
    GSI1PK: `ETSY_LISTING#${row.etsy_listing_id}`,
    GSI1SK: 'METADATA',
  };

  if (row.description)    item.description    = row.description;
  if (row.price != null)  item.price          = toNumber(row.price);
  if (row.sku)            item.sku            = row.sku;
  if (row.state)          item.state          = row.state;
  if (row.url)            item.url            = row.url;
  if (row.last_synced_at) item.last_synced_at = toISO(row.last_synced_at);
  if (row.deleted_at)     item.deleted_at     = toISO(row.deleted_at);

  return item;
}

/**
 * Transform EtsyReceipt to DynamoDB item matching EtsyReceiptRepository schema.
 * Populates sparse GSI1 (ETSY_ORDER#<local_order_id>) when local_order_id is present.
 */
function transformEtsyReceipt(row: EtsyReceipt): Record<string, any> {
  const item: Record<string, any> = {
    PK:              `ETSY_RECEIPT#${row.etsy_receipt_id}`,
    SK:              'METADATA',
    etsy_receipt_id: row.etsy_receipt_id,
    shop_id:         row.shop_id,
    is_paid:         row.is_paid,
    is_shipped:      row.is_shipped,
    etsy_created_at: toISORequired(row.etsy_created_at),
    etsy_updated_at: toISORequired(row.etsy_updated_at),
    sync_status:     row.sync_status,
    created_at:      toISORequired(row.created_at),
    updated_at:      toISORequired(row.updated_at),
  };

  // Sparse GSI1 – find receipts by local order ID
  if (row.local_order_id != null) {
    item.local_order_id = row.local_order_id;
    item.GSI1PK         = `ETSY_ORDER#${row.local_order_id}`;
    item.GSI1SK         = 'METADATA';
  }

  if (row.buyer_email)                  item.buyer_email        = row.buyer_email;
  if (row.buyer_name)                   item.buyer_name         = row.buyer_name;
  if (row.status)                       item.status             = row.status;
  if (row.grand_total != null)          item.grand_total        = toNumber(row.grand_total);
  if (row.subtotal != null)             item.subtotal           = toNumber(row.subtotal);
  if (row.total_shipping_cost != null)  item.total_shipping_cost = toNumber(row.total_shipping_cost);
  if (row.total_tax_cost != null)       item.total_tax_cost     = toNumber(row.total_tax_cost);
  if (row.currency)                     item.currency           = row.currency;
  if (row.payment_method)               item.payment_method     = row.payment_method;
  if (row.shipping_address)             item.shipping_address   = row.shipping_address;
  if (row.message_from_buyer)           item.message_from_buyer = row.message_from_buyer;
  if (row.last_synced_at)              item.last_synced_at     = toISO(row.last_synced_at);
  if (row.deleted_at)                   item.deleted_at         = toISO(row.deleted_at);

  return item;
}

function transformEtsySyncConfig(row: EtsySyncConfig): Record<string, any> {
  const item: Record<string, any> = {
    PK:                   `ETSY_SYNC_CONFIG#${row.shop_id}`,
    SK:                   'METADATA',
    shop_id:              row.shop_id,
    sync_status:          row.sync_status,
    rate_limit_remaining: row.rate_limit_remaining,
    created_at:           toISORequired(row.created_at),
    updated_at:           toISORequired(row.updated_at),
  };

  if (row.last_product_sync)   item.last_product_sync   = toISO(row.last_product_sync);
  if (row.last_inventory_sync) item.last_inventory_sync = toISO(row.last_inventory_sync);
  if (row.sync_error)          item.sync_error          = row.sync_error;
  if (row.rate_limit_reset_at) item.rate_limit_reset_at = toISO(row.rate_limit_reset_at);

  return item;
}

// ── Counter seed helper ───────────────────────────────────────────────────────

/**
 * Seed an atomic DynamoDB counter so that newly created items don't clash with
 * migrated ones.  The counter is set to the maximum migrated ID value only if
 * the current counter value is lower (or doesn't exist yet), making this
 * operation safe to call on repeated migration runs.
 */
async function seedCounter(
  dynamo:    DynamoDBDocumentClient,
  tableName: string,
  pk:        string,
  sk:        string,
  value:     number,
): Promise<void> {
  if (value <= 0) return;
  const { UpdateCommand } = await import('@aws-sdk/lib-dynamodb');
  try {
    await dynamo.send(
      new UpdateCommand({
        TableName: tableName,
        Key:       { PK: pk, SK: sk },
        // Only set the counter when it doesn't exist yet or is below the target.
        // This keeps the operation idempotent across repeated migration runs.
        UpdateExpression:     'SET #v = :val',
        ConditionExpression:  'attribute_not_exists(#v) OR #v < :val',
        ExpressionAttributeNames:  { '#v': 'value' },
        ExpressionAttributeValues: { ':val': value },
      }),
    );
  } catch (err: any) {
    // ConditionalCheckFailedException means the existing counter is already ≥ value – that's fine.
    if (err.name !== 'ConditionalCheckFailedException') throw err;
  }
}

// ── Main migration ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Require DYNAMODB_TABLE_NAME to be set explicitly to prevent accidentally
  // writing to the wrong table in production.
  const tableName = process.env.DYNAMODB_TABLE_NAME;
  if (!tableName) {
    console.error(
      'Error: DYNAMODB_TABLE_NAME environment variable is required.\n' +
      'Set it explicitly to avoid writing to the wrong DynamoDB table.\n' +
      'Example: DYNAMODB_TABLE_NAME=art-management ts-node scripts/migrate-to-dynamodb.ts',
    );
    process.exit(1);
  }

  console.log('='.repeat(70));
  console.log('PostgreSQL → DynamoDB Migration');
  console.log(`Target table: ${tableName}`);
  console.log('='.repeat(70));

  // ── 1. Connect to PostgreSQL ───────────────────────────────────────────────
  const pgDataSource = new DataSource({
    type:     'postgres',
    host:     process.env.DATABASE_HOST     || 'localhost',
    port:     parseInt(process.env.DATABASE_PORT || '5432', 10),
    username: process.env.DATABASE_USER     || 'postgres',
    password: process.env.DATABASE_PASSWORD || 'postgres',
    database: process.env.DATABASE_NAME     || 'art_management',
    ssl:      process.env.DATABASE_SSL_MODE === 'disable' ? false : { rejectUnauthorized: false },
    entities: [
      Category, EnhancedProduct, ProductVariant, ProductImage,
      Personaggio, Fumetto, DiscountCode, Cart, CartItem,
      Order, OrderItem, Notification, AuditLog,
      EtsyOAuthToken, EtsyProduct, EtsyReceipt, EtsySyncConfig,
      EtsyInventorySyncLog, ShopifyLink,
    ],
    synchronize: false,
    logging:     false,
  });

  console.log('\nConnecting to PostgreSQL…');
  await pgDataSource.initialize();
  console.log('Connected to PostgreSQL');

  // ── 2. Create DynamoDB client ──────────────────────────────────────────────
  const dynamo = buildDynamoClient();

  const stats: Record<string, number> = {};

  try {
    // ── Step 1: Categories ─────────────────────────────────────────────────
    console.log('\n[1/15] Migrating Categories…');
    const categories = await pgDataSource
      .getRepository(Category)
      .createQueryBuilder('c')
      .withDeleted()
      .getMany();
    const catItems = categories.map(transformCategory);
    await batchWrite(dynamo, tableName, catItems, 'Categories');
    stats['categories'] = catItems.length;

    // Seed counter for future inserts
    const maxCatId = Math.max(0, ...categories.map(c => c.id));
    await seedCounter(dynamo, tableName, 'COUNTER', 'CATEGORY_ID', maxCatId);

    // ── Step 2: Products ───────────────────────────────────────────────────
    console.log('\n[2/15] Migrating Products…');
    const products = await pgDataSource
      .getRepository(EnhancedProduct)
      .createQueryBuilder('p')
      .withDeleted()
      .getMany();
    const productItems = products.map(transformProduct);
    await batchWrite(dynamo, tableName, productItems, 'Products');
    stats['products'] = productItems.length;

    const maxProductId = Math.max(0, ...products.map(p => p.id));
    await seedCounter(dynamo, tableName, 'COUNTER', 'PRODUCT_ID', maxProductId);

    // ── Step 3: ProductVariants ────────────────────────────────────────────
    // Build a legacy-id → DynamoDB UUID map so CartItems/OrderItems can
    // reference the correct UUID after migration.
    console.log('\n[3/15] Migrating ProductVariants…');
    const variants = await pgDataSource
      .getRepository(ProductVariant)
      .createQueryBuilder('v')
      .withDeleted()
      .getMany();

    const variantLegacyToNew = new Map<number, string>(); // pgId (int) → DynamoDB UUID
    const variantDynamoItems: Record<string, any>[] = [];

    for (const v of variants) {
      const { item, dynamoId } = transformProductVariant(v);
      variantLegacyToNew.set(v.id, dynamoId);
      variantDynamoItems.push(item);
    }

    await batchWrite(dynamo, tableName, variantDynamoItems, 'ProductVariants');
    stats['productVariants'] = variantDynamoItems.length;

    // ── Step 4: ProductImages ──────────────────────────────────────────────
    console.log('\n[4/15] Migrating ProductImages…');
    const images = await pgDataSource
      .getRepository(ProductImage)
      .createQueryBuilder('i')
      .getMany();
    // Each PG row produces two DynamoDB items (main + pointer); flatten them.
    const imageItems = images.flatMap(transformProductImage);
    await batchWrite(dynamo, tableName, imageItems, 'ProductImages');
    stats['productImages'] = images.length; // count original PG rows

    // ── Step 5: Product-Category links ─────────────────────────────────────
    console.log('\n[5/15] Migrating Product-Category links…');
    const productsWithCats = await pgDataSource
      .getRepository(EnhancedProduct)
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.categories', 'cat')
      .withDeleted()
      .getMany();

    const linkItems: Record<string, any>[] = [];
    for (const p of productsWithCats) {
      if (p.categories && p.categories.length > 0) {
        linkItems.push(...transformProductCategoryLinks(p, p.categories));
      }
    }
    await batchWrite(dynamo, tableName, linkItems, 'Product-Category links');
    stats['productCategoryLinks'] = linkItems.length;

    // ── Step 6: Personaggi ─────────────────────────────────────────────────
    console.log('\n[6/15] Migrating Personaggi…');
    const personaggi = await pgDataSource
      .getRepository(Personaggio)
      .createQueryBuilder('p')
      .withDeleted()
      .getMany();
    const personaggioItems = personaggi.map(transformPersonaggio);
    await batchWrite(dynamo, tableName, personaggioItems, 'Personaggi');
    stats['personaggi'] = personaggioItems.length;

    const maxPersonaggioId    = Math.max(0, ...personaggi.map(p => p.id));
    const maxPersonaggioOrder = Math.max(0, ...personaggi.map(p => p.order));
    await seedCounter(dynamo, tableName, 'COUNTER', 'PERSONAGGIO_ID', maxPersonaggioId);
    await seedCounter(dynamo, tableName, 'COUNTER', 'PERSONAGGIO_ORDER', maxPersonaggioOrder);

    // ── Step 7: Fumetti ────────────────────────────────────────────────────
    console.log('\n[7/15] Migrating Fumetti…');
    const fumetti = await pgDataSource
      .getRepository(Fumetto)
      .createQueryBuilder('f')
      .withDeleted()
      .getMany();
    const fumettoItems = fumetti.map(transformFumetto);
    await batchWrite(dynamo, tableName, fumettoItems, 'Fumetti');
    stats['fumetti'] = fumettoItems.length;

    const maxFumettoId = Math.max(0, ...fumetti.map(f => f.id));
    await seedCounter(dynamo, tableName, 'COUNTER', 'FUMETTO_ID', maxFumettoId);

    // ── Step 8: DiscountCodes ──────────────────────────────────────────────
    console.log('\n[8/15] Migrating DiscountCodes…');
    const discountCodes = await pgDataSource
      .getRepository(DiscountCode)
      .createQueryBuilder('d')
      .withDeleted()
      .getMany();
    const discountItems = discountCodes.map(transformDiscountCode);
    await batchWrite(dynamo, tableName, discountItems, 'DiscountCodes');
    stats['discountCodes'] = discountItems.length;

    const maxDiscountId = Math.max(0, ...discountCodes.map(d => d.id));
    await seedCounter(dynamo, tableName, 'COUNTER', 'DISCOUNT_ID', maxDiscountId);

    // ── Step 9: Carts ──────────────────────────────────────────────────────
    // Build a legacy-id → DynamoDB-id map so CartItems can reference them.
    console.log('\n[9/15] Migrating Carts…');
    const carts = await pgDataSource
      .getRepository(Cart)
      .createQueryBuilder('c')
      .getMany();

    const cartLegacyToNew = new Map<number, string>(); // pgId → dynamoId
    const cartDynamoItems: Record<string, any>[] = [];

    for (const cart of carts) {
      const item      = transformCart(cart);
      const dynamoId  = item.id as string;
      cartLegacyToNew.set(cart.id, dynamoId);
      cartDynamoItems.push(item);
    }

    await batchWrite(dynamo, tableName, cartDynamoItems, 'Carts');
    stats['carts'] = cartDynamoItems.length;

    // ── Step 10: CartItems ─────────────────────────────────────────────────
    console.log('\n[10/15] Migrating CartItems…');
    const cartItems = await pgDataSource
      .getRepository(CartItem)
      .createQueryBuilder('ci')
      .getMany();

    const cartItemDynamoItems: Record<string, any>[] = [];
    for (const ci of cartItems) {
      const dynamoCartId = cartLegacyToNew.get(ci.cart_id);
      if (!dynamoCartId) {
        console.warn(`  [CartItems] Cart ${ci.cart_id} not found in migration map – skipping item ${ci.id}`);
        continue;
      }
      cartItemDynamoItems.push(transformCartItem(ci, dynamoCartId, variantLegacyToNew));
    }

    await batchWrite(dynamo, tableName, cartItemDynamoItems, 'CartItems');
    stats['cartItems'] = cartItemDynamoItems.length;

    // ── Step 11: Orders ────────────────────────────────────────────────────
    // Build a legacy-id → DynamoDB-id map so OrderItems can reference them.
    console.log('\n[11/15] Migrating Orders…');
    const orders = await pgDataSource
      .getRepository(Order)
      .createQueryBuilder('o')
      .withDeleted()
      .getMany();

    const orderLegacyToNew = new Map<number, string>(); // pgId → dynamoId
    const orderDynamoItems: Record<string, any>[] = [];

    for (const order of orders) {
      const item     = transformOrder(order);
      const dynamoId = item.id as string;
      orderLegacyToNew.set(order.id, dynamoId);
      orderDynamoItems.push(item);
    }

    await batchWrite(dynamo, tableName, orderDynamoItems, 'Orders');
    stats['orders'] = orderDynamoItems.length;

    // ── Step 12: OrderItems ────────────────────────────────────────────────
    console.log('\n[12/15] Migrating OrderItems…');
    const orderItemsPg = await pgDataSource
      .getRepository(OrderItem)
      .createQueryBuilder('oi')
      .getMany();

    const orderItemDynamoItems: Record<string, any>[] = [];
    for (const oi of orderItemsPg) {
      const dynamoOrderId = orderLegacyToNew.get(oi.order_id);
      if (!dynamoOrderId) {
        console.warn(`  [OrderItems] Order ${oi.order_id} not found in migration map – skipping item ${oi.id}`);
        continue;
      }
      orderItemDynamoItems.push(transformOrderItem(oi, dynamoOrderId, variantLegacyToNew));
    }

    await batchWrite(dynamo, tableName, orderItemDynamoItems, 'OrderItems');
    stats['orderItems'] = orderItemDynamoItems.length;

    // ── Step 13: Notifications ─────────────────────────────────────────────
    console.log('\n[13/15] Migrating Notifications…');
    const notifications = await pgDataSource
      .getRepository(Notification)
      .createQueryBuilder('n')
      .getMany();
    const notificationItems = notifications.map(transformNotification);
    await batchWrite(dynamo, tableName, notificationItems, 'Notifications');
    stats['notifications'] = notificationItems.length;

    // ── Step 14: AuditLogs ─────────────────────────────────────────────────
    console.log('\n[14/15] Migrating AuditLogs…');
    const auditLogs = await pgDataSource
      .getRepository(AuditLog)
      .createQueryBuilder('a')
      .getMany();
    const auditLogItems = auditLogs.map(transformAuditLog);
    await batchWrite(dynamo, tableName, auditLogItems, 'AuditLogs');
    stats['auditLogs'] = auditLogItems.length;

    // ── Step 15: Etsy data ─────────────────────────────────────────────────
    console.log('\n[15/15] Migrating Etsy data…');

    // OAuth tokens
    const etsyTokens = await pgDataSource
      .getRepository(EtsyOAuthToken)
      .createQueryBuilder('t')
      .getMany();
    const etsyTokenItems = etsyTokens.map(transformEtsyOAuthToken);
    await batchWrite(dynamo, tableName, etsyTokenItems, 'EtsyOAuthTokens');
    stats['etsyOAuthTokens'] = etsyTokenItems.length;

    // Etsy products
    const etsyProducts = await pgDataSource
      .getRepository(EtsyProduct)
      .createQueryBuilder('ep')
      .withDeleted()
      .getMany();
    const etsyProductItems = etsyProducts.map(transformEtsyProduct);
    await batchWrite(dynamo, tableName, etsyProductItems, 'EtsyProducts');
    stats['etsyProducts'] = etsyProductItems.length;

    // Etsy receipts
    const etsyReceipts = await pgDataSource
      .getRepository(EtsyReceipt)
      .createQueryBuilder('er')
      .withDeleted()
      .getMany();
    const etsyReceiptItems = etsyReceipts.map(transformEtsyReceipt);
    await batchWrite(dynamo, tableName, etsyReceiptItems, 'EtsyReceipts');
    stats['etsyReceipts'] = etsyReceiptItems.length;

    // Etsy sync configs
    const etsySyncConfigs = await pgDataSource
      .getRepository(EtsySyncConfig)
      .createQueryBuilder('sc')
      .getMany();
    const etsySyncConfigItems = etsySyncConfigs.map(transformEtsySyncConfig);
    await batchWrite(dynamo, tableName, etsySyncConfigItems, 'EtsySyncConfigs');
    stats['etsySyncConfigs'] = etsySyncConfigItems.length;

  } finally {
    await pgDataSource.destroy();
    console.log('\nPostgreSQL connection closed');
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(70));
  console.log('Migration complete – summary:');
  for (const [entity, count] of Object.entries(stats)) {
    console.log(`  ${entity.padEnd(25)} ${count}`);
  }
  const total = Object.values(stats).reduce((a, b) => a + b, 0);
  console.log(`  ${'TOTAL'.padEnd(25)} ${total}`);
  console.log('='.repeat(70));
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});

