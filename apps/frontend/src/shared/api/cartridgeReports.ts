import { apiClient } from './client';
import type { CartridgeReport } from '../types';

export function fetchCartridgeReports() {
  return apiClient.get<CartridgeReport[]>('/cartridge-reports').then((r) => r.data);
}

export function generateCartridgeReport(requestIds: string[]) {
  return apiClient.post<CartridgeReport>('/cartridge-reports', { requestIds }).then((r) => r.data);
}

export function closeCartridgeReport(id: string) {
  return apiClient.patch<CartridgeReport>(`/cartridge-reports/${id}/close`).then((r) => r.data);
}

/**
 * Эндпоинт скачивания защищён JwtAuthGuard, поэтому обычная ссылка не приложит токен —
 * забираем файл через apiClient как blob (тот же приём, что в AttachmentPreview) и триггерим
 * скачивание синтетической ссылкой.
 */
export async function downloadCartridgeReport(id: string, filename: string) {
  const res = await apiClient.get(`/cartridge-reports/${id}/download`, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
