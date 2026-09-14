import { describe, expect, it, vi } from 'vitest';
import { UsersService } from './users.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { LdapService } from '../auth/ldap/ldap.service.js';

function fakePrisma(users: { id: string }[], workload: { assignedToId: string; _count: { _all: number } }[]): PrismaService {
  return {
    user: { findMany: vi.fn().mockResolvedValue(users) },
    ticket: { groupBy: vi.fn().mockResolvedValue(workload) },
  } as unknown as PrismaService;
}

describe('UsersService.findAll — статистика нагрузки (см. план)', () => {
  it('подмешивает openTicketsCount по данным groupBy', async () => {
    const prisma = fakePrisma(
      [{ id: 'u1' }, { id: 'u2' }],
      [{ assignedToId: 'u1', _count: { _all: 3 } }],
    );
    const service = new UsersService(prisma, {} as LdapService);

    const result = await service.findAll();

    expect(result.find((u) => u.id === 'u1')?.openTicketsCount).toBe(3);
    expect(result.find((u) => u.id === 'u2')?.openTicketsCount).toBe(0); // нет открытых заявок — 0, а не undefined
  });
});

describe('UsersService — локальные учётки', () => {
  it('createLocal отклоняет занятый логин', async () => {
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue({ id: 'x', username: 'taken' }) },
    } as unknown as PrismaService;
    const service = new UsersService(prisma, {} as LdapService);
    await expect(
      service.createLocal({ username: 'taken', fullName: 'X', password: 'password1', role: 'ADMIN' as never }),
    ).rejects.toThrow(/уже существует/);
  });

  it('remove запрещает удаление master-аккаунта', async () => {
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue({ id: 'm', isMaster: true }) },
    } as unknown as PrismaService;
    const service = new UsersService(prisma, {} as LdapService);
    await expect(service.remove('m', 'actor')).rejects.toThrow(/[Mm]aster/);
  });

  it('remove запрещает удаление самого себя', async () => {
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue({ id: 'me', isMaster: false }) },
    } as unknown as PrismaService;
    const service = new UsersService(prisma, {} as LdapService);
    await expect(service.remove('me', 'me')).rejects.toThrow(/собственн/);
  });
});
