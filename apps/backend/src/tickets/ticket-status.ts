import { TicketStatus } from '../../generated/prisma/index.js';

/** Карта допустимых переходов статуса — источник правды для машины состояний заявки. */
export const ALLOWED_STATUS_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  [TicketStatus.NEW]: [TicketStatus.REJECTED],
  [TicketStatus.ASSIGNED]: [TicketStatus.IN_PROGRESS, TicketStatus.REJECTED],
  [TicketStatus.IN_PROGRESS]: [TicketStatus.RESOLVED, TicketStatus.REJECTED],
  [TicketStatus.RESOLVED]: [TicketStatus.CLOSED, TicketStatus.REOPENED],
  [TicketStatus.CLOSED]: [TicketStatus.REOPENED],
  [TicketStatus.REJECTED]: [],
  [TicketStatus.REOPENED]: [TicketStatus.IN_PROGRESS, TicketStatus.REJECTED],
};

export function isValidStatusTransition(from: TicketStatus, to: TicketStatus): boolean {
  return ALLOWED_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}
