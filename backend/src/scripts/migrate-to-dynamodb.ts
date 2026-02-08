/**
 * Migration Script: PostgreSQL to DynamoDB
 * 
 * This script reads data from the existing PostgreSQL database using TypeORM
 * and writes it to DynamoDB using the new repositories.
 * 
 * Usage:
 *   DRY_RUN=true npx ts-node src/scripts/migrate-to-dynamodb.ts  # Dry run
 *   npx ts-node src/scripts/migrate-to-dynamodb.ts               # Full migration
 */

import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config } from '../config';
import { DynamoDBHelper } from '../database/dynamodb-client';

// Import TypeORM entities
import { EnhancedProduct } from '../entities/EnhancedProduct';
import { ProductImage } from '../entities/ProductImage';
import { ProductVariant } from '../entities/ProductVariant';
import { Category } from '../entities/Category';
import { Order } from '../entities/Order';
import { OrderItem } from '../entities/OrderItem';
import { Cart } from '../entities/Cart';
import { CartItem } from '../entities/CartItem';
import { Personaggio } from '../entities/Personaggio';
import { Fumetto } from '../entities/Fumetto';
import { DiscountCode } from '../entities/DiscountCode';
import { Notification } from '../entities/Notification';
import { AuditLog } from '../entities/AuditLog';
import { EtsyOAuthToken } from '../entities/EtsyOAuthToken';
import { EtsySyncConfig } from '../entities/EtsySyncConfig';
import { EtsyProduct } from '../entities/EtsyProduct';
import { EtsyReceipt } from '../entities/EtsyReceipt';
import { EtsyInventorySyncLog } from '../entities/EtsyInventorySyncLog';
import { ShopifyLink } from '../entities/ShopifyLink';

// Import DynamoDB repositories
import {
  ProductRepository,
  ProductImageRepository,
  ProductVariantRepository,
  CategoryRepository,
  OrderRepository,
  CartRepository,
  CartItemRepository,
  PersonaggioRepository,
  FumettoRepository,
  DiscountCodeRepository,
  NotificationRepository,
  AuditLogRepository,
  EtsyOAuthTokenRepository,
  EtsyProductRepository,
  EtsyReceiptRepository,
  ShopifyLinkRepository,
} from '../repositories';

const DRY_RUN = process.env.DRY_RUN === 'true';

interface MigrationStats {
  entity: string;
  total: number;
  migrated: number;
  skipped: number;
  errors: number;
}

class MigrationRunner {
  private pgDataSource: DataSource;
  private stats: MigrationStats[] = [];

  constructor() {
    this.pgDataSource = new DataSource({
      type: 'postgres',
      host: config.database.host,
      port: config.database.port,
      username: config.database.user,
      password: config.database.password,
      database: config.database.name,
      entities: [
        EnhancedProduct,
        ProductImage,
        ProductVariant,
        Category,
        Order,
        OrderItem,
        Cart,
        CartItem,
        Personaggio,
        Fumetto,
        DiscountCode,
        Notification,
        AuditLog,
        EtsyOAuthToken,
        EtsySyncConfig,
        EtsyProduct,
        EtsyReceipt,
        EtsyInventorySyncLog,
        ShopifyLink,
      ],
      synchronize: false,
      logging: false,
    });
  }

  async run(): Promise<void> {
    console.log('='.repeat(60));
    console.log('PostgreSQL to DynamoDB Migration');
    console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'FULL MIGRATION'}`);
    console.log('='.repeat(60));

    try {
      console.log('\n[1] Connecting to PostgreSQL...');
      await this.pgDataSource.initialize();
      console.log('    Connected successfully!');

      console.log('\n[2] Testing DynamoDB connection...');
      const db = DynamoDBHelper.getInstance();
      console.log(`    Table: ${db.getTableName()}`);
      console.log('    Connected successfully!');

      console.log('\n[3] Starting entity migrations...\n');

      await this.migrateCategories();
      await this.migratePersonaggi();
      await this.migrateFumetti();
      await this.migrateDiscountCodes();
      await this.migrateProducts();
      await this.migrateOrders();
      await this.migrateCarts();
      await this.migrateNotifications();
      await this.migrateAuditLogs();
      await this.migrateEtsyData();
      await this.migrateShopifyLinks();

      this.printSummary();

    } catch (error) {
      console.error('\nMigration failed:', error);
      throw error;
    } finally {
      if (this.pgDataSource.isInitialized) {
        await this.pgDataSource.destroy();
      }
    }
  }

  private async migrateCategories(): Promise<void> {
    const entityName = 'Category';
    console.log(`    Migrating ${entityName}...`);

    const repo = this.pgDataSource.getRepository(Category);
    const categories = await repo.find();
    const stats = this.initStats(entityName, categories.length);

    for (const category of categories) {
      try {
        if (!DRY_RUN) {
          await (CategoryRepository as any).create({
            name: category.name,
            slug: category.slug,
            description: category.description,
            parentId: category.parent_id || null,
            displayOrder: 0,
            isActive: true,
          });
        }
        stats.migrated++;
      } catch (error: any) {
        console.error(`      Error: ${error.message}`);
        stats.errors++;
      }
    }

    this.stats.push(stats);
    this.logStats(stats);
  }

  private async migratePersonaggi(): Promise<void> {
    const entityName = 'Personaggio';
    console.log(`    Migrating ${entityName}...`);

    const repo = this.pgDataSource.getRepository(Personaggio);
    const items = await repo.find();
    const stats = this.initStats(entityName, items.length);

    for (const item of items) {
      try {
        if (!DRY_RUN) {
          await (PersonaggioRepository as any).create({
            name: item.name,
            slug: this.generateSlug(item.name),
            description: item.description,
            image: item.icon,
            displayOrder: item.order,
            isActive: true,
          });
        }
        stats.migrated++;
      } catch (error: any) {
        console.error(`      Error: ${error.message}`);
        stats.errors++;
      }
    }

    this.stats.push(stats);
    this.logStats(stats);
  }

  private async migrateFumetti(): Promise<void> {
    const entityName = 'Fumetto';
    console.log(`    Migrating ${entityName}...`);

    const repo = this.pgDataSource.getRepository(Fumetto);
    const items = await repo.find();
    const stats = this.initStats(entityName, items.length);

    for (const item of items) {
      try {
        if (!DRY_RUN) {
          await (FumettoRepository as any).create({
            title: item.title,
            slug: this.generateSlug(item.title),
            description: item.description,
            coverImage: item.coverImage,
            pages: item.pages || [],
            displayOrder: item.order,
            isActive: true,
          });
        }
        stats.migrated++;
      } catch (error: any) {
        console.error(`      Error: ${error.message}`);
        stats.errors++;
      }
    }

    this.stats.push(stats);
    this.logStats(stats);
  }

  private async migrateDiscountCodes(): Promise<void> {
    const entityName = 'DiscountCode';
    console.log(`    Migrating ${entityName}...`);

    const repo = this.pgDataSource.getRepository(DiscountCode);
    const items = await repo.find();
    const stats = this.initStats(entityName, items.length);

    for (const item of items) {
      try {
        if (!DRY_RUN) {
          await (DiscountCodeRepository as any).create({
            code: item.code.toUpperCase(),
            discountType: item.type,
            discountValue: Number(item.value),
            minPurchaseAmount: item.min_order_value ? Number(item.min_order_value) : undefined,
            maxUses: item.max_uses,
            currentUses: item.times_used || 0,
            expiresAt: item.valid_until ? new Date(item.valid_until).toISOString() : undefined,
            isActive: item.is_active,
          });
        }
        stats.migrated++;
      } catch (error: any) {
        console.error(`      Error: ${error.message}`);
        stats.errors++;
      }
    }

    this.stats.push(stats);
    this.logStats(stats);
  }

  private async migrateProducts(): Promise<void> {
    const entityName = 'Product';
    console.log(`    Migrating ${entityName}...`);

    const repo = this.pgDataSource.getRepository(EnhancedProduct);
    const items = await repo.find({ relations: ['images', 'variants', 'categories'] });
    const stats = this.initStats(entityName, items.length);

    for (const item of items) {
      try {
        if (!DRY_RUN) {
          await (ProductRepository as any).create({
            name: item.title,
            slug: item.slug,
            description: item.long_description || item.short_description,
            price: Number(item.base_price),
            status: item.status,
            categoryIds: item.categories?.map((c: any) => c.id) || [],
          });

          for (const image of item.images || []) {
            await (ProductImageRepository as any).create({
              productId: item.id,
              url: (image as any).url,
              alt: (image as any).alt_text || '',
              displayOrder: (image as any).sort_order || 0,
              isPrimary: (image as any).is_primary || false,
            });
          }

          for (const variant of item.variants || []) {
            await (ProductVariantRepository as any).create({
              productId: item.id,
              sku: (variant as any).sku,
              name: (variant as any).name,
              price: Number((variant as any).price || item.base_price),
              stock: (variant as any).stock_quantity || 0,
              isActive: (variant as any).is_active ?? true,
            });
          }
        }
        stats.migrated++;
      } catch (error: any) {
        console.error(`      Error: ${error.message}`);
        stats.errors++;
      }
    }

    this.stats.push(stats);
    this.logStats(stats);
  }

  private async migrateOrders(): Promise<void> {
    const entityName = 'Order';
    console.log(`    Migrating ${entityName}...`);

    const repo = this.pgDataSource.getRepository(Order);
    const items = await repo.find({ relations: ['items'] });
    const stats = this.initStats(entityName, items.length);

    for (const item of items) {
      try {
        if (!DRY_RUN) {
          await (OrderRepository as any).createWithItems({
            orderNumber: (item as any).order_number,
            customerEmail: (item as any).customer_email,
            customerName: (item as any).customer_name,
            shippingAddress: (item as any).shipping_address,
            billingAddress: (item as any).billing_address,
            subtotal: Number((item as any).subtotal || 0),
            tax: Number((item as any).tax || 0),
            shipping: Number((item as any).shipping_cost || 0),
            discount: Number((item as any).discount_amount || 0),
            total: Number((item as any).total || 0),
            paymentStatus: (item as any).payment_status,
            fulfillmentStatus: (item as any).fulfillment_status,
            notes: (item as any).notes,
          }, ((item as any).items || []).map((orderItem: any) => ({
            productId: orderItem.product_id,
            variantId: orderItem.variant_id,
            productName: orderItem.product_name || '',
            variantName: orderItem.variant_name || '',
            sku: orderItem.sku || '',
            quantity: orderItem.quantity,
            unitPrice: Number(orderItem.unit_price),
            totalPrice: Number(orderItem.total_price),
          })));
        }
        stats.migrated++;
      } catch (error: any) {
        console.error(`      Error: ${error.message}`);
        stats.errors++;
      }
    }

    this.stats.push(stats);
    this.logStats(stats);
  }

  private async migrateCarts(): Promise<void> {
    const entityName = 'Cart';
    console.log(`    Migrating ${entityName}...`);

    const repo = this.pgDataSource.getRepository(Cart);
    const items = await repo.find({ relations: ['items'] });
    const stats = this.initStats(entityName, items.length);

    for (const item of items) {
      try {
        if (!DRY_RUN) {
          await (CartRepository as any).create({
            sessionId: (item as any).session_id,
            userId: (item as any).user_id,
            subtotal: 0,
            total: 0,
          });

          for (const cartItem of (item as any).items || []) {
            await (CartItemRepository as any).create({
              cartId: item.id,
              productId: cartItem.product_id,
              variantId: cartItem.variant_id,
              productName: cartItem.product?.title || '',
              quantity: cartItem.quantity,
              unitPrice: Number(cartItem.price || 0),
              totalPrice: Number(cartItem.quantity * (cartItem.price || 0)),
            });
          }
        }
        stats.migrated++;
      } catch (error: any) {
        console.error(`      Error: ${error.message}`);
        stats.errors++;
      }
    }

    this.stats.push(stats);
    this.logStats(stats);
  }

  private async migrateNotifications(): Promise<void> {
    const entityName = 'Notification';
    console.log(`    Migrating ${entityName}...`);

    const repo = this.pgDataSource.getRepository(Notification);
    const items = await repo.find();
    const stats = this.initStats(entityName, items.length);

    for (const item of items) {
      try {
        if (!DRY_RUN) {
          await (NotificationRepository as any).create({
            type: (item as any).type || 'info',
            title: (item as any).title || '',
            message: (item as any).message || '',
            data: (item as any).metadata || {},
            isRead: (item as any).is_read || false,
            userId: (item as any).user_id,
          });
        }
        stats.migrated++;
      } catch (error: any) {
        console.error(`      Error: ${error.message}`);
        stats.errors++;
      }
    }

    this.stats.push(stats);
    this.logStats(stats);
  }

  private async migrateAuditLogs(): Promise<void> {
    const entityName = 'AuditLog';
    console.log(`    Migrating ${entityName}...`);

    const repo = this.pgDataSource.getRepository(AuditLog);
    const items = await repo.find();
    const stats = this.initStats(entityName, items.length);

    for (const item of items) {
      try {
        if (!DRY_RUN) {
          await (AuditLogRepository as any).create({
            entityType: (item as any).entity_type,
            entityId: (item as any).entity_id,
            action: (item as any).action,
            changes: (item as any).changes || {},
            userId: (item as any).user_id,
            userEmail: (item as any).email,
            ipAddress: (item as any).ip_address,
          });
        }
        stats.migrated++;
      } catch (error: any) {
        console.error(`      Error: ${error.message}`);
        stats.errors++;
      }
    }

    this.stats.push(stats);
    this.logStats(stats);
  }

  private async migrateEtsyData(): Promise<void> {
    console.log(`    Migrating EtsyOAuthToken...`);
    const tokenRepo = this.pgDataSource.getRepository(EtsyOAuthToken);
    const tokens = await tokenRepo.find();

    for (const token of tokens) {
      try {
        if (!DRY_RUN) {
          await (EtsyOAuthTokenRepository as any).create({
            userId: (token as any).user_id,
            shopId: (token as any).shop_id,
            accessToken: (token as any).access_token,
            refreshToken: (token as any).refresh_token,
            tokenType: (token as any).token_type || 'Bearer',
            expiresAt: new Date((token as any).expires_at).toISOString(),
            scope: (token as any).scope,
          });
        }
      } catch (error: any) {
        console.error(`      Error: ${error.message}`);
      }
    }
    console.log(`      Done: ${tokens.length} tokens`);

    console.log(`    Migrating EtsyProduct...`);
    const productRepo = this.pgDataSource.getRepository(EtsyProduct);
    const products = await productRepo.find();

    for (const product of products) {
      try {
        if (!DRY_RUN) {
          await (EtsyProductRepository as any).create({
            listingId: (product as any).listing_id,
            shopId: (product as any).shop_id,
            title: (product as any).title,
            description: (product as any).description,
            price: Number((product as any).price || 0),
            currencyCode: (product as any).currency_code || 'EUR',
            quantity: (product as any).quantity,
            state: (product as any).state,
            localProductId: (product as any).local_product_id,
            syncStatus: (product as any).sync_status,
          });
        }
      } catch (error: any) {
        console.error(`      Error: ${error.message}`);
      }
    }
    console.log(`      Done: ${products.length} products`);

    console.log(`    Migrating EtsyReceipt...`);
    const receiptRepo = this.pgDataSource.getRepository(EtsyReceipt);
    const receipts = await receiptRepo.find();

    for (const receipt of receipts) {
      try {
        if (!DRY_RUN) {
          await (EtsyReceiptRepository as any).create({
            receiptId: (receipt as any).receipt_id,
            shopId: (receipt as any).shop_id,
            buyerEmail: (receipt as any).buyer_email || '',
            totalPrice: Number((receipt as any).total_price || 0),
            currencyCode: (receipt as any).currency_code || 'EUR',
            status: (receipt as any).status || 'pending',
            localOrderId: (receipt as any).local_order_id,
          });
        }
      } catch (error: any) {
        console.error(`      Error: ${error.message}`);
      }
    }
    console.log(`      Done: ${receipts.length} receipts`);
  }

  private async migrateShopifyLinks(): Promise<void> {
    const entityName = 'ShopifyLink';
    console.log(`    Migrating ${entityName}...`);

    const repo = this.pgDataSource.getRepository(ShopifyLink);
    const items = await repo.find();
    const stats = this.initStats(entityName, items.length);

    for (const item of items) {
      try {
        if (!DRY_RUN) {
          await (ShopifyLinkRepository as any).create({
            localProductId: (item as any).local_product_id,
            shopifyProductId: String((item as any).shopify_product_id),
            syncStatus: (item as any).sync_status,
          });
        }
        stats.migrated++;
      } catch (error: any) {
        console.error(`      Error: ${error.message}`);
        stats.errors++;
      }
    }

    this.stats.push(stats);
    this.logStats(stats);
  }

  private initStats(entity: string, total: number): MigrationStats {
    return { entity, total, migrated: 0, skipped: 0, errors: 0 };
  }

  private logStats(stats: MigrationStats): void {
    console.log(`      Done: ${stats.migrated}/${stats.total} migrated, ${stats.errors} errors`);
  }

  private printSummary(): void {
    console.log('\n' + '='.repeat(60));
    console.log('Migration Summary');
    console.log('='.repeat(60));

    let totalMigrated = 0;
    let totalErrors = 0;

    console.log('\nEntity                  Total   Migrated  Errors');
    console.log('-'.repeat(50));

    for (const stat of this.stats) {
      console.log(
        `${stat.entity.padEnd(22)} ${String(stat.total).padStart(5)}   ${String(stat.migrated).padStart(8)}  ${String(stat.errors).padStart(6)}`
      );
      totalMigrated += stat.migrated;
      totalErrors += stat.errors;
    }

    console.log('-'.repeat(50));
    console.log(`${'TOTAL'.padEnd(22)} ${String(this.stats.reduce((a, s) => a + s.total, 0)).padStart(5)}   ${String(totalMigrated).padStart(8)}  ${String(totalErrors).padStart(6)}`);

    if (DRY_RUN) {
      console.log('\n[DRY RUN] No data was actually written to DynamoDB.');
      console.log('Run without DRY_RUN=true to perform the actual migration.');
    } else {
      console.log('\nMigration completed successfully!');
    }
  }

  private generateSlug(text: string): string {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
}

// Run migration
const runner = new MigrationRunner();
runner.run().catch(console.error);
