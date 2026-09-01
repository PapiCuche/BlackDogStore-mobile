import { QueryClient } from '@tanstack/react-query';

import {
  clearPrivateQueries,
  clearTenantQueries,
  queryKeys,
} from '@/providers/query-client';
import {
  belongsToTenant,
  isPrivateQueryKey,
  makeQueryScope,
  UNSCOPED_TENANT,
} from '@/providers/query-scope';

/**
 * DEC-MOBILE-002 — tenant- and user-scoped server-state cache.
 *
 * The failures these prevent need no backend bug. The cache alone is enough:
 *
 *   Company A's catalogue answering a request from Company B's build.
 *   User A's orders still in memory when User B signs in.
 */

/**
 * Every client built here is torn down afterwards.
 *
 * A `QueryClient` holds a gcTime timer per cached query, and those keep Node's
 * event loop alive — Jest then reports "did not exit one second after the test
 * run", and CI hangs rather than failing.
 */
const clients: QueryClient[] = [];

function makeClient(): QueryClient {
  const client = new QueryClient();
  clients.push(client);
  return client;
}

afterEach(() => {
  for (const client of clients.splice(0)) client.clear();
});

const companyA = makeQueryScope({ tenantSlug: 'blackdog', userId: 42 });
const companyB = makeQueryScope({ tenantSlug: 'otra-empresa', userId: 42 });
const userA = makeQueryScope({ tenantSlug: 'blackdog', userId: 42 });
const userB = makeQueryScope({ tenantSlug: 'blackdog', userId: 77 });
const anonymous = makeQueryScope({ tenantSlug: 'blackdog', userId: null });

describe('tenant isolation', () => {
  it('separates product keys across companies', () => {
    expect(queryKeys.products(companyA)).not.toEqual(queryKeys.products(companyB));
  });

  it('separates categories, product detail and brand across companies', () => {
    expect(queryKeys.categories(companyA)).not.toEqual(queryKeys.categories(companyB));
    expect(queryKeys.product(companyA, 'iphone')).not.toEqual(
      queryKeys.product(companyB, 'iphone'),
    );
    expect(queryKeys.companyBrand(companyA)).not.toEqual(queryKeys.companyBrand(companyB));
  });

  it('separates orders and repairs across companies', () => {
    expect(queryKeys.orders(companyA)).not.toEqual(queryKeys.orders(companyB));
    expect(queryKeys.repairs(companyA)).not.toEqual(queryKeys.repairs(companyB));
  });

  it('namespaces every tenant key under the tenant segment', () => {
    for (const key of [
      queryKeys.products(companyA),
      queryKeys.categories(companyA),
      queryKeys.companyBrand(companyA),
      queryKeys.orders(companyA),
      queryKeys.repairs(companyA),
    ]) {
      expect(key[0]).toBe('tenant');
      expect(key[1]).toBe('blackdog');
      expect(belongsToTenant(key, 'blackdog')).toBe(true);
      expect(belongsToTenant(key, 'otra-empresa')).toBe(false);
    }
  });

  it('falls back to an explicit unscoped namespace when no tenant is configured', () => {
    const unconfigured = makeQueryScope({ tenantSlug: null, userId: 1 });
    expect(unconfigured.tenant).toBe(UNSCOPED_TENANT);
    // Still namespaced — never sharing a key with a real tenant.
    expect(queryKeys.products(unconfigured)).not.toEqual(queryKeys.products(companyA));
  });

  it('normalises the slug so casing cannot fork the cache', () => {
    const upper = makeQueryScope({ tenantSlug: '  BlackDog ', userId: 42 });
    expect(queryKeys.products(upper)).toEqual(queryKeys.products(companyA));
  });
});

describe('user isolation', () => {
  it('separates orders across users of the same company', () => {
    expect(queryKeys.orders(userA)).not.toEqual(queryKeys.orders(userB));
  });

  it('separates repairs and detail views across users', () => {
    expect(queryKeys.repairs(userA)).not.toEqual(queryKeys.repairs(userB));
    expect(queryKeys.order(userA, 1042)).not.toEqual(queryKeys.order(userB, 1042));
    expect(queryKeys.repair(userA, 96)).not.toEqual(queryKeys.repair(userB, 96));
  });

  it('gives anonymous its own bucket, never a signed-in user’s', () => {
    expect(queryKeys.orders(anonymous)).not.toEqual(queryKeys.orders(userA));
    expect(queryKeys.orders(anonymous)[3]).toBe('anonymous');
  });

  it('does NOT user-scope public tenant data', () => {
    // Catalogue and brand are the same for everyone in a company. Scoping them
    // per user would multiply the cache and re-download the shop on every login.
    expect(queryKeys.products(userA)).toEqual(queryKeys.products(userB));
    expect(queryKeys.companyBrand(userA)).toEqual(queryKeys.companyBrand(userB));
  });

  it('uses the stable id, never the email', () => {
    const key = queryKeys.orders(userA);
    expect(key).toContain('42');
    expect(JSON.stringify(key)).not.toContain('@');
  });
});

describe('isPrivateQueryKey', () => {
  it('recognises private keys by shape, with no registry to forget', () => {
    expect(isPrivateQueryKey(queryKeys.orders(userA))).toBe(true);
    expect(isPrivateQueryKey(queryKeys.repairs(userA))).toBe(true);
    expect(isPrivateQueryKey(queryKeys.order(userA, 1))).toBe(true);
  });

  it('does not classify public tenant data as private', () => {
    expect(isPrivateQueryKey(queryKeys.products(userA))).toBe(false);
    expect(isPrivateQueryKey(queryKeys.categories(userA))).toBe(false);
    expect(isPrivateQueryKey(queryKeys.companyBrand(userA))).toBe(false);
  });
});

describe('clearPrivateQueries', () => {
  function seed() {
    const client = makeClient();
    client.setQueryData(queryKeys.orders(userA), [{ id: 1042 }]);
    client.setQueryData(queryKeys.repairs(userA), [{ id: 'r-1' }]);
    client.setQueryData(queryKeys.products(userA), [{ id: 101 }]);
    client.setQueryData(queryKeys.companyBrand(userA), { name: 'Black Dog Store' });
    return client;
  }

  it('removes orders and repairs', async () => {
    const client = seed();

    await clearPrivateQueries(client);

    expect(client.getQueryData(queryKeys.orders(userA))).toBeUndefined();
    expect(client.getQueryData(queryKeys.repairs(userA))).toBeUndefined();
  });

  it('leaves public tenant data alone', async () => {
    const client = seed();

    await clearPrivateQueries(client);

    // Nothing personal in the catalogue; dropping it would re-download the shop
    // on every sign-out for no security benefit.
    expect(client.getQueryData(queryKeys.products(userA))).toBeDefined();
    expect(client.getQueryData(queryKeys.companyBrand(userA))).toBeDefined();
  });

  it('leaves nothing for the next user to read', async () => {
    const client = seed();

    await clearPrivateQueries(client);

    // The scenario: User A signs out, User B signs in on the same device.
    expect(client.getQueryData(queryKeys.orders(userB))).toBeUndefined();
    const remaining = client.getQueryCache().getAll().map((query) => query.queryKey);
    expect(remaining.filter(isPrivateQueryKey)).toHaveLength(0);
  });

  it('cancels private requests in flight', async () => {
    const client = makeClient();
    const cancelSpy = jest.spyOn(client, 'cancelQueries');

    await clearPrivateQueries(client);

    // Cancelling matters as much as removing: an in-flight request for the
    // previous user would land afterwards and repopulate what was just cleared.
    expect(cancelSpy).toHaveBeenCalledTimes(1);
  });
});

describe('clearTenantQueries — future company switch', () => {
  it('removes the whole namespace of the previous company', async () => {
    const client = makeClient();
    client.setQueryData(queryKeys.products(companyA), [{ id: 101 }]);
    client.setQueryData(queryKeys.orders(companyA), [{ id: 1 }]);
    client.setQueryData(queryKeys.companyBrand(companyA), { name: 'A' });
    client.setQueryData(queryKeys.products(companyB), [{ id: 999 }]);

    await clearTenantQueries(client, 'blackdog');

    expect(client.getQueryData(queryKeys.products(companyA))).toBeUndefined();
    expect(client.getQueryData(queryKeys.orders(companyA))).toBeUndefined();
    expect(client.getQueryData(queryKeys.companyBrand(companyA))).toBeUndefined();
    // The other company is untouched.
    expect(client.getQueryData(queryKeys.products(companyB))).toBeDefined();
  });
});

describe('cache key security', () => {
  const everyKey = [
    queryKeys.products(userA, { search: 'iphone', categorySlug: 'mac' }),
    queryKeys.product(userA, 'iphone-15'),
    queryKeys.categories(userA),
    queryKeys.companyBrand(userA),
    queryKeys.orders(userA),
    queryKeys.order(userA, 1042),
    queryKeys.repairs(userA),
    queryKeys.repair(userA, 79),
  ];

  it('never puts a credential in a query key', () => {
    // Query keys are printed by devtools, logged and serialized.
    for (const key of everyKey) {
      const serialized = JSON.stringify(key).toLowerCase();
      expect(serialized).not.toContain('token');
      expect(serialized).not.toContain('bearer');
      expect(serialized).not.toContain('password');
      expect(serialized).not.toContain('authorization');
    }
  });

  it('contains only primitives — nothing that could smuggle an object in', () => {
    // Numbers are fine (an order id is a number); objects are not, because a
    // whole session or a header bag could ride along inside one.
    for (const key of everyKey) {
      for (const segment of key) {
        expect(['string', 'number']).toContain(typeof segment);
      }
    }
  });
});
