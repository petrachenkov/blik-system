import { Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client, type ClientOptions } from 'ldapts';
import { readFileSync } from 'node:fs';
import type { Env } from '../../config/env.schema.js';

export interface LdapUserInfo {
  username: string;
  fullName: string;
  email?: string;
  department?: string;
  isStaff: boolean;
}

// Экранирует спецсимволы LDAP-фильтра (RFC 4515: \, *, (, ), NUL), чтобы исключить
// LDAP-инъекцию через логин или через DN, подставляемый в фильтр (например, LDAP_STAFF_GROUP_DN).
// Пробел НЕ экранируется — по RFC 4515 в этом нет необходимости, и DN с пробелом в имени OU
// (например, "OU=ИТ Админ") проходит как есть.
function escapeLdapFilterValue(value: string): string {
  return value.replace(/[\\*()\0]/g, (char) => {
    switch (char) {
      case '\\':
        return '\\5c';
      case '*':
        return '\\2a';
      case '(':
        return '\\28';
      case ')':
        return '\\29';
      default:
        return '\\00';
    }
  });
}

@Injectable()
export class LdapService {
  private readonly logger = new Logger(LdapService.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  /**
   * Общие опции клиента для всех подключений — важен tlsOptions для ldaps:// с сертификатом
   * от внутреннего CA колледжа (Node не доверяет ему по умолчанию, см. LDAP_TLS_* в схеме env).
   */
  private buildClientOptions(): ClientOptions {
    const url = this.config.get('LDAP_URL', { infer: true });
    const rejectUnauthorized = this.config.get('LDAP_TLS_REJECT_UNAUTHORIZED', { infer: true });
    const caPath = this.config.get('LDAP_TLS_CA_PATH', { infer: true });

    return {
      url,
      connectTimeout: 5000,
      tlsOptions: {
        rejectUnauthorized,
        ...(caPath ? { ca: [readFileSync(caPath)] } : {}),
      },
    };
  }

  /**
   * Проверяет логин/пароль в Active Directory и возвращает данные пользователя, если:
   *  1) пользователь с таким sAMAccountName найден,
   *  2) он состоит в группе сотрудников (LDAP_STAFF_GROUP_DN) ИЛИ вообще существует в AD
   *     (isStaff выставляется отдельно — не сотрудники не смогут создавать заявки, но могут
   *     существовать в системе как обычные пользователи, если появится такая необходимость),
   *  3) пароль верный (повторный bind найденным DN).
   * Возвращает null, если пользователь не найден или пароль неверный.
   */
  async verifyCredentials(username: string, password: string): Promise<LdapUserInfo | null> {
    if (!username || !password) return null;

    const bindDn = this.config.get('LDAP_BIND_DN', { infer: true });
    const bindPassword = this.config.get('LDAP_BIND_PASSWORD', { infer: true });
    const baseDn = this.config.get('LDAP_BASE_DN', { infer: true });
    const staffGroupDn = this.config.get('LDAP_STAFF_GROUP_DN', { infer: true });

    const client = new Client(this.buildClientOptions());

    try {
      await client.bind(bindDn, bindPassword);

      const safeUsername = escapeLdapFilterValue(username);
      const { searchEntries } = await client.search(baseDn, {
        scope: 'sub',
        filter: `(&(objectClass=user)(sAMAccountName=${safeUsername}))`,
        attributes: ['dn', 'sAMAccountName', 'displayName', 'mail', 'department', 'memberOf', 'userAccountControl'],
      });

      if (searchEntries.length === 0) {
        this.logger.warn(`LDAP: пользователь "${username}" не найден`);
        return null;
      }

      const entry = searchEntries[0];
      const userDn = entry.dn;

      // ACCOUNTDISABLE = 0x2. Если бит установлен — учётка отключена в AD.
      const uac = Number(entry.userAccountControl ?? 0);
      if (Number.isFinite(uac) && (uac & 0x2) !== 0) {
        this.logger.warn(`LDAP: учётная запись "${username}" отключена в AD`);
        return null;
      }

      // Повторный bind под найденным DN — проверка пароля.
      const userClient = new Client(this.buildClientOptions());
      try {
        await userClient.bind(userDn, password);
      } catch {
        this.logger.warn(`LDAP: неверный пароль для "${username}"`);
        return null;
      } finally {
        await userClient.unbind().catch(() => undefined);
      }

      const memberOf = Array.isArray(entry.memberOf)
        ? entry.memberOf
        : entry.memberOf
          ? [entry.memberOf]
          : [];
      const isStaff = memberOf.some(
        (group) => String(group).toLowerCase() === staffGroupDn.toLowerCase(),
      );

      // Канонический sAMAccountName из AD, а не то, что человек набрал в форме логина —
      // иначе разный регистр/написание при входе создаёт второй дублирующий аккаунт вместо
      // того, чтобы найти уже существующего пользователя (в т.ч. заведённого через
      // «Подтянуть сотрудников из AD», где username берётся из entry.sAMAccountName так же).
      const canonicalUsername = String(entry.sAMAccountName ?? username);

      return {
        username: canonicalUsername,
        fullName: String(entry.displayName ?? canonicalUsername),
        email: entry.mail ? String(entry.mail) : undefined,
        department: entry.department ? String(entry.department) : undefined,
        isStaff,
      };
    } catch (error) {
      this.logger.error('Ошибка обращения к LDAP-серверу', error instanceof Error ? error.stack : error);
      throw new UnauthorizedException('Сервер каталога недоступен, попробуйте позже');
    } finally {
      await client.unbind().catch(() => undefined);
    }
  }

  /**
   * Лёгкая проверка связи с сервером каталога для страницы здоровья системы (см. план):
   * bind сервисной учёткой + unbind, без поиска. Не бросает — возвращает результат.
   */
  async checkConnection(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const startedAt = Date.now();
    const client = new Client(this.buildClientOptions());
    try {
      await client.bind(
        this.config.get('LDAP_BIND_DN', { infer: true }),
        this.config.get('LDAP_BIND_PASSWORD', { infer: true }),
      );
      return { ok: true, latencyMs: Date.now() - startedAt };
    } catch (error) {
      return {
        ok: false,
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      await client.unbind().catch(() => undefined);
    }
  }

  /**
   * Тянет всех членов группы сотрудников (LDAP_STAFF_GROUP_DN) разом — для кнопки
   * «Подтянуть сотрудников из AD» (см. план): без этого пользователь появляется в Blik
   * только после первого личного входа, из-за чего его нельзя выбрать получателем рассылки
   * заранее. Проверка членства — та же (прямое вхождение в memberOf), что и в verifyCredentials,
   * для консистentности между входом и синхронизацией.
   */
  async fetchStaffGroupMembers(): Promise<LdapUserInfo[]> {
    const bindDn = this.config.get('LDAP_BIND_DN', { infer: true });
    const bindPassword = this.config.get('LDAP_BIND_PASSWORD', { infer: true });
    const baseDn = this.config.get('LDAP_BASE_DN', { infer: true });
    const staffGroupDn = this.config.get('LDAP_STAFF_GROUP_DN', { infer: true });

    const client = new Client(this.buildClientOptions());

    try {
      await client.bind(bindDn, bindPassword);

      const safeGroupDn = escapeLdapFilterValue(staffGroupDn);
      // objectCategory=person исключает компьютерные и другие не-персональные объекты,
      // у которых в AD тоже formально objectClass=user (проверенный фильтр из вашей инфраструктуры).
      const { searchEntries } = await client.search(baseDn, {
        scope: 'sub',
        filter: `(&(objectCategory=person)(objectClass=user)(memberOf=${safeGroupDn}))`,
        attributes: ['sAMAccountName', 'displayName', 'mail', 'department', 'userAccountControl'],
      });

      return searchEntries
        .filter((entry) => {
          const uac = Number(entry.userAccountControl ?? 0);
          return !(Number.isFinite(uac) && (uac & 0x2) !== 0); // пропускаем отключённые в AD учётки
        })
        .map((entry) => ({
          username: String(entry.sAMAccountName),
          fullName: String(entry.displayName ?? entry.sAMAccountName),
          email: entry.mail ? String(entry.mail) : undefined,
          department: entry.department ? String(entry.department) : undefined,
          isStaff: true,
        }));
    } catch (error) {
      this.logger.error('Ошибка синхронизации сотрудников из LDAP', error instanceof Error ? error.stack : error);
      throw new ServiceUnavailableException('Сервер каталога недоступен, попробуйте позже');
    } finally {
      await client.unbind().catch(() => undefined);
    }
  }
}
