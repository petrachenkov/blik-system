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
