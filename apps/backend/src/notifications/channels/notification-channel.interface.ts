import type { Notification, User } from '../../../generated/prisma/index.js';
import { NotificationChannel } from '../../../generated/prisma/index.js';

export const NOTIFICATION_CHANNELS = Symbol('NOTIFICATION_CHANNELS');

/**
 * Контракт канала доставки уведомления (см. план — "Интеграция с Max"). Любой новый канал —
 * это ещё одна реализация данного интерфейса, зарегистрированная в multi-provider списке;
 * NotificationsService не меняется при добавлении канала.
 */
export interface NotificationChannelProvider {
  readonly channel: NotificationChannel;
  /**
   * true — канал реально "прерывает" пользователя (пуш/сообщение в мессенджер), а не просто
   * лежит и ждёт, пока он сам зайдёт (как IN_APP). Используется "тихими часами" (см. план) —
   * откладывают доставку только для прерывающих каналов, без хардкода их списка.
   */
  readonly interruptive: boolean;
  isEnabledFor(user: User): boolean | Promise<boolean>;
  send(notification: Notification, user: User): Promise<void>;
}

export { NotificationChannel };
