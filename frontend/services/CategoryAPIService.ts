// API Service for managing categories
// Handles all HTTP calls to backend for category CRUD operations

import { fetchWithAuth } from './apiUtils';

export interface CategoryDTO {
  id?: number;
  name: string;
  slug: string;
  description?: string;
  parent_id?: number | null;
  parent?: CategoryDTO;
  children?: CategoryDTO[];
  created_at?: string;
  updated_at?: string;
}

export interface CategoryListResponse {
  categories: CategoryDTO[];
  total: number;
}

export class CategoryAPIService {
  // GET /api/shop/categories - Get all active categories (public)
  static async getAllCategories(includeChildren = false): Promise<CategoryDTO[]> {
    const url = `/api/shop/categories${includeChildren ? '?include_children=true' : ''}`;
    const response = await fetchWithAuth<CategoryListResponse>(url);
    return response.categories || [];
  }

  // GET /api/shop/categories/{id} - Get specific category (public)
  static async getCategory(id: number): Promise<CategoryDTO> {
    return fetchWithAuth<CategoryDTO>(`/api/shop/categories/${id}`);
  }

  // GET /api/admin/categories - Get all categories (admin)
  static async getAllCategoriesAdmin(
    parentId?: number | null,
    includeChildren = false,
    includeParent = false
  ): Promise<CategoryDTO[]> {
    const params = new URLSearchParams();
    if (parentId !== undefined) {
      params.append('parent_id', parentId === null ? 'null' : parentId.toString());
    }
    if (includeChildren) params.append('include_children', 'true');
    if (includeParent) params.append('include_parent', 'true');

    const url = `/api/admin/categories${params.toString() ? '?' + params.toString() : ''}`;
    const response = await fetchWithAuth<CategoryListResponse>(url, {}, true);
    return response.categories || [];
  }

  // GET /api/admin/categories/{id} - Get specific category (admin)
  static async getCategoryAdmin(id: number): Promise<CategoryDTO> {
    return fetchWithAuth<CategoryDTO>(`/api/admin/categories/${id}`, {}, true);
  }

  // POST /api/admin/categories - Create new category
  static async createCategory(category: Partial<CategoryDTO>): Promise<CategoryDTO> {
    return fetchWithAuth<CategoryDTO>('/api/admin/categories', {
      method: 'POST',
      body: JSON.stringify(category),
    }, true);
  }

  // PATCH /api/admin/categories/{id} - Update category
  static async updateCategory(id: number, category: Partial<CategoryDTO>): Promise<CategoryDTO> {
    return fetchWithAuth<CategoryDTO>(`/api/admin/categories/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(category),
    }, true);
  }

  // DELETE /api/admin/categories/{id} - Delete category
  static async deleteCategory(id: number): Promise<{ message: string; id: number }> {
    return fetchWithAuth<{ message: string; id: number }>(`/api/admin/categories/${id}`, {
      method: 'DELETE',
    }, true);
  }
}
