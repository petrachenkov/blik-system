import type { CartridgeReportStatus, CartridgeRequestStatus, TicketPriority, TicketStatus, UserRole } from './types';

export const STATUS_LABELS: Record<TicketStatus, string> = {
  NEW: 'Новая',
  ASSIGNED: 'Назначена',
  IN_PROGRESS: 'В работе',
  RESOLVED: 'Выполнена',
  CLOSED: 'Закрыта',
  REJECTED: 'Отклонена',
  REOPENED: 'Переоткрыта',
};

export const STATUS_COLORS: Record<TicketStatus, string> = {
  NEW: 'blue',
  ASSIGNED: 'geekblue',
  IN_PROGRESS: 'gold',
  RESOLVED: 'green',
  CLOSED: 'default',
  REJECTED: 'red',
  REOPENED: 'orange',
};

export const PRIORITY_LABELS: Record<TicketPriority, string> = {
  LOW: 'Низкий',
  MEDIUM: 'Средний',
  HIGH: 'Высокий',
  CRITICAL: 'Критический',
};

export const PRIORITY_COLORS: Record<TicketPriority, string> = {
  LOW: 'default',
  MEDIUM: 'blue',
  HIGH: 'orange',
  CRITICAL: 'red',
};

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Сисадмин',
  INTERN: 'Практикант',
  USER: 'Преподаватель',
};

/** Цвет аватара/бейджа роли — используется в чате заявки, чтобы сразу отличать
 * сисадмина/практиканта от преподавателя-заявителя. */
export const ROLE_COLORS: Record<UserRole, string> = {
  ADMIN: '#1677ff',
  INTERN: '#13a8a8',
  USER: '#8c8c8c',
};

/** true — это сотрудник техподдержки (сисадмин/практикант), false — преподаватель-заявитель. */
export function isStaffRole(role: UserRole): boolean {
  return role !== 'USER';
}

export const CARTRIDGE_STATUS_LABELS: Record<CartridgeRequestStatus, string> = {
  NEW: 'Новая',
  COLLECTED: 'Собран',
  SENT: 'Отправлен на заправку',
  FILLED: 'Заправлен',
  CANCELLED: 'Отменена',
};

export const CARTRIDGE_STATUS_COLORS: Record<CartridgeRequestStatus, string> = {
  NEW: 'blue',
  COLLECTED: 'gold',
  SENT: 'purple',
  FILLED: 'green',
  CANCELLED: 'default',
};

export const CARTRIDGE_REPORT_STATUS_LABELS: Record<CartridgeReportStatus, string> = {
  GENERATED: 'Сформирован',
  CLOSED: 'Закрыт',
};

export const CARTRIDGE_REPORT_STATUS_COLORS: Record<CartridgeReportStatus, string> = {
  GENERATED: 'gold',
  CLOSED: 'green',
};

export const STATUS_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  NEW: ['REJECTED'],
  ASSIGNED: ['IN_PROGRESS', 'REJECTED'],
  IN_PROGRESS: ['RESOLVED', 'REJECTED'],
  RESOLVED: ['CLOSED', 'REOPENED'],
  CLOSED: ['REOPENED'],
  REJECTED: [],
  REOPENED: ['IN_PROGRESS', 'REJECTED'],
};
