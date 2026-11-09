import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import type { LoginResponse } from './auth';

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

export const apiClient = axios.create({
  baseURL: '/api',
  withCredentials: true, // нужен для httpOnly refresh_token cookie
});

apiClient.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

type RetryableConfig = InternalAxiosRequestConfig & { _retry?: boolean };

// Очередь запросов, ожидающих обновления токена, чтобы не слать параллельно несколько /refresh.
let refreshPromise: Promise<LoginResponse> | null = null;

export function refreshSession(): Promise<LoginResponse> {
  refreshPromise ??= axios.post<LoginResponse>('/api/auth/refresh', null, {
    withCredentials: true,
    timeout: 15_000,
  }).then((response) => response.data).finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetryableConfig | undefined;

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry && !originalRequest.url?.includes('/auth/')) {
      originalRequest._retry = true;
      try {
        const { accessToken: newToken } = await refreshSession();
        setAccessToken(newToken);
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(originalRequest);
      } catch {
        setAccessToken(null);
        window.location.assign('/login');
      }
    }

    return Promise.reject(error);
  },
);
