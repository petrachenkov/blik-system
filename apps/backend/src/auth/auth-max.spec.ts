import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service.js';
import { UserRole, UserSource } from '../../generated/prisma/index.js';

vi.mock('argon2', () => ({ verify: vi.fn().mockResolvedValue(true) }));

function initData() {
  const params = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id: 12345 }),
  };
  const entries = Object.entries(params).sort(([a], [b]) => a.localeCompare(b));
  const key = createHmac('sha256', 'WebAppData').update('bot-token').digest();
  const hash = createHmac('sha256', key).update(entries.map(([k, v]) => `${k}=${v}`).join('\n')).digest('hex');
  return new URLSearchParams([...entries, ['hash', hash]]).toString();
}

describe('AuthService MAX', () => {
  const user = { id: 'u1', username: 'ivanov', source: UserSource.LOCAL, passwordHash: 'hash', isActive: true, role: UserRole.USER };
  const prisma = {
    maxLink: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
    loginEvent: { create: vi.fn() },
    refreshToken: { create: vi.fn() },
  };
  const users = { findByUsername: vi.fn(), touchLastLogin: vi.fn() };
  const values: Record<string, string> = { MAX_BOT_TOKEN: 'bot-token', JWT_ACCESS_TTL: '15m', JWT_REFRESH_TTL: '14d' };
  const config = { get: (key: string) => values[key] };
  const jwt = { signAsync: vi.fn() };
  const flags = { getMaintenance: vi.fn() };
  const service = new AuthService(prisma as never, users as never, {} as never, jwt as never, config as never, flags as never);

  beforeEach(() => {
    vi.clearAllMocks();
    users.findByUsername.mockResolvedValue(user);
    prisma.maxLink.findUnique.mockResolvedValue(null);
    prisma.loginEvent.create.mockResolvedValue({});
    flags.getMaintenance.mockResolvedValue({ enabled: false });
    jwt.signAsync.mockResolvedValue('jwt');
  });

  it('привязывает проверенный MAX-аккаунт при первом входе с паролем, даже без chat', async () => {
    const result = await service.loginAndLinkMax(initData(), 'ivanov', 'password');
    expect(result.user.id).toBe('u1');
    expect(prisma.maxLink.upsert).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      update: { externalUserId: '12345', externalChatId: '' },
      create: { userId: 'u1', externalUserId: '12345', externalChatId: '' },
    });
  });

  it('входит по существующей привязке без проверки пароля', async () => {
    prisma.maxLink.findUnique.mockResolvedValue({ id: 'link1', externalChatId: '', user });
    const result = await service.loginViaMax(initData());
    expect(result.user.id).toBe('u1');
    expect(users.findByUsername).not.toHaveBeenCalled();
    expect(users.touchLastLogin).toHaveBeenCalledWith('u1');
  });

  it('не перепривязывает MAX другого пользователя', async () => {
    prisma.maxLink.findUnique.mockResolvedValue({ userId: 'someone-else' });
    await expect(service.loginAndLinkMax(initData(), 'ivanov', 'password')).rejects.toThrow('уже привязан');
    expect(prisma.maxLink.upsert).not.toHaveBeenCalled();
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });

  it('не проверяет пароль и не привязывает аккаунт при поддельной подписи', async () => {
    await expect(service.loginAndLinkMax(`${initData()}bad`, 'ivanov', 'password')).rejects.toThrow('Недействительные');
    expect(users.findByUsername).not.toHaveBeenCalled();
    expect(prisma.maxLink.upsert).not.toHaveBeenCalled();
  });
});
