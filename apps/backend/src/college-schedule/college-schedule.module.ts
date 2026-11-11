import { Module } from '@nestjs/common';
import { CollegeScheduleController, CollegeScheduleManagementController } from './college-schedule.controller.js';
import { CollegeScheduleService } from './college-schedule.service.js';
import { ScheduleMaxController } from './schedule-max.controller.js';
import { ScheduleMaxService } from './schedule-max.service.js';

@Module({
  controllers: [CollegeScheduleController, CollegeScheduleManagementController, ScheduleMaxController],
  providers: [CollegeScheduleService, ScheduleMaxService],
})
export class CollegeScheduleModule {}
