// API Service per la gestione dei personaggi
// Gestisce tutte le chiamate HTTP al backend per le operazioni CRUD

import { fetchWithAuth, uploadFile, getCached, setCached, invalidateCache, CACHE_TTL } from './apiUtils';

export interface PersonaggioDTO {
  id?: number;
  name: string;
  description: string;
  icon?: string;
  images: string[];
  backgroundColor?: string;
  backgroundType?: 'solid' | 'gradient' | 'image';
  gradientFrom?: string;
  gradientTo?: string;
  backgroundImage?: string;
  order?: number;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

export interface PersonaggiListResponse {
  personaggi: PersonaggioDTO[];
  count: number;
}

function normalizePersonaggiListResponse(response: unknown): PersonaggioDTO[] {
  if (Array.isArray(response)) {
    console.debug('[PersonaggiAPIService] normalize: response is direct array', {
      length: response.length,
    });
    return response as PersonaggioDTO[];
  }

  if (response && typeof response === 'object') {
    const maybeList = (response as { personaggi?: unknown }).personaggi;
    if (Array.isArray(maybeList)) {
      console.debug('[PersonaggiAPIService] normalize: response.personaggi is array', {
        length: maybeList.length,
      });
      return maybeList as PersonaggioDTO[];
    }

    console.debug('[PersonaggiAPIService] normalize: object response without personaggi array', {
      keys: Object.keys(response as Record<string, unknown>),
    });
  }

  console.debug('[PersonaggiAPIService] normalize: unsupported response shape', {
    type: typeof response,
    value: response,
  });

  return [];
}

const CACHE_PREFIX = 'personaggi:';

function getAdminCacheTokenKey(): string | null {
  if (typeof window === 'undefined') return null;
  const token = localStorage.getItem('adminToken');
  if (!token) return null;
  return token.slice(-12);
}

export class PersonaggiAPIService {
  // GET /api/personaggi - Ottieni tutti i personaggi attivi (public)
  static async getAllPersonaggi(): Promise<PersonaggioDTO[]> {
    const cacheKey = `${CACHE_PREFIX}all`;
    const cached = getCached<PersonaggioDTO[]>(cacheKey);
    if (cached) {
      console.debug('[PersonaggiAPIService] getAllPersonaggi: cache hit', {
        cacheKey,
        length: cached.length,
      });
      return cached;
    }

    console.debug('[PersonaggiAPIService] getAllPersonaggi: cache miss, requesting /api/personaggi');

    const response = await fetchWithAuth<unknown>('/api/personaggi');
    console.debug('[PersonaggiAPIService] getAllPersonaggi: raw response received', {
      type: typeof response,
      isArray: Array.isArray(response),
    });
    const data = normalizePersonaggiListResponse(response);
    console.debug('[PersonaggiAPIService] getAllPersonaggi: normalized data', {
      length: data.length,
    });
    setCached(cacheKey, data, CACHE_TTL.CONTENT);
    return data;
  }

  // GET /api/personaggi - Ottieni tutti i personaggi attivi (admin)
  static async getAllPersonaggiAdmin(): Promise<PersonaggioDTO[]> {
    const tokenKey = getAdminCacheTokenKey();
    if (!tokenKey) {
      throw new Error('Authentication required');
    }

    const cacheKey = `${CACHE_PREFIX}all:admin:${tokenKey}`;
    const cached = getCached<PersonaggioDTO[]>(cacheKey);
    if (cached) return cached;

    const response = await fetchWithAuth<unknown>('/api/personaggi', {}, true);
    const data = normalizePersonaggiListResponse(response);
    setCached(cacheKey, data, CACHE_TTL.CONTENT);
    return data;
  }

  // GET /api/personaggi/{id} - Ottieni un personaggio specifico (public)
  static async getPersonaggio(id: number): Promise<PersonaggioDTO> {
    const cacheKey = `${CACHE_PREFIX}${id}`;
    const cached = getCached<PersonaggioDTO>(cacheKey);
    if (cached) return cached;

    const data = await fetchWithAuth<PersonaggioDTO>(`/api/personaggi/${id}`);
    setCached(cacheKey, data, CACHE_TTL.CONTENT);
    return data;
  }

  // GET /api/personaggi/{id} - Ottieni un personaggio specifico (admin)
  static async getPersonaggioAdmin(id: number): Promise<PersonaggioDTO> {
    const tokenKey = getAdminCacheTokenKey();
    if (!tokenKey) {
      throw new Error('Authentication required');
    }

    const cacheKey = `${CACHE_PREFIX}${id}:admin:${tokenKey}`;
    const cached = getCached<PersonaggioDTO>(cacheKey);
    if (cached) return cached;

    const data = await fetchWithAuth<PersonaggioDTO>(`/api/personaggi/${id}`, {}, true);
    setCached(cacheKey, data, CACHE_TTL.CONTENT);
    return data;
  }

  // POST /api/personaggi - Crea un nuovo personaggio
  static async createPersonaggio(data: Omit<PersonaggioDTO, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>): Promise<PersonaggioDTO> {
    const { validatePersonaggio } = await import('./validation');
    const validation = validatePersonaggio(data);
    if (validation.hasErrors()) {
      throw new Error(`Validation failed: ${validation.getErrorMessage()}`);
    }

    const result = await fetchWithAuth<PersonaggioDTO>('/api/personaggi', {
      method: 'POST',
      body: JSON.stringify(data),
    }, true);

    invalidateCache(CACHE_PREFIX);
    return result;
  }

  // PUT /api/personaggi/{id} - Aggiorna un personaggio esistente
  static async updatePersonaggio(id: number, data: Partial<PersonaggioDTO>): Promise<PersonaggioDTO> {
    if (data.name || data.images !== undefined) {
      const { validatePersonaggio } = await import('./validation');
      const fullData = {
        name: data.name || '',
        images: data.images || [],
        description: data.description,
        icon: data.icon,
        backgroundColor: data.backgroundColor,
        backgroundType: data.backgroundType,
        gradientFrom: data.gradientFrom,
        gradientTo: data.gradientTo,
        order: data.order,
      };
      const validation = validatePersonaggio(fullData);
      if (validation.hasErrors()) {
        throw new Error(`Validation failed: ${validation.getErrorMessage()}`);
      }
    }

    const result = await fetchWithAuth<PersonaggioDTO>(`/api/personaggi/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }, true);

    invalidateCache(CACHE_PREFIX);
    return result;
  }

  // DELETE /api/personaggi/{id} - Soft delete di un personaggio
  static async deletePersonaggio(id: number): Promise<{ message: string; id: string }> {
    const result = await fetchWithAuth<{ message: string; id: string }>(`/api/personaggi/${id}`, {
      method: 'DELETE',
    }, true);

    invalidateCache(CACHE_PREFIX);
    return result;
  }

  // POST /api/personaggi/{id}/restore - Ripristina un personaggio cancellato
  static async restorePersonaggio(id: number): Promise<PersonaggioDTO> {
    const result = await fetchWithAuth<PersonaggioDTO>(`/api/personaggi/${id}/restore`, {
      method: 'POST',
    }, true);

    invalidateCache(CACHE_PREFIX);
    return result;
  }

  // GET /api/personaggi/deleted - Ottieni tutti i personaggi cancellati
  static async getDeletedPersonaggi(): Promise<PersonaggioDTO[]> {
    const response = await fetchWithAuth<unknown>('/api/personaggi/deleted', {}, true);
    return normalizePersonaggiListResponse(response);
  }

  // POST /api/personaggi/{id}/upload - Upload immagine per un personaggio
  static async uploadImage(id: number, file: File, type: 'icon' | 'gallery' | 'background'): Promise<{ message: string; url: string; type: string }> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);

    const response = await uploadFile(`/api/personaggi/${id}/upload`, formData);
    invalidateCache(CACHE_PREFIX);
    return response.json();
  }

  // Alias for getPersonaggioAdmin (for consistency)
  static async getPersonaggioById(id: number): Promise<PersonaggioDTO> {
    return this.getPersonaggioAdmin(id);
  }

  // DELETE /api/personaggi/{id}/images - Elimina un'immagine da un personaggio
  static async deleteImage(id: number, imageUrl: string, type: 'icon' | 'gallery' | 'background'): Promise<{ message: string }> {
    const result = await fetchWithAuth<{ message: string }>(`/api/personaggi/${id}/images`, {
      method: 'DELETE',
      body: JSON.stringify({ imageUrl, type }),
    }, true);

    invalidateCache(CACHE_PREFIX);
    return result;
  }
}
