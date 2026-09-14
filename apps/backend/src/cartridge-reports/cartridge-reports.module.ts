import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module.js';
import { CartridgeReportsService } from './cartridge-reports.service.js';
import { CartridgeReportsController } from './cartridge-reports.controller.js';

@Module({
  imports: [StorageModule],
  controllers: [CartridgeReportsController],
  providers: [CartridgeReportsService],
  exports: [CartridgeReportsService],
})
export class CartridgeReportsModule {}
