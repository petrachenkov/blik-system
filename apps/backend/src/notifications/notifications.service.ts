import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationType, TicketStatus, UserRole } from '../../generated/prisma/index.js';
import { STATUS_LABELS_RU } from '../common/ru-labels.js';
import { isWithinQuietHours } from '../common/utils/quiet-hours.js';
import {
  NOTIFICATION_CHANNELS,
  type NotificationChannelProvider,
} from './channels/notification-channel.interface.js';
import {
  TICKET_EVENTS,
  type TicketAssignedEvent,
  type TicketCommentedEvent,
  type TicketCreatedEvent,
  type TicketResolutionBreachedEvent,
  type TicketResponseBreachedEvent,
  type TicketStatusChangedEvent,
} from './events/ticket-events.js';
import {
  CARTRIDGE_EVENTS,
  type CartridgeFilledEvent,
  type RefillEventCreatedEvent,
  type RefillEventReminderEvent,
} from './events/cartridge-events.js';
import {
  VISIT_EVENTS,
  type VisitCancelledEvent,
  type VisitConfirmedEvent,
  type VisitCounteredEvent,
  type VisitProposedEvent,
  type VisitRescheduledEvent,
} from './events/visit-events.js';

/**
 * Какие переходы статуса вообще заслуживают уведомления и кому — большинство статусов
 * (например, IN_PROGRESS) чисто рабочие и никого постороннего не касаются (см. фидбэк:
 * "не на каждый пук и чих"). Классификация заявки уведомление больше не генерирует вовсе —
 * это обычно делает сам исполнитель сразу после назначения, отдельно сообщать не о чем.
 */
const STATUS_NOTIFICATION_RULES: Partial<
  Record<TicketStatus, { recipient: 'creator' | 'assignee'; body: string }>
> = {
  [TicketStatus.RESOLVED]: { recipient: 'creator', body: 'Исполнитель отметил заявку как выполненную.' },
  [TicketStatus.CLOSED]: { recipient: 'creator', body: 'Заявка закрыта.' },
  [TicketStatus.REJECTED]: { recipient: 'creator', body: 'Заявка отклонена.' },
  [TicketStatus.REOPENED]: { recipient: 'assignee', body: 'Заявитель переоткрыл заявку — требуется вернуться к работе.' },
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(NOTIFICATION_CHANNELS) private readonly channels: NotificationChannelProvider[],
  ) {}

  /** Настройки тихих часов — редактируются через UI (см. план), не через .env. */
  async getQuietHours(): Promise<{ quietHoursStart: string | null; quietHoursEnd: string | null }> {
    const settings = await this.prisma.notificationSettings.findUnique({ where: { id: 'current' } });
    return { quietHoursStart: settings?.quietHoursStart ?? null, quietHoursEnd: settings?.quietHoursEnd ?? null };
  }

  async setQuietHours(updatedById: string, start: string | null, end: string | null) {
    return this.prisma.notificationSettings.upsert({
      where: { id: 'current' },
      update: { quietHoursStart: start, quietHoursEnd: end, updatedById },
      create: { id: 'current', quietHoursStart: start, quietHoursEnd: end, updatedById },
    });
  }

  // --- Личные настройки уведомлений (см. план) ---

  /** Карта по всем типам: строки нет → дефолт { enabled:true, push:true }. */
  async getPreferences(userId: string): Promise<Record<string, { enabled: boolean; push: boolean }>> {
    const rows = await this.prisma.notificationPreference.findMany({ where: { userId } });
    const byType = new Map(rows.map((r) => [r.type, { enabled: r.enabled, push: r.push }]));
    const out: Record<string, { enabled: boolean; push: boolean }> = {};
    for (const type of Object.values(NotificationType)) {
      out[type] = byType.get(type) ?? { enabled: true, push: true };
    }
    return out;
  }

  async setPreferences(userId: string, items: { type: NotificationType; enabled: boolean; push: boolean }[]) {
    for (const item of items) {
      // Дефолтная строка не нужна — удаляем, чтобы таблица не пухла.
      if (item.enabled && item.push) {
        await this.prisma.notificationPreference.deleteMany({ where: { userId, type: item.type } });
      } else {
        await this.prisma.notificationPreference.upsert({
          where: { userId_type: { userId, type: item.type } },
          update: { enabled: item.enabled, push: item.push },
          create: { userId, type: item.type, enabled: item.enabled, push: item.push },
        });
      }
    }
    return this.getPreferences(userId);
  }

  private async notifyUsers(params: {
    userIds: (string | null | undefined)[];
    excludeUserId?: string;
    ticketId?: string;
    type: NotificationType;
    title: string;
    body: string;
    /** Игнорировать тихие часы — для привязанных ко времени уведомлений (напоминания о визите),
     *  которые бессмысленно откладывать. */
    skipQuietHours?: boolean;
  }) {
    const recipientIds = [...new Set(params.userIds.filter((id): id is string => Boolean(id)))].filter(
      (id) => id !== params.excludeUserId,
    );
    if (recipientIds.length === 0) return;

    const quietHours = params.skipQuietHours ? { quietHoursStart: null, quietHoursEnd: null } : await this.getQuietHours();
    const quietNow = isWithinQuietHours(new Date(), quietHours.quietHoursStart ?? undefined, quietHours.quietHoursEnd ?? undefined);

    for (const userId of recipientIds) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user || !user.isActive) continue;

      // Личные настройки (см. план): строки нет → всё включено; enabled=false → тип
      // выключен полностью (даже колокольчик); push=false → без прерывающих каналов.
      const pref = await this.prisma.notificationPreference.findUnique({
        where: { userId_type: { userId, type: params.type } },
      });
      if (pref && !pref.enabled) continue;
      const pushOn = pref?.push ?? true;

      const notification = await this.prisma.notification.create({
        data: {
          userId,
          ticketId: params.ticketId ?? null,
          type: params.type,
          title: params.title,
          body: params.body,
        },
      });

      for (const channel of this.channels) {
        try {
          if (channel.interruptive && !pushOn) continue;
          if (!(await channel.isEnabledFor(user))) continue;

          // "Тихие часы" (см. план) — откладываем только прерывающие каналы (push/мессенджер);
          // IN_APP не трогаем, он и так pull, а не push. Само уведомление уже создано выше,
          // так что оно сразу видно в колокольчике/списке — недостаёт только реального пуша.
          if (quietNow && channel.interruptive) {
            await this.prisma.pendingChannelDelivery.create({
              data: { notificationId: notification.id, channel: channel.channel },
            });
            continue;
          }

          await channel.send(notification, user);
        } catch (error) {
          this.logger.error(`Ошибка доставки уведомления через канал ${channel.channel}`, error instanceof Error ? error.stack : error);
        }
      }
    }
  }

  private async getSuperAdminIds(): Promise<string[]> {
    const admins = await this.prisma.user.findMany({
      where: { role: UserRole.ADMIN, isActive: true },
      select: { id: true },
    });
    return admins.map((a) => a.id);
  }

  /**
   * Уведомить всех Главных сисадминов — прямой вызов из сервиса (не через EventEmitter2),
   * как и sendManual. Используется трекингом ошибок (см. план "Трекинг ошибок").
   */
  async notifySuperAdmins(params: { type: NotificationType; title: string; body: string }) {
    await this.notifyUsers({
      userIds: await this.getSuperAdminIds(),
      type: params.type,
      title: params.title,
      body: params.body,
    });
  }

  /**
   * Публичная обёртка над notifyUsers для прямых вызовов из других сервисов/кронов
   * (напоминания о визитах — см. план "Планирование визита"). Доменные события по-прежнему
   * идут через @OnEvent, это — для не-событийных сценариев.
   */
  async notifyAbout(params: {
    userIds: (string | null | undefined)[];
    excludeUserId?: string;
    ticketId?: string;
    type: NotificationType;
    title: string;
    body: string;
    skipQuietHours?: boolean;
  }) {
    await this.notifyUsers(params);
  }

  private async getTeacherIds(): Promise<string[]> {
    const teachers = await this.prisma.user.findMany({
      where: { role: UserRole.USER, isActive: true },
      select: { id: true },
    });
    return teachers.map((t) => t.id);
  }

  /**
   * Ручная рассылка от Главного сисадмина (см. план): в отличие от остальных методов этого
   * сервиса, вызывается напрямую из контроллера, а не через EventEmitter2 — это не побочный
   * эффект доменного действия где-то ещё, а прямая одноразовая команда администратора.
   */
  async sendManual(params: { actorId: string; title: string; body: string; targetUserId?: string }) {
    let userIds: string[];
    if (params.targetUserId) {
      userIds = [params.targetUserId];
    } else {
      const all = await this.prisma.user.findMany({ where: { isActive: true }, select: { id: true } });
      userIds = all.map((u) => u.id);
    }

    await this.notifyUsers({
      userIds,
      type: NotificationType.ADMIN_BROADCAST,
      title: params.title,
      body: params.body,
    });
  }

  @OnEvent(TICKET_EVENTS.CREATED)
  async onTicketCreated(event: TicketCreatedEvent) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id: event.ticketId } });
    if (!ticket) return;

    await this.notifyUsers({
      userIds: await this.getSuperAdminIds(),
      excludeUserId: event.actorId,
      ticketId: ticket.id,
      type: NotificationType.TICKET_CREATED,
      title: `Новая заявка ${ticket.number}`,
      body: 'Поступила новая заявка, требуется назначить исполнителя.',
    });
  }

  @OnEvent(TICKET_EVENTS.ASSIGNED)
  async onTicketAssigned(event: TicketAssignedEvent) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id: event.ticketId } });
    if (!ticket) return;

    await this.notifyUsers({
      userIds: [event.assigneeId, ticket.createdById],
      excludeUserId: event.actorId,
      ticketId: ticket.id,
      type: NotificationType.TICKET_ASSIGNED,
      title: `Заявка ${ticket.number} назначена`,
      body: 'По заявке назначен исполнитель.',
    });
  }

  /**
   * Классификация заявки уведомление не генерирует — см. STATUS_NOTIFICATION_RULES выше.
   * Слушатель события намеренно не заведён: если понадобится (например, для бота Max),
   * добавить обработчик TICKET_EVENTS.CLASSIFIED сюда же, ядро заявок трогать не придётся.
   */

  @OnEvent(TICKET_EVENTS.STATUS_CHANGED)
  async onTicketStatusChanged(event: TicketStatusChangedEvent) {
    const rule = STATUS_NOTIFICATION_RULES[event.toStatus as TicketStatus];
    if (!rule) return; // например, IN_PROGRESS — рабочий переход, никого не уведомляем

    const ticket = await this.prisma.ticket.findUnique({
      where: { id: event.ticketId },
      include: { collaborators: { select: { userId: true } } },
    });
    if (!ticket) return;

    const collabIds = ticket.collaborators.map((c) => c.userId);
    const recipientIds =
      rule.recipient === 'creator' ? [ticket.createdById] : [ticket.assignedToId, ...collabIds];

    await this.notifyUsers({
      userIds: recipientIds,
      excludeUserId: event.actorId,
      ticketId: ticket.id,
      type: NotificationType.TICKET_STATUS_CHANGED,
      title: `Заявка ${ticket.number}: ${STATUS_LABELS_RU[event.toStatus as TicketStatus].toLowerCase()}`,
      body: rule.body,
    });
  }

  @OnEvent(TICKET_EVENTS.COMMENTED)
  async onTicketCommented(event: TicketCommentedEvent) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: event.ticketId },
      include: { collaborators: { select: { userId: true } } },
    });
    if (!ticket) return;

    const collabIds = ticket.collaborators.map((c) => c.userId);
    // Внутренняя заметка не должна долетать до заявителя даже уведомлением — иначе он узнает
    // о её существовании, не видя содержимого (см. план "Внутренние заметки").
    const recipients = event.isInternal
      ? [ticket.assignedToId, ...collabIds]
      : [ticket.createdById, ticket.assignedToId, ...collabIds];

    await this.notifyUsers({
      userIds: recipients,
      excludeUserId: event.actorId,
      ticketId: ticket.id,
      type: NotificationType.TICKET_COMMENTED,
      title: `Новый комментарий в заявке ${ticket.number}`,
      body: 'В заявке появилось новое сообщение.',
    });

    // Отдельное уведомление "Вас упомянули" — независимо от обычного о новом комментарии,
    // т.к. упомянутый может быть не заявителем и не исполнителем (см. план "Упоминания").
    if (event.mentionedUserIds.length > 0) {
      await this.notifyUsers({
        userIds: event.mentionedUserIds,
        excludeUserId: event.actorId,
        ticketId: ticket.id,
        type: NotificationType.TICKET_MENTIONED,
        title: `Вас упомянули в заявке ${ticket.number}`,
        body: 'Коллега упомянул вас в комментарии к заявке.',
      });
    }
  }

  @OnEvent(TICKET_EVENTS.RESPONSE_BREACHED)
  async onResponseBreached(event: TicketResponseBreachedEvent) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id: event.ticketId } });
    if (!ticket) return;

    await this.notifyUsers({
      userIds: [ticket.assignedToId, ...(await this.getSuperAdminIds())],
      ticketId: ticket.id,
      type: NotificationType.TICKET_RESPONSE_BREACHED,
      title: `Просрочка реакции по заявке ${ticket.number}`,
      body: 'Истёк срок первой реакции на заявку.',
    });
  }

  @OnEvent(TICKET_EVENTS.RESOLUTION_BREACHED)
  async onResolutionBreached(event: TicketResolutionBreachedEvent) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id: event.ticketId } });
    if (!ticket) return;

    await this.notifyUsers({
      userIds: [ticket.assignedToId, ...(await this.getSuperAdminIds())],
      ticketId: ticket.id,
      type: NotificationType.TICKET_RESOLUTION_BREACHED,
      title: `Просрочка решения по заявке ${ticket.number}`,
      body: 'Истёк срок решения заявки.',
    });
  }

  // --- Визиты техника (см. план "Планирование визита") ---

  @OnEvent(VISIT_EVENTS.PROPOSED)
  async onVisitProposed(event: VisitProposedEvent) {
    const visit = await this.prisma.ticketVisit.findUnique({
      where: { id: event.visitId },
      include: { ticket: { select: { id: true, number: true, createdById: true } } },
    });
    if (!visit) return;

    await this.notifyUsers({
      userIds: [visit.ticket.createdById],
      excludeUserId: event.actorId,
      ticketId: visit.ticket.id,
      type: NotificationType.VISIT_PROPOSED,
      title: `Предложено время визита по заявке ${visit.ticket.number}`,
      body: 'Системный администратор предложил варианты времени — выберите удобное окно на странице заявки.',
    });
  }

  @OnEvent(VISIT_EVENTS.CONFIRMED)
  async onVisitConfirmed(event: VisitConfirmedEvent) {
    const visit = await this.prisma.ticketVisit.findUnique({
      where: { id: event.visitId },
      include: { ticket: { select: { id: true, number: true, createdById: true } } },
    });
    if (!visit || !visit.scheduledStart) return;

    const when = visit.scheduledStart.toLocaleString('ru-RU');
    // Обычно окно выбирает заявитель — уведомляем техника; встречное окно подтверждает
    // техник — тогда уведомляем заявителя.
    const recipient = event.confirmedByTechnician ? visit.ticket.createdById : visit.technicianId;
    await this.notifyUsers({
      userIds: [recipient],
      excludeUserId: event.actorId,
      ticketId: visit.ticket.id,
      type: NotificationType.VISIT_CONFIRMED,
      title: `Визит по заявке ${visit.ticket.number} подтверждён`,
      body: event.confirmedByTechnician
        ? `Системный администратор подтвердил ваше время: ${when}.`
        : `Заявитель выбрал время: ${when}.`,
    });
  }

  @OnEvent(VISIT_EVENTS.CANCELLED)
  async onVisitCancelled(event: VisitCancelledEvent) {
    const visit = await this.prisma.ticketVisit.findUnique({
      where: { id: event.visitId },
      include: { ticket: { select: { id: true, number: true, createdById: true } } },
    });
    if (!visit) return;

    // Уведомляем вторую сторону: если отменил техник — заявителя, и наоборот.
    const recipient = event.cancelledByTechnician ? visit.ticket.createdById : visit.technicianId;
    await this.notifyUsers({
      userIds: [recipient],
      excludeUserId: event.actorId,
      ticketId: visit.ticket.id,
      type: NotificationType.VISIT_CANCELLED,
      title: `Визит по заявке ${visit.ticket.number} отменён`,
      body: event.cancelledByTechnician
        ? 'Системный администратор отменил визит. Ожидайте новых вариантов времени.'
        : 'Заявитель отклонил предложенное время — предложите другие варианты.',
    });
  }

  @OnEvent(VISIT_EVENTS.COUNTERED)
  async onVisitCountered(event: VisitCounteredEvent) {
    const visit = await this.prisma.ticketVisit.findUnique({
      where: { id: event.visitId },
      include: { ticket: { select: { id: true, number: true } } },
    });
    if (!visit) return;

    await this.notifyUsers({
      userIds: [visit.technicianId],
      excludeUserId: event.actorId,
      ticketId: visit.ticket.id,
      type: NotificationType.VISIT_PROPOSED,
      title: `Заявитель предложил своё время по заявке ${visit.ticket.number}`,
      body: 'Заявитель предложил удобные ему окна — подтвердите подходящее на странице заявки.',
    });
  }

  @OnEvent(VISIT_EVENTS.RESCHEDULED)
  async onVisitRescheduled(event: VisitRescheduledEvent) {
    const visit = await this.prisma.ticketVisit.findUnique({
      where: { id: event.visitId },
      include: { ticket: { select: { id: true, number: true, createdById: true } } },
    });
    if (!visit) return;

    const slot = visit.scheduledStart ?? (await this.prisma.visitSlot.findFirst({ where: { visitId: visit.id }, orderBy: { start: 'asc' } }))?.start;
    const when = slot ? new Date(slot).toLocaleString('ru-RU') : 'новое время';
    await this.notifyUsers({
      userIds: [visit.ticket.createdById],
      excludeUserId: event.actorId,
      ticketId: visit.ticket.id,
      type: NotificationType.VISIT_RESCHEDULED,
      title: `Визит по заявке ${visit.ticket.number} перенесён`,
      body: event.backToProposed
        ? `Системный администратор предложил новое время (${when}) — подтвердите его на странице заявки.`
        : `Системный администратор перенёс визит на ${when}.`,
    });
  }

  // --- Заправка картриджей (независимый поток — см. план) ---

  /**
   * Уведомления о создании/получении заявки на картридж намеренно не заведены — исполнители
   * видят новые заявки прямо в списке (как список заявок в техподдержку), без формального
   * назначения. Единственный момент, о котором стоит сообщить преподавателю — итоговое закрытие.
   */
  @OnEvent(CARTRIDGE_EVENTS.FILLED)
  async onCartridgeFilled(event: CartridgeFilledEvent) {
    const request = await this.prisma.cartridgeRequest.findUnique({ where: { id: event.cartridgeRequestId } });
    if (!request) return;

    await this.notifyUsers({
      userIds: [request.createdById],
      excludeUserId: event.actorId,
      type: NotificationType.CARTRIDGE_FILLED,
      title: `Картридж по заявке ${request.number} заправлен`,
      body: 'Картридж вернулся с заправки и разнесён по кабинету.',
    });
  }

  @OnEvent(CARTRIDGE_EVENTS.REFILL_EVENT_CREATED)
  async onRefillEventCreated(event: RefillEventCreatedEvent) {
    const refillEvent = await this.prisma.refillEvent.findUnique({ where: { id: event.refillEventId } });
    if (!refillEvent) return;

    await this.notifyUsers({
      userIds: await this.getTeacherIds(),
      excludeUserId: event.actorId,
      type: NotificationType.REFILL_EVENT_CREATED,
      title: 'Назначена плановая заправка картриджей',
      body: `Сдать картриджи можно до ${refillEvent.submissionDeadline.toLocaleString('ru-RU')}. Отправка — ${refillEvent.scheduledAt.toLocaleString('ru-RU')}.`,
    });
  }

  @OnEvent(CARTRIDGE_EVENTS.REFILL_EVENT_REMINDER)
  async onRefillEventReminder(event: RefillEventReminderEvent) {
    const refillEvent = await this.prisma.refillEvent.findUnique({ where: { id: event.refillEventId } });
    if (!refillEvent) return;

    const daysLabel = event.daysLeft === 3 ? '3 дня' : '1 день';

    await this.notifyUsers({
      userIds: await this.getTeacherIds(),
      type: NotificationType.REFILL_EVENT_REMINDER,
      title: `До сдачи картриджей на плановую заправку осталось ${daysLabel}`,
      body: `Успейте сдать картридж до ${refillEvent.submissionDeadline.toLocaleString('ru-RU')}.`,
    });
  }
}
