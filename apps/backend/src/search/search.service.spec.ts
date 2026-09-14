import { describe, expect, it, vi } from 'vitest';
import { SearchService } from './search.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { TicketPolicy } from '../tickets/policies/ticket-policy.js';
import type { AuthenticatedUser } from '../common/types/authenticated-user.js';

function build() {
  const ticketFind = vi.fn().mockResolvedValue([]);
  const userFind = vi.fn().mockResolvedValue([]);
  const locationFind = vi.fn().mockResolvedValue([]);
  const prisma = {
    ticket: { findMany: ticketFind },
    knowledgeArticle: { findMany: vi.fn().mockResolvedValue([]) },
    user: { findMany: userFind },
    location: { findMany: locationFind },
  } as unknown as PrismaService;
  const service = new SearchService(prisma, new TicketPolicy());
  return { service, ticketFind, userFind, locationFind };
}

const staff = (role: 'ADMIN' | 'INTERN'): AuthenticatedUser => ({ id: 'u1', username: 'u', role: role as never, isStaff: true, isMaster: false });
const teacher: AuthenticatedUser = { id: 't1', username: 't', role: 'USER' as never, isStaff: false, isMaster: false };

describe('SearchService.search', () => {
  it('преподаватель не получает поиск по сотрудникам и кабинетам', async () => {
    const { service, userFind, locationFind } = build();
    const res = await service.search(teacher, 'иванов');
    expect(res.users).toEqual([]);
    expect(res.locations).toEqual([]);
    expect(userFind).not.toHaveBeenCalled();
    expect(locationFind).not.toHaveBeenCalled();
  });

  it('преподаватель видит только свои заявки (visibility в where)', async () => {
    const { service, ticketFind } = build();
    await service.search(teacher, 'BLIK');
    const where = ticketFind.mock.calls[0][0].where;
    expect(where.archivedAt).toBeNull();
    expect(where.AND[0]).toEqual({ createdById: 't1' });
  });

  it('INTERN — заявки назначенные или где соисполнитель', async () => {
    const { service, ticketFind } = build();
    await service.search(staff('INTERN'), 'BLIK');
    const where = ticketFind.mock.calls[0][0].where;
    expect(where.AND[0]).toEqual({ OR: [{ assignedToId: 'u1' }, { collaborators: { some: { userId: 'u1' } } }] });
  });

  it('сотрудник получает поиск по сотрудникам и кабинетам', async () => {
    const { service, userFind, locationFind } = build();
    await service.search(staff('ADMIN'), 'корпус');
    expect(userFind).toHaveBeenCalled();
    expect(locationFind).toHaveBeenCalled();
  });
});
