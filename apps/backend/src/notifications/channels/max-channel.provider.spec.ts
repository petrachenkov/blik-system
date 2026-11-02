import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { DeliveryStatus, type Notification, type User } from '../../../generated/prisma/index.js';
import { MaxChannelProvider } from './max-channel.provider.js';

describe('MaxChannelProvider', () => {
  const user = { id: 'user-1', isActive: true } as User;
  const notification = { id: 'notice-1', title: 'Новая заявка', body: 'Назначен исполнитель' } as Notification;
  const link = { externalUserId: '12345', externalChatId: '-999' };
  const prisma = {
    maxLink: { findUnique: vi.fn() },
    notificationDelivery: { create: vi.fn() },
  };
  const config = { get: vi.fn() };
  const fetchMock = vi.fn();
  const provider = new MaxChannelProvider(prisma as unknown as PrismaService, config as unknown as ConfigService<Env, true>);

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    config.get.mockReturnValue('secret-token');
    prisma.maxLink.findUnique.mockResolvedValue(link);
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('отправляет в личный диалог по user_id, даже если приложение открыто из группы', async () => {
    await provider.send(notification, user);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url.toString()).toBe('https://platform-api2.max.ru/messages?user_id=12345');
    expect(options.headers.Authorization).toBe('secret-token');
    expect(JSON.parse(options.body)).toEqual({ text: 'Новая заявка\n\nНазначен исполнитель' });
    expect(prisma.notificationDelivery.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      status: DeliveryStatus.SENT, sentAt: expect.any(Date),
    }) });
  });

  it('выключен без токена или привязки', async () => {
    config.get.mockReturnValue('');
    expect(await provider.isEnabledFor(user)).toBe(false);
    config.get.mockReturnValue('secret-token');
    prisma.maxLink.findUnique.mockResolvedValue(null);
    expect(await provider.isEnabledFor(user)).toBe(false);
  });

  it('не отправляет отложенное уведомление после отвязки', async () => {
    prisma.maxLink.findUnique.mockResolvedValue(null);
    await provider.send(notification, user);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(prisma.notificationDelivery.create).toHaveBeenCalledWith({ data: expect.objectContaining({ status: DeliveryStatus.FAILED }) });
  });

  it('фиксирует отказ API без токена и тела ответа в ошибке', async () => {
    fetchMock.mockResolvedValue(new Response('secret-token', { status: 403 }));
    await provider.send(notification, user);
    expect(prisma.notificationDelivery.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      status: DeliveryStatus.FAILED, error: 'MAX API: HTTP 403', sentAt: undefined,
    }) });
  });

  it('фиксирует сетевой сбой', async () => {
    fetchMock.mockRejectedValue(new Error('secret-token'));
    await provider.send(notification, user);
    expect(prisma.notificationDelivery.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      status: DeliveryStatus.FAILED, error: expect.stringContaining('сеть, TLS или тайм-аут'),
    }) });
  });

  it('ограничивает текст лимитом MAX, сохраняя Unicode', async () => {
    await provider.send({ ...notification, body: '😀'.repeat(5000) }, user);
    const text = JSON.parse(fetchMock.mock.calls[0][1].body).text;
    expect(Array.from(text)).toHaveLength(4000);
    expect(text.endsWith('😀')).toBe(true);
  });
});
