import { apiClient } from './client';
import type { RefillEvent } from '../types';

export function fetchRefillEvents() {
  return apiClient.get<RefillEvent[]>('/refill-events').then((r) => r.data);
}

export function createRefillEvent(data: { scheduledAt: string; submissionDeadline: string; note?: string }) {
  return apiClient.post<RefillEvent>('/refill-events', data).then((r) => r.data);
}

export function updateRefillEvent(
  id: string,
  data: Partial<{ scheduledAt: string; submissionDeadline: string; note: string; isCancelled: boolean }>,
) {
  return apiClient.patch<RefillEvent>(`/refill-events/${id}`, data).then((r) => r.data);
}
