import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Env } from '../../config/env.schema.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import type { UserRole } from '../../../generated/prisma/index.js';

export interface JwtAccessPayload {
  sub: string;
  username: string;
  role: UserRole;
  isStaff: boolean;
  isMaster: boolean;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService<Env, true>) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_ACCESS_SECRET', { infer: true }),
    });
  }

  validate(payload: JwtAccessPayload): AuthenticatedUser {
    return {
      id: payload.sub,
      username: payload.username,
      role: payload.role,
      isStaff: payload.isStaff,
      isMaster: payload.isMaster,
    };
  }
}
