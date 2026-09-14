import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service.js';
import { TicketStatus } from '../../generated/prisma/index.js';
import {
  TICKET_EVENTS,
  type TicketResolutionBreachedEvent,
  type TicketResponseBreachedEvent,
} from '../notifications/events/ticket-events.js';

const OPEN_STATUSES: TicketStatus[] = [TicketStatus.NEW, TicketStatus.ASSIGNED, TicketStatus.IN_PROGRESS];

/**
 * Каждые 2 минуты помечает заявки с просроченным SLA и однократно эмитит событие
 * просрочки (флаг isResponseBreached/isResolutionBreached предотвращает повторный спам).
 */
@Injectable()
export class SlaBreachCron {
  private readonly logger = new Logger(SlaBreachCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Cron('0 */2 * * * *')
  async checkBreaches() {
    await this.checkResponseBreaches();
    await this.checkResolutionBreaches();
  }

  private async checkResponseBreaches() {
    const now = new Date();
    const overdue = await this.prisma.ticket.findMany({
      where: {
        status: { in: OPEN_STATUSES },
        firstRespondedAt: null,
        isResponseBreached: false,
        responseDueAt: { not: null, lt: now },
      },
      select: { id: true },
    });

    if (overdue.length === 0) return;

    await this.prisma.ticket.updateMany({
      where: { id: { in: overdue.map((t) => t.id) } },
      data: { isResponseBreached: true },
    });

    for (const ticket of overdue) {
      const event: TicketResponseBreachedEvent = { ticketId: ticket.id };
      this.eventEmitter.emit(TICKET_EVENTS.RESPONSE_BREACHED, event);
    }
    this.logger.warn(`Просрочка реакции по ${overdue.length} заявке(ам)`);
  }

  private async checkResolutionBreaches() {
    const now = new Date();
    const overdue = await this.prisma.ticket.findMany({
      where: {
        status: { in: OPEN_STATUSES },
        resolvedAt: null,
        isResolutionBreached: false,
        resolutionDueAt: { not: null, lt: now },
      },
      select: { id: true },
    });

    if (overdue.length === 0) return;

    await this.prisma.ticket.updateMany({
      where: { id: { in: overdue.map((t) => t.id) } },
      data: { isResolutionBreached: true },
    });

    for (const ticket of overdue) {
      const event: TicketResolutionBreachedEvent = { ticketId: ticket.id };
      this.eventEmitter.emit(TICKET_EVENTS.RESOLUTION_BREACHED, event);
    }
    this.logger.warn(`Просрочка решения по ${overdue.length} заявке(ам)`);
  }
}
