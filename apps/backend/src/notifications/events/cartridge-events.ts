/**
 * Доменные события модуля заправки картриджей — независимого потока от заявок в техподдержку
 * (см. план: "Модуль заправки картриджей"). NotificationsService подписан и решает, кому
 * отправить уведомление.
 */
export const CARTRIDGE_EVENTS = {
  FILLED: 'cartridge.filled',
  REFILL_EVENT_CREATED: 'refill-event.created',
  REFILL_EVENT_REMINDER: 'refill-event.reminder',
} as const;

export interface CartridgeFilledEvent {
  cartridgeRequestId: string;
  actorId?: string;
}

export interface RefillEventCreatedEvent {
  refillEventId: string;
  actorId?: string;
}

export interface RefillEventReminderEvent {
  refillEventId: string;
  daysLeft: 3 | 1;
}
