import { Module } from '@nestjs/common';
import { AnnouncementsService } from './announcements.service.js';
import { AnnouncementsController } from './announcements.controller.js';

@Module({
  controllers: [AnnouncementsController],
  providers: [AnnouncementsService],
})
export class AnnouncementsModule {}
