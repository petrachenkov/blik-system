import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/types/authenticated-user.js';
import { UserRole } from '../../generated/prisma/index.js';
import { UsersService } from './users.service.js';
import { SetRoleDto } from './dto/set-role.dto.js';
import { CreateLocalUserDto } from './dto/create-local-user.dto.js';
import { FeatureFlagsService } from '../system/feature-flags.service.js';
import { FEATURE_FLAGS } from '../system/feature-flags.js';

const STAFF_ROLES = [UserRole.ADMIN, UserRole.INTERN] as const;

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly flags: FeatureFlagsService,
  ) {}

  /** Список пользователей — нужен сисадмину для назначения ролей и ответственных. */
  @Get()
  @Roles(UserRole.ADMIN)
  findAll() {
    return this.usersService.findAll();
  }

  /** Создание локальной (не-AD) учётной записи — только сисадмин (см. план "Локальные учётки"). */
  @Post('local')
  @Roles(UserRole.ADMIN)
  createLocal(@Body() dto: CreateLocalUserDto) {
    return this.usersService.createLocal(dto);
  }

  /** Удаление учётки с обезличиванием следов — только сисадмин; master и себя удалить нельзя. */
  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.usersService.remove(id, user.id);
  }

  /** Урезанный список коллег для @упоминаний — доступен любому сотруднику (см. план). */
  @Get('staff-directory')
  @Roles(...STAFF_ROLES)
  async findStaffDirectory() {
    if (!(await this.flags.isEnabled(FEATURE_FLAGS.MENTIONS))) return [];
    return this.usersService.findStaffDirectory();
  }

  /** Подтягивает всех членов группы сотрудников из AD, не дожидаясь их первого личного входа. */
  @Post('sync-ldap')
  @Roles(UserRole.ADMIN)
  syncLdap() {
    return this.usersService.syncFromLdap();
  }

  /** Журнал входов — успешные и неудачные попытки, с IP/User-Agent (см. план). */
  @Get('login-log')
  @Roles(UserRole.ADMIN)
  findLoginEvents() {
    return this.usersService.findLoginEvents();
  }

  /** Отметить онбординг-тур пройденным — самообслуживание, любой аутентифицированный. */
  @Patch('me/onboarding')
  completeOnboarding(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.completeOnboarding(user.id);
  }

  /** Смена роли пользователя — только сисадмин. */
  @Patch(':id/role')
  @Roles(UserRole.ADMIN)
  setRole(@Param('id') id: string, @Body() dto: SetRoleDto) {
    return this.usersService.setRole(id, dto.role);
  }
}
