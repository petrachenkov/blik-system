import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/index.js';
import { TicketStatus, UserRole } from '../../../generated/prisma/index.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { isValidStatusTransition } from '../ticket-status.js';

export interface TicketForPolicy {
  createdById: string;
  assignedToId: string | null;
  status: TicketStatus;
  /** Соисполнители (см. план) — доступ как у назначенного практиканта. */
  collaborators?: { userId: string }[];
}

/** Сотрудник участвует в работе по заявке: назначен или добавлен соисполнителем. */
export function isTicketWorker(userId: string, ticket: TicketForPolicy): boolean {
  return ticket.assignedToId === userId || (ticket.collaborators ?? []).some((c) => c.userId === userId);
}

export interface CommentForPolicy {
  authorId: string | null;
  isSystem: boolean;
  deletedAt: Date | null;
}

/**
 * Resource-level RBAC для заявок (см. план — "RBAC: два уровня"). Инкапсулирует, кто что
 * видит и может делать, независимо от endpoint-guard'ов уровня контроллера.
 *
 * Роли: ADMIN (Сисадмин) — полный доступ; INTERN (Практикант) — только назначенные ему
 * заявки; USER (Преподаватель) — только собственные.
 */
@Injectable()
export class TicketPolicy {
  /** Условие для Prisma `where`, а не постфильтрация — иначе ломается пагинация списка. */
  buildVisibilityWhere(user: AuthenticatedUser): Prisma.TicketWhereInput {
    switch (user.role) {
      case UserRole.ADMIN:
        return {};
      case UserRole.INTERN:
        // Назначенные ИЛИ где практикант — соисполнитель. Возвращаем OR (не AND): findAll
        // спредит это на верхний уровень where, а свои overdue/search держит во вложенном AND.
        return { OR: [{ assignedToId: user.id }, { collaborators: { some: { userId: user.id } } }] };
      case UserRole.USER:
      default:
        return { createdById: user.id };
    }
  }

  canView(user: AuthenticatedUser, ticket: TicketForPolicy): boolean {
    switch (user.role) {
      case UserRole.ADMIN:
        return true;
      case UserRole.INTERN:
        return isTicketWorker(user.id, ticket);
      case UserRole.USER:
      default:
        return ticket.createdById === user.id;
    }
  }

  canSelfAssign(user: AuthenticatedUser, ticket: TicketForPolicy): boolean {
    return user.role === UserRole.ADMIN && ticket.assignedToId === null;
  }

  canAssignAnyone(user: AuthenticatedUser): boolean {
    return user.role === UserRole.ADMIN;
  }

  /** Классифицировать (категория+приоритет) может Сисадмин или назначенный практикант. */
  canClassify(user: AuthenticatedUser, ticket: TicketForPolicy): boolean {
    if (user.role === UserRole.ADMIN) return true;
    if (user.role === UserRole.INTERN) return isTicketWorker(user.id, ticket);
    return false;
  }

  canChangeStatus(user: AuthenticatedUser, ticket: TicketForPolicy, targetStatus: TicketStatus): boolean {
    if (!isValidStatusTransition(ticket.status, targetStatus)) return false;

    // Сисадмин — полный доступ, в т.ч. переоткрыть заявку (исправление ошибочного закрытия).
    if (user.role === UserRole.ADMIN) return true;

    // "Переоткрыть" — иначе право только заявителя ("не согласен с решением"), не исполнителя.
    if (targetStatus === 'REOPENED') {
      return ticket.createdById === user.id;
    }

    if (user.role === UserRole.INTERN) return isTicketWorker(user.id, ticket);

    return false;
  }

  canComment(user: AuthenticatedUser, ticket: TicketForPolicy): boolean {
    if (user.role === UserRole.ADMIN) return true;
    return ticket.createdById === user.id || isTicketWorker(user.id, ticket);
  }

  /**
   * Оценить решение может только сам заявитель — с момента RESOLVED, а не только CLOSED.
   * Перевести заявку в CLOSED может только Сисадмин/назначенный практикант (см. canChangeStatus),
   * а заявитель этой кнопки не видит — из-за чего заявки годами остаются в RESOLVED и оценка
   * была фактически недостижима (см. фидбэк).
   */
  canRate(user: AuthenticatedUser, ticket: TicketForPolicy): boolean {
    return (
      ticket.createdById === user.id &&
      (ticket.status === TicketStatus.RESOLVED || ticket.status === TicketStatus.CLOSED)
    );
  }

  /**
   * Редактировать/удалять можно только свой собственный, не системный, ещё не удалённый
   * комментарий — без ограничения по времени (решение пользователя, см. план "Правки
   * комментариев"). Одно и то же условие для edit и delete — семантически это одно право.
   */
  canEditComment(user: AuthenticatedUser, comment: CommentForPolicy): boolean {
    return comment.authorId === user.id && !comment.isSystem && !comment.deletedAt;
  }
}
