import { Module } from '@nestjs/common';
import { RefillEventsService } from './refill-events.service.js';
import { RefillEventsController } from './refill-events.controller.js';
import { RefillReminderCron } from './refill-reminder.cron.js';

@Module({
  controllers: [RefillEventsController],
  providers: [RefillEventsService, RefillReminderCron],
  exports: [RefillEventsService],
})
export class RefillEventsModule {}
