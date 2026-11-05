import { Module } from '@nestjs/common';
import { LocalServicesController } from './local-services.controller.js';
import { LocalServicesService } from './local-services.service.js';

@Module({ controllers: [LocalServicesController], providers: [LocalServicesService] })
export class LocalServicesModule {}
