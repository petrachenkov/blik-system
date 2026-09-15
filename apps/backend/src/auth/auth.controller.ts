import { Body, Controller, Delete, Get, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { Env } from '../config/env.schema.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { JwtRefreshGuard } from '../common/guards/jwt-refresh.guard.js';
import type { AuthenticatedUser } from '../common/types/authenticated-user.js';
import { UsersService } from '../users/users.service.js';
import { AuthService, type AuthTokens } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { MaxLinkLoginDto, MaxLoginDto } from './dto/max-login.dto.js';
import type { JwtRefreshPayload } from './strategies/jwt-refresh.strategy.js';

const REFRESH_COOKIE_NAME = 'refresh_token';
const REFRESH_COOKIE_PATH = '/api/auth';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  // Ограничение на подбор пароля: не более 10 попыток логина в минуту с одного клиента.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { user, tokens } = await this.authService.login(dto.username, dto.password, {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    });

    this.setRefreshCookie(res, tokens);

    return {
      accessToken: tokens.accessToken,
      user: this.toPublicUser(user),
    };
  }

  @UseGuards(JwtRefreshGuard)
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const payload = req.user as JwtRefreshPayload;
    const rawToken = (req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined) ?? '';
    if (!rawToken) throw new UnauthorizedException('Refresh-токен отсутствует');

    const { user, tokens } = await this.authService.refresh(payload, rawToken, {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    });

    this.setRefreshCookie(res, tokens);

    return {
      accessToken: tokens.accessToken,
      user: this.toPublicUser(user),
    };
  }

  @UseGuards(JwtRefreshGuard)
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const payload = req.user as JwtRefreshPayload;
    await this.authService.logout(payload?.tokenId);
    res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
    return { success: true };
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() currentUser: AuthenticatedUser) {
    const user = await this.usersService.findById(currentUser.id);
    if (!user) throw new UnauthorizedException();
    return this.toPublicUser(user);
  }

  // --- MAX-мини-приложение (см. план "Мини-приложение MAX") ---

  @Get('max/status')
  maxStatus() {
    return { configured: this.authService.isMaxConfigured() };
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('max')
  async loginViaMax(@Body() dto: MaxLoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { user, tokens } = await this.authService.loginViaMax(dto.initData, {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    });

    this.setRefreshCookie(res, tokens);

    return { accessToken: tokens.accessToken, user: this.toPublicUser(user) };
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('max/link')
  async loginAndLinkMax(@Body() dto: MaxLinkLoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { user, tokens } = await this.authService.loginAndLinkMax(dto.initData, dto.username, dto.password, {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    });

    this.setRefreshCookie(res, tokens);

    return { accessToken: tokens.accessToken, user: this.toPublicUser(user) };
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('max/link')
  async maxLinkStatus(@CurrentUser() currentUser: AuthenticatedUser) {
    return { linked: await this.authService.getMaxLinkStatus(currentUser.id) };
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Delete('max/link')
  async unlinkMax(@CurrentUser() currentUser: AuthenticatedUser) {
    await this.authService.unlinkMax(currentUser.id);
    return { success: true };
  }

  private setRefreshCookie(res: Response, tokens: AuthTokens) {
    res.cookie(REFRESH_COOKIE_NAME, tokens.refreshToken, {
      httpOnly: true,
      secure: this.config.get('NODE_ENV', { infer: true }) === 'production',
      sameSite: 'lax',
      path: REFRESH_COOKIE_PATH,
      expires: tokens.refreshTokenExpiresAt,
    });
  }

  private toPublicUser(user: Awaited<ReturnType<UsersService['findById']>>) {
    if (!user) return null;
    return {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      isStaff: user.isStaff,
      isMaster: user.isMaster,
      source: user.source,
      onboardingCompletedAt: user.onboardingCompletedAt,
    };
  }
}
