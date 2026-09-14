/**
 * Доменные события заявок. TicketsService/SlaBreachCron их эмитят, NotificationsService
 * подписан и решает, кому и как разослать уведомление (см. план — "Событийный слой уведомлений").
 */
export const TICKET_EVENTS = {
  CREATED: 'ticket.created',
  ASSIGNED: 'ticket.assigned',
  CLASSIFIED: 'ticket.classified',
  STATUS_CHANGED: 'ticket.status-changed',
  COMMENTED: 'ticket.commented',
  RESPONSE_BREACHED: 'ticket.response-breached',
  RESOLUTION_BREACHED: 'ticket.resolution-breached',
} as const;

interface BaseTicketEvent {
  ticketId: string;
  actorId?: string;
}

export interface TicketCreatedEvent extends BaseTicketEvent {}

export interface TicketAssignedEvent extends BaseTicketEvent {
  assigneeId: string;
}

export interface TicketClassifiedEvent extends BaseTicketEvent {}

export interface TicketStatusChangedEvent extends BaseTicketEvent {
  fromStatus: string;
  toStatus: string;
}

export interface TicketCommentedEvent extends BaseTicketEvent {
  commentId: string;
  /** Внутренняя заметка — заявителя нужно исключить из получателей (см. план). */
  isInternal: boolean;
  /** Коллеги, упомянутые через @ в тексте — отдельное уведомление "Вас упомянули" (см. план). */
  mentionedUserIds: string[];
}

export interface TicketResponseBreachedEvent extends BaseTicketEvent {}
export interface TicketResolutionBreachedEvent extends BaseTicketEvent {}
