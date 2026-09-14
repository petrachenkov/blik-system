import { describe, expect, it } from 'vitest';
import { TicketPolicy } from './ticket-policy.js';
import { TicketStatus, UserRole } from '../../../generated/prisma/index.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import type { CommentForPolicy, TicketForPolicy } from './ticket-policy.js';

function user(role: UserRole, id = 'u1'): AuthenticatedUser {
  return { id, username: id, role, isStaff: true, isMaster: false };
}

function ticket(overrides: Partial<TicketForPolicy> = {}): TicketForPolicy {
  return {
    createdById: 'creator',
    assignedToId: null,
    status: TicketStatus.NEW,
    ...overrides,
  };
}

function comment(overrides: Partial<CommentForPolicy> = {}): CommentForPolicy {
  return {
    authorId: 'author1',
    isSystem: false,
    deletedAt: null,
    ...overrides,
  };
}

/**
 * После упрощения ролей: ADMIN (Сисадмин) — полный доступ, INTERN (Практикант) — только
 * назначенные ему заявки, USER (Преподаватель) — только собственные.
 */
describe('TicketPolicy', () => {
  const policy = new TicketPolicy();

  describe('canView', () => {
    it('ADMIN видит любую заявку', () => {
      const admin = user(UserRole.ADMIN, 'admin1');
      expect(policy.canView(admin, ticket({ assignedToId: null }))).toBe(true);
      expect(policy.canView(admin, ticket({ assignedToId: 'someone-else' }))).toBe(true);
    });

    it('INTERN видит только назначенные ему заявки', () => {
      const intern = user(UserRole.INTERN, 'intern1');
      expect(policy.canView(intern, ticket({ assignedToId: 'intern1' }))).toBe(true);
      expect(policy.canView(intern, ticket({ assignedToId: null }))).toBe(false);
      expect(policy.canView(intern, ticket({ assignedToId: 'other' }))).toBe(false);
    });

    it('USER (заявитель) видит только свои заявки', () => {
      const applicant = user(UserRole.USER, 'creator');
      expect(policy.canView(applicant, ticket({ createdById: 'creator' }))).toBe(true);
      expect(policy.canView(applicant, ticket({ createdById: 'someone-else' }))).toBe(false);
    });
  });

  describe('canSelfAssign', () => {
    it('ADMIN может самоназначиться только на неназначенную заявку', () => {
      expect(policy.canSelfAssign(user(UserRole.ADMIN), ticket({ assignedToId: null }))).toBe(true);
      expect(policy.canSelfAssign(user(UserRole.ADMIN), ticket({ assignedToId: 'someone' }))).toBe(false);
    });

    it('INTERN не самоназначается', () => {
      expect(policy.canSelfAssign(user(UserRole.INTERN), ticket({ assignedToId: null }))).toBe(false);
    });
  });

  describe('canAssignAnyone', () => {
    it('только ADMIN может назначать любого исполнителя', () => {
      expect(policy.canAssignAnyone(user(UserRole.ADMIN))).toBe(true);
      expect(policy.canAssignAnyone(user(UserRole.INTERN))).toBe(false);
      expect(policy.canAssignAnyone(user(UserRole.USER))).toBe(false);
    });
  });

  describe('canClassify', () => {
    it('ADMIN может классифицировать любую заявку', () => {
      expect(policy.canClassify(user(UserRole.ADMIN, 'admin1'), ticket({ assignedToId: null }))).toBe(true);
      expect(policy.canClassify(user(UserRole.ADMIN, 'admin1'), ticket({ assignedToId: 'admin2' }))).toBe(true);
    });

    it('INTERN может классифицировать только назначенную ему заявку', () => {
      const intern = user(UserRole.INTERN, 'intern1');
      expect(policy.canClassify(intern, ticket({ assignedToId: 'intern1' }))).toBe(true);
      expect(policy.canClassify(intern, ticket({ assignedToId: 'other' }))).toBe(false);
    });

    it('USER не может классифицировать', () => {
      expect(policy.canClassify(user(UserRole.USER, 'creator'), ticket({ createdById: 'creator' }))).toBe(false);
    });
  });

  describe('canChangeStatus', () => {
    it('ADMIN может менять статус любой заявки по допустимому переходу', () => {
      const t = ticket({ assignedToId: 'other', status: TicketStatus.ASSIGNED });
      expect(policy.canChangeStatus(user(UserRole.ADMIN, 'admin1'), t, TicketStatus.IN_PROGRESS)).toBe(true);
    });

    it('INTERN может менять статус только назначенной ему заявки', () => {
      const intern = user(UserRole.INTERN, 'intern1');
      expect(policy.canChangeStatus(intern, ticket({ assignedToId: 'intern1', status: TicketStatus.ASSIGNED }), TicketStatus.IN_PROGRESS)).toBe(true);
      expect(policy.canChangeStatus(intern, ticket({ assignedToId: 'other', status: TicketStatus.ASSIGNED }), TicketStatus.IN_PROGRESS)).toBe(false);
    });

    it('недопустимый переход отклоняется даже для ADMIN', () => {
      expect(policy.canChangeStatus(user(UserRole.ADMIN), ticket({ status: TicketStatus.NEW }), TicketStatus.CLOSED)).toBe(false);
    });

    it('переоткрыть закрытую заявку может заявитель или сисадмин, но не практикант-исполнитель', () => {
      const t = ticket({ createdById: 'creator', assignedToId: 'intern1', status: TicketStatus.CLOSED });
      expect(policy.canChangeStatus(user(UserRole.USER, 'creator'), t, TicketStatus.REOPENED)).toBe(true);
      expect(policy.canChangeStatus(user(UserRole.ADMIN, 'admin1'), t, TicketStatus.REOPENED)).toBe(true);
      expect(policy.canChangeStatus(user(UserRole.INTERN, 'intern1'), t, TicketStatus.REOPENED)).toBe(false);
    });
  });

  describe('canComment', () => {
    it('создатель, исполнитель и любой ADMIN могут комментировать', () => {
      const t = ticket({ createdById: 'creator', assignedToId: 'intern1' });
      expect(policy.canComment(user(UserRole.USER, 'creator'), t)).toBe(true);
      expect(policy.canComment(user(UserRole.INTERN, 'intern1'), t)).toBe(true);
      expect(policy.canComment(user(UserRole.ADMIN, 'anyone'), t)).toBe(true);
    });

    it('посторонний не может комментировать', () => {
      const t = ticket({ createdById: 'creator', assignedToId: 'intern1' });
      expect(policy.canComment(user(UserRole.USER, 'stranger'), t)).toBe(false);
      expect(policy.canComment(user(UserRole.INTERN, 'intern2'), t)).toBe(false);
    });
  });

  describe('canRate', () => {
    it('заявитель может оценить решённую или закрытую заявку', () => {
      const creator = user(UserRole.USER, 'creator');
      expect(policy.canRate(creator, ticket({ createdById: 'creator', status: TicketStatus.RESOLVED }))).toBe(true);
      expect(policy.canRate(creator, ticket({ createdById: 'creator', status: TicketStatus.CLOSED }))).toBe(true);
    });

    it('заявитель не может оценить ещё не решённую заявку', () => {
      expect(policy.canRate(user(UserRole.USER, 'creator'), ticket({ createdById: 'creator', status: TicketStatus.IN_PROGRESS }))).toBe(false);
    });

    it('никто, кроме заявителя, оценить не может', () => {
      const t = ticket({ createdById: 'creator', assignedToId: 'admin1', status: TicketStatus.CLOSED });
      expect(policy.canRate(user(UserRole.ADMIN, 'admin1'), t)).toBe(false);
    });
  });

  describe('canEditComment — без ограничения по времени', () => {
    it('автор может редактировать/удалять свой комментарий', () => {
      expect(policy.canEditComment(user(UserRole.ADMIN, 'author1'), comment({ authorId: 'author1' }))).toBe(true);
    });

    it('чужой комментарий редактировать нельзя, даже ADMIN', () => {
      expect(policy.canEditComment(user(UserRole.ADMIN, 'someone-else'), comment({ authorId: 'author1' }))).toBe(false);
    });

    it('системную запись редактировать нельзя даже автору', () => {
      expect(policy.canEditComment(user(UserRole.ADMIN, 'author1'), comment({ authorId: 'author1', isSystem: true }))).toBe(false);
    });

    it('уже удалённый комментарий редактировать нельзя', () => {
      expect(policy.canEditComment(user(UserRole.ADMIN, 'author1'), comment({ authorId: 'author1', deletedAt: new Date() }))).toBe(false);
    });
  });

  describe('buildVisibilityWhere', () => {
    it('для ADMIN не сужает выборку', () => {
      expect(policy.buildVisibilityWhere(user(UserRole.ADMIN))).toEqual({});
    });

    it('для INTERN — назначенные ему или где он соисполнитель', () => {
      expect(policy.buildVisibilityWhere(user(UserRole.INTERN, 'intern1'))).toEqual({
        OR: [{ assignedToId: 'intern1' }, { collaborators: { some: { userId: 'intern1' } } }],
      });
    });

    it('для USER — только созданные им', () => {
      expect(policy.buildVisibilityWhere(user(UserRole.USER, 'creator'))).toEqual({ createdById: 'creator' });
    });
  });

  describe('соисполнитель', () => {
    const collab = user(UserRole.INTERN, 'helper');
    const t = ticket({ assignedToId: 'someone', status: TicketStatus.IN_PROGRESS, collaborators: [{ userId: 'helper' }] });

    it('видит заявку, где он соисполнитель, хоть и не назначен', () => {
      expect(policy.canView(collab, t)).toBe(true);
    });
    it('может комментировать и классифицировать', () => {
      expect(policy.canComment(collab, t)).toBe(true);
      expect(policy.canClassify(collab, t)).toBe(true);
    });
    it('может менять статус (IN_PROGRESS → RESOLVED)', () => {
      expect(policy.canChangeStatus(collab, t, TicketStatus.RESOLVED)).toBe(true);
    });
    it('по чужой заявке без коллаборации — доступа нет', () => {
      const other = ticket({ assignedToId: 'someone', collaborators: [{ userId: 'another' }] });
      expect(policy.canView(collab, other)).toBe(false);
      expect(policy.canComment(collab, other)).toBe(false);
    });
  });
});
