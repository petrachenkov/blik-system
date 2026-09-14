import { Module } from '@nestjs/common';
import { TextSnippetsService } from './text-snippets.service.js';
import { TextSnippetsController } from './text-snippets.controller.js';

@Module({
  providers: [TextSnippetsService],
  controllers: [TextSnippetsController],
  exports: [TextSnippetsService],
})
export class TextSnippetsModule {}
