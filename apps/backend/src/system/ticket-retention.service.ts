import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export interface TicketRetention {
  enabled: boolean;
  archiveClosedAfterDays: number;
}

const DEFAULTS: TicketRetention = { enabled: false, archiveClosedAfterDays: 180 };

/**
 * Политика хранения заявок (см. план «Архив заявок»). Singleton `id 'current'`, по образцу
 * WorkingHoursService. Автоархив только помечает `archivedAt` — данные не удаляются.
 */
@Injectable()
export class TicketRetentionService {
  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<TicketRetention> {
    const row = await this.prisma.ticketRetentionSettings.findUnique({ where: { id: 'current' } });
    if (!row) return { ...DEFAULTS };
    return { enabled: row.enabled, archiveClosedAfterDays: row.archiveClosedAfterDays };
  }

  async set(updatedById: string, data: Partial<TicketRetention>): Promise<TicketRetention> {
    const current = await this.get();
    const next: TicketRetention = {
      enabled: data.enabled ?? current.enabled,
      archiveClosedAfterDays: data.archiveClosedAfterDays ?? current.archiveClosedAfterDays,
    };
    await this.prisma.ticketRetentionSettings.upsert({
      where: { id: 'current' },
      update: { ...next, updatedById },
      create: { id: 'current', ...next, updatedById },
    });
    return next;
  }
}
