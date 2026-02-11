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
 * Order interfaces
 */
export enum OrderStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
}

export interface Order {
  id: string;
  order_number: string;
  user_id?: number;
  customer_email: string;
  customer_name: string;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  currency: string;
  status: OrderStatus;
  payment_status?: string;
  payment_intent_id?: string;
  payment_method?: string;
  fulfillment_status?: string;
  shipping_address?: Record<string, any>;
  billing_address?: Record<string, any>;
  notes?: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

export interface CreateOrderData {
  user_id?: number;
  customer_email: string;
  customer_name: string;
  subtotal: number;
  tax?: number;
  discount?: number;
  total: number;
  currency?: string;
  status?: OrderStatus;
  payment_status?: string;
  payment_intent_id?: string;
  payment_method?: string;
  fulfillment_status?: string;
  shipping_address?: Record<string, any>;
  billing_address?: Record<string, any>;
  notes?: string;
}

export interface UpdateOrderData {
  customer_email?: string;
  customer_name?: string;
  subtotal?: number;
  tax?: number;
  discount?: number;
  total?: number;
  currency?: string;
  status?: OrderStatus;
  payment_status?: string;
  payment_intent_id?: string;
  payment_method?: string;
  fulfillment_status?: string;
  shipping_address?: Record<string, any>;
  billing_address?: Record<string, any>;
  notes?: string;
}

export interface OrderFilters {
  status?: OrderStatus;
  customer_email?: string;
  startDate?: string;
  endDate?: string;
}
