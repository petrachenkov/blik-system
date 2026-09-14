import { apiClient } from './client';
import type { SiteAnnouncement } from '../types';

export function fetchActiveAnnouncement() {
  return apiClient.get<SiteAnnouncement>('/announcements/active').then((r) => r.data);
}

export function publishAnnouncement(text: string) {
  return apiClient.put<SiteAnnouncement>('/announcements/active', { text }).then((r) => r.data);
}

export function clearAnnouncement() {
  return apiClient.delete('/announcements/active').then((r) => r.data);
}
