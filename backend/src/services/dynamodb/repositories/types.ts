/**
 * Types and interfaces for ProductRepository
 */

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

export interface PaginationParams {
  limit?: number;
  lastEvaluatedKey?: Record<string, any>;
}

export interface PaginatedResponse<T> {
  items: T[];
  lastEvaluatedKey?: Record<string, any>;
  count: number;
}

export interface ProductFilters {
  status?: ProductStatus;
  character_id?: number;
}

export interface CreateProductData {
  slug: string;
  title: string;
  short_description?: string;
  long_description?: string;
  base_price: number;
  currency?: string;
  sku?: string;
  gtin?: string;
  status?: ProductStatus;
  character_id?: number;
  character_value?: string;
  etsy_link?: string;
}

export interface UpdateProductData {
  slug?: string;
  title?: string;
  short_description?: string;
  long_description?: string;
  base_price?: number;
  currency?: string;
  sku?: string;
  gtin?: string;
  status?: ProductStatus;
  character_id?: number;
  character_value?: string;
  etsy_link?: string;
}

/**
 * ProductVariant interfaces
 */
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

/**
 * ProductImage interfaces
 */
export interface ProductImage {
  id: string;
  product_id: number;
  url: string;
  alt_text?: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface CreateProductImageData {
  product_id: number;
  url: string;
  alt_text?: string;
  position?: number;
}

export interface UpdateProductImageData {
  url?: string;
  alt_text?: string;
  position?: number;
}

/**
 * Etsy OAuth Token interfaces
 */
export interface EtsyOAuthToken {
  shop_id: string;
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_at: string; // ISO 8601 timestamp
  scope?: string;
  created_at: string;
  updated_at: string;
}

export interface UpsertEtsyOAuthTokenData {
  shop_id: string;
  access_token: string;
  refresh_token: string;
  token_type?: string;
  expires_at: string;
  scope?: string;
}

/**
 * Etsy Product interfaces
 */
export interface EtsyProduct {
  local_product_id: number;
  etsy_listing_id: number;
  title: string;
  description?: string;
  price?: number;
  quantity: number;
  sku?: string;
  state?: string;
  url?: string;
  last_synced_at?: string;
  sync_status: string;
  created_at: string;
  updated_at: string;
}

export interface CreateEtsyProductData {
  local_product_id: number;
  etsy_listing_id: number;
  title: string;
  description?: string;
  price?: number;
  quantity?: number;
  sku?: string;
  state?: string;
  url?: string;
  sync_status?: string;
}

export interface UpdateEtsyProductData {
  title?: string;
  description?: string;
  price?: number;
  quantity?: number;
  sku?: string;
  state?: string;
  url?: string;
  last_synced_at?: string;
  sync_status?: string;
}

/**
 * Etsy Receipt interfaces
 */
export interface EtsyReceipt {
  etsy_receipt_id: number;
  local_order_id?: number;
  shop_id: string;
  buyer_email?: string;
  buyer_name?: string;
  status?: string;
  is_paid: boolean;
  is_shipped: boolean;
  grand_total?: number;
  subtotal?: number;
  total_shipping_cost?: number;
  total_tax_cost?: number;
  currency?: string;
  payment_method?: string;
  shipping_address?: string;
  message_from_buyer?: string;
  etsy_created_at: string;
  etsy_updated_at: string;
  last_synced_at?: string;
  sync_status: string;
  created_at: string;
  updated_at: string;
}

export interface CreateEtsyReceiptData {
  etsy_receipt_id: number;
  local_order_id?: number;
  shop_id: string;
  buyer_email?: string;
  buyer_name?: string;
  status?: string;
  is_paid?: boolean;
  is_shipped?: boolean;
  grand_total?: number;
  subtotal?: number;
  total_shipping_cost?: number;
  total_tax_cost?: number;
  currency?: string;
  payment_method?: string;
  shipping_address?: string;
  message_from_buyer?: string;
  etsy_created_at: string;
  etsy_updated_at: string;
  sync_status?: string;
}

export interface UpdateEtsyReceiptData {
  local_order_id?: number | null;
  buyer_email?: string;
  buyer_name?: string;
  status?: string;
  is_paid?: boolean;
  is_shipped?: boolean;
  grand_total?: number;
  subtotal?: number;
  total_shipping_cost?: number;
  total_tax_cost?: number;
  currency?: string;
  payment_method?: string;
  shipping_address?: string;
  message_from_buyer?: string;
  etsy_updated_at?: string;
  last_synced_at?: string;
  sync_status?: string;
}

/**
 * Etsy Sync Config interfaces
 */
export enum EtsySyncType {
  PRODUCT = 'product',
  INVENTORY = 'inventory',
  RECEIPT = 'receipt',
}

export interface EtsySyncConfig {
  shop_id: string;
  last_product_sync?: string;
  last_inventory_sync?: string;
  last_receipt_sync?: string;
  sync_status: string;
  sync_error?: string;
  rate_limit_remaining: number;
  rate_limit_reset_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateEtsySyncConfigData {
  shop_id: string;
  sync_status?: string;
  rate_limit_remaining?: number;
}

export interface UpdateEtsySyncConfigData {
  last_product_sync?: string;
  last_inventory_sync?: string;
  last_receipt_sync?: string;
  sync_status?: string;
  sync_error?: string;
  rate_limit_remaining?: number;
  rate_limit_reset_at?: string;
}
