import {
  CAP_SALES_ORDERS_MANAGE,
  CAP_SALES_ORDERS_VIEW,
  hasUxCapability,
  type InternalContext,
} from '@/domain/internal/types';
import { visibleModules, INTERNAL_MODULES } from '@/features/internal/module-registry';
import { queryKeys, CUSTOMER_AUDIENCE, INTERNAL_AUDIENCE } from '@/providers/query-client';
import { isPrivateQueryKey, makeQueryScope } from '@/providers/query-scope';
import { assertBearerAllowed, BearerScopeViolationError } from '@/api/api-scope';

/**
 * M6 — the internal audience on the client.
 *
 * The server enforces the boundary; these tests pin down that the app does not
 * blur it while drawing, and that internal data can never share a cache slot
 * with customer data.
 */

const BASE = 'https://api.example.test';
const DEPS = { refreshCoordinator: {} as never };

type Loaded = typeof import('@/api/endpoints/internal-v1');

function load(
  options: {
    slug?: string | null;
    result?: unknown;
    makeError?: (ApiError: typeof import('@/api/errors').ApiError) => Error;
  } = {},
) {
  let thrown: Error | null = null;
  const send = jest.fn(async (_path: string, _opts: unknown, _deps: unknown) => {
    if (thrown) throw thrown;
    return options.result ?? {};
  });

  let module!: Loaded;
  jest.isolateModules(() => {
    jest.doMock('@/api/authenticated-request', () => ({
      authenticatedRequest: (p: string, o: unknown, d: unknown) => send(p, o, d),
    }));
    jest.doMock('@/config/env', () => ({
      ...jest.requireActual('@/config/env'),
      companySlug: options.slug === undefined ? 'blackdog' : options.slug,
      apiBaseUrl: BASE,
      isApiConfigured: true,
    }));
    const { ApiError } = require('@/api/errors');
    if (options.makeError) thrown = options.makeError(ApiError);
    module = require('@/api/endpoints/internal-v1');
  });

  return { module, send };
}

afterEach(() => {
  jest.resetModules();
  jest.dontMock('@/api/authenticated-request');
  jest.dontMock('@/config/env');
});

function context(capabilities: string[], isMaster = false): InternalContext {
  return {
    company: { slug: 'blackdog', name: 'Black Dog Store' },
    member: true,
    capabilities,
    isPlatformMaster: isMaster,
  };
}

describe('the client talks to the INTERNAL surface only', () => {
  it('asks for the internal context of this tenant', async () => {
    const { module, send } = load({ result: { company: { slug: 'blackdog' } } });

    await module.fetchInternalContext(DEPS);

    expect(send.mock.calls[0]![0]).toBe('/api/v1/internal/blackdog/context/');
  });

  it('asks for the internal ORDERS, not the customer ones', async () => {
    const { module, send } = load({ result: { count: 0, results: [] } });

    await module.fetchInternalOrders({}, DEPS);

    const path = send.mock.calls[0]![0];
    expect(path).toBe('/api/v1/internal/blackdog/orders/');
    expect(path).not.toContain('/customer/');
  });

  it('NEVER touches the legacy admin surface', () => {
    // That surface speaks cookies and CSRF. A Bearer has no business there.
    for (const path of ['/api/admin/orders/', '/api/admin/orders/1/']) {
      expect(() => assertBearerAllowed(path, 'authenticated-v1')).toThrow(
        BearerScopeViolationError,
      );
    }
  });

  it('declares the authenticated scope', async () => {
    const { module, send } = load({ result: {} });

    await module.fetchInternalContext(DEPS);

    expect((send.mock.calls[0]![1] as { scope: string }).scope).toBe('authenticated-v1');
  });

  it('encodes the tenant slug', async () => {
    const { module, send } = load({ slug: 'a/b', result: {} });

    await module.fetchInternalContext(DEPS);

    expect(send.mock.calls[0]![0]).toContain('/internal/a%2Fb/');
  });

  it('refuses to ask anything without a tenant', async () => {
    const { module, send } = load({ slug: null });

    await expect(module.fetchInternalContext(DEPS)).rejects.toBeInstanceOf(
      module.MissingTenantError,
    );
    expect(send).not.toHaveBeenCalled();
  });
});

describe('the two failures are distinct outcomes', () => {
  it('turns a 404 into ACCESS DENIED — you do not belong here', async () => {
    const { module } = load({
      makeError: (ApiError) => new ApiError('not_found', 'no', { status: 404 }),
    });

    await expect(module.fetchInternalContext(DEPS)).rejects.toBeInstanceOf(
      module.InternalAccessDeniedError,
    );
  });

  it('turns a 403 into CAPABILITY MISSING — you belong, but may not', async () => {
    const { module } = load({
      makeError: (ApiError) => new ApiError('unauthorized', 'no', { status: 403 }),
    });

    await expect(module.fetchInternalOrders({}, DEPS)).rejects.toBeInstanceOf(
      module.InternalCapabilityMissingError,
    );
  });

  it('leaves a network failure alone, so the retry pipeline sees it', async () => {
    const { module } = load({
      makeError: (ApiError) => new ApiError('offline', 'sin red', { status: null }),
    });

    await expect(module.fetchInternalOrders({}, DEPS)).rejects.not.toBeInstanceOf(
      module.InternalAccessDeniedError,
    );
  });
});

describe('mapping', () => {
  it('maps a context', () => {
    const { module } = load();

    expect(
      module.toInternalContext({
        company: { slug: 'blackdog', name: 'Black Dog' },
        member: true,
        capabilities: ['sales.orders.view'],
        platform: { is_master: false },
      }),
    ).toEqual({
      company: { slug: 'blackdog', name: 'Black Dog' },
      member: true,
      capabilities: ['sales.orders.view'],
      isPlatformMaster: false,
    });
  });

  it('requires member to be STRICTLY true', () => {
    const { module } = load();

    expect(module.toInternalContext({ member: 'yes' }).member).toBe(false);
  });

  it('maps the SERVER-supplied transitions', () => {
    // There is deliberately no transition table in this app.
    const { module } = load();

    const detail = module.toOrderDetail({
      id: 1,
      available_fulfillment_transitions: ['preparing', 'shipped', 'inventado'],
    });

    expect(detail.availableFulfillmentTransitions).toEqual(['preparing', 'shipped']);
  });

  it('never guesses an unknown payment status into paid', () => {
    const { module } = load();

    expect(module.toOrderDetail({ id: 1, status: 'raro' }).paymentStatus).toBe('pending_payment');
  });

  it('maps an unknown fulfilment status to null, not to pending', () => {
    const { module } = load();

    expect(module.toOrderDetail({ id: 1, fulfillment_status: 'raro' }).fulfillmentStatus)
      .toBeNull();
  });
});

describe('the module registry decides what to DRAW', () => {
  it('shows sales orders with the view capability', () => {
    const modules = visibleModules(context([CAP_SALES_ORDERS_VIEW]));

    expect(modules.map((m) => m.key)).toEqual(['sales-orders']);
    expect(modules[0]!.integration).toBe('ready');
  });

  it('shows NOTHING to a context with no capabilities', () => {
    expect(visibleModules(context([]))).toEqual([]);
  });

  it('shows nothing for a null context', () => {
    expect(visibleModules(null)).toEqual([]);
  });

  it('does NOT list modules the person lacks', () => {
    // Telling someone which permissions they do not have describes the
    // company's structure to them, and they did not ask.
    const modules = visibleModules(context([CAP_SALES_ORDERS_VIEW]));

    expect(modules.map((m) => m.key)).not.toContain('inventory');
  });

  it('inventory is READY now that M7A built it', () => {
    // Was `pending-mobile` through M6: the backend had enforced `inventory.view`
    // since Phase 2D and this app had no screen, so the registry said so rather
    // than drawing a tile that led nowhere. M7A built the screen.
    const modules = visibleModules(context(['inventory.view']));

    expect(modules.map((m) => m.key)).toEqual(['inventory']);
    expect(modules[0]!.integration).toBe('ready');
    expect(modules[0]!.route).toBe('/internal/inventory');
  });

  it('still refuses to draw a tile for a module with no screen', () => {
    // The rule outlives the example. Customers is the current one.
    const modules = visibleModules(context(['service.customers.view']));

    expect(modules.map((m) => m.key)).toEqual(['customers']);
    expect(modules[0]!.integration).toBe('pending-mobile');
    expect(modules[0]!.route).toBeUndefined();
  });

  it('technical service is READY now that M8 built both sides', () => {
    // Was `pending-domain` through M7A — neither the backend model nor the
    // screen existed. M8 built `RepairOrder` and the screens that read it.
    const service = INTERNAL_MODULES.find((m) => m.key === 'service');

    expect(service!.integration).toBe('ready');
    expect(service!.route).toBe('/internal/service');
    expect(service!.requires).toBe('service.orders.view');
  });

  it('no module claims a domain that does not exist', () => {
    // The `pending-domain` state is not retired, it is unused: every module in
    // the registry now has a backend. It comes back the day somebody adds one
    // that does not.
    expect(INTERNAL_MODULES.map((m) => m.integration)).not.toContain('pending-domain');
  });

  it('an inventory-only user gets no fake Sales access', () => {
    const inventory = context(['inventory.view', 'inventory.adjust']);

    expect(hasUxCapability(inventory, CAP_SALES_ORDERS_VIEW)).toBe(false);
    expect(visibleModules(inventory).map((m) => m.key)).not.toContain('sales-orders');
  });

  it('a custom role is read as capabilities, not as a coarse role', () => {
    const custom = context([CAP_SALES_ORDERS_VIEW]);

    expect(hasUxCapability(custom, CAP_SALES_ORDERS_VIEW)).toBe(true);
    expect(hasUxCapability(custom, CAP_SALES_ORDERS_MANAGE)).toBe(false);
  });

  it('every ready module has a route and every pending one does not', () => {
    for (const module of INTERNAL_MODULES) {
      if (module.integration === 'ready') expect(module.route).toBeTruthy();
      else expect(module.route).toBeUndefined();
    }
  });
});

describe('cache keeps the audiences apart', () => {
  const scope = makeQueryScope({ tenantSlug: 'blackdog', userId: 42 });

  it('internal keys use the INTERNAL audience', () => {
    for (const key of [
      queryKeys.internalContext(scope),
      queryKeys.internalOrders(scope, {}),
      queryKeys.internalOrder(scope, 1),
    ]) {
      expect(key).toContain(INTERNAL_AUDIENCE);
      expect(key).not.toContain(CUSTOMER_AUDIENCE);
    }
  });

  it('customer keys never use the internal audience', () => {
    expect(queryKeys.orders(scope)).not.toContain(INTERNAL_AUDIENCE);
    expect(queryKeys.order(scope, 1)).not.toContain(INTERNAL_AUDIENCE);
  });

  it('an internal order and a customer order with the SAME id differ', () => {
    // The dangerous collision: company data landing where a customer screen
    // reads its own.
    expect(queryKeys.internalOrder(scope, 7)).not.toEqual(queryKeys.order(scope, 7));
  });

  it('internal keys are PRIVATE, so logout evicts them', () => {
    // Recognised by shape rather than by a registry, so a new private query
    // cannot forget to register itself.
    for (const key of [
      queryKeys.internalContext(scope),
      queryKeys.internalOrders(scope, {}),
      queryKeys.internalOrder(scope, 1),
    ]) {
      expect(isPrivateQueryKey(key)).toBe(true);
    }
  });

  it('two tenants get different internal keys', () => {
    const other = makeQueryScope({ tenantSlug: 'otra', userId: 42 });

    expect(queryKeys.internalOrders(scope, {})).not.toEqual(
      queryKeys.internalOrders(other, {}),
    );
  });

  it('two users get different internal keys', () => {
    const other = makeQueryScope({ tenantSlug: 'blackdog', userId: 77 });

    expect(queryKeys.internalContext(scope)).not.toEqual(queryKeys.internalContext(other));
  });

  it('the PUBLIC catalogue stays outside the private namespace', () => {
    expect(isPrivateQueryKey(queryKeys.products(scope))).toBe(false);
  });
});
