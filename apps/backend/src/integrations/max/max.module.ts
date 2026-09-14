import { Module } from '@nestjs/common';
import { MaxWebhookController } from './max-webhook.controller.js';

@Module({
  controllers: [MaxWebhookController],
})
export class MaxModule {}
