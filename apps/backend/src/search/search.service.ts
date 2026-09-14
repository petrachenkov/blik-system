import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { TicketPolicy } from '../tickets/policies/ticket-policy.js';
import type { AuthenticatedUser } from '../common/types/authenticated-user.js';
import { UserRole } from '../../generated/prisma/index.js';

/**
 * Единый поиск для палитры (Ctrl/Cmd-K, см. план). Заявки — с учётом видимости роли;
 * сотрудники/кабинеты — только для сотрудников техподдержки.
 */
@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: TicketPolicy,
  ) {}

  async search(user: AuthenticatedUser, q: string) {
    const contains = { contains: q, mode: 'insensitive' as const };
    const isStaff = user.role === UserRole.ADMIN || user.role === UserRole.INTERN;

    const [tickets, articles, users, locations] = await Promise.all([
      this.prisma.ticket.findMany({
        where: {
          // visibility может сам содержать OR (INTERN) — не смешиваем с OR поиска, кладём в AND.
          AND: [this.policy.buildVisibilityWhere(user), { OR: [{ number: contains }, { description: contains }] }],
          archivedAt: null,
        },
        select: { id: true, number: true, description: true, status: true },
        orderBy: { createdAt: 'desc' },
        take: 6,
      }),
      this.prisma.knowledgeArticle.findMany({
        where: { OR: [{ title: contains }, { content: contains }] },
        select: { id: true, title: true },
        orderBy: { updatedAt: 'desc' },
        take: 5,
      }),
      isStaff
        ? this.prisma.user.findMany({
            where: { isActive: true, OR: [{ fullName: contains }, { username: contains }] },
            select: { id: true, fullName: true, role: true },
            orderBy: { fullName: 'asc' },
            take: 5,
          })
        : Promise.resolve([]),
      isStaff
        ? this.prisma.location.findMany({
            where: { OR: [{ building: contains }, { room: contains }, { label: contains }] },
            select: { id: true, building: true, room: true, label: true },
            orderBy: [{ building: 'asc' }, { room: 'asc' }],
            take: 5,
          })
        : Promise.resolve([]),
    ]);

    return { tickets, articles, users, locations };
  }
}
