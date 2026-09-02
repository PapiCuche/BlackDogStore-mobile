import {
  CAP_SERVICE_ORDERS_MANAGE,
  CAP_SERVICE_ORDERS_VIEW,
  CAP_SERVICE_REPAIR_MANAGE,
  SERVICE_RESULT_CODES,
} from '@/domain/internal/service-types';
import { hasUxCapability, type InternalContext } from '@/domain/internal/types';
import { queryKeys } from '@/providers/query-client';
import { makeQueryScope } from '@/providers/query-scope';

/**
 * M10 — the bench, over the internal surface.
 *
 * The server owns the lifecycle, the stock and the idempotency. These pin down
 * that the app composes an intention, renders what came back, and can neither
 * spend a shelf nor invent a state.
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
    module = require('@/api/endpoints/internal-service-v1');
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

const WIRE_USAGE = {
  id: 700, quote_item_id: 21, product_id: 9, description: 'Batería original',
  quantity: 2, stock_movement_id: 5001, actor_name: 'Tomás Técnico',
  created_at: '2026-09-02T10:00:00Z', is_reversed: false, reversed_at: null,
  reversed_by_name: '', reversal_reason: '',
};

const WIRE_EXECUTION = {
  id: 300, started_at: '2026-09-02T09:00:00Z', completed_at: null,
  is_completed: false, work_performed: 'Desmontaje.', result: '',
  result_label: '', internal_notes: 'Tornillo pasado.',
  started_by_name: 'Tomás Técnico', completed_by_name: '',
  parts: [WIRE_USAGE], created_at: 'x', updated_at: 'x',
};

const WIRE_CANDIDATE = {
  quote_item_id: 21, product_id: 9, description: 'Batería original',
  approved_quantity: 2, used_quantity: 0, outstanding_quantity: 2,
  available_in_branch: 5,
};

describe('the client talks to the service surface, never to inventory', () => {
  it('hangs every route off the order it belongs to', async () => {
    const cases: [string, (m: Loaded) => Promise<unknown>][] = [
      ['/api/v1/internal/blackdog/service/orders/7/execution/',
        (m) => m.fetchServiceExecution(7, DEPS)],
      ['/api/v1/internal/blackdog/service/orders/7/execution/start/',
        (m) => m.postServiceExecutionStart(7, DEPS)],
      ['/api/v1/internal/blackdog/service/orders/7/execution/',
        (m) => m.patchServiceExecution(7, {}, DEPS)],
      ['/api/v1/internal/blackdog/service/orders/7/execution/complete/',
        (m) => m.postServiceExecutionComplete(
          7, { workPerformed: 'x', result: 'success' }, DEPS)],
      ['/api/v1/internal/blackdog/service/orders/7/execution/pause/',
        (m) => m.postServiceExecutionPause(7, '', DEPS)],
      ['/api/v1/internal/blackdog/service/orders/7/execution/resume/',
        (m) => m.postServiceExecutionResume(7, DEPS)],
      ['/api/v1/internal/blackdog/service/orders/7/parts/candidates/',
        (m) => m.fetchServicePartCandidates(7, DEPS)],
      ['/api/v1/internal/blackdog/service/orders/7/parts/',
        (m) => m.fetchServicePartUsages(7, DEPS)],
      ['/api/v1/internal/blackdog/service/orders/7/parts/',
        (m) => m.postServicePartUsage(
          7, { quoteItemId: 21, quantity: 1, idempotencyKey: 'k' }, DEPS)],
      ['/api/v1/internal/blackdog/service/orders/7/parts/700/reverse/',
        (m) => m.postServicePartUsageReverse(7, 700, '', DEPS)],
    ];

    for (const [path, call] of cases) {
      const { module, send } = load({ result: { results: [], parts: [] } });
      await call(module);
      expect(send.mock.calls[0]![0]).toBe(path);
    }
  });

  it('never names an inventory or admin route', async () => {
    // A technician holds `service.repair.manage`, not `inventory.view`. Reading
    // stock through the inventory surface would need an authority this feature
    // deliberately does not require.
    for (const call of [
      (m: Loaded) => m.fetchServicePartCandidates(7, DEPS),
      (m: Loaded) => m.postServicePartUsage(
        7, { quoteItemId: 1, quantity: 1, idempotencyKey: 'k' }, DEPS),
    ]) {
      const { module, send } = load({ result: { results: [] } });
      await call(module);
      const path = send.mock.calls[0]![0] as string;
      expect(path).not.toContain('/api/admin/');
      expect(path).not.toContain('/inventory/');
    }
  });

  it('treats a 404 anywhere as OUT OF SCOPE, not lost membership', async () => {
    const { module } = load({
      makeError: (ApiError) => new ApiError('not_found', 'no', { status: 404 }),
    });

    await expect(module.fetchServiceExecution(7, DEPS)).rejects.toBeInstanceOf(
      module.ServiceOutOfScopeError,
    );
    await expect(module.postServicePartUsageReverse(7, 1, '', DEPS)).rejects
      .toBeInstanceOf(module.ServiceOutOfScopeError);
  });

  it('refuses to ask without a tenant', async () => {
    const { module, send } = load({ slug: null });
    await expect(module.fetchServiceExecution(1, DEPS)).rejects.toBeInstanceOf(
      module.MissingTenantError,
    );
    expect(send).not.toHaveBeenCalled();
  });
});

describe('a write is an INTENTION', () => {
  it('starts and resumes with an empty body', async () => {
    for (const call of [
      (m: Loaded) => m.postServiceExecutionStart(7, DEPS),
      (m: Loaded) => m.postServiceExecutionResume(7, DEPS),
    ]) {
      const { module, send } = load({ result: WIRE_EXECUTION });
      await call(module);
      expect((send.mock.calls[0]![1] as { body: unknown }).body).toEqual({});
    }
  });

  it('sends only the three bench fields on a draft', async () => {
    const { module, send } = load({ result: WIRE_EXECUTION });

    await module.patchServiceExecution(7, {
      workPerformed: 'Soldadura.', internalNotes: 'Privado.', result: 'partial',
    }, DEPS);

    expect((send.mock.calls[0]![1] as { body: unknown }).body).toEqual({
      work_performed: 'Soldadura.', internal_notes: 'Privado.', result: 'partial',
    });
  });

  it('omits a field the caller did not set, rather than blanking it', async () => {
    const { module, send } = load({ result: WIRE_EXECUTION });

    await module.patchServiceExecution(7, { workPerformed: 'Solo esto.' }, DEPS);

    expect(Object.keys((send.mock.calls[0]![1] as { body: object }).body))
      .toEqual(['work_performed']);
  });

  it('declares no clock and no actor anywhere', async () => {
    // A bench clock somebody can set is not evidence, and the authenticated
    // caller is the only claim this platform supports.
    const { module, send } = load({ result: WIRE_EXECUTION });

    await module.postServiceExecutionComplete(
      7, { workPerformed: 'Hecho.', result: 'success' }, DEPS,
    );

    const body = (send.mock.calls[0]![1] as { body: Record<string, unknown> }).body;
    for (const forbidden of [
      'started_at', 'completed_at', 'started_by', 'completed_by', 'company',
      'company_id', 'repair_order', 'status', 'actor', 'technician_id',
    ]) {
      expect(Object.keys(body)).not.toContain(forbidden);
    }
  });

  it('sends a part as a LINE and a COUNT, and nothing else', async () => {
    const { module, send } = load({ result: WIRE_USAGE });

    await module.postServicePartUsage(7, {
      quoteItemId: 21, quantity: 2, idempotencyKey: 'abc-123',
    }, DEPS);

    expect((send.mock.calls[0]![1] as { body: unknown }).body).toEqual({
      quote_item_id: 21, quantity: 2, idempotency_key: 'abc-123',
    });
  });

  it('has no field for a branch, a product, a price or a stock figure', async () => {
    // The branch is the order's — there is no transfer in this flow, so naming
    // another shop would be units moving on paper nobody carried. The product
    // is the quoted line's. The price was settled once, on the quote.
    const { module, send } = load({ result: WIRE_USAGE });

    await module.postServicePartUsage(
      7, { quoteItemId: 21, quantity: 1, idempotencyKey: 'k' }, DEPS,
    );

    const body = (send.mock.calls[0]![1] as { body: Record<string, unknown> }).body;
    for (const forbidden of [
      'branch_id', 'branch', 'product_id', 'product', 'unit_price', 'unit_cost',
      'total', 'stock_before', 'stock_after', 'movement_type', 'company_id',
      'actor', 'line_total',
    ]) {
      expect(Object.keys(body)).not.toContain(forbidden);
    }
  });

  it('omits an empty idempotency key rather than sending a blank one', async () => {
    // A blank key is not "no key" to a database with a partial unique
    // constraint on non-empty values; leaving it out says what is meant.
    const { module, send } = load({ result: WIRE_USAGE });

    await module.postServicePartUsage(
      7, { quoteItemId: 21, quantity: 1, idempotencyKey: '' }, DEPS,
    );

    expect(Object.keys((send.mock.calls[0]![1] as { body: object }).body))
      .not.toContain('idempotency_key');
  });

  it('reverses with a POST and an optional reason, never a DELETE', async () => {
    const { module, send } = load({ result: WIRE_USAGE });

    await module.postServicePartUsageReverse(7, 700, '  Pieza equivocada.  ', DEPS);

    const call = send.mock.calls[0]![1] as { method: string; body: unknown };
    expect(call.method).toBe('POST');
    expect(call.body).toEqual({ reason: 'Pieza equivocada.' });
  });
});

describe('the two conflicts stay apart', () => {
  it('turns a 409 with insufficient_stock into its own error', async () => {
    const { module } = load({
      makeError: (ApiError) =>
        new ApiError('unknown', 'Stock insuficiente para "Batería".', {
          status: 409, code: 'insufficient_stock',
        }),
    });

    await expect(
      module.postServicePartUsage(
        7, { quoteItemId: 1, quantity: 9, idempotencyKey: 'k' }, DEPS),
    ).rejects.toBeInstanceOf(module.ServiceStockUnavailableError);
  });

  it('turns a 409 with idempotency_conflict into its own error', async () => {
    const { module } = load({
      makeError: (ApiError) =>
        new ApiError('unknown', 'Esa clave ya se usó.', {
          status: 409, code: 'idempotency_conflict',
        }),
    });

    await expect(
      module.postServicePartUsage(
        7, { quoteItemId: 1, quantity: 1, idempotencyKey: 'k' }, DEPS),
    ).rejects.toBeInstanceOf(module.ServiceIdempotencyConflictError);
  });

  it('branches on the CODE, not on the Spanish', async () => {
    // Three different message templates already exist server-side for the stock
    // condition alone, and none of them is API surface.
    const { module } = load({
      makeError: (ApiError) =>
        new ApiError('unknown', 'Un mensaje que nadie prometió.', {
          status: 409, code: 'insufficient_stock',
        }),
    });

    await expect(
      module.postServicePartUsage(
        7, { quoteItemId: 1, quantity: 1, idempotencyKey: 'k' }, DEPS),
    ).rejects.toBeInstanceOf(module.ServiceStockUnavailableError);
  });

  it('falls back to a plain rejection for a 409 with no code', async () => {
    const { module } = load({
      makeError: (ApiError) =>
        new ApiError('unknown', 'Conflicto.', { status: 409 }),
    });

    await expect(
      module.postServicePartUsage(
        7, { quoteItemId: 1, quantity: 1, idempotencyKey: 'k' }, DEPS),
    ).rejects.toBeInstanceOf(module.ServiceRejectedError);
  });

  it('keeps a 400 a plain rejection carrying the server words', async () => {
    const { module } = load({
      makeError: (ApiError) =>
        new ApiError('validation', 'Solo se puede iniciar una reparación aprobada.', {
          status: 400,
        }),
    });

    await expect(module.postServiceExecutionStart(7, DEPS))
      .rejects.toThrow('aprobada');
  });
});

describe('mapping — verified against a real response', () => {
  it('maps the execution and the parts under it', () => {
    const { module } = load({ result: WIRE_EXECUTION });
    void module;

    const { module: m } = load();
    // Exercised through the public function so the envelope is covered too.
    return load({ result: { execution: WIRE_EXECUTION } })
      .module.fetchServiceExecution(7, DEPS)
      .then((execution) => {
        void m;
        expect(execution).toMatchObject({
          id: 300,
          isCompleted: false,
          completedAt: null,
          workPerformed: 'Desmontaje.',
          internalNotes: 'Tornillo pasado.',
          startedByName: 'Tomás Técnico',
        });
        expect(execution!.parts).toHaveLength(1);
        expect(execution!.parts[0]).toMatchObject({
          id: 700, quantity: 2, description: 'Batería original', isReversed: false,
        });
      });
  });

  it('treats a null execution as a normal answer, not an error', async () => {
    // Most orders have no bench record for most of their life.
    const { module } = load({ result: { execution: null } });
    await expect(module.fetchServiceExecution(7, DEPS)).resolves.toBeNull();
  });

  it('requires is_reversed and is_completed to be strictly true', async () => {
    const { module } = await load({
      result: {
        execution: {
          ...WIRE_EXECUTION, is_completed: 'yes',
          parts: [{ ...WIRE_USAGE, is_reversed: 1 }],
        },
      },
    });
    const execution = await module.fetchServiceExecution(7, DEPS);

    expect(execution!.isCompleted).toBe(false);
    expect(execution!.parts[0]!.isReversed).toBe(false);
  });

  it('maps a reversed usage with who undid it and why', async () => {
    const { module } = load({
      result: {
        count: 1,
        results: [{
          ...WIRE_USAGE, is_reversed: true, reversed_at: '2026-09-02T11:00:00Z',
          reversed_by_name: 'Ana Jefa', reversal_reason: 'Pieza equivocada.',
        }],
      },
    });

    const page = await module.fetchServicePartUsages(7, DEPS);

    expect(page.results[0]).toMatchObject({
      isReversed: true,
      reversedAt: '2026-09-02T11:00:00Z',
      reversedByName: 'Ana Jefa',
      reversalReason: 'Pieza equivocada.',
    });
  });

  it('maps a candidate and keeps every count a number', async () => {
    const { module } = load({ result: { count: 1, results: [WIRE_CANDIDATE] } });

    const page = await module.fetchServicePartCandidates(7, DEPS);

    expect(page.results[0]).toEqual({
      quoteItemId: 21, productId: 9, description: 'Batería original',
      approvedQuantity: 2, usedQuantity: 0, outstandingQuantity: 2,
      availableInBranch: 5,
    });
    for (const value of Object.values(page.results[0]!)) {
      if (typeof value !== 'string') expect(Number.isFinite(value)).toBe(true);
    }
  });

  it('never lets a junk count become NaN on screen', async () => {
    const { module } = load({
      result: { count: 1, results: [{ ...WIRE_CANDIDATE, available_in_branch: 'muchos' }] },
    });

    const page = await module.fetchServicePartCandidates(7, DEPS);

    expect(page.results[0]!.availableInBranch).toBe(0);
  });

  it('reads the {count, results} shape, not the page envelope', async () => {
    const { module } = load({ result: { count: 2, results: [WIRE_USAGE] } });

    const page = await module.fetchServicePartUsages(7, DEPS);

    expect(Object.keys(page)).toEqual(['count', 'results']);
  });

  it('offers exactly the three results the server accepts', () => {
    expect(SERVICE_RESULT_CODES.map((r) => r.value))
      .toEqual(['success', 'partial', 'unresolved']);
  });
});

describe('capabilities separate the bench from the counter', () => {
  it('does not imply repair from orders.manage', () => {
    // Moving an order and working on the device are two authorities.
    const mover = context([CAP_SERVICE_ORDERS_VIEW, CAP_SERVICE_ORDERS_MANAGE]);

    expect(hasUxCapability(mover, CAP_SERVICE_ORDERS_MANAGE)).toBe(true);
    expect(hasUxCapability(mover, CAP_SERVICE_REPAIR_MANAGE)).toBe(false);
  });

  it('does not imply inventory.adjust from repair.manage', () => {
    // The whole separation, stated on the client too: a technician who may fit
    // an approved part may not correct a shelf.
    const technician = context([CAP_SERVICE_ORDERS_VIEW, CAP_SERVICE_REPAIR_MANAGE]);

    expect(hasUxCapability(technician, CAP_SERVICE_REPAIR_MANAGE)).toBe(true);
    expect(hasUxCapability(technician, 'inventory.adjust')).toBe(false);
    expect(hasUxCapability(technician, 'inventory.view')).toBe(false);
  });

  it('does not imply repair.manage from inventory.adjust', () => {
    const storekeeper = context([CAP_SERVICE_ORDERS_VIEW, 'inventory.adjust']);

    expect(hasUxCapability(storekeeper, CAP_SERVICE_REPAIR_MANAGE)).toBe(false);
  });
});

describe('cache — the bench hangs off its order', () => {
  const scope = makeQueryScope({ tenantSlug: 'blackdog', userId: 42 });

  it('nests under the service root', () => {
    const root = queryKeys.internalServiceRoot(scope);
    for (const key of [
      queryKeys.internalServiceExecution(scope, 7),
      queryKeys.internalServiceParts(scope, 7),
      queryKeys.internalServicePartCandidates(scope, 7),
    ]) {
      expect(key.slice(0, root.length)).toEqual(root);
    }
  });

  it('keeps the three apart from each other and from other orders', () => {
    expect(queryKeys.internalServiceExecution(scope, 7))
      .not.toEqual(queryKeys.internalServiceParts(scope, 7));
    expect(queryKeys.internalServiceParts(scope, 7))
      .not.toEqual(queryKeys.internalServicePartCandidates(scope, 7));
    expect(queryKeys.internalServiceExecution(scope, 7))
      .not.toEqual(queryKeys.internalServiceExecution(scope, 8));
  });

  it('never collides with the inventory module', () => {
    // Invalidation crosses the module boundary in M10. Data must not.
    const inventory = queryKeys.internalInventoryRoot(scope);
    const service = queryKeys.internalServiceRoot(scope);
    expect(service.slice(0, inventory.length)).not.toEqual(inventory);
  });
});

describe('structural — the bench cannot drift', () => {
  type FileSystem = {
    readFileSync(path: string, encoding: 'utf8'): string;
    readdirSync(path: string): string[];
    statSync(path: string): { isDirectory(): boolean };
  };
  type PathModule = { join(...parts: string[]): string };

  const fs = jest.requireActual('fs') as FileSystem;
  const nodePath = jest.requireActual('path') as PathModule;

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
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) return '';
        return line.replace(/(^|[^:])\/\/.*$/, '$1');
      })
      .join('\n');
  }

  function executableCode(file: string): string {
    return stripComments(fs.readFileSync(file, 'utf8'));
  }

  /**
   * The part of a SHARED file that M10 wrote.
   *
   * `internal-service-v1.ts` and `service-types.ts` also carry M8's intake and
   * M9's quoting, which legitimately name `unit_price`, `line_total` and
   * `branch_id` — a quote has prices and an order has a branch. Scanning the
   * whole file would forbid the previous phases' own vocabulary, so the scan is
   * anchored at the banner M10 appended below.
   */
  function m10Region(file: string): string {
    // The banner is a `//` comment, so the slice happens on the RAW text and
    // the stripping afterwards. Doing it the other way round deletes the very
    // marker being searched for — and leaves a scan that passes by scanning
    // nothing, which the test below exists to catch.
    const raw = fs.readFileSync(file, 'utf8');
    const marker = raw.indexOf('M10 / BR-005C');
    return marker === -1 ? '' : stripComments(raw.slice(marker));
  }

  const M10_SHARED = [
    'src/api/endpoints/internal-service-v1.ts',
    'src/domain/internal/service-types.ts',
  ];

  const M10_OWN = [
    'src/domain/idempotency.ts',
    'src/features/internal/service-execution-section.tsx',
    'src/features/internal/service-parts-section.tsx',
  ];

  const M10_FILES = [
    'src/api/endpoints/internal-service-v1.ts',
    'src/domain/internal/service-types.ts',
    'src/domain/idempotency.ts',
    'src/hooks/use-internal-service.ts',
    'src/repositories/api/v1-internal-service-repository.ts',
    'src/features/internal/service-execution-section.tsx',
    'src/features/internal/service-parts-section.tsx',
    ...sourceFiles('src/app/internal/service'),
  ];

  it('defines no lifecycle transition table', () => {
    // The server made `in_repair`, `waiting_parts` and `repaired` event-only.
    // A client map would offer buttons the server refuses, and the drift reads
    // as a broken app rather than as a policy.
    const offenders = M10_FILES.filter((file) =>
      /(TRANSITIONS|allowedTransitions|transitionMap|in_repair\s*:\s*\[)/.test(
        executableCode(file),
      ),
    );
    expect(offenders).toEqual([]);
  });

  it('never names the admin or inventory surface', () => {
    const offenders = M10_FILES.filter((file) =>
      /'\/api\/admin\/|\/api\/v1\/internal\/[^']*\/inventory\//.test(executableCode(file)),
    );
    expect(offenders).toEqual([]);
  });

  it('does no stock arithmetic', () => {
    // Showing `available - quantity` would be this app asserting a number about
    // a shelf another till may be changing at the same moment. After a write
    // the server is asked again.
    const offenders = M10_FILES.filter((file) => {
      const code = executableCode(file);
      return /(availableInBranch|available_in_branch|outstandingQuantity)\s*[-+]\s*\w/
        .test(code)
        || /-\s*(quantity|count)\b.*available/i.test(code);
    });
    expect(offenders).toEqual([]);
  });

  it('does no money arithmetic and names no price', () => {
    // A part usage does not reopen the quote. M9's totals are frozen, and
    // connecting consumed parts to what the customer owes is not this phase's
    // to invent.
    const sources = [
      ...M10_OWN.map((f) => [f, executableCode(f)] as const),
      ...M10_SHARED.map((f) => [f, m10Region(f)] as const),
      ...sourceFiles('src/app/internal/service').map(
        (f) => [f, executableCode(f)] as const,
      ),
    ];
    const offenders = sources
      .filter(([, code]) => /(unitPrice|unit_price|lineTotal|line_total|formatCurrency)/.test(code))
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });

  it('declares no field the server owns', () => {
    const sources = [
      ...M10_OWN.map((f) => [f, executableCode(f)] as const),
      ...M10_SHARED.map((f) => [f, m10Region(f)] as const),
    ];
    const offenders = sources
      .filter(([, code]) =>
        /(\bbranch_id\s*:|\bmovement_type\s*:|\bstock_after\s*:|\bstock_before\s*:|\bcompleted_at\s*:\s*new |\bstarted_at\s*:\s*new )/
          .test(code))
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });

  it('anchors those two scans on a marker that actually exists', () => {
    // If the banner is ever renamed, the two scans above would silently pass by
    // scanning nothing at all.
    for (const file of M10_SHARED) {
      expect(m10Region(file).length).toBeGreaterThan(200);
    }
  });

  it('retries nothing and queues nothing offline', () => {
    const offenders = M10_FILES.filter((file) =>
      /(retry:\s+(?!false\b)\S|enqueue|pendingMutations|AsyncStorage)/.test(
        executableCode(file),
      ),
    );
    expect(offenders).toEqual([]);
  });

  it('mints the idempotency key in ONE place', () => {
    // A mechanism whose whole job is to stop a double write is the last thing
    // that should exist twice in two subtly different versions.
    const definers = sourceFiles('src').filter((file) =>
      /function makeIdempotencyKey/.test(fs.readFileSync(file, 'utf8')),
    );
    expect(definers).toEqual(['src/domain/idempotency.ts']);
  });

  it('holds that key in a ref, not in state', () => {
    // State would re-render on change and, worse, a re-render could produce a
    // fresh key mid-retry — which is precisely the failure the key prevents.
    const code = executableCode('src/features/internal/service-parts-section.tsx');
    expect(code).toContain('useRef');
    expect(code).not.toMatch(/useState<[^>]*>\(\s*makeIdempotencyKey/);
  });

  it('imports expo-blur nowhere and writes no brand hex', () => {
    const offenders = M10_FILES.filter((file) => {
      const raw = fs.readFileSync(file, 'utf8');
      return /from 'expo-blur'/.test(raw) || /#[0-9a-fA-F]{6}\b/.test(executableCode(file));
    });
    expect(offenders).toEqual([]);
  });

  it('never decides authority on the client', () => {
    const offenders = M10_FILES.filter((file) =>
      /function\s+can[A-Z]|isAllowed\(/.test(executableCode(file)),
    );
    expect(offenders).toEqual([]);
  });

  it('keeps the customer surface out of every M10 file', () => {
    const offenders = M10_FILES.filter((file) =>
      /\/api\/v1\/customer\//.test(executableCode(file)),
    );
    expect(offenders).toEqual([]);
  });
});
