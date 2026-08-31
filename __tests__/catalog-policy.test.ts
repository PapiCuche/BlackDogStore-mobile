import { resolveCatalogPolicy, type TenantConfig } from '@/config/env';

/**
 * M2 — where the catalogue comes from, per build.
 *
 * M0.2 answered a different question here: "may this build touch the real
 * endpoint at all?", because the only real endpoint leaked every company's
 * products. That endpoint is gone and so is that question.
 *
 * What replaces it: a release build SHOULD serve the real catalogue, and the
 * only things that stop it are the two facts it cannot invent — which company
 * it is, and where the server lives.
 */

const RESOLVED: TenantConfig = { status: 'resolved', slug: 'acme', source: 'environment' };
const PILOT: TenantConfig = {
  status: 'resolved',
  slug: 'blackdog',
  source: 'development-pilot',
};
const MISSING: TenantConfig = { status: 'missing' };

describe('mocks win when they are on', () => {
  it('serves fixtures and consults nothing else', () => {
    const policy = resolveCatalogPolicy({
      mocksEnabled: true,
      tenant: MISSING,
      apiConfigured: false,
    });

    expect(policy.source).toBe('mock');
    expect(policy.decision).toBe('mock-active');
  });
});

describe('the real catalogue', () => {
  it('is served when the tenant and the API url both resolve', () => {
    const policy = resolveCatalogPolicy({
      mocksEnabled: false,
      tenant: RESOLVED,
      apiConfigured: true,
    });

    expect(policy.source).toBe('api-v1');
    expect(policy.decision).toBe('api-v1-active');
  });

  it('names the tenant in its diagnostic, so Profile cannot be misread', () => {
    const policy = resolveCatalogPolicy({
      mocksEnabled: false,
      tenant: RESOLVED,
      apiConfigured: true,
    });

    expect(policy.reason).toContain('acme');
  });

  it('is served for the pilot too — the pilot is a tenant, not a special case', () => {
    const policy = resolveCatalogPolicy({
      mocksEnabled: false,
      tenant: PILOT,
      apiConfigured: true,
    });

    expect(policy.source).toBe('api-v1');
  });
});

describe('fail-safe', () => {
  it('serves NOTHING when there is no tenant', () => {
    // The failure this prevents: falling back to the pilot slug, and serving
    // Black Dog Store's catalogue inside another company's app.
    const policy = resolveCatalogPolicy({
      mocksEnabled: false,
      tenant: MISSING,
      apiConfigured: true,
    });

    expect(policy.source).toBe('none');
    expect(policy.decision).toBe('unavailable-missing-tenant');
  });

  it('serves NOTHING when there is no API url', () => {
    const policy = resolveCatalogPolicy({
      mocksEnabled: false,
      tenant: RESOLVED,
      apiConfigured: false,
    });

    expect(policy.source).toBe('none');
    expect(policy.decision).toBe('unavailable-missing-api-url');
  });

  it('NEVER falls back to mocks when something is missing', () => {
    // Fabricated products in front of a real customer is worse than an empty
    // screen that says the catalogue is unavailable.
    for (const tenant of [MISSING, RESOLVED]) {
      for (const apiConfigured of [true, false]) {
        const policy = resolveCatalogPolicy({ mocksEnabled: false, tenant, apiConfigured });
        expect(policy.source).not.toBe('mock');
      }
    }
  });

  it('reports the missing tenant BEFORE the missing url', () => {
    // Both are wrong; the tenant is the one that would cause a wrong-company
    // catalogue rather than merely no catalogue.
    const policy = resolveCatalogPolicy({
      mocksEnabled: false,
      tenant: MISSING,
      apiConfigured: false,
    });

    expect(policy.decision).toBe('unavailable-missing-tenant');
  });

  it('explains itself in the reason, for Profile', () => {
    expect(
      resolveCatalogPolicy({ mocksEnabled: false, tenant: MISSING, apiConfigured: true }).reason,
    ).toContain('EXPO_PUBLIC_COMPANY_SLUG');
    expect(
      resolveCatalogPolicy({ mocksEnabled: false, tenant: RESOLVED, apiConfigured: false }).reason,
    ).toContain('EXPO_PUBLIC_API_BASE_URL');
  });
});

describe('there is no legacy escape hatch left', () => {
  it('has no source that is neither mock, api-v1 nor none', () => {
    const sources = new Set<string>();
    for (const mocksEnabled of [true, false]) {
      for (const tenant of [RESOLVED, PILOT, MISSING]) {
        for (const apiConfigured of [true, false]) {
          sources.add(resolveCatalogPolicy({ mocksEnabled, tenant, apiConfigured }).source);
        }
      }
    }

    expect(sources).toEqual(new Set(['mock', 'api-v1', 'none']));
  });

  it('does not read any environment flag to decide', () => {
    // M0.2's decision depended on EXPO_PUBLIC_ENABLE_LEGACY_CATALOG. Nothing
    // does now: the inputs are the three arguments and nothing else.
    process.env.EXPO_PUBLIC_ENABLE_LEGACY_CATALOG = 'true';
    const policy = resolveCatalogPolicy({
      mocksEnabled: false,
      tenant: RESOLVED,
      apiConfigured: true,
    });
    delete process.env.EXPO_PUBLIC_ENABLE_LEGACY_CATALOG;

    expect(policy.source).toBe('api-v1');
  });
});
