import { apiClient } from './client';
import type { Ticket } from '../types';

export type VisitStatus = 'PROPOSED' | 'CONFIRMED' | 'DONE' | 'CANCELLED';

export interface VisitSlot {
  id: string;
  start: string;
  end: string;
}

export interface VisitTicketRef {
  id: string;
  number: string;
  description: string;
  location: { building: string; room: string; label: string | null };
  createdBy: { fullName: string } | null;
}

export interface TicketVisit {
  id: string;
  status: VisitStatus;
  note: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  counterProposed: boolean;
  slots: VisitSlot[];
  technician: { id: string; fullName: string };
  ticket: VisitTicketRef;
}

/** Визит в календаре — то же, что TicketVisit, плюс номера пересекающихся заявок. */
export interface CalendarVisit extends TicketVisit {
  conflictsWith: string[];
}

export interface VisitConflict {
  kind: 'visit' | 'task';
  label: string;
  ticketNumber?: string;
}

export function fetchTicketVisits(ticketId: string) {
  return apiClient.get<TicketVisit[]>(`/tickets/${ticketId}/visits`).then((r) => r.data);
}

export function proposeVisit(ticketId: string, data: { slots: { start: string; end: string }[]; note?: string }) {
  return apiClient.post<TicketVisit>(`/tickets/${ticketId}/visits`, data).then((r) => r.data);
}

export function confirmVisit(visitId: string, slotId: string) {
  return apiClient.patch<TicketVisit>(`/visits/${visitId}/confirm`, { slotId }).then((r) => r.data);
}

/** Заявитель предлагает своё время (1–3 окна) — потом подтверждает сотрудник. */
export function counterVisit(visitId: string, data: { slots: { start: string; end: string }[]; note?: string }) {
  return apiClient.patch<TicketVisit>(`/visits/${visitId}/counter`, data).then((r) => r.data);
}

/** Перенос подтверждённого визита — перетаскивание в календаре. */
export function rescheduleVisit(visitId: string, data: { start: string; end: string }) {
  return apiClient.patch<TicketVisit>(`/visits/${visitId}/reschedule`, data).then((r) => r.data);
}

export function updateVisitStatus(visitId: string, status: 'DONE' | 'CANCELLED') {
  return apiClient.patch<TicketVisit>(`/visits/${visitId}/status`, { status }).then((r) => r.data);
}

export function fetchVisitsCalendar(params: { from: string; to: string; scope: 'mine' | 'all' }) {
  return apiClient.get<CalendarVisit[]>('/visits/calendar', { params }).then((r) => r.data);
}

export function fetchVisitConflicts(params: { technicianId: string; start: string; end: string }) {
  return apiClient.get<VisitConflict[]>('/visits/conflicts', { params }).then((r) => r.data);
}

/** Визит в компактном виде для экрана «Мой день» (без technician, с урезанной заявкой). */
export interface MyDayVisit {
  id: string;
  status: VisitStatus;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  note: string | null;
  slots: VisitSlot[];
  ticket: VisitTicketRef;
}

export interface MyDayTask {
  id: string;
  title: string;
  note: string | null;
  start: string;
  end: string;
  done: boolean;
  ticket: { id: string; number: string } | null;
}

export interface MyDay {
  myOpenTickets: Ticket[];
  slaToday: Ticket[];
  slaWeek: Ticket[];
  reopened: Ticket[];
  visitsToday: MyDayVisit[];
  visitsUpcoming: MyDayVisit[];
  pendingVisits: MyDayVisit[];
  tasksToday: MyDayTask[];
  tasksUpcoming: MyDayTask[];
  weekStats: { resolved: number; reopened: number; avgRating: number | null };
}

export function fetchMyDay() {
  return apiClient.get<MyDay>('/tickets/my-day').then((r) => r.data);
}
