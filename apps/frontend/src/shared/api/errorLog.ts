import { apiClient } from './client';

export type ErrorSource = 'BACKEND' | 'FRONTEND';

export interface ErrorLogEntry {
  id: string;
  source: ErrorSource;
  fingerprint: string;
  message: string;
  stack: string | null;
  route: string | null;
  method: string | null;
  statusCode: number | null;
  userId: string | null;
  user: { fullName: string } | null;
  userAgent: string | null;
  count: number;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
}

export function fetchErrorLogs(includeResolved: boolean) {
  return apiClient
    .get<ErrorLogEntry[]>('/system/errors', { params: { includeResolved: includeResolved ? 'true' : undefined } })
    .then((r) => r.data);
}

export function resolveErrorLog(id: string) {
  return apiClient.patch(`/system/errors/${id}/resolve`).then((r) => r.data);
}
