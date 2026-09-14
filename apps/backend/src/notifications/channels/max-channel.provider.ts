import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { DeliveryStatus, NotificationChannel, type Notification, type User } from '../../../generated/prisma/index.js';
import type { NotificationChannelProvider } from './notification-channel.interface.js';

/**
 * Заготовка канала для будущего бота в мессенджере Max (см. план — "Интеграция с Max").
 * Реальная отправка (вызов Max Bot API) сознательно не реализована сейчас — это отдельная
 * задача позже. Канал включается только для пользователей с привязанным MaxLink, но даже
 * тогда просто пишет "не реализовано" в NotificationDelivery, ничего никуда не отправляя.
 */
@Injectable()
export class MaxChannelProvider implements NotificationChannelProvider {
  readonly channel = NotificationChannel.MAX;
  readonly interruptive = true;
  private readonly logger = new Logger(MaxChannelProvider.name);

  constructor(private readonly prisma: PrismaService) {}

  async isEnabledFor(user: User): Promise<boolean> {
    const link = await this.prisma.maxLink.findUnique({ where: { userId: user.id } });
    return link !== null;
  }

  async send(notification: Notification, user: User): Promise<void> {
    this.logger.debug(`Канал Max ещё не реализован (пользователь ${user.username}), пропуск отправки`);
    await this.prisma.notificationDelivery.create({
      data: {
        notificationId: notification.id,
        channel: this.channel,
        status: DeliveryStatus.FAILED,
        error: 'Интеграция с Max ещё не реализована',
      },
    });
  }
}
