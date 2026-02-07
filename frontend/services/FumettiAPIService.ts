// API Service per la gestione dei fumetti
// Gestisce tutte le chiamate HTTP al backend per le operazioni CRUD

import { fetchWithAuth, uploadFile } from './apiUtils';

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

export class FumettiAPIService {

  // GET /api/fumetti - Ottieni tutti i fumetti attivi (public)
  static async getAllFumetti(): Promise<FumettoDTO[]> {
    const response = await fetchWithAuth<FumettiListResponse>('/api/fumetti');
    return response.fumetti || (Array.isArray(response) ? response as FumettoDTO[] : []);
  }

  // GET /api/fumetti - Ottieni tutti i fumetti attivi (admin)
  static async getAllFumettiAdmin(): Promise<FumettoDTO[]> {
    const response = await fetchWithAuth<FumettiListResponse>('/api/fumetti', {}, true);
    return response.fumetti || (Array.isArray(response) ? response as FumettoDTO[] : []);
  }

  // GET /api/fumetti/{id} - Ottieni un fumetto specifico (public)
  static async getFumetto(id: number): Promise<FumettoDTO> {
    return fetchWithAuth<FumettoDTO>(`/api/fumetti/${id}`);
  }

  // GET /api/fumetti/{id} - Ottieni un fumetto specifico (admin)
  static async getFumettoAdmin(id: number): Promise<FumettoDTO> {
    return fetchWithAuth<FumettoDTO>(`/api/fumetti/${id}`, {}, true);
  }

  // POST /api/fumetti - Crea un nuovo fumetto
  static async createFumetto(data: Omit<FumettoDTO, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>): Promise<FumettoDTO> {
    return fetchWithAuth<FumettoDTO>('/api/fumetti', {
      method: 'POST',
      body: JSON.stringify(data),
    }, true);
  }

  // PUT /api/fumetti/{id} - Aggiorna un fumetto esistente
  static async updateFumetto(id: number, data: Partial<FumettoDTO>): Promise<FumettoDTO> {
    return fetchWithAuth<FumettoDTO>(`/api/fumetti/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }, true);
  }

  // DELETE /api/fumetti/{id} - Soft delete di un fumetto
  static async deleteFumetto(id: number): Promise<{ message: string; id: string }> {
    return fetchWithAuth<{ message: string; id: string }>(`/api/fumetti/${id}`, {
      method: 'DELETE',
    }, true);
  }

  // POST /api/fumetti/{id}/restore - Ripristina un fumetto cancellato
  static async restoreFumetto(id: number): Promise<FumettoDTO> {
    return fetchWithAuth<FumettoDTO>(`/api/fumetti/${id}/restore`, {
      method: 'POST',
    }, true);
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
    return response.json();
  }

  // DELETE /api/fumetti/{id}/pages - Elimina una pagina da un fumetto
  static async deletePage(id: number, pageUrl: string, type: 'cover' | 'page'): Promise<{ message: string }> {
    return fetchWithAuth<{ message: string }>(`/api/fumetti/${id}/pages`, {
      method: 'DELETE',
      body: JSON.stringify({ pageUrl, type }),
    }, true);
  }
}

