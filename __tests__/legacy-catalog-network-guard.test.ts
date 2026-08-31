import type { LegacyCatalogPolicy } from '@/config/env';

/**
 * M0.2 — the network boundary.
 *
 * The composition root already withholds the legacy repository from a release
 * build. This file tests the SECOND line of defence: even holding an instance
 * and calling it directly, a blocked build must not put a request on the wire.
 *
 * `fetch` is spied on rather than mocked away, so the assertion is literally
 * "no request left the device".
 */

const BLOCKED: LegacyCatalogPolicy = {
  source: 'none',
  decision: 'legacy-forbidden-release',
  reason: 'release build',
};
const ALLOWED: LegacyCatalogPolicy = {
  source: 'legacy-api',
  decision: 'legacy-development-explicit',
  reason: 'dev opt-in',
};

type CatalogModule = {
  LegacyApiCatalogRepository: new () => import('@/repositories/types').CatalogRepository;
  fetchLegacyProducts: (query?: unknown, signal?: AbortSignal) => Promise<unknown>;
  fetchLegacyCategories: (signal?: AbortSignal) => Promise<unknown>;
  /**
   * The error class FROM THE ISOLATED REGISTRY.
   *
   * `jest.isolateModules` builds a fresh module registry, so the class thrown
   * inside it is a different object from the one this file would import at the
   * top — and `instanceof` would fail against two identically-named classes.
   */
  LegacyCatalogForbiddenError: new (...args: never[]) => Error;
};

function loadCatalog(policy: LegacyCatalogPolicy): CatalogModule {
  let mod!: CatalogModule;
  jest.isolateModules(() => {
    jest.doMock('@/config/env', () => ({
      ...jest.requireActual('@/config/env'),
      legacyCatalogPolicy: policy,
      isLegacyCatalogAllowed: policy.source === 'legacy-api',
    }));
    const repo = require('@/repositories/api/legacy-api-catalog-repository');
    const endpoints = require('@/api/endpoints/legacy-catalog');
    const guard = require('@/api/legacy-catalog-guard');
    mod = {
      LegacyApiCatalogRepository: repo.LegacyApiCatalogRepository,
      fetchLegacyProducts: endpoints.fetchLegacyProducts,
      fetchLegacyCategories: endpoints.fetchLegacyCategories,
      LegacyCatalogForbiddenError: guard.LegacyCatalogForbiddenError,
    };
  });
  return mod;
}

let fetchSpy: jest.SpyInstance;

beforeEach(() => {
  fetchSpy = jest
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async () => {
      throw new Error('fetch must not be reached when the legacy catalogue is blocked');
    });
});

afterEach(() => {
  fetchSpy.mockRestore();
  jest.resetModules();
  jest.dontMock('@/config/env');
});

describe('LegacyApiCatalogRepository — blocked build', () => {
  it('refuses listProducts and issues no request', async () => {
    const { LegacyApiCatalogRepository, LegacyCatalogForbiddenError } = loadCatalog(BLOCKED);
    const repository = new LegacyApiCatalogRepository();

    await expect(repository.listProducts({})).rejects.toBeInstanceOf(
      LegacyCatalogForbiddenError,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('refuses listCategories and issues no request', async () => {
    const { LegacyApiCatalogRepository, LegacyCatalogForbiddenError } = loadCatalog(BLOCKED);
    const repository = new LegacyApiCatalogRepository();

    await expect(repository.listCategories()).rejects.toBeInstanceOf(
      LegacyCatalogForbiddenError,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('refuses getProductBySlug and issues no request', async () => {
    const { LegacyApiCatalogRepository, LegacyCatalogForbiddenError } = loadCatalog(BLOCKED);
    const repository = new LegacyApiCatalogRepository();

    await expect(repository.getProductBySlug('iphone-15-pro-256')).rejects.toBeInstanceOf(
      LegacyCatalogForbiddenError,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('legacy endpoint functions — blocked build', () => {
  it('refuses a direct endpoint call, bypassing the repository entirely', async () => {
    // Someone importing `fetchLegacyProducts` straight into a screen would skip
    // both the composition root and the repository class.
    const { fetchLegacyProducts, LegacyCatalogForbiddenError } = loadCatalog(BLOCKED);

    await expect(fetchLegacyProducts()).rejects.toBeInstanceOf(LegacyCatalogForbiddenError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('refuses a direct categories call', async () => {
    const { fetchLegacyCategories, LegacyCatalogForbiddenError } = loadCatalog(BLOCKED);

    await expect(fetchLegacyCategories()).rejects.toBeInstanceOf(LegacyCatalogForbiddenError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('LegacyApiCatalogRepository — permitted build', () => {
  it('does reach the network when development has opted in', async () => {
    // The gate must not be so tight that the sanctioned path stops working.
    fetchSpy.mockImplementation(async () => ({
      ok: true,
      status: 200,
      text: async () => '[]',
    }) as unknown as Response);

    const { LegacyApiCatalogRepository } = loadCatalog(ALLOWED);
    const repository = new LegacyApiCatalogRepository();

    await expect(repository.listProducts({})).resolves.toEqual([]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
