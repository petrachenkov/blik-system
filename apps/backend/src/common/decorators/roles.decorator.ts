import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '../../../generated/prisma/index.js';

export const ROLES_KEY = 'roles';

/** Декларативное ограничение эндпоинта по ролям. Используется вместе с RolesGuard. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
