import dotenv from 'dotenv';

dotenv.config();

interface ServerConfig {
  port: number;
  environment: string;
}

interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  name: string;
  sslMode: string;
}

interface EtsyConfig {
  apiKey: string;
  apiSecret: string;
  shopId: string;
  shopName: string;
  shopUrl: string;
  accessToken: string;
  redirectUri: string;
  baseUrl: string;
  syncEnabled: boolean;
  syncIntervalProducts: number;
  syncIntervalInventory: number;
  rateLimitRequests: number;
  rateLimitWindow: number;
  paymentCallbackUrl: string;
}

interface SchedulerConfig {
  enabled: boolean;
}

interface RateLimitConfig {
  enabled: boolean;
  requestsPerMinute: number;
}

interface LoggingConfig {
  level: string;
  format: string;
}

export interface Config {
  server: ServerConfig;
  database: DatabaseConfig;
  etsy: EtsyConfig;
  scheduler: SchedulerConfig;
  rateLimit: RateLimitConfig;
  logging: LoggingConfig;
  jwtSecret: string;
  corsAllowedOrigins: string[];
  paymentProvider: string;
  stripeApiKey?: string;
  stripeWebhookSecret?: string;
  uploadMaxFileSize: number;
  uploadAllowedTypes: string[];
  uploadBaseDir: string;
}

const getEnv = (key: string, defaultValue: string): string => {
  return process.env[key] || defaultValue;
};

const getEnvInt = (key: string, defaultValue: number): number => {
  const value = process.env[key];
  return value ? parseInt(value, 10) : defaultValue;
};

const getEnvBool = (key: string, defaultValue: boolean): boolean => {
  const value = process.env[key];
  return value ? value.toLowerCase() === 'true' : defaultValue;
};

export const config: Config = {
  server: {
    port: getEnvInt('PORT', 8080),
    environment: getEnv('ENVIRONMENT', 'development'),
  },
  database: {
    host: getEnv('DB_HOST', 'localhost'),
    port: getEnvInt('DB_PORT', 5432),
    user: getEnv('DB_USER', 'artuser'),
    password: getEnv('DB_PASSWORD', 'artpassword'),
    name: getEnv('DB_NAME', 'artmanagement'),
    sslMode: getEnv('DB_SSLMODE', 'disable'),
  },
  etsy: {
    apiKey: getEnv('ETSY_API_KEY', ''),
    apiSecret: getEnv('ETSY_API_SECRET', ''),
    shopId: getEnv('ETSY_SHOP_ID', ''),
    shopName: getEnv('ETSY_SHOP_NAME', ''),
    shopUrl: getEnv('ETSY_SHOP_URL', ''),
    accessToken: getEnv('ETSY_ACCESS_TOKEN', ''),
    redirectUri: getEnv('ETSY_REDIRECT_URI', 'http://localhost:3000/admin/etsy-sync/callback'),
    baseUrl: getEnv('ETSY_API_BASE_URL', 'https://openapi.etsy.com/v3'),
    syncEnabled: getEnvBool('ETSY_SYNC_ENABLED', false),
    syncIntervalProducts: getEnvInt('ETSY_SYNC_INTERVAL_PRODUCTS', 3600),
    syncIntervalInventory: getEnvInt('ETSY_SYNC_INTERVAL_INVENTORY', 1800),
    rateLimitRequests: getEnvInt('ETSY_RATE_LIMIT_REQUESTS', 10000),
    rateLimitWindow: getEnvInt('ETSY_RATE_LIMIT_WINDOW', 86400),
    paymentCallbackUrl: getEnv('ETSY_PAYMENT_CALLBACK_URL', ''),
  },
  scheduler: {
    enabled: getEnvBool('SCHEDULER_ENABLED', true),
  },
  rateLimit: {
    enabled: getEnvBool('RATE_LIMIT_ENABLED', true),
    requestsPerMinute: getEnvInt('RATE_LIMIT_REQUESTS_PER_MINUTE', 60),
  },
  logging: {
    level: getEnv('LOG_LEVEL', 'info'),
    format: getEnv('LOG_FORMAT', 'json'),
  },
  jwtSecret: getEnv('JWT_SECRET', 'your-secret-key-change-in-production'),
  corsAllowedOrigins: getEnv('CORS_ALLOWED_ORIGINS', 'http://localhost:3000,http://localhost:3001').split(','),
  paymentProvider: getEnv('PAYMENT_PROVIDER', 'mock'),
  stripeApiKey: process.env.STRIPE_API_KEY,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  uploadMaxFileSize: getEnvInt('UPLOAD_MAX_FILE_SIZE', 10485760),
  uploadAllowedTypes: getEnv('UPLOAD_ALLOWED_TYPES', 'image/jpeg,image/jpg,image/png,image/gif,image/webp').split(','),
  uploadBaseDir: getEnv('UPLOAD_BASE_DIR', './uploads'),
};

export const isEtsyEnabled = (): boolean => {
  return !!(
    config.etsy.apiKey &&
    config.etsy.apiSecret &&
    config.etsy.shopId &&
    config.etsy.syncEnabled
  );
};

export const isProduction = (): boolean => config.server.environment === 'production';
export const isStaging = (): boolean => config.server.environment === 'staging';
export const isDevelopment = (): boolean => config.server.environment === 'development';
