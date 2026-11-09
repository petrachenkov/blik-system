import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client, InvalidCredentialsError, type ClientOptions, type Entry } from 'ldapts';
import { readFileSync } from 'node:fs';
import type { Env } from '../../config/env.schema.js';

export interface LdapUserInfo {
  username: string;
  fullName: string;
  email?: string;
  department?: string;
  isStaff: boolean;
}

const USER_ATTRIBUTES = ['samaccountname', 'displayname', 'mail', 'department', 'useraccountcontrol'];

function normalizeAttributes(entry: Entry): Record<string, Entry[string]> {
  return Object.fromEntries(Object.entries(entry).map(([name, value]) => [name.toLowerCase(), value]));
}

function isDisabled(attributes: ReturnType<typeof normalizeAttributes>): boolean {
  const flags = Number(attributes.useraccountcontrol);
  return Number.isFinite(flags) && (flags & 0x2) !== 0;
}

function readUserInfo(attributes: ReturnType<typeof normalizeAttributes>, isStaff: boolean): LdapUserInfo {
  const username = String(attributes.samaccountname ?? '').trim();
  if (!username) throw new Error('LDAP вернул запись без sAMAccountName');
  return {
    username,
    fullName: String(attributes.displayname ?? '').trim() || username,
    email: String(attributes.mail ?? '') || undefined,
    department: String(attributes.department ?? '') || undefined,
    isStaff,
  };
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
    const address = new URL(url);
    const rejectUnauthorized = this.config.get('LDAP_TLS_REJECT_UNAUTHORIZED', { infer: true });
    const caPath = this.config.get('LDAP_TLS_CA_PATH', { infer: true });
    // ldapts включает TLS даже для ldap://, если передать tlsOptions.
    // Для настроек с CA или явным портом LDAPS сохраняем защищённое подключение.
    const useTls = address.protocol === 'ldaps:' || address.port === '636' || Boolean(caPath);

    return {
      url,
      connectTimeout: 5000,
      timeout: 5000,
      ...(useTls ? {
        tlsOptions: { rejectUnauthorized, ...(caPath ? { ca: [readFileSync(caPath)] } : {}) },
      } : {}),
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

    let client: Client | undefined;
    try {
      const options = this.buildClientOptions();
      client = new Client(options);
      await client.bind(bindDn, bindPassword);

      const safeUsername = escapeLdapFilterValue(username);
      const { searchEntries } = await client.search(baseDn, {
        scope: 'sub',
        filter: `(&(objectClass=user)(sAMAccountName=${safeUsername}))`,
        attributes: [...USER_ATTRIBUTES, 'memberof'],
      });

      if (searchEntries.length === 0) {
        this.logger.warn(`LDAP: пользователь "${username}" не найден`);
        return null;
      }

      const entry = searchEntries[0];
      const attributes = normalizeAttributes(entry);

      // ACCOUNTDISABLE = 0x2. Если бит установлен — учётка отключена в AD.
      if (isDisabled(attributes)) {
        this.logger.warn(`LDAP: учётная запись "${username}" отключена в AD`);
        return null;
      }

      // Повторный bind под найденным DN — проверка пароля.
      const userClient = new Client(options);
      try {
        await userClient.bind(entry.dn, password);
      } catch (error) {
        if (!(error instanceof InvalidCredentialsError)) throw error;
        this.logger.warn(`LDAP: неверный пароль для "${username}"`);
        return null;
      } finally {
        await userClient.unbind().catch(() => undefined);
      }

      const memberOf = [attributes.memberof ?? []].flat();
      const isStaff = memberOf.some(
        (group) => String(group).toLowerCase() === staffGroupDn.toLowerCase(),
      );

      // Канонический sAMAccountName из AD, а не то, что человек набрал в форме логина —
      // иначе разный регистр/написание при входе создаёт второй дублирующий аккаунт вместо
      // того, чтобы найти уже существующего пользователя (в т.ч. заведённого через
      // «Подтянуть сотрудников из AD», где username берётся из entry.sAMAccountName так же).
      return readUserInfo(attributes, isStaff);
    } catch (error) {
      this.logger.error('Ошибка обращения к LDAP-серверу', error instanceof Error ? error.stack : error);
      throw new ServiceUnavailableException('Сервер каталога недоступен, попробуйте позже');
    } finally {
      await client?.unbind().catch(() => undefined);
    }
  }

  /**
   * Лёгкая проверка связи с сервером каталога для страницы здоровья системы (см. план):
   * bind сервисной учёткой + unbind, без поиска. Не бросает — возвращает результат.
   */
  async checkConnection(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const startedAt = Date.now();
    let client: Client | undefined;
    try {
      client = new Client(this.buildClientOptions());
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
      await client?.unbind().catch(() => undefined);
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

    let client: Client | undefined;
    try {
      client = new Client(this.buildClientOptions());
      await client.bind(bindDn, bindPassword);

      const safeGroupDn = escapeLdapFilterValue(staffGroupDn);
      // objectCategory=person исключает компьютерные и другие не-персональные объекты,
      // у которых в AD тоже formально objectClass=user (проверенный фильтр из вашей инфраструктуры).
      const { searchEntries } = await client.search(baseDn, {
        scope: 'sub',
        paged: true,
        filter: `(&(objectCategory=person)(objectClass=user)(memberOf=${safeGroupDn}))`,
        attributes: USER_ATTRIBUTES,
      });

      return searchEntries
        .map(normalizeAttributes)
        .filter((attributes) => !isDisabled(attributes))
        .map((attributes) => readUserInfo(attributes, true));
    } catch (error) {
      this.logger.error('Ошибка синхронизации сотрудников из LDAP', error instanceof Error ? error.stack : error);
      throw new ServiceUnavailableException('Сервер каталога недоступен, попробуйте позже');
    } finally {
      await client?.unbind().catch(() => undefined);
    }
  }
}
