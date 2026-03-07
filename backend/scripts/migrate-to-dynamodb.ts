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
 * Usage:
 *   npx ts-node scripts/migrate-to-dynamodb.ts
 *
 * Environment variables (all optional – fall back to dev defaults):
 *   DATABASE_HOST / DATABASE_PORT / DATABASE_USER / DATABASE_PASSWORD / DATABASE_NAME
 *   AWS_REGION / AWS_ENDPOINT_URL (for LocalStack)
 *   DYNAMODB_TABLE_NAME
 */

import 'reflect-metadata';
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
import { Order }                  from '../src/entities/Order';
import { OrderItem }              from '../src/entities/OrderItem';
import { Notification }           from '../src/entities/Notification';
import { AuditLog }               from '../src/entities/AuditLog';
import { EtsyOAuthToken }         from '../src/entities/EtsyOAuthToken';
import { EtsyProduct }            from '../src/entities/EtsyProduct';
import { EtsyReceipt }            from '../src/entities/EtsyReceipt';
import { EtsySyncConfig }         from '../src/entities/EtsySyncConfig';
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

/** TTL: 30 days from now, as a Unix timestamp (seconds). */
function cartTTL(): number {
  return Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
}

/** TTL: `days` days from the given ISO string, as a Unix timestamp. */
function ttlFromISO(iso: string, days: number): number {
  const base = new Date(iso).getTime();
  return Math.floor(base / 1000) + days * 24 * 60 * 60;
}

// ── DynamoDB client ───────────────────────────────────────────────────────────

function buildDynamoClient(): DynamoDBDocumentClient {
  const clientConfig: Record<string, any> = {
    region: process.env.AWS_REGION || 'us-east-1',
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

function transformProductVariant(row: ProductVariant): Record<string, any> {
  const item: Record<string, any> = {
    PK:               `PRODUCT_VARIANT#${row.id}`,
    SK:               `PRODUCT#${row.product_id}`,
    id:               String(row.id),
    product_id:       row.product_id,
    sku:              row.sku,
    name:             row.name,
    price_adjustment: toNumber(row.price_adjustment),
    stock:            row.stock,
    created_at:       toISORequired(row.created_at),
    updated_at:       toISORequired(row.updated_at),
    // GSI1 – variants by product
    GSI1PK: `PRODUCT#${row.product_id}`,
    GSI1SK: `VARIANT#${row.id}`,
  };

  if (row.attributes) item.attributes = row.attributes;
  if (row.deleted_at) item.deleted_at = toISO(row.deleted_at);

  return item;
}

function transformProductImage(row: ProductImage): Record<string, any> {
  const item: Record<string, any> = {
    PK:         `PRODUCT_IMAGE#${row.id}`,
    SK:         `PRODUCT#${row.product_id}`,
    id:         String(row.id),
    product_id: row.product_id,
    url:        row.url,
    position:   row.position,
    created_at: toISORequired(row.created_at),
    // GSI1 – images by product
    GSI1PK: `PRODUCT#${row.product_id}`,
    GSI1SK: `IMAGE#${row.position}#${row.id}`,
  };

  if (row.alt_text) item.alt_text = row.alt_text;

  return item;
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
  const id = uuidv4(); // DynamoDB carts use UUID; preserve original as legacy_id
  const now = new Date().toISOString();
  const item: Record<string, any> = {
    PK:         `CART#${id}`,
    SK:         'METADATA',
    id,
    // Preserve the original PostgreSQL integer ID for cross-reference
    legacy_id:  row.id,
    session_id: row.session_id,
    created_at: now,
    updated_at: now,
    expires_at: cartTTL(),
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
  row:         CartItem,
  dynamoCartId: string,
): Record<string, any> {
  const id  = uuidv4();
  const now = new Date().toISOString();
  return {
    PK:         `CART#${dynamoCartId}`,
    SK:         `ITEM#${id}`,
    id,
    legacy_id:  row.id,
    cart_id:    dynamoCartId,
    product_id: row.product_id,
    variant_id: row.variant_id != null ? String(row.variant_id) : undefined,
    quantity:   row.quantity,
    created_at: now,
    updated_at: now,
  };
}

function transformOrder(row: Order): Record<string, any> {
  const id        = uuidv4();
  const createdAt = toISORequired(row.created_at);
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
    // Map PostgreSQL payment_status → DynamoDB status (closest equivalent)
    status:           row.payment_status ?? 'pending',
    payment_status:   row.payment_status,
    fulfillment_status: row.fulfillment_status,
    created_at: createdAt,
    updated_at: toISORequired(row.updated_at),
    // GSIs
    GSI1PK: `ORDER_NUMBER#${row.order_number}`,
    GSI2PK: `ORDER_EMAIL#${row.customer_email}`,
    GSI2SK: createdAt,
    GSI3PK: `ORDER_STATUS#${row.payment_status ?? 'pending'}`,
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
): Record<string, any> {
  const id = uuidv4();
  return {
    PK:           `ORDER#${dynamoOrderId}`,
    SK:           `ITEM#${id}`,
    entity_type:  'OrderItem',
    id,
    legacy_id:    row.id,
    order_id:     dynamoOrderId,
    product_id:   row.product_id,
    variant_id:   row.variant_id != null ? String(row.variant_id) : undefined,
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

function transformEtsyProduct(row: EtsyProduct): Record<string, any> {
  const item: Record<string, any> = {
    PK:              `ETSY_PRODUCT#${row.local_product_id ?? row.id}`,
    SK:              `ETSY#${row.etsy_listing_id}`,
    local_product_id: row.local_product_id ?? row.id,
    etsy_listing_id: row.etsy_listing_id,
    title:           row.title,
    quantity:        row.quantity,
    sync_status:     row.sync_status,
    created_at:      toISORequired(row.created_at),
    updated_at:      toISORequired(row.updated_at),
  };

  if (row.description)   item.description   = row.description;
  if (row.price != null) item.price         = toNumber(row.price);
  if (row.sku)           item.sku           = row.sku;
  if (row.state)         item.state         = row.state;
  if (row.url)           item.url           = row.url;
  if (row.last_synced_at) item.last_synced_at = toISO(row.last_synced_at);
  if (row.deleted_at)    item.deleted_at    = toISO(row.deleted_at);

  return item;
}

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

  if (row.local_order_id != null) item.local_order_id     = row.local_order_id;
  if (row.buyer_email)            item.buyer_email        = row.buyer_email;
  if (row.buyer_name)             item.buyer_name         = row.buyer_name;
  if (row.status)                 item.status             = row.status;
  if (row.grand_total != null)    item.grand_total        = toNumber(row.grand_total);
  if (row.subtotal != null)       item.subtotal           = toNumber(row.subtotal);
  if (row.total_shipping_cost != null) item.total_shipping_cost = toNumber(row.total_shipping_cost);
  if (row.total_tax_cost != null) item.total_tax_cost     = toNumber(row.total_tax_cost);
  if (row.currency)               item.currency           = row.currency;
  if (row.payment_method)         item.payment_method     = row.payment_method;
  if (row.shipping_address)       item.shipping_address   = row.shipping_address;
  if (row.message_from_buyer)     item.message_from_buyer = row.message_from_buyer;
  if (row.last_synced_at)         item.last_synced_at     = toISO(row.last_synced_at);
  if (row.deleted_at)             item.deleted_at         = toISO(row.deleted_at);

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
  const tableName = process.env.DYNAMODB_TABLE_NAME || 'art-management';
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
    console.log('\n[3/15] Migrating ProductVariants…');
    const variants = await pgDataSource
      .getRepository(ProductVariant)
      .createQueryBuilder('v')
      .withDeleted()
      .getMany();
    const variantItems = variants.map(transformProductVariant);
    await batchWrite(dynamo, tableName, variantItems, 'ProductVariants');
    stats['productVariants'] = variantItems.length;

    // ── Step 4: ProductImages ──────────────────────────────────────────────
    console.log('\n[4/15] Migrating ProductImages…');
    const images = await pgDataSource
      .getRepository(ProductImage)
      .createQueryBuilder('i')
      .getMany();
    const imageItems = images.map(transformProductImage);
    await batchWrite(dynamo, tableName, imageItems, 'ProductImages');
    stats['productImages'] = imageItems.length;

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
      cartItemDynamoItems.push(transformCartItem(ci, dynamoCartId));
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
      orderItemDynamoItems.push(transformOrderItem(oi, dynamoOrderId));
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
