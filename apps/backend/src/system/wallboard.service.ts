import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { TicketStatus, VisitStatus } from '../../generated/prisma/index.js';

const QUEUE_STATUSES: TicketStatus[] = [
  TicketStatus.NEW,
  TicketStatus.ASSIGNED,
  TicketStatus.IN_PROGRESS,
  TicketStatus.REOPENED,
];

const ACTIVE_ASSIGNED_STATUSES: TicketStatus[] = [
  TicketStatus.ASSIGNED,
  TicketStatus.IN_PROGRESS,
  TicketStatus.REOPENED,
];

@Injectable()
export class WallboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSnapshot() {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(startOfToday);
    endOfToday.setHours(23, 59, 59, 999);

    const [queueGroups, unassignedCount, resolvedToday, overdueRows, workloadGroups, visitRows] = await Promise.all([
      this.prisma.ticket.groupBy({
        by: ['status'],
        where: { status: { in: QUEUE_STATUSES } },
        _count: { _all: true },
      }),
      this.prisma.ticket.count({ where: { status: TicketStatus.NEW, assignedToId: null } }),
      this.prisma.ticket.count({ where: { resolvedAt: { gte: startOfToday } } }),
      this.prisma.ticket.findMany({
        where: {
          status: { in: QUEUE_STATUSES },
          OR: [{ isResponseBreached: true }, { isResolutionBreached: true }],
        },
        orderBy: [{ resolutionDueAt: 'asc' }, { responseDueAt: 'asc' }],
        take: 8,
        select: {
          number: true,
          isResponseBreached: true,
          isResolutionBreached: true,
          responseDueAt: true,
          resolutionDueAt: true,
          assignedTo: { select: { fullName: true } },
        },
      }),
      this.prisma.ticket.groupBy({
        by: ['assignedToId'],
        where: { status: { in: ACTIVE_ASSIGNED_STATUSES }, assignedToId: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.ticketVisit.findMany({
        where: { status: VisitStatus.CONFIRMED, scheduledStart: { gte: startOfToday, lte: endOfToday } },
        orderBy: { scheduledStart: 'asc' },
        select: {
          scheduledStart: true,
          technician: { select: { fullName: true } },
          ticket: {
            select: {
              number: true,
              location: { select: { building: true, room: true } },
              createdBy: { select: { fullName: true } },
            },
          },
        },
      }),
    ]);

    const overdueCount = await this.prisma.ticket.count({
      where: {
        status: { in: QUEUE_STATUSES },
        OR: [{ isResponseBreached: true }, { isResolutionBreached: true }],
      },
    });

    const queue = Object.fromEntries(QUEUE_STATUSES.map((s) => [s, 0])) as Record<TicketStatus, number>;
    for (const g of queueGroups) queue[g.status] = g._count._all;

    const assigneeIds = workloadGroups.map((g) => g.assignedToId).filter((id): id is string => Boolean(id));
    const assignees = await this.prisma.user.findMany({
      where: { id: { in: assigneeIds } },
      select: { id: true, fullName: true, role: true },
    });
    const nameById = new Map(assignees.map((a) => [a.id, a]));
    const workload = workloadGroups
      .flatMap((g) => {
        const u = g.assignedToId ? nameById.get(g.assignedToId) : undefined;
        return u ? [{ fullName: u.fullName, role: u.role, activeCount: g._count._all }] : [];
      })
      .sort((a, b) => b.activeCount - a.activeCount);

    return {
      generatedAt: new Date().toISOString(),
      queue,
      unassignedCount,
      resolvedToday,
      overdue: {
        count: overdueCount,
        items: overdueRows.map((t) => ({
          number: t.number,
          assignee: t.assignedTo?.fullName ?? null,
          breachType: t.isResolutionBreached ? 'resolution' : 'response',
          dueAt: (t.isResolutionBreached ? t.resolutionDueAt : t.responseDueAt)?.toISOString() ?? null,
        })),
      },
      workload,
      visitsToday: visitRows.map((v) => ({
        time: v.scheduledStart!.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
        number: v.ticket.number,
        technician: v.technician.fullName,
        location: `${v.ticket.location.building}, каб. ${v.ticket.location.room}`,
        requester: v.ticket.createdBy?.fullName ?? '—',
      })),
    };
  }
}
