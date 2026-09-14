import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import webpush from 'web-push';
import { PrismaService } from '../../prisma/prisma.service.js';
import { DeliveryStatus, NotificationChannel, type Notification, type User } from '../../../generated/prisma/index.js';
import type { NotificationChannelProvider } from './notification-channel.interface.js';
import type { Env } from '../../config/env.schema.js';
import { FeatureFlagsService } from '../../system/feature-flags.service.js';
import { FEATURE_FLAGS } from '../../system/feature-flags.js';

/**
 * Канал Web Push API браузера (см. план "Push-уведомления браузера"). Молча неактивен, если
 * VAPID-ключи не заданы в .env (isEnabledFor всегда false — подписок не будет, т.к. фронт не
 * сможет вызвать pushManager.subscribe без публичного ключа).
 */
@Injectable()
export class WebPushChannelProvider implements NotificationChannelProvider {
  readonly channel = NotificationChannel.WEB_PUSH;
  readonly interruptive = true;
  private readonly logger = new Logger(WebPushChannelProvider.name);
  private readonly vapidConfigured: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly flags: FeatureFlagsService,
  ) {
    const publicKey = this.config.get('VAPID_PUBLIC_KEY', { infer: true });
    const privateKey = this.config.get('VAPID_PRIVATE_KEY', { infer: true });
    this.vapidConfigured = Boolean(publicKey && privateKey);
    if (this.vapidConfigured) {
      webpush.setVapidDetails(this.config.get('VAPID_SUBJECT', { infer: true }), publicKey!, privateKey!);
    }
  }

  /** Для страницы здоровья системы (см. план) — заданы ли VAPID-ключи в .env. */
  get isVapidConfigured(): boolean {
    return this.vapidConfigured;
  }

  async isEnabledFor(user: User): Promise<boolean> {
    if (!this.vapidConfigured) return false;
    if (!(await this.flags.isEnabled(FEATURE_FLAGS.WEB_PUSH))) return false;
    const count = await this.prisma.webPushSubscription.count({ where: { userId: user.id } });
    return count > 0;
  }

  async send(notification: Notification, user: User): Promise<void> {
    const subscriptions = await this.prisma.webPushSubscription.findMany({ where: { userId: user.id } });
    const payload = JSON.stringify({ title: notification.title, body: notification.body, ticketId: notification.ticketId });

    let sentToAny = false;
    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
        sentToAny = true;
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          // Подписка протухла (пользователь отписался/сбросил разрешение в браузере) — чистим.
          await this.prisma.webPushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
        } else {
          this.logger.error(`Ошибка отправки Web Push пользователю ${user.username}`, error instanceof Error ? error.stack : error);
        }
      }
    }

    await this.prisma.notificationDelivery.create({
      data: {
        notificationId: notification.id,
        channel: this.channel,
        status: sentToAny ? DeliveryStatus.SENT : DeliveryStatus.FAILED,
        sentAt: sentToAny ? new Date() : undefined,
        error: sentToAny ? undefined : 'Нет активных подписок или все истекли',
      },
    });
  }
}
