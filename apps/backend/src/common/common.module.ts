import { Global, Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';

/**
 * Делает PassportModule доступным глобально, чтобы JwtAuthGuard/JwtRefreshGuard можно было
 * использовать через @UseGuards(...) в любом модуле (tickets, categories, sla, ...), не
 * импортируя PassportModule в каждом из них по отдельности.
 */
@Global()
@Module({
  imports: [PassportModule.register({ session: false })],
  exports: [PassportModule],
})
export class CommonModule {}
