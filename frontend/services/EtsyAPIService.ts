/**
 * Etsy API Service - Frontend client for Etsy integration management
 * Handles Etsy product and inventory synchronization operations
 */

import { fetchWithAuth } from './apiUtils';
import type {
  EtsyProduct,
  EtsyProductListResponse,
  SyncStatus,
  InventorySyncLog,
  InventorySyncLogResponse,
  EtsyConfig,
  SyncTriggerRequest,
} from './etsyTypes';

// Re-export types for convenience
export type {
  EtsyProduct,
  EtsyProductListResponse,
  SyncStatus,
  InventorySyncLog,
  InventorySyncLogResponse,
  EtsyConfig,
  SyncTriggerRequest,
  LinkProductRequest,
} from './etsyTypes';

// ==================== Helper Functions ====================

function buildQueryString(params?: Record<string, unknown>): string {
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

// ==================== Etsy API Service ====================

class EtsyAPIService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = '/api/admin/integrations/etsy';
  }

  // ==================== Sync Management ====================

  /**
   * Trigger product synchronization
   */
  async triggerProductSync(request?: SyncTriggerRequest): Promise<{ message: string; status: string }> {
    return fetchWithAuth(`${this.baseUrl}/sync/products`, {
      method: 'POST',
      body: JSON.stringify(request || {}),
    }, true);
  }

  /**
   * Trigger inventory synchronization
   */
  async triggerInventorySync(request?: SyncTriggerRequest): Promise<{ message: string; status: string }> {
    return fetchWithAuth(`${this.baseUrl}/sync/inventory`, {
      method: 'POST',
      body: JSON.stringify(request || {}),
    }, true);
  }

  /**
   * Get synchronization status
   */
  async getSyncStatus(): Promise<SyncStatus> {
    return fetchWithAuth<SyncStatus>(`${this.baseUrl}/sync/status`, {}, true);
  }

  /**
   * Get inventory sync logs
   */
  async getInventorySyncLogs(params?: {
    listing_id?: string;
    status?: string;
    page?: number;
    per_page?: number;
  }): Promise<InventorySyncLogResponse> {
    const query = buildQueryString(params);
    return fetchWithAuth<InventorySyncLogResponse>(
      `${this.baseUrl}/sync/logs${query}`,
      {},
      true
    );
  }

  // ==================== Product Management ====================

  /**
   * List Etsy products
   */
  async listEtsyProducts(params?: {
    sync_status?: string;
    linked?: boolean;
    page?: number;
    per_page?: number;
  }): Promise<EtsyProductListResponse> {
    const query = buildQueryString(params);
    return fetchWithAuth<EtsyProductListResponse>(
      `${this.baseUrl}/products${query}`,
      {},
      true
    );
  }

  /**
   * Get Etsy product by listing ID
   */
  async getEtsyProduct(listingId: string): Promise<EtsyProduct> {
    return fetchWithAuth<EtsyProduct>(`${this.baseUrl}/products/${listingId}`, {}, true);
  }

  /**
   * Link Etsy listing to local product
   */
  async linkProduct(listingId: string, productId: number): Promise<void> {
    await fetchWithAuth(`${this.baseUrl}/products/${listingId}/link`, {
      method: 'POST',
      body: JSON.stringify({ product_id: productId }),
    }, true);
  }

  /**
   * Unlink Etsy listing from local product
   */
  async unlinkProduct(listingId: string): Promise<void> {
    await fetchWithAuth(`${this.baseUrl}/products/${listingId}/link`, {
      method: 'DELETE',
    }, true);
  }

  // ==================== Configuration ====================

  /**
   * Get Etsy configuration status
   */
  async getEtsyConfig(): Promise<EtsyConfig> {
    return fetchWithAuth<EtsyConfig>(`${this.baseUrl}/config`, {}, true);
  }

  /**
   * Validate Etsy credentials
   */
  async validateCredentials(): Promise<{ valid: boolean; message: string }> {
    return fetchWithAuth(`${this.baseUrl}/validate`, {
      method: 'POST',
    }, true);
  }
}

// Export singleton instance
export const etsyAPI = new EtsyAPIService();
export default etsyAPI;
