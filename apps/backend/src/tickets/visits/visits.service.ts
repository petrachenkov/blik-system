import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service.js';
import { TicketPolicy } from '../policies/ticket-policy.js';
import { TicketHistoryService } from '../history/ticket-history.service.js';
import { FeatureFlagsService } from '../../system/feature-flags.service.js';
import { WorkingHoursService } from '../../system/working-hours.service.js';
import { FEATURE_FLAGS } from '../../system/feature-flags.js';
import { checkSlotWithinWorkingHours } from '../../common/utils/working-hours.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { HistoryAction, UserRole, VisitStatus } from '../../../generated/prisma/index.js';
import {
  VISIT_EVENTS,
  type VisitCancelledEvent,
  type VisitConfirmedEvent,
  type VisitCounteredEvent,
  type VisitProposedEvent,
  type VisitRescheduledEvent,
} from '../../notifications/events/visit-events.js';
import { validateVisitSlots } from './validate-slots.js';
import type { ProposeVisitDto, ConfirmVisitDto, RescheduleVisitDto } from './dto/visit.dto.js';

const STAFF_ROLES = new Set<UserRole>([UserRole.ADMIN, UserRole.INTERN]);

/** Порог «малого сдвига» при переносе подтверждённого визита — до этого значения визит остаётся
 *  CONFIRMED и заявителя просто уведомляют; больше — визит уходит на переподтверждение. */
const SMALL_SHIFT_MS = 60 * 60 * 1000;

const VISIT_INCLUDE = {
  slots: { orderBy: { start: 'asc' as const } },
  technician: { select: { id: true, fullName: true } },
  ticket: {
    select: {
      id: true,
      number: true,
      description: true,
      createdById: true,
      assignedToId: true,
      status: true,
      location: { select: { building: true, room: true, label: true } },
      createdBy: { select: { id: true, fullName: true } },
    },
  },
} as const;

export interface ScheduleConflict {
  kind: 'visit' | 'task';
  label: string;
  ticketNumber?: string;
}

@Injectable()
export class VisitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: TicketPolicy,
    private readonly history: TicketHistoryService,
    private readonly eventEmitter: EventEmitter2,
    private readonly flags: FeatureFlagsService,
    private readonly workingHours: WorkingHoursService,
  ) {}

  private async assertEnabled() {
    if (!(await this.flags.isEnabled(FEATURE_FLAGS.VISITS))) {
      throw new ForbiddenException('Планирование визитов отключено');
    }
  }

  private async getTicketForUser(user: AuthenticatedUser, ticketId: string) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Заявка не найдена');
    if (!this.policy.canView(user, ticket)) throw new ForbiddenException('Нет доступа к этой заявке');
    return ticket;
  }

  private parseSlots(raw: { start: string; end: string }[], workingHours: Awaited<ReturnType<WorkingHoursService['get']>>) {
    try {
      return validateVisitSlots(raw, Date.now(), workingHours);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Некорректные окна визита');
    }
  }

  /**
   * Занятость сотрудника в интервале [start, end): подтверждённые визиты + незавершённые
   * задачи из его календаря (см. план «Задачи в календаре» — блоки-задачи считаются занятым
   * временем).
   */
  async findTechnicianConflicts(
    technicianId: string,
    start: Date,
    end: Date,
    excludeVisitId?: string,
  ): Promise<ScheduleConflict[]> {
    const [visits, tasks] = await Promise.all([
      this.prisma.ticketVisit.findMany({
        where: {
          id: excludeVisitId ? { not: excludeVisitId } : undefined,
          technicianId,
          status: VisitStatus.CONFIRMED,
          scheduledStart: { lt: end },
          scheduledEnd: { gt: start },
        },
        select: { ticket: { select: { number: true } } },
      }),
      this.prisma.calendarTask.findMany({
        where: {
          ownerId: technicianId,
          done: false,
          start: { lt: end },
          end: { gt: start },
        },
        select: { title: true },
      }),
    ]);
    return [
      ...visits.map((v): ScheduleConflict => ({ kind: 'visit', label: `визит ${v.ticket.number}`, ticketNumber: v.ticket.number })),
      ...tasks.map((t): ScheduleConflict => ({ kind: 'task', label: `задача «${t.title}»` })),
    ];
  }

  findByTicket(user: AuthenticatedUser, ticketId: string) {
    return this.getTicketForUser(user, ticketId).then(() =>
      this.prisma.ticketVisit.findMany({
        where: { ticketId },
        orderBy: { createdAt: 'desc' },
        include: VISIT_INCLUDE,
      }),
    );
  }

  /** Визиты в диапазоне для экрана «Календарь» (см. план). */
  async calendar(user: AuthenticatedUser, params: { from: Date; to: Date; scope: 'mine' | 'all' }) {
    await this.assertEnabled();
    if (!STAFF_ROLES.has(user.role)) throw new ForbiddenException('Календарь визитов доступен только сотрудникам техподдержки');

    // Практикант всегда видит только свои визиты; сисадмин может смотреть всю команду.
    const scope: 'mine' | 'all' = user.role === UserRole.ADMIN ? params.scope : 'mine';
    const technicianFilter = scope === 'mine' ? { technicianId: user.id } : {};

    const visits = await this.prisma.ticketVisit.findMany({
      where: {
        ...technicianFilter,
        OR: [
          { status: VisitStatus.CONFIRMED, scheduledStart: { gte: params.from, lt: params.to } },
          { status: VisitStatus.PROPOSED, slots: { some: { start: { gte: params.from, lt: params.to } } } },
        ],
      },
      include: VISIT_INCLUDE,
      orderBy: { scheduledStart: 'asc' },
    });

    // Пометка пересекающихся подтверждённых визитов одного техника (в пределах выборки).
    const confirmed = visits.filter((v) => v.status === VisitStatus.CONFIRMED && v.scheduledStart && v.scheduledEnd);
    return visits.map((v) => {
      let conflictsWith: string[] = [];
      if (v.status === VisitStatus.CONFIRMED && v.scheduledStart && v.scheduledEnd) {
        conflictsWith = confirmed
          .filter(
            (o) =>
              o.id !== v.id &&
              o.technicianId === v.technicianId &&
              o.scheduledStart! < v.scheduledEnd! &&
              o.scheduledEnd! > v.scheduledStart!,
          )
          .map((o) => o.ticket.number);
      }
      return { ...v, conflictsWith };
    });
  }

  async propose(user: AuthenticatedUser, ticketId: string, dto: ProposeVisitDto) {
    await this.assertEnabled();
    const ticket = await this.getTicketForUser(user, ticketId);
    if (!STAFF_ROLES.has(user.role)) {
      throw new ForbiddenException('Предлагать время визита может только сотрудник техподдержки');
    }

    const wh = await this.workingHours.get();
    const slots = this.parseSlots(dto.slots, wh);

    // Исполнитель заявки, если он есть; иначе — сам предлагающий сисадмин.
    const technicianId = ticket.assignedToId ?? user.id;

    const visit = await this.prisma.ticketVisit.create({
      data: {
        ticketId,
        technicianId,
        createdById: user.id,
        note: dto.note ?? null,
        status: VisitStatus.PROPOSED,
        slots: { create: slots },
      },
      include: VISIT_INCLUDE,
    });

    this.eventEmitter.emit(VISIT_EVENTS.PROPOSED, { visitId: visit.id, actorId: user.id } as VisitProposedEvent);
    return visit;
  }

  async confirm(user: AuthenticatedUser, visitId: string, dto: ConfirmVisitDto) {
    await this.assertEnabled();
    const visit = await this.prisma.ticketVisit.findUnique({
      where: { id: visitId },
      include: { slots: true, ticket: { select: { createdById: true, assignedToId: true } } },
    });
    if (!visit) throw new NotFoundException('Визит не найден');

    const isRequester = visit.ticket.createdById === user.id;
    const isTech = visit.technicianId === user.id || visit.ticket.assignedToId === user.id;
    const isAdmin = user.role === UserRole.ADMIN;

    // Обычный визит подтверждает заявитель; встречное предложение заявителя — подтверждает сотрудник.
    if (visit.counterProposed) {
      if (!(isTech || isAdmin)) throw new ForbiddenException('Встречное окно подтверждает системный администратор');
    } else if (!isRequester) {
      throw new ForbiddenException('Выбрать время визита может только заявитель');
    }

    if (visit.status !== VisitStatus.PROPOSED) {
      throw new BadRequestException('Этот визит уже согласован или отменён');
    }
    const slot = visit.slots.find((s) => s.id === dto.slotId);
    if (!slot) throw new BadRequestException('Выбранное окно не относится к этому визиту');

    const conflicts = await this.findTechnicianConflicts(visit.technicianId, slot.start, slot.end, visit.id);
    if (conflicts.length > 0) {
      throw new BadRequestException(`Время занято: ${conflicts[0].label}`);
    }

    const confirmedByTechnician = visit.counterProposed;
    const updated = await this.prisma.ticketVisit.update({
      where: { id: visitId },
      data: {
        status: VisitStatus.CONFIRMED,
        scheduledStart: slot.start,
        scheduledEnd: slot.end,
        counterProposed: false,
        reminderSentAt: null,
        presenceReminderSentAt: null,
      },
      include: VISIT_INCLUDE,
    });

    await this.history.record({
      ticketId: visit.ticketId,
      actorId: user.id,
      action: HistoryAction.VISIT_SCHEDULED,
      toValue: `${slot.start.toLocaleString('ru-RU')} — ${slot.end.toLocaleString('ru-RU')}`,
    });

    this.eventEmitter.emit(VISIT_EVENTS.CONFIRMED, { visitId, actorId: user.id, confirmedByTechnician } as VisitConfirmedEvent);
    return updated;
  }

  /** Заявитель предлагает своё время — окна затем подтверждает сотрудник (см. план). */
  async counter(user: AuthenticatedUser, visitId: string, dto: ProposeVisitDto) {
    await this.assertEnabled();
    const visit = await this.prisma.ticketVisit.findUnique({
      where: { id: visitId },
      include: { ticket: { select: { createdById: true } } },
    });
    if (!visit) throw new NotFoundException('Визит не найден');
    if (visit.ticket.createdById !== user.id) {
      throw new ForbiddenException('Предложить своё время может только заявитель');
    }
    if (visit.status !== VisitStatus.PROPOSED) {
      throw new BadRequestException('Этот визит уже согласован или отменён');
    }

    const wh = await this.workingHours.get();
    const slots = this.parseSlots(dto.slots, wh);

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.visitSlot.deleteMany({ where: { visitId } });
      return tx.ticketVisit.update({
        where: { id: visitId },
        data: {
          counterProposed: true,
          note: dto.note ?? visit.note,
          slots: { create: slots },
        },
        include: VISIT_INCLUDE,
      });
    });

    this.eventEmitter.emit(VISIT_EVENTS.COUNTERED, { visitId, actorId: user.id } as VisitCounteredEvent);
    return updated;
  }

  /** Перенос подтверждённого визита на другое время — перетаскивание в календаре (см. план). */
  async reschedule(user: AuthenticatedUser, visitId: string, dto: RescheduleVisitDto) {
    await this.assertEnabled();
    const visit = await this.prisma.ticketVisit.findUnique({
      where: { id: visitId },
      include: { ticket: { select: { assignedToId: true } } },
    });
    if (!visit) throw new NotFoundException('Визит не найден');

    const isTech = visit.technicianId === user.id || visit.ticket.assignedToId === user.id;
    const isAdmin = user.role === UserRole.ADMIN;
    if (!(isTech || isAdmin)) throw new ForbiddenException('Переносить визит может только исполнитель');
    if (visit.status !== VisitStatus.CONFIRMED) {
      throw new BadRequestException('Переносить можно только подтверждённый визит');
    }

    const start = new Date(dto.start);
    const end = new Date(dto.end);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
      throw new BadRequestException('Некорректный интервал переноса');
    }
    if (start.getTime() < Date.now()) throw new BadRequestException('Нельзя перенести визит в прошлое');

    const wh = await this.workingHours.get();
    const whProblem = checkSlotWithinWorkingHours(start, end, wh);
    if (whProblem) throw new BadRequestException(whProblem);

    const conflicts = await this.findTechnicianConflicts(visit.technicianId, start, end, visit.id);
    if (conflicts.length > 0) {
      throw new BadRequestException(`Время занято: ${conflicts[0].label}`);
    }

    const shiftMs = Math.abs(start.getTime() - (visit.scheduledStart?.getTime() ?? start.getTime()));
    const backToProposed = shiftMs > SMALL_SHIFT_MS;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (backToProposed) {
        await tx.visitSlot.deleteMany({ where: { visitId } });
        return tx.ticketVisit.update({
          where: { id: visitId },
          data: {
            status: VisitStatus.PROPOSED,
            scheduledStart: null,
            scheduledEnd: null,
            counterProposed: false,
            reminderSentAt: null,
            presenceReminderSentAt: null,
            slots: { create: [{ start, end }] },
          },
          include: VISIT_INCLUDE,
        });
      }
      return tx.ticketVisit.update({
        where: { id: visitId },
        data: { scheduledStart: start, scheduledEnd: end, reminderSentAt: null, presenceReminderSentAt: null },
        include: VISIT_INCLUDE,
      });
    });

    await this.history.record({
      ticketId: visit.ticketId,
      actorId: user.id,
      action: HistoryAction.VISIT_RESCHEDULED,
      fromValue: visit.scheduledStart?.toLocaleString('ru-RU'),
      toValue: `${start.toLocaleString('ru-RU')} — ${end.toLocaleString('ru-RU')}`,
    });

    this.eventEmitter.emit(VISIT_EVENTS.RESCHEDULED, { visitId, actorId: user.id, backToProposed } as VisitRescheduledEvent);
    return updated;
  }

  async setStatus(user: AuthenticatedUser, visitId: string, status: 'DONE' | 'CANCELLED') {
    await this.assertEnabled();
    const visit = await this.prisma.ticketVisit.findUnique({
      where: { id: visitId },
      include: { ticket: { select: { createdById: true, assignedToId: true } } },
    });
    if (!visit) throw new NotFoundException('Визит не найден');

    const isRequester = visit.ticket.createdById === user.id;
    const isTech = visit.technicianId === user.id || visit.ticket.assignedToId === user.id;
    const isAdmin = user.role === UserRole.ADMIN;

    if (status === 'DONE' && !(isTech || isAdmin)) {
      throw new ForbiddenException('Отметить визит состоявшимся может только исполнитель');
    }
    if (status === 'CANCELLED' && !(isRequester || isTech || isAdmin)) {
      throw new ForbiddenException('Нет прав отменить этот визит');
    }
    if (visit.status === VisitStatus.DONE || visit.status === VisitStatus.CANCELLED) {
      throw new BadRequestException('Визит уже завершён или отменён');
    }

    const updated = await this.prisma.ticketVisit.update({
      where: { id: visitId },
      data: { status: status as VisitStatus },
      include: VISIT_INCLUDE,
    });

    if (status === 'DONE') {
      await this.history.record({
        ticketId: visit.ticketId,
        actorId: user.id,
        action: HistoryAction.VISIT_COMPLETED,
      });
    }

    if (status === 'CANCELLED') {
      this.eventEmitter.emit(VISIT_EVENTS.CANCELLED, {
        visitId,
        actorId: user.id,
        cancelledByTechnician: !isRequester,
      } as VisitCancelledEvent);
    }
    return updated;
  }
}
