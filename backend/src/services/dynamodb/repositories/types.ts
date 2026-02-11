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
 * DiscountCode interfaces
 */
export enum DiscountType {
  PERCENTAGE = 'percentage',
  FIXED = 'fixed',
}

export interface DiscountCode {
  id: number;
  code: string;
  description?: string;
  discount_type: DiscountType;
  discount_value: number;
  min_purchase_amount?: number;
  max_discount_amount?: number;
  valid_from: string;
  valid_until?: string;
  max_uses?: number;
  times_used: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

export interface CreateDiscountCodeData {
  code: string;
  description?: string;
  discount_type: DiscountType;
  discount_value: number;
  min_purchase_amount?: number;
  max_discount_amount?: number;
  valid_from?: string;
  valid_until?: string;
  max_uses?: number;
  is_active?: boolean;
}

export interface UpdateDiscountCodeData {
  code?: string;
  description?: string;
  discount_type?: DiscountType;
  discount_value?: number;
  min_purchase_amount?: number;
  max_discount_amount?: number;
  valid_from?: string;
  valid_until?: string;
  max_uses?: number;
  is_active?: boolean;
}

export interface DiscountCodeFilters {
  is_active?: boolean;
}

export interface DiscountCodeStats {
  code: string;
  times_used: number;
  max_uses?: number;
  usage_percentage?: number;
  is_active: boolean;
  is_expired: boolean;
  is_max_uses_reached: boolean;
}
