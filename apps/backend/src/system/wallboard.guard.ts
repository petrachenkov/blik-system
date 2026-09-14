import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { Env } from '../config/env.schema.js';
import { UserRole } from '../../generated/prisma/index.js';
import type { JwtAccessPayload } from '../auth/strategies/jwt.strategy.js';
import { KioskTokenService } from './kiosk-token.service.js';

const STAFF_ROLES = new Set<UserRole>([UserRole.ADMIN, UserRole.INTERN]);

/**
 * Доступ к снапшоту настенной панели (см. план): либо staff-JWT в Authorization, либо
 * действующий kiosk-токен в ?token= (телевизор в дежурке без входа).
 */
@Injectable()
export class WallboardGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly kioskTokens: KioskTokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const payload = this.jwtService.verify<JwtAccessPayload>(authHeader.slice(7), {
          secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
        });
        if (STAFF_ROLES.has(payload.role)) return true;
      } catch {
        // упадём в проверку kiosk-токена ниже
      }
    }

    const kioskToken = (request.query.token as string | undefined) ?? undefined;
    if (kioskToken && (await this.kioskTokens.resolveActive(kioskToken))) {
      return true;
    }

    throw new UnauthorizedException('Нужен вход сотрудника или действующая kiosk-ссылка');
  }
}
