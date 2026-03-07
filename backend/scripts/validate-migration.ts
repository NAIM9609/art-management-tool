/**
 * validate-migration.ts
 *
 * Validates that the PostgreSQL → DynamoDB migration succeeded by:
 *   1. Counting records in both databases for every entity.
 *   2. Spot-checking a random sample of records in DynamoDB.
 *   3. Verifying key relationships (e.g. every order item belongs to a known order).
 *   4. Exercising representative query paths (status index, slug index, etc.).
 *
 * Usage:
 *   npx ts-node scripts/validate-migration.ts
 *
 * Environment variables:
 *   DATABASE_HOST / DATABASE_PORT / DATABASE_USER / DATABASE_PASSWORD / DATABASE_NAME
 *   AWS_REGION / AWS_ENDPOINT_URL (for LocalStack)
 *   DYNAMODB_TABLE_NAME
 *   SPOT_CHECK_SAMPLE_SIZE   (default: 5)
 */

import 'reflect-metadata';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  GetCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { DataSource } from 'typeorm';

// ── TypeORM entities ──────────────────────────────────────────────────────────
import { Category }             from '../src/entities/Category';
import { EnhancedProduct }      from '../src/entities/EnhancedProduct';
import { ProductVariant }       from '../src/entities/ProductVariant';
import { ProductImage }         from '../src/entities/ProductImage';
import { Personaggio }          from '../src/entities/Personaggio';
import { Fumetto }              from '../src/entities/Fumetto';
import { DiscountCode }         from '../src/entities/DiscountCode';
import { Cart }                 from '../src/entities/Cart';
import { CartItem }             from '../src/entities/CartItem';
import { Order }                from '../src/entities/Order';
import { OrderItem }            from '../src/entities/OrderItem';
import { Notification }         from '../src/entities/Notification';
import { AuditLog }             from '../src/entities/AuditLog';
import { EtsyOAuthToken }       from '../src/entities/EtsyOAuthToken';
import { EtsyProduct }          from '../src/entities/EtsyProduct';
import { EtsyReceipt }          from '../src/entities/EtsyReceipt';
import { EtsySyncConfig }       from '../src/entities/EtsySyncConfig';
import { EtsyInventorySyncLog } from '../src/entities/EtsyInventorySyncLog';
import { ShopifyLink }          from '../src/entities/ShopifyLink';

// ── Helpers ───────────────────────────────────────────────────────────────────

interface ValidationResult {
  entity:  string;
  pgCount: number;
  dynCount: number;
  passed:  boolean;
  notes?:  string;
}

interface SpotCheckResult {
  entity:  string;
  id:      string | number;
  found:   boolean;
  notes?:  string;
}

interface RelationshipCheckResult {
  check:  string;
  passed: boolean;
  notes?: string;
}

interface QueryCheckResult {
  check:  string;
  passed: boolean;
  notes?: string;
}

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
    marshallOptions: { removeUndefinedValues: true },
  });
}

/**
 * Count DynamoDB items whose PK begins with `pkPrefix` using a Scan with
 * filter expression.  For large tables a full scan is expensive – use only
 * for validation purposes.
 */
async function countByPKPrefix(
  dynamo:    DynamoDBDocumentClient,
  tableName: string,
  pkPrefix:  string,
): Promise<number> {
  let count = 0;
  let lastKey: Record<string, any> | undefined;

  do {
    const resp = await dynamo.send(
      new ScanCommand({
        TableName:        tableName,
        FilterExpression: 'begins_with(PK, :prefix)',
        ExpressionAttributeValues: { ':prefix': pkPrefix },
        Select:           'COUNT',
        ExclusiveStartKey: lastKey,
      }),
    );
    count  += resp.Count ?? 0;
    lastKey = resp.LastEvaluatedKey as Record<string, any> | undefined;
  } while (lastKey);

  return count;
}

/**
 * Count DynamoDB items whose PK begins with `pkPrefix` AND SK begins with
 * `skPrefix`.
 */
async function countByPKAndSKPrefix(
  dynamo:    DynamoDBDocumentClient,
  tableName: string,
  pkPrefix:  string,
  skPrefix:  string,
): Promise<number> {
  let count = 0;
  let lastKey: Record<string, any> | undefined;

  do {
    const resp = await dynamo.send(
      new ScanCommand({
        TableName:        tableName,
        FilterExpression: 'begins_with(PK, :pkp) AND begins_with(SK, :skp)',
        ExpressionAttributeValues: { ':pkp': pkPrefix, ':skp': skPrefix },
        Select:           'COUNT',
        ExclusiveStartKey: lastKey,
      }),
    );
    count  += resp.Count ?? 0;
    lastKey = resp.LastEvaluatedKey as Record<string, any> | undefined;
  } while (lastKey);

  return count;
}

/** Pick up to `n` random elements from `arr`. */
function sample<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j  = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

// ── Validation logic ──────────────────────────────────────────────────────────

async function validateCounts(
  pgDataSource: DataSource,
  dynamo:       DynamoDBDocumentClient,
  tableName:    string,
): Promise<ValidationResult[]> {
  console.log('\n── Count validation ─────────────────────────────────────────');
  const results: ValidationResult[] = [];

  const checks: Array<{
    entity:   string;
    pgRepo:   any;
    pkPrefix: string;
    skPrefix?: string;
  }> = [
    { entity: 'Categories',          pgRepo: pgDataSource.getRepository(Category),         pkPrefix: 'CATEGORY#',         skPrefix: 'METADATA' },
    { entity: 'Products',            pgRepo: pgDataSource.getRepository(EnhancedProduct),  pkPrefix: 'PRODUCT#',          skPrefix: 'METADATA' },
    { entity: 'ProductVariants',     pgRepo: pgDataSource.getRepository(ProductVariant),   pkPrefix: 'PRODUCT#',          skPrefix: 'VARIANT#' },
    { entity: 'ProductImages',       pgRepo: pgDataSource.getRepository(ProductImage),     pkPrefix: 'PRODUCT#',          skPrefix: 'IMAGE#' },
    { entity: 'Personaggi',          pgRepo: pgDataSource.getRepository(Personaggio),      pkPrefix: 'PERSONAGGIO#',      skPrefix: 'METADATA' },
    { entity: 'Fumetti',             pgRepo: pgDataSource.getRepository(Fumetto),          pkPrefix: 'FUMETTO#',          skPrefix: 'METADATA' },
    { entity: 'DiscountCodes',       pgRepo: pgDataSource.getRepository(DiscountCode),     pkPrefix: 'DISCOUNT#',         skPrefix: 'METADATA' },
    { entity: 'Carts',               pgRepo: pgDataSource.getRepository(Cart),             pkPrefix: 'CART#',             skPrefix: 'METADATA' },
    { entity: 'Orders',              pgRepo: pgDataSource.getRepository(Order),            pkPrefix: 'ORDER#',            skPrefix: 'METADATA' },
    { entity: 'Notifications',       pgRepo: pgDataSource.getRepository(Notification),     pkPrefix: 'NOTIFICATION#',     skPrefix: 'METADATA' },
    { entity: 'AuditLogs',           pgRepo: pgDataSource.getRepository(AuditLog),         pkPrefix: 'AUDIT#',            skPrefix: 'METADATA' },
    { entity: 'EtsyOAuthTokens',     pgRepo: pgDataSource.getRepository(EtsyOAuthToken),   pkPrefix: 'ETSY_TOKEN#',       skPrefix: 'METADATA' },
    { entity: 'EtsyProducts',        pgRepo: pgDataSource.getRepository(EtsyProduct),      pkPrefix: 'ETSY_PRODUCT#',     skPrefix: 'METADATA' },
    { entity: 'EtsyReceipts',        pgRepo: pgDataSource.getRepository(EtsyReceipt),      pkPrefix: 'ETSY_RECEIPT#',     skPrefix: 'METADATA' },
    { entity: 'EtsySyncConfigs',     pgRepo: pgDataSource.getRepository(EtsySyncConfig),   pkPrefix: 'ETSY_SYNC_CONFIG#', skPrefix: 'METADATA' },
  ];

  for (const check of checks) {
    const pgCount =
      await check.pgRepo.createQueryBuilder('e').withDeleted().getCount();

    const dynCount = check.skPrefix
      ? await countByPKAndSKPrefix(dynamo, tableName, check.pkPrefix, check.skPrefix)
      : await countByPKPrefix(dynamo, tableName, check.pkPrefix);

    const passed = dynCount >= pgCount; // allow ≥ (DynamoDB may have link items)
    const notes: string[] = [];
    if (!passed)             notes.push(`Expected ${pgCount}, found ${dynCount}`);
    if (dynCount > pgCount * 3) notes.push(`WARNING: DynamoDB count (${dynCount}) is more than 3× PostgreSQL count (${pgCount}) – possible duplicate writes`);
    const result: ValidationResult = {
      entity:  check.entity,
      pgCount,
      dynCount,
      passed,
      notes:   notes.length > 0 ? notes.join('; ') : undefined,
    };
    results.push(result);

    const status = passed ? '✓' : '✗';
    console.log(`  ${status} ${check.entity.padEnd(20)} PG=${pgCount}  DDB=${dynCount}`);
  }

  return results;
}

async function spotCheckProducts(
  pgDataSource: DataSource,
  dynamo:       DynamoDBDocumentClient,
  tableName:    string,
  sampleSize:   number,
): Promise<SpotCheckResult[]> {
  console.log('\n── Product spot-checks ──────────────────────────────────────');
  const results: SpotCheckResult[] = [];

  const products = await pgDataSource
    .getRepository(EnhancedProduct)
    .createQueryBuilder('p')
    .withDeleted()
    .getMany();

  for (const p of sample(products, sampleSize)) {
    const resp = await dynamo.send(
      new GetCommand({
        TableName: tableName,
        Key: { PK: `PRODUCT#${p.id}`, SK: 'METADATA' },
      }),
    );

    const item   = resp.Item;
    const found  = !!item;
    const checks: string[] = [];

    if (found) {
      if (item.slug  !== p.slug)            checks.push(`slug mismatch: ${item.slug} vs ${p.slug}`);
      if (item.title !== p.title)           checks.push(`title mismatch`);
      if (Number(item.base_price) !== Number(p.base_price)) checks.push('base_price mismatch');
    }

    const notes = checks.length > 0 ? checks.join('; ') : undefined;
    results.push({ entity: 'Product', id: p.id, found: found && checks.length === 0, notes });
    console.log(`  ${found && !notes ? '✓' : '✗'} Product#${p.id} (${p.slug})${notes ? '  – ' + notes : ''}`);
  }

  return results;
}

async function spotCheckOrders(
  pgDataSource: DataSource,
  dynamo:       DynamoDBDocumentClient,
  tableName:    string,
  sampleSize:   number,
): Promise<SpotCheckResult[]> {
  console.log('\n── Order spot-checks ────────────────────────────────────────');
  const results: SpotCheckResult[] = [];

  const orders = await pgDataSource
    .getRepository(Order)
    .createQueryBuilder('o')
    .withDeleted()
    .getMany();

  for (const o of sample(orders, sampleSize)) {
    // Orders are migrated with new UUIDs; find by order_number via GSI1
    const resp = await dynamo.send(
      new QueryCommand({
        TableName:              tableName,
        IndexName:              'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: { ':pk': `ORDER_NUMBER#${o.order_number}` },
        Limit: 1,
      }),
    );

    const item  = resp.Items?.[0];
    const found = !!item;
    const checks: string[] = [];

    if (found) {
      if (item.customer_email !== o.customer_email) checks.push('customer_email mismatch');
      if (Number(item.total)  !== Number(o.total))  checks.push('total mismatch');
    }

    const notes = checks.length > 0 ? checks.join('; ') : undefined;
    results.push({ entity: 'Order', id: o.order_number, found: found && checks.length === 0, notes });
    console.log(`  ${found && !notes ? '✓' : '✗'} Order#${o.order_number}${notes ? '  – ' + notes : ''}`);
  }

  return results;
}

async function spotCheckCategories(
  pgDataSource: DataSource,
  dynamo:       DynamoDBDocumentClient,
  tableName:    string,
  sampleSize:   number,
): Promise<SpotCheckResult[]> {
  console.log('\n── Category spot-checks ─────────────────────────────────────');
  const results: SpotCheckResult[] = [];

  const cats = await pgDataSource
    .getRepository(Category)
    .createQueryBuilder('c')
    .withDeleted()
    .getMany();

  for (const c of sample(cats, sampleSize)) {
    const resp = await dynamo.send(
      new GetCommand({
        TableName: tableName,
        Key: { PK: `CATEGORY#${c.id}`, SK: 'METADATA' },
      }),
    );

    const item   = resp.Item;
    const found  = !!item;
    const checks: string[] = [];

    if (found) {
      if (item.slug !== c.slug) checks.push(`slug mismatch: ${item.slug} vs ${c.slug}`);
      if (item.name !== c.name) checks.push('name mismatch');
    }

    const notes = checks.length > 0 ? checks.join('; ') : undefined;
    results.push({ entity: 'Category', id: c.id, found: found && checks.length === 0, notes });
    console.log(`  ${found && !notes ? '✓' : '✗'} Category#${c.id} (${c.slug})${notes ? '  – ' + notes : ''}`);
  }

  return results;
}

async function spotCheckPersonaggi(
  pgDataSource: DataSource,
  dynamo:       DynamoDBDocumentClient,
  tableName:    string,
  sampleSize:   number,
): Promise<SpotCheckResult[]> {
  console.log('\n── Personaggio spot-checks ──────────────────────────────────');
  const results: SpotCheckResult[] = [];

  const personaggi = await pgDataSource
    .getRepository(Personaggio)
    .createQueryBuilder('p')
    .withDeleted()
    .getMany();

  for (const p of sample(personaggi, sampleSize)) {
    const resp = await dynamo.send(
      new GetCommand({
        TableName: tableName,
        Key: { PK: `PERSONAGGIO#${p.id}`, SK: 'METADATA' },
      }),
    );

    const item  = resp.Item;
    const found = !!item;
    const checks: string[] = [];

    if (found && item.name !== p.name) checks.push('name mismatch');

    const notes = checks.length > 0 ? checks.join('; ') : undefined;
    results.push({ entity: 'Personaggio', id: p.id, found: found && checks.length === 0, notes });
    console.log(`  ${found && !notes ? '✓' : '✗'} Personaggio#${p.id} (${p.name})${notes ? '  – ' + notes : ''}`);
  }

  return results;
}

async function checkRelationships(
  pgDataSource: DataSource,
  dynamo:       DynamoDBDocumentClient,
  tableName:    string,
): Promise<RelationshipCheckResult[]> {
  console.log('\n── Relationship checks ──────────────────────────────────────');
  const results: RelationshipCheckResult[] = [];

  // 1. Verify that order items reference existing orders in DynamoDB
  {
    const orderItems = await pgDataSource
      .getRepository(OrderItem)
      .createQueryBuilder('oi')
      .select(['oi.order_id'])
      .distinct(true)
      .getRawMany<{ oi_order_id: number }>();

    // Spot-check a few parent orders exist via GSI1 (order_number)
    const sampleOrderIds = sample(orderItems, 3).map(r => r.oi_order_id);
    let missingOrders    = 0;

    for (const pgOrderId of sampleOrderIds) {
      const pgOrder = await pgDataSource
        .getRepository(Order)
        .findOne({ where: { id: pgOrderId }, withDeleted: true });

      if (!pgOrder) continue;

      const resp = await dynamo.send(
        new QueryCommand({
          TableName:              tableName,
          IndexName:              'GSI1',
          KeyConditionExpression: 'GSI1PK = :pk',
          ExpressionAttributeValues: { ':pk': `ORDER_NUMBER#${pgOrder.order_number}` },
          Limit: 1,
        }),
      );

      if (!resp.Items?.length) missingOrders++;
    }

    const passed = missingOrders === 0;
    results.push({
      check:  'OrderItems → Orders exist in DynamoDB',
      passed,
      notes:  passed ? undefined : `${missingOrders} sampled parent orders not found`,
    });
    console.log(`  ${passed ? '✓' : '✗'} OrderItems → Orders exist in DynamoDB`);
  }

  // 2. Verify that product variants reference existing products
  {
    const variants = await pgDataSource
      .getRepository(ProductVariant)
      .createQueryBuilder('v')
      .select(['v.product_id'])
      .distinct(true)
      .getRawMany<{ v_product_id: number }>();

    const sampleProductIds = sample(variants, 3).map(r => r.v_product_id);
    let missingProducts    = 0;

    for (const pgProductId of sampleProductIds) {
      const resp = await dynamo.send(
        new GetCommand({
          TableName: tableName,
          Key: { PK: `PRODUCT#${pgProductId}`, SK: 'METADATA' },
        }),
      );
      if (!resp.Item) missingProducts++;
    }

    const passed = missingProducts === 0;
    results.push({
      check:  'ProductVariants → Products exist in DynamoDB',
      passed,
      notes:  passed ? undefined : `${missingProducts} sampled parent products not found`,
    });
    console.log(`  ${passed ? '✓' : '✗'} ProductVariants → Products exist in DynamoDB`);
  }

  // 3. Verify that discount codes with is_active=true have DynamoDB counterparts
  {
    const activeCodes = await pgDataSource
      .getRepository(DiscountCode)
      .createQueryBuilder('d')
      .where('d.is_active = :a', { a: true })
      .select(['d.id', 'd.code'])
      .getMany();

    const sampled  = sample(activeCodes, 3);
    let notInDynamo = 0;

    for (const dc of sampled) {
      const resp = await dynamo.send(
        new GetCommand({
          TableName: tableName,
          Key: { PK: `DISCOUNT#${dc.id}`, SK: 'METADATA' },
        }),
      );
      if (!resp.Item) notInDynamo++;
    }

    const passed = notInDynamo === 0;
    results.push({
      check:  'Active DiscountCodes exist in DynamoDB',
      passed,
      notes:  passed ? undefined : `${notInDynamo} sampled active codes not found`,
    });
    console.log(`  ${passed ? '✓' : '✗'} Active DiscountCodes exist in DynamoDB`);
  }

  return results;
}

async function runQueryChecks(
  dynamo:    DynamoDBDocumentClient,
  tableName: string,
): Promise<QueryCheckResult[]> {
  console.log('\n── Query tests ──────────────────────────────────────────────');
  const results: QueryCheckResult[] = [];

  // 1. Query products by status using GSI2
  {
    let passed = true;
    let notes: string | undefined;
    try {
      const resp = await dynamo.send(
        new QueryCommand({
          TableName:              tableName,
          IndexName:              'GSI2',
          KeyConditionExpression: 'GSI2PK = :pk',
          ExpressionAttributeValues: { ':pk': 'PRODUCT_STATUS#published' },
          Limit: 5,
        }),
      );
      notes = `returned ${resp.Items?.length ?? 0} published products`;
    } catch (err: any) {
      passed = false;
      notes  = err.message;
    }
    results.push({ check: 'Query published products via GSI2', passed, notes });
    console.log(`  ${passed ? '✓' : '✗'} Query published products via GSI2  (${notes})`);
  }

  // 2. Query orders by status using GSI3
  {
    let passed = true;
    let notes: string | undefined;
    try {
      const resp = await dynamo.send(
        new QueryCommand({
          TableName:              tableName,
          IndexName:              'GSI3',
          KeyConditionExpression: 'GSI3PK = :pk',
          ExpressionAttributeValues: { ':pk': 'ORDER_STATUS#pending' },
          Limit: 5,
        }),
      );
      notes = `returned ${resp.Items?.length ?? 0} pending orders`;
    } catch (err: any) {
      passed = false;
      notes  = err.message;
    }
    results.push({ check: 'Query pending orders via GSI3', passed, notes });
    console.log(`  ${passed ? '✓' : '✗'} Query pending orders via GSI3  (${notes})`);
  }

  // 3. Query unread notifications using GSI1
  {
    let passed = true;
    let notes: string | undefined;
    try {
      const resp = await dynamo.send(
        new QueryCommand({
          TableName:              tableName,
          IndexName:              'GSI1',
          KeyConditionExpression: 'GSI1PK = :pk',
          ExpressionAttributeValues: { ':pk': 'NOTIFICATION_READ#false' },
          Limit: 5,
        }),
      );
      notes = `returned ${resp.Items?.length ?? 0} unread notifications`;
    } catch (err: any) {
      passed = false;
      notes  = err.message;
    }
    results.push({ check: 'Query unread notifications via GSI1', passed, notes });
    console.log(`  ${passed ? '✓' : '✗'} Query unread notifications via GSI1  (${notes})`);
  }

  // 4. Query fumetti by order using GSI1
  {
    let passed = true;
    let notes: string | undefined;
    try {
      const resp = await dynamo.send(
        new QueryCommand({
          TableName:              tableName,
          IndexName:              'GSI1',
          KeyConditionExpression: 'GSI1PK = :pk',
          ExpressionAttributeValues: { ':pk': 'FUMETTO_ORDER' },
          ScanIndexForward: true,
          Limit: 5,
        }),
      );
      notes = `returned ${resp.Items?.length ?? 0} fumetti`;
    } catch (err: any) {
      passed = false;
      notes  = err.message;
    }
    results.push({ check: 'Query fumetti by order via GSI1', passed, notes });
    console.log(`  ${passed ? '✓' : '✗'} Query fumetti by order via GSI1  (${notes})`);
  }

  return results;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Require DYNAMODB_TABLE_NAME explicitly – this script runs expensive full-table
  // scans and must not accidentally target the wrong environment.
  const tableName = process.env.DYNAMODB_TABLE_NAME;
  if (!tableName) {
    console.error(
      'Error: DYNAMODB_TABLE_NAME environment variable is required for validate-migration.\n' +
      'Refusing to run without an explicit table name to avoid scanning the wrong environment.',
    );
    process.exit(1);
  }
  const sampleSize = parseInt(process.env.SPOT_CHECK_SAMPLE_SIZE || '5', 10);

  console.log('='.repeat(70));
  console.log('Migration Validation');
  console.log(`DynamoDB table: ${tableName}`);
  console.log(`Spot-check sample size: ${sampleSize}`);
  console.log('='.repeat(70));

  // ── PostgreSQL connection ──────────────────────────────────────────────────
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

  const dynamo = buildDynamoClient();

  let overallPassed = true;

  try {
    // 1. Count records
    const countResults     = await validateCounts(pgDataSource, dynamo, tableName);
    const countFailed      = countResults.filter(r => !r.passed);

    // 2. Spot checks
    const productSpot      = await spotCheckProducts(pgDataSource, dynamo, tableName, sampleSize);
    const orderSpot        = await spotCheckOrders(pgDataSource, dynamo, tableName, sampleSize);
    const categorySpot     = await spotCheckCategories(pgDataSource, dynamo, tableName, sampleSize);
    const personaggioSpot  = await spotCheckPersonaggi(pgDataSource, dynamo, tableName, sampleSize);
    const allSpot          = [...productSpot, ...orderSpot, ...categorySpot, ...personaggioSpot];
    const spotFailed       = allSpot.filter(r => !r.found);

    // 3. Relationship checks
    const relChecks        = await checkRelationships(pgDataSource, dynamo, tableName);
    const relFailed        = relChecks.filter(r => !r.passed);

    // 4. Query tests
    const queryChecks      = await runQueryChecks(dynamo, tableName);
    const queryFailed      = queryChecks.filter(r => !r.passed);

    // ── Summary ──────────────────────────────────────────────────────────────
    overallPassed = countFailed.length === 0 &&
                    spotFailed.length  === 0 &&
                    relFailed.length   === 0 &&
                    queryFailed.length === 0;

    console.log('\n' + '='.repeat(70));
    console.log('Validation Summary');
    console.log('='.repeat(70));
    console.log(`  Count checks:        ${countFailed.length  === 0 ? 'PASSED' : `FAILED (${countFailed.length} issue(s))`}`);
    console.log(`  Spot checks:         ${spotFailed.length   === 0 ? 'PASSED' : `FAILED (${spotFailed.length} issue(s))`}`);
    console.log(`  Relationship checks: ${relFailed.length    === 0 ? 'PASSED' : `FAILED (${relFailed.length} issue(s))`}`);
    console.log(`  Query checks:        ${queryFailed.length  === 0 ? 'PASSED' : `FAILED (${queryFailed.length} issue(s))`}`);
    console.log('');
    console.log(`  Overall: ${overallPassed ? '✓ PASSED' : '✗ FAILED'}`);
    console.log('='.repeat(70));

    if (!overallPassed) {
      if (countFailed.length)  console.log('\nCount failures:', countFailed);
      if (spotFailed.length)   console.log('\nSpot-check failures:', spotFailed);
      if (relFailed.length)    console.log('\nRelationship failures:', relFailed);
      if (queryFailed.length)  console.log('\nQuery failures:', queryFailed);
    }
  } finally {
    await pgDataSource.destroy();
    console.log('\nPostgreSQL connection closed');
  }

  process.exit(overallPassed ? 0 : 1);
}

main().catch(err => {
  console.error('Validation failed with unexpected error:', err);
  process.exit(1);
});
