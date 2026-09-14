import { Global, Module } from '@nestjs/common';
import { WorkingHoursService } from './working-hours.service.js';

/**
 * Глобальный, чтобы WorkingHoursService можно было инжектить и в SystemController, и в
 * VisitsService (tickets-модуль) без перекрёстных импортов модулей.
 */
@Global()
@Module({
  providers: [WorkingHoursService],
  exports: [WorkingHoursService],
})
export class WorkingHoursModule {}
