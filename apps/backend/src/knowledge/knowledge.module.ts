import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module.js';
import { TicketsModule } from '../tickets/tickets.module.js';
import { KnowledgeController } from './knowledge.controller.js';
import { KnowledgeService } from './knowledge.service.js';
import { KnowledgeAttachmentsService } from './knowledge-attachments.service.js';

@Module({
  imports: [StorageModule, TicketsModule],
  controllers: [KnowledgeController],
  providers: [KnowledgeService, KnowledgeAttachmentsService],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}
