import { ConflictException, Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomUUID } from 'node:crypto';
import type { Env } from '../config/env.schema.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from '../users/users.service.js';
import { LdapService } from './ldap/ldap.service.js';
import { parseDurationToMs } from '../common/utils/duration.js';
import { FeatureFlagsService } from '../system/feature-flags.service.js';
import { LoginEventResult, UserRole, UserSource, type User } from '../../generated/prisma/index.js';
import type { JwtAccessPayload } from './strategies/jwt.strategy.js';
import type { JwtRefreshPayload } from './strategies/jwt-refresh.strategy.js';
import { validateMaxInitData } from '../integrations/max/max-init-data.util.js';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

export interface LoginContext {
  userAgent?: string;
  ipAddress?: string;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly ldapService: LdapService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly flags: FeatureFlagsService,
  ) {}

  /**
   * Режим обслуживания (см. план №43): при включённом флаге входить и обновлять токен могут
   * только Главный сисадмин и master — все остальные получают 503, даже с верным паролем.
   * Это НЕ глобальный гвард на все запросы: уже вошедшие не-админы дорабатывают сессию
   * (access-токен живёт 15 минут), новый вход и ротация refresh-токена им закрыты.
   */
  private async assertNotBlockedByMaintenance(user: User, ctx: LoginContext): Promise<void> {
    if (user.role === UserRole.ADMIN || user.isMaster) return;
    const { enabled } = await this.flags.getMaintenance();
    if (!enabled) return;
    await this.recordLoginEvent({ username: user.username, userId: user.id, result: LoginEventResult.MAINTENANCE, ctx });
    throw new ServiceUnavailableException('Система на техническом обслуживании, вход временно ограничен');
  }

  /**
   * Проверка логина/пароля: сначала пробуем локальную (master/breakglass) учётку, затем LDAP.
   * Локальные учётки существуют независимо от AD именно на случай, когда AD недоступен.
   * Вынесено из `login()` в отдельный метод, чтобы им же мог воспользоваться вход через
   * MAX-мини-приложение при первой привязке аккаунта (см. `loginAndLinkMax`) — та же проверка
   * пароля, тот же аудит, без дублирования.
   */
  private async verifyCredentials(username: string, password: string, ctx: LoginContext): Promise<User> {
    const existingLocalUser = await this.usersService.findByUsername(username);

    let authenticatedUser: User | null = null;

    if (existingLocalUser?.source === UserSource.LOCAL) {
      const passwordMatches =
        existingLocalUser.passwordHash &&
        (await argon2.verify(existingLocalUser.passwordHash, password).catch(() => false));

      if (!passwordMatches) {
        await this.recordLoginEvent({ username, result: LoginEventResult.INVALID_CREDENTIALS, ctx });
        throw new UnauthorizedException('Неверный логин или пароль');
      }
      if (!existingLocalUser.isActive) {
        await this.recordLoginEvent({ username, userId: existingLocalUser.id, result: LoginEventResult.ACCOUNT_DISABLED, ctx });
        throw new UnauthorizedException('Учётная запись отключена');
      }

      authenticatedUser = existingLocalUser;
      await this.usersService.touchLastLogin(authenticatedUser.id);
    } else {
      let ldapInfo;
      try {
        ldapInfo = await this.ldapService.verifyCredentials(username, password);
      } catch (error) {
        // verifyCredentials бросает UnauthorizedException, если сервер каталога недоступен
        // (см. ldap.service.ts) — отличаем от банально неверного пароля в журнале входов.
        await this.recordLoginEvent({ username, result: LoginEventResult.LDAP_UNAVAILABLE, ctx });
        throw error;
      }
      if (!ldapInfo) {
        await this.recordLoginEvent({ username, result: LoginEventResult.INVALID_CREDENTIALS, ctx });
        throw new UnauthorizedException('Неверный логин или пароль');
      }

      authenticatedUser = await this.usersService.upsertFromLdap(ldapInfo);
      if (!authenticatedUser.isActive) {
        await this.recordLoginEvent({ username, userId: authenticatedUser.id, result: LoginEventResult.ACCOUNT_DISABLED, ctx });
        throw new UnauthorizedException('Учётная запись отключена');
      }
    }

    await this.assertNotBlockedByMaintenance(authenticatedUser, ctx);
    await this.recordLoginEvent({ username, userId: authenticatedUser.id, result: LoginEventResult.SUCCESS, ctx });
    return authenticatedUser;
  }

  async login(username: string, password: string, ctx: LoginContext = {}): Promise<{ user: User; tokens: AuthTokens }> {
    const authenticatedUser = await this.verifyCredentials(username, password, ctx);
    const tokens = await this.issueTokens(authenticatedUser, ctx);
    return { user: authenticatedUser, tokens };
  }

  /** Никогда не бросает — сбой аудит-лога не должен ронять сам логин (см. план "Журнал входов"). */
  private async recordLoginEvent(params: {
    username: string;
    userId?: string;
    result: LoginEventResult;
    ctx: LoginContext;
  }): Promise<void> {
    await this.prisma.loginEvent
      .create({
        data: {
          username: params.username,
          userId: params.userId,
          result: params.result,
          ipAddress: params.ctx.ipAddress,
          userAgent: params.ctx.userAgent,
        },
      })
      .catch((error) => this.logger.error('Не удалось записать событие входа', error instanceof Error ? error.stack : error));
  }

  private async issueTokens(user: User, ctx: LoginContext): Promise<AuthTokens> {
    // expiresIn передаём числом секунд, а не строкой "15m"/"14d" — у @nestjs/jwt строгая
    // литеральная типизация для строковых значений, которая не совместима с ConfigService<string>.
    const accessTtlMs = parseDurationToMs(this.config.get('JWT_ACCESS_TTL', { infer: true }));
    const refreshTtlMs = parseDurationToMs(this.config.get('JWT_REFRESH_TTL', { infer: true }));

    const accessPayload: JwtAccessPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      isStaff: user.isStaff,
      isMaster: user.isMaster,
    };
    const accessToken = await this.jwtService.signAsync(accessPayload, {
      secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
      expiresIn: Math.floor(accessTtlMs / 1000),
    });

    const tokenId = randomUUID();
    const refreshPayload: JwtRefreshPayload = { sub: user.id, tokenId };
    const refreshToken = await this.jwtService.signAsync(refreshPayload, {
      secret: this.config.get('JWT_REFRESH_SECRET', { infer: true }),
      expiresIn: Math.floor(refreshTtlMs / 1000),
    });

    const refreshTokenExpiresAt = new Date(Date.now() + refreshTtlMs);

    await this.prisma.refreshToken.create({
      data: {
        id: tokenId,
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        userAgent: ctx.userAgent,
        ipAddress: ctx.ipAddress,
        expiresAt: refreshTokenExpiresAt,
      },
    });

    return { accessToken, refreshToken, refreshTokenExpiresAt };
  }

  /** Ротация refresh-токена: старый отзывается, выдаётся новая пара. */
  async refresh(payload: JwtRefreshPayload, rawRefreshToken: string, ctx: LoginContext = {}): Promise<{ user: User; tokens: AuthTokens }> {
    const stored = await this.prisma.refreshToken.findUnique({ where: { id: payload.tokenId } });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date() || stored.tokenHash !== hashToken(rawRefreshToken)) {
      throw new UnauthorizedException('Сессия истекла, войдите заново');
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Учётная запись недоступна');
    }

    await this.assertNotBlockedByMaintenance(user, ctx);

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const tokens = await this.issueTokens(user, ctx);
    return { user, tokens };
  }

  async logout(tokenId: string | undefined): Promise<void> {
    if (!tokenId) return;
    await this.prisma.refreshToken.updateMany({
      where: { id: tokenId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // --- MAX-мини-приложение (см. план "Мини-приложение MAX") ---

  isMaxConfigured(): boolean {
    return Boolean(this.config.get('MAX_BOT_TOKEN', { infer: true }));
  }

  private requireMaxBotToken(): string {
    const token = this.config.get('MAX_BOT_TOKEN', { infer: true });
    if (!token) throw new ServiceUnavailableException('Интеграция с MAX не настроена');
    return token;
  }

  /**
   * Вход по уже привязанному MAX-аккаунту: MAX сам передаёт подписанную initData при каждом
   * открытии мини-приложения, отдельного пароля вводить не нужно. Если привязки ещё нет —
   * кидаем `UnauthorizedException('MAX_LINK_REQUIRED')`, по этому сообщению фронт показывает
   * форму логина и переходит на `loginAndLinkMax`, а не общую ошибку входа.
   */
  async loginViaMax(initData: string, ctx: LoginContext = {}): Promise<{ user: User; tokens: AuthTokens }> {
    const botToken = this.requireMaxBotToken();
    const parsed = validateMaxInitData(initData, botToken);
    if (!parsed) throw new UnauthorizedException('Недействительные данные MAX');

    const link = await this.prisma.maxLink.findUnique({ where: { externalUserId: parsed.userId }, include: { user: true } });
    if (!link) {
      await this.recordLoginEvent({ username: `max:${parsed.userId}`, result: LoginEventResult.MAX_LINK_REQUIRED, ctx });
      throw new UnauthorizedException('MAX_LINK_REQUIRED');
    }
    if (!link.user.isActive) {
      throw new UnauthorizedException('Учётная запись отключена');
    }

    await this.assertNotBlockedByMaintenance(link.user, ctx);
    await this.recordLoginEvent({ username: link.user.username, userId: link.user.id, result: LoginEventResult.SUCCESS, ctx });
    const tokens = await this.issueTokens(link.user, ctx);
    return { user: link.user, tokens };
  }

  /**
   * Первый вход через MAX: проверяем обычный логин/пароль Blik (тем же путём, что и веб-вход)
   * и, если успешно, привязываем текущий MAX-аккаунт (уже известный из initData) к этому
   * пользователю — больше пароль при последующих открытиях мини-приложения не нужен.
   */
  async loginAndLinkMax(
    initData: string,
    username: string,
    password: string,
    ctx: LoginContext = {},
  ): Promise<{ user: User; tokens: AuthTokens }> {
    const botToken = this.requireMaxBotToken();
    const parsed = validateMaxInitData(initData, botToken);
    if (!parsed) throw new UnauthorizedException('Недействительные данные MAX');

    const authenticatedUser = await this.verifyCredentials(username, password, ctx);

    const existingLink = await this.prisma.maxLink.findUnique({ where: { externalUserId: parsed.userId } });
    if (existingLink && existingLink.userId !== authenticatedUser.id) {
      throw new ConflictException('Этот MAX-аккаунт уже привязан к другому пользователю Blik');
    }

    await this.prisma.maxLink.upsert({
      where: { userId: authenticatedUser.id },
      update: { externalUserId: parsed.userId, externalChatId: parsed.chatId },
      create: { userId: authenticatedUser.id, externalUserId: parsed.userId, externalChatId: parsed.chatId },
    });

    const tokens = await this.issueTokens(authenticatedUser, ctx);
    return { user: authenticatedUser, tokens };
  }

  async unlinkMax(userId: string): Promise<void> {
    await this.prisma.maxLink.deleteMany({ where: { userId } });
  }

  async getMaxLinkStatus(userId: string): Promise<boolean> {
    const link = await this.prisma.maxLink.findUnique({ where: { userId } });
    return link !== null;
  }
}
