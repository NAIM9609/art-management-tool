// API Service per la gestione dei fumetti
// Gestisce tutte le chiamate HTTP al backend per le operazioni CRUD

export interface FumettoDTO {
  id?: number;
  title: string;
  slug?: string;
  description?: string;
  about?: string;
  coverImage?: string;
  pages?: string[];
  order?: number;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

export interface FumettiListResponse {
  fumetti: FumettoDTO[];
  count: number;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';

export class FumettiAPIService {
  private static getAuthHeaders(): HeadersInit {
    const token = typeof window !== 'undefined' ? localStorage.getItem('adminToken') : null;
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }

  private static async fetchJSON<T>(url: string, options?: RequestInit, useAuth = false): Promise<T> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options?.headers,
    };

    if (useAuth) {
      const authHeaders = this.getAuthHeaders();
      Object.assign(headers, authHeaders);
      console.log(`[FumettiAPI] Auth request to ${url}`, {
        hasToken: !!(authHeaders as Record<string, string>).Authorization,
      });
    } else {
      console.log(`[FumettiAPI] Public request to ${url}`);
    }

    const response = await fetch(`${API_BASE_URL}${url}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[FumettiAPI] Error ${response.status} for ${url}:`, errorText);
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    console.log(`[FumettiAPI] Success ${response.status} for ${url}`);
    return response.json();
  }

  // GET /api/fumetti - Ottieni tutti i fumetti attivi (public)
  static async getAllFumetti(): Promise<FumettoDTO[]> {
    const response = await this.fetchJSON<FumettiListResponse>('/api/fumetti');
    return response.fumetti || (Array.isArray(response) ? response as FumettoDTO[] : []);
  }

  // GET /api/fumetti - Ottieni tutti i fumetti attivi (admin)
  static async getAllFumettiAdmin(): Promise<FumettoDTO[]> {
    const response = await this.fetchJSON<FumettiListResponse>('/api/fumetti', {}, true);
    return response.fumetti || (Array.isArray(response) ? response as FumettoDTO[] : []);
  }

  // GET /api/fumetti/{id} - Ottieni un fumetto specifico (public)
  static async getFumetto(id: number): Promise<FumettoDTO> {
    return this.fetchJSON<FumettoDTO>(`/api/fumetti/${id}`);
  }

  // GET /api/fumetti/{id} - Ottieni un fumetto specifico (admin)
  static async getFumettoAdmin(id: number): Promise<FumettoDTO> {
    return this.fetchJSON<FumettoDTO>(`/api/fumetti/${id}`, {}, true);
  }

  // POST /api/fumetti - Crea un nuovo fumetto
  static async createFumetto(data: Omit<FumettoDTO, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>): Promise<FumettoDTO> {
    return this.fetchJSON<FumettoDTO>('/api/fumetti', {
      method: 'POST',
      body: JSON.stringify(data),
    }, true);
  }

  // PUT /api/fumetti/{id} - Aggiorna un fumetto esistente
  static async updateFumetto(id: number, data: Partial<FumettoDTO>): Promise<FumettoDTO> {
    return this.fetchJSON<FumettoDTO>(`/api/fumetti/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }, true);
  }

  // DELETE /api/fumetti/{id} - Soft delete di un fumetto
  static async deleteFumetto(id: number): Promise<{ message: string; id: string }> {
    return this.fetchJSON<{ message: string; id: string }>(`/api/fumetti/${id}`, {
      method: 'DELETE',
    }, true);
  }

  // POST /api/fumetti/{id}/restore - Ripristina un fumetto cancellato
  static async restoreFumetto(id: number): Promise<FumettoDTO> {
    return this.fetchJSON<FumettoDTO>(`/api/fumetti/${id}/restore`, {
      method: 'POST',
    }, true);
  }

  // GET /api/fumetti/deleted - Ottieni tutti i fumetti cancellati
  static async getDeletedFumetti(): Promise<FumettoDTO[]> {
    const response = await this.fetchJSON<FumettiListResponse>('/api/fumetti/deleted', {}, true);
    return response.fumetti || (Array.isArray(response) ? response as FumettoDTO[] : []);
  }

  // POST /api/fumetti/{id}/upload - Upload pagina per un fumetto
  static async uploadPage(id: number, file: File, type: 'cover' | 'page'): Promise<{ message: string; url: string; type: string }> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);

    const token = typeof window !== 'undefined' ? localStorage.getItem('adminToken') : null;
    const headers: HeadersInit = token ? { 'Authorization': `Bearer ${token}` } : {};

    const response = await fetch(`${API_BASE_URL}/api/fumetti/${id}/upload`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    return response.json();
  }

  // DELETE /api/fumetti/{id}/pages - Elimina una pagina da un fumetto
  static async deletePage(id: number, pageUrl: string, type: 'cover' | 'page'): Promise<{ message: string }> {
    const token = typeof window !== 'undefined' ? localStorage.getItem('adminToken') : null;
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE_URL}/api/fumetti/${id}/pages`, {
      method: 'DELETE',
      headers,
      body: JSON.stringify({ pageUrl, type }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    return response.json();
  }
}

