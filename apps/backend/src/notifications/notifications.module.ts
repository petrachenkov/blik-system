import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { NotificationsService } from './notifications.service.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsGateway } from './notifications.gateway.js';
import { InAppChannelProvider } from './channels/in-app-channel.provider.js';
import { MaxChannelProvider } from './channels/max-channel.provider.js';
import { WebPushChannelProvider } from './channels/web-push-channel.provider.js';
import { NOTIFICATION_CHANNELS } from './channels/notification-channel.interface.js';
import { QuietHoursDeliveryCron } from './quiet-hours-delivery.cron.js';

@Module({
  imports: [JwtModule.register({})],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsGateway,
    InAppChannelProvider,
    MaxChannelProvider,
    WebPushChannelProvider,
    QuietHoursDeliveryCron,
    {
      provide: NOTIFICATION_CHANNELS,
      useFactory: (inApp: InAppChannelProvider, max: MaxChannelProvider, webPush: WebPushChannelProvider) => [inApp, max, webPush],
      inject: [InAppChannelProvider, MaxChannelProvider, WebPushChannelProvider],
    },
  ],
  exports: [NotificationsGateway, NotificationsService, WebPushChannelProvider],
})
export class NotificationsModule {}
