import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { StorageModule } from '../storage/storage.module.js';
import { SlaModule } from '../sla/sla.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { TicketsService } from './tickets.service.js';
import { TicketsController } from './tickets.controller.js';
import { TicketPolicy } from './policies/ticket-policy.js';
import { TicketHistoryService } from './history/ticket-history.service.js';
import { CommentsService } from './comments/comments.service.js';
import { AttachmentsService } from './attachments/attachments.service.js';
import { TicketsGateway } from './tickets.gateway.js';
import { VisitsService } from './visits/visits.service.js';
import { VisitsController } from './visits/visits.controller.js';
import { VisitReminderCron } from './visits/visit-reminder.cron.js';
import { CalendarTasksService } from './calendar-tasks/calendar-tasks.service.js';
import { CalendarTasksController } from './calendar-tasks/calendar-tasks.controller.js';

@Module({
  imports: [StorageModule, SlaModule, NotificationsModule, JwtModule.register({})],
  controllers: [TicketsController, VisitsController, CalendarTasksController],
  providers: [
    TicketsService,
    TicketPolicy,
    TicketHistoryService,
    CommentsService,
    AttachmentsService,
    TicketsGateway,
    VisitsService,
    VisitReminderCron,
    CalendarTasksService,
  ],
  exports: [TicketsService, TicketPolicy, AttachmentsService],
})
export class TicketsModule {}
