import type { UserRole } from '../../../generated/prisma/index.js';

/** Полезная нагрузка JWT и то, что кладётся в req.user после JwtAuthGuard. */
export interface AuthenticatedUser {
  id: string;
  username: string;
  role: UserRole;
  isStaff: boolean;
  isMaster: boolean;
}
