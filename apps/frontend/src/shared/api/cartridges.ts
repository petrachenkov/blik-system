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
