import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import { NotificationType, VisitStatus } from '../../../generated/prisma/index.js';

const LEAD_MS = 4 * 60 * 60 * 1000; // напоминание обеим сторонам за ~2–4 часа до визита
const PRESENCE_LEAD_MS = 30 * 60 * 1000; // короткое напоминание заявителю «будьте на месте» за ~30 мин

/**
 * Каждые 15 минут:
 *  - за ≤4 ч до подтверждённого визита (guard reminderSentAt) — уведомляет техника и заявителя;
 *  - за ≤30 мин (guard presenceReminderSentAt) — короткое напоминание только заявителю.
 * Оба напоминания привязаны ко времени, поэтому идут мимо тихих часов (skipQuietHours).
 */
@Injectable()
export class VisitReminderCron {
  private readonly logger = new Logger(VisitReminderCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron('0 */15 * * * *')
  async checkReminders() {
    await this.checkVisitReminders();
    await this.checkPresenceReminders();
  }

  private async checkVisitReminders() {
    const now = new Date();
    const soon = new Date(now.getTime() + LEAD_MS);

    const visits = await this.prisma.ticketVisit.findMany({
      where: {
        status: VisitStatus.CONFIRMED,
        reminderSentAt: null,
        scheduledStart: { gt: now, lte: soon },
      },
      include: { ticket: { select: { number: true, createdById: true } } },
    });

    for (const visit of visits) {
      await this.prisma.ticketVisit.update({ where: { id: visit.id }, data: { reminderSentAt: now } });
      const when = visit.scheduledStart!.toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit' });
      await this.notifications.notifyAbout({
        userIds: [visit.technicianId, visit.ticket.createdById],
        ticketId: visit.ticketId,
        type: NotificationType.VISIT_REMINDER,
        title: `Скоро визит по заявке ${visit.ticket.number}`,
        body: `Запланированный визит начинается в ${when}.`,
        skipQuietHours: true,
      });
      this.logger.log(`Напоминание о визите ${visit.id} по заявке ${visit.ticket.number}`);
    }
  }

  private async checkPresenceReminders() {
    const now = new Date();
    const soon = new Date(now.getTime() + PRESENCE_LEAD_MS);

    const visits = await this.prisma.ticketVisit.findMany({
      where: {
        status: VisitStatus.CONFIRMED,
        presenceReminderSentAt: null,
        scheduledStart: { gt: now, lte: soon },
      },
      include: { ticket: { select: { number: true, createdById: true } } },
    });

    for (const visit of visits) {
      await this.prisma.ticketVisit.update({ where: { id: visit.id }, data: { presenceReminderSentAt: now } });
      await this.notifications.notifyAbout({
        userIds: [visit.ticket.createdById],
        ticketId: visit.ticketId,
        type: NotificationType.VISIT_REMINDER,
        title: `Визит по заявке ${visit.ticket.number} — уже скоро`,
        body: 'Визит начнётся примерно через 30 минут — будьте на месте. Если не сможете — отмените или перенесите на странице заявки.',
        skipQuietHours: true,
      });
      this.logger.log(`Напоминание «будьте на месте» по визиту ${visit.id}`);
    }
  }
}
