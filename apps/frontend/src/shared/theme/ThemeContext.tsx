import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type ThemeMode = 'system' | 'light' | 'dark';
export type EffectiveTheme = 'light' | 'dark';

const STORAGE_KEY = 'blik-theme-mode';

function getSystemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function readStoredMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    // localStorage недоступен (приватный режим и т.п.) — используем системную тему молча.
  }
  return 'system';
}

interface ThemeContextValue {
  mode: ThemeMode;
  effective: EffectiveTheme;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(readStoredMode);
  const [systemPrefersDark, setSystemPrefersDark] = useState(getSystemPrefersDark);

  // Следим за сменой темы ОС в реальном времени (пользователь переключил тему Windows/macOS,
  // пока страница открыта) — именно это имелось в виду под "как у пользователя в системе".
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // некритично — тема просто не переживёт перезагрузку страницы
    }
  }, []);

  const effective: EffectiveTheme = mode === 'system' ? (systemPrefersDark ? 'dark' : 'light') : mode;

  // Синхронизируем цвет фона под браузерным UI (адресная строка на мобильных и т.п.)
  useEffect(() => {
    document.documentElement.style.colorScheme = effective;
  }, [effective]);

  const value = useMemo(() => ({ mode, effective, setMode }), [mode, effective, setMode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeMode() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useThemeMode must be used within ThemeProvider');
  return ctx;
}
