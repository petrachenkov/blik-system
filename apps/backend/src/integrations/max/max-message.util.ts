import { NotificationType, TicketStatus, type Notification } from '../../../generated/prisma/index.js';

const EVENT_ICONS: Record<NotificationType, string> = {
  TICKET_CREATED: '🆕',
  TICKET_ASSIGNED: '👤',
  TICKET_CLASSIFIED: '🏷️',
  TICKET_STATUS_CHANGED: '🔄',
  TICKET_COMMENTED: '💬',
  TICKET_MENTIONED: '📣',
  TICKET_RESPONSE_BREACHED: '⏱️',
  TICKET_RESOLUTION_BREACHED: '🚨',
  CARTRIDGE_FILLED: '🖨️',
  REFILL_EVENT_CREATED: '📦',
  REFILL_EVENT_REMINDER: '⏰',
  ADMIN_BROADCAST: '📢',
  SYSTEM_ERROR: '⚠️',
  VISIT_PROPOSED: '📅',
  VISIT_CONFIRMED: '🤝',
  VISIT_CANCELLED: '❌',
  VISIT_REMINDER: '🔔',
  VISIT_RESCHEDULED: '🗓️',
  TICKET_COLLABORATOR_ADDED: '👥',
};

type MessageNotification = Pick<Notification, 'type' | 'title' | 'body' | 'payload'>;

function getIcon({ type, payload }: MessageNotification): string {
  if (type === NotificationType.TICKET_STATUS_CHANGED && payload && typeof payload === 'object' && !Array.isArray(payload)) {
    switch (payload.ticketStatus) {
      case TicketStatus.RESOLVED: return '✅';
      case TicketStatus.CLOSED: return '🔒';
      case TicketStatus.REJECTED: return '⛔';
      case TicketStatus.REOPENED: return '↩️';
    }
  }
  return EVENT_ICONS[type];
}

/** Экранируем пользовательский текст и ограничиваем размер до добавления HTML-тегов. */
function escapeLimited(value: string, limit: number): string {
  let out = '';
  for (const char of value) {
    const escaped = char === '&' ? '&amp;' : char === '<' ? '&lt;' : char === '>' ? '&gt;' : char;
    if (out.length + escaped.length > limit) break;
    out += escaped;
  }
  return out;
}

export function formatMaxMessage(notification: MessageNotification): string {
  const heading = escapeLimited(notification.title, 600);
  const prefix = `${getIcon(notification)} <b>${heading}</b>\n\n`;
  return prefix + escapeLimited(notification.body, 4000 - prefix.length);
}
