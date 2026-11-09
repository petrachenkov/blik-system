import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { isWithinQuietHours } from '../common/utils/quiet-hours.js';
import { NOTIFICATION_CHANNELS, type NotificationChannelProvider } from './channels/notification-channel.interface.js';

/**
 * Доставляет рассылки и уведомления из очереди. В тихие часы обрабатывает
 * только внутренние уведомления.
 */
@Injectable()
export class QuietHoursDeliveryCron {
  private readonly logger = new Logger(QuietHoursDeliveryCron.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(NOTIFICATION_CHANNELS) private readonly channels: NotificationChannelProvider[],
  ) {}

  @Cron('*/15 * * * * *', { waitForCompletion: true })
  async flushPending() {
    const settings = await this.prisma.notificationSettings.findUnique({ where: { id: 'current' } });
    const quiet = isWithinQuietHours(new Date(), settings?.quietHoursStart ?? undefined, settings?.quietHoursEnd ?? undefined);
    const providers = quiet ? this.channels.filter((channel) => !channel.interruptive) : this.channels;

    const pending = await this.prisma.pendingChannelDelivery.findMany({
      where: { channel: { in: providers.map((provider) => provider.channel) } },
      include: { notification: { include: { user: true } } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 30,
    });
    for (let i = 0; i < pending.length; i += 5) {
      await Promise.all(pending.slice(i, i + 5).map(async (item) => {
        const provider = providers.find((channel) => channel.channel === item.channel);
        const { user } = item.notification;
        try {
          if (provider && user.isActive && await provider.isEnabledFor(user)) {
            await provider.send(item.notification, user);
          }
          await this.prisma.pendingChannelDelivery.deleteMany({ where: { id: item.id } });
        } catch (error) {
          this.logger.error(`Не удалось доставить уведомление ${item.notificationId}`, error instanceof Error ? error.stack : error);
        }
      }));
    }
  }
}
