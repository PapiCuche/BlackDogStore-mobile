import type { CatalogPolicy } from '@/config/env';

/**
 * What the composition root actually builds, per configuration.
 *
 * `catalogPolicy` is resolved once at import time, so each case re-imports the
 * module graph with a different policy. That is the only honest way to test a
 * decision made at module scope.
 *
 * M2 rewrote this file. It used to assert that a release build got NO catalogue,
 * because the only real endpoint leaked every company's products. Now a release
 * build gets the tenant-safe one — and the cases that must still produce nothing
 * are the ones where this build cannot name a storefront at all.
 */

const MOCK_POLICY: CatalogPolicy = {
  source: 'mock',
  decision: 'mock-active',
  reason: 'mocks',
};
const V1_POLICY: CatalogPolicy = {
  source: 'api-v1',
  decision: 'api-v1-active',
  reason: 'real',
};
const NO_TENANT_POLICY: CatalogPolicy = {
  source: 'none',
  decision: 'unavailable-missing-tenant',
  reason: 'sin empresa',
};
const NO_API_POLICY: CatalogPolicy = {
  source: 'none',
  decision: 'unavailable-missing-api-url',
  reason: 'sin API',
};

/**
 * Re-require `@/repositories` with `@/config/env` stubbed to `policy`.
 *
 * `require` inside `jest.isolateModules`, not dynamic `import()`: Jest needs
 * `--experimental-vm-modules` for the latter, and this project has no reason to
 * turn that on.
 */
function loadRepositories(policy: CatalogPolicy) {
  let repositories!: typeof import('@/repositories').repositories;
  let MockCatalogRepository!: new () => unknown;
  let V1ApiCatalogRepository!: new () => unknown;

  jest.isolateModules(() => {
    jest.doMock('@/config/env', () => ({
      ...jest.requireActual('@/config/env'),
      catalogPolicy: policy,
      isRealCatalogActive: policy.source === 'api-v1',
      useMockData: policy.source === 'mock',
      isPilotTenant: true,
    }));
    ({ repositories } = require('@/repositories'));
    ({ MockCatalogRepository } = require('@/repositories/mock/mock-catalog-repository'));
    ({ V1ApiCatalogRepository } = require('@/repositories/api/v1-api-catalog-repository'));
  });

  return { repositories, MockCatalogRepository, V1ApiCatalogRepository };
}

afterEach(() => {
  jest.resetModules();
  jest.dontMock('@/config/env');
});

describe('composition root — catalogue', () => {
  it('builds the MOCK repository when mocks are active', () => {
    const { repositories, MockCatalogRepository } = loadRepositories(MOCK_POLICY);

    expect(repositories.catalog).toBeInstanceOf(MockCatalogRepository);
  });

  it('keeps the mock catalogue fully working', async () => {
    // Regression guard: none of this may break normal development.
    const { repositories } = loadRepositories(MOCK_POLICY);

    const products = await repositories.catalog!.listProducts({});
    const categories = await repositories.catalog!.listCategories();

    expect(products.length).toBeGreaterThan(0);
    expect(categories.length).toBeGreaterThan(0);
  });

  it('builds the REAL v1 repository when the tenant and API url resolve', () => {
    const { repositories, V1ApiCatalogRepository } = loadRepositories(V1_POLICY);

    expect(repositories.catalog).toBeInstanceOf(V1ApiCatalogRepository);
  });

  it('builds NO catalogue when this build has no tenant', () => {
    // The failure this prevents: falling back to the pilot's slug and serving
    // Black Dog Store's catalogue inside another company's app.
    const { repositories } = loadRepositories(NO_TENANT_POLICY);

    expect(repositories.catalog).toBeNull();
  });

  it('builds NO catalogue when there is no API url', () => {
    const { repositories } = loadRepositories(NO_API_POLICY);

    expect(repositories.catalog).toBeNull();
  });

  it('never falls back to MOCKS when the real catalogue is unavailable', () => {
    // Fabricated products shown to real customers is a worse outcome than an
    // empty screen that says so.
    for (const policy of [NO_TENANT_POLICY, NO_API_POLICY]) {
      const { repositories, MockCatalogRepository } = loadRepositories(policy);
      expect(repositories.catalog).not.toBeInstanceOf(MockCatalogRepository);
    }
  });

  it('the legacy catalogue module no longer exists', () => {
    // M2 deleted it rather than switching it off. A second, unsafe path that
    // still exists is a path that eventually gets used.
    expect(() => require('@/repositories/api/legacy-api-catalog-repository')).toThrow();
    expect(() => require('@/api/endpoints/legacy-catalog')).toThrow();
    expect(() => require('@/api/legacy-catalog-guard')).toThrow();
  });
});
