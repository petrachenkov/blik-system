import { HistoryAction, TicketPriority, TicketStatus, UserRole } from '../../generated/prisma/index.js';

/**
 * Русскоязычные подписи для enum-значений — используются и в тексте уведомлений, и в записях
 * истории заявки, чтобы нигде не протекали сырые значения вида "RESOLVED"/"LOW" (см. фидбэк).
 */
export const STATUS_LABELS_RU: Record<TicketStatus, string> = {
  NEW: 'Новая',
  ASSIGNED: 'Назначена',
  IN_PROGRESS: 'В работе',
  RESOLVED: 'Выполнена',
  CLOSED: 'Закрыта',
  REJECTED: 'Отклонена',
  REOPENED: 'Переоткрыта',
};

export const PRIORITY_LABELS_RU: Record<TicketPriority, string> = {
  LOW: 'Низкий',
  MEDIUM: 'Средний',
  HIGH: 'Высокий',
  CRITICAL: 'Критический',
};

// Перенесено 1-в-1 с фронтенда (TicketDetailPage.tsx, HISTORY_ACTION_LABELS) — здесь нужно
// для PDF-справки, которая рендерится на бэкенде и не должна показывать сырой enum.
export const HISTORY_ACTION_LABELS_RU: Record<HistoryAction, string> = {
  CREATED: 'Заявка создана',
  ASSIGNED: 'Назначен исполнитель',
  REASSIGNED: 'Переназначена',
  UNASSIGNED: 'Снято назначение',
  CLASSIFIED: 'Классифицирована',
  STATUS_CHANGED: 'Изменён статус',
  COMMENTED: 'Комментарий',
  ATTACHMENT_ADDED: 'Добавлено вложение',
  REOPENED: 'Переоткрыта',
  RATED: 'Оценено заявителем',
  TAGGED: 'Изменены теги',
  VISIT_SCHEDULED: 'Назначен визит',
  VISIT_RESCHEDULED: 'Визит перенесён',
  VISIT_COMPLETED: 'Визит состоялся',
  COLLABORATOR_ADDED: 'Добавлен соисполнитель',
  COLLABORATOR_REMOVED: 'Убран соисполнитель',
};

// Перенесено 1-в-1 с фронтенда (shared/labels.ts, ROLE_LABELS) — нужно для подписи автора
// сообщения в PDF-справке.
export const ROLE_LABELS_RU: Record<UserRole, string> = {
  ADMIN: 'Сисадмин',
  INTERN: 'Практикант',
  USER: 'Преподаватель',
};
