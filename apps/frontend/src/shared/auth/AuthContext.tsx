import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import axios from 'axios';
import { fetchMe, login as apiLogin, logout as apiLogout } from '../api/auth';
import { setAccessToken } from '../api/client';
import type { CurrentUser } from '../types';

interface AuthContextValue {
  user: CurrentUser | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  /** Заводит сессию по уже полученным токену+пользователю — используется обычным login()
   *  и входом через MAX-мини-приложение (см. план "Мини-приложение MAX"), чтобы не дублировать
   *  логику хранения токена/пользователя. */
  loginWithTokens: (accessToken: string, user: CurrentUser) => void;
  logout: () => Promise<void>;
  refetchMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // При загрузке страницы пробуем восстановить сессию через refresh-cookie.
  useEffect(() => {
    let cancelled = false;

    async function restore() {
      try {
        const res = await axios.post<{ accessToken: string; user: CurrentUser }>('/api/auth/refresh', null, {
          withCredentials: true,
        });
        if (cancelled) return;
        setAccessToken(res.data.accessToken);
        setUser(res.data.user);
      } catch {
        setAccessToken(null);
        setUser(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  const loginWithTokens = useCallback((accessToken: string, nextUser: CurrentUser) => {
    setAccessToken(accessToken);
    setUser(nextUser);
  }, []);

  const login = useCallback(
    async (username: string, password: string) => {
      const res = await apiLogin(username, password);
      loginWithTokens(res.accessToken, res.user);
    },
    [loginWithTokens],
  );

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  const refetchMe = useCallback(async () => {
    const me = await fetchMe();
    setUser(me);
  }, []);

  const value = useMemo(
    () => ({ user, isLoading, login, loginWithTokens, logout, refetchMe }),
    [user, isLoading, login, loginWithTokens, logout, refetchMe],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
