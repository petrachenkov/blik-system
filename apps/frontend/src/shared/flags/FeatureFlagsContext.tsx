import { createContext, useContext, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchFeatureFlags, type FeatureFlags } from '../api/system';
import { useAuth } from '../auth/AuthContext';

/** Ключи должны совпадать с FEATURE_FLAGS на бэкенде (apps/backend/src/system/feature-flags.ts). */
export type FeatureFlagKey =
  | 'wallboard'
  | 'auto_tagging'
  | 'web_push'
  | 'live_chat'
  | 'kb_suggestions'
  | 'onboarding_tour'
  | 'mentions'
  | 'visits';

const FeatureFlagsContext = createContext<FeatureFlags | null>(null);

export function FeatureFlagsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ['system', 'flags'],
    queryFn: fetchFeatureFlags,
    enabled: Boolean(user),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  return <FeatureFlagsContext.Provider value={data ?? null}>{children}</FeatureFlagsContext.Provider>;
}

/**
 * Пока флаги не загрузились (или пользователь не вошёл) — считаем фичу включённой (fail-open),
 * чтобы интерфейс не мигал «то есть, то нет» на каждой перезагрузке.
 */
export function useFeatureFlag(key: FeatureFlagKey): boolean {
  const flags = useContext(FeatureFlagsContext);
  if (!flags) return true;
  return flags[key] ?? true;
}
