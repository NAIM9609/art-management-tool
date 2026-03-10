// API Service per la gestione dei fumetti
// Gestisce tutte le chiamate HTTP al backend per le operazioni CRUD

import { fetchWithAuth, uploadFile, getCached, setCached, invalidateCache, CACHE_TTL } from './apiUtils';

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

const CACHE_PREFIX = 'fumetti:';

export class FumettiAPIService {

  // GET /api/fumetti - Ottieni tutti i fumetti attivi (public)
  static async getAllFumetti(): Promise<FumettoDTO[]> {
    const cacheKey = `${CACHE_PREFIX}all`;
    const cached = getCached<FumettoDTO[]>(cacheKey);
    if (cached) return cached;

    const response = await fetchWithAuth<FumettiListResponse>('/api/fumetti');
    const data = response.fumetti || (Array.isArray(response) ? response as FumettoDTO[] : []);
    setCached(cacheKey, data, CACHE_TTL.CONTENT);
    return data;
  }

  // GET /api/fumetti - Ottieni tutti i fumetti attivi (admin)
  static async getAllFumettiAdmin(): Promise<FumettoDTO[]> {
    const cacheKey = `${CACHE_PREFIX}all:admin`;
    const cached = getCached<FumettoDTO[]>(cacheKey);
    if (cached) return cached;

    const response = await fetchWithAuth<FumettiListResponse>('/api/fumetti', {}, true);
    const data = response.fumetti || (Array.isArray(response) ? response as FumettoDTO[] : []);
    setCached(cacheKey, data, CACHE_TTL.CONTENT);
    return data;
  }

  // GET /api/fumetti/{id} - Ottieni un fumetto specifico (public)
  static async getFumetto(id: number): Promise<FumettoDTO> {
    const cacheKey = `${CACHE_PREFIX}${id}`;
    const cached = getCached<FumettoDTO>(cacheKey);
    if (cached) return cached;

    const data = await fetchWithAuth<FumettoDTO>(`/api/fumetti/${id}`);
    setCached(cacheKey, data, CACHE_TTL.CONTENT);
    return data;
  }

  // GET /api/fumetti/{id} - Ottieni un fumetto specifico (admin)
  static async getFumettoAdmin(id: number): Promise<FumettoDTO> {
    const cacheKey = `${CACHE_PREFIX}${id}:admin`;
    const cached = getCached<FumettoDTO>(cacheKey);
    if (cached) return cached;

    const data = await fetchWithAuth<FumettoDTO>(`/api/fumetti/${id}`, {}, true);
    setCached(cacheKey, data, CACHE_TTL.CONTENT);
    return data;
  }

  // POST /api/fumetti - Crea un nuovo fumetto
  static async createFumetto(data: Omit<FumettoDTO, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>): Promise<FumettoDTO> {
    const result = await fetchWithAuth<FumettoDTO>('/api/fumetti', {
      method: 'POST',
      body: JSON.stringify(data),
    }, true);

    invalidateCache(CACHE_PREFIX);
    return result;
  }

  // PUT /api/fumetti/{id} - Aggiorna un fumetto esistente
  static async updateFumetto(id: number, data: Partial<FumettoDTO>): Promise<FumettoDTO> {
    const result = await fetchWithAuth<FumettoDTO>(`/api/fumetti/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }, true);

    invalidateCache(CACHE_PREFIX);
    return result;
  }

  // DELETE /api/fumetti/{id} - Soft delete di un fumetto
  static async deleteFumetto(id: number): Promise<{ message: string; id: string }> {
    const result = await fetchWithAuth<{ message: string; id: string }>(`/api/fumetti/${id}`, {
      method: 'DELETE',
    }, true);

    invalidateCache(CACHE_PREFIX);
    return result;
  }

  // POST /api/fumetti/{id}/restore - Ripristina un fumetto cancellato
  static async restoreFumetto(id: number): Promise<FumettoDTO> {
    const result = await fetchWithAuth<FumettoDTO>(`/api/fumetti/${id}/restore`, {
      method: 'POST',
    }, true);

    invalidateCache(CACHE_PREFIX);
    return result;
  }

  // GET /api/fumetti/deleted - Ottieni tutti i fumetti cancellati
  static async getDeletedFumetti(): Promise<FumettoDTO[]> {
    const response = await fetchWithAuth<FumettiListResponse>('/api/fumetti/deleted', {}, true);
    return response.fumetti || (Array.isArray(response) ? response as FumettoDTO[] : []);
  }

  // POST /api/fumetti/{id}/upload - Upload pagina per un fumetto
  static async uploadPage(id: number, file: File, type: 'cover' | 'page'): Promise<{ message: string; url: string; type: string }> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);

    const response = await uploadFile(`/api/fumetti/${id}/upload`, formData);
    invalidateCache(CACHE_PREFIX);
    return response.json();
  }

  // DELETE /api/fumetti/{id}/pages - Elimina una pagina da un fumetto
  static async deletePage(id: number, pageUrl: string, type: 'cover' | 'page'): Promise<{ message: string }> {
    const result = await fetchWithAuth<{ message: string }>(`/api/fumetti/${id}/pages`, {
      method: 'DELETE',
      body: JSON.stringify({ pageUrl, type }),
    }, true);

    invalidateCache(CACHE_PREFIX);
    return result;
  }
}

