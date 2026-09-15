import { apiClient } from './client';
import type { CurrentUser } from '../types';

export interface LoginResponse {
  accessToken: string;
  user: CurrentUser;
}

export function login(username: string, password: string) {
  return apiClient.post<LoginResponse>('/auth/login', { username, password }).then((r) => r.data);
}

export function logout() {
  return apiClient.post('/auth/logout').then((r) => r.data);
}

export function fetchMe() {
  return apiClient.get<CurrentUser>('/auth/me').then((r) => r.data);
}

/** Отмечает онбординг-тур пройденным (см. план "Онбординг-тур"). */
export function completeOnboarding() {
  return apiClient.patch<CurrentUser>('/users/me/onboarding').then((r) => r.data);
}

// --- MAX-мини-приложение (см. план "Мини-приложение MAX") ---
// Все запросы на /auth/* — через обычный apiClient: перехватчик 401 (client.ts) намеренно
// не трогает урлы с "/auth/" (не пытается обновить токен/редиректить на /login), так что
// это безопасно и до входа тоже — как и у существующих login()/logout() выше.

export function fetchMaxStatus() {
  return apiClient.get<{ configured: boolean }>('/auth/max/status').then((r) => r.data);
}

/** Тихий вход по уже привязанному MAX-аккаунту. */
export function loginViaMax(initData: string) {
  return apiClient.post<LoginResponse>('/auth/max', { initData }).then((r) => r.data);
}

/** Первый вход: логин/пароль Blik + привязка текущего MAX-аккаунта. */
export function loginAndLinkMax(initData: string, username: string, password: string) {
  return apiClient.post<LoginResponse>('/auth/max/link', { initData, username, password }).then((r) => r.data);
}

export function fetchMaxLinkStatus() {
  return apiClient.get<{ linked: boolean }>('/auth/max/link').then((r) => r.data);
}

export function unlinkMax() {
  return apiClient.delete('/auth/max/link').then((r) => r.data);
}
