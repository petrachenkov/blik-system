import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { TicketPolicy } from '../policies/ticket-policy.js';
import { FeatureFlagsService } from '../../system/feature-flags.service.js';
import { WorkingHoursService } from '../../system/working-hours.service.js';
import { FEATURE_FLAGS } from '../../system/feature-flags.js';
import { checkSlotWithinWorkingHours } from '../../common/utils/working-hours.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { UserRole } from '../../../generated/prisma/index.js';
import type { CalendarTaskScope, CreateCalendarTaskDto, UpdateCalendarTaskDto } from './dto/calendar-task.dto.js';

const STAFF_ROLES = new Set<UserRole>([UserRole.ADMIN, UserRole.INTERN]);

const TASK_INCLUDE = {
  owner: { select: { id: true, fullName: true } },
  ticket: { select: { id: true, number: true } },
} as const;

/**
 * Задачи в календаре сотрудника (см. план «Задачи в календаре»): отдельная работа или
 * внутренняя работа по заявке. Только в рабочие часы (те же WorkingHoursSettings, что и окна
 * визитов). Сисадмин может завести задачу любому сотруднику, практикант — только себе.
 */
@Injectable()
export class CalendarTasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: TicketPolicy,
    private readonly flags: FeatureFlagsService,
    private readonly workingHours: WorkingHoursService,
  ) {}

  private async assertEnabled() {
    if (!(await this.flags.isEnabled(FEATURE_FLAGS.VISITS))) {
      throw new ForbiddenException('Планирование отключено');
    }
  }

  private async validateWindow(startRaw: string, endRaw: string) {
    const start = new Date(startRaw);
    const end = new Date(endRaw);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
      throw new BadRequestException('Некорректный интервал задачи');
    }
    if (start.getTime() < Date.now()) {
      throw new BadRequestException('Нельзя запланировать задачу в прошлом');
    }
    const problem = checkSlotWithinWorkingHours(start, end, await this.workingHours.get());
    if (problem) throw new BadRequestException(problem);
    return { start, end };
  }

  async list(user: AuthenticatedUser, params: { from: Date; to: Date; scope: CalendarTaskScope }) {
    await this.assertEnabled();
    if (!STAFF_ROLES.has(user.role)) throw new ForbiddenException('Календарь доступен только сотрудникам техподдержки');

    const scope: CalendarTaskScope = user.role === UserRole.ADMIN ? params.scope : 'mine';
    const ownerFilter = scope === 'mine' ? { ownerId: user.id } : {};

    return this.prisma.calendarTask.findMany({
      where: { ...ownerFilter, start: { lt: params.to }, end: { gt: params.from } },
      include: TASK_INCLUDE,
      orderBy: { start: 'asc' },
    });
  }

  async listByTicket(user: AuthenticatedUser, ticketId: string) {
    await this.assertEnabled();
    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Заявка не найдена');
    if (!this.policy.canView(user, ticket)) throw new ForbiddenException('Нет доступа к этой заявке');

    return this.prisma.calendarTask.findMany({
      where: { ticketId },
      include: TASK_INCLUDE,
      orderBy: { start: 'asc' },
    });
  }

  async create(user: AuthenticatedUser, dto: CreateCalendarTaskDto) {
    await this.assertEnabled();
    if (!STAFF_ROLES.has(user.role)) throw new ForbiddenException('Заводить задачи может только сотрудник техподдержки');

    // Владельца может задавать только сисадмин; практикант всегда владелец = он сам.
    let ownerId = user.id;
    if (dto.ownerId && dto.ownerId !== user.id) {
      if (user.role !== UserRole.ADMIN) throw new ForbiddenException('Назначать задачу другому может только системный администратор');
      const owner = await this.prisma.user.findUnique({ where: { id: dto.ownerId } });
      if (!owner || !owner.isActive || !STAFF_ROLES.has(owner.role)) {
        throw new BadRequestException('Указанный сотрудник не найден');
      }
      ownerId = owner.id;
    }

    if (dto.ticketId) {
      const ticket = await this.prisma.ticket.findUnique({ where: { id: dto.ticketId } });
      if (!ticket) throw new NotFoundException('Заявка не найдена');
      if (!this.policy.canView(user, ticket)) throw new ForbiddenException('Нет доступа к этой заявке');
    }

    const { start, end } = await this.validateWindow(dto.start, dto.end);

    return this.prisma.calendarTask.create({
      data: {
        ownerId,
        createdById: user.id,
        title: dto.title.trim(),
        note: dto.note?.trim() || null,
        start,
        end,
        ticketId: dto.ticketId ?? null,
      },
      include: TASK_INCLUDE,
    });
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateCalendarTaskDto) {
    await this.assertEnabled();
    const task = await this.prisma.calendarTask.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('Задача не найдена');
    const mayEdit = task.ownerId === user.id || task.createdById === user.id || user.role === UserRole.ADMIN;
    if (!mayEdit) throw new ForbiddenException('Нет прав менять эту задачу');

    const data: Record<string, unknown> = {};
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.note !== undefined) data.note = dto.note?.trim() || null;
    if (dto.done !== undefined) data.done = dto.done;
    if (dto.start !== undefined || dto.end !== undefined) {
      const { start, end } = await this.validateWindow(
        dto.start ?? task.start.toISOString(),
        dto.end ?? task.end.toISOString(),
      );
      data.start = start;
      data.end = end;
    }

    return this.prisma.calendarTask.update({ where: { id }, data, include: TASK_INCLUDE });
  }

  async remove(user: AuthenticatedUser, id: string) {
    await this.assertEnabled();
    const task = await this.prisma.calendarTask.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('Задача не найдена');
    const mayDelete = task.ownerId === user.id || task.createdById === user.id || user.role === UserRole.ADMIN;
    if (!mayDelete) throw new ForbiddenException('Нет прав удалить эту задачу');
    await this.prisma.calendarTask.delete({ where: { id } });
  }
}
