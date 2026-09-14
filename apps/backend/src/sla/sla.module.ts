import { Module } from '@nestjs/common';
import { SlaService } from './sla.service.js';
import { SlaController } from './sla.controller.js';
import { SlaBreachCron } from './sla-breach.cron.js';

@Module({
  providers: [SlaService, SlaBreachCron],
  controllers: [SlaController],
  exports: [SlaService],
})
export class SlaModule {}
