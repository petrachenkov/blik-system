import { Module } from '@nestjs/common';
import { CollegeScheduleController, CollegeScheduleManagementController } from './college-schedule.controller.js';
import { CollegeScheduleService } from './college-schedule.service.js';
import { ScheduleMaxController } from './schedule-max.controller.js';

@Module({
  controllers: [CollegeScheduleController, CollegeScheduleManagementController, ScheduleMaxController],
  providers: [CollegeScheduleService],
})
export class CollegeScheduleModule {}
