import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service.js';
import { CARTRIDGE_EVENTS, type RefillEventCreatedEvent } from '../notifications/events/cartridge-events.js';
import type { AuthenticatedUser } from '../common/types/authenticated-user.js';
import type { CreateRefillEventDto } from './dto/create-refill-event.dto.js';
import type { UpdateRefillEventDto } from './dto/update-refill-event.dto.js';

const REFILL_EVENT_INCLUDE = {
  createdBy: { select: { id: true, fullName: true, username: true } },
} as const;

@Injectable()
export class RefillEventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  findAll() {
    return this.prisma.refillEvent.findMany({
      include: REFILL_EVENT_INCLUDE,
      orderBy: { scheduledAt: 'asc' },
    });
  }

  async findOneOrThrow(id: string) {
    const event = await this.prisma.refillEvent.findUnique({ where: { id }, include: REFILL_EVENT_INCLUDE });
    if (!event) throw new NotFoundException('Плановая заправка не найдена');
    return event;
  }

  async create(user: AuthenticatedUser, dto: CreateRefillEventDto) {
    const event = await this.prisma.refillEvent.create({
      data: {
        scheduledAt: new Date(dto.scheduledAt),
        submissionDeadline: new Date(dto.submissionDeadline),
        note: dto.note,
        createdById: user.id,
      },
      include: REFILL_EVENT_INCLUDE,
    });

    const domainEvent: RefillEventCreatedEvent = { refillEventId: event.id, actorId: user.id };
    this.eventEmitter.emit(CARTRIDGE_EVENTS.REFILL_EVENT_CREATED, domainEvent);

    return event;
  }

  async update(id: string, dto: UpdateRefillEventDto) {
    await this.findOneOrThrow(id);

    return this.prisma.refillEvent.update({
      where: { id },
      data: {
        ...(dto.scheduledAt !== undefined ? { scheduledAt: new Date(dto.scheduledAt) } : {}),
        ...(dto.submissionDeadline !== undefined ? { submissionDeadline: new Date(dto.submissionDeadline) } : {}),
        ...(dto.note !== undefined ? { note: dto.note } : {}),
        ...(dto.isCancelled !== undefined ? { isCancelled: dto.isCancelled } : {}),
      },
      include: REFILL_EVENT_INCLUDE,
    });
  }
}
