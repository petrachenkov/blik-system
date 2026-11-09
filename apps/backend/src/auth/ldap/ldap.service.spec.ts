import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Client } from 'ldapts';
import { LdapService } from './ldap.service.js';

vi.mock('ldapts', () => ({
  Client: vi.fn(class {
    bind = vi.fn().mockResolvedValue(undefined);
    unbind = vi.fn().mockResolvedValue(undefined);
  }),
}));

function createService(url: string) {
  const config: Record<string, unknown> = {
    LDAP_URL: url,
    LDAP_BIND_DN: 'cn=service,dc=test',
    LDAP_BIND_PASSWORD: 'test-only',
    LDAP_TLS_REJECT_UNAUTHORIZED: true,
  };
  return new LdapService({ get: (key: string) => config[key] } as never);
}

describe('LdapService transport', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses plain LDAP when the URL specifies ldap:// on the LDAP port', async () => {
    const url = 'ldap://directory.test:389';
    expect(await createService(url).checkConnection()).toMatchObject({ ok: true });
    expect(Client).toHaveBeenCalledWith({ url, connectTimeout: 5000, timeout: 5000 });
  });

  it.each(['ldaps://directory.test', 'ldap://directory.test:636'])(
    'uses TLS with certificate validation for %s',
    async (url) => {
      expect(await createService(url).checkConnection()).toMatchObject({ ok: true });
      expect(Client).toHaveBeenCalledWith(expect.objectContaining({ url, tlsOptions: { rejectUnauthorized: true } }));
    },
  );
});
