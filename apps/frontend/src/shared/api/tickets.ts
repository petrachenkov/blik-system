import { apiClient } from './client';
import type {
  AssigneeStats,
  Ticket,
  TicketAttachment,
  TicketComment,
  TicketHistoryEntry,
  TicketListResponse,
  TicketPriority,
  TicketStatus,
} from '../types';

export type TicketSortField = 'createdAt' | 'number' | 'priority' | 'status' | 'responseDueAt' | 'resolutionDueAt';

export interface FindTicketsParams {
  status?: TicketStatus;
  categoryId?: string;
  tagId?: string;
  overdue?: boolean;
  search?: string;
  assigneeId?: string;
  locationId?: string;
  archived?: boolean;
  page?: number;
  pageSize?: number;
  sortBy?: TicketSortField;
  sortOrder?: 'asc' | 'desc';
}

export type BulkTicketAction = 'assign' | 'status' | 'addTags' | 'removeTags' | 'archive';

export interface BulkActionResult {
  succeeded: number;
  failed: number;
  results: { id: string; ok: boolean; error?: string }[];
}

export function bulkTicketAction(payload: {
  ids: string[];
  action: BulkTicketAction;
  assigneeId?: string;
  status?: TicketStatus;
  tagIds?: string[];
  archived?: boolean;
}) {
  return apiClient.patch<BulkActionResult>('/tickets/bulk', payload).then((r) => r.data);
}

export function setTicketArchived(id: string, archived: boolean) {
  return apiClient.patch<Ticket>(`/tickets/${id}/archive`, { archived }).then((r) => r.data);
}

export function addCollaborator(ticketId: string, userId: string) {
  return apiClient.post<Ticket>(`/tickets/${ticketId}/collaborators`, { userId }).then((r) => r.data);
}

export function removeCollaborator(ticketId: string, userId: string) {
  return apiClient.delete<Ticket>(`/tickets/${ticketId}/collaborators/${userId}`).then((r) => r.data);
}

export function fetchTickets(params: FindTicketsParams) {
  return apiClient.get<TicketListResponse>('/tickets', { params }).then((r) => r.data);
}

export function fetchTicket(id: string) {
  return apiClient.get<Ticket>(`/tickets/${id}`).then((r) => r.data);
}

export function createTicket(data: { locationId: string; description: string }) {
  return apiClient.post<Ticket>('/tickets', data).then((r) => r.data);
}

export function assignTicket(id: string, assigneeId?: string) {
  return apiClient.patch<Ticket>(`/tickets/${id}/assign`, assigneeId ? { assigneeId } : {}).then((r) => r.data);
}

export function classifyTicket(id: string, data: { categoryId: string; priority: TicketPriority }) {
  return apiClient.patch<Ticket>(`/tickets/${id}/classify`, data).then((r) => r.data);
}

export function changeTicketStatus(id: string, status: TicketStatus) {
  return apiClient.patch<Ticket>(`/tickets/${id}/status`, { status }).then((r) => r.data);
}

/** Оценка качества решения — только заявитель, только после закрытия заявки (см. план). */
export function rateTicket(id: string, rating: number, comment?: string) {
  return apiClient.patch<Ticket>(`/tickets/${id}/rate`, { rating, comment }).then((r) => r.data);
}

export function fetchTicketHistory(id: string) {
  return apiClient.get<TicketHistoryEntry[]>(`/tickets/${id}/history`).then((r) => r.data);
}

export function fetchTicketComments(id: string) {
  return apiClient.get<TicketComment[]>(`/tickets/${id}/comments`).then((r) => r.data);
}

export function createTicketComment(
  id: string,
  body: string,
  files: File[],
  knowledgeArticleIds: string[] = [],
  isInternal = false,
  mentionedUserIds: string[] = [],
) {
  const form = new FormData();
  form.append('body', body);
  files.forEach((file) => form.append('files', file));
  knowledgeArticleIds.forEach((articleId) => form.append('knowledgeArticleIds', articleId));
  if (isInternal) form.append('isInternal', 'true');
  mentionedUserIds.forEach((userId) => form.append('mentionedUserIds', userId));
  return apiClient.post<TicketComment>(`/tickets/${id}/comments`, form).then((r) => r.data);
}

/** Редактировать/удалить свой комментарий — без ограничения по времени (см. план). */
export function updateTicketComment(id: string, commentId: string, body: string) {
  return apiClient.patch<TicketComment>(`/tickets/${id}/comments/${commentId}`, { body }).then((r) => r.data);
}

export function deleteTicketComment(id: string, commentId: string) {
  return apiClient.delete(`/tickets/${id}/comments/${commentId}`).then((r) => r.data);
}

export function fetchTicketAttachments(id: string) {
  return apiClient.get<TicketAttachment[]>(`/tickets/${id}/attachments`).then((r) => r.data);
}

export function uploadTicketAttachment(id: string, file: File) {
  const form = new FormData();
  form.append('file', file);
  return apiClient.post<TicketAttachment>(`/tickets/${id}/attachments`, form).then((r) => r.data);
}

export function attachmentDownloadUrl(ticketId: string, attachmentId: string) {
  return `/api/tickets/${ticketId}/attachments/${attachmentId}`;
}

/** Безвозвратное удаление — доступно только master-аккаунту (проверяется на бэкенде). */
export function deleteTicket(id: string) {
  return apiClient.delete(`/tickets/${id}`).then((r) => r.data);
}

/** Полноценная статистика по исполнителям — только Главному сисадмину (см. план). */
export function fetchAssigneeStats() {
  return apiClient.get<AssigneeStats[]>('/tickets/stats/by-assignee').then((r) => r.data);
}

/** PDF-справка о собственных заявках — с хронологией и чатом по каждой. Эндпоинт защищён
 * JwtAuthGuard, поэтому обычная ссылка не приложит токен — забираем как blob (см. AttachmentPreview). */
export async function downloadMyTicketsReport() {
  const res = await apiClient.get('/tickets/report/mine', { responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'spravka.pdf';
  link.click();
  URL.revokeObjectURL(url);
}

/** PDF-справка по одной конкретной заявке — доступна всем, кто видит заявку (см. план). */
export async function downloadTicketReport(id: string, ticketNumber: string) {
  const res = await apiClient.get(`/tickets/${id}/report`, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${ticketNumber}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
}
