import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { APP_FILTER } from '@nestjs/core';
import { LdapModule } from '../auth/ldap/ldap.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter.js';
import { SystemController } from './system.controller.js';
import { WallboardController } from './wallboard.controller.js';
import { SystemHealthService } from './system-health.service.js';
import { ErrorLogService } from './error-log.service.js';
import { WallboardService } from './wallboard.service.js';
import { KioskTokenService } from './kiosk-token.service.js';
import { WallboardGuard } from './wallboard.guard.js';
import { TicketRetentionService } from './ticket-retention.service.js';
import { TicketArchiveCron } from './ticket-archive.cron.js';

// FeatureFlagsService приходит из глобального FeatureFlagsModule — не дублируем в providers,
// иначе получились бы два инстанса с несогласованным кэшем.
@Module({
  imports: [JwtModule.register({}), LdapModule, NotificationsModule],
  controllers: [SystemController, WallboardController],
  providers: [
    SystemHealthService,
    ErrorLogService,
    WallboardService,
    KioskTokenService,
    WallboardGuard,
    TicketRetentionService,
    TicketArchiveCron,
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class SystemModule {}
