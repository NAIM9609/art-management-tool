/**
 * rollback-migration.ts
 *
 * Provides rollback capability for the PostgreSQL → DynamoDB migration.
 *
 * Modes (controlled by ROLLBACK_MODE environment variable):
 *
 *   backup   – Dump a JSON snapshot of all PostgreSQL data to disk
 *              (run BEFORE the migration as a safety net).
 *
 *   restore  – Restore PostgreSQL from the JSON snapshot produced by `backup`.
 *
 *   clear    – Delete all migrated items from DynamoDB
 *              (run to wipe DynamoDB and try the migration again).
 *
 * Usage:
 *   ROLLBACK_MODE=backup  npx ts-node scripts/rollback-migration.ts
 *   ROLLBACK_MODE=restore npx ts-node scripts/rollback-migration.ts
 *   ROLLBACK_MODE=clear   npx ts-node scripts/rollback-migration.ts
 *
 * Environment variables:
 *   ROLLBACK_MODE            backup | restore | clear  (required)
 *   BACKUP_FILE              path to the backup JSON file
 *                            (default: ./backups/pg-backup-<timestamp>.json)
 *   DATABASE_HOST / DATABASE_PORT / DATABASE_USER / DATABASE_PASSWORD / DATABASE_NAME
 *   AWS_REGION / AWS_ENDPOINT_URL (for LocalStack)
 *   DYNAMODB_TABLE_NAME
 */

import 'reflect-metadata';
import fs   from 'fs';
import path from 'path';

import { DynamoDBClient }   from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  BatchWriteCommand,
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

const DYNAMO_BATCH_SIZE = 25;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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

function buildPgDataSource(): DataSource {
  return new DataSource({
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
}

// ── Mode: backup ──────────────────────────────────────────────────────────────

async function runBackup(backupFile: string): Promise<void> {
  console.log('='.repeat(70));
  console.log('PostgreSQL Backup (pre-migration snapshot)');
  console.log(`Output: ${backupFile}`);
  console.log('='.repeat(70));

  const pgDataSource = buildPgDataSource();
  console.log('\nConnecting to PostgreSQL…');
  await pgDataSource.initialize();
  console.log('Connected');

  try {
    const backup: Record<string, any[]> = {};
    const entityNames = [
      'Category', 'EnhancedProduct', 'ProductVariant', 'ProductImage',
      'Personaggio', 'Fumetto', 'DiscountCode',
      'Cart', 'CartItem', 'Order', 'OrderItem',
      'Notification', 'AuditLog',
      'EtsyOAuthToken', 'EtsyProduct', 'EtsyReceipt', 'EtsySyncConfig',
      'EtsyInventorySyncLog', 'ShopifyLink',
    ];

    for (const entityName of entityNames) {
      console.log(`  Backing up ${entityName}…`);
      const rows = await pgDataSource
        .getRepository(entityName)
        .createQueryBuilder('e')
        .withDeleted()
        .getMany();
      backup[entityName] = rows;
      console.log(`    → ${rows.length} rows`);
    }

    // Write backup to disk
    const dir = path.dirname(backupFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2), 'utf8');

    const sizeMB = (fs.statSync(backupFile).size / 1024 / 1024).toFixed(2);
    console.log(`\nBackup written to ${backupFile} (${sizeMB} MB)`);
  } finally {
    await pgDataSource.destroy();
  }
}

// ── Mode: restore ─────────────────────────────────────────────────────────────

async function runRestore(backupFile: string): Promise<void> {
  console.log('='.repeat(70));
  console.log('PostgreSQL Restore from backup');
  console.log(`Source: ${backupFile}`);
  console.log('='.repeat(70));

  if (!fs.existsSync(backupFile)) {
    throw new Error(`Backup file not found: ${backupFile}`);
  }

  const backup = JSON.parse(fs.readFileSync(backupFile, 'utf8')) as Record<string, any[]>;
  const pgDataSource = buildPgDataSource();

  console.log('\nConnecting to PostgreSQL…');
  await pgDataSource.initialize();
  console.log('Connected');

  // Restore must respect FK order (same as migration): categories first, then dependents.
  const restoreOrder = [
    'Category',
    'EnhancedProduct',
    'ProductVariant',
    'ProductImage',
    'Personaggio',
    'Fumetto',
    'DiscountCode',
    'Cart',
    'CartItem',
    'Order',
    'OrderItem',
    'Notification',
    'AuditLog',
    'EtsyOAuthToken',
    'EtsyProduct',
    'EtsyReceipt',
    'EtsySyncConfig',
    'EtsyInventorySyncLog',
    'ShopifyLink',
  ];

  try {
    // Disable FK checks temporarily (PostgreSQL doesn't have a simple disable,
    // but we can use a transaction with deferred constraints or truncate in reverse order).
    // Here we truncate in reverse dependency order, then re-insert in forward order.
    console.log('\nTruncating tables (reverse dependency order)…');
    const reversedOrder = [...restoreOrder].reverse();

    // Allowed table names derived from TypeORM entity metadata (controlled at compile time).
    // We validate them against a pattern to be safe before interpolating into SQL.
    const tableNamePattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

    for (const entityName of reversedOrder) {
      const meta  = pgDataSource.getMetadata(entityName);
      const table = meta.tableName;
      if (!tableNamePattern.test(table)) {
        throw new Error(`Unsafe table name detected: "${table}" – aborting restore`);
      }
      await pgDataSource.query(`TRUNCATE TABLE "${table}" RESTART IDENTITY CASCADE`);
      console.log(`  Truncated ${table}`);
    }

    console.log('\nRestoring rows…');
    for (const entityName of restoreOrder) {
      const rows = backup[entityName];
      if (!rows || rows.length === 0) {
        console.log(`  ${entityName}: (empty – skipping)`);
        continue;
      }

      const repo = pgDataSource.getRepository(entityName);
      // Re-insert in chunks to avoid parameter limits
      const chunkSize = 100;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        await repo.save(chunk.map((r: any) => repo.create(r)));
      }
      console.log(`  ${entityName}: ${rows.length} rows restored`);
    }

    console.log('\nRestore complete');
  } finally {
    await pgDataSource.destroy();
  }
}

// ── Mode: clear ───────────────────────────────────────────────────────────────

/**
 * Delete all items from the DynamoDB table in batches of 25.
 * This scans the entire table page by page and issues BatchWrite deletes.
 *
 * WARNING: This deletes ALL items in the table, not just the migrated ones.
 *          Run only when you want to start the migration from scratch.
 */
async function runClear(
  dynamo:    DynamoDBDocumentClient,
  tableName: string,
): Promise<void> {
  console.log('='.repeat(70));
  console.log('DynamoDB Table Clear');
  console.log(`Table: ${tableName}`);
  console.log('='.repeat(70));
  console.log('\nWARNING: This will delete ALL items in the DynamoDB table.');
  console.log('Waiting 5 seconds before proceeding (Ctrl+C to abort)…');
  await sleep(5000);

  let totalDeleted = 0;
  let lastKey: Record<string, any> | undefined;

  do {
    // Scan a page of items (PK + SK only for cost efficiency)
    const scanResp = await dynamo.send(
      new ScanCommand({
        TableName:            tableName,
        ProjectionExpression: 'PK, SK',
        ExclusiveStartKey:    lastKey,
        Limit:                250,
      }),
    );

    const items = scanResp.Items ?? [];
    lastKey     = scanResp.LastEvaluatedKey as Record<string, any> | undefined;

    if (items.length === 0) break;

    // Delete in batches of 25
    for (let i = 0; i < items.length; i += DYNAMO_BATCH_SIZE) {
      const batch   = items.slice(i, i + DYNAMO_BATCH_SIZE);
      let unprocessed = batch.map(it => ({ DeleteRequest: { Key: { PK: it.PK, SK: it.SK } } }));
      let attempt   = 0;

      while (unprocessed.length > 0) {
        try {
          const resp = await dynamo.send(
            new BatchWriteCommand({ RequestItems: { [tableName]: unprocessed } }),
          );
          const remaining = resp.UnprocessedItems?.[tableName];
          unprocessed = remaining && remaining.length > 0
            ? (remaining as typeof unprocessed)
            : [];

          if (unprocessed.length > 0) {
            const delay = Math.min(100 * Math.pow(2, attempt), 5000);
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
            await sleep(delay);
            attempt++;
          } else {
            throw err;
          }
        }
      }

      totalDeleted += batch.length;
    }

    console.log(`  Deleted ${totalDeleted} items so far…`);
  } while (lastKey);

  console.log(`\nDone – deleted ${totalDeleted} item(s) from ${tableName}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const mode = (process.env.ROLLBACK_MODE || '').toLowerCase();

  if (!['backup', 'restore', 'clear'].includes(mode)) {
    console.error(
      'Usage: ROLLBACK_MODE=backup|restore|clear npx ts-node scripts/rollback-migration.ts',
    );
    process.exit(1);
  }

  const tableName = process.env.DYNAMODB_TABLE_NAME || 'art-management';

  // Resolve the project root as two directories above this script's directory
  // (i.e. <repo-root>/backups when the script is at <repo-root>/backend/scripts/).
  const projectRoot      = path.resolve(__dirname, '..', '..');
  const defaultBackupDir = process.env.BACKUP_DIR
    ? path.resolve(process.env.BACKUP_DIR)
    : path.join(projectRoot, 'backups');
  const defaultBackupFile = path.join(
    defaultBackupDir,
    `pg-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  );
  const backupFile = process.env.BACKUP_FILE
    ? path.resolve(process.env.BACKUP_FILE)
    : defaultBackupFile;

  switch (mode) {
    case 'backup':
      await runBackup(backupFile);
      break;

    case 'restore': {
      // If no explicit BACKUP_FILE, find the most recent backup in the backups directory.
      const resolvedFile = process.env.BACKUP_FILE
        ? path.resolve(process.env.BACKUP_FILE)
        : findLatestBackup(defaultBackupDir);

      if (!resolvedFile) {
        console.error(`No backup files found in ${defaultBackupDir}`);
        console.error('Specify BACKUP_FILE=<path> to point to an explicit backup.');
        process.exit(1);
      }

      await runRestore(resolvedFile);
      break;
    }

    case 'clear': {
      const dynamo = buildDynamoClient();
      await runClear(dynamo, tableName);
      break;
    }
  }
}

/** Return the most recently modified pg-backup-*.json file in `dir`, or undefined. */
function findLatestBackup(dir: string): string | undefined {
  if (!fs.existsSync(dir)) return undefined;

  const files = fs
    .readdirSync(dir)
    .filter(f => f.startsWith('pg-backup-') && f.endsWith('.json'))
    .map(f => ({ name: f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  return files.length > 0 ? path.join(dir, files[0].name) : undefined;
}

main().catch(err => {
  console.error('Rollback script failed:', err);
  process.exit(1);
});
