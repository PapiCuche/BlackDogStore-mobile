import { assertBearerAllowed, BearerScopeViolationError } from '@/api/api-scope';
import {
  CAP_INVENTORY_ADJUST,
  CAP_INVENTORY_VIEW,
  isManualMovementType,
  MANUAL_MOVEMENT_TYPES,
  movementDirection,
} from '@/domain/internal/inventory-types';
import { hasUxCapability, type InternalContext } from '@/domain/internal/types';
import { branchLabel, parseBranchParam } from '@/features/internal/branch-scope';
import { visibleModules } from '@/features/internal/module-registry';
import { CUSTOMER_AUDIENCE, INTERNAL_AUDIENCE, queryKeys } from '@/providers/query-client';
import { isPrivateQueryKey, makeQueryScope } from '@/providers/query-scope';

/**
 * M7A — internal inventory on the client.
 *
 * The server enforces all three boundaries: membership, capability and BRANCH.
 * These tests pin down that the app neither blurs them while drawing nor
 * invents authority it does not have — and that the third one, which is new to
 * this module, keeps its own distinct outcome.
 */

const BASE = 'https://api.example.test';
const DEPS = { refreshCoordinator: {} as never };

type Loaded = typeof import('@/api/endpoints/internal-inventory-v1');

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
    // Built INSIDE the isolated registry: an ApiError from the outer one is a
    // different class object, and `instanceof` would quietly fail.
    const { ApiError } = require('@/api/errors');
    if (options.makeError) thrown = options.makeError(ApiError);
    module = require('@/api/endpoints/internal-inventory-v1');
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

const SUMMARY = {
  total_products: 3,
  active_products: 3,
  out_of_stock_count: 1,
  low_stock_count: 2,
  stocked_count: 4,
  total_units: 14,
  inventory_value: '1400.00',
  inventory_value_basis: 'sale_price',
  low_stock_threshold: 5,
  best_selling_product: null,
  branch: { id: 2, name: 'Centro' },
  available_branches: [
    { id: 2, name: 'Centro' },
    { id: 3, name: 'Norte' },
  ],
};

const STOCK_ROW = {
  id: 4,
  product_name: 'Producto Smoke',
  product_slug: 'producto-smoke',
  branch_id: 2,
  branch_name: 'Centro',
  quantity: 12,
  minimum_stock: 5,
  is_low_stock: false,
  is_out_of_stock: false,
  updated_at: '2026-09-01T07:30:20.022865-05:00',
};

const MOVEMENT = {
  id: 1,
  product_name: 'Producto Smoke',
  product_slug: 'producto-smoke',
  branch_id: 2,
  branch_name: 'Centro',
  movement_type: 'manual_entry',
  movement_type_label: 'Entrada manual',
  quantity: 3,
  stock_before: 12,
  stock_after: 15,
  reason: 'Conteo físico',
  reference_type: 'manual',
  actor_name: 'Ana Almacén',
  created_at: '2026-09-01T07:30:20.262168-05:00',
};

describe('the client talks to the INTERNAL inventory surface only', () => {
  it('asks the four endpoints of this tenant', async () => {
    const cases: [string, (m: Loaded) => Promise<unknown>][] = [
      ['/api/v1/internal/blackdog/inventory/summary/', (m) => m.fetchInventorySummary({}, DEPS)],
      ['/api/v1/internal/blackdog/inventory/stock/', (m) => m.fetchInventoryStock({}, DEPS)],
      [
        '/api/v1/internal/blackdog/inventory/movements/',
        (m) => m.fetchInventoryMovements({}, DEPS),
      ],
      [
        '/api/v1/internal/blackdog/inventory/adjustments/',
        (m) =>
          m.postStockAdjustment(
            {
              productSlug: 'p',
              branchId: 2,
              movementType: 'manual_entry',
              quantity: 1,
              reason: 'r',
            },
            DEPS,
          ),
      ],
    ];

    for (const [path, call] of cases) {
      const { module, send } = load({ result: { results: [] } });
      await call(module);
      expect(send.mock.calls[0]![0]).toBe(path);
    }
  });

  it('NEVER touches the legacy admin inventory', () => {
    // That surface speaks cookies and CSRF. A Bearer has no business there.
    for (const path of [
      '/api/admin/inventory/',
      '/api/admin/inventory/movements/',
      '/api/admin/stock/',
    ]) {
      expect(() => assertBearerAllowed(path, 'authenticated-v1')).toThrow(
        BearerScopeViolationError,
      );
    }
  });

  it('declares the authenticated scope on every call', async () => {
    const { module, send } = load({ result: {} });

    await module.fetchInventorySummary({}, DEPS);

    expect((send.mock.calls[0]![1] as { scope: string }).scope).toBe('authenticated-v1');
  });

  it('encodes the tenant slug', async () => {
    const { module, send } = load({ slug: 'a/b', result: {} });

    await module.fetchInventorySummary({}, DEPS);

    expect(send.mock.calls[0]![0]).toContain('/internal/a%2Fb/');
  });

  it('refuses to ask anything without a tenant', async () => {
    const { module, send } = load({ slug: null });

    await expect(module.fetchInventoryStock({}, DEPS)).rejects.toBeInstanceOf(
      module.MissingTenantError,
    );
    expect(send).not.toHaveBeenCalled();
  });

  it('sends only the filters the server understands', async () => {
    const { module, send } = load({ result: { results: [] } });

    await module.fetchInventoryStock(
      { branchId: 3, search: 'iph', lowStock: true, outOfStock: false, page: 2 },
      DEPS,
    );

    expect((send.mock.calls[0]![1] as { query: unknown }).query).toEqual({
      branch_id: 3,
      search: 'iph',
      low_stock: 'true',
      page: 2,
    });
  });

  it('omits branch_id entirely when no branch is selected', async () => {
    // Absent means "every branch I may see". Sending 0 or null would be asking
    // for a branch that does not exist.
    const { module, send } = load({ result: {} });

    await module.fetchInventorySummary({}, DEPS);

    expect((send.mock.calls[0]![1] as { query: unknown }).query).toEqual({});
  });
});

describe('the THREE failures are distinct outcomes', () => {
  it('turns a 404 WITHOUT a branch into ACCESS DENIED', async () => {
    const { module } = load({
      makeError: (ApiError) => new ApiError('not_found', 'no', { status: 404 }),
    });

    await expect(module.fetchInventorySummary({}, DEPS)).rejects.toBeInstanceOf(
      module.InternalAccessDeniedError,
    );
  });

  it('turns a 404 WITH a branch into BRANCH OUT OF SCOPE', async () => {
    // The server answers 404 rather than 403 so nobody can sweep ids to map the
    // company's branches. The app must not translate that into "your membership
    // is gone", which is a different and much louder claim.
    const { module } = load({
      makeError: (ApiError) => new ApiError('not_found', 'no', { status: 404 }),
    });

    await expect(module.fetchInventorySummary({ branchId: 99 }, DEPS)).rejects.toBeInstanceOf(
      module.BranchOutOfScopeError,
    );
  });

  it('treats an adjustment 404 as a branch problem, since one is always sent', async () => {
    const { module } = load({
      makeError: (ApiError) => new ApiError('not_found', 'no', { status: 404 }),
    });

    await expect(
      module.postStockAdjustment(
        { productSlug: 'p', branchId: 2, movementType: 'manual_entry', quantity: 1, reason: 'r' },
        DEPS,
      ),
    ).rejects.toBeInstanceOf(module.BranchOutOfScopeError);
  });

  it('turns a 403 into CAPABILITY MISSING', async () => {
    const { module } = load({
      makeError: (ApiError) => new ApiError('unauthorized', 'no', { status: 403 }),
    });

    await expect(module.fetchInventoryStock({}, DEPS)).rejects.toBeInstanceOf(
      module.InternalCapabilityMissingError,
    );
  });

  it('turns a 400 into a REJECTED MOVEMENT carrying the server words', async () => {
    const { module } = load({
      makeError: (ApiError) =>
        new ApiError('validation', 'No hay stock suficiente en esta sucursal.', { status: 400 }),
    });

    await expect(
      module.postStockAdjustment(
        { productSlug: 'p', branchId: 2, movementType: 'manual_exit', quantity: 99, reason: 'r' },
        DEPS,
      ),
    ).rejects.toThrow('No hay stock suficiente en esta sucursal.');
  });

  it('falls back to the field errors when there is no detail', async () => {
    const { module } = load({
      makeError: (ApiError) =>
        new ApiError('validation', 'HTTP 400', {
          status: 400,
          fieldErrors: { movement_type: ['Ese tipo de movimiento no puede registrarse manualmente.'] },
        }),
    });

    await expect(
      module.postStockAdjustment(
        { productSlug: 'p', branchId: 2, movementType: 'manual_entry', quantity: 1, reason: 'r' },
        DEPS,
      ),
    ).rejects.toThrow('Ese tipo de movimiento no puede registrarse manualmente.');
  });

  it('leaves a network failure alone, so the retry pipeline sees it', async () => {
    const { module } = load({
      makeError: (ApiError) => new ApiError('offline', 'sin red', { status: null }),
    });

    await expect(module.fetchInventoryStock({}, DEPS)).rejects.not.toBeInstanceOf(
      module.InternalAccessDeniedError,
    );
  });

  it('shows the domain words rather than a generic message', async () => {
    const { module } = load();

    expect(
      module.inventoryErrorMessage(new module.BranchOutOfScopeError()),
    ).toContain('sucursal');
  });
});

describe('mapping — every field verified against a real response', () => {
  it('maps the summary and CARRIES the valuation basis', () => {
    // Sale price, not cost. A screen that hardcoded the label would start
    // lying the day the backend gains a cost model.
    const { module } = load();

    const summary = module.toSummary(SUMMARY);

    expect(summary.totalUnits).toBe(14);
    expect(summary.inventoryValue).toBe('1400.00');
    expect(summary.inventoryValueBasis).toBe('sale_price');
    expect(summary.branch).toEqual({ id: 2, name: 'Centro' });
    expect(summary.availableBranches).toHaveLength(2);
  });

  it('maps a null branch to null, not to a zero branch', () => {
    const { module } = load();

    expect(module.toSummary({ ...SUMMARY, branch: null }).branch).toBeNull();
  });

  it('maps a stock row and keeps its BRANCH', () => {
    // A quantity without a place is the mistake `Product.inventory` encoded.
    const { module } = load();

    const row = module.toStockItem(STOCK_ROW);

    expect(row).toMatchObject({
      productSlug: 'producto-smoke',
      branchId: 2,
      branchName: 'Centro',
      quantity: 12,
      minimumStock: 5,
    });
  });

  it('requires the low-stock flags to be STRICTLY true', () => {
    const { module } = load();

    const row = module.toStockItem({ ...STOCK_ROW, is_low_stock: 'yes', is_out_of_stock: 1 });

    expect(row.isLowStock).toBe(false);
    expect(row.isOutOfStock).toBe(false);
  });

  it('maps a Kardex line with the branch totals', () => {
    const { module } = load();

    expect(module.toMovement(MOVEMENT)).toMatchObject({
      movementType: 'manual_entry',
      movementTypeLabel: 'Entrada manual',
      quantity: 3,
      stockBefore: 12,
      stockAfter: 15,
      actorName: 'Ana Almacén',
    });
  });

  it('never invents an actor email out of a display name', () => {
    const { module } = load();

    expect(JSON.stringify(module.toMovement(MOVEMENT))).not.toContain('@');
  });
});

describe('an adjustment is an INTENTION, never a result', () => {
  it('sends what moved and nothing about the final stock', async () => {
    const { module, send } = load({ result: MOVEMENT });

    await module.postStockAdjustment(
      {
        productSlug: 'producto-smoke',
        branchId: 2,
        movementType: 'manual_entry',
        quantity: 3,
        reason: 'Conteo físico',
      },
      DEPS,
    );

    const body = (send.mock.calls[0]![1] as { body: Record<string, unknown> }).body;

    expect(body).toEqual({
      product_slug: 'producto-smoke',
      branch_id: 2,
      movement_type: 'manual_entry',
      quantity: 3,
      reason: 'Conteo físico',
    });
    // The contract has no field for a client-computed total, and neither does
    // this client. A quantity typed on a phone is a claim about a number
    // someone else may be changing at the same moment.
    expect(Object.keys(body)).not.toContain('quantity_after');
    expect(Object.keys(body)).not.toContain('new_quantity');
  });

  it('POSTs, so nothing about it is idempotent by accident', async () => {
    const { module, send } = load({ result: MOVEMENT });

    await module.postStockAdjustment(
      { productSlug: 'p', branchId: 2, movementType: 'manual_entry', quantity: 1, reason: 'r' },
      DEPS,
    );

    expect((send.mock.calls[0]![1] as { method: string }).method).toBe('POST');
  });

  it('offers only the movement types a person may record by hand', () => {
    // Mirrors `StockMovement.MANUAL_TYPES`. `sale_exit` belongs to the payment
    // pipeline, and a hand-written transfer is stock that vanished.
    const offered = MANUAL_MOVEMENT_TYPES.map((type) => type.value);

    expect(offered).not.toContain('sale_exit');
    expect(offered).not.toContain('transfer_in');
    expect(offered).not.toContain('transfer_out');
    expect(offered).not.toContain('initial_stock');
    expect(offered).not.toContain('service_exit');
    expect(isManualMovementType('manual_entry')).toBe(true);
    expect(isManualMovementType('sale_exit')).toBe(false);
  });

  it('still RENDERS the types it cannot create', () => {
    // The Kardex shows every movement, including the ones only the server makes.
    expect(movementDirection('sale_exit')).toBe('out');
    expect(movementDirection('transfer_in')).toBe('in');
    expect(movementDirection('algo_nuevo')).toBe('unknown');
  });
});

describe('the branch is a SELECTOR, never an authority', () => {
  it('reads a positive integer and rejects everything else', () => {
    expect(parseBranchParam('3')).toBe(3);
    expect(parseBranchParam(['3'])).toBe(3);
    expect(parseBranchParam(undefined)).toBeNull();
    expect(parseBranchParam('')).toBeNull();
    expect(parseBranchParam('0')).toBeNull();
    expect(parseBranchParam('-2')).toBeNull();
    expect(parseBranchParam('2.5')).toBeNull();
    expect(parseBranchParam('../admin')).toBeNull();
  });

  it('names a branch only from the SERVER list', () => {
    const branches = [{ id: 2, name: 'Centro' }];

    expect(branchLabel(2, branches)).toBe('Centro');
    expect(branchLabel(null, branches)).toBe('Todas mis sucursales');
    // Never invents a name for an id the server did not send.
    expect(branchLabel(99, branches)).toBe('Sucursal');
  });
});

describe('capabilities decide what is DRAWN, never what is allowed', () => {
  it('shows the inventory module to someone who holds inventory.view', () => {
    const modules = visibleModules(context([CAP_INVENTORY_VIEW]));

    expect(modules.map((m) => m.key)).toEqual(['inventory']);
    expect(modules[0]!.integration).toBe('ready');
    expect(modules[0]!.route).toBe('/internal/inventory');
  });

  it('separates seeing stock from moving it', () => {
    // Two capabilities on the server, two answers here. A viewer must not be
    // offered a button that can only come back 403.
    const viewer = context([CAP_INVENTORY_VIEW]);

    expect(hasUxCapability(viewer, CAP_INVENTORY_VIEW)).toBe(true);
    expect(hasUxCapability(viewer, CAP_INVENTORY_ADJUST)).toBe(false);
  });

  it('gives an inventory-only member no sales access', () => {
    expect(
      visibleModules(context([CAP_INVENTORY_VIEW, CAP_INVENTORY_ADJUST])).map((m) => m.key),
    ).not.toContain('sales-orders');
  });
});

describe('cache — the branch is part of the question', () => {
  const scope = makeQueryScope({ tenantSlug: 'blackdog', userId: 42 });

  it('keeps inventory in the INTERNAL audience', () => {
    for (const key of [
      queryKeys.internalInventorySummary(scope, null),
      queryKeys.internalInventoryStock(scope, 2),
      queryKeys.internalInventoryMovements(scope, 2),
      queryKeys.internalInventoryRoot(scope),
    ]) {
      expect(key).toContain(INTERNAL_AUDIENCE);
      expect(key).not.toContain(CUSTOMER_AUDIENCE);
    }
  });

  it('gives two branches two different slots', () => {
    // Otherwise switching branch would show the previous shop's numbers under
    // the new shop's name — a wrong figure that looks authoritative.
    expect(queryKeys.internalInventorySummary(scope, 2)).not.toEqual(
      queryKeys.internalInventorySummary(scope, 3),
    );
    expect(queryKeys.internalInventoryStock(scope, 2)).not.toEqual(
      queryKeys.internalInventoryStock(scope, 3),
    );
  });

  it('does not confuse "all my branches" with branch zero', () => {
    expect(queryKeys.internalInventorySummary(scope, null)).not.toEqual(
      queryKeys.internalInventorySummary(scope, 0),
    );
  });

  it('separates stock from movements for the same branch', () => {
    expect(queryKeys.internalInventoryStock(scope, 2)).not.toEqual(
      queryKeys.internalInventoryMovements(scope, 2),
    );
  });

  it('separates two filter sets', () => {
    expect(queryKeys.internalInventoryStock(scope, 2, { lowStock: true })).not.toEqual(
      queryKeys.internalInventoryStock(scope, 2, {}),
    );
  });

  it('is PRIVATE, so signing out evicts it', () => {
    for (const key of [
      queryKeys.internalInventorySummary(scope, 2),
      queryKeys.internalInventoryStock(scope, 2),
      queryKeys.internalInventoryMovements(scope, null),
      queryKeys.internalInventoryRoot(scope),
    ]) {
      expect(isPrivateQueryKey(key)).toBe(true);
    }
  });

  it('gives two tenants different inventory slots', () => {
    const other = makeQueryScope({ tenantSlug: 'otra', userId: 42 });

    expect(queryKeys.internalInventoryStock(scope, 2)).not.toEqual(
      queryKeys.internalInventoryStock(other, 2),
    );
  });

  it('gives two users different inventory slots', () => {
    const other = makeQueryScope({ tenantSlug: 'blackdog', userId: 77 });

    expect(queryKeys.internalInventorySummary(scope, 2)).not.toEqual(
      queryKeys.internalInventorySummary(other, 2),
    );
  });

  it('roots the whole module under one prefix, so one invalidation covers it', () => {
    const root = queryKeys.internalInventoryRoot(scope);

    for (const key of [
      queryKeys.internalInventorySummary(scope, 2),
      queryKeys.internalInventoryStock(scope, 2),
      queryKeys.internalInventoryMovements(scope, null),
    ]) {
      expect(key.slice(0, root.length)).toEqual(root);
    }
  });

  it('does not sit under the sales orders prefix', () => {
    expect(queryKeys.internalInventoryRoot(scope)).not.toEqual(
      queryKeys.internalOrders(scope, {}),
    );
  });
});

/**
 * The structural claims.
 *
 * A source scan rather than a runtime assertion, because the failure this
 * prevents is somebody ADDING the wrong line later. A test that only exercises
 * today's call sites cannot catch tomorrow's.
 */
type FileSystem = {
  readFileSync(path: string, encoding: 'utf8'): string;
  readdirSync(path: string): string[];
  statSync(path: string): { isDirectory(): boolean };
};
type PathModule = { join(...parts: string[]): string };

const fs = jest.requireActual('fs') as FileSystem;
const nodePath = jest.requireActual('path') as PathModule;

/**
 * The CODE, without the prose.
 *
 * These files explain at length what they must never do — "NEVER
 * `/api/admin/`", "there is no `quantityAfter` here" — and a raw text search
 * would flag the warning as the violation. So the comments come out first, and
 * the assertions run on what actually executes.
 */
function executableCode(file: string): string {
  return fs
    .readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) return '';
      // A trailing comment, without eating the `//` of a URL.
      return line.replace(/(^|[^:])\/\/.*$/, '$1');
    })
    .join('\n');
}

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir).flatMap((entry: string) => {
    const full = nodePath.join(dir, entry);
    if (fs.statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}

const INVENTORY_FILES = [
  'src/api/endpoints/internal-inventory-v1.ts',
  'src/domain/internal/inventory-types.ts',
  'src/repositories/api/v1-internal-inventory-repository.ts',
  'src/hooks/use-internal-inventory.ts',
  'src/features/internal/branch-scope.ts',
  ...sourceFiles('src/app/internal/inventory'),
];

describe('structural — the module cannot drift into the wrong surface', () => {
  it('names no legacy admin path anywhere in the inventory module', () => {
    const offenders = INVENTORY_FILES.filter((file) => /\/api\/admin\//.test(executableCode(file)));

    expect(offenders).toEqual([]);
  });

  it('has no field for a client-computed stock total, in the type OR the wire', () => {
    // The absence IS the contract. A `quantityAfter` on the input type would be
    // one autocomplete away from being sent.
    const offenders = INVENTORY_FILES.filter((file) =>
      /(quantity_after|quantityAfter|new_quantity|newQuantity)/.test(executableCode(file)),
    );

    expect(offenders).toEqual([]);
  });

  it('never decides authority on the client', () => {
    // `hasUxCapability` is deliberately named so nobody reads it as `can()`.
    // A helper called `canAdjust` would invite exactly that.
    const offenders = INVENTORY_FILES.filter((file) =>
      /function\s+can[A-Z]/.test(executableCode(file)),
    );

    expect(offenders).toEqual([]);
  });

  it('reaches the token graph through the shared runtime, never a new one', () => {
    // Two coordinators over one Keychain entry rotate the refresh token against
    // each other — the M5 bug. Every repository has to keep not reopening it.
    const hook = executableCode('src/hooks/use-internal-inventory.ts');

    expect(hook).toContain('getAuthRuntime()');
    expect(hook).not.toContain('createMemoryAccessTokenStore');
    expect(hook).not.toContain('new RefreshCoordinator');
  });
});
