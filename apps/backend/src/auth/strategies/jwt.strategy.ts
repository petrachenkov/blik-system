import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Env } from '../../config/env.schema.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import type { UserRole } from '../../../generated/prisma/index.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface JwtAccessPayload {
  sub: string;
  username: string;
  role: UserRole;
  isStaff: boolean;
  isMaster: boolean;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService<Env, true>, private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_ACCESS_SECRET', { infer: true }),
    });
  }

  async validate(payload: JwtAccessPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub, isActive: true },
      select: { id: true, username: true, role: true, isStaff: true, isMaster: true },
    });
    if (!user) throw new UnauthorizedException();
    return user;
  }
}
