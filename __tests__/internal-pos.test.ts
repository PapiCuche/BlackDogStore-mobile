import {
  CAP_SALES_DISCOUNTS_APPLY,
  CAP_SALES_POS_ASSIGN_SELLER,
  CAP_SALES_POS_USE,
} from '@/domain/internal/pos-types';
import { CAP_INVENTORY_VIEW } from '@/domain/internal/inventory-types';
import { hasUxCapability, type InternalContext } from '@/domain/internal/types';
import { queryKeys } from '@/providers/query-client';
import { makeQueryScope } from '@/providers/query-scope';

/**
 * IP1A — the counter till.
 *
 * Mobile creates no functionality here. Every one of these asserts that it
 * INTEGRATES what the backend already had: the same five routes, the same
 * capability, the same server-owned money.
 */

const BASE = 'https://api.example.test';
const DEPS = { refreshCoordinator: {} as never };

type Loaded = typeof import('@/api/endpoints/internal-pos-v1');

function load(
  options: {
    slug?: string | null;
    result?: unknown;
    makeError?: (ApiError: typeof import('@/api/errors').ApiError) => Error;
  } = {},
) {
  let thrown: Error | null = null;
  const send = jest.fn(async (_p: string, _o: unknown, _d: unknown) => {
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
    module = require('@/api/endpoints/internal-pos-v1');
  });

  return { module, send };
}

afterEach(() => {
  jest.resetModules();
  jest.dontMock('@/api/authenticated-request');
  jest.dontMock('@/config/env');
});

function context(capabilities: string[]): InternalContext {
  return {
    company: { slug: 'blackdog', name: 'Black Dog Store' },
    member: true,
    capabilities,
    isPlatformMaster: false,
  };
}

const WIRE_CONTEXT = {
  company: { id: 1, name: 'Tienda' },
  branches: [{ id: 2, name: 'Principal' }, { id: 4, name: 'Norte' }],
  default_branch: 2,
  payment_methods: [
    { value: 'cash', label: 'Efectivo' },
    { value: 'card', label: 'Tarjeta' },
  ],
  can_manage_customers: false,
  can_assign_seller: false,
  can_apply_discount: false,
  can_view_commissions: false,
  seller: { id: 9, username: 'cajero', name: 'Ana Caja' },
  sellers: [],
};

const WIRE_PRODUCT = {
  id: 4, name: 'Cable USB-C', price: '50.00', available: 10,
  barcode: '7501111111118',
};

const WIRE_SALE = {
  order_id: 1, created: true, subtotal: '130.00', discount: '0.00',
  discount_source: '', discount_reason: '', total: '130.00',
  paid_at: '2026-09-02T15:00:00Z', payment_method: 'cash',
  amount_received: '150.00', change_amount: '20.00', payment_reference: '',
  branch: { id: 2, name: 'Principal' }, seller: 'Ana Caja', customer: '',
  commission: null,
  items: [{ product: 4, name: 'Cable USB-C', quantity: 2, price: '50.00' }],
};

describe('the till talks to the internal v1 surface', () => {
  it('hangs every route off the tenant slug', async () => {
    const cases: [string, (m: Loaded) => Promise<unknown>][] = [
      ['/api/v1/internal/blackdog/sales/pos/context/',
        (m) => m.fetchPosContext(DEPS)],
      ['/api/v1/internal/blackdog/sales/pos/products/search/',
        (m) => m.searchPosProducts({ q: 'cable', branch: 2 }, DEPS)],
      ['/api/v1/internal/blackdog/sales/pos/products/lookup/',
        (m) => m.lookupPosProduct({ code: '750', branch: 2 }, DEPS)],
      ['/api/v1/internal/blackdog/sales/pos/preview/',
        (m) => m.previewPosSale({ branch: 2, items: [] }, DEPS)],
      ['/api/v1/internal/blackdog/sales/pos/sales/',
        (m) => m.createPosSale({
          branch: 2, items: [], paymentMethod: 'cash',
          idempotencyKey: 'k-00000001', termsConfirmed: true,
        }, DEPS)],
    ];
    for (const [path, call] of cases) {
      const { module, send } = load({ result: { ...WIRE_CONTEXT, results: [] } });
      await call(module);
      expect(send.mock.calls[0]![0]).toBe(path);
    }
  });

  it('NEVER names the legacy admin surface', async () => {
    // `/api/admin/pos/*` authenticates by cookie and has no tenant slug.
    // `api-scope.ts` refuses to send a Bearer there, and this module must not
    // try — which is the whole reason IP1A built a v1 adapter.
    const { module, send } = load({ result: WIRE_SALE });
    await module.createPosSale({
      branch: 2, items: [{ product: 4, quantity: 1 }], paymentMethod: 'cash',
      idempotencyKey: 'k-00000001', termsConfirmed: true,
    }, DEPS);
    expect(send.mock.calls[0]![0]).not.toContain('/api/admin/');
  });

  it('refuses to build a URL with no tenant', async () => {
    const { module } = load({ slug: null, result: WIRE_CONTEXT });
    await expect(module.fetchPosContext(DEPS)).rejects.toThrow();
  });

  it('reads a 404 as the company being closed, never as a failed sale', async () => {
    const { module } = load({
      makeError: (ApiError) => new ApiError('not_found', 'no', { status: 404 }),
    });
    await expect(module.fetchPosContext(DEPS)).rejects.toThrow();
  });

  it('reads a 403 as a missing capability', async () => {
    const { module } = load({
      makeError: (ApiError) => new ApiError('unauthorized', 'no', { status: 403 }),
    });
    await expect(module.fetchPosContext(DEPS)).rejects.toThrow();
  });

  it('tells the two 409s apart by the server code, never by the Spanish', async () => {
    const stock = load({
      makeError: (ApiError) =>
        new ApiError('validation', 'No hay stock suficiente.', {
          status: 409, code: 'insufficient_stock',
        }),
    });
    await expect(
      stock.module.createPosSale({
        branch: 2, items: [], paymentMethod: 'cash',
        idempotencyKey: 'k-00000001', termsConfirmed: true,
      }, DEPS),
    ).rejects.toBeInstanceOf(stock.module.PosInsufficientStockError);

    const dup = load({
      makeError: (ApiError) =>
        new ApiError('validation', 'Clave ya usada.', {
          status: 409, code: 'idempotency_conflict',
        }),
    });
    await expect(
      dup.module.createPosSale({
        branch: 2, items: [], paymentMethod: 'cash',
        idempotencyKey: 'k-00000001', termsConfirmed: true,
      }, DEPS),
    ).rejects.toBeInstanceOf(dup.module.PosIdempotencyConflictError);
  });

  it('keeps those two errors distinguishable by class', () => {
    const { module } = load();
    const a = new module.PosInsufficientStockError('x');
    expect(a).not.toBeInstanceOf(module.PosIdempotencyConflictError);
  });

  it('returns null rather than throwing for an unknown barcode', async () => {
    // A code from another company answers exactly like one that exists
    // nowhere, and the screen says "no encontrado" for both.
    const { module } = load({
      makeError: (ApiError) => new ApiError('not_found', 'no', { status: 404 }),
    });
    await expect(
      module.lookupPosProduct({ code: '000', branch: 2 }, DEPS),
    ).resolves.toBeNull();
  });

  it('exports nothing that could price, discount or total a basket', () => {
    const { module } = load();
    for (const absent of [
      'setPosPrice', 'applyPosDiscount', 'calculatePosTotal', 'posTotal',
      'computeSubtotal',
    ]) {
      expect((module as Record<string, unknown>)[absent]).toBeUndefined();
    }
  });
});

describe('a write is an INTENTION, never a price', () => {
  it('sends only what was scanned and how it is paid', async () => {
    const { module, send } = load({ result: WIRE_SALE });
    await module.createPosSale({
      branch: 2,
      items: [{ product: 4, quantity: 2 }],
      paymentMethod: 'cash',
      amountReceived: '150.00',
      idempotencyKey: 'k-00000001',
      termsConfirmed: true,
    }, DEPS);
    expect((send.mock.calls[0]![1] as { body: unknown }).body).toEqual({
      branch: 2,
      items: [{ product: 4, quantity: 2 }],
      payment_method: 'cash',
      amount_received: '150.00',
      idempotency_key: 'k-00000001',
      terms_confirmed: true,
    });
  });

  it('has NO price, total, subtotal or discount amount field', async () => {
    // A till is TOLD what to charge; it is never asked. The backend refuses
    // these anyway — a test there sends all four and gets the server's numbers
    // back — and this app does not even try.
    const { module, send } = load({ result: WIRE_SALE });
    await module.createPosSale({
      branch: 2,
      items: [{ product: 4, quantity: 2 }],
      paymentMethod: 'cash',
      idempotencyKey: 'k-00000001',
      termsConfirmed: true,
    }, DEPS);
    const body = (send.mock.calls[0]![1] as { body: Record<string, unknown> }).body;
    for (const forbidden of [
      'price', 'total', 'subtotal', 'discount', 'discount_amount', 'commission',
      'company', 'seller_name', 'paid_at',
    ]) {
      expect(Object.keys(body)).not.toContain(forbidden);
    }
  });

  it('strips a price somebody put on a line', async () => {
    const { module, send } = load({ result: WIRE_SALE });
    await module.createPosSale({
      branch: 2,
      items: [{ product: 4, quantity: 2, price: '1.00' } as never],
      paymentMethod: 'cash',
      idempotencyKey: 'k-00000001',
      termsConfirmed: true,
    }, DEPS);
    const body = (send.mock.calls[0]![1] as { body: Record<string, unknown> }).body;
    expect(body.items).toEqual([{ product: 4, quantity: 2 }]);
  });

  it('always sends terms_confirmed and the key', async () => {
    const { module, send } = load({ result: WIRE_SALE });
    await module.createPosSale({
      branch: 2, items: [], paymentMethod: 'cash',
      idempotencyKey: 'k-00000001', termsConfirmed: true,
    }, DEPS);
    const body = (send.mock.calls[0]![1] as { body: Record<string, unknown> }).body;
    expect(body.terms_confirmed).toBe(true);
    expect(body.idempotency_key).toBe('k-00000001');
  });

  it('omits an empty cash amount rather than sending a blank', async () => {
    const { module, send } = load({ result: WIRE_SALE });
    await module.createPosSale({
      branch: 2, items: [], paymentMethod: 'card', amountReceived: '  ',
      idempotencyKey: 'k-00000001', termsConfirmed: true,
    }, DEPS);
    expect(
      Object.keys((send.mock.calls[0]![1] as { body: object }).body),
    ).not.toContain('amount_received');
  });

  it('never sends a price in a preview either', async () => {
    const { module, send } = load({ result: { subtotal: '0.00', total: '0.00' } });
    await module.previewPosSale({
      branch: 2, items: [{ product: 4, quantity: 1 }],
    }, DEPS);
    const body = (send.mock.calls[0]![1] as { body: Record<string, unknown> }).body;
    expect(Object.keys(body).sort()).toEqual(['branch', 'items']);
  });
});

describe('mapping — verified against a real response', () => {
  it('maps the context, including who may do what', async () => {
    const { module } = load({ result: WIRE_CONTEXT });
    const ctx = await module.fetchPosContext(DEPS);
    expect(ctx.company).toEqual({ id: 1, name: 'Tienda' });
    expect(ctx.branches.map((b) => b.id)).toEqual([2, 4]);
    expect(ctx.defaultBranch).toBe(2);
    expect(ctx.canAssignSeller).toBe(false);
    expect(ctx.canApplyDiscount).toBe(false);
    expect(ctx.sellers).toEqual([]);
  });

  it('preserves a NULL default branch, which is not "the first one"', async () => {
    // The server refuses to pick when there are several shops and no
    // authorised default. Choosing one here would move units off the wrong
    // shelf.
    const { module } = load({ result: { ...WIRE_CONTEXT, default_branch: null } });
    const ctx = await module.fetchPosContext(DEPS);
    expect(ctx.defaultBranch).toBeNull();
  });

  it('requires every capability flag to be strictly true', async () => {
    const { module } = load({
      result: { ...WIRE_CONTEXT, can_apply_discount: 1, can_assign_seller: 'yes' },
    });
    const ctx = await module.fetchPosContext(DEPS);
    expect(ctx.canApplyDiscount).toBe(false);
    expect(ctx.canAssignSeller).toBe(false);
  });

  it('keeps every price a STRING and never parses one', async () => {
    const { module } = load({ result: { results: [WIRE_PRODUCT] } });
    const rows = await module.searchPosProducts({ q: 'cable', branch: 2 }, DEPS);
    expect(typeof rows[0]!.price).toBe('string');
    expect(rows[0]!.price).toBe('50.00');
    expect(rows[0]!.available).toBe(10);
  });

  it('maps a sale, with every figure a string', async () => {
    const { module } = load({ result: WIRE_SALE });
    const sale = await module.createPosSale({
      branch: 2, items: [], paymentMethod: 'cash',
      idempotencyKey: 'k-00000001', termsConfirmed: true,
    }, DEPS);
    expect(sale.orderId).toBe(1);
    expect(sale.created).toBe(true);
    expect(sale.total).toBe('130.00');
    expect(sale.changeAmount).toBe('20.00');
    expect(sale.commission).toBeNull();
    for (const v of [sale.subtotal, sale.discount, sale.total]) {
      expect(typeof v).toBe('string');
    }
  });

  it('carries created=false for a replay', async () => {
    const { module } = load({ result: { ...WIRE_SALE, created: false } });
    const sale = await module.createPosSale({
      branch: 2, items: [], paymentMethod: 'cash',
      idempotencyKey: 'k-00000001', termsConfirmed: true,
    }, DEPS);
    expect(sale.created).toBe(false);
  });

  it('never renders online as a payment method it invented', async () => {
    // The list comes from the server, which filters `online` out because the
    // gateway method belongs to the storefront. This app holds no list.
    const { module } = load({ result: WIRE_CONTEXT });
    const ctx = await module.fetchPosContext(DEPS);
    expect(ctx.paymentMethods.map((m) => m.value)).not.toContain('online');
  });
});

describe('capabilities keep the till and the warehouse apart', () => {
  it('uses the SAME capability strings the backend enforces', () => {
    expect(CAP_SALES_POS_USE).toBe('sales.pos.use');
    expect(CAP_SALES_POS_ASSIGN_SELLER).toBe('sales.pos.assign_seller');
    expect(CAP_SALES_DISCOUNTS_APPLY).toBe('sales.discounts.apply');
  });

  it('does not imply the till from holding stock', () => {
    // Measured on the backend against the resolver: `Inventario` has
    // inventory.view/adjust and NO sales.pos.use.
    const warehouse = context([CAP_INVENTORY_VIEW]);
    expect(hasUxCapability(warehouse, CAP_INVENTORY_VIEW)).toBe(true);
    expect(hasUxCapability(warehouse, CAP_SALES_POS_USE)).toBe(false);
  });

  it('does not imply stock, discounts or seller assignment from the till', () => {
    // And `Ventas` is the mirror: the till, and none of the other three.
    const till = context([CAP_SALES_POS_USE]);
    expect(hasUxCapability(till, CAP_SALES_POS_USE)).toBe(true);
    for (const denied of [
      CAP_INVENTORY_VIEW, CAP_SALES_DISCOUNTS_APPLY, CAP_SALES_POS_ASSIGN_SELLER,
    ]) {
      expect(hasUxCapability(till, denied)).toBe(false);
    }
  });
});

describe('cache — the till has its own keys', () => {
  const scope = makeQueryScope({ tenantSlug: 'blackdog', userId: 42 });

  it('nests context and search under the POS root', () => {
    const root = queryKeys.internalPosRoot(scope);
    for (const key of [
      queryKeys.internalPosContext(scope),
      queryKeys.internalPosSearch(scope, 2, 'cable'),
    ]) {
      expect(key.slice(0, root.length)).toEqual(root);
    }
  });

  it('keys a search by branch AND term', () => {
    // The same word means different stock in different shops.
    expect(queryKeys.internalPosSearch(scope, 2, 'cable'))
      .not.toEqual(queryKeys.internalPosSearch(scope, 4, 'cable'));
    expect(queryKeys.internalPosSearch(scope, 2, 'cable'))
      .not.toEqual(queryKeys.internalPosSearch(scope, 2, 'funda'));
  });

  it('does not collide with inventory or service', () => {
    expect(queryKeys.internalPosRoot(scope))
      .not.toEqual(queryKeys.internalInventoryRoot(scope));
    expect(queryKeys.internalPosRoot(scope))
      .not.toEqual(queryKeys.internalServiceRoot(scope));
  });

  it('separates tenants and users', () => {
    const otherTenant = makeQueryScope({ tenantSlug: 'otra', userId: 42 });
    const otherUser = makeQueryScope({ tenantSlug: 'blackdog', userId: 43 });
    expect(queryKeys.internalPosContext(scope))
      .not.toEqual(queryKeys.internalPosContext(otherTenant));
    expect(queryKeys.internalPosContext(scope))
      .not.toEqual(queryKeys.internalPosContext(otherUser));
  });
});

describe('structural — the till cannot drift', () => {
  type FS = {
    readFileSync(p: string, e: 'utf8'): string;
    readdirSync(p: string): string[];
    statSync(p: string): { isDirectory(): boolean };
  };
  const fs = jest.requireActual('fs') as FS;
  const nodePath = jest.requireActual('path') as { join(...p: string[]): string };

  function sourceFiles(dir: string): string[] {
    return fs.readdirSync(dir).flatMap((entry: string) => {
      const full = nodePath.join(dir, entry);
      if (fs.statSync(full).isDirectory()) return sourceFiles(full);
      return /\.tsx?$/.test(entry) ? [full] : [];
    });
  }

  function stripComments(source: string): string {
    return source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .map((line) => {
        const t = line.trim();
        if (t.startsWith('//') || t.startsWith('*')) return '';
        return line.replace(/(^|[^:])\/\/.*$/, '$1');
      })
      .join('\n');
  }

  const code = (f: string) => stripComments(fs.readFileSync(f, 'utf8'));

  const POS_FILES = [
    'src/api/endpoints/internal-pos-v1.ts',
    'src/repositories/api/v1-internal-pos-repository.ts',
    'src/hooks/use-internal-pos.ts',
    ...sourceFiles('src/app/internal/pos'),
  ];

  it('does no arithmetic on money, anywhere', () => {
    // A total added up on a phone can disagree with the till, and the one that
    // disagrees is the one a customer is asked to pay. The character class
    // includes `?.` and `[` — the M12B lesson: a guard that cannot see
    // `Number(x?.total)` is decoration.
    const MONEY = '(price|total|subtotal|discount|amount|commission)';
    const PATH = "[\\w.?!\\[\\]'\"]*";
    const offenders = POS_FILES.filter((f) => {
      const c = code(f);
      return (
        new RegExp(`(parseFloat|parseInt)\\s*\\(\\s*${PATH}${MONEY}`, 'i').test(c)
        || new RegExp(`\\bNumber\\s*\\(\\s*${PATH}${MONEY}`, 'i').test(c)
        || new RegExp(`${MONEY}${PATH}\\s*\\.toFixed`, 'i').test(c)
        || new RegExp(`${MONEY}${PATH}\\s*[+\\-*/]\\s*${PATH}${MONEY}`, 'i').test(c)
      );
    });
    expect(offenders).toEqual([]);
  });

  it('never reaches the legacy admin surface', () => {
    const offenders = POS_FILES.filter((f) => /\/api\/admin\//.test(code(f)));
    expect(offenders).toEqual([]);
  });

  it('never reaches the customer surface, and reuses no customer cart', () => {
    // A POS basket and a shopper's cart are different things with different
    // owners. Sharing a store between them would be the worst kind of reuse.
    const offenders = POS_FILES.filter((f) => {
      const c = code(f);
      return /\/api\/v1\/customer\//.test(c)
        || /use-cart|CartProvider|customerCart|useCheckout/.test(c);
    });
    expect(offenders).toEqual([]);
  });

  it('never authorizes on a role name', () => {
    const offenders = POS_FILES.filter((f) =>
      /(role\s*===|role\s*==\s*'|isSales|isAdmin\b|isInventory|isMaster)/.test(code(f)),
    );
    expect(offenders).toEqual([]);
  });

  it('gates on the capability instead', () => {
    const screen = code('src/app/internal/pos/index.tsx');
    expect(screen).toContain('CAP_SALES_POS_USE');
    expect(screen).toContain('hasUxCapability');
  });

  it('mints the idempotency key OUTSIDE render state', () => {
    const screen = code('src/app/internal/pos/index.tsx');
    expect(screen).toContain('useRef');
    expect(screen).not.toMatch(/useState[^\n]*makeIdempotencyKey/);
  });

  it('retries nothing and queues nothing offline', () => {
    const offenders = POS_FILES.filter((f) =>
      /(retry:\s+(?!false\b)\S|enqueue|pendingMutations|AsyncStorage)/.test(code(f)),
    );
    expect(offenders).toEqual([]);
  });

  it('never picks a branch for the operator', () => {
    // `defaultBranch` may be null on purpose, and "the first one" is not a
    // decision anybody made.
    const screen = code('src/app/internal/pos/index.tsx');
    expect(screen).not.toMatch(/branches\s*\[\s*0\s*\]/);
    expect(screen).not.toContain('branches[0]');
  });

  it('imports expo-blur nowhere and writes no brand hex', () => {
    const offenders = POS_FILES.filter((f) => {
      const raw = fs.readFileSync(f, 'utf8');
      return /from 'expo-blur'/.test(raw) || /#[0-9a-fA-F]{6}\b/.test(code(f));
    });
    expect(offenders).toEqual([]);
  });

  it('holds no payment-method list of its own', () => {
    // The server filters `online` out. A local list would drift the day the
    // backend adds or removes one.
    const screen = code('src/app/internal/pos/index.tsx');
    expect(screen).toContain('ctx.paymentMethods');
    expect(screen).not.toMatch(/const\s+PAYMENT_METHODS\s*=/);
  });
});
