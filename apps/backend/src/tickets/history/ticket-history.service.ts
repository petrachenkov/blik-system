import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { HistoryAction, UserRole } from '../../../generated/prisma/index.js';
import { stripPriority } from '../../common/utils/strip-priority.js';

@Injectable()
export class TicketHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  record(params: {
    ticketId: string;
    actorId?: string;
    action: HistoryAction;
    fromValue?: string;
    toValue?: string;
  }) {
    return this.prisma.ticketHistory.create({
      data: {
        ticketId: params.ticketId,
        actorId: params.actorId,
        action: params.action,
        fromValue: params.fromValue,
        toValue: params.toValue,
      },
    });
  }

  async findByTicket(ticketId: string, viewerRole?: UserRole) {
    const entries = await this.prisma.ticketHistory.findMany({
      where: { ticketId },
      orderBy: { createdAt: 'asc' },
      include: { actor: { select: { id: true, fullName: true, role: true } } },
    });

    if (viewerRole !== UserRole.USER) return entries;

    return entries.map((entry) =>
      entry.action === HistoryAction.CLASSIFIED
        ? { ...entry, fromValue: stripPriority(entry.fromValue), toValue: stripPriority(entry.toValue) }
        : entry,
    );
  }
}
