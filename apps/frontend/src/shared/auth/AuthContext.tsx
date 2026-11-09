import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { fetchMe, login as apiLogin, loginAndLinkMax, logout as apiLogout } from '../api/auth';
import { refreshSession, setAccessToken } from '../api/client';
import type { CurrentUser } from '../types';
import { getMaxInitData } from './max-init-data';

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
  const [isLoading, setIsLoading] = useState(() => !getMaxInitData());

  // При загрузке страницы пробуем восстановить сессию через refresh-cookie.
  useEffect(() => {
    // В MAX личность подтверждает подписанный запуск, а не старая cookie Blik.
    // Не запускаем refresh параллельно с MAX-входом: его ответ мог затереть новую сессию.
    if (getMaxInitData()) {
      return;
    }
    let cancelled = false;

    async function restore() {
      try {
        const session = await refreshSession();
        if (cancelled) return;
        setAccessToken(session.accessToken);
        setUser(session.user);
      } catch {
        if (cancelled) return;
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
      const initData = getMaxInitData();
      const res = initData
        ? await loginAndLinkMax(initData, username, password)
        : await apiLogin(username, password);
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
