/**
 * Shop API Service - Frontend client for e-commerce shop endpoints
 * Handles public shop API interactions (products, cart, checkout)
 */

import { getCached, setCached, CACHE_TTL } from './apiUtils';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';

// ==================== Types ====================

export interface Product {
  id: number;
  slug: string;
  title: string;
  short_description: string;
  long_description?: string;
  base_price: number;
  currency: string;
  sku: string;
  gtin?: string;
  status: 'published' | 'draft' | 'archived';
  character_id?: number;
  character_value?: string;
  etsy_link?: string;
  categories?: Category[];
  images?: ProductImage[];
  variants?: ProductVariant[];
  created_at?: string;
  updated_at?: string;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  description?: string;
}

export interface ProductImage {
  id: number;
  url: string;
  alt_text?: string;
  position: number;
  is_primary?: boolean; // Compatibilità con AdminShopAPIService
}

export interface ProductVariant {
  id: number;
  product_id: number;
  sku: string;
  name: string;
  attributes: string; // JSON string
  price_adjustment: number;
  stock: number;
}

export interface ProductListResponse {
  products: Product[];
  total: number;
  page: number;
  per_page: number;
  /** DynamoDB pagination cursor for the next page */
  lastEvaluatedKey?: string | null;
}

export interface Cart {
  id: number;
  session_token: string;
  user_id?: number;
  items: CartItem[];
  discount_code?: string;
  created_at: string;
  updated_at: string;
}

export interface CartItem {
  id: number;
  cart_id: number;
  product_id: number;
  variant_id?: number;
  quantity: number;
  product?: Product;
  variant?: ProductVariant;
}

export interface CartResponse {
  cart: Cart;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
}

export interface CheckoutRequest {
  session_token?: string;
  email: string;
  name: string;
  payment_method: string;
  shipping_address: Address;
  billing_address?: Address;
  discount_code?: string;
}

export interface Address {
  street: string;
  city: string;
  state: string;
  zip_code: string;
  country: string;
}

export interface CheckoutResponse {
  order_id: string;
  order_number: string;
  payment_intent_id?: string;
  client_secret?: string;
  total: number;
  status: string;
}

export interface DiscountResponse {
  discount_code: string;
  discount_type: string;
  discount_value: number;
  discount_amount: number;
  subtotal: number;
  tax: number;
  total_before: number;
  total_after: number;
}

// ==================== Shop API Service ====================

class ShopAPIService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = `${API_BASE_URL}/api/shop`;
  }

  /**
   * Get or generate cart session token
   * Uses hybrid approach: cookie first, localStorage fallback, generate new if needed
   */
  private getSessionToken(): string | null {
    if (typeof document === 'undefined') return null;
    
    const allCookies = document.cookie;
    console.log(`🍪 Frontend: All cookies: ${allCookies || 'none'}`);
    
    // Try to get from cookie first
    const cookieMatch = document.cookie.match(/cart_session=([^;]+)/);
    let token = cookieMatch ? cookieMatch[1] : null;
    
    if (token) {
      console.log(`🍪 Frontend: Found cookie token: ${token.substring(0, 20)}...`);
      // Store in localStorage as backup
      localStorage.setItem('cart_session_backup', token);
      return token;
    }
    
    // Fallback to localStorage
    token = localStorage.getItem('cart_session_backup');
    if (token) {
      console.log(`🍪 Frontend: Using localStorage backup token: ${token.substring(0, 20)}...`);
      // Try to restore cookie
      document.cookie = `cart_session=${token}; path=/; max-age=${86400 * 7}; SameSite=Lax`;
      return token;
    }
    
    console.log(`🍪 Frontend: No session token found`);
    return null;
  }

  /**
   * Set session token in both cookie and localStorage
   */
  private setSessionToken(token: string): void {
    if (typeof document === 'undefined') return;
    
    console.log(`🍪 Frontend: Setting session token: ${token.substring(0, 20)}...`);
    
    // Set cookie
    document.cookie = `cart_session=${token}; path=/; max-age=${86400 * 7}; SameSite=Lax`;
    
    // Set localStorage backup
    localStorage.setItem('cart_session_backup', token);
  }

  /**
   * Make API request with retry logic (max 3 attempts, exponential backoff on 5xx),
   * development logging, and Lambda/API Gateway error handling.
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const method = options.method || 'GET';

    // Get session token for header fallback
    const sessionToken = this.getSessionToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (sessionToken) {
      headers['X-Cart-Session'] = sessionToken;
    }

    /** Compute exponential back-off delay: 1 s, 2 s, 4 s … */
    const backoffMs = (attempt: number) => Math.pow(2, attempt - 1) * 1000;

    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const startTime = Date.now();
      if (process.env.NODE_ENV !== 'production') {
        console.log(
          `[ShopAPI] ${method} ${url}${attempt > 1 ? ` (attempt ${attempt}/${maxRetries})` : ''}`
        );
      }

      let response: Response;
      try {
        response = await fetch(url, {
          ...options,
          headers,
          credentials: 'include',
        });
      } catch (networkError) {
        const elapsed = Date.now() - startTime;
        if (process.env.NODE_ENV !== 'production') {
          console.log(`[ShopAPI] ${method} ${url} → network error (${elapsed}ms)`);
        }
        if (attempt === maxRetries) throw networkError;
        await new Promise((resolve) => setTimeout(resolve, backoffMs(attempt)));
        continue;
      }

      const elapsed = Date.now() - startTime;
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[ShopAPI] ${method} ${url} → ${response.status} (${elapsed}ms)`);
      }

      // Retry on 5xx unless retries are exhausted
      if (response.status >= 500 && attempt < maxRetries) {
        const delay = backoffMs(attempt);
        if (process.env.NODE_ENV !== 'production') {
          console.log(`[ShopAPI] Retrying in ${delay}ms (status ${response.status})`);
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      if (!response.ok) {
        let errorMessage: string;
        try {
          const errorDetails = await response.json();
          // Handle Lambda/API Gateway error formats
          errorMessage =
            errorDetails.error ||
            errorDetails.message ||
            errorDetails.errorMessage ||
            `HTTP ${response.status}`;
        } catch {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();

      // Persist cart session token when returned by the backend
      if (data && typeof data === 'object' && data.cart && data.cart.session_token) {
        this.setSessionToken(data.cart.session_token);
      }

      return data;
    }

    throw new Error('Max retries exceeded');
  }

  // ==================== Health Check ====================

  /**
   * Check if backend is responding
   */
  async healthCheck(): Promise<{ status: string; message?: string }> {
    try {
      return await this.request<{ status: string; message?: string }>('/health');
    } catch (error) {
      throw new Error(
        `Backend not responding: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // ==================== Products ====================

  /**
   * Get all products with optional filters and DynamoDB cursor-based pagination.
   * This is the primary method for listing products with the Lambda backend.
   */
  async getAllProducts(params?: {
    status?: string;
    limit?: number;
    lastKey?: string;
  }): Promise<ProductListResponse> {
    const queryParams = new URLSearchParams();
    if (params?.status) queryParams.append('status', params.status);
    if (params?.limit) queryParams.append('limit', String(params.limit));
    if (params?.lastKey) queryParams.append('last_key', params.lastKey);

    const cacheKey = `products:${queryParams.toString()}`;
    const cached = getCached<ProductListResponse>(cacheKey);
    if (cached) return cached;

    const query = queryParams.toString();
    const data = await this.request<ProductListResponse>(
      `/products${query ? `?${query}` : ''}`
    );

    setCached(cacheKey, data, CACHE_TTL.PRODUCTS);
    return data;
  }

  /**
   * Get a single product by slug (cached for 5 minutes)
   */
  async getProductBySlug(slug: string): Promise<Product> {
    const cacheKey = `product:${slug}`;
    const cached = getCached<Product>(cacheKey);
    if (cached) return cached;

    const data = await this.request<Product>(`/products/${slug}`);
    setCached(cacheKey, data, CACHE_TTL.PRODUCTS);
    return data;
  }

  /**
   * Search products by term with cursor-based pagination
   */
  async searchProducts(
    term: string,
    params?: { limit?: number; lastKey?: string }
  ): Promise<ProductListResponse> {
    const queryParams = new URLSearchParams({ search: term });
    if (params?.limit) queryParams.append('limit', String(params.limit));
    if (params?.lastKey) queryParams.append('last_key', params.lastKey);

    const cacheKey = `products:search:${queryParams.toString()}`;
    const cached = getCached<ProductListResponse>(cacheKey);
    if (cached) return cached;

    const data = await this.request<ProductListResponse>(
      `/products?${queryParams.toString()}`
    );

    setCached(cacheKey, data, CACHE_TTL.PRODUCTS);
    return data;
  }

  /**
   * List products with extended filters and pagination.
   * Supports both legacy page-based and new lastKey cursor pagination.
   */
  async listProducts(params?: {
    status?: string;
    category?: number;
    character?: number;
    character_value?: string;
    min_price?: number;
    max_price?: number;
    search?: string;
    in_stock?: boolean;
    page?: number;
    per_page?: number;
    sort_by?: string;
    sort_order?: string;
    /** DynamoDB cursor for next page (replaces page when provided) */
    lastKey?: string;
  }): Promise<ProductListResponse> {
    const queryParams = new URLSearchParams();

    if (params) {
      const { lastKey, ...rest } = params;
      Object.entries(rest).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, String(value));
        }
      });
      if (lastKey) queryParams.append('last_key', lastKey);
    }

    const query = queryParams.toString();
    return this.request<ProductListResponse>(
      `/products${query ? `?${query}` : ''}`
    );
  }

  /**
   * Get product by slug (legacy alias – prefer getProductBySlug)
   */
  async getProduct(slug: string): Promise<Product> {
    return this.getProductBySlug(slug);
  }

  // ==================== Cart ====================

  /**
   * Get current cart
   */
  async getCart(): Promise<CartResponse> {
    return this.request<CartResponse>('/cart');
  }

  /**
   * Add item to cart
   */
  async addToCart(data: {
    product_id: number;
    variant_id?: number;
    quantity: number;
  }): Promise<CartResponse> {
    return this.request<CartResponse>('/cart/items', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Update cart item quantity
   */
  async updateCartItem(itemId: number, quantity: number): Promise<CartResponse> {
    if (quantity < 1) {
      throw new Error('Quantity must be at least 1');
    }

    return this.request<CartResponse>(`/cart/items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity }),
    });
  }

  /**
   * Remove item from cart
   */
  async removeCartItem(itemId: number): Promise<void> {
    await this.request(`/cart/items/${itemId}`, {
      method: 'DELETE',
    });
  }

  /**
   * Clear entire cart
   */
  async clearCart(): Promise<void> {
    await this.request('/cart', {
      method: 'DELETE',
    });
  }

  // ==================== Checkout ====================

  /**
   * Apply discount code
   */
  async applyDiscount(code: string): Promise<DiscountResponse> {
    return this.request<DiscountResponse>('/cart/discount', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  }

  /**
   * Process checkout
   */
  async checkout(data: CheckoutRequest): Promise<CheckoutResponse> {
    // Include session token from cookie if not provided
    if (!data.session_token) {
      const sessionToken = this.getSessionToken();
      if (sessionToken) {
        data.session_token = sessionToken;
      }
    }

    return this.request<CheckoutResponse>('/checkout', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
}

// Export singleton instance
export const shopAPI = new ShopAPIService();
export default shopAPI;
