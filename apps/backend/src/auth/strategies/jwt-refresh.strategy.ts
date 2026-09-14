import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { Strategy } from 'passport-jwt';
import type { Env } from '../../config/env.schema.js';

export interface JwtRefreshPayload {
  sub: string;
  tokenId: string;
}

function extractRefreshTokenFromCookie(req: Request): string | null {
  return (req?.cookies?.refresh_token as string | undefined) ?? null;
}

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(config: ConfigService<Env, true>) {
    super({
      jwtFromRequest: extractRefreshTokenFromCookie,
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_REFRESH_SECRET', { infer: true }),
      passReqToCallback: false,
    });
  }

  validate(payload: JwtRefreshPayload): JwtRefreshPayload {
    return payload;
  }
}
