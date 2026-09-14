import { apiClient } from './client';
import type { TicketStatus, UserRole } from '../types';

export interface SearchResults {
  tickets: { id: string; number: string; description: string; status: TicketStatus }[];
  articles: { id: string; title: string }[];
  users: { id: string; fullName: string; role: UserRole }[];
  locations: { id: string; building: string; room: string; label: string | null }[];
}

export function globalSearch(q: string) {
  return apiClient.get<SearchResults>('/search', { params: { q } }).then((r) => r.data);
}
