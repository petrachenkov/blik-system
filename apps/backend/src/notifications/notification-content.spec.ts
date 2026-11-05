import { describe, expect, it, vi } from 'vitest';
import { NotificationsService } from './notifications.service.js';
import { NotificationType } from '../../generated/prisma/index.js';

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
});
