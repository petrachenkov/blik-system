import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { isWithinQuietHours } from '../common/utils/quiet-hours.js';
import { NOTIFICATION_CHANNELS, type NotificationChannelProvider } from './channels/notification-channel.interface.js';

/**
 * Раз в 15 минут проверяет, закончились ли "тихие часы" (настройка — /admin/quiet-hours,
 * см. план), и если да — досылает всё, что за это время скопилось в очереди
 * PendingChannelDelivery (см. NotificationsService.notifyUsers — туда попадают уведомления
 * для "прерывающих" каналов, отложенные на время окна).
 */
@Injectable()
export class QuietHoursDeliveryCron {
  private readonly logger = new Logger(QuietHoursDeliveryCron.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(NOTIFICATION_CHANNELS) private readonly channels: NotificationChannelProvider[],
  ) {}

  @Cron('0 */15 * * * *')
  async flushPending() {
    const settings = await this.prisma.notificationSettings.findUnique({ where: { id: 'current' } });
    if (isWithinQuietHours(new Date(), settings?.quietHoursStart ?? undefined, settings?.quietHoursEnd ?? undefined)) {
      return; // ещё не закончились — ждём следующего тика
    }

    const pending = await this.prisma.pendingChannelDelivery.findMany({
      include: { notification: { include: { user: true } } },
    });
    if (pending.length === 0) return;

    for (const item of pending) {
      const provider = this.channels.find((c) => c.channel === item.channel);
      if (provider) {
        await provider.send(item.notification, item.notification.user).catch((error) =>
          this.logger.error(`Не удалось досослать отложенное уведомление ${item.notificationId}`, error instanceof Error ? error.stack : error),
        );
      }
      await this.prisma.pendingChannelDelivery.delete({ where: { id: item.id } });
    }

    this.logger.log(`Досослано отложенных уведомлений после тихих часов: ${pending.length}`);
  }
}
