import { Navigate } from 'react-router-dom';
import { useAuth } from '../shared/auth/AuthContext';
import { isStaffRole } from '../shared/labels';

/** Стартовая страница по роли: сотрудник → «Главная» (дашборд), преподаватель → список заявок. */
export function IndexRedirect() {
  const { user } = useAuth();
  if (!user) return null;
  return <Navigate to={isStaffRole(user.role) ? '/dashboard' : '/tickets'} replace />;
}
