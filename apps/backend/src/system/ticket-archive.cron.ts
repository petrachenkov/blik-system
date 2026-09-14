import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { TicketStatus } from '../../generated/prisma/index.js';
import { TicketRetentionService } from './ticket-retention.service.js';

/**
 * Ночной автоархив старых закрытых/отклонённых заявок (см. план «Архив заявок»).
 * Только помечает `archivedAt` — заявки скрываются из списков, но не удаляются.
 */
@Injectable()
export class TicketArchiveCron {
  private readonly logger = new Logger(TicketArchiveCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly retention: TicketRetentionService,
  ) {}

  @Cron('0 30 3 * * *')
  async archiveOld() {
    const settings = await this.retention.get();
    if (!settings.enabled) return;

    const cutoff = new Date(Date.now() - settings.archiveClosedAfterDays * 24 * 3600_000);
    const { count } = await this.prisma.ticket.updateMany({
      where: {
        archivedAt: null,
        status: { in: [TicketStatus.CLOSED, TicketStatus.REJECTED] },
        OR: [{ closedAt: { lt: cutoff } }, { closedAt: null, updatedAt: { lt: cutoff } }],
      },
      data: { archivedAt: new Date() },
    });
    if (count > 0) this.logger.log(`Архивировано заявок: ${count}`);
  }
}
