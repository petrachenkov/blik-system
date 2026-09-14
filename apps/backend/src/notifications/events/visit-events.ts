/**
 * Доменные события визитов системного администратора (см. план "Планирование визита"). VisitsService их эмитит,
 * NotificationsService подписан и рассылает уведомления — тот же приём, что для ticket-events.
 */
export const VISIT_EVENTS = {
  PROPOSED: 'visit.proposed',
  CONFIRMED: 'visit.confirmed',
  CANCELLED: 'visit.cancelled',
  COUNTERED: 'visit.countered',
  RESCHEDULED: 'visit.rescheduled',
} as const;

interface BaseVisitEvent {
  visitId: string;
  actorId?: string;
}

export interface VisitProposedEvent extends BaseVisitEvent {}
export interface VisitConfirmedEvent extends BaseVisitEvent {
  /** true — окно подтвердил сотрудник (встречное предложение заявителя): уведомляем заявителя. */
  confirmedByTechnician?: boolean;
}
export interface VisitCancelledEvent extends BaseVisitEvent {
  /** Кто отменил — по этому решаем, кого уведомлять (вторую сторону). */
  cancelledByTechnician: boolean;
}
/** Заявитель предложил своё время — окна теперь подтверждает сотрудник. */
export interface VisitCounteredEvent extends BaseVisitEvent {}
/** Визит перенесён сотрудником. `backToProposed` — большой сдвиг, ждём переподтверждения заявителя. */
export interface VisitRescheduledEvent extends BaseVisitEvent {
  backToProposed: boolean;
}
