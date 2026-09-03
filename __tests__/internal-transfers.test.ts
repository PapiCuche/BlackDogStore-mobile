import {
  CAP_INVENTORY_ADJUST,
  CAP_INVENTORY_VIEW,
} from '@/domain/internal/inventory-types';
import { hasUxCapability, type InternalContext } from '@/domain/internal/types';
import { queryKeys } from '@/providers/query-client';
import { makeQueryScope } from '@/providers/query-scope';

/**
 * IP1B — inter-branch transfers.
 *
 * Mobile creates no functionality here. Every assertion below is that it
 * INTEGRATES what the backend already had: the same six routes, the same two
 * capabilities, the same server-owned state machine. Verified against
 * `PapiCuche/BlackDogStore-web` @ `origin/master` `8a1e581` with a live smoke.
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

const WIRE_TRANSFER = {
  id: 7,
  company: 1,
  source_branch: 2,
  source_branch_name: 'Principal',
  destination_branch: 4,
  destination_branch_name: 'Norte',
  status: 'draft',
  status_label: 'Borrador',
  reason: 'Reposición',
  reference: 'REF-1',
  items: [
    { id: 11, product: 4, product_name: 'Cable USB-C', product_slug: 'cable-usb-c', quantity: 3 },
  ],
  total_units: 3,
  created_by: 9,
  created_by_username: 'almacen',
  created_at: '2026-09-02T10:00:00Z',
  dispatched_at: null,
  received_at: null,
  cancelled_at: null,
};

describe('transfers talk to the internal v1 surface', () => {
  it('hangs every route off the tenant slug', async () => {
    const cases: [string, (m: Loaded) => Promise<unknown>][] = [
      ['/api/v1/internal/blackdog/inventory/transfers/',
        (m) => m.fetchTransfers({}, DEPS)],
      ['/api/v1/internal/blackdog/inventory/transfers/7/',
        (m) => m.fetchTransfer(7, DEPS)],
      ['/api/v1/internal/blackdog/inventory/transfers/7/items/',
        (m) => m.setTransferItem(7, { productSlug: 'cable-usb-c', quantity: 3 }, DEPS)],
      ['/api/v1/internal/blackdog/inventory/transfers/7/dispatch/',
        (m) => m.dispatchTransfer(7, DEPS)],
      ['/api/v1/internal/blackdog/inventory/transfers/7/receive/',
        (m) => m.receiveTransfer(7, DEPS)],
      ['/api/v1/internal/blackdog/inventory/transfers/7/cancel/',
        (m) => m.cancelTransfer(7, DEPS)],
    ];
    for (const [path, run] of cases) {
      const { module, send } = load({ result: WIRE_TRANSFER });
      await run(module);
      expect(send.mock.calls[0]![0]).toBe(path);
    }
  });

  it('sends every request on the authenticated-v1 scope, never the admin one', async () => {
    // `api-scope.ts` structurally forbids a Bearer on `/api/admin/`. This is
    // the other half: these calls must never ask for that scope in the first
    // place, because the legacy surface speaks cookies and CSRF.
    const { module, send } = load({ result: WIRE_TRANSFER });
    await module.fetchTransfers({}, DEPS);
    await module.dispatchTransfer(7, DEPS);
    for (const call of send.mock.calls) {
      expect((call[1] as { scope: string }).scope).toBe('authenticated-v1');
      expect(call[0]).not.toContain('/api/admin/');
    }
  });

  it('reads the whole document out of the wire shape', async () => {
    const { module } = load({ result: WIRE_TRANSFER });
    const transfer = await module.fetchTransfer(7, DEPS);
    expect(transfer).toMatchObject({
      id: 7,
      sourceBranch: 2,
      sourceBranchName: 'Principal',
      destinationBranch: 4,
      destinationBranchName: 'Norte',
      status: 'draft',
      statusLabel: 'Borrador',
      totalUnits: 3,
      createdByUsername: 'almacen',
      dispatchedAt: null,
    });
    expect(transfer.items[0]).toMatchObject({
      id: 11, product: 4, productName: 'Cable USB-C', productSlug: 'cable-usb-c', quantity: 3,
    });
  });

  it('names an article by slug, which is the only name the stock list gives', async () => {
    // `/inventory/stock/` returns `product_slug` and NO product id. Sending a
    // pk would mean this app had gone to `/api/admin/` for it.
    const { module, send } = load({ result: WIRE_TRANSFER });
    await module.setTransferItem(7, { productSlug: 'cable-usb-c', quantity: 3 }, DEPS);
    const body = (send.mock.calls[0]![1] as { body: Record<string, unknown> }).body;
    expect(body).toEqual({ product_slug: 'cable-usb-c', quantity: 3 });
    expect(body).not.toHaveProperty('product');
  });

  it('sends zero rather than a delete, because that is the contract', async () => {
    const { module, send } = load({ result: { ...WIRE_TRANSFER, total_units: 0, items: [] } });
    await module.setTransferItem(7, { productSlug: 'cable-usb-c', quantity: 0 }, DEPS);
    expect((send.mock.calls[0]![1] as { method: string }).method).toBe('PUT');
    expect((send.mock.calls[0]![1] as { body: Record<string, unknown> }).body.quantity).toBe(0);
  });

  it('opens a draft with two branches and nothing else authoritative', async () => {
    const { module, send } = load({ result: WIRE_TRANSFER });
    await module.createTransfer(
      { sourceBranch: 2, destinationBranch: 4, reason: 'Reposición' }, DEPS,
    );
    const body = (send.mock.calls[0]![1] as { body: Record<string, unknown> }).body;
    expect(body).toEqual({ source_branch: 2, destination_branch: 4, reason: 'Reposición' });
    // No status, no company, no stock figure: this app asserts none of those.
    expect(body).not.toHaveProperty('status');
    expect(body).not.toHaveProperty('company');
  });

  it('posts an empty body to each transition, naming the act in the path', async () => {
    // One route per ACT, never a status field. A single "set the status" call
    // would let this app assert `received` for stock that never left.
    for (const [run, tail] of [
      [(m: Loaded) => m.dispatchTransfer(7, DEPS), 'dispatch/'],
      [(m: Loaded) => m.receiveTransfer(7, DEPS), 'receive/'],
      [(m: Loaded) => m.cancelTransfer(7, DEPS), 'cancel/'],
    ] as [(m: Loaded) => Promise<unknown>, string][]) {
      const { module, send } = load({ result: WIRE_TRANSFER });
      await run(module);
      expect(send.mock.calls[0]![0]).toContain(tail);
      expect((send.mock.calls[0]![1] as { body: unknown }).body).toEqual({});
    }
  });

  it('passes the server status through untouched, including one it has never seen', async () => {
    // A state added on the server must arrive as itself, not be folded into a
    // status this app happens to know.
    const { module } = load({
      result: { ...WIRE_TRANSFER, status: 'partially_received', status_label: 'Recibida en parte' },
    });
    const transfer = await module.fetchTransfer(7, DEPS);
    expect(transfer.status).toBe('partially_received');
    expect(transfer.statusLabel).toBe('Recibida en parte');
  });
});

describe('the two capabilities stay two', () => {
  it('reads with inventory.view and writes with inventory.adjust', () => {
    const reader = context([CAP_INVENTORY_VIEW]);
    expect(hasUxCapability(reader, CAP_INVENTORY_VIEW)).toBe(true);
    expect(hasUxCapability(reader, CAP_INVENTORY_ADJUST)).toBe(false);
  });

  it('treats seeing as no evidence of being able to act', () => {
    // The server's rule, restated as a UX one: a member who reaches only the
    // destination sees the document and is refused the move.
    expect(hasUxCapability(context([CAP_INVENTORY_VIEW]), CAP_INVENTORY_ADJUST)).toBe(false);
  });
});

describe('transfers share the inventory cache namespace on purpose', () => {
  const scope = makeQueryScope({ slug: 'blackdog', userId: 9 } as never);

  it('sits under the inventory root, so a move invalidates the shelf', () => {
    const root = queryKeys.internalInventoryRoot(scope).join('|');
    expect(queryKeys.internalTransfers(scope, {}).join('|').startsWith(root)).toBe(true);
    expect(queryKeys.internalTransfer(scope, 7).join('|').startsWith(root)).toBe(true);
  });

  it('separates the list from one document, and one document from another', () => {
    expect(queryKeys.internalTransfer(scope, 7)).not.toEqual(
      queryKeys.internalTransfer(scope, 8),
    );
    expect(queryKeys.internalTransfers(scope, { status: 'draft' })).not.toEqual(
      queryKeys.internalTransfers(scope, {}),
    );
  });
});

describe('structural guards — the document cannot drift', () => {
  type FS = { readFileSync(p: string, e: 'utf8'): string };
  const fs = jest.requireActual('fs') as FS;

  /**
   * The file with its COMMENTS REMOVED.
   *
   * These guards scan for things this app must never do, and the comments
   * explaining why say those words out loud. A guard that read the prose would
   * fire on the explanation and pass on the code — exactly backwards.
   */
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

  const SCREENS = [
    'src/app/internal/inventory/transfers/index.tsx',
    'src/app/internal/inventory/transfers/[id].tsx',
  ];
  const PLUMBING = [
    'src/api/endpoints/internal-inventory-v1.ts',
    'src/repositories/api/v1-internal-inventory-repository.ts',
    'src/hooks/use-internal-inventory.ts',
  ];

  it('defines no local transition table', () => {
    // §48. The machine lives in `inventory_services`. A copy on a phone would
    // be a second lifecycle nobody owns, and it would drift.
    const sources = [
      ...SCREENS, ...PLUMBING, 'src/features/internal/transfer-status.ts',
    ].map(code).join('\n');
    for (const forbidden of [
      /draft['"]?\s*(?:->|=>|:)\s*['"]?in_transit/i,
      /in_transit['"]?\s*(?:->|=>|:)\s*['"]?received/i,
      /nextStatus/i,
      /NEXT_STATUS/,
      /TRANSITIONS/,
      /allowedTransitions/i,
    ]) {
      expect(sources).not.toMatch(forbidden);
    }
  });

  it('never asks the server to set a status', () => {
    // One route per ACT. A single "set the status" call would let this app
    // assert `received` for stock that never left.
    const sources = [...SCREENS, ...PLUMBING].map(code).join('\n');
    expect(sources).not.toMatch(/setTransferStatus/);
    expect(sources).not.toMatch(/body:\s*\{[^}]*\bstatus\b\s*:/);
  });

  it('never reaches the legacy admin surface', () => {
    // That surface authenticates by cookie and CSRF. `api-scope.ts` forbids a
    // Bearer there structurally; this is the other half.
    const sources = [...SCREENS, ...PLUMBING].map(code).join('\n');
    expect(sources).not.toMatch(/\/api\/admin\//);
  });

  it('uses no role name as authority', () => {
    // `role` is never authorization. Only `hasUxCapability`, and only to draw.
    const sources = SCREENS.map(code).join('\n');
    for (const forbidden of [
      /\brole\s*===/, /\brole\s*==/, /isAdmin/, /isInventory/,
      /isTechnician/, /isSales/, /isMaster/, /is_platform_master/,
    ]) {
      expect(sources).not.toMatch(forbidden);
    }
  });

  it('computes no stock figure of its own', () => {
    // The shelf is the server's count. Arithmetic here would produce a number
    // that disagrees with the one the business acts on.
    const sources = SCREENS.map(code).join('\n');
    for (const forbidden of [
      /quantity[\w.?![\]'"]*\s*[-+*/]\s*/,
      /totalUnits[\w.?![\]'"]*\s*[-+*/]\s*/,
      /\bstockAfter\b/,
      /reduce\(/,
    ]) {
      expect(sources).not.toMatch(forbidden);
    }
  });

  it('retries no transfer mutation', () => {
    // Not even dispatch and receive, which the server happens to make
    // idempotent: a retry nobody asked for is not made acceptable by the other
    // side being careful about it.
    const hooks = code('src/hooks/use-internal-inventory.ts');
    const block = hooks.slice(hooks.indexOf('function useTransferMutation'));
    expect(block).toMatch(/retry:\s*false/);
    expect(block).not.toMatch(/retry:\s*(?!false)\w/);
  });

  it('queues nothing offline', () => {
    const sources = [...SCREENS, 'src/hooks/use-internal-inventory.ts'].map(code).join('\n');
    for (const forbidden of [/offlineQueue/i, /AsyncStorage/, /persistQueue/i, /mutationCache/i]) {
      expect(sources).not.toMatch(forbidden);
    }
  });

  it('invalidates the whole inventory namespace after a write', () => {
    // Dispatching takes units off one shelf and receiving puts them on another:
    // the summary, the stock list and the Kardex are all stale at that moment.
    const hooks = code('src/hooks/use-internal-inventory.ts');
    const block = hooks.slice(hooks.indexOf('function useTransferMutation'));
    expect(block).toMatch(
      /invalidateQueries\(\{\s*queryKey:\s*queryKeys\.internalInventoryRoot\(scope\)/,
    );
  });
});
