/**
 * M12D — repair photos, STAFF side.
 *
 * Contract on `PapiCuche/BlackDogStore-web` @ `origin/master`
 * `aec829c697674efb61f9776a4f796bfc05663ddc` (`store/evidence_views.py`,
 * `store/evidence_services.py`):
 *
 *   GET  evidence/                           list, `service.orders.view`
 *   GET  evidence/<id>/content/              bytes, authorised per request
 *   POST evidence/<id>/publish-to-customer/  share
 *   POST evidence/<id>/hide-from-customer/   stop sharing
 *   POST evidence/<id>/void/                 retire, with a reason
 *
 * TWO AXES ON EVERY WRITE: the capability the photo's STAGE demands, plus
 * access to the order's branch (`may_act_on_stage`). Holding
 * `service.repair.manage` does not reach another branch's order, and working in
 * the branch does not grant the capability.
 */
import {
  EVIDENCE_STAGE_CAPABILITY,
  EVIDENCE_VOID_REASON_MAX_LENGTH,
} from '@/domain/internal/evidence-types';

const BASE = 'https://api.example.test';

type Loaded = typeof import('@/api/endpoints/internal-service-evidence-v1');

const ROW = {
  id: 31,
  stage: 'quality',
  caption: 'Prueba de carga OK',
  visibility: 'internal',
  mime_type: 'image/jpeg',
  byte_size: 240_512,
  width: 1600,
  height: 1200,
  created_at: '2026-10-04T11:00:00Z',
  uploaded_by: 'tecnico1',
  voided_at: null,
  void_reason: null,
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
    module = require('@/api/endpoints/internal-service-evidence-v1');
  });

  return { module, send, deps, refresh };
}

afterEach(() => {
  jest.resetModules();
  jest.dontMock('@/api/authenticated-request');
  jest.dontMock('@/config/env');
});

describe('the list', () => {
  it('reads the photos of one order on the internal surface', async () => {
    const { module, send, deps } = load();

    await module.fetchInternalEvidence(77, deps);

    expect(send.mock.calls[0]![0]).toBe(
      '/api/v1/internal/blackdog/service/orders/77/evidence/',
    );
    expect(String(send.mock.calls[0]![0])).not.toMatch(/\/api\/admin\//);
  });

  it('maps the WIDER staff payload', async () => {
    const { module, deps } = load();

    const rows = await module.fetchInternalEvidence(77, deps);

    expect(rows[0]).toEqual({
      id: 31,
      stage: 'quality',
      caption: 'Prueba de carga OK',
      visibility: 'internal',
      mimeType: 'image/jpeg',
      byteSize: 240_512,
      width: 1600,
      height: 1200,
      createdAt: '2026-10-04T11:00:00Z',
      uploadedBy: 'tecnico1',
      voidedAt: null,
      voidReason: null,
    });
  });

  it('never surfaces a storage key, whatever the server sends', async () => {
    const { module, deps } = load({
      result: {
        count: 1,
        results: [{ ...ROW, storage_key: 'evidence/2026/abc.jpg', bucket: 'private' }],
      },
    });

    const rows = await module.fetchInternalEvidence(77, deps);

    expect(JSON.stringify(rows[0])).not.toContain('evidence/2026');
    expect(rows[0]).not.toHaveProperty('storageKey');
  });

  it('reads anything but the server word as internal', async () => {
    // The safe default is NOT telling an operator the customer can see a photo.
    const { module, deps } = load({
      result: { count: 1, results: [{ ...ROW, visibility: 'public' }] },
    });

    expect((await module.fetchInternalEvidence(77, deps))[0]!.visibility).toBe('internal');
  });

  it('keeps a voided photo in the list, with its reason', async () => {
    // "This evidence was withdrawn" is part of the record.
    const { module, deps } = load({
      result: {
        count: 1,
        results: [{ ...ROW, voided_at: '2026-10-05T08:00:00Z', void_reason: 'Duplicada' }],
      },
    });

    const row = (await module.fetchInternalEvidence(77, deps))[0]!;

    expect(row.voidedAt).toBe('2026-10-05T08:00:00Z');
    expect(row.voidReason).toBe('Duplicada');
  });

  it('turns a 403 into a missing capability and a 404 into no access', async () => {
    const capability = load({
      makeError: (ApiError) => new ApiError('unauthorized', 'No permitido.', { status: 403 }),
    });
    await expect(capability.module.fetchInternalEvidence(77, capability.deps)).rejects.toMatchObject(
      { name: 'InternalCapabilityMissingError' },
    );

    const scope = load({
      makeError: (ApiError) => new ApiError('not_found', 'No encontrado.', { status: 404 }),
    });
    await expect(scope.module.fetchInternalEvidence(77, scope.deps)).rejects.toMatchObject({
      name: 'InternalAccessDeniedError',
    });
  });

  it('refuses to guess a tenant', async () => {
    const { module, send, deps } = load({ slug: null });

    await expect(module.fetchInternalEvidence(77, deps)).rejects.toMatchObject({
      name: 'MissingTenantError',
    });
    expect(send).not.toHaveBeenCalled();
  });
});

describe('the bytes', () => {
  it('builds the content route the server published', () => {
    const { module } = load();

    expect(module.internalEvidenceContentUrl(77, 31)).toBe(
      `${BASE}/api/v1/internal/blackdog/service/orders/77/evidence/31/content/`,
    );
  });

  it('uses the in-memory token, and refreshes only when there is none', async () => {
    const warm = load();
    expect(await warm.module.resolveInternalEvidenceAuthorization(warm.deps)).toBe(
      'Bearer memory-token',
    );
    expect(warm.refresh).not.toHaveBeenCalled();

    const cold = load({ token: null });
    expect(await cold.module.resolveInternalEvidenceAuthorization(cold.deps)).toBe(
      'Bearer fresh-token',
    );
    expect(cold.refresh).toHaveBeenCalledTimes(1);
  });

  it('reports an expired session rather than an empty header', async () => {
    const { module, deps } = load({ token: null, refresh: async () => ({ status: 'signed-out' }) });

    await expect(module.resolveInternalEvidenceAuthorization(deps)).rejects.toMatchObject({
      status: 401,
    });
  });
});

describe('sharing, unsharing and retiring', () => {
  it('posts each act to its own route', async () => {
    const publish = load({ result: { ...ROW, visibility: 'customer' } });
    await publish.module.publishInternalEvidence(77, 31, publish.deps);
    expect(publish.send.mock.calls[0]![0]).toBe(
      '/api/v1/internal/blackdog/service/orders/77/evidence/31/publish-to-customer/',
    );

    const hide = load();
    await hide.module.hideInternalEvidence(77, 31, hide.deps);
    expect(hide.send.mock.calls[0]![0]).toBe(
      '/api/v1/internal/blackdog/service/orders/77/evidence/31/hide-from-customer/',
    );

    const voided = load({ result: { ...ROW, voided_at: '2026-10-05T08:00:00Z' } });
    await voided.module.voidInternalEvidence(77, 31, 'Duplicada', voided.deps);
    expect(voided.send.mock.calls[0]![0]).toBe(
      '/api/v1/internal/blackdog/service/orders/77/evidence/31/void/',
    );

    for (const call of [
      ...publish.send.mock.calls,
      ...hide.send.mock.calls,
      ...voided.send.mock.calls,
    ]) {
      const options = call[1] as { method: string; scope: string };
      expect(options.method).toBe('POST');
      expect(options.scope).toBe('authenticated-v1');
    }
  });

  it('answers with the photo as it now stands', async () => {
    const { module, deps } = load({ result: { ...ROW, visibility: 'customer' } });

    expect((await module.publishInternalEvidence(77, 31, deps)).visibility).toBe('customer');
  });

  it('sends nothing but a reason, and omits an empty one', async () => {
    const withReason = load({ result: ROW });
    await withReason.module.voidInternalEvidence(77, 31, '  Duplicada  ', withReason.deps);
    expect((withReason.send.mock.calls[0]![1] as { body: unknown }).body).toEqual({
      reason: 'Duplicada',
    });

    const without = load({ result: ROW });
    await without.module.voidInternalEvidence(77, 31, '   ', without.deps);
    expect((without.send.mock.calls[0]![1] as { body: unknown }).body).toEqual({});
  });

  it('sends no visibility or stage of its own', async () => {
    // Those are the server's, decided by the route and by the photo.
    const { module, send, deps } = load({ result: ROW });

    await module.publishInternalEvidence(77, 31, deps);

    const body = (send.mock.calls[0]![1] as { body: Record<string, unknown> }).body;
    for (const owned of ['visibility', 'stage', 'uploaded_by', 'voided_at']) {
      expect(body).not.toHaveProperty(owned);
    }
  });

  it('surfaces the server sentence when an act is refused', async () => {
    // "Una evidencia anulada no se puede compartir." is the domain's own words.
    const { module, deps } = load({
      makeError: (ApiError) =>
        new ApiError('validation', 'Una evidencia anulada no se puede compartir.', {
          status: 400,
        }),
    });

    await expect(module.publishInternalEvidence(77, 31, deps)).rejects.toMatchObject({
      message: 'Una evidencia anulada no se puede compartir.',
    });
  });

  it('exposes no upload path', () => {
    // `POST evidence/` is multipart and belongs to the camera flow this app
    // does not have. Leaving it out keeps the gap visible.
    const { module } = load();

    const names = Object.keys(module).map((n) => n.toLowerCase());
    expect(names.some((n) => n.includes('upload') || n.includes('create'))).toBe(false);
  });
});

describe('which capability each stage demands', () => {
  it('mirrors the server map exactly', () => {
    // `evidence_services.STAGE_CAPABILITY`. Used to decide what to DRAW; the
    // server asks for the capability AND branch access on every write.
    expect(EVIDENCE_STAGE_CAPABILITY).toEqual({
      intake: 'service.orders.create',
      diagnosis: 'service.diagnostic.manage',
      repair_before: 'service.repair.manage',
      repair_during: 'service.repair.manage',
      repair_after: 'service.repair.manage',
      parts: 'service.repair.manage',
      quality: 'service.quality.manage',
      ready: 'service.delivery.manage',
      delivery: 'service.delivery.manage',
      warranty: 'service.orders.create',
      other: 'service.orders.manage',
    });
  });

  it('gives the catch-all stage the BROADEST authority, not the cheapest', () => {
    expect(EVIDENCE_STAGE_CAPABILITY.other).toBe('service.orders.manage');
  });

  it('caps the void reason where the server caps it', () => {
    expect(EVIDENCE_VOID_REASON_MAX_LENGTH).toBe(300);
  });
});
