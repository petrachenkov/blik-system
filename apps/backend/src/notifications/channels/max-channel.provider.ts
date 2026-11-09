import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { DeliveryStatus, NotificationChannel, type Notification, type User } from '../../../generated/prisma/index.js';
import type { NotificationChannelProvider } from './notification-channel.interface.js';
import { formatMaxMessage } from '../../integrations/max/max-message.util.js';

/** Личные уведомления в диалог с ботом; групповой chat из initData не используем. */
@Injectable()
export class MaxChannelProvider implements NotificationChannelProvider {
  readonly channel = NotificationChannel.MAX;
  readonly interruptive = true;
  private readonly logger = new Logger(MaxChannelProvider.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async isEnabledFor(user: User): Promise<boolean> {
    if (!this.config.get('MAX_BOT_TOKEN', { infer: true })) return false;
    const link = await this.prisma.maxLink.findUnique({ where: { userId: user.id } });
    return link !== null;
  }

  async send(notification: Notification, user: User): Promise<void> {
    // Повторно проверяем привязку: пока доставка ждала окончания тихих часов,
    // пользователь мог отвязать MAX или администратор мог отключить учётку.
    const link = await this.prisma.maxLink.findUnique({ where: { userId: user.id } });
    const token = this.config.get('MAX_BOT_TOKEN', { infer: true });
    let error: string | undefined;
    if (!user.isActive || !link || !token) {
      error = 'MAX отключён или аккаунт не привязан';
    } else {
      try {
        const url = new URL('https://platform-api2.max.ru/messages');
        url.searchParams.set('user_id', link.externalUserId);
        const text = formatMaxMessage(notification);
        const origin = this.config.get('CORS_ORIGIN', { infer: true })?.split(',')[0]?.trim();
        let attachments: object[] | undefined;
        if (notification.ticketId && origin) {
          const target = new URL(`/tickets/${encodeURIComponent(notification.ticketId)}`, origin);
          if (target.protocol === 'https:') attachments = [{ type: 'inline_keyboard', payload: { buttons: [[{
            type: 'link', text: '↗️ Открыть заявку', url: target.toString(),
          }]] } }];
        }
        const response = await fetch(url, {
          method: 'POST',
          headers: { Authorization: token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, format: 'html', attachments }),
          signal: AbortSignal.timeout(10_000),
          redirect: 'error',
        });
        if (!response.ok) {
          // Не сохраняем тело ответа: оно может содержать секреты или личные данные.
          error = `MAX API: HTTP ${response.status}`;
        }
        await response.body?.cancel();
      } catch {
        error = 'Не удалось связаться с MAX API (сеть, TLS или тайм-аут)';
      }
    }
    if (error) this.logger.warn(`Ошибка доставки MAX пользователю ${user.id}: ${error}`);
    await this.prisma.notificationDelivery.create({
      data: {
        notificationId: notification.id,
        channel: this.channel,
        status: error ? DeliveryStatus.FAILED : DeliveryStatus.SENT,
        sentAt: error ? undefined : new Date(),
        error,
      },
    });
  }
}
