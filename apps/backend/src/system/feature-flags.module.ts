import { Global, Module } from '@nestjs/common';
import { FeatureFlagsService } from './feature-flags.service.js';

/**
 * Глобальный, чтобы FeatureFlagsService можно было инжектить где угодно (auth, tickets,
 * notifications, knowledge...) без циклических импортов между модулями.
 */
@Global()
@Module({
  providers: [FeatureFlagsService],
  exports: [FeatureFlagsService],
})
export class FeatureFlagsModule {}
