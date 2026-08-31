/**
 * M4 — the customer orders wire.
 *
 * The contract is `/api/v1/customer/<company_slug>/orders/` on
 * `PapiCuche/BlackDogStore-web` @ `origin/master` `b253156`.
 *
 * What matters here: the tenant always reaches the path, the Bearer pipeline is
 * used rather than the anonymous one, and the mapper never invents a state it
 * was not told about.
 */

const BASE = 'https://api.example.test';

type Loaded = typeof import('@/api/endpoints/customer-orders-v1') & {
  ApiError: typeof import('@/api/errors').ApiError;
};

/** A stand-in for the authenticated pipeline, so nothing touches the network. */
function fakeSend(result: unknown | Error) {
  return jest.fn(async (_path: string, _options: unknown, _deps: unknown) => {
    if (result instanceof Error) throw result;
    return result;
  });
}

function loadClient(slug: string | null): Loaded {
  let module!: Loaded;
  jest.isolateModules(() => {
    jest.doMock('@/config/env', () => ({
      ...jest.requireActual('@/config/env'),
      companySlug: slug,
      apiBaseUrl: BASE,
      isApiConfigured: true,
    }));
    const client = require('@/api/endpoints/customer-orders-v1');
    const { ApiError } = require('@/api/errors');
    module = { ...client, ApiError };
  });
  return module;
}

/** Intercepts `authenticatedRequest` so the pipeline itself is not re-tested. */
function withTransport(result: unknown | Error) {
  const send = fakeSend(result);
  jest.doMock('@/api/authenticated-request', () => ({
    authenticatedRequest: (path: string, options: unknown, deps: unknown) =>
      send(path, options, deps),
  }));
  return send;
}

const ROW = {
  id: 1042,
  status: 'paid',
  status_label: 'Pagado',
  fulfillment_status: 'shipped',
  fulfillment_status_label: 'Enviado',
  total: '1028.00',
  discount_amount: '0.00',
  coupon_code: '',
  delivery_method: 'pickup_store',
  delivery_method_label: 'Recojo en tienda',
  created_at: '2026-08-01T10:00:00Z',
  paid_at: '2026-08-01T10:05:00Z',
  items: [
    {
      id: 1,
      product_name: 'AirPods Pro 2',
      product_slug: 'airpods-pro-2',
      image_url: 'https://cdn.example.test/a.png',
      quantity: 2,
      price: '899.00',
    },
  ],
};

const DEPS = { refreshCoordinator: {} as never };

afterEach(() => {
  jest.resetModules();
  jest.dontMock('@/config/env');
  jest.dontMock('@/api/authenticated-request');
});

describe('the tenant and the audience are always in the path', () => {
  it('asks the CUSTOMER surface, not the storefront one', async () => {
    let send!: jest.Mock;
    let client!: Loaded;
    jest.isolateModules(() => {
      send = withTransport([ROW]);
      jest.doMock('@/config/env', () => ({
        ...jest.requireActual('@/config/env'),
        companySlug: 'blackdog',
        apiBaseUrl: BASE,
        isApiConfigured: true,
      }));
      client = require('@/api/endpoints/customer-orders-v1');
    });

    await client.fetchCustomerOrders(DEPS);

    expect(send.mock.calls[0]![0]).toBe('/api/v1/customer/blackdog/orders/');
  });

  it('declares the authenticated scope, which is what allows a Bearer', async () => {
    let send!: jest.Mock;
    let client!: Loaded;
    jest.isolateModules(() => {
      send = withTransport([ROW]);
      jest.doMock('@/config/env', () => ({
        ...jest.requireActual('@/config/env'),
        companySlug: 'blackdog',
        apiBaseUrl: BASE,
        isApiConfigured: true,
      }));
      client = require('@/api/endpoints/customer-orders-v1');
    });

    await client.fetchCustomerOrders(DEPS);

    expect((send.mock.calls[0]![1] as { scope: string }).scope).toBe('authenticated-v1');
  });

  it('encodes the tenant slug rather than concatenating it raw', async () => {
    let send!: jest.Mock;
    let client!: Loaded;
    jest.isolateModules(() => {
      send = withTransport([]);
      jest.doMock('@/config/env', () => ({
        ...jest.requireActual('@/config/env'),
        companySlug: 'a/b',
        apiBaseUrl: BASE,
        isApiConfigured: true,
      }));
      client = require('@/api/endpoints/customer-orders-v1');
    });

    await client.fetchCustomerOrders(DEPS);

    expect(send.mock.calls[0]![0]).toContain('/customer/a%2Fb/');
  });

  it('refuses to ask ANY server when this build has no tenant', async () => {
    const { fetchCustomerOrders, MissingTenantError } = loadClient(null);

    await expect(fetchCustomerOrders(DEPS)).rejects.toBeInstanceOf(MissingTenantError);
  });
});

describe('mapping', () => {
  async function firstOrder(row: unknown = ROW) {
    let client!: Loaded;
    jest.isolateModules(() => {
      withTransport([row]);
      jest.doMock('@/config/env', () => ({
        ...jest.requireActual('@/config/env'),
        companySlug: 'blackdog',
        apiBaseUrl: BASE,
        isApiConfigured: true,
      }));
      client = require('@/api/endpoints/customer-orders-v1');
    });
    const [order] = await client.fetchCustomerOrders(DEPS);
    return order!;
  }

  it('maps a full order', async () => {
    const order = await firstOrder();

    expect(order.id).toBe(1042);
    expect(order.paymentStatus).toBe('paid');
    expect(order.fulfillmentStatus).toBe('shipped');
    expect(order.total).toBe('1028.00');
  });

  it('carries the SERVER-rendered labels rather than inventing copy', async () => {
    // The backend owns the state machine, so it owns its words. A second
    // translation table here would drift the day a status is renamed, and the
    // customer would read one word in an email and another in the app.
    const order = await firstOrder();

    expect(order.paymentStatusLabel).toBe('Pagado');
    expect(order.fulfillmentStatusLabel).toBe('Enviado');
    expect(order.deliveryMethodLabel).toBe('Recojo en tienda');
  });

  it('keeps money as STRINGS', async () => {
    const order = await firstOrder();

    expect(typeof order.total).toBe('string');
    expect(typeof order.items[0]!.price).toBe('string');
  });

  it('flattens an item without inventing a Product', async () => {
    const item = (await firstOrder()).items[0]!;

    expect(item).toEqual({
      id: 1,
      productName: 'AirPods Pro 2',
      productSlug: 'airpods-pro-2',
      imageUrl: 'https://cdn.example.test/a.png',
      quantity: 2,
      price: '899.00',
    });
  });

  it('does NOT guess an unknown payment status into "paid"', async () => {
    // Guessing here would tell someone their money moved when nobody said so.
    const order = await firstOrder({ ...ROW, status: 'algo_nuevo' });

    expect(order.paymentStatus).toBe('pending_payment');
  });

  it('maps an unknown fulfilment status to NULL, not to "pending"', async () => {
    // "We do not know where your order is" is honest. "Pending" is a claim
    // about the warehouse.
    const order = await firstOrder({ ...ROW, fulfillment_status: 'inventado' });

    expect(order.fulfillmentStatus).toBeNull();
  });

  it('accepts an order with no delivery method', async () => {
    // `delivery_method` is blank for orders predating the field. A crash here
    // would be a customer unable to open their own history.
    const order = await firstOrder({ ...ROW, delivery_method: '', delivery_method_label: '' });

    expect(order.deliveryMethod).toBe('');
  });

  it('survives a response that is not an array', async () => {
    let client!: Loaded;
    jest.isolateModules(() => {
      withTransport({ detail: 'raro' });
      jest.doMock('@/config/env', () => ({
        ...jest.requireActual('@/config/env'),
        companySlug: 'blackdog',
        apiBaseUrl: BASE,
        isApiConfigured: true,
      }));
      client = require('@/api/endpoints/customer-orders-v1');
    });

    await expect(client.fetchCustomerOrders(DEPS)).resolves.toEqual([]);
  });
});

describe('errors', () => {
  /**
   * Load the client with the transport failing with `status`.
   *
   * The `ApiError` is constructed INSIDE the isolated registry, because
   * `jest.isolateModules` builds a fresh module graph and an error made outside
   * it would not be the class the client checks against.
   */
  function loadFailing(status: number) {
    let client!: Loaded;
    jest.isolateModules(() => {
      const { ApiError } = require('@/api/errors');
      withTransport(new ApiError('server', 'fallo', { status }));
      jest.doMock('@/config/env', () => ({
        ...jest.requireActual('@/config/env'),
        companySlug: 'blackdog',
        apiBaseUrl: BASE,
        isApiConfigured: true,
      }));
      client = require('@/api/endpoints/customer-orders-v1');
    });
    return client;
  }

  it('reads a 404 on the LIST as an empty list', async () => {
    // The server makes "unknown company", "inactive company" and "you are not a
    // client here" indistinguishable on purpose, so a valid login cannot map
    // the platform's tenants. Inventing a distinction the contract refuses to
    // make would be second-guessing a deliberate security decision.
    await expect(loadFailing(404).fetchCustomerOrders(DEPS)).resolves.toEqual([]);
  });

  it('does NOT swallow a server error as an empty list', async () => {
    // "Your shop has no orders" and "we could not load them" are different
    // statements, and only one of them is a lie about the business.
    await expect(loadFailing(500).fetchCustomerOrders(DEPS)).rejects.toBeTruthy();
  });

  it('does not swallow a 401 either', async () => {
    await expect(loadFailing(401).fetchCustomerOrders(DEPS)).rejects.toBeTruthy();
  });

  it('returns null for a 404 on the DETAIL endpoint', async () => {
    await expect(loadFailing(404).fetchCustomerOrderById(999, DEPS)).resolves.toBeNull();
  });

  it('propagates a 500 from the detail endpoint', async () => {
    await expect(loadFailing(500).fetchCustomerOrderById(999, DEPS)).rejects.toBeTruthy();
  });
});
