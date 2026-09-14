import { Body, Controller, Delete, Get, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/types/authenticated-user.js';
import { UserRole } from '../../generated/prisma/index.js';
import type { Env } from '../config/env.schema.js';
import { FeatureFlagsService } from './feature-flags.service.js';
import { FEATURE_FLAGS } from './feature-flags.js';
import { WallboardService } from './wallboard.service.js';
import { WallboardGuard } from './wallboard.guard.js';
import { KioskTokenService } from './kiosk-token.service.js';
import { CreateKioskTokenDto } from './dto/create-kiosk-token.dto.js';

@ApiTags('wallboard')
@Controller('wallboard')
export class WallboardController {
  constructor(
    private readonly wallboard: WallboardService,
    private readonly kioskTokens: KioskTokenService,
    private readonly flags: FeatureFlagsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Снапшот для панели — доступ по staff-JWT или kiosk-токену (?token=). */
  @UseGuards(WallboardGuard)
  @Get('snapshot')
  async getSnapshot() {
    if (!(await this.flags.isEnabled(FEATURE_FLAGS.WALLBOARD))) {
      throw new NotFoundException('Настенная панель отключена');
    }
    return this.wallboard.getSnapshot();
  }

  // --- Управление kiosk-ссылками (только Главный сисадмин) ---

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('kiosk-tokens')
  listKioskTokens() {
    return this.kioskTokens.list();
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('kiosk-tokens')
  async createKioskToken(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateKioskTokenDto) {
    const created = await this.kioskTokens.create(dto.label, user.id);
    const base = this.config.get('CORS_ORIGIN', { infer: true });
    return { ...created, url: `${base}/wallboard?k=${created.token}` };
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Delete('kiosk-tokens/:id')
  async revokeKioskToken(@Param('id') id: string) {
    await this.kioskTokens.revoke(id);
    return { ok: true };
  }
}
