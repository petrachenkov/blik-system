import { apiClient } from './client';

export interface TagRule {
  id: string;
  keyword: string;
}

export interface Tag {
  id: string;
  name: string;
  color: string | null;
  isActive: boolean;
  rules: TagRule[];
  _count: { tickets: number };
}

/** Короткая форма тега на карточке заявки (без правил). */
export interface TagRef {
  id: string;
  name: string;
  color: string | null;
}

export function fetchTags(includeInactive = false) {
  return apiClient.get<Tag[]>('/tags', { params: { includeInactive } }).then((r) => r.data);
}

export function createTag(data: { name: string; color?: string }) {
  return apiClient.post<Tag>('/tags', data).then((r) => r.data);
}

export function updateTag(id: string, data: { name?: string; color?: string | null; isActive?: boolean }) {
  return apiClient.patch<Tag>(`/tags/${id}`, data).then((r) => r.data);
}

export function deleteTag(id: string) {
  return apiClient.delete(`/tags/${id}`).then((r) => r.data);
}

export function addTagRule(tagId: string, keyword: string) {
  return apiClient.post<Tag>(`/tags/${tagId}/rules`, { keyword }).then((r) => r.data);
}

export function deleteTagRule(tagId: string, ruleId: string) {
  return apiClient.delete<Tag>(`/tags/${tagId}/rules/${ruleId}`).then((r) => r.data);
}

export function setTicketTags(ticketId: string, tagIds: string[]) {
  return apiClient.put(`/tickets/${ticketId}/tags`, { tagIds }).then((r) => r.data);
}
