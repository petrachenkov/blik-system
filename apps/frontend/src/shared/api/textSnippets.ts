import { apiClient } from './client';
import type { SnippetKind, TextSnippet } from '../types';

export function fetchTextSnippets(kind: SnippetKind, includeInactive = false) {
  return apiClient.get<TextSnippet[]>('/text-snippets', { params: { kind, includeInactive } }).then((r) => r.data);
}

export function createTextSnippet(data: { kind: SnippetKind; title: string; body: string }) {
  return apiClient.post<TextSnippet>('/text-snippets', data).then((r) => r.data);
}

export function updateTextSnippet(id: string, data: Partial<Pick<TextSnippet, 'title' | 'body' | 'isActive' | 'sortOrder'>>) {
  return apiClient.patch<TextSnippet>(`/text-snippets/${id}`, data).then((r) => r.data);
}

export function deleteTextSnippet(id: string) {
  return apiClient.delete(`/text-snippets/${id}`).then((r) => r.data);
}
