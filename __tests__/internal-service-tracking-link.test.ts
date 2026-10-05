/**
 * SERVICE-TRACKING — the customer's public link to one repair, staff side.
 *
 * Contract, on `PapiCuche/BlackDogStore-web` @ `origin/master`
 * `aec829c697674efb61f9776a4f796bfc05663ddc`
 * (`store/v1_service_views.py` > `V1ServiceTrackingLinkView`,
 * `store/tracking_services.py`):
 *
 *   GET  tracking-link/          `service.orders.view`            status only
 *   POST tracking-link/reveal/   `service.quotes.record_decision` the link
 *   POST tracking-link/rotate/   `service.orders.manage`          replace
 *   POST tracking-link/revoke/   `service.orders.manage`          turn off
 *
 * WHOEVER HOLDS THE LINK CAN ANSWER THE QUOTE AS THE CUSTOMER. That single fact
 * is why revealing is gated harder than opening the order, why `can_reveal` is
 * the server's answer and not a role read here, and why the revealed link is
 * never a cache key.
 */

const BASE = 'https://api.example.test';
const DEPS = { refreshCoordinator: {} as never };

type Loaded = typeof import('@/api/endpoints/internal-service-v1');

const STATUS = {
  active: true,
  view_count: 3,
  last_viewed_at: '2026-10-02T10:00:00Z',
  can_reveal: true,
};

function load(
  options: {
    slug?: string | null;
    result?: unknown;
    makeError?: (ApiError: typeof import('@/api/errors').ApiError) => Error;
  } = {},
) {
  let thrown: Error | null = null;
  const send = jest.fn(async (..._args: unknown[]) => {
    if (thrown) throw thrown;
    return options.result ?? STATUS;
  });

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
    module = require('@/api/endpoints/internal-service-v1');
  });

  return { module, send };
}

afterEach(() => {
  jest.resetModules();
  jest.dontMock('@/api/authenticated-request');
  jest.dontMock('@/config/env');
});

describe('where each act goes', () => {
  it('reads the status on the internal service surface', async () => {
    const { module, send } = load();

    await module.fetchServiceTrackingLink(77, DEPS);

    expect(send.mock.calls[0]![0]).toBe(
      '/api/v1/internal/blackdog/service/orders/77/tracking-link/',
    );
    expect((send.mock.calls[0]![1] as { method?: string }).method).toBeUndefined();
  });

  it('posts to reveal, rotate and revoke at their own routes', async () => {
    const reveal = load({ result: { url: `${BASE}/seguimiento/tok`, path: '/seguimiento/tok' } });
    await reveal.module.revealServiceTrackingLink(77, DEPS);
    expect(reveal.send.mock.calls[0]![0]).toBe(
      '/api/v1/internal/blackdog/service/orders/77/tracking-link/reveal/',
    );

    const rotate = load();
    await rotate.module.rotateServiceTrackingLink(77, DEPS);
    expect(rotate.send.mock.calls[0]![0]).toBe(
      '/api/v1/internal/blackdog/service/orders/77/tracking-link/rotate/',
    );

    const revoke = load();
    await revoke.module.revokeServiceTrackingLink(77, DEPS);
    expect(revoke.send.mock.calls[0]![0]).toBe(
      '/api/v1/internal/blackdog/service/orders/77/tracking-link/revoke/',
    );

    for (const call of [...reveal.send.mock.calls, ...rotate.send.mock.calls, ...revoke.send.mock.calls]) {
      const options = call[1] as { method?: string; scope: string };
      expect(options.method).toBe('POST');
      expect(options.scope).toBe('authenticated-v1');
    }
  });

  it('never reaches the legacy admin surface', async () => {
    const { module, send } = load();

    await module.fetchServiceTrackingLink(77, DEPS);
    await module.rotateServiceTrackingLink(77, DEPS);

    for (const call of send.mock.calls) {
      expect(String(call[0])).toMatch(/^\/api\/v1\/internal\//);
      expect(String(call[0])).not.toMatch(/\/api\/admin\//);
    }
  });

  it('refuses to guess a tenant', async () => {
    const { module, send } = load({ slug: null });

    await expect(module.fetchServiceTrackingLink(77, DEPS)).rejects.toMatchObject({
      name: 'MissingTenantError',
    });
    expect(send).not.toHaveBeenCalled();
  });
});

describe('the status', () => {
  it('maps what anybody who may open the order can know', async () => {
    const { module } = load();

    expect(await module.fetchServiceTrackingLink(77, DEPS)).toEqual({
      active: true,
      viewCount: 3,
      lastViewedAt: '2026-10-02T10:00:00Z',
      canReveal: true,
    });
  });

  it('carries no link, ever', async () => {
    // `staff_payload` has four fields and none of them is the token. If one
    // appeared, this client must still not surface it.
    const { module } = load({
      result: { ...STATUS, url: 'https://web.test/seguimiento/leaked', token: 'leaked' },
    });

    const status = await module.fetchServiceTrackingLink(77, DEPS);

    expect(JSON.stringify(status)).not.toContain('leaked');
    expect(status).not.toHaveProperty('url');
    expect(status).not.toHaveProperty('token');
  });

  it('reads a missing `can_reveal` as NOT allowed', async () => {
    // Drawing a reveal button the server would refuse is worse than hiding one
    // it would have allowed.
    const { module } = load({ result: { active: true, view_count: 0 } });

    const status = await module.fetchServiceTrackingLink(77, DEPS);

    expect(status.canReveal).toBe(false);
    expect(status.active).toBe(true);
  });

  it('reads an unopened link as zero views and no date', async () => {
    const { module } = load({
      result: { active: true, view_count: 0, last_viewed_at: null, can_reveal: false },
    });

    const status = await module.fetchServiceTrackingLink(77, DEPS);

    expect(status.viewCount).toBe(0);
    expect(status.lastViewedAt).toBeNull();
  });

  it('reads a nonsense count as zero rather than NaN', async () => {
    const { module } = load({ result: { ...STATUS, view_count: 'muchas' } });

    expect((await module.fetchServiceTrackingLink(77, DEPS)).viewCount).toBe(0);
  });

  it('treats anything but true as inactive', async () => {
    const { module } = load({ result: { ...STATUS, active: 'yes' } });

    expect((await module.fetchServiceTrackingLink(77, DEPS)).active).toBe(false);
  });
});

describe('revealing', () => {
  it('returns the URL and the path the server built', async () => {
    const { module } = load({
      result: { url: 'https://web.test/seguimiento/tok', path: '/seguimiento/tok' },
    });

    expect(await module.revealServiceTrackingLink(77, DEPS)).toEqual({
      url: 'https://web.test/seguimiento/tok',
      path: '/seguimiento/tok',
    });
  });

  it('sends an empty body: nothing about the link is the client to decide', async () => {
    const { module, send } = load({ result: { url: 'u', path: 'p' } });

    await module.revealServiceTrackingLink(77, DEPS);

    expect((send.mock.calls[0]![1] as { body: unknown }).body).toEqual({});
  });

  it('turns a 409 into the domain refusal, with the server sentence', async () => {
    // A revoked link is a real answer, not a fault: there is nothing to hand
    // over until somebody creates a new one.
    const { module } = load({
      makeError: (ApiError) =>
        new ApiError('unknown', 'Esta orden no tiene un enlace activo. Crea uno nuevo para entregarlo.', {
          status: 409,
        }),
    });

    await expect(module.revealServiceTrackingLink(77, DEPS)).rejects.toMatchObject({
      message: 'Esta orden no tiene un enlace activo. Crea uno nuevo para entregarlo.',
    });
  });

  it('turns a 403 into the missing-capability error, not a logout', async () => {
    // Losing `service.quotes.record_decision` is not losing the session.
    const { module } = load({
      makeError: (ApiError) => new ApiError('unauthorized', 'No tienes permiso.', { status: 403 }),
    });

    await expect(module.revealServiceTrackingLink(77, DEPS)).rejects.toMatchObject({
      name: 'InternalCapabilityMissingError',
    });
  });

  it('turns a 404 into out-of-scope rather than an empty answer', async () => {
    const { module } = load({
      makeError: (ApiError) => new ApiError('not_found', 'No encontrado.', { status: 404 }),
    });

    await expect(module.fetchServiceTrackingLink(77, DEPS)).rejects.toBeInstanceOf(Error);
  });
});

describe('rotate and revoke', () => {
  it('answer with the status and never with a link', async () => {
    const rotate = load({ result: { ...STATUS, view_count: 0 } });
    const rotated = await rotate.module.rotateServiceTrackingLink(77, DEPS);
    expect(rotated).not.toHaveProperty('url');
    expect(rotated.viewCount).toBe(0);

    const revoke = load({ result: { active: false, view_count: 3, can_reveal: true } });
    const revoked = await revoke.module.revokeServiceTrackingLink(77, DEPS);
    expect(revoked.active).toBe(false);
    expect(revoked).not.toHaveProperty('url');
  });
});
