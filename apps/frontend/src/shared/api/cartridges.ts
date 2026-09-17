import { apiClient } from './client';
import type { CartridgeListResponse, CartridgeRequest, CartridgeRequestStatus } from '../types';

export interface FindCartridgesParams {
  status?: CartridgeRequestStatus;
  page?: number;
  pageSize?: number;
}

export function fetchCartridges(params: FindCartridgesParams = {}) {
  return apiClient.get<CartridgeListResponse>('/cartridges', { params }).then((r) => r.data);
}

export function createCartridgeRequest(locationId: string) {
  return apiClient.post<CartridgeRequest>('/cartridges', { locationId }).then((r) => r.data);
}

export function collectCartridgeRequest(id: string) {
  return apiClient.patch<CartridgeRequest>(`/cartridges/${id}/collect`).then((r) => r.data);
}

export function cancelCartridgeRequest(id: string) {
  return apiClient.patch<CartridgeRequest>(`/cartridges/${id}/cancel`).then((r) => r.data);
}

/** Excel этикеток для выбранных заявок — Label Expert печатает всё, что видит в файле,
 * поэтому выбор "что печатать" делается здесь, галочками (см. план). Эндпоинт защищён
 * JwtAuthGuard, поэтому обычная ссылка не приложит токен — забираем как blob. */
export async function downloadCartridgeLabels(ids: string[]) {
  const res = await apiClient.post('/cartridges/labels/export', { ids }, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'cartridge-labels.xlsx';
  link.click();
  URL.revokeObjectURL(url);
}

/** Сканирование QR при возврате картриджа с заправки (см. план, часть B). */
export function scanCartridgeArrival(code: string) {
  return apiClient.patch<CartridgeRequest>('/cartridges/scan-arrival', { code }).then((r) => r.data);
}
