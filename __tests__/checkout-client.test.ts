/**
 * M5 — the native checkout wire.
 *
 * The contract is `POST /api/v1/customer/<slug>/checkout/`. What matters here:
 * the request carries intent and no money, the idempotency key travels, and the
 * two failures that need distinct handling (409 conflict, 400 rejection) become
 * distinct errors.
 */

const BASE = 'https://api.example.test';

const CART = {
  tenantSlug: 'blackdog',
  lines: [
    {
      productSlug: 'iphone-15',
      quantity: 2,
      name: 'iPhone 15',
      imageUrl: 'https://cdn.test/i.png',
      lastSeenPrice: '4000.00',
    },
  ],
};

const DETAILS = {
  customerName: 'Ana Torres',
  customerPhone: '987654321',
  documentType: 'dni' as const,
  documentNumber: '12345678',
  deliveryMethod: 'pickup_store' as const,
  receiptType: 'boleta' as const,
  acceptedTerms: true,
  acceptedWarrantyPolicy: true,
};

const DEPS = { refreshCoordinator: {} as never };

type Loaded = typeof import('@/api/endpoints/customer-checkout-v1');

/**
 * `makeError` runs INSIDE the isolated registry.
 *
 * `jest.isolateModules` builds a fresh module graph, so an `ApiError`
 * constructed outside it is a different class from the one the client checks
 * against — and every `instanceof` would silently miss.
 */
function load(
  options: {
    slug?: string | null;
    result?: unknown;
    makeError?: (ApiError: typeof import('@/api/errors').ApiError) => Error;
  } = {},
) {
  let thrown: Error | null = null;
  const send = jest.fn(async (_path: string, _options: unknown, _deps: unknown) => {
    if (thrown) throw thrown;
    // The shape `origin/master` 2dca0a3 answers with: an order, and an Izipay
    // session built for the web SDK.
    return (
      options.result ?? {
        order_id: 1042,
        status: 'pending_payment',
        payment: {
          provider: 'izipay',
          environment: 'sandbox',
          transaction_id: '12345678901234567890',
          authorization: 'session-token',
          merchant_code: '4001061',
          public_key: 'public-key',
          config: { action: 'pay' },
        },
      }
    );
  });

  let module!: Loaded;

  jest.isolateModules(() => {
    jest.doMock('@/api/authenticated-request', () => ({
      authenticatedRequest: (path: string, opts: unknown, deps: unknown) => send(path, opts, deps),
    }));
    jest.doMock('@/config/env', () => ({
      ...jest.requireActual('@/config/env'),
      companySlug: options.slug === undefined ? 'blackdog' : options.slug,
      apiBaseUrl: BASE,
      isApiConfigured: true,
    }));
    const { ApiError } = require('@/api/errors');
    if (options.makeError) thrown = options.makeError(ApiError);
    module = require('@/api/endpoints/customer-checkout-v1');
  });

  return { module, send };
}

afterEach(() => {
  jest.resetModules();
  jest.dontMock('@/api/authenticated-request');
  jest.dontMock('@/config/env');
});

describe('the request', () => {
  it('posts to the CUSTOMER surface of this tenant', async () => {
    const { module, send } = load();

    await module.postCheckout({ cart: CART, details: DETAILS, idempotencyKey: 'k-1' }, DEPS);

    expect(send.mock.calls[0]![0]).toBe('/api/v1/customer/blackdog/checkout/');
  });

  it('declares the authenticated scope', async () => {
    const { module, send } = load();

    await module.postCheckout({ cart: CART, details: DETAILS, idempotencyKey: 'k-1' }, DEPS);

    const options = send.mock.calls[0]![1] as { scope: string; method: string };
    expect(options.scope).toBe('authenticated-v1');
    expect(options.method).toBe('POST');
  });

  it('sends items as INTENT and no money at all', async () => {
    // The server rejects a price outright, so the client has no way to send one.
    const { module, send } = load();

    await module.postCheckout({ cart: CART, details: DETAILS, idempotencyKey: 'k-1' }, DEPS);

    const body = (send.mock.calls[0]![1] as { body: Record<string, unknown> }).body;
    expect(body.items).toEqual([{ product_slug: 'iphone-15', quantity: 2 }]);
    for (const forbidden of ['price', 'total', 'subtotal', 'discount_amount', 'session_key']) {
      expect(body).not.toHaveProperty(forbidden);
    }
    expect(JSON.stringify(body)).not.toContain('4000.00');
  });

  it('carries the idempotency key', async () => {
    const { module, send } = load();

    await module.postCheckout({ cart: CART, details: DETAILS, idempotencyKey: 'k-abc' }, DEPS);

    const body = (send.mock.calls[0]![1] as { body: Record<string, unknown> }).body;
    expect(body.idempotency_key).toBe('k-abc');
  });

  it('omits optional fields rather than sending them blank', async () => {
    const { module, send } = load();

    await module.postCheckout({ cart: CART, details: DETAILS, idempotencyKey: 'k-1' }, DEPS);

    const body = (send.mock.calls[0]![1] as { body: Record<string, unknown> }).body;
    expect(body).not.toHaveProperty('address_line');
    expect(body).not.toHaveProperty('coupon_code');
  });

  it('sends address fields when a delivery needs them', async () => {
    const { module, send } = load();

    await module.postCheckout(
      {
        cart: CART,
        details: {
          ...DETAILS,
          deliveryMethod: 'delivery_arequipa',
          addressLine: 'Calle 1',
          city: 'Arequipa',
          district: 'Cercado',
        },
        idempotencyKey: 'k-1',
      },
      DEPS,
    );

    const body = (send.mock.calls[0]![1] as { body: Record<string, unknown> }).body;
    expect(body.address_line).toBe('Calle 1');
  });

  it('encodes the tenant slug', async () => {
    const { module, send } = load({ slug: 'a/b' });

    await module.postCheckout({ cart: CART, details: DETAILS, idempotencyKey: 'k-1' }, DEPS);

    expect(send.mock.calls[0]![0]).toContain('/customer/a%2Fb/');
  });

  it('refuses to send anything when this build has no tenant', async () => {
    const { module, send } = load({ slug: null });

    await expect(
      module.postCheckout({ cart: CART, details: DETAILS, idempotencyKey: 'k-1' }, DEPS),
    ).rejects.toBeInstanceOf(module.MissingTenantError);
    expect(send).not.toHaveBeenCalled();
  });
});

describe('the response', () => {
  it('takes the order and nothing else from it', async () => {
    // The Izipay session is left untouched on purpose. Opening a payment from
    // the app is blocked (BR-010 / H-PAY-01), and a half-read session built for
    // another client would be a payment integration nobody verified.
    const { module } = load();

    const result = await module.postCheckout(
      { cart: CART, details: DETAILS, idempotencyKey: 'k-1' }, DEPS,
    );

    expect(result).toEqual({ orderId: 1042 });
  });

  it('still reports the order when a replay carries no payment session', async () => {
    const { module } = load({ result: { order_id: 7, status: 'failed', payment: null } });

    await expect(
      module.postCheckout({ cart: CART, details: DETAILS, idempotencyKey: 'k-1' }, DEPS),
    ).resolves.toEqual({ orderId: 7 });
  });

  it('offers no helper to open a hosted payment page', () => {
    const { module } = load();

    expect(module).not.toHaveProperty('isTrustedCheckoutUrl');
  });
});

describe('failures that need different handling', () => {
  it('turns a 409 into a CONFLICT error', async () => {
    // The key was reused for a different basket. The fix is a new attempt, not
    // a retry, so this must not look like a network blip.
    const { module } = load({
      makeError: (ApiError) =>
        new ApiError('validation', 'ya se usó', {
          status: 409, fieldErrors: { order_id: ['55'] },
        }),
    });

    await expect(
      module.postCheckout({ cart: CART, details: DETAILS, idempotencyKey: 'k-1' }, DEPS),
    ).rejects.toBeInstanceOf(module.CheckoutConflictError);
  });

  it('turns a 400 into a REJECTED error carrying the reasons', async () => {
    const { module } = load({
      makeError: (ApiError) =>
        new ApiError('validation', 'Problemas con el carrito.', {
          status: 400, fieldErrors: { errors: ['Stock insuficiente para iPhone 15.'] },
        }),
    });

    try {
      await module.postCheckout({ cart: CART, details: DETAILS, idempotencyKey: 'k-1' }, DEPS);
      throw new Error('debió rechazar');
    } catch (error) {
      expect(error).toBeInstanceOf(module.CheckoutRejectedError);
      expect((error as InstanceType<typeof module.CheckoutRejectedError>).reasons).toEqual([
        'Stock insuficiente para iPhone 15.',
      ]);
    }
  });

  it('propagates a 401 untouched, so the auth pipeline sees it', async () => {
    const { module } = load({
      makeError: (ApiError) => new ApiError('unauthorized', 'no', { status: 401 }),
    });

    await expect(
      module.postCheckout({ cart: CART, details: DETAILS, idempotencyKey: 'k-1' }, DEPS),
    ).rejects.not.toBeInstanceOf(module.CheckoutRejectedError);
  });

  it('propagates a network failure untouched', async () => {
    const { module } = load({
      makeError: (ApiError) => new ApiError('offline', 'sin conexión', { status: null }),
    });

    await expect(
      module.postCheckout({ cart: CART, details: DETAILS, idempotencyKey: 'k-1' }, DEPS),
    ).rejects.toBeTruthy();
  });
});
