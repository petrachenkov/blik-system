import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service.js';
import { CARTRIDGE_EVENTS, type RefillEventReminderEvent } from '../notifications/events/cartridge-events.js';

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Раз в час проверяет активные плановые заправки и шлёт напоминание, как только дедлайн сдачи
 * попадает в окно "осталось ≤3 дня" / "осталось ≤1 день" — по образцу SlaBreachCron: guard-флаг
 * на строке (reminder3dSentAt/reminder1dSentAt) гарантирует, что каждое напоминание уйдёт ровно один раз.
 */
@Injectable()
export class RefillReminderCron {
  private readonly logger = new Logger(RefillReminderCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Cron('0 0 * * * *')
  async checkReminders() {
    const now = new Date();
    const events = await this.prisma.refillEvent.findMany({
      where: { isCancelled: false, submissionDeadline: { gt: now } },
    });

    for (const event of events) {
      const msLeft = event.submissionDeadline.getTime() - now.getTime();

      if (msLeft <= THREE_DAYS_MS && !event.reminder3dSentAt) {
        await this.prisma.refillEvent.update({ where: { id: event.id }, data: { reminder3dSentAt: now } });
        this.emitReminder(event.id, 3);
      }

      if (msLeft <= ONE_DAY_MS && !event.reminder1dSentAt) {
        await this.prisma.refillEvent.update({ where: { id: event.id }, data: { reminder1dSentAt: now } });
        this.emitReminder(event.id, 1);
      }
    }
  }

  private emitReminder(refillEventId: string, daysLeft: 3 | 1) {
    const event: RefillEventReminderEvent = { refillEventId, daysLeft };
    this.eventEmitter.emit(CARTRIDGE_EVENTS.REFILL_EVENT_REMINDER, event);
    this.logger.log(`Напоминание о плановой заправке ${refillEventId}: осталось ${daysLeft} дн.`);
  }
}
