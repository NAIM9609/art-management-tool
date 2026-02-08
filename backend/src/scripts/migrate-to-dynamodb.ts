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
            parent_id: category.parent_id || undefined,
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
            description: item.description,
            icon: item.icon,
            images: (item as any).images || undefined,
            backgroundColor: (item as any).backgroundColor || undefined,
            backgroundType: (item as any).backgroundType || undefined,
            gradientFrom: (item as any).gradientFrom || undefined,
            gradientTo: (item as any).gradientTo || undefined,
            backgroundImage: (item as any).backgroundImage || undefined,
            order: item.order,
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
            description: item.description,
            coverImage: item.coverImage,
            pages: item.pages || [],
            order: item.order,
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
            type: item.type,
            value: Number(item.value),
            min_order_value: item.min_order_value ? Number(item.min_order_value) : undefined,
            max_uses: item.max_uses,
            valid_from: item.valid_from ? new Date(item.valid_from).toISOString() : undefined,
            valid_until: item.valid_until ? new Date(item.valid_until).toISOString() : undefined,
            is_active: item.is_active,
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
            title: item.title,
            slug: item.slug,
            short_description: item.short_description,
            long_description: item.long_description,
            base_price: Number(item.base_price),
            currency: (item as any).currency || 'EUR',
            sku: (item as any).sku || undefined,
            gtin: (item as any).gtin || undefined,
            status: item.status,
            character_id: (item as any).character_id || undefined,
            character_value: (item as any).character_value || undefined,
            etsy_link: (item as any).etsy_link || undefined,
          });

          for (const image of item.images || []) {
            await (ProductImageRepository as any).create({
              product_id: item.id,
              url: (image as any).url,
              alt_text: (image as any).alt_text || undefined,
              position: (image as any).sort_order || 0,
            });
          }

          for (const variant of item.variants || []) {
            const variantPrice = Number((variant as any).price || item.base_price);
            const basePrice = Number(item.base_price || 0);
            await (ProductVariantRepository as any).create({
              product_id: item.id,
              sku: (variant as any).sku,
              name: (variant as any).name,
              attributes: (variant as any).attributes || undefined,
              price_adjustment: variantPrice - basePrice,
              stock: (variant as any).stock_quantity || 0,
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
            user_id: (item as any).user_id,
            customer_email: (item as any).customer_email,
            customer_name: (item as any).customer_name,
            shipping_address: (item as any).shipping_address,
            billing_address: (item as any).billing_address,
            subtotal: Number((item as any).subtotal || 0),
            tax: Number((item as any).tax || 0),
            discount: Number((item as any).discount_amount || 0),
            total: Number((item as any).total || 0),
            currency: (item as any).currency || 'EUR',
            payment_status: (item as any).payment_status,
            payment_intent_id: (item as any).payment_intent_id || undefined,
            payment_method: (item as any).payment_method || undefined,
            fulfillment_status: (item as any).fulfillment_status,
            notes: (item as any).notes,
          }, ((item as any).items || []).map((orderItem: any) => ({
            product_id: orderItem.product_id,
            variant_id: orderItem.variant_id,
            product_name: orderItem.product_name || '',
            variant_name: orderItem.variant_name || '',
            sku: orderItem.sku || '',
            quantity: orderItem.quantity,
            unit_price: Number(orderItem.unit_price),
            total_price: Number(orderItem.total_price),
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
            session_id: (item as any).session_id,
            user_id: (item as any).user_id,
          });

          for (const cartItem of (item as any).items || []) {
            await (CartItemRepository as any).create({
              cart_id: (item as any).session_id,
              product_id: cartItem.product_id,
              variant_id: cartItem.variant_id,
              product_name: cartItem.product?.title || undefined,
              product_slug: cartItem.product?.slug || undefined,
              variant_name: cartItem.variant?.name || undefined,
              product_image: cartItem.product?.images?.[0]?.url || undefined,
              quantity: cartItem.quantity,
              price_at_time: Number(cartItem.price || 0),
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
            metadata: {
              ...(item as any).metadata,
              ...(item as any).user_id ? { user_id: (item as any).user_id } : {},
            },
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
            entity_type: (item as any).entity_type,
            entity_id: (item as any).entity_id,
            action: (item as any).action,
            changes: (item as any).changes || {},
            user_id: (item as any).user_id,
            ip_address: (item as any).ip_address,
            user_agent: (item as any).user_agent || undefined,
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
            shop_id: (token as any).shop_id,
            access_token: (token as any).access_token,
            refresh_token: (token as any).refresh_token,
            token_type: (token as any).token_type || 'Bearer',
            expires_at: new Date((token as any).expires_at).toISOString(),
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
            local_product_id: (product as any).local_product_id,
            etsy_listing_id: (product as any).listing_id,
            etsy_inventory_id: (product as any).inventory_id || undefined,
            sync_status: (product as any).sync_status,
            last_synced_at: (product as any).last_synced_at || undefined,
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
            etsy_receipt_id: (receipt as any).receipt_id,
            local_order_id: (receipt as any).local_order_id,
            shop_id: (receipt as any).shop_id,
            buyer_email: (receipt as any).buyer_email || undefined,
            buyer_name: (receipt as any).buyer_name || undefined,
            status: (receipt as any).status || 'pending',
            is_paid: Boolean((receipt as any).is_paid),
            is_shipped: Boolean((receipt as any).is_shipped),
            grand_total: Number((receipt as any).total_price || 0),
            currency: (receipt as any).currency_code || 'EUR',
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
            local_product_id: (item as any).local_product_id,
            shopify_product_id: String((item as any).shopify_product_id),
            shopify_variant_id: (item as any).shopify_variant_id ? String((item as any).shopify_variant_id) : undefined,
            sync_status: (item as any).sync_status,
            last_synced_at: (item as any).last_synced_at || undefined,
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

}

// Run migration
const runner = new MigrationRunner();
runner.run().catch(console.error);
