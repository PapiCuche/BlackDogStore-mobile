import type { LegacyCatalogPolicy } from '@/config/env';

/**
 * M0.2 — what the composition root actually builds, per environment.
 *
 * `legacyCatalogPolicy` is resolved once at import time, so each case re-imports
 * the module graph with a different policy. That is the only honest way to test
 * a decision that is made at module scope.
 */

const MOCK_POLICY: LegacyCatalogPolicy = {
  source: 'mock',
  decision: 'mock-active',
  reason: 'mocks',
};
const LEGACY_POLICY: LegacyCatalogPolicy = {
  source: 'legacy-api',
  decision: 'legacy-development-explicit',
  reason: 'dev opt-in',
};
const BLOCKED_POLICY: LegacyCatalogPolicy = {
  source: 'none',
  decision: 'legacy-forbidden-release',
  reason: 'release',
};

/**
 * Re-require `@/repositories` with `@/config/env` stubbed to `policy`.
 *
 * `require` inside `jest.isolateModules`, not dynamic `import()`: Jest needs
 * `--experimental-vm-modules` for the latter, and this project has no reason to
 * turn that on.
 */
function loadRepositories(policy: LegacyCatalogPolicy) {
  let repositories!: typeof import('@/repositories').repositories;
  let MockCatalogRepository!: new () => unknown;
  let LegacyApiCatalogRepository!: new () => unknown;

  jest.isolateModules(() => {
    jest.doMock('@/config/env', () => ({
      ...jest.requireActual('@/config/env'),
      legacyCatalogPolicy: policy,
      isLegacyCatalogAllowed: policy.source === 'legacy-api',
      useMockData: policy.source === 'mock',
      isPilotTenant: true,
    }));
    ({ repositories } = require('@/repositories'));
    ({ MockCatalogRepository } = require('@/repositories/mock/mock-catalog-repository'));
    ({ LegacyApiCatalogRepository } = require(
      '@/repositories/api/legacy-api-catalog-repository'
    ));
  });

  return { repositories, MockCatalogRepository, LegacyApiCatalogRepository };
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
    // Regression guard: the gate must not break normal development.
    const { repositories } = loadRepositories(MOCK_POLICY);

    const products = await repositories.catalog!.listProducts({});
    const categories = await repositories.catalog!.listCategories();

    expect(products.length).toBeGreaterThan(0);
    expect(categories.length).toBeGreaterThan(0);
  });

  it('builds the LEGACY repository only for an explicit development opt-in', () => {
    const { repositories, LegacyApiCatalogRepository } = loadRepositories(LEGACY_POLICY);

    expect(repositories.catalog).toBeInstanceOf(LegacyApiCatalogRepository);
  });

  it('builds NO catalogue repository in a release build', () => {
    // The M0.2 fix. Before it, this slot held a LegacyApiCatalogRepository as
    // soon as EXPO_PUBLIC_USE_MOCK_DATA was false.
    const { repositories } = loadRepositories(BLOCKED_POLICY);

    expect(repositories.catalog).toBeNull();
  });

  it('never builds the legacy repository when it is blocked', () => {
    const { repositories, LegacyApiCatalogRepository } = loadRepositories(BLOCKED_POLICY);

    expect(repositories.catalog).not.toBeInstanceOf(LegacyApiCatalogRepository);
  });
});
