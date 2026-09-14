import { apiClient } from './client';

export type LoginEventResult =
  | 'SUCCESS'
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_DISABLED'
  | 'LDAP_UNAVAILABLE'
  | 'MAINTENANCE';

export interface LoginEvent {
  id: string;
  username: string;
  userId: string | null;
  user: { fullName: string } | null;
  result: LoginEventResult;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

/** Журнал входов — только Главный сисадмин (см. план). */
export function fetchLoginEvents() {
  return apiClient.get<LoginEvent[]>('/users/login-log').then((r) => r.data);
}
