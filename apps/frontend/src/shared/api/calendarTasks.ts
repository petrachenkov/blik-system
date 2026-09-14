import { apiClient } from './client';

export interface CalendarTask {
  id: string;
  ownerId: string;
  owner: { id: string; fullName: string };
  title: string;
  note: string | null;
  start: string;
  end: string;
  done: boolean;
  ticketId: string | null;
  ticket: { id: string; number: string } | null;
}

export interface CreateCalendarTaskInput {
  title: string;
  start: string;
  end: string;
  note?: string;
  ticketId?: string;
  ownerId?: string;
}

export interface UpdateCalendarTaskInput {
  title?: string;
  note?: string;
  start?: string;
  end?: string;
  done?: boolean;
}

export function fetchCalendarTasks(params: { from: string; to: string; scope: 'mine' | 'all' }) {
  return apiClient.get<CalendarTask[]>('/calendar/tasks', { params }).then((r) => r.data);
}

export function fetchTicketTasks(ticketId: string) {
  return apiClient.get<CalendarTask[]>(`/tickets/${ticketId}/tasks`).then((r) => r.data);
}

export function createCalendarTask(data: CreateCalendarTaskInput) {
  return apiClient.post<CalendarTask>('/calendar/tasks', data).then((r) => r.data);
}

export function updateCalendarTask(id: string, data: UpdateCalendarTaskInput) {
  return apiClient.patch<CalendarTask>(`/calendar/tasks/${id}`, data).then((r) => r.data);
}

export function deleteCalendarTask(id: string) {
  return apiClient.delete(`/calendar/tasks/${id}`).then((r) => r.data);
}
