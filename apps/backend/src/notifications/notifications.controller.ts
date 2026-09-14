import { Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/types/authenticated-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '../../generated/prisma/index.js';
import type { Env } from '../config/env.schema.js';
import { NotificationsService } from './notifications.service.js';
import { BroadcastNotificationDto } from './dto/broadcast-notification.dto.js';
import { PushSubscriptionDto } from './dto/push-subscription.dto.js';
import { UpdateQuietHoursDto } from './dto/quiet-hours.dto.js';
import { UpdateNotificationPreferencesDto } from './dto/notification-preferences.dto.js';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Публичный VAPID-ключ — фронту нужен для pushManager.subscribe (см. план "Push-уведомления"). */
  @Get('vapid-public-key')
  getVapidPublicKey() {
    return { publicKey: this.config.get('VAPID_PUBLIC_KEY', { infer: true }) ?? null };
  }

  /** Подписка браузера на Web Push — upsert по endpoint (переустановка/повторная подписка). */
  @Post('push-subscription')
  async subscribeToPush(@CurrentUser() user: AuthenticatedUser, @Body() dto: PushSubscriptionDto) {
    await this.prisma.webPushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      update: { userId: user.id, p256dh: dto.keys.p256dh, auth: dto.keys.auth },
      create: { userId: user.id, endpoint: dto.endpoint, p256dh: dto.keys.p256dh, auth: dto.keys.auth },
    });
    return { subscribed: true };
  }

  /** Отписка — конкретного endpoint (это устройство/браузер), не всех подписок пользователя. */
  @Delete('push-subscription')
  async unsubscribeFromPush(@CurrentUser() user: AuthenticatedUser, @Body('endpoint') endpoint: string) {
    await this.prisma.webPushSubscription.deleteMany({ where: { userId: user.id, endpoint } });
    return { subscribed: false };
  }

  /** Настройки тихих часов — читает и редактирует только Главный сисадмин (см. план). */
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('quiet-hours')
  getQuietHours() {
    return this.notificationsService.getQuietHours();
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch('quiet-hours')
  updateQuietHours(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateQuietHoursDto) {
    return this.notificationsService.setQuietHours(user.id, dto.start ?? null, dto.end ?? null);
  }

  /** Ручная рассылка произвольного текста — только Главный сисадмин (см. план). */
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('broadcast')
  broadcast(@CurrentUser() user: AuthenticatedUser, @Body() dto: BroadcastNotificationDto) {
    return this.notificationsService.sendManual({
      actorId: user.id,
      title: dto.title,
      body: dto.body,
      targetUserId: dto.targetUserId,
    });
  }

  /** Личные настройки уведомлений — свои (см. план). */
  @Get('preferences')
  getPreferences(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.getPreferences(user.id);
  }

  @Put('preferences')
  updatePreferences(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateNotificationPreferencesDto) {
    return this.notificationsService.setPreferences(user.id, dto.items);
  }

  @Get()
  findMine(@CurrentUser() user: AuthenticatedUser, @Query('unreadOnly') unreadOnly?: string) {
    return this.prisma.notification.findMany({
      where: { userId: user.id, ...(unreadOnly === 'true' ? { isRead: false } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  /** Отмечает все непрочитанные уведомления пользователя прочитанными разом (открыл колокольчик). */
  @Patch('read-all')
  async markAllAsRead(@CurrentUser() user: AuthenticatedUser) {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId: user.id, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { updated: count };
  }

  @Patch(':id/read')
  async markAsRead(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const notification = await this.prisma.notification.findUnique({ where: { id } });
    if (!notification) throw new NotFoundException('Уведомление не найдено');
    if (notification.userId !== user.id) throw new ForbiddenException();

    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    });
  }
}
