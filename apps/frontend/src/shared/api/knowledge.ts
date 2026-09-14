import { apiClient } from './client';
import type { KnowledgeArticle, KnowledgeArticleAttachment, KnowledgeArticleDetail } from '../types';

export function fetchKnowledgeArticles(params: { search?: string; categoryId?: string; take?: number } = {}) {
  return apiClient.get<KnowledgeArticle[]>('/knowledge-articles', { params }).then((r) => r.data);
}

/** Подбор по значимым словам свободного текста, а не по фразе целиком — см. план
 * "Авто-подсказка статьи БЗ" и KnowledgeService.suggest на бэкенде. */
export function fetchKnowledgeSuggestions(text: string) {
  return apiClient.get<KnowledgeArticle[]>('/knowledge-articles/suggest', { params: { text } }).then((r) => r.data);
}

export function fetchKnowledgeArticle(id: string) {
  return apiClient.get<KnowledgeArticleDetail>(`/knowledge-articles/${id}`).then((r) => r.data);
}

export function createKnowledgeArticle(data: { title: string; content: string; categoryId?: string }) {
  return apiClient.post<KnowledgeArticle>('/knowledge-articles', data).then((r) => r.data);
}

export function updateKnowledgeArticle(id: string, data: Partial<{ title: string; content: string; categoryId: string }>) {
  return apiClient.patch<KnowledgeArticle>(`/knowledge-articles/${id}`, data).then((r) => r.data);
}

export function deleteKnowledgeArticle(id: string) {
  return apiClient.delete(`/knowledge-articles/${id}`).then((r) => r.data);
}

export function fetchKnowledgeArticleAttachments(id: string) {
  return apiClient.get<KnowledgeArticleAttachment[]>(`/knowledge-articles/${id}/attachments`).then((r) => r.data);
}

export function uploadKnowledgeArticleAttachment(id: string, file: File) {
  const form = new FormData();
  form.append('file', file);
  return apiClient.post<KnowledgeArticleAttachment>(`/knowledge-articles/${id}/attachments`, form).then((r) => r.data);
}

export function deleteKnowledgeArticleAttachment(id: string, attachmentId: string) {
  return apiClient.delete(`/knowledge-articles/${id}/attachments/${attachmentId}`).then((r) => r.data);
}
