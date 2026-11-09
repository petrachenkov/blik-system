import { describe, expect, it, vi } from 'vitest';
import { NotificationsService } from './notifications.service.js';
import { NotificationType, TicketStatus } from '../../generated/prisma/index.js';

describe('notification context', () => {
  it('includes room, assignee and issue and shortens legacy number', async () => {
    const create = vi.fn().mockResolvedValue({});
    const prisma = {
      ticket: { findUnique: vi.fn().mockResolvedValue({ description: 'Не работает проектор', status: 'IN_PROGRESS', location: { building: 'А', room: '204' }, assignedTo: { fullName: 'Иванов' } }) },
      user: { findUnique: vi.fn().mockResolvedValue({ id: 'u1', isActive: true }) },
      notificationSettings: { findUnique: vi.fn().mockResolvedValue(null) },
      notificationPreference: { findUnique: vi.fn().mockResolvedValue(null) },
      notification: { create },
    };
    const service = new NotificationsService(prisma as never, []);
    await service.notifyAbout({ userIds: ['u1'], ticketId: 't1', type: NotificationType.TICKET_ASSIGNED, title: 'Заявка BLIK-000042 назначена', body: 'Назначен исполнитель.' });
    const data = create.mock.calls[0][0].data;
    expect(data.title).toBe('Заявка Б-42 назначена');
    expect(data.body).toContain('Кабинет: А, 204');
    expect(data.body).toContain('Исполнитель: Иванов');
    expect(data.body).toContain('Проблема: Не работает проектор');
  });

  it('stores the event status for MAX delivery after quiet hours', async () => {
    const create = vi.fn().mockResolvedValue({});
    const ticket = {
      id: 't1',
      number: 'BLIK-000042',
      createdById: 'u1',
      collaborators: [],
      description: 'Проектор',
      status: TicketStatus.CLOSED,
      location: { building: 'А', room: '204' },
    };
    const service = new NotificationsService({
      ticket: { findUnique: vi.fn().mockResolvedValue(ticket) },
      user: { findUnique: vi.fn().mockResolvedValue({ id: 'u1', isActive: true }) },
      notificationSettings: { findUnique: vi.fn().mockResolvedValue(null) },
      notificationPreference: { findUnique: vi.fn().mockResolvedValue(null) },
      notification: { create },
    } as never, []);
    await service.onTicketStatusChanged({ ticketId: 't1', fromStatus: TicketStatus.IN_PROGRESS, toStatus: TicketStatus.RESOLVED });
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({
      type: NotificationType.TICKET_STATUS_CHANGED,
      payload: { ticketStatus: TicketStatus.RESOLVED },
      body: expect.stringContaining('Статус: Выполнена'),
    }) });
  });
});
