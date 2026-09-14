import { Injectable, type CanActivate, type ExecutionContext, ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../types/authenticated-user.js';

/**
 * Разрешает действие только сотрудникам/преподавателям (isStaff = true по членству в группе AD)
 * либо сисадминам всех уровней — им создание заявок не запрещено содержательно, но обычно
 * этим пользуются заявители. Практиканты/сисадмины тоже сотрудники, поэтому isStaff у них true.
 */
@Injectable()
export class StaffOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { user: AuthenticatedUser }>();
    const user = request.user;

    if (!user?.isStaff) {
      throw new ForbiddenException('Подавать заявки могут только сотрудники и преподаватели');
    }

    return true;
  }
}
