import { Injectable, type CanActivate, type ExecutionContext, ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../types/authenticated-user.js';

/**
 * Разрешает действие только breakglass-суперпользователю (isMaster), а не любому SUPER_ADMIN.
 * Используется для необратимых действий вроде безвозвратного удаления заявки.
 */
@Injectable()
export class MasterOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { user: AuthenticatedUser }>();

    if (!request.user?.isMaster) {
      throw new ForbiddenException('Это действие доступно только master-аккаунту');
    }

    return true;
  }
}
