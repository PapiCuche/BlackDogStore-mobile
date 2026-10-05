/**
 * The two acts the counter performs on a customer RECORD — WHATSAPP-NOTIFY and
 * the account link.
 *
 * Contract on `PapiCuche/BlackDogStore-web` @ `origin/master`
 * `aec829c697674efb61f9776a4f796bfc05663ddc`:
 *
 *   POST service/customers/<id>/whatsapp-consent/  `service.customers.manage`
 *   POST service/customers/<id>/unlink-account/    `service.customers.manage`
 *
 * BOTH ARE WRITE-ONLY TODAY. No v1 payload exposes `whatsapp_opt_in` and none
 * exposes whether a record has an account, so the app shows what it just wrote
 * and nothing else — see BR-011. These tests pin the writes and the readings of
 * their answers, including the two defaults that matter: absent consent is NO
 * consent, and an absent `has_account` means STILL LINKED.
 */
const BASE = 'https://api.example.test';
const DEPS = { refreshCoordinator: {} as never };

type Loaded = typeof import('@/api/endpoints/internal-service-v1');

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
    return options.result ?? { id: 4, has_account: false };
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

describe('undoing a wrong account link', () => {
  it('posts to the unlink route of that customer', async () => {
    const { module, send } = load();

    await module.postCustomerAccountUnlink(4, 'Se enlazó a la cuenta equivocada', DEPS);

    expect(send.mock.calls[0]![0]).toBe(
      '/api/v1/internal/blackdog/service/customers/4/unlink-account/',
    );
    const options = send.mock.calls[0]![1] as { method: string; body: unknown };
    expect(options.method).toBe('POST');
    expect(options.body).toEqual({ reason: 'Se enlazó a la cuenta equivocada' });
  });

  it('omits an empty reason rather than sending a blank one', async () => {
    const { module, send } = load();

    await module.postCustomerAccountUnlink(4, '   ', DEPS);

    expect((send.mock.calls[0]![1] as { body: unknown }).body).toEqual({});
  });

  it('reads the minimal answer the server gives', async () => {
    const { module } = load({ result: { id: 4, has_account: false } });

    expect(await module.postCustomerAccountUnlink(4, '', DEPS)).toEqual({
      id: 4,
      hasAccount: false,
    });
  });

  it('reads an ABSENT has_account as still linked', async () => {
    // Claiming the link is gone when the server did not say so would send
    // somebody to re-link an account that is still attached.
    const { module } = load({ result: { id: 4 } });

    expect((await module.postCustomerAccountUnlink(4, '', DEPS)).hasAccount).toBe(true);
  });

  it('surfaces the domain refusal with the server sentence', async () => {
    const { module } = load({
      makeError: (ApiError) =>
        new ApiError('validation', 'Esta ficha no tiene ninguna cuenta enlazada.', {
          status: 400,
        }),
    });

    await expect(module.postCustomerAccountUnlink(4, '', DEPS)).rejects.toMatchObject({
      message: 'Esta ficha no tiene ninguna cuenta enlazada.',
    });
  });

  it('turns a 403 into a missing capability, not a logout', async () => {
    const { module } = load({
      makeError: (ApiError) => new ApiError('unauthorized', 'No permitido.', { status: 403 }),
    });

    await expect(module.postCustomerAccountUnlink(4, '', DEPS)).rejects.toMatchObject({
      name: 'InternalCapabilityMissingError',
    });
  });

  it('refuses to guess a tenant', async () => {
    const { module, send } = load({ slug: null });

    await expect(module.postCustomerAccountUnlink(4, '', DEPS)).rejects.toMatchObject({
      name: 'MissingTenantError',
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('sends nothing about the account itself', async () => {
    // The record's account is the server's business. The counter states a
    // reason; it does not name a user, an email or an id to detach.
    const { module, send } = load();

    await module.postCustomerAccountUnlink(4, 'x', DEPS);

    const body = (send.mock.calls[0]![1] as { body: Record<string, unknown> }).body;
    for (const owned of ['user', 'user_id', 'email', 'account', 'has_account']) {
      expect(body).not.toHaveProperty(owned);
    }
  });
});
