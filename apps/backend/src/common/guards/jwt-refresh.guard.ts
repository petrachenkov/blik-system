import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Проверяет refresh-токен из httpOnly-cookie (стратегия 'jwt-refresh'). */
@Injectable()
export class JwtRefreshGuard extends AuthGuard('jwt-refresh') {}
