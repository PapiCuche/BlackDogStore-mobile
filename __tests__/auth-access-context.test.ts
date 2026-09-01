import { toAccessContexts, toPlatformContext } from '@/api/endpoints/auth-v1';
import {
  getAccessContext,
  hasUxCapability,
  isCustomerInTenant,
  isMemberInTenant,
  isPlatformMaster,
  type AuthSession,
} from '@/auth/types';

/**
 * M6 — the access context the backend has sent since M4.
 *
 * Mobile discarded it until now: `IdentityWire` did not declare it,
 * `SessionSnapshot` did not carry it, and `AuthSession` had nowhere to put it.
 * The documentation said it was integrated. It was not.
 *
 * These tests exist so that cannot happen quietly again.
 */

const WIRE = [
  {
    company: { slug: 'blackdog', name: 'Black Dog Store' },
    customer: true,
    member: true,
    capabilities: ['sales.orders.view', 'sales.orders.manage'],
  },
  {
    company: { slug: 'otra', name: 'Otra Empresa' },
    customer: false,
    member: true,
    capabilities: ['inventory.view'],
  },
];

function sessionWith(contexts: unknown, isMaster = false): AuthSession {
  return {
    user: {
      id: 1, username: 'x', email: 'x@y.z', firstName: 'X', lastName: '',
      role: 'customer', isEmailVerified: true,
    },
    mode: 'backend',
    accessContexts: toAccessContexts(contexts as never),
    platform: { isMaster },
    expiresAt: null,
    tenant: null,
  };
}

describe('mapping the wire', () => {
  it('maps a full context', () => {
    const [first] = toAccessContexts(WIRE as never);

    expect(first).toEqual({
      company: { slug: 'blackdog', name: 'Black Dog Store' },
      customer: true,
      member: true,
      capabilities: ['sales.orders.view', 'sales.orders.manage'],
    });
  });

  it('maps several tenants independently', () => {
    const contexts = toAccessContexts(WIRE as never);

    expect(contexts.map((c) => c.company.slug)).toEqual(['blackdog', 'otra']);
    expect(contexts[1]!.customer).toBe(false);
  });

  it('maps platform master', () => {
    expect(toPlatformContext({ is_master: true })).toEqual({ isMaster: true });
  });

  it('treats a MISSING access_contexts as no access, not a crash', () => {
    // A staging server on an older build would omit it entirely.
    expect(toAccessContexts(undefined)).toEqual([]);
  });

  it('treats a missing platform block as NOT master', () => {
    expect(toPlatformContext(undefined)).toEqual({ isMaster: false });
  });

  it('requires customer and member to be STRICTLY true', () => {
    // An absent flag is not a grant, and neither is a truthy string.
    const [row] = toAccessContexts([
      { company: { slug: 'x', name: 'X' }, customer: 'yes', capabilities: [] },
    ] as never);

    expect(row!.customer).toBe(false);
    expect(row!.member).toBe(false);
  });

  it('requires is_master to be STRICTLY true', () => {
    expect(toPlatformContext({ is_master: 'yes' } as never).isMaster).toBe(false);
  });

  it('drops a row with no company slug', () => {
    expect(toAccessContexts([{ customer: true, member: true }] as never)).toEqual([]);
  });

  it('survives a capabilities field that is not an array', () => {
    const [row] = toAccessContexts([
      { company: { slug: 'x', name: 'X' }, member: true, capabilities: 'todas' },
    ] as never);

    expect(row!.capabilities).toEqual([]);
  });

  it('PRESERVES a capability this build has never heard of', () => {
    // The catalogue lives on the server and grows there. Filtering against a
    // local list would hide a module the day the backend adds one.
    const [row] = toAccessContexts([
      { company: { slug: 'x', name: 'X' }, member: true, capabilities: ['modulo.futuro'] },
    ] as never);

    expect(row!.capabilities).toEqual(['modulo.futuro']);
  });
});

describe('reading a session', () => {
  const session = sessionWith(WIRE);

  it('finds the context for one company', () => {
    expect(getAccessContext(session, 'blackdog')?.company.name).toBe('Black Dog Store');
  });

  it('matches the slug case-insensitively', () => {
    expect(getAccessContext(session, 'BLACKDOG')).not.toBeNull();
  });

  it('returns null for a company with no relation', () => {
    expect(getAccessContext(session, 'desconocida')).toBeNull();
  });

  it('returns null for a null session', () => {
    expect(getAccessContext(null, 'blackdog')).toBeNull();
  });

  it('reports customer and member INDEPENDENTLY', () => {
    // The same person can buy from a company and work for it.
    expect(isCustomerInTenant(session, 'blackdog')).toBe(true);
    expect(isMemberInTenant(session, 'blackdog')).toBe(true);
    expect(isCustomerInTenant(session, 'otra')).toBe(false);
    expect(isMemberInTenant(session, 'otra')).toBe(true);
  });

  it('does not leak a capability across tenants', () => {
    expect(hasUxCapability(session, 'blackdog', 'sales.orders.view')).toBe(true);
    expect(hasUxCapability(session, 'otra', 'sales.orders.view')).toBe(false);
  });

  it('reports platform master separately from any company', () => {
    expect(isPlatformMaster(session)).toBe(false);
    expect(isPlatformMaster(sessionWith([], true))).toBe(true);
  });

  it('a platform master with NO contexts is still not a member anywhere', () => {
    // Being a platform administrator is not membership of every tenant.
    const master = sessionWith([], true);

    expect(isMemberInTenant(master, 'blackdog')).toBe(false);
    expect(isCustomerInTenant(master, 'blackdog')).toBe(false);
  });

  it('a coarse ROLE alone creates no access', () => {
    // `user.role` says what someone is called, not which company they belong to.
    const admin = sessionWith([]);
    admin.user.role = 'admin';

    expect(isMemberInTenant(admin, 'blackdog')).toBe(false);
    expect(hasUxCapability(admin, 'blackdog', 'sales.orders.view')).toBe(false);
  });

  it('an empty context list denies everything', () => {
    const empty = sessionWith([]);

    expect(isMemberInTenant(empty, 'blackdog')).toBe(false);
    expect(hasUxCapability(empty, 'blackdog', 'cualquiera')).toBe(false);
  });
});
