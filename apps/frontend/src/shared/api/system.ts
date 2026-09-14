import axios from 'axios';
import { apiClient } from './client';

export type FeatureFlags = Record<string, boolean>;

export interface AdminFlag {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
  note: string | null;
  updatedAt: string | null;
  updatedByName: string | null;
  isMaintenance: boolean;
}

export interface MaintenanceStatus {
  enabled: boolean;
  message: string | null;
}

type ComponentStatus = 'ok' | 'warn' | 'down' | 'disabled';

export interface HealthReport {
  generatedAt: string;
  components: {
    db: { status: ComponentStatus; latencyMs: number; error?: string };
    ldap: { status: ComponentStatus; latencyMs: number; error?: string };
    webPush: { status: ComponentStatus; configured: boolean; subscriptions: number };
    disk: { status: ComponentStatus; freeBytes: number; totalBytes: number; usedPercent: number; error?: string };
    max: { status: ComponentStatus };
  };
}

export function fetchFeatureFlags() {
  return apiClient.get<FeatureFlags>('/system/flags').then((r) => r.data);
}

export function fetchAdminFlags() {
  return apiClient.get<AdminFlag[]>('/system/flags/admin').then((r) => r.data);
}

export function updateFlag(key: string, data: { enabled: boolean; note?: string | null }) {
  return apiClient.patch(`/system/flags/${key}`, data).then((r) => r.data);
}

/** Публичный статус — вызывается на LoginPage до аутентификации, поэтому голым axios. */
export function fetchMaintenance() {
  return axios.get<MaintenanceStatus>('/api/system/maintenance').then((r) => r.data);
}

export function fetchHealth() {
  return apiClient.get<HealthReport>('/system/health').then((r) => r.data);
}

/** Отправка клиентской ошибки в трекер — сбои самой отправки глотаются. */
export function reportError(payload: { message: string; stack?: string; url?: string }) {
  return apiClient.post('/system/errors', payload).catch(() => undefined);
}

// --- Рабочие часы визитов (см. план «Доработка календаря визитов») ---

export interface WorkingHours {
  workdayStart: string; // "HH:mm"
  workdayEnd: string; // "HH:mm"
  workingDays: number[]; // 1=Пн … 7=Вс
  holidays: string[]; // "YYYY-MM-DD"
}

export function fetchWorkingHours() {
  return apiClient.get<WorkingHours>('/system/working-hours').then((r) => r.data);
}

export function updateWorkingHours(data: Partial<WorkingHours>) {
  return apiClient.patch<WorkingHours>('/system/working-hours', data).then((r) => r.data);
}

// --- Политика хранения заявок (см. план «Архив заявок») ---

export interface TicketRetention {
  enabled: boolean;
  archiveClosedAfterDays: number;
}

export function fetchTicketRetention() {
  return apiClient.get<TicketRetention>('/system/ticket-retention').then((r) => r.data);
}

export function updateTicketRetention(data: Partial<TicketRetention>) {
  return apiClient.patch<TicketRetention>('/system/ticket-retention', data).then((r) => r.data);
}
