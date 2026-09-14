import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';

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
let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const response = await axios.post<{ accessToken: string }>('/api/auth/refresh', null, {
    withCredentials: true,
  });
  setAccessToken(response.data.accessToken);
  return response.data.accessToken;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetryableConfig | undefined;

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry && !originalRequest.url?.includes('/auth/')) {
      originalRequest._retry = true;
      try {
        refreshPromise ??= refreshAccessToken().finally(() => {
          refreshPromise = null;
        });
        const newToken = await refreshPromise;
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
