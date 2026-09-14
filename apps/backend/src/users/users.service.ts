import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service.js';
import { TicketStatus, UserRole, UserSource, type User } from '../../generated/prisma/index.js';
import { LdapService, type LdapUserInfo } from '../auth/ldap/ldap.service.js';

/** Служебный аккаунт-приёмник обезличенных следов удалённых пользователей. */
const DELETED_SENTINEL_USERNAME = '__deleted__';

// Нагрузка исполнителя "сейчас" — заявка уже назначена и ждёт его действия (без NEW —
// неназначённые заявки ни к чьей нагрузке не относятся). См. план — "Статистика по исполнителям".
const OPEN_WORKLOAD_STATUSES: TicketStatus[] = [TicketStatus.ASSIGNED, TicketStatus.IN_PROGRESS, TicketStatus.REOPENED];

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ldapService: LdapService,
  ) {}

  async findAll() {
    const [users, workload] = await Promise.all([
      this.prisma.user.findMany({
        where: { isActive: true, username: { not: DELETED_SENTINEL_USERNAME } },
        orderBy: { fullName: 'asc' },
        select: {
          id: true,
          username: true,
          fullName: true,
          email: true,
          role: true,
          source: true,
          isStaff: true,
          isMaster: true,
          department: true,
          lastLoginAt: true,
        },
      }),
      this.prisma.ticket.groupBy({
        by: ['assignedToId'],
        where: { assignedToId: { not: null }, status: { in: OPEN_WORKLOAD_STATUSES } },
        _count: { _all: true },
      }),
    ]);

    const openCountByUserId = new Map(workload.map((w) => [w.assignedToId, w._count._all]));

    return users.map((u) => ({ ...u, openTicketsCount: openCountByUserId.get(u.id) ?? 0 }));
  }

  /**
   * Урезанный список сотрудников для @упоминаний в комментариях (см. план "Упоминания") —
   * в отличие от findAll() (только SUPER_ADMIN), доступен любому сотруднику: коллеги должны
   * уметь упомянуть друг друга, не имея прав на полный список пользователей.
   */
  findStaffDirectory() {
    return this.prisma.user.findMany({
      where: { isActive: true, isStaff: true, role: { in: [UserRole.ADMIN, UserRole.INTERN] } },
      orderBy: { fullName: 'asc' },
      select: { id: true, fullName: true, role: true },
    });
  }

  /**
   * Отмечает онбординг-тур пройденным — самообслуживание, без прав администратора (см. план).
   * select без passwordHash — иначе, в отличие от остальных методов этого сервиса, которые
   * никогда не отдаются напрямую клиенту, этот вызывается прямо из контроллера (см.
   * UsersController.completeOnboarding), и сырой User с passwordHash утёк бы в HTTP-ответ.
   */
  async completeOnboarding(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { onboardingCompletedAt: new Date() },
      select: {
        id: true,
        username: true,
        email: true,
        fullName: true,
        role: true,
        isStaff: true,
        isMaster: true,
        source: true,
        onboardingCompletedAt: true,
      },
    });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findByUsername(username: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { username } });
  }

  /**
   * Создаёт или обновляет локальную запись пользователя из данных AD. Роль не переопределяется
   * при повторных входах — новые пользователи получают роль USER, дальнейшее назначение ролей
   * (ADMIN/INTERN/SUPER_ADMIN) — задача Главного сисадмина.
   *
   * touchLogin=true (по умолчанию) — реальный вход, проставляем lastLoginAt (единственный
   * вызывающий сейчас — AuthService.login()). touchLogin=false — массовая синхронизация из AD
   * по кнопке (см. syncFromLdap): человек не логинился, фиктивный "последний вход" ставить нельзя.
   */
  async upsertFromLdap(info: LdapUserInfo, options: { touchLogin?: boolean } = {}): Promise<User> {
    const touchLogin = options.touchLogin ?? true;
    const existing = await this.findByUsername(info.username);

    if (existing) {
      return this.prisma.user.update({
        where: { id: existing.id },
        data: {
          fullName: info.fullName,
          email: info.email,
          department: info.department,
          isStaff: info.isStaff,
          ...(touchLogin ? { lastLoginAt: new Date() } : {}),
        },
      });
    }

    return this.prisma.user.create({
      data: {
        username: info.username,
        fullName: info.fullName,
        email: info.email,
        department: info.department,
        isStaff: info.isStaff,
        source: UserSource.LDAP,
        role: UserRole.USER,
        ...(touchLogin ? { lastLoginAt: new Date() } : {}),
      },
    });
  }

  /**
   * Массовая синхронизация всех членов группы сотрудников AD — см. план, п.3. Заодно
   * деактивирует тех, кого убрали из AD-группы (см. план "Обратная синхронизация"): раньше
   * синхронизация была только додавляющей, и человек, уволенный/убранный из группы, оставался
   * активным в Blik бессрочно. source: LDAP в фильтре исключает master/breakglass-аккаунты
   * (у них всегда source: LOCAL) — их синхронизация не касается.
   */
  async syncFromLdap(): Promise<{ synced: number; deactivated: number }> {
    const members = await this.ldapService.fetchStaffGroupMembers();
    const memberUsernames = new Set(members.map((m) => m.username));

    for (const member of members) {
      await this.upsertFromLdap(member, { touchLogin: false });
    }

    const staleStaff = await this.prisma.user.findMany({
      where: { source: UserSource.LDAP, isStaff: true, isActive: true },
      select: { id: true, username: true },
    });
    const toDeactivate = staleStaff.filter((u) => !memberUsernames.has(u.username));

    if (toDeactivate.length > 0) {
      await this.prisma.user.updateMany({
        where: { id: { in: toDeactivate.map((u) => u.id) } },
        data: { isActive: false, isStaff: false },
      });
    }

    return { synced: members.length, deactivated: toDeactivate.length };
  }

  async touchLastLogin(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
    });
  }

  /** Журнал входов — успешные и неудачные попытки (см. план "Журнал входов"). */
  findLoginEvents() {
    return this.prisma.loginEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { user: { select: { fullName: true } } },
    });
  }

  /** Смена роли — доступно сисадмину (проверяется в контроллере guard'ом). */
  async setRole(id: string, role: UserRole): Promise<User> {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('Пользователь не найден');
    // Роль master-аккаунта зафиксирована намеренно: понижение/смена роли breakglass-учётки —
    // источник самозаблокировки системы.
    if (user.isMaster) {
      throw new BadRequestException('Роль master-аккаунта нельзя изменить');
    }

    return this.prisma.user.update({ where: { id }, data: { role } });
  }

  /** Создание локальной (не-AD) учётной записи сисадмином (см. план "Локальные учётки"). */
  async createLocal(params: { username: string; fullName: string; password: string; role: UserRole }): Promise<User> {
    const username = params.username.trim();
    if (username === DELETED_SENTINEL_USERNAME) {
      throw new BadRequestException('Недопустимое имя пользователя');
    }
    const existing = await this.findByUsername(username);
    if (existing) throw new ConflictException('Пользователь с таким логином уже существует');

    const passwordHash = await argon2.hash(params.password, { type: argon2.argon2id });
    return this.prisma.user.create({
      data: {
        username,
        fullName: params.fullName.trim(),
        passwordHash,
        role: params.role,
        source: UserSource.LOCAL,
        isStaff: true, // локальную учётку заводит сисадмин осознанно — все могут работать с заявками
        isActive: true,
      },
    });
  }

  /**
   * Удаление учётной записи с обезличиванием следов (см. план): обязательные FK (автор
   * заявок/картриджей/визитов и т.п.) переназначаются на служебный аккаунт «Удалённый
   * пользователь», nullable-связи обнуляются каскадом схемы, токены/подписки удаляются каскадно.
   */
  async remove(id: string, actorId: string): Promise<void> {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('Пользователь не найден');
    if (user.isMaster) throw new BadRequestException('Master-аккаунт удалить нельзя');
    if (id === actorId) throw new ForbiddenException('Нельзя удалить собственную учётную запись');

    const sentinel = await this.getOrCreateDeletedSentinel();

    await this.prisma.$transaction([
      this.prisma.ticket.updateMany({ where: { createdById: id }, data: { createdById: sentinel.id } }),
      this.prisma.ticketAttachment.updateMany({ where: { uploadedById: id }, data: { uploadedById: sentinel.id } }),
      this.prisma.cartridgeRequest.updateMany({ where: { createdById: id }, data: { createdById: sentinel.id } }),
      this.prisma.cartridgeReport.updateMany({ where: { createdById: id }, data: { createdById: sentinel.id } }),
      this.prisma.refillEvent.updateMany({ where: { createdById: id }, data: { createdById: sentinel.id } }),
      this.prisma.ticketVisit.updateMany({ where: { technicianId: id }, data: { technicianId: sentinel.id } }),
      this.prisma.ticketVisit.updateMany({ where: { createdById: id }, data: { createdById: sentinel.id } }),
      // Задачи в календаре: собственные — удаляем (планы ушедшего сотрудника неактуальны),
      // созданные им для других — переназначаем автора на sentinel, чтобы задача осталась у владельца.
      this.prisma.calendarTask.deleteMany({ where: { ownerId: id } }),
      this.prisma.calendarTask.updateMany({ where: { createdById: id }, data: { createdById: sentinel.id } }),
      this.prisma.user.delete({ where: { id } }),
    ]);
  }

  private async getOrCreateDeletedSentinel(): Promise<User> {
    const existing = await this.prisma.user.findUnique({ where: { username: DELETED_SENTINEL_USERNAME } });
    if (existing) return existing;
    return this.prisma.user.create({
      data: {
        username: DELETED_SENTINEL_USERNAME,
        fullName: 'Удалённый пользователь',
        source: UserSource.LOCAL,
        role: UserRole.USER,
        isActive: false,
        isStaff: false,
      },
    });
  }
}
