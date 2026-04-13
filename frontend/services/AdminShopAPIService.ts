/**
 * Admin Shop API Service - Frontend client for admin shop management
 * Refactored to use shared apiUtils and external type definitions
 */

import { fetchWithAuth, uploadFile } from './apiUtils';
import type {
  Product,
  ProductListResponse,
  CreateProductRequest,
  UpdateProductRequest,
  ProductVariant,
  CreateVariantRequest,
  InventoryAdjustRequest,
  Order,
  OrderListResponse,
  Notification,
  NotificationListResponse,
  ProductImage,
} from './adminShopTypes';

// Helper function to build query params
function buildQueryParams(params?: Record<string, string | number | boolean | undefined>): string {
  if (!params) return '';
  const queryParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      queryParams.append(key, String(value));
    }
  });
  const query = queryParams.toString();
  return query ? `?${query}` : '';
}

// ==================== Admin Shop API Service ====================

class AdminShopAPIService {
  // ==================== Products ====================

  async listProducts(params?: {
    status?: string;
    category?: number;
    search?: string;
    page?: number;
    per_page?: number;
  }): Promise<ProductListResponse> {
    const query = buildQueryParams(params);
    return fetchWithAuth<ProductListResponse>(`/api/products${query}`, {}, true);
  }

  async getProduct(id: number): Promise<Product> {
    return fetchWithAuth<Product>(`/api/products/${id}`, {}, true);
  }

  async createProduct(data: CreateProductRequest): Promise<Product> {
    return fetchWithAuth<Product>('/api/products', { method: 'POST', body: JSON.stringify(data) }, true);
  }

  async updateProduct(id: number, data: UpdateProductRequest): Promise<void> {
    await fetchWithAuth<void>(`/api/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }, true);
  }

  async deleteProduct(id: number): Promise<void> {
    await fetchWithAuth<void>(`/api/products/${id}`, { method: 'DELETE' }, true);
  }

  async addVariant(productId: number, data: CreateVariantRequest): Promise<ProductVariant> {
    return fetchWithAuth<ProductVariant>(
      `/api/products/${productId}/variants`,
      { method: 'POST', body: JSON.stringify(data) },
      true
    );
  }

  async updateVariant(variantId: number, data: Partial<CreateVariantRequest>): Promise<void> {
    await fetchWithAuth<void>(`/api/variants/${variantId}`, { method: 'PUT', body: JSON.stringify(data) }, true);
  }

  async adjustInventory(data: InventoryAdjustRequest): Promise<void> {
    await fetchWithAuth<void>(`/api/variants/${data.variant_id}/stock`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity: data.quantity, operation: data.operation }),
    }, true);
  }

  // ==================== Orders ====================

  async listOrders(params?: {
    payment_status?: string;
    fulfillment_status?: string;
    customer_email?: string;
    start_date?: string;
    end_date?: string;
    page?: number;
    per_page?: number;
  }): Promise<OrderListResponse> {
    const query = buildQueryParams(params);
    return fetchWithAuth<OrderListResponse>(`/api/admin/orders${query}`, {}, true);
  }

  async getOrder(id: number): Promise<Order> {
    return fetchWithAuth<Order>(`/api/orders/${id}`, {}, true);
  }

  async updateFulfillmentStatus(
    id: number,
    status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded'
  ): Promise<void> {
    await fetchWithAuth<void>(
      `/api/admin/orders/${id}/status`,
      { method: 'PATCH', body: JSON.stringify({ status }) },
      true
    );
  }

  async refundOrder(id: number, amount?: number): Promise<void> {
    await fetchWithAuth<void>(
      `/api/admin/orders/${id}/status`,
      { method: 'PATCH', body: JSON.stringify({ status: 'refunded', ...(amount ? { amount } : {}) }) },
      true
    );
  }

  // ==================== Notifications ====================

  async listNotifications(params?: {
    type?: string;
    severity?: string;
    unread?: boolean;
    page?: number;
    per_page?: number;
  }): Promise<NotificationListResponse> {
    const query = buildQueryParams(params);
    return fetchWithAuth<NotificationListResponse>(`/api/admin/notifications${query}`, {}, true);
  }

  async markAsRead(id: number): Promise<void> {
    await fetchWithAuth<void>(`/api/admin/notifications/${id}/read`, { method: 'PATCH' }, true);
  }

  async markAllAsRead(): Promise<void> {
    await fetchWithAuth<void>('/api/admin/notifications/mark-all-read', { method: 'POST' }, true);
  }

  async deleteNotification(id: number): Promise<void> {
    await fetchWithAuth<void>(`/api/admin/notifications/${id}`, { method: 'DELETE' }, true);
  }

  // ==================== Image Management ====================

  async uploadProductImage(
    productId: number,
    file: File,
    altText?: string,
    position?: number
  ): Promise<{ message: string; image: ProductImage }> {
    const formData = new FormData();
    formData.append('file', file);
    if (altText) formData.append('alt_text', altText);
    if (position !== undefined) formData.append('position', position.toString());

    const response = await uploadFile(`/api/products/${productId}/images`, formData);
    return response.json();
  }

  async listProductImages(productId: number): Promise<{ images: ProductImage[] }> {
    return fetchWithAuth<{ images: ProductImage[] }>(`/api/products/${productId}/images`, {}, true);
  }

  async updateProductImage(
    productId: number,
    imageId: number,
    data: { position?: number; alt_text?: string }
  ): Promise<{ message: string }> {
    return fetchWithAuth<{ message: string }>(
      `/api/products/${productId}/images/${imageId}`,
      { method: 'PATCH', body: JSON.stringify(data) },
      true
    );
  }

  async deleteProductImage(productId: number, imageId: number): Promise<{ message: string }> {
    return fetchWithAuth<{ message: string }>(
      `/api/products/${productId}/images/${imageId}`,
      { method: 'DELETE' },
      true
    );
  }
}

// Export singleton instance
export const adminShopAPI = new AdminShopAPIService();
export default adminShopAPI;

// Re-export types for convenience
export type * from './adminShopTypes';

