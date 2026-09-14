import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/types/authenticated-user.js';
import { ErrorSource, UserRole } from '../../generated/prisma/index.js';
import { FeatureFlagsService } from './feature-flags.service.js';
import { SystemHealthService } from './system-health.service.js';
import { ErrorLogService } from './error-log.service.js';
import { WorkingHoursService } from './working-hours.service.js';
import { TicketRetentionService } from './ticket-retention.service.js';
import { UpdateFlagDto } from './dto/update-flag.dto.js';
import { ReportErrorDto } from './dto/report-error.dto.js';
import { UpdateWorkingHoursDto } from './dto/working-hours.dto.js';
import { UpdateTicketRetentionDto } from './dto/ticket-retention.dto.js';

@ApiTags('system')
@Controller('system')
export class SystemController {
  constructor(
    private readonly flags: FeatureFlagsService,
    private readonly health: SystemHealthService,
    private readonly errorLog: ErrorLogService,
    private readonly workingHours: WorkingHoursService,
    private readonly retention: TicketRetentionService,
  ) {}

  // --- Политика хранения заявок (см. план «Архив заявок») ---

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('ticket-retention')
  getTicketRetention() {
    return this.retention.get();
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch('ticket-retention')
  setTicketRetention(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateTicketRetentionDto) {
    return this.retention.set(user.id, dto);
  }

  // --- Флаги функциональности ---

  /** Карта флагов для клиента — любой аутентифицированный. */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('flags')
  getFlags() {
    return this.flags.getPublicFlags();
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('flags/admin')
  getAdminFlags() {
    return this.flags.getAdminFlags();
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch('flags/:key')
  setFlag(@CurrentUser() user: AuthenticatedUser, @Param('key') key: string, @Body() dto: UpdateFlagDto) {
    return this.flags.set(key, dto.enabled, dto.note ?? null, user.id);
  }

  // --- Режим обслуживания (публичный статус для LoginPage) ---

  @Get('maintenance')
  getMaintenance() {
    return this.flags.getMaintenance();
  }

  // --- Рабочие часы визитов (см. план «Доработка календаря визитов») ---

  /** Читают все аутентифицированные — фронт использует расписание для disabledDate/disabledTime
   *  в форме окон визита (в т.ч. у заявителя при встречном предложении). Не секретные данные. */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('working-hours')
  getWorkingHours() {
    return this.workingHours.get();
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch('working-hours')
  setWorkingHours(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateWorkingHoursDto) {
    return this.workingHours.set(user.id, dto);
  }

  // --- Здоровье системы ---

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('health')
  getHealth() {
    return this.health.check();
  }

  // --- Трекинг ошибок ---

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('errors')
  getErrors(@Query('includeResolved') includeResolved?: string) {
    return this.errorLog.findRecent(includeResolved === 'true');
  }

  /** Приём ошибок фронтенда — любой аутентифицированный, с ограничением частоты. */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('errors')
  async reportError(@CurrentUser() user: AuthenticatedUser, @Body() dto: ReportErrorDto) {
    await this.errorLog.capture({
      source: ErrorSource.FRONTEND,
      message: dto.message,
      stack: dto.stack,
      route: dto.url,
      userId: user.id,
    });
    return { ok: true };
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch('errors/:id/resolve')
  async resolveError(@Param('id') id: string) {
    await this.errorLog.resolve(id);
    return { ok: true };
  }
}
