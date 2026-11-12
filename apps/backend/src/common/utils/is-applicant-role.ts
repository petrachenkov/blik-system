import { UserRole } from '../../../generated/prisma/index.js';

export function isApplicantRole(role: UserRole | undefined): boolean {
  return role === UserRole.USER || role === UserRole.SCHEDULE;
}
