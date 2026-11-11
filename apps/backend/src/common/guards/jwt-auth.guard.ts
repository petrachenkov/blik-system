import { ForbiddenException, Injectable, type ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UserRole } from '../../../generated/prisma/index.js';
import type { AuthenticatedUser } from '../types/authenticated-user.js';

@Injectable()
export class ScheduleAuthGuard extends AuthGuard('jwt') {}

/** Проверяет access-токен (стратегия 'jwt'). Применяется глобально либо через @UseGuards. */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = AuthenticatedUser>(
    error: unknown, user: AuthenticatedUser | false | null, info: unknown, context: ExecutionContext,
  ): TUser {
    const authenticated = super.handleRequest<AuthenticatedUser>(error, user, info, context);
    if (authenticated.role === UserRole.SCHEDULE) {
      throw new ForbiddenException('Учётная запись имеет доступ только к расписанию');
    }
    return authenticated as TUser;
  }
}
