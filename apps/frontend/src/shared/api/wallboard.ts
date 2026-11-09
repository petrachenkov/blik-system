import axios from 'axios';
import { apiClient } from './client';

export interface WallboardSnapshot {
  generatedAt: string;
  queue: Record<'NEW' | 'ASSIGNED' | 'IN_PROGRESS' | 'REOPENED', number>;
  unassignedCount: number;
  resolvedToday: number;
  overdue: {
    count: number;
    items: { number: string; assignee: string | null; breachType: 'response' | 'resolution'; dueAt: string | null }[];
  };
  workload: { fullName: string; role: string; activeCount: number }[];
  visitsToday: { time: string; number: string; technician: string; location: string; requester: string }[];
}

export interface KioskToken {
  id: string;
  label: string;
  createdAt: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
  createdBy: { fullName: string } | null;
}

/**
 * Kiosk-ссылки работают без сессии. При входе сотрудника используем сессию,
 * которую уже восстановил AuthProvider.
 */
export async function fetchWallboardSnapshot(kioskToken?: string | null): Promise<WallboardSnapshot> {
  if (kioskToken) {
    const r = await axios.get<WallboardSnapshot>('/api/wallboard/snapshot', { params: { token: kioskToken } });
    return r.data;
  }
  const r = await apiClient.get<WallboardSnapshot>('/wallboard/snapshot');
  return r.data;
}

export function fetchKioskTokens() {
  return apiClient.get<KioskToken[]>('/wallboard/kiosk-tokens').then((r) => r.data);
}

export function createKioskToken(label: string) {
  return apiClient
    .post<{ id: string; label: string; token: string; url: string }>('/wallboard/kiosk-tokens', { label })
    .then((r) => r.data);
}

export function revokeKioskToken(id: string) {
  return apiClient.delete(`/wallboard/kiosk-tokens/${id}`).then((r) => r.data);
}
