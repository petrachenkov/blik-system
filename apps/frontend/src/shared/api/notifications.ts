import { apiClient } from './client';
import type { AppNotification } from '../types';

export function fetchNotifications(unreadOnly = false) {
  return apiClient.get<AppNotification[]>('/notifications', { params: { unreadOnly } }).then((r) => r.data);
}

export function markNotificationRead(id: string) {
  return apiClient.patch<AppNotification>(`/notifications/${id}/read`).then((r) => r.data);
}

export function markAllNotificationsRead() {
  return apiClient.patch<{ updated: number }>('/notifications/read-all').then((r) => r.data);
}

/** Ручная рассылка — только Главный сисадмин. targetUserId не указан -> всем пользователям. */
export function sendBroadcastNotification(data: { title: string; body: string; targetUserId?: string }) {
  return apiClient.post<{ id: string }>('/notifications/broadcast', data).then((r) => r.data);
}

/** Публичный VAPID-ключ — нужен для pushManager.subscribe (см. план "Push-уведомления"). */
export function fetchVapidPublicKey() {
  return apiClient.get<{ publicKey: string | null }>('/notifications/vapid-public-key').then((r) => r.data.publicKey);
}

export function subscribeToPush(subscription: PushSubscriptionJSON) {
  return apiClient.post('/notifications/push-subscription', subscription).then((r) => r.data);
}

export function unsubscribeFromPush(endpoint: string) {
  return apiClient.delete('/notifications/push-subscription', { data: { endpoint } }).then((r) => r.data);
}

export interface QuietHours {
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
}

/** Настройки тихих часов — только Главный сисадмин (см. план). Оба поля пустые -> выключено. */
export function fetchQuietHours() {
  return apiClient.get<QuietHours>('/notifications/quiet-hours').then((r) => r.data);
}

export function updateQuietHours(data: { start: string | null; end: string | null }) {
  return apiClient.patch<QuietHours>('/notifications/quiet-hours', data).then((r) => r.data);
}

// --- Личные настройки уведомлений (см. план) ---

export type NotificationPreferences = Record<string, { enabled: boolean; push: boolean }>;

export function fetchNotificationPreferences() {
  return apiClient.get<NotificationPreferences>('/notifications/preferences').then((r) => r.data);
}

export function updateNotificationPreferences(items: { type: string; enabled: boolean; push: boolean }[]) {
  return apiClient.put<NotificationPreferences>('/notifications/preferences', { items }).then((r) => r.data);
}
