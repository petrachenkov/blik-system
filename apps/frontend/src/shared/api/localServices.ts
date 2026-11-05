import { apiClient } from './client';

export interface LocalServiceInput {
  name: string;
  description: string;
  url: string;
  iconType: 'emoji' | 'image';
  emoji: string;
  imageData: string | null;
  sortOrder: number;
  isActive: boolean;
}
export interface LocalService extends LocalServiceInput { id: string }

export const fetchLocalServices = (includeInactive = false) => apiClient.get<LocalService[]>('/local-services', { params: { includeInactive } }).then((r) => r.data);
export const saveLocalService = (id: string | undefined, data: LocalServiceInput) => (id ? apiClient.put(`/local-services/${id}`, data) : apiClient.post('/local-services', data)).then((r) => r.data);
export const setLocalServiceVisibility = (id: string, isActive: boolean) => apiClient.patch(`/local-services/${id}/visibility`, { isActive }).then((r) => r.data);
export const deleteLocalService = (id: string) => apiClient.delete(`/local-services/${id}`).then((r) => r.data);
