import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { TicketPriority } from '../../generated/prisma/index.js';
import type { UpdateSlaConfigDto } from './dto/update-sla-config.dto.js';

export interface SlaDueDates {
  responseDueAt: Date;
  resolutionDueAt: Date;
}

@Injectable()
export class SlaService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.slaConfig.findMany({ orderBy: { priority: 'asc' } });
  }

  async update(priority: TicketPriority, dto: UpdateSlaConfigDto, updatedById: string) {
    return this.prisma.slaConfig.upsert({
      where: { priority },
      update: { ...dto, updatedById },
      create: { priority, ...dto, updatedById },
    });
  }

  /**
   * Снимок дедлайнов на момент классификации заявки (см. план — SLA считается не при
   * создании заявки, а когда исполнитель впервые проставляет приоритет).
   */
  async computeDueDates(priority: TicketPriority, from: Date = new Date()): Promise<SlaDueDates> {
    const config = await this.prisma.slaConfig.findUnique({ where: { priority } });
    if (!config) {
      throw new NotFoundException(`SLA-настройки для приоритета ${priority} не заданы`);
    }

    return {
      responseDueAt: new Date(from.getTime() + config.responseMinutes * 60_000),
      resolutionDueAt: new Date(from.getTime() + config.resolutionMinutes * 60_000),
    };
  }
}
