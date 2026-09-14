import { Module } from '@nestjs/common';
import { CartridgesService } from './cartridges.service.js';
import { CartridgesController } from './cartridges.controller.js';

@Module({
  controllers: [CartridgesController],
  providers: [CartridgesService],
  exports: [CartridgesService],
})
export class CartridgesModule {}
