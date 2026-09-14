import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { DeliveryStatus, NotificationChannel, type Notification, type User } from '../../../generated/prisma/index.js';
import type { NotificationChannelProvider } from './notification-channel.interface.js';
import { NotificationsGateway } from '../notifications.gateway.js';

/** Канал "внутри системы": пишет запись доставки и толкает уведомление через WebSocket. */
@Injectable()
export class InAppChannelProvider implements NotificationChannelProvider {
  readonly channel = NotificationChannel.IN_APP;
  readonly interruptive = false; // pull-канал — виден в колокольчике всегда, тихие часы его не касаются

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: NotificationsGateway,
  ) {}

  isEnabledFor(): boolean {
    return true; // всегда включён — это базовый канал
  }

  async send(notification: Notification, user: User): Promise<void> {
    await this.prisma.notificationDelivery.create({
      data: { notificationId: notification.id, channel: this.channel, status: DeliveryStatus.SENT, sentAt: new Date() },
    });
    this.gateway.pushToUser(user.id, notification);
  }
}
