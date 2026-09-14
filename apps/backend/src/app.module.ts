import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { validateEnv } from './config/env.schema.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { CommonModule } from './common/common.module.js';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { CategoriesModule } from './categories/categories.module.js';
import { LocationsModule } from './locations/locations.module.js';
import { SlaModule } from './sla/sla.module.js';
import { TicketsModule } from './tickets/tickets.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { MaxModule } from './integrations/max/max.module.js';
import { CartridgesModule } from './cartridges/cartridges.module.js';
import { CartridgeReportsModule } from './cartridge-reports/cartridge-reports.module.js';
import { RefillEventsModule } from './refill-events/refill-events.module.js';
import { AnnouncementsModule } from './announcements/announcements.module.js';
import { KnowledgeModule } from './knowledge/knowledge.module.js';
import { TextSnippetsModule } from './text-snippets/text-snippets.module.js';
import { TagsModule } from './tags/tags.module.js';
import { FeatureFlagsModule } from './system/feature-flags.module.js';
import { WorkingHoursModule } from './system/working-hours.module.js';
import { SystemModule } from './system/system.module.js';
import { SearchModule } from './search/search.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 100 }],
    }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    PrismaModule,
    CommonModule,
    FeatureFlagsModule,
    WorkingHoursModule,
    AuthModule,
    UsersModule,
    CategoriesModule,
    LocationsModule,
    SlaModule,
    TicketsModule,
    NotificationsModule,
    MaxModule,
    CartridgesModule,
    CartridgeReportsModule,
    RefillEventsModule,
    AnnouncementsModule,
    KnowledgeModule,
    TextSnippetsModule,
    TagsModule,
    SystemModule,
    SearchModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
