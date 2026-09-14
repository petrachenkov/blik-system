import { Module } from '@nestjs/common';
import { TagsService } from './tags.service.js';
import { TagsController } from './tags.controller.js';

@Module({
  controllers: [TagsController],
  providers: [TagsService],
  exports: [TagsService],
})
export class TagsModule {}
