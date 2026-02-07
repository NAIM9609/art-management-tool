// API Service per la gestione dei personaggi
// Gestisce tutte le chiamate HTTP al backend per le operazioni CRUD

import { fetchWithAuth, uploadFile } from './apiUtils';

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

export class PersonaggiAPIService {
  // GET /api/personaggi - Ottieni tutti i personaggi attivi (public)
  static async getAllPersonaggi(): Promise<PersonaggioDTO[]> {
    const response = await fetchWithAuth<PersonaggiListResponse>('/api/personaggi');
    return response.personaggi || (Array.isArray(response) ? response as PersonaggioDTO[] : []);
  }

  // GET /api/personaggi - Ottieni tutti i personaggi attivi (admin)
  static async getAllPersonaggiAdmin(): Promise<PersonaggioDTO[]> {
    const response = await fetchWithAuth<PersonaggiListResponse>('/api/personaggi', {}, true);
    return response.personaggi || (Array.isArray(response) ? response as PersonaggioDTO[] : []);
  }

  // GET /api/personaggi/{id} - Ottieni un personaggio specifico (public)
  static async getPersonaggio(id: number): Promise<PersonaggioDTO> {
    return fetchWithAuth<PersonaggioDTO>(`/api/personaggi/${id}`);
  }

  // GET /api/personaggi/{id} - Ottieni un personaggio specifico (admin)
  static async getPersonaggioAdmin(id: number): Promise<PersonaggioDTO> {
    return fetchWithAuth<PersonaggioDTO>(`/api/personaggi/${id}`, {}, true);
  }

  // POST /api/personaggi - Crea un nuovo personaggio
  static async createPersonaggio(data: Omit<PersonaggioDTO, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>): Promise<PersonaggioDTO> {
    const { validatePersonaggio } = await import('./validation');
    const validation = validatePersonaggio(data);
    if (validation.hasErrors()) {
      throw new Error(`Validation failed: ${validation.getErrorMessage()}`);
    }
    
    return fetchWithAuth<PersonaggioDTO>('/api/personaggi', {
      method: 'POST',
      body: JSON.stringify(data),
    }, true);
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
    
    return fetchWithAuth<PersonaggioDTO>(`/api/personaggi/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }, true);
  }

  // DELETE /api/personaggi/{id} - Soft delete di un personaggio
  static async deletePersonaggio(id: number): Promise<{ message: string; id: string }> {
    return fetchWithAuth<{ message: string; id: string }>(`/api/personaggi/${id}`, {
      method: 'DELETE',
    }, true);
  }

  // POST /api/personaggi/{id}/restore - Ripristina un personaggio cancellato
  static async restorePersonaggio(id: number): Promise<PersonaggioDTO> {
    return fetchWithAuth<PersonaggioDTO>(`/api/personaggi/${id}/restore`, {
      method: 'POST',
    }, true);
  }

  // GET /api/personaggi/deleted - Ottieni tutti i personaggi cancellati
  static async getDeletedPersonaggi(): Promise<PersonaggioDTO[]> {
    const response = await fetchWithAuth<PersonaggiListResponse>('/api/personaggi/deleted', {}, true);
    return response.personaggi || (Array.isArray(response) ? response as PersonaggioDTO[] : []);
  }

  // POST /api/personaggi/{id}/upload - Upload immagine per un personaggio
  static async uploadImage(id: number, file: File, type: 'icon' | 'image'): Promise<{ message: string; url: string; type: string }> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);

    const response = await uploadFile(`/api/personaggi/${id}/upload`, formData);
    return response.json();
  }

  // Alias for getPersonaggioAdmin (for consistency)
  static async getPersonaggioById(id: number): Promise<PersonaggioDTO> {
    return this.getPersonaggioAdmin(id);
  }

  // DELETE /api/personaggi/{id}/images - Elimina un'immagine da un personaggio
  static async deleteImage(id: number, imageUrl: string, type: 'icon' | 'image'): Promise<{ message: string }> {
    return fetchWithAuth<{ message: string }>(`/api/personaggi/${id}/images`, {
      method: 'DELETE',
      body: JSON.stringify({ imageUrl, type }),
    }, true);
  }
}
