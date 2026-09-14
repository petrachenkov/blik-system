import { describe, expect, it, vi } from 'vitest';
import { VisitsService } from './visits.service.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { TicketPolicy } from '../policies/ticket-policy.js';
import type { TicketHistoryService } from '../history/ticket-history.service.js';
import type { FeatureFlagsService } from '../../system/feature-flags.service.js';
import type { WorkingHoursService } from '../../system/working-hours.service.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';

const ALWAYS_OPEN = {
  workdayStart: '00:00',
  workdayEnd: '23:59',
  workingDays: [1, 2, 3, 4, 5, 6, 7],
  holidays: [] as string[],
};

const admin: AuthenticatedUser = { id: 'tech', username: 'a', role: 'ADMIN' as never, isStaff: true, isMaster: false };
const requester: AuthenticatedUser = { id: 'req', username: 'r', role: 'USER' as never, isStaff: false, isMaster: false };

function build(overrides: {
  visit?: Record<string, unknown>;
  conflicts?: { ticket: { number: string } }[];
  taskConflicts?: { title: string }[];
}) {
  const emit = vi.fn();
  const record = vi.fn().mockResolvedValue(undefined);
  const update = vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'v1', ...data }));
  const prisma = {
    ticketVisit: {
      findUnique: vi.fn().mockResolvedValue(overrides.visit ?? null),
      findMany: vi.fn().mockResolvedValue(overrides.conflicts ?? []),
      update,
    },
    calendarTask: { findMany: vi.fn().mockResolvedValue(overrides.taskConflicts ?? []) },
    visitSlot: { deleteMany: vi.fn().mockResolvedValue(undefined) },
    $transaction: vi.fn().mockImplementation((cb) =>
      cb({
        ticketVisit: { update },
        visitSlot: { deleteMany: vi.fn().mockResolvedValue(undefined) },
      }),
    ),
  } as unknown as PrismaService;

  const service = new VisitsService(
    prisma,
    { canView: () => true } as unknown as TicketPolicy,
    { record } as unknown as TicketHistoryService,
    { emit } as never,
    { isEnabled: vi.fn().mockResolvedValue(true) } as unknown as FeatureFlagsService,
    { get: vi.fn().mockResolvedValue(ALWAYS_OPEN) } as unknown as WorkingHoursService,
  );
  return { service, emit, record, update };
}

const isoOn = (day: number, hour: number) => new Date(2026, 8, day, hour, 0).toISOString();

describe('VisitsService.reschedule', () => {
  const base = {
    id: 'v1',
    status: 'CONFIRMED',
    technicianId: 'tech',
    scheduledStart: new Date(2026, 8, 14, 10, 0),
    scheduledEnd: new Date(2026, 8, 14, 11, 0),
    ticketId: 't1',
    ticket: { assignedToId: 'tech' },
  };

  it('малый сдвиг (≤1 ч) — визит остаётся CONFIRMED', async () => {
    const { service, emit } = build({ visit: base });
    const start = new Date(2026, 8, 14, 10, 30).toISOString(); // +30 мин от 10:00
    await service.reschedule(admin, 'v1', { start, end: isoOn(14, 12) });
    expect(emit).toHaveBeenCalledWith('visit.rescheduled', expect.objectContaining({ backToProposed: false }));
  });

  it('большой сдвиг (>1 ч) — визит уходит на переподтверждение', async () => {
    const { service, emit } = build({ visit: base });
    await service.reschedule(admin, 'v1', { start: isoOn(16, 15), end: isoOn(16, 16) });
    expect(emit).toHaveBeenCalledWith('visit.rescheduled', expect.objectContaining({ backToProposed: true }));
  });

  it('блокирует перенос при конфликте с другим визитом', async () => {
    const { service } = build({ visit: base, conflicts: [{ ticket: { number: 'BLIK-000042' } }] });
    await expect(service.reschedule(admin, 'v1', { start: isoOn(14, 12), end: isoOn(14, 13) })).rejects.toThrow(/BLIK-000042/);
  });

  it('блокирует перенос при конфликте с задачей в календаре', async () => {
    const { service } = build({ visit: base, taskConflicts: [{ title: 'Настройка сервера' }] });
    await expect(service.reschedule(admin, 'v1', { start: isoOn(14, 12), end: isoOn(14, 13) })).rejects.toThrow(/Настройка сервера/);
  });

  it('нельзя переносить неподтверждённый визит', async () => {
    const { service } = build({ visit: { ...base, status: 'PROPOSED' } });
    await expect(service.reschedule(admin, 'v1', { start: isoOn(14, 12), end: isoOn(14, 13) })).rejects.toThrow(/подтверждённый/);
  });
});

describe('VisitsService.counter', () => {
  const proposed = { id: 'v1', status: 'PROPOSED', note: null, ticketId: 't1', ticket: { createdById: 'req' } };

  it('только заявитель может предложить своё время', async () => {
    const { service } = build({ visit: proposed });
    await expect(service.counter(admin, 'v1', { slots: [{ start: isoOn(14, 10), end: isoOn(14, 11) }] })).rejects.toThrow(/заявитель/);
  });

  it('заявитель предлагает окна → counterProposed, событие COUNTERED', async () => {
    const { service, emit } = build({ visit: proposed });
    await service.counter(requester, 'v1', { slots: [{ start: isoOn(14, 10), end: isoOn(14, 11) }] });
    expect(emit).toHaveBeenCalledWith('visit.countered', expect.objectContaining({ visitId: 'v1' }));
  });

  it('нельзя предложить встречное к уже согласованному визиту', async () => {
    const { service } = build({ visit: { ...proposed, status: 'CONFIRMED' } });
    await expect(service.counter(requester, 'v1', { slots: [{ start: isoOn(14, 10), end: isoOn(14, 11) }] })).rejects.toThrow(/согласован/);
  });
});

describe('VisitsService.confirm — встречное предложение', () => {
  it('окно встречного предложения подтверждает сотрудник, а не заявитель', async () => {
    const visit = {
      id: 'v1',
      status: 'PROPOSED',
      counterProposed: true,
      technicianId: 'tech',
      ticketId: 't1',
      slots: [{ id: 's1', start: new Date(2026, 8, 14, 10), end: new Date(2026, 8, 14, 11) }],
      ticket: { createdById: 'req', assignedToId: 'tech' },
    };
    const { service, emit } = build({ visit });
    await service.confirm(admin, 'v1', { slotId: 's1' });
    expect(emit).toHaveBeenCalledWith('visit.confirmed', expect.objectContaining({ confirmedByTechnician: true }));
  });

  it('заявитель не может подтвердить собственное встречное предложение', async () => {
    const visit = {
      id: 'v1',
      status: 'PROPOSED',
      counterProposed: true,
      technicianId: 'tech',
      ticketId: 't1',
      slots: [{ id: 's1', start: new Date(), end: new Date() }],
      ticket: { createdById: 'req', assignedToId: 'tech' },
    };
    const { service } = build({ visit });
    await expect(service.confirm(requester, 'v1', { slotId: 's1' })).rejects.toThrow(/системный администратор/i);
  });
});
