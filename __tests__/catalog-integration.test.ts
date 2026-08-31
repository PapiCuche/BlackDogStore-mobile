import { queryKeys } from '@/providers/query-client';
import { makeQueryScope } from '@/providers/query-scope';
import { decideForUrl } from '@/linking/deep-link-coordinator';
import { APP_SCHEME } from '@/linking/parser';
import { V1ApiCatalogRepository } from '@/repositories/api/v1-api-catalog-repository';

/**
 * M2 — the catalogue end to end, minus the network.
 *
 * The repository is exercised against a stubbed `catalog-v1` module rather than
 * a stubbed `fetch`: the wire format already has its own suite
 * (`catalog-v1-client.test.ts`), and what matters here is that the repository
 * passes the screen's parameters through unchanged and adds no filtering of its
 * own.
 */

jest.mock('@/api/endpoints/catalog-v1', () => ({
  fetchV1Products: jest.fn(),
  fetchV1Categories: jest.fn(),
  fetchV1ProductBySlug: jest.fn(),
}));

const api = jest.requireMock('@/api/endpoints/catalog-v1') as {
  fetchV1Products: jest.Mock;
  fetchV1Categories: jest.Mock;
  fetchV1ProductBySlug: jest.Mock;
};

const PRODUCT = {
  id: 7,
  name: 'MacBook Air 13"',
  slug: 'macbook-air-13',
  description: '',
  price: '4500.00',
  inventory: 3,
  category: { id: 2, name: 'Mac', slug: 'mac' },
  imageUrl: '',
  averageRating: null,
  reviewCount: 0,
};

beforeEach(() => {
  jest.clearAllMocks();
  api.fetchV1Products.mockResolvedValue([PRODUCT]);
  api.fetchV1Categories.mockResolvedValue([{ id: 2, name: 'Mac', slug: 'mac' }]);
  api.fetchV1ProductBySlug.mockResolvedValue(PRODUCT);
});

describe('V1ApiCatalogRepository', () => {
  const repository = new V1ApiCatalogRepository();

  it('lists products through the v1 contract', async () => {
    await expect(repository.listProducts({})).resolves.toEqual([PRODUCT]);
    expect(api.fetchV1Products).toHaveBeenCalledTimes(1);
  });

  it('maps the screen’s categorySlug onto the server’s `category`', async () => {
    await repository.listProducts({ categorySlug: 'mac', search: 'air' });

    expect(api.fetchV1Products).toHaveBeenCalledWith(
      { category: 'mac', search: 'air' },
      undefined,
    );
  });

  it('lists categories through the v1 contract', async () => {
    await expect(repository.listCategories()).resolves.toHaveLength(1);
    expect(api.fetchV1Categories).toHaveBeenCalledTimes(1);
  });

  it('fetches one product by slug', async () => {
    await expect(repository.getProductBySlug('macbook-air-13')).resolves.toEqual(PRODUCT);
    expect(api.fetchV1ProductBySlug).toHaveBeenCalledWith('macbook-air-13', undefined);
  });

  it('returns null for a product that is not there', async () => {
    api.fetchV1ProductBySlug.mockResolvedValue(null);

    await expect(repository.getProductBySlug('no-existe')).resolves.toBeNull();
  });

  it('forwards the AbortSignal so a leaving screen cancels its request', async () => {
    const signal = new AbortController().signal;
    await repository.listProducts({}, signal);
    await repository.listCategories(signal);
    await repository.getProductBySlug('x', signal);

    expect(api.fetchV1Products).toHaveBeenCalledWith(expect.anything(), signal);
    expect(api.fetchV1Categories).toHaveBeenCalledWith(signal);
    expect(api.fetchV1ProductBySlug).toHaveBeenCalledWith('x', signal);
  });

  it('does NOT filter the response on the client', async () => {
    // A client that trims another tenant's rows out of a response has already
    // received them. Scoping happens on the server or it has not happened.
    const foreign = { ...PRODUCT, id: 99, slug: 'de-otra-empresa' };
    api.fetchV1Products.mockResolvedValue([PRODUCT, foreign]);

    await expect(repository.listProducts({})).resolves.toHaveLength(2);
  });

  it('propagates an error instead of resolving to an empty catalogue', async () => {
    // "No pudimos cargar" and "esta tienda no tiene productos" are different
    // statements, and the second one is a lie about the business.
    api.fetchV1Products.mockRejectedValue(new Error('boom'));

    await expect(repository.listProducts({})).rejects.toThrow('boom');
  });
});

describe('cache keys stay tenant-scoped (M1.1 preserved)', () => {
  const acme = makeQueryScope({ tenantSlug: 'acme', userId: null });
  const other = makeQueryScope({ tenantSlug: 'otra', userId: null });

  it('namespaces the product list by tenant', () => {
    expect(queryKeys.products(acme)).toContain('acme');
    expect(queryKeys.products(acme)).not.toContain('products-global');
  });

  it('gives two tenants different keys for the same query', () => {
    expect(queryKeys.products(acme)).not.toEqual(queryKeys.products(other));
    expect(queryKeys.categories(acme)).not.toEqual(queryKeys.categories(other));
    expect(queryKeys.product(acme, 'macbook-air-13')).not.toEqual(
      queryKeys.product(other, 'macbook-air-13'),
    );
  });

  it('never produces a bare global key', () => {
    for (const key of [
      queryKeys.products(acme),
      queryKeys.categories(acme),
      queryKeys.product(acme, 'x'),
    ]) {
      expect(key[0]).toBe('tenant');
      expect(key).not.toEqual(['products']);
    }
  });

  it('keeps the catalogue in the PUBLIC namespace, not the per-user one', () => {
    // The catalogue is the same for everyone in a tenant; scoping it per user
    // would refetch it on every sign-in for no reason.
    expect(queryKeys.products(acme)).toContain('public');
  });
});

describe('a product deep link reaches the real catalogue', () => {
  it('routes to the product detail screen that now reads v1', () => {
    // M1.2 decided the route; M2 made the destination real. The parser is
    // untouched — the link was always a navigation intent.
    const decision = decideForUrl(`${APP_SCHEME}://products/macbook-air-13`, {
      authStatus: 'unauthenticated',
    });

    expect(decision).toEqual({
      action: 'navigate',
      route: '/products/macbook-air-13',
      intent: { kind: 'product', slug: 'macbook-air-13' },
    });
  });

  it('still opens the catalogue without a session', () => {
    // The shop window is public on both sides: no auth on the endpoint, no auth
    // gate on the link.
    const decision = decideForUrl(`${APP_SCHEME}://products/macbook-air-13`, {
      authStatus: 'unavailable',
    });

    expect(decision.action).toBe('navigate');
  });
});
