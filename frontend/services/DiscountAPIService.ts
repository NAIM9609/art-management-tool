// API Service for managing discount codes
// Handles all HTTP calls to backend for discount CRUD operations

import { fetchWithAuth } from './apiUtils';

export interface DiscountDTO {
  id?: number;
  code: string;
  type: 'percentage' | 'fixed_amount';
  value: number;
  min_purchase?: number;
  max_uses?: number | null;
  used_count?: number;
  starts_at?: string | null;
  expires_at?: string | null;
  active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface DiscountListResponse {
  discounts: DiscountDTO[];
  total: number;
  page: number;
  per_page: number;
}

export interface DiscountWithValidityResponse {
  discount: DiscountDTO;
  is_valid: boolean;
}

export interface DiscountStatsResponse {
  discount: DiscountDTO;
  is_valid: boolean;
  used_count: number;
  remaining_uses: number; // -1 for unlimited
  days_until_expiry: number | null;
}

export interface DiscountValidationResponse {
  valid: boolean;
  discount: DiscountDTO | null;
  message?: string;
  discount_amount?: number;
}

export class DiscountAPIService {
  // GET /api/admin/discounts - Get all discounts
  static async getAllDiscounts(
    page = 1,
    perPage = 20,
    filters?: {
      active?: boolean;
      valid?: boolean;
      type?: 'percentage' | 'fixed_amount';
    }
  ): Promise<DiscountListResponse> {
    const params = new URLSearchParams();
    params.append('page', page.toString());
    params.append('per_page', perPage.toString());

    if (filters?.active !== undefined) params.append('active', filters.active.toString());
    if (filters?.valid !== undefined) params.append('valid', filters.valid.toString());
    if (filters?.type) params.append('type', filters.type);

    return fetchWithAuth<DiscountListResponse>(
      `/api/admin/discounts?${params.toString()}`,
      {},
      true
    );
  }

  // GET /api/admin/discounts/{id} - Get specific discount
  static async getDiscount(id: number): Promise<DiscountWithValidityResponse> {
    return fetchWithAuth<DiscountWithValidityResponse>(`/api/admin/discounts/${id}`, {}, true);
  }

  // GET /api/admin/discounts/{id}/stats - Get discount statistics
  static async getDiscountStats(id: number): Promise<DiscountStatsResponse> {
    return fetchWithAuth<DiscountStatsResponse>(`/api/admin/discounts/${id}/stats`, {}, true);
  }

  // POST /api/admin/discounts - Create new discount
  static async createDiscount(discount: Partial<DiscountDTO>): Promise<DiscountWithValidityResponse> {
    return fetchWithAuth<DiscountWithValidityResponse>('/api/admin/discounts', {
      method: 'POST',
      body: JSON.stringify(discount),
    }, true);
  }

  // PATCH /api/admin/discounts/{id} - Update discount
  static async updateDiscount(id: number, discount: Partial<DiscountDTO>): Promise<DiscountWithValidityResponse> {
    return fetchWithAuth<DiscountWithValidityResponse>(`/api/admin/discounts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(discount),
    }, true);
  }

  // DELETE /api/admin/discounts/{id} - Delete discount
  static async deleteDiscount(id: number): Promise<{ message: string; id: number; discount?: DiscountDTO }> {
    return fetchWithAuth<{ message: string; id: number; discount?: DiscountDTO }>(
      `/api/admin/discounts/${id}`,
      { method: 'DELETE' },
      true
    );
  }

  /**
   * Validate a discount code against a given cart total without applying it to the cart.
   * POST /api/discounts/validate
   */
  static async validateDiscount(
    code: string,
    cartTotal: number
  ): Promise<DiscountValidationResponse> {
    return fetchWithAuth<DiscountValidationResponse>('/api/discounts/validate', {
      method: 'POST',
      body: JSON.stringify({ code, cartTotal }),
    });
  }
}
