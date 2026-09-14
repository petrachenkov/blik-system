import { describe, expect, it, vi } from 'vitest';
import { CalendarTasksService } from './calendar-tasks.service.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { TicketPolicy } from '../policies/ticket-policy.js';
import type { FeatureFlagsService } from '../../system/feature-flags.service.js';
import type { WorkingHoursService } from '../../system/working-hours.service.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';

const ALWAYS_OPEN = {
  workdayStart: '00:00',
  workdayEnd: '23:59',
  workingDays: [1, 2, 3, 4, 5, 6, 7],
  holidays: [] as string[],
};
const OFFICE_HOURS = { workdayStart: '09:00', workdayEnd: '18:00', workingDays: [1, 2, 3, 4, 5], holidays: [] as string[] };

const admin: AuthenticatedUser = { id: 'a1', username: 'a', role: 'ADMIN' as never, isStaff: true, isMaster: false };
const intern: AuthenticatedUser = { id: 'i1', username: 'i', role: 'INTERN' as never, isStaff: true, isMaster: false };

function build(opts: { hours?: typeof ALWAYS_OPEN; task?: Record<string, unknown>; targetUser?: Record<string, unknown> } = {}) {
  const create = vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 't1', ...data }));
  const update = vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 't1', ...data }));
  const del = vi.fn().mockResolvedValue(undefined);
  const prisma = {
    calendarTask: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(opts.task ?? null),
      create,
      update,
      delete: del,
    },
    user: { findUnique: vi.fn().mockResolvedValue(opts.targetUser ?? null) },
    ticket: { findUnique: vi.fn().mockResolvedValue({ id: 'tk1', createdById: 'x', assignedToId: 'a1', status: 'IN_PROGRESS' }) },
  } as unknown as PrismaService;

  const service = new CalendarTasksService(
    prisma,
    { canView: () => true } as unknown as TicketPolicy,
    { isEnabled: vi.fn().mockResolvedValue(true) } as unknown as FeatureFlagsService,
    { get: vi.fn().mockResolvedValue(opts.hours ?? ALWAYS_OPEN) } as unknown as WorkingHoursService,
  );
  return { service, create, update, del };
}

const iso = (d: number, h: number, min = 0) => new Date(2026, 8, d, h, min).toISOString();

describe('CalendarTasksService.create', () => {
  it('создаёт отдельную задачу в рабочее время', async () => {
    const { service, create } = build();
    const r = await service.create(admin, { title: 'Обход', start: iso(14, 10), end: iso(14, 11) });
    expect(create).toHaveBeenCalled();
    expect(r.ownerId).toBe('a1');
  });

  it('отклоняет задачу вне рабочих часов', async () => {
    const { service } = build({ hours: OFFICE_HOURS });
    await expect(service.create(admin, { title: 'Ночь', start: iso(14, 22), end: iso(14, 23) })).rejects.toThrow(/рабоч/i);
  });

  it('отклоняет задачу в выходной', async () => {
    const { service } = build({ hours: OFFICE_HOURS });
    // 2026-09-13 — воскресенье
    await expect(service.create(admin, { title: 'Вс', start: iso(13, 10), end: iso(13, 11) })).rejects.toThrow(/нерабочий/i);
  });

  it('ADMIN может назначить задачу другому сотруднику', async () => {
    const { service, create } = build({ targetUser: { id: 'i1', isActive: true, role: 'INTERN' } });
    const r = await service.create(admin, { title: 'X', start: iso(14, 10), end: iso(14, 11), ownerId: 'i1' });
    expect(r.ownerId).toBe('i1');
    expect(create).toHaveBeenCalled();
  });

  it('INTERN не может назначить задачу другому — 403', async () => {
    const { service } = build({ targetUser: { id: 'a1', isActive: true, role: 'ADMIN' } });
    await expect(
      service.create(intern, { title: 'X', start: iso(14, 10), end: iso(14, 11), ownerId: 'a1' }),
    ).rejects.toThrow(/системный администратор/i);
  });
});

describe('CalendarTasksService.update / remove', () => {
  const task = { id: 't1', ownerId: 'i1', createdById: 'i1', start: new Date(2026, 8, 14, 10), end: new Date(2026, 8, 14, 11) };

  it('чужую задачу нельзя менять', async () => {
    const { service } = build({ task: { ...task, ownerId: 'other', createdById: 'other' } });
    await expect(service.update(intern, 't1', { done: true })).rejects.toThrow(/прав/i);
  });

  it('владелец отмечает done', async () => {
    const { service, update } = build({ task });
    await service.update(intern, 't1', { done: true });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ done: true }) }));
  });

  it('ADMIN может удалить любую задачу', async () => {
    const { service, del } = build({ task });
    await service.remove(admin, 't1');
    expect(del).toHaveBeenCalled();
  });

  it('посторонний не может удалить задачу', async () => {
    const { service } = build({ task: { ...task, ownerId: 'other', createdById: 'other' } });
    await expect(service.remove(intern, 't1')).rejects.toThrow(/прав/i);
  });
});
