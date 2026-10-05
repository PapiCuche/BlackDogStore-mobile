/**
 * M12D — the photos the shop shares with their owner.
 *
 * Contract, on `PapiCuche/BlackDogStore-web` @ `origin/master`
 * `aec829c697674efb61f9776a4f796bfc05663ddc` (`store/evidence_views.py`,
 * `store/evidence_services.py`):
 *
 *   GET customer/<slug>/repairs/<id>/evidence/                  list
 *   GET customer/<slug>/repairs/<id>/evidence/<id>/content/     bytes
 *
 * What this file guards:
 *
 *  - THE CLIENT RECEIVES NO STORAGE KEY. The customer payload is an allowlist
 *    on the server — six fields — and nothing here reads a seventh.
 *  - THE BYTES ARE AN AUTHORISED REQUEST. A content URL is built and a Bearer
 *    header is resolved for it; neither is a signed link, and the route
 *    re-checks everything.
 *  - THE SURFACE IS READ ONLY, as the server decided: no upload, no delete, no
 *    visibility change reachable from the customer side.
 */

const BASE = 'https://api.example.test';

type Loaded = typeof import('@/api/endpoints/customer-repair-evidence-v1');

const ROW = {
  id: 12,
  stage: 'repair_after',
  caption: 'Pantalla nueva instalada',
  width: 1200,
  height: 900,
  created_at: '2026-10-01T15:04:05Z',
};

function load(
  options: {
    slug?: string | null;
    result?: unknown;
    token?: string | null;
    refresh?: () => Promise<unknown>;
    makeError?: (ApiError: typeof import('@/api/errors').ApiError) => Error;
  } = {},
) {
  let thrown: Error | null = null;
  const send = jest.fn(async (..._args: unknown[]) => {
    if (thrown) throw thrown;
    return options.result ?? { count: 1, results: [ROW] };
  });
  const refresh =
    options.refresh ??
    jest.fn(async () => ({ status: 'refreshed', accessToken: 'fresh-token' }));
  const deps = {
    refreshCoordinator: { refresh } as never,
    accessTokens: {
      get: () => (options.token === undefined ? 'memory-token' : options.token),
      peek: () => null,
      set: () => undefined,
      clear: () => undefined,
      isExpired: () => false,
    },
  };

  let module!: Loaded;
  jest.isolateModules(() => {
    jest.doMock('@/api/authenticated-request', () => ({
      authenticatedRequest: (path: string, opts: unknown, d: unknown) => send(path, opts, d),
    }));
    jest.doMock('@/config/env', () => ({
      ...jest.requireActual('@/config/env'),
      companySlug: options.slug === undefined ? 'blackdog' : options.slug,
      apiBaseUrl: BASE,
      isApiConfigured: true,
    }));
    const { ApiError } = require('@/api/errors');
    if (options.makeError) thrown = options.makeError(ApiError);
    module = require('@/api/endpoints/customer-repair-evidence-v1');
  });

  return { module, send, deps, refresh };
}

afterEach(() => {
  jest.resetModules();
  jest.dontMock('@/api/authenticated-request');
  jest.dontMock('@/config/env');
});

describe('the list', () => {
  it('reads the evidence of ONE repair on the customer surface', async () => {
    const { module, send, deps } = load();

    await module.fetchCustomerRepairEvidence(31, deps);

    expect(send.mock.calls[0]![0]).toBe('/api/v1/customer/blackdog/repairs/31/evidence/');
  });

  it('maps only the six fields the customer payload carries', async () => {
    const { module, deps } = load();

    const rows = await module.fetchCustomerRepairEvidence(31, deps);

    expect(rows[0]).toEqual({
      id: 12,
      stage: 'repair_after',
      caption: 'Pantalla nueva instalada',
      width: 1200,
      height: 900,
      createdAt: '2026-10-01T15:04:05Z',
    });
  });

  it('ignores anything the server did not promise, storage included', async () => {
    // If an internal field ever leaked into the customer payload, the app must
    // not start depending on it — and must never surface it.
    const { module, deps } = load({
      result: {
        count: 1,
        results: [
          {
            ...ROW,
            storage_key: 'evidence/2026/abc.jpg',
            visibility: 'internal',
            uploaded_by: 'tecnico1',
            void_reason: 'duplicada',
          },
        ],
      },
    });

    const rows = await module.fetchCustomerRepairEvidence(31, deps);

    expect(JSON.stringify(rows[0])).not.toContain('evidence/2026');
    expect(rows[0]).not.toHaveProperty('storageKey');
    expect(rows[0]).not.toHaveProperty('visibility');
    expect(rows[0]).not.toHaveProperty('uploadedBy');
  });

  it('keeps an unknown stage as a photo rather than dropping it', async () => {
    // A stage this build has not heard of is still the owner's device.
    const { module, deps } = load({
      result: { count: 1, results: [{ ...ROW, stage: 'teleportation' }] },
    });

    const rows = await module.fetchCustomerRepairEvidence(31, deps);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.stage).toBe('other');
  });

  it('reads a missing size as zero rather than NaN', async () => {
    const { module, deps } = load({
      result: { count: 1, results: [{ ...ROW, width: null, height: 'grande' }] },
    });

    const rows = await module.fetchCustomerRepairEvidence(31, deps);

    expect(rows[0]!.width).toBe(0);
    expect(rows[0]!.height).toBe(0);
  });

  it('reads a 404 as "no photos here"', async () => {
    // Another person's repair, another company's repair and a repair that does
    // not exist are one answer on this surface, on purpose.
    const { module, deps } = load({
      makeError: (ApiError) => new ApiError('not_found', 'No encontrado.', { status: 404 }),
    });

    expect(await module.fetchCustomerRepairEvidence(31, deps)).toEqual([]);
  });

  it('propagates a 401 instead of showing an empty gallery', async () => {
    const { module, deps } = load({
      makeError: (ApiError) => new ApiError('unauthorized', 'Sin sesión.', { status: 401 }),
    });

    await expect(module.fetchCustomerRepairEvidence(31, deps)).rejects.toMatchObject({
      status: 401,
    });
  });

  it('refuses to guess a tenant', async () => {
    const { module, send, deps } = load({ slug: null });

    await expect(module.fetchCustomerRepairEvidence(31, deps)).rejects.toMatchObject({
      name: 'MissingTenantError',
    });
    expect(send).not.toHaveBeenCalled();
  });
});

describe('the bytes', () => {
  it('builds the content route the server published', () => {
    const { module } = load();

    expect(module.customerEvidenceContentUrl(31, 12)).toBe(
      `${BASE}/api/v1/customer/blackdog/repairs/31/evidence/12/content/`,
    );
  });

  it('encodes the ids it puts in a path', () => {
    const { module } = load();

    expect(module.customerEvidenceContentUrl(31, 12)).toMatch(
      /^https:\/\/api\.example\.test\/api\/v1\//,
    );
    expect(module.customerEvidenceContentUrl(31, 12)).not.toMatch(/\/api\/admin\//);
  });

  it('sends the in-memory token when there is one', async () => {
    const { module, deps, refresh } = load();

    expect(await module.resolveEvidenceAuthorization(deps)).toBe('Bearer memory-token');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('refreshes BEFORE the image request when no token is usable', async () => {
    // An image loader cannot retry a 401 the way the JSON pipeline does, so the
    // header is made good first rather than after a broken thumbnail.
    const { module, deps, refresh } = load({ token: null });

    expect(await module.resolveEvidenceAuthorization(deps)).toBe('Bearer fresh-token');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('reports an expired session instead of an empty header', async () => {
    const { module, deps } = load({
      token: null,
      refresh: async () => ({ status: 'signed-out' }),
    });

    await expect(module.resolveEvidenceAuthorization(deps)).rejects.toMatchObject({
      status: 401,
    });
  });
});

describe('what this surface cannot do', () => {
  it('exposes no write at all', () => {
    const { module } = load();

    const names = Object.keys(module);
    for (const forbidden of ['upload', 'post', 'delete', 'publish', 'hide', 'void']) {
      expect(names.some((name) => name.toLowerCase().includes(forbidden))).toBe(false);
    }
  });

  it('never asks the server to filter what it already scoped', async () => {
    // `customer_evidence_for_order` cannot produce an internal or voided photo.
    // A `visibility` query parameter here would imply the client picks.
    const { module, send, deps } = load();

    await module.fetchCustomerRepairEvidence(31, deps);

    const options = send.mock.calls[0]![1] as unknown as { query?: Record<string, unknown> };
    expect(options.query).toBeUndefined();
  });
});
