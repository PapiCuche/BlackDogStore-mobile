/**
 * M2 — the tenant-safe catalogue client.
 *
 * The contract under test is `/api/v1/storefront/<company_slug>/…` on
 * `PapiCuche/BlackDogStore-web` @ `origin/master` `b301637b`.
 *
 * The tenant lives in the PATH. These tests pin down that it always gets there,
 * that it is encoded, and that a build with no tenant sends nothing at all
 * rather than guessing one.
 */

const BASE = 'https://api.example.test';

type Loaded = typeof import('@/api/endpoints/catalog-v1') & {
  /**
   * `ApiError` AS SEEN FROM INSIDE the isolated registry.
   *
   * `jest.isolateModules` builds a fresh module graph, so the `ApiError` the
   * client throws is a different class object from one imported at the top of
   * this file — `instanceof` would fail against two identically named classes.
   * Taking it from the same registry is what makes the assertion mean anything.
   */
  ApiError: typeof import('@/api/errors').ApiError;
};

/** Re-import the client with a specific tenant slug baked into config. */
function loadClient(slug: string | null): Loaded {
  let module!: Loaded;
  jest.isolateModules(() => {
    jest.doMock('@/config/env', () => ({
      ...jest.requireActual('@/config/env'),
      companySlug: slug,
      apiBaseUrl: BASE,
      isApiConfigured: true,
      apiTimeoutMs: 5000,
    }));
    const client = require('@/api/endpoints/catalog-v1');
    const { ApiError } = require('@/api/errors');
    module = { ...client, ApiError };
  });
  return module;
}

function respondWith(body: unknown, status = 200) {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

/** The URL of the single request the call under test issued. */
function requestedUrl(fetchMock: jest.Mock): string {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  return String(fetchMock.mock.calls[0]![0]);
}

const PRODUCT_ROW = {
  id: 7,
  name: 'MacBook Air 13"',
  slug: 'macbook-air-13',
  description: 'M3, 16 GB',
  price: '4500.00',
  inventory: 3,
  category: { id: 2, name: 'Mac', slug: 'mac' },
  image_url: 'https://cdn.example.test/mba.png',
  average_rating: 4.5,
  review_count: 12,
};

afterEach(() => {
  jest.resetModules();
  jest.dontMock('@/config/env');
  jest.restoreAllMocks();
});

describe('the tenant is always in the path', () => {
  it('asks for the configured storefront when listing products', async () => {
    const fetchMock = respondWith([PRODUCT_ROW]);
    await loadClient('blackdog').fetchV1Products();

    expect(requestedUrl(fetchMock)).toContain('/api/v1/storefront/blackdog/products/');
  });

  it('asks for the configured storefront when listing categories', async () => {
    const fetchMock = respondWith([{ id: 2, name: 'Mac', slug: 'mac' }]);
    await loadClient('blackdog').fetchV1Categories();

    expect(requestedUrl(fetchMock)).toContain('/api/v1/storefront/blackdog/categories/');
  });

  it('asks for the configured storefront when fetching one product', async () => {
    const fetchMock = respondWith(PRODUCT_ROW);
    await loadClient('blackdog').fetchV1ProductBySlug('macbook-air-13');

    expect(requestedUrl(fetchMock)).toContain(
      '/api/v1/storefront/blackdog/products/macbook-air-13/',
    );
  });

  it('uses a DIFFERENT tenant for a different build, with no shared state', async () => {
    const fetchMock = respondWith([]);
    await loadClient('otra-empresa').fetchV1Products();

    const url = requestedUrl(fetchMock);
    expect(url).toContain('/storefront/otra-empresa/');
    expect(url).not.toContain('blackdog');
  });

  it('encodes the tenant slug rather than concatenating it raw', async () => {
    const fetchMock = respondWith([]);
    await loadClient('a/b').fetchV1Products();

    // The escaped form, so a slug can never open a path segment of its own.
    expect(requestedUrl(fetchMock)).toContain('/storefront/a%2Fb/');
  });

  it('encodes the product slug too', async () => {
    const fetchMock = respondWith(PRODUCT_ROW);
    await loadClient('blackdog').fetchV1ProductBySlug('../../admin');

    const url = requestedUrl(fetchMock);
    expect(url).not.toContain('/admin/');
    expect(url).toContain('%2F');
  });
});

describe('a build with no tenant', () => {
  it('refuses to list products instead of guessing a storefront', async () => {
    const fetchMock = respondWith([]);
    const { fetchV1Products, MissingTenantError } = loadClient(null);

    await expect(fetchV1Products()).rejects.toBeInstanceOf(MissingTenantError);
    // The point: nothing was sent. Guessing here would serve the pilot's
    // catalogue inside another company's app.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses to list categories', async () => {
    const fetchMock = respondWith([]);
    const { fetchV1Categories, MissingTenantError } = loadClient(null);

    await expect(fetchV1Categories()).rejects.toBeInstanceOf(MissingTenantError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses to fetch a product', async () => {
    const fetchMock = respondWith(PRODUCT_ROW);
    const { fetchV1ProductBySlug, MissingTenantError } = loadClient(null);

    await expect(fetchV1ProductBySlug('macbook-air-13')).rejects.toBeInstanceOf(
      MissingTenantError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('query parameters', () => {
  it('passes a search term through', async () => {
    const fetchMock = respondWith([]);
    await loadClient('blackdog').fetchV1Products({ search: 'macbook' });

    expect(requestedUrl(fetchMock)).toContain('search=macbook');
  });

  it('passes a category slug through as `category`', async () => {
    const fetchMock = respondWith([]);
    await loadClient('blackdog').fetchV1Products({ category: 'mac' });

    expect(requestedUrl(fetchMock)).toContain('category=mac');
  });

  it('sends no query string when there are no filters', async () => {
    const fetchMock = respondWith([]);
    await loadClient('blackdog').fetchV1Products();

    expect(requestedUrl(fetchMock)).not.toContain('?');
  });

  it('never puts the company in a query parameter', async () => {
    // The server ignores it, but sending it would suggest the tenant is
    // negotiable. It is not: it is the path.
    const fetchMock = respondWith([]);
    await loadClient('blackdog').fetchV1Products({ search: 'x' });

    const url = requestedUrl(fetchMock);
    expect(url).not.toContain('company=');
    expect(url).not.toContain('company_slug=');
  });
});

describe('mapping the response to the domain', () => {
  it('maps a full product row', async () => {
    respondWith([PRODUCT_ROW]);
    const [product] = await loadClient('blackdog').fetchV1Products();

    expect(product).toEqual({
      id: 7,
      name: 'MacBook Air 13"',
      slug: 'macbook-air-13',
      description: 'M3, 16 GB',
      price: '4500.00',
      inventory: 3,
      category: { id: 2, name: 'Mac', slug: 'mac' },
      imageUrl: 'https://cdn.example.test/mba.png',
      averageRating: 4.5,
      reviewCount: 12,
    });
  });

  it('keeps the price as a STRING', async () => {
    // Money through a float is how a total ends up at 4499.999999999999.
    respondWith([PRODUCT_ROW]);
    const [product] = await loadClient('blackdog').fetchV1Products();

    expect(typeof product!.price).toBe('string');
  });

  it('maps a null category, which the model allows', async () => {
    respondWith([{ ...PRODUCT_ROW, category: null }]);
    const [product] = await loadClient('blackdog').fetchV1Products();

    expect(product!.category).toBeNull();
  });

  it('maps a null rating to null rather than to zero', async () => {
    // Zero stars and "nobody has reviewed this yet" are different claims.
    respondWith([{ ...PRODUCT_ROW, average_rating: null }]);
    const [product] = await loadClient('blackdog').fetchV1Products();

    expect(product!.averageRating).toBeNull();
  });

  it('defaults a blank image_url to an empty string', async () => {
    respondWith([{ ...PRODUCT_ROW, image_url: '' }]);
    const [product] = await loadClient('blackdog').fetchV1Products();

    expect(product!.imageUrl).toBe('');
  });

  it('survives a response that is not an array', async () => {
    respondWith({ detail: 'unexpected' });
    await expect(loadClient('blackdog').fetchV1Products()).resolves.toEqual([]);
  });

  it('maps the detail endpoint to a single product', async () => {
    respondWith(PRODUCT_ROW);
    const product = await loadClient('blackdog').fetchV1ProductBySlug('macbook-air-13');

    expect(product!.slug).toBe('macbook-air-13');
  });
});

describe('errors', () => {
  it('returns null for a 404 rather than throwing', async () => {
    // "This product is gone" is an empty state the screen already renders.
    respondWith({ detail: 'Not found.' }, 404);
    await expect(
      loadClient('blackdog').fetchV1ProductBySlug('no-existe'),
    ).resolves.toBeNull();
  });

  it('propagates a server error instead of pretending the shelf is empty', async () => {
    respondWith({ detail: 'boom' }, 500);
    const { fetchV1Products, ApiError } = loadClient('blackdog');
    await expect(fetchV1Products()).rejects.toBeInstanceOf(ApiError);
  });

  it('propagates a network failure', async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(
      new TypeError('Network request failed'),
    ) as unknown as typeof fetch;
    const { fetchV1Products, ApiError } = loadClient('blackdog');
    await expect(fetchV1Products()).rejects.toBeInstanceOf(ApiError);
  });

  it('does not swallow a 404 on the LIST endpoint', async () => {
    // A 404 there means the storefront did not resolve — a configuration
    // problem — not "this shop sells nothing".
    respondWith({ detail: 'Storefront not found.' }, 404);
    const { fetchV1Products, ApiError } = loadClient('blackdog');
    await expect(fetchV1Products()).rejects.toBeInstanceOf(ApiError);
  });
});

describe('credentials', () => {
  it('sends no Authorization header to the public catalogue', async () => {
    // `/api/v1/` is the Bearer-eligible prefix, which makes this worth pinning:
    // the storefront is anonymous, and a token has no business on a shop window.
    const fetchMock = respondWith([PRODUCT_ROW]);
    await loadClient('blackdog').fetchV1Products();

    const init = fetchMock.mock.calls[0]![1] as { headers?: Record<string, string> };
    const headers = init.headers ?? {};
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain('authorization');
  });
});
