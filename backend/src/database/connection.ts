import 'reflect-metadata';
import { DataSource, DataSourceOptions } from 'typeorm';
import { config } from '../config';
import { Category } from '../entities/Category';
import { EnhancedProduct } from '../entities/EnhancedProduct';
import { ProductImage } from '../entities/ProductImage';
import { ProductVariant } from '../entities/ProductVariant';
import { Cart } from '../entities/Cart';
import { CartItem } from '../entities/CartItem';
import { Order } from '../entities/Order';
import { OrderItem } from '../entities/OrderItem';
import { Notification } from '../entities/Notification';
import { AuditLog } from '../entities/AuditLog';
import { DiscountCode } from '../entities/DiscountCode';
import { ShopifyLink } from '../entities/ShopifyLink';
import { EtsyOAuthToken } from '../entities/EtsyOAuthToken';
import { EtsySyncConfig } from '../entities/EtsySyncConfig';
import { EtsyProduct } from '../entities/EtsyProduct';
import { EtsyInventorySyncLog } from '../entities/EtsyInventorySyncLog';
import { EtsyReceipt } from '../entities/EtsyReceipt';
import { Personaggio } from '../entities/Personaggio';
import { Fumetto } from '../entities/Fumetto';

const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: config.database.host,
  port: config.database.port,
  username: config.database.user,
  password: config.database.password,
  database: config.database.name,
  ssl: config.database.sslMode === 'disable' ? false : { rejectUnauthorized: false },
  entities: [
    Category,
    EnhancedProduct,
    ProductImage,
    ProductVariant,
    Cart,
    CartItem,
    Order,
    OrderItem,
    Notification,
    AuditLog,
    DiscountCode,
    ShopifyLink,
    EtsyOAuthToken,
    EtsySyncConfig,
    EtsyProduct,
    EtsyInventorySyncLog,
    EtsyReceipt,
    Personaggio,
    Fumetto,
  ],
  synchronize: false,
  logging: config.logging.level === 'debug',
  migrations: ['src/database/migrations/*.ts'],
  migrationsTableName: 'migrations',
};

export const AppDataSource = new DataSource(dataSourceOptions);

export const initializeDatabase = async (): Promise<void> => {
  try {
    console.log(`Connecting to database at ${config.database.host}:${config.database.port}...`);
    await AppDataSource.initialize();
    console.log('Database connection established successfully');
    
    console.log('Running database migrations...');
    await AppDataSource.synchronize();
    await runCustomMigrations();
    console.log('Database migrations completed successfully');
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw error;
  }
};

async function runCustomMigrations(): Promise<void> {
  try {
    console.log('Running custom migrations...');
    await migrateOrderNumber();
  } catch (error) {
    console.error('Failed to run custom migrations:', error);
    throw error;
  }
}

async function migrateOrderNumber(): Promise<void> {
  try {
    const tableExists = await AppDataSource.query(`
      SELECT EXISTS (
        SELECT 1 
        FROM information_schema.tables 
        WHERE table_name = 'orders'
      )
    `);

    if (!tableExists[0].exists) {
      console.log('Orders table does not exist yet, skipping order_number migration');
      return;
    }

    const result = await AppDataSource.query(
      "SELECT COUNT(*) as count FROM orders WHERE order_number IS NULL"
    );
    const nullCount = parseInt(result[0].count, 10);

    if (nullCount > 0) {
      console.log(`Found ${nullCount} orders with NULL order_number, populating...`);
      await AppDataSource.query(`
        UPDATE orders 
        SET order_number = CONCAT('ORD-', LPAD(CAST(id AS TEXT), 8, '0'))
        WHERE order_number IS NULL OR order_number = ''
      `);
      console.log('order_number populated successfully');
    } else {
      console.log('All orders already have order_number, skipping migration');
    }
  } catch (error) {
    console.warn('Warning: Could not migrate order_number:', error);
  }
}

export const closeDatabase = async (): Promise<void> => {
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
  }
};
