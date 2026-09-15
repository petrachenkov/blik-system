import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service.js';
import { SlaService } from '../sla/sla.service.js';
import { TicketPolicy } from './policies/ticket-policy.js';
import { TicketHistoryService } from './history/ticket-history.service.js';
import { isValidStatusTransition } from './ticket-status.js';
import { STORAGE_PROVIDER, type StorageProvider } from '../storage/storage.interface.js';
import { PRIORITY_LABELS_RU, STATUS_LABELS_RU } from '../common/ru-labels.js';
import { stripPriority } from '../common/utils/strip-priority.js';
import { FeatureFlagsService } from '../system/feature-flags.service.js';
import { FEATURE_FLAGS } from '../system/feature-flags.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { matchTagIds } from '../tags/match-tags.js';
import type { AuthenticatedUser } from '../common/types/authenticated-user.js';
import { HistoryAction, NotificationType, TicketStatus, UserRole, type Prisma } from '../../generated/prisma/index.js';
import {
  TICKET_EVENTS,
  type TicketAssignedEvent,
  type TicketClassifiedEvent,
  type TicketCreatedEvent,
  type TicketStatusChangedEvent,
} from '../notifications/events/ticket-events.js';
import type { CreateTicketDto } from './dto/create-ticket.dto.js';
import type { AssignTicketDto } from './dto/assign-ticket.dto.js';
import type { ClassifyTicketDto } from './dto/classify-ticket.dto.js';
import type { ChangeStatusDto } from './dto/change-status.dto.js';
import type { RateTicketDto } from './dto/rate-ticket.dto.js';
import type { FindTicketsQueryDto } from './dto/find-tickets-query.dto.js';
import type { TicketReportRow } from './ticket-report-pdf.builder.js';

export interface AssigneeStatsRow {
  userId: string;
  fullName: string;
  role: UserRole;
  openCount: number;
  totalAssignedCount: number;
  resolvedCount: number;
  rejectedCount: number;
  responseBreachedCount: number;
  resolutionBreachedCount: number;
  avgResponseMinutes: number | null;
  avgResolutionMinutes: number | null;
  avgRating: number | null;
}

const TICKET_INCLUDE = {
  location: true,
  category: true,
  tags: { select: { id: true, name: true, color: true } },
  createdBy: { select: { id: true, fullName: true, username: true } },
  assignedTo: { select: { id: true, fullName: true, username: true } },
  collaborators: {
    select: { userId: true, user: { select: { id: true, fullName: true, role: true } } },
  },
} as const;

export interface BulkActionResult {
  succeeded: number;
  failed: number;
  results: { id: string; ok: boolean; error?: string }[];
}

@Injectable()
export class TicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: TicketPolicy,
    private readonly slaService: SlaService,
    private readonly history: TicketHistoryService,
    private readonly eventEmitter: EventEmitter2,
    private readonly flags: FeatureFlagsService,
    private readonly notifications: NotificationsService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  /** Обёртка над чистой matchTagIds (см. match-tags.ts) — тянет активные теги с правилами из БД. */
  private async matchTags(description: string): Promise<string[]> {
    const tags = await this.prisma.tag.findMany({ where: { isActive: true }, include: { rules: true } });
    return matchTagIds(description, tags);
  }

  private async generateTicketNumber(): Promise<string> {
    const [{ nextval }] = await this.prisma.$queryRaw<{ nextval: bigint }[]>`
      SELECT nextval('ticket_number_seq')
    `;
    return `BLIK-${nextval.toString().padStart(6, '0')}`;
  }

  async create(user: AuthenticatedUser, dto: CreateTicketDto) {
    const location = await this.prisma.location.findUnique({ where: { id: dto.locationId } });
    if (!location || !location.isActive) {
      throw new BadRequestException('Указанная локация не найдена');
    }

    const number = await this.generateTicketNumber();

    // Авто-тегирование считаем ДО создания, чтобы проставить теги одним запросом и вернуть
    // их в ответе (обработчики событий выполняются уже после return — см. план).
    const autoTagIds = (await this.flags.isEnabled(FEATURE_FLAGS.AUTO_TAGGING))
      ? await this.matchTags(dto.description)
      : [];

    const ticket = await this.prisma.ticket.create({
      data: {
        number,
        description: dto.description,
        locationId: dto.locationId,
        createdById: user.id,
        status: TicketStatus.NEW,
        ...(autoTagIds.length > 0 ? { tags: { connect: autoTagIds.map((id) => ({ id })) } } : {}),
      },
      include: TICKET_INCLUDE,
    });

    await this.history.record({ ticketId: ticket.id, actorId: user.id, action: HistoryAction.CREATED });
    if (ticket.tags.length > 0) {
      await this.history.record({
        ticketId: ticket.id,
        actorId: user.id,
        action: HistoryAction.TAGGED,
        toValue: ticket.tags.map((t) => t.name).join(', '),
      });
    }

    const event: TicketCreatedEvent = { ticketId: ticket.id, actorId: user.id };
    this.eventEmitter.emit(TICKET_EVENTS.CREATED, event);

    return ticket;
  }

  async findAll(user: AuthenticatedUser, query: FindTicketsQueryDto) {
    // ВАЖНО: buildVisibilityWhere() у роли ADMIN сам возвращает { OR: [...] } — раньше эти
    // условия собирались плоским спредом одноимённых ключей, и более поздний OR (например,
    // от overdue) молча ПЕРЕЗАПИСЫВАЛ visibility-OR: ADMIN с фильтром "Просроченные" видел
    // просроченные заявки вообще всех сисадминов, а не только свои/неназначенные — реальная
    // дыра в RBAC. Поэтому доп. условия со своим OR идут вложенными элементами AND, а не
    // сиблинг-ключами верхнего уровня.
    const where: Prisma.TicketWhereInput = {
      ...this.policy.buildVisibilityWhere(user),
      // Архивные (см. план "Архив заявок") скрыты по умолчанию, показываются только по archived=true.
      archivedAt: query.archived === 'true' ? { not: null } : null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.assigneeId ? { assignedToId: query.assigneeId } : {}),
      ...(query.locationId ? { locationId: query.locationId } : {}),
      ...(query.tagId ? { tags: { some: { id: query.tagId } } } : {}),
      AND: [
        ...(query.overdue === 'true'
          ? [{ OR: [{ isResponseBreached: true }, { isResolutionBreached: true }] }]
          : []),
        ...(query.search
          ? [
              {
                OR: [
                  { number: { contains: query.search, mode: 'insensitive' as const } },
                  { description: { contains: query.search, mode: 'insensitive' as const } },
                  { createdBy: { fullName: { contains: query.search, mode: 'insensitive' as const } } },
                ],
              },
            ]
          : []),
      ],
    };

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';

    const [items, total] = await this.prisma.$transaction([
      this.prisma.ticket.findMany({
        where,
        include: TICKET_INCLUDE,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.ticket.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async findOneOrThrow(id: string) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id }, include: TICKET_INCLUDE });
    if (!ticket) throw new NotFoundException('Заявка не найдена');
    return ticket;
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const ticket = await this.findOneOrThrow(id);
    if (!this.policy.canView(user, ticket)) {
      throw new ForbiddenException('Нет доступа к этой заявке');
    }
    return ticket;
  }

  /**
   * Экран «Главная» (бывш. «Мой день», см. план): мои открытые заявки, что горит по SLA
   * сегодня и на неделе, визиты/задачи, переоткрытые, статистика за неделю. Включает заявки,
   * где сотрудник — соисполнитель, не только назначенный.
   */
  async getMyDay(user: AuthenticatedUser) {
    const now = new Date();
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const in7days = new Date(now.getTime() + 7 * 24 * 3600_000);
    const startOfWeek = new Date(now.getTime() - 7 * 24 * 3600_000);

    const OPEN: TicketStatus[] = [TicketStatus.NEW, TicketStatus.ASSIGNED, TicketStatus.IN_PROGRESS, TicketStatus.REOPENED];
    // Заявки, к которым сотрудник причастен: назначен или соисполнитель.
    const mineWhere: Prisma.TicketWhereInput = {
      OR: [{ assignedToId: user.id }, { collaborators: { some: { userId: user.id } } }],
    };

    const visitSelect = {
      id: true,
      status: true,
      scheduledStart: true,
      scheduledEnd: true,
      note: true,
      slots: { orderBy: { start: 'asc' as const }, select: { id: true, start: true, end: true } },
      ticket: {
        select: {
          id: true,
          number: true,
          description: true,
          location: { select: { building: true, room: true, label: true } },
          createdBy: { select: { fullName: true } },
        },
      },
    } as const;

    const [
      myOpenTickets,
      slaToday,
      slaWeek,
      reopened,
      visitsToday,
      visitsUpcoming,
      pendingVisits,
      tasksToday,
      tasksUpcoming,
      resolvedWeek,
      reopenedWeek,
      ratingAgg,
    ] = await Promise.all([
      this.prisma.ticket.findMany({
        where: { ...mineWhere, status: { in: OPEN }, archivedAt: null },
        include: TICKET_INCLUDE,
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        take: 50,
      }),
      this.prisma.ticket.findMany({
        where: {
          ...mineWhere,
          status: { in: OPEN },
          OR: [
            { isResponseBreached: true },
            { isResolutionBreached: true },
            { firstRespondedAt: null, responseDueAt: { not: null, lte: endOfToday } },
            { resolvedAt: null, resolutionDueAt: { not: null, lte: endOfToday } },
          ],
        },
        include: TICKET_INCLUDE,
        orderBy: [{ resolutionDueAt: 'asc' }, { responseDueAt: 'asc' }],
      }),
      this.prisma.ticket.findMany({
        where: {
          ...mineWhere,
          status: { in: OPEN },
          isResponseBreached: false,
          isResolutionBreached: false,
          OR: [
            { firstRespondedAt: null, responseDueAt: { gt: endOfToday, lte: in7days } },
            { resolvedAt: null, resolutionDueAt: { gt: endOfToday, lte: in7days } },
          ],
        },
        include: TICKET_INCLUDE,
        orderBy: [{ resolutionDueAt: 'asc' }, { responseDueAt: 'asc' }],
      }),
      this.prisma.ticket.findMany({
        where: { ...mineWhere, status: TicketStatus.REOPENED },
        include: TICKET_INCLUDE,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.ticketVisit.findMany({
        where: { technicianId: user.id, status: 'CONFIRMED', scheduledStart: { gte: startOfToday, lte: endOfToday } },
        orderBy: { scheduledStart: 'asc' },
        select: visitSelect,
      }),
      this.prisma.ticketVisit.findMany({
        where: { technicianId: user.id, status: 'CONFIRMED', scheduledStart: { gt: endOfToday, lte: in7days } },
        orderBy: { scheduledStart: 'asc' },
        select: visitSelect,
      }),
      this.prisma.ticketVisit.findMany({
        where: { technicianId: user.id, status: 'PROPOSED' },
        orderBy: { createdAt: 'desc' },
        select: visitSelect,
      }),
      this.prisma.calendarTask.findMany({
        where: { ownerId: user.id, done: false, start: { gte: startOfToday, lte: endOfToday } },
        orderBy: { start: 'asc' },
        select: {
          id: true,
          title: true,
          note: true,
          start: true,
          end: true,
          done: true,
          ticket: { select: { id: true, number: true } },
        },
      }),
      this.prisma.calendarTask.findMany({
        where: { ownerId: user.id, done: false, start: { gt: endOfToday, lte: in7days } },
        orderBy: { start: 'asc' },
        select: {
          id: true,
          title: true,
          note: true,
          start: true,
          end: true,
          done: true,
          ticket: { select: { id: true, number: true } },
        },
      }),
      this.prisma.ticket.count({ where: { assignedToId: user.id, resolvedAt: { gte: startOfWeek } } }),
      this.prisma.ticketHistory.count({
        where: { action: HistoryAction.REOPENED, createdAt: { gte: startOfWeek }, ticket: { assignedToId: user.id } },
      }),
      this.prisma.ticket.aggregate({
        _avg: { rating: true },
        where: { assignedToId: user.id, ratedAt: { gte: startOfWeek } },
      }),
    ]);

    return {
      myOpenTickets,
      slaToday,
      slaWeek,
      reopened,
      visitsToday,
      visitsUpcoming,
      pendingVisits,
      tasksToday,
      tasksUpcoming,
      weekStats: {
        resolved: resolvedWeek,
        reopened: reopenedWeek,
        avgRating: ratingAgg._avg.rating,
      },
    };
  }

  /** Ручная установка полного набора тегов заявки сотрудником (см. план "Авто-тегирование"). */
  setTags(user: AuthenticatedUser, id: string, tagIds: string[]) {
    return this.modifyTags(user, id, tagIds, 'set');
  }

  /** set — полная замена, add/remove — точечные (для массовых операций, см. план). */
  async modifyTags(user: AuthenticatedUser, id: string, tagIds: string[], mode: 'set' | 'add' | 'remove') {
    await this.findOneOrThrow(id);
    const validTags = tagIds.length
      ? await this.prisma.tag.findMany({ where: { id: { in: tagIds } }, select: { id: true } })
      : [];
    const refs = validTags.map((t) => ({ id: t.id }));
    const data: Prisma.TicketUpdateInput =
      mode === 'set' ? { tags: { set: refs } } : mode === 'add' ? { tags: { connect: refs } } : { tags: { disconnect: refs } };
    const updated = await this.prisma.ticket.update({ where: { id }, data, include: TICKET_INCLUDE });
    await this.history.record({
      ticketId: id,
      actorId: user.id,
      action: HistoryAction.TAGGED,
      toValue: updated.tags.map((t) => t.name).join(', ') || '—',
    });
    return updated;
  }

  /** Пометить/снять пометку архива (см. план "Архив заявок"). Данные не удаляются. */
  async setArchived(id: string, archived: boolean) {
    await this.findOneOrThrow(id);
    return this.prisma.ticket.update({
      where: { id },
      data: { archivedAt: archived ? new Date() : null },
      include: TICKET_INCLUDE,
    });
  }

  async assign(user: AuthenticatedUser, id: string, dto: AssignTicketDto) {
    const ticket = await this.findOneOrThrow(id);

    let assigneeId: string;
    let assigneeFullName: string;
    if (dto.assigneeId) {
      if (!this.policy.canAssignAnyone(user)) {
        throw new ForbiddenException('Назначать заявку другому исполнителю может только сисадмин');
      }
      const assignee = await this.prisma.user.findUnique({ where: { id: dto.assigneeId } });
      if (!assignee || assignee.role === UserRole.USER || !assignee.isActive) {
        throw new BadRequestException('Указанный пользователь не может быть исполнителем');
      }
      assigneeId = dto.assigneeId;
      assigneeFullName = assignee.fullName;
    } else {
      if (!this.policy.canSelfAssign(user, ticket)) {
        throw new ForbiddenException('Эта заявка уже назначена или самоназначение недоступно вашей роли');
      }
      const self = await this.prisma.user.findUnique({ where: { id: user.id } });
      assigneeId = user.id;
      assigneeFullName = self?.fullName ?? user.username;
    }

    const wasAssigned = ticket.assignedToId !== null;
    const updated = await this.prisma.ticket.update({
      where: { id },
      data: {
        assignedToId: assigneeId,
        status: ticket.status === TicketStatus.NEW ? TicketStatus.ASSIGNED : ticket.status,
      },
      include: TICKET_INCLUDE,
    });

    await this.history.record({
      ticketId: id,
      actorId: user.id,
      action: wasAssigned ? HistoryAction.REASSIGNED : HistoryAction.ASSIGNED,
      fromValue: ticket.assignedTo?.fullName,
      toValue: assigneeFullName,
    });

    const event: TicketAssignedEvent = { ticketId: id, actorId: user.id, assigneeId };
    this.eventEmitter.emit(TICKET_EVENTS.ASSIGNED, event);

    return updated;
  }

  async classify(user: AuthenticatedUser, id: string, dto: ClassifyTicketDto) {
    const ticket = await this.findOneOrThrow(id);

    if (!this.policy.canClassify(user, ticket)) {
      throw new ForbiddenException('Классифицировать эту заявку может только назначенный исполнитель');
    }

    const category = await this.prisma.category.findUnique({ where: { id: dto.categoryId } });
    if (!category || !category.isActive) {
      throw new BadRequestException('Указанная категория не найдена');
    }

    const { responseDueAt, resolutionDueAt } = await this.slaService.computeDueDates(dto.priority);

    const updated = await this.prisma.ticket.update({
      where: { id },
      data: {
        categoryId: dto.categoryId,
        priority: dto.priority,
        classifiedById: user.id,
        classifiedAt: new Date(),
        responseDueAt,
        resolutionDueAt,
      },
      include: TICKET_INCLUDE,
    });

    await this.history.record({
      ticketId: id,
      actorId: user.id,
      action: HistoryAction.CLASSIFIED,
      fromValue: ticket.category
        ? `${ticket.category.name} / ${ticket.priority ? PRIORITY_LABELS_RU[ticket.priority] : '—'}`
        : 'не классифицирована',
      toValue: `${category.name} / ${PRIORITY_LABELS_RU[dto.priority]}`,
    });

    const event: TicketClassifiedEvent = { ticketId: id, actorId: user.id };
    this.eventEmitter.emit(TICKET_EVENTS.CLASSIFIED, event);

    return updated;
  }

  async changeStatus(user: AuthenticatedUser, id: string, dto: ChangeStatusDto) {
    const ticket = await this.findOneOrThrow(id);

    if (!isValidStatusTransition(ticket.status, dto.status)) {
      throw new BadRequestException(
        `Переход из статуса "${STATUS_LABELS_RU[ticket.status]}" в "${STATUS_LABELS_RU[dto.status]}" недопустим`,
      );
    }
    if (!this.policy.canChangeStatus(user, ticket, dto.status)) {
      throw new ForbiddenException('У вас нет прав на изменение статуса этой заявки');
    }
    if (dto.status === TicketStatus.IN_PROGRESS && (!ticket.categoryId || !ticket.priority)) {
      throw new BadRequestException('Сначала классифицируйте заявку (категория и приоритет)');
    }

    const now = new Date();
    const updated = await this.prisma.ticket.update({
      where: { id },
      data: {
        status: dto.status,
        firstRespondedAt:
          dto.status === TicketStatus.IN_PROGRESS && !ticket.firstRespondedAt ? now : undefined,
        resolvedAt: dto.status === TicketStatus.RESOLVED ? now : undefined,
        closedAt: dto.status === TicketStatus.CLOSED ? now : undefined,
      },
      include: TICKET_INCLUDE,
    });

    await this.history.record({
      ticketId: id,
      actorId: user.id,
      action: dto.status === TicketStatus.REOPENED ? HistoryAction.REOPENED : HistoryAction.STATUS_CHANGED,
      fromValue: STATUS_LABELS_RU[ticket.status],
      toValue: STATUS_LABELS_RU[dto.status],
    });

    const event: TicketStatusChangedEvent = {
      ticketId: id,
      actorId: user.id,
      fromStatus: ticket.status,
      toStatus: dto.status,
    };
    this.eventEmitter.emit(TICKET_EVENTS.STATUS_CHANGED, event);

    return updated;
  }

  /** Оценка качества решения заявителем — только после закрытия заявки (см. план). */
  async rate(user: AuthenticatedUser, id: string, dto: RateTicketDto) {
    const ticket = await this.findOneOrThrow(id);

    if (!this.policy.canRate(user, ticket)) {
      throw new ForbiddenException('Оценить заявку может только заявитель, и только после того, как она решена');
    }

    const updated = await this.prisma.ticket.update({
      where: { id },
      data: { rating: dto.rating, ratingComment: dto.comment, ratedAt: new Date() },
      include: TICKET_INCLUDE,
    });

    await this.history.record({
      ticketId: id,
      actorId: user.id,
      action: HistoryAction.RATED,
      toValue: `${dto.rating} из 5`,
    });

    return updated;
  }

  // --- Соисполнители (см. план "Соисполнитель заявки") ---

  /** Добавить соисполнителя: полный доступ к работе по заявке без переназначения. */
  async addCollaborator(user: AuthenticatedUser, ticketId: string, userId: string) {
    const ticket = await this.findOneOrThrow(ticketId);
    if (user.role !== UserRole.ADMIN && ticket.assignedToId !== user.id) {
      throw new ForbiddenException('Добавлять соисполнителя может сисадмин или назначенный исполнитель');
    }
    const target = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!target || !target.isActive || target.role === UserRole.USER) {
      throw new BadRequestException('Соисполнителем может быть только активный сотрудник техподдержки');
    }
    if (ticket.assignedToId === userId || ticket.createdById === userId) {
      throw new BadRequestException('Этот пользователь уже участвует в заявке');
    }
    if (ticket.collaborators.some((c) => c.userId === userId)) {
      throw new BadRequestException('Этот сотрудник уже соисполнитель');
    }

    await this.prisma.ticketCollaborator.create({ data: { ticketId, userId, addedById: user.id } });
    await this.history.record({
      ticketId,
      actorId: user.id,
      action: HistoryAction.COLLABORATOR_ADDED,
      toValue: target.fullName,
    });
    await this.notifications.notifyAbout({
      userIds: [userId],
      excludeUserId: user.id,
      ticketId,
      type: NotificationType.TICKET_COLLABORATOR_ADDED,
      title: `Вас добавили соисполнителем: ${ticket.number}`,
      body: 'Вам открыт полный доступ к работе по этой заявке.',
    });
    return this.findOneOrThrow(ticketId);
  }

  async removeCollaborator(user: AuthenticatedUser, ticketId: string, userId: string) {
    const ticket = await this.findOneOrThrow(ticketId);
    const mayRemove = user.role === UserRole.ADMIN || ticket.assignedToId === user.id || userId === user.id;
    if (!mayRemove) throw new ForbiddenException('Нет прав убрать этого соисполнителя');
    const link = ticket.collaborators.find((c) => c.userId === userId);
    if (!link) throw new NotFoundException('Соисполнитель не найден');

    await this.prisma.ticketCollaborator.delete({ where: { ticketId_userId: { ticketId, userId } } });
    await this.history.record({
      ticketId,
      actorId: user.id,
      action: HistoryAction.COLLABORATOR_REMOVED,
      toValue: link.user.fullName,
    });
    return this.findOneOrThrow(ticketId);
  }

  // --- Массовые операции (см. план "Массовые операции над заявками") ---

  async bulkAction(
    user: AuthenticatedUser,
    dto: {
      ids: string[];
      action: 'assign' | 'status' | 'addTags' | 'removeTags' | 'archive';
      assigneeId?: string;
      status?: TicketStatus;
      tagIds?: string[];
      archived?: boolean;
    },
  ): Promise<BulkActionResult> {
    const results: BulkActionResult['results'] = [];
    for (const id of dto.ids) {
      try {
        switch (dto.action) {
          case 'assign':
            await this.assign(user, id, { assigneeId: dto.assigneeId });
            break;
          case 'status':
            if (!dto.status) throw new BadRequestException('Не указан статус');
            await this.changeStatus(user, id, { status: dto.status });
            break;
          case 'addTags':
            await this.modifyTags(user, id, dto.tagIds ?? [], 'add');
            break;
          case 'removeTags':
            await this.modifyTags(user, id, dto.tagIds ?? [], 'remove');
            break;
          case 'archive':
            await this.setArchived(id, dto.archived ?? true);
            break;
        }
        results.push({ id, ok: true });
      } catch (error) {
        results.push({ id, ok: false, error: error instanceof Error ? error.message : 'Ошибка' });
      }
    }
    return {
      succeeded: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    };
  }

  /**
   * Безвозвратное удаление заявки — доступно только master-аккаунту (проверяется
   * MasterOnlyGuard на контроллере, здесь — оборона в глубину). Комментарии/вложения/история
   * удаляются каскадно на уровне БД (см. schema.prisma), сами файлы вложений — с диска отдельно.
   */
  async remove(id: string): Promise<void> {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      include: { attachments: true },
    });
    if (!ticket) throw new NotFoundException('Заявка не найдена');

    await this.prisma.ticket.delete({ where: { id } });

    for (const attachment of ticket.attachments) {
      await this.storage.delete(attachment.storedPath);
    }
  }

  /**
   * Полноценная статистика по исполнителям — "кто, что и как" (см. план), не просто счётчик.
   * Средние времена реакции/решения — разница двух DateTime-колонок, Prisma ORM это не умеет
   * напрямую, поэтому один агрегирующий $queryRaw (тот же приём, что и nextval() для номеров).
   *
   * `from`/`to` — необязательный период по дате создания заявки (см. план "Отчёт по статистике
   * за период"); фронт присылает границы дня целиком (startOf/endOf), поэтому здесь просто
   * прямое сравнение. Без обеих границ — вместо условного SQL-фрагмента (в проекте нет
   * прецедента Prisma.sql/Prisma.empty) подставляем заведомо неограничивающий диапазон —
   * запрос остаётся одним статическим шаблоном.
   */
  async getAssigneeStats(from?: Date, to?: Date): Promise<AssigneeStatsRow[]> {
    const fromDate = from ?? new Date(0);
    const toDate = to ?? new Date('9999-12-31T23:59:59.999Z');
    return this.prisma.$queryRaw<AssigneeStatsRow[]>`
      SELECT
        u."id" AS "userId",
        u."fullName" AS "fullName",
        u."role" AS "role",
        COUNT(*) FILTER (WHERE t."status" IN ('ASSIGNED','IN_PROGRESS','REOPENED'))::int AS "openCount",
        COUNT(*)::int AS "totalAssignedCount",
        COUNT(*) FILTER (WHERE t."status" IN ('RESOLVED','CLOSED'))::int AS "resolvedCount",
        COUNT(*) FILTER (WHERE t."status" = 'REJECTED')::int AS "rejectedCount",
        COUNT(*) FILTER (WHERE t."isResponseBreached")::int AS "responseBreachedCount",
        COUNT(*) FILTER (WHERE t."isResolutionBreached")::int AS "resolutionBreachedCount",
        (AVG(EXTRACT(EPOCH FROM (t."firstRespondedAt" - t."createdAt")) / 60) FILTER (WHERE t."firstRespondedAt" IS NOT NULL))::float8 AS "avgResponseMinutes",
        (AVG(EXTRACT(EPOCH FROM (t."resolvedAt" - t."createdAt")) / 60) FILTER (WHERE t."resolvedAt" IS NOT NULL))::float8 AS "avgResolutionMinutes",
        (AVG(t."rating") FILTER (WHERE t."rating" IS NOT NULL))::float8 AS "avgRating"
      FROM "User" u
      JOIN "Ticket" t ON t."assignedToId" = u."id"
      WHERE u."role" IN ('ADMIN', 'INTERN') AND u."isActive" = true
        AND t."createdAt" >= ${fromDate} AND t."createdAt" <= ${toDate}
      GROUP BY u."id", u."fullName", u."role"
      ORDER BY u."fullName"
    `;
  }

  private static readonly REPORT_INCLUDE = {
    location: true,
    category: true,
    history: {
      orderBy: { createdAt: 'asc' as const },
      include: { actor: { select: { fullName: true } } },
    },
    comments: {
      orderBy: { createdAt: 'asc' as const },
      include: {
        author: { select: { fullName: true, role: true } },
        attachments: { select: { filename: true } },
      },
    },
  };

  /**
   * Заявитель может быть USER (обычный случай) — тогда прячем приоритет из хронологии
   * (см. stripPriority) и вообще исключаем внутренние заметки сотрудников из переписки
   * (см. план "Внутренние заметки" — та же логика фильтрации, что в CommentsService.findByTicket).
   */
  private mapTicketToReportRow(
    t: Prisma.TicketGetPayload<{ include: typeof TicketsService.REPORT_INCLUDE }>,
    viewerRole?: UserRole,
  ): TicketReportRow {
    const isTeacherView = viewerRole === UserRole.USER;
    return {
      number: t.number,
      description: t.description,
      status: t.status,
      priority: t.priority,
      categoryName: t.category?.name ?? null,
      locationLabel: `${t.location.building}, каб. ${t.location.room}`,
      createdAt: t.createdAt,
      closedAt: t.closedAt,
      history: t.history.map((h) => ({
        createdAt: h.createdAt,
        action: h.action,
        fromValue: isTeacherView && h.action === HistoryAction.CLASSIFIED ? stripPriority(h.fromValue) : h.fromValue,
        toValue: isTeacherView && h.action === HistoryAction.CLASSIFIED ? stripPriority(h.toValue) : h.toValue,
        actorFullName: h.actor?.fullName ?? null,
      })),
      comments: t.comments
        .filter((c) => !(isTeacherView && c.isInternal))
        .map((c) => ({
          createdAt: c.createdAt,
          body: c.body,
          authorFullName: c.author?.fullName ?? null,
          authorRole: c.author?.role ?? null,
          attachmentFilenames: c.attachments.map((a) => a.filename),
        })),
    };
  }

  /** Данные для PDF-справки преподавателя — с полной хронологией и перепиской по каждой заявке. */
  async findMyTicketsForReport(
    userId: string,
    viewerRole?: UserRole,
  ): Promise<{ teacherFullName: string; tickets: TicketReportRow[] }> {
    const [creator, tickets] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } }),
      this.prisma.ticket.findMany({
        where: { createdById: userId },
        orderBy: { createdAt: 'desc' },
        include: TicketsService.REPORT_INCLUDE,
      }),
    ]);

    return {
      teacherFullName: creator?.fullName ?? '—',
      tickets: tickets.map((t) => this.mapTicketToReportRow(t, viewerRole)),
    };
  }

  /** Данные для PDF-справки по одной конкретной заявке (см. план "Экспорт заявки в PDF"). */
  async findTicketForReport(
    id: string,
    viewerRole?: UserRole,
  ): Promise<{ teacherFullName: string; ticket: TicketReportRow }> {
    const t = await this.prisma.ticket.findUnique({
      where: { id },
      include: { ...TicketsService.REPORT_INCLUDE, createdBy: { select: { fullName: true } } },
    });
    if (!t) throw new NotFoundException('Заявка не найдена');

    return {
      teacherFullName: t.createdBy.fullName,
      ticket: this.mapTicketToReportRow(t, viewerRole),
    };
  }
}
