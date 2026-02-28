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
 * Personaggio (Character) interfaces
 */
export interface Personaggio {
  id: number;
  name: string;
  description?: string;
  images: string[];
  order: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

/**
 * Fumetto interfaces
 */
export interface Fumetto {
  id: number;
  title: string;
  description?: string;
  coverImage?: string;
  pages?: string[];
  order: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

export interface CreateFumettoData {
  title: string;
  description?: string;
  coverImage?: string;
  pages?: string[];
  order?: number;
}

export interface UpdateFumettoData {
  title?: string;
  description?: string;
  coverImage?: string;
  pages?: string[];
  order?: number;
}
/**
 * Cart interfaces
 */
export interface Cart {
  id: string;
  session_id?: string;
  user_id?: number;
  discount_code?: string;
  discount_amount?: number;
  created_at: string;
  updated_at: string;
  expires_at: number; // TTL timestamp in seconds
}

export interface CreateCartData {
  session_id?: string;
  user_id?: number;
  discount_code?: string;
  discount_amount?: number;
}

export interface UpdateCartData {
  session_id?: string;
  user_id?: number;
  discount_code?: string;
  discount_amount?: number;
}

/**
 * CartItem interfaces
 */
export interface CartItem {
  id: string;
  cart_id: string;
  product_id: number;
  variant_id?: number;
  quantity: number;
  created_at: string;
  updated_at: string;
}

export interface CreateCartItemData {
  cart_id: string;
  product_id: number;
  variant_id?: number;
  quantity: number;
}

export interface UpdateCartItemData {
  quantity?: number;
}

export interface OrderItem {
  id: string;
  order_id: number;
  product_id?: number;
  variant_id?: string;
  product_name: string;
  variant_name?: string;
  sku?: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  created_at: string;
}

export interface CreateOrderItemData {
  order_id: number;
  product_id?: number;
  variant_id?: string;
  product_name: string;
  variant_name?: string;
  sku?: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  }
 /* Order interfaces
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

/* Category interfaces
 */
export interface Category {
  id: number;
  name: string;
  slug: string;
  description?: string;
  parent_id?: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
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
export interface CreatePersonaggioData {
  name: string;
  description?: string;
  images?: string[];
  order?: number;
}

export interface UpdatePersonaggioData {
  name?: string;
  description?: string;
  images?: string[];
  order?: number;
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

/**
 * OrderSummary - Partial order data for list/query operations
 * Used when projection expressions fetch only a subset of fields
 */
export interface OrderSummary {
  id: string;
  order_number: string;
  customer_email: string;
  customer_name: string;
  total: number;
  status: OrderStatus;
  created_at: string;
  // Optional fields that may be included in some projections
  subtotal?: number;
  tax?: number;
  discount?: number;
  currency?: string;
  updated_at?: string;
  }

export interface CreateCategoryData {
  name: string;
  slug: string;
  description?: string;
  parent_id?: number;
}

export interface UpdateCategoryData {
  name?: string;
  slug?: string;
  description?: string;
  parent_id?: number;
}

export interface CategoryProduct {
  category_id: number;
  product_id: number;
  created_at: string;
}
