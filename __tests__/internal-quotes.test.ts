import {
  CAP_SERVICE_DIAGNOSTIC_MANAGE,
  CAP_SERVICE_ORDERS_MANAGE,
  CAP_SERVICE_ORDERS_VIEW,
  SERVICE_QUOTE_ITEM_TYPES,
} from '@/domain/internal/service-types';
import { hasUxCapability, type InternalContext } from '@/domain/internal/types';
import { queryKeys } from '@/providers/query-client';
import { makeQueryScope } from '@/providers/query-scope';

/**
 * M9 — diagnosis and quoting on the internal side.
 *
 * The server owns the lifecycle, the arithmetic and the freeze. These pin down
 * that the app composes an intention, renders the server's numbers, and holds
 * no state machine of its own.
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

const WIRE_DIAGNOSTIC = {
  id: 11, revision: 1, status: 'draft', status_label: 'Borrador',
  description: 'Placa con humedad.', root_cause: '',
  recommended_action: 'Limpieza ultrasónica.',
  internal_notes: 'No decírselo aún.', diagnosed_by_name: 'Tomás Técnico',
  created_at: 'x', updated_at: 'x', finalized_at: null,
};

const WIRE_QUOTE = {
  id: 21, revision: 1, status: 'draft', status_label: 'Borrador', diagnostic: 11,
  currency: 'PEN', subtotal: '160.00', discount_amount: '0.00',
  tax_amount: '0.00', total: '160.00', valid_until: null,
  is_expired: false, is_editable: true,
  customer_notes: 'Incluye garantía.', internal_notes: 'Margen ajustado.',
  items: [{
    id: 1, item_type: 'labor', item_type_label: 'Mano de obra',
    description: 'Mano de obra', quantity: '2.00', unit_price: '80.00',
    line_total: '160.00', product: null, sort_order: 0,
  }],
  decision: null, created_by_name: 'Tomás Técnico',
  created_at: 'x', updated_at: 'x', sent_at: null,
  approved_at: null, rejected_at: null, cancelled_at: null,
};

describe('the client talks to the internal service surface', () => {
  it('hangs every route off the order it belongs to', async () => {
    const cases: [string, (m: Loaded) => Promise<unknown>][] = [
      ['/api/v1/internal/blackdog/service/orders/7/diagnostics/',
        (m) => m.fetchServiceDiagnostics(7, DEPS)],
      ['/api/v1/internal/blackdog/service/orders/7/diagnostics/11/',
        (m) => m.patchServiceDiagnostic(7, 11, {}, DEPS)],
      ['/api/v1/internal/blackdog/service/orders/7/quotes/',
        (m) => m.fetchServiceQuotes(7, DEPS)],
      ['/api/v1/internal/blackdog/service/orders/7/quotes/21/',
        (m) => m.patchServiceQuote(7, 21, {}, DEPS)],
      ['/api/v1/internal/blackdog/service/orders/7/quotes/21/items/',
        (m) => m.postServiceQuoteItem(7, 21, {
          itemType: 'labor', description: 'x', quantity: '1', unitPrice: '1',
        }, DEPS)],
      ['/api/v1/internal/blackdog/service/orders/7/quotes/21/items/3/',
        (m) => m.deleteServiceQuoteItem(7, 21, 3, DEPS)],
      ['/api/v1/internal/blackdog/service/orders/7/quotes/21/publish/',
        (m) => m.postServiceQuotePublish(7, 21, DEPS)],
      ['/api/v1/internal/blackdog/service/orders/7/quotes/21/cancel/',
        (m) => m.postServiceQuoteCancel(7, 21, DEPS)],
    ];

    for (const [path, call] of cases) {
      const { module, send } = load({ result: { results: [], items: [] } });
      await call(module);
      expect(send.mock.calls[0]![0]).toBe(path);
    }
  });

  it('never names the legacy admin surface', async () => {
    const { module, send } = load({ result: { results: [] } });
    await module.fetchServiceQuotes(7, DEPS);
    expect(send.mock.calls[0]![0]).not.toContain('/api/admin/');
  });

  it('treats a 404 on any of them as OUT OF SCOPE, not lost membership', async () => {
    // Every route names an order id, so a 404 means that order, quote or
    // diagnosis is not reachable — not that the person stopped being staff.
    const { module } = load({
      makeError: (ApiError) => new ApiError('not_found', 'no', { status: 404 }),
    });

    await expect(module.fetchServiceQuotes(7, DEPS)).rejects.toBeInstanceOf(
      module.ServiceOutOfScopeError,
    );
    await expect(module.postServiceQuotePublish(7, 21, DEPS)).rejects.toBeInstanceOf(
      module.ServiceOutOfScopeError,
    );
  });

  it('turns a 400 into the server words', async () => {
    const { module } = load({
      makeError: (ApiError) =>
        new ApiError('validation', 'Una cotización sin líneas no se puede enviar.', {
          status: 400,
        }),
    });

    await expect(module.postServiceQuotePublish(7, 21, DEPS)).rejects.toThrow('sin líneas');
  });
});

describe('a write is an INTENTION', () => {
  it('sends a diagnosis without naming who made it', async () => {
    // The authenticated actor is the only claim M9 supports; recording one in
    // somebody else's name is a business decision nobody has made.
    const { module, send } = load({ result: WIRE_DIAGNOSTIC });

    await module.postServiceDiagnostic(7, {
      description: 'Placa con humedad.',
      recommendedAction: 'Limpieza.',
      internalNotes: 'Privado.',
    }, DEPS);

    const body = (send.mock.calls[0]![1] as { body: Record<string, unknown> }).body;
    expect(body).toEqual({
      description: 'Placa con humedad.',
      recommended_action: 'Limpieza.',
      internal_notes: 'Privado.',
    });
    for (const forbidden of ['diagnosed_by', 'technician_id', 'status', 'revision']) {
      expect(Object.keys(body)).not.toContain(forbidden);
    }
  });

  it('omits an empty root cause rather than sending a blank guess', async () => {
    const { module, send } = load({ result: WIRE_DIAGNOSTIC });

    await module.postServiceDiagnostic(
      7, { description: 'x', recommendedAction: 'y' }, DEPS,
    );

    expect(Object.keys((send.mock.calls[0]![1] as { body: object }).body))
      .not.toContain('root_cause');
  });

  it('composes a quote without any money the server owns', async () => {
    const { module, send } = load({ result: WIRE_QUOTE });

    await module.postServiceQuote(7, {
      diagnosticId: 11, customerNotes: 'Incluye garantía.',
    }, DEPS);

    const body = (send.mock.calls[0]![1] as { body: Record<string, unknown> }).body;
    for (const forbidden of [
      'revision', 'currency', 'subtotal', 'total', 'tax_amount', 'status', 'sent_at',
    ]) {
      expect(Object.keys(body)).not.toContain(forbidden);
    }
  });

  it('sends a line without its total', async () => {
    // quantity × unit_price is the server's multiplication. A client that could
    // post its own line total could post one its own numbers do not produce.
    const { module, send } = load({ result: WIRE_QUOTE });

    await module.postServiceQuoteItem(7, 21, {
      itemType: 'part', description: 'Batería', quantity: '2', unitPrice: '80.00',
    }, DEPS);

    const body = (send.mock.calls[0]![1] as { body: Record<string, unknown> }).body;
    expect(body).toEqual({
      item_type: 'part', description: 'Batería', quantity: '2', unit_price: '80.00',
    });
    expect(Object.keys(body)).not.toContain('line_total');
  });

  it('sends amounts as the STRINGS they were typed as', async () => {
    const { module, send } = load({ result: WIRE_QUOTE });

    await module.postServiceQuoteItem(7, 21, {
      itemType: 'labor', description: 'x', quantity: '1.5', unitPrice: '33.33',
    }, DEPS);

    const body = (send.mock.calls[0]![1] as { body: Record<string, unknown> }).body;
    expect(body.quantity).toBe('1.5');
    expect(body.unit_price).toBe('33.33');
    expect(typeof body.unit_price).toBe('string');
  });

  it('publishes and cancels with an empty body', async () => {
    const { module, send } = load({ result: WIRE_QUOTE });
    await module.postServiceQuotePublish(7, 21, DEPS);
    expect((send.mock.calls[0]![1] as { body: unknown }).body).toEqual({});
  });

  it('offers only the line types the server accepts', () => {
    expect(SERVICE_QUOTE_ITEM_TYPES.map((t) => t.value))
      .toEqual(['labor', 'part', 'service']);
  });
});

describe('mapping — verified against a real response', () => {
  it('maps a diagnosis, internal notes included', () => {
    // The opposite of the customer contract, and deliberately so.
    const { module } = load();
    const diagnostic = module.toServiceDiagnostic(WIRE_DIAGNOSTIC);

    expect(diagnostic.internalNotes).toBe('No decírselo aún.');
    expect(diagnostic.finalizedAt).toBeNull();
    expect(diagnostic.diagnosedByName).toBe('Tomás Técnico');
  });

  it('maps a quote with its internal notes and editor state', () => {
    const { module } = load();
    const quote = module.toServiceQuote(WIRE_QUOTE);

    expect(quote.internalNotes).toBe('Margen ajustado.');
    expect(quote.isEditable).toBe(true);
    expect(quote.total).toBe('160.00');
    expect(quote.items[0]!.lineTotal).toBe('160.00');
  });

  it('carries the customer reason on the INTERNAL side only', () => {
    // It lives on the decision, where the shop reads it. The customer contract
    // has no field for it at all.
    const { module } = load();
    const quote = module.toServiceQuote({
      ...WIRE_QUOTE,
      decision: {
        decision: 'reject', reason: 'Prefiero comprar uno nuevo.',
        channel: 'customer_account', decided_at: 'x',
      },
    });

    expect(quote.decision?.reason).toBe('Prefiero comprar uno nuevo.');
  });

  it('requires the two computed flags to be strictly true', () => {
    const { module } = load();
    const quote = module.toServiceQuote({
      ...WIRE_QUOTE, is_editable: 'yes', is_expired: 1,
    });

    expect(quote.isEditable).toBe(false);
    expect(quote.isExpired).toBe(false);
  });

  it('keeps every amount a string', () => {
    const { module } = load();
    const quote = module.toServiceQuote(WIRE_QUOTE);

    for (const value of [
      quote.subtotal, quote.discountAmount, quote.taxAmount, quote.total,
      quote.items[0]!.quantity, quote.items[0]!.unitPrice, quote.items[0]!.lineTotal,
    ]) {
      expect(typeof value).toBe('string');
    }
  });

  it('reads the collection shape the server actually sends', async () => {
    // `{count, results}` — NOT the four-field page envelope the order and
    // device lists use. Neither diagnostics nor quotes paginate, and reading a
    // `next` that will never arrive would build an endless-scroll for a list
    // that is three rows long.
    const { module } = load({ result: { count: 2, results: [WIRE_QUOTE] } });

    const page = await module.fetchServiceQuotes(7, DEPS);

    expect(page.count).toBe(2);
    expect(page.results).toHaveLength(1);
    expect(Object.keys(page)).toEqual(['count', 'results']);
  });
});

describe('capabilities split reading from composing', () => {
  it('separates opening an order from quoting on it', () => {
    const viewer = context([CAP_SERVICE_ORDERS_VIEW]);

    expect(hasUxCapability(viewer, CAP_SERVICE_ORDERS_VIEW)).toBe(true);
    expect(hasUxCapability(viewer, CAP_SERVICE_DIAGNOSTIC_MANAGE)).toBe(false);
  });

  it('does not imply the manage capability from the quoting one', () => {
    const quoter = context([CAP_SERVICE_ORDERS_VIEW, CAP_SERVICE_DIAGNOSTIC_MANAGE]);

    expect(hasUxCapability(quoter, CAP_SERVICE_ORDERS_MANAGE)).toBe(false);
  });
});

describe('cache — diagnosis and quotes hang off their order', () => {
  const scope = makeQueryScope({ tenantSlug: 'blackdog', userId: 42 });

  it('nests under the service root, so one invalidation covers a write', () => {
    const root = queryKeys.internalServiceRoot(scope);

    for (const key of [
      queryKeys.internalServiceDiagnostics(scope, 7),
      queryKeys.internalServiceQuotes(scope, 7),
    ]) {
      expect(key.slice(0, root.length)).toEqual(root);
    }
  });

  it('gives two orders different slots', () => {
    expect(queryKeys.internalServiceQuotes(scope, 7))
      .not.toEqual(queryKeys.internalServiceQuotes(scope, 8));
  });

  it('separates diagnostics from quotes on the same order', () => {
    expect(queryKeys.internalServiceDiagnostics(scope, 7))
      .not.toEqual(queryKeys.internalServiceQuotes(scope, 7));
  });
});

describe('structural — M9 added no local state machine', () => {
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

  function executableCode(file: string): string {
    return fs
      .readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .map((line) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) return '';
        return line.replace(/(^|[^:])\/\/.*$/, '$1');
      })
      .join('\n');
  }

  const M9_FILES = [
    'src/api/endpoints/internal-service-v1.ts',
    'src/domain/internal/service-types.ts',
    'src/hooks/use-internal-service.ts',
    'src/repositories/api/v1-internal-service-repository.ts',
    'src/features/internal/service-diagnostic-section.tsx',
    'src/features/internal/service-quote-section.tsx',
    // A recursive walk, so a screen added under this directory tomorrow is
    // covered by every assertion below without anyone remembering to list it.
    ...sourceFiles('src/app/internal/service'),
  ];

  it('defines no lifecycle transition table', () => {
    // The server removed `waiting_approval` from availableTransitions in M9. An
    // app with its own map would offer a button the server refuses, and the
    // drift reads as a broken app rather than as a policy.
    const offenders = M9_FILES.filter((file) =>
      /(TRANSITIONS|allowedTransitions|transitionMap|waiting_approval\s*:)/.test(
        executableCode(file),
      ),
    );
    expect(offenders).toEqual([]);
  });

  it('never names the legacy admin surface', () => {
    const offenders = M9_FILES.filter((file) => /\/api\/admin\//.test(executableCode(file)));
    expect(offenders).toEqual([]);
  });

  it('does no money arithmetic', () => {
    // `format.ts` states the rule: decimal strings are parsed at the last
    // moment before display and never earlier. The one place this app computes
    // money is the anonymous cart, which has no backend to ask.
    const offenders = M9_FILES.filter((file) => {
      const code = executableCode(file);
      return /(parseFloat|Number\([^)]*(?:total|price|subtotal|amount)[^)]*\)\s*[*+/-])/i
        .test(code)
        || /(unitPrice|lineTotal|subtotal)\s*[*+]/.test(code);
    });
    expect(offenders).toEqual([]);
  });

  it('never WRITES a field the server owns', () => {
    // Reading `row.line_total` off a response is the mapper doing its job.
    // Writing `line_total:` into a body is the client asserting arithmetic it
    // does not perform — so the guard is on the key form, not the name.
    const offenders = M9_FILES.filter((file) =>
      /(\bline_total\s*:|\bquoted_total\s*:|\bapproved_at\s*:\s*new |\bdecided_at\s*:\s*new |\bchannel\s*:\s*')/
        .test(executableCode(file)),
    );
    expect(offenders).toEqual([]);
  });

  it('imports expo-blur nowhere: glass belongs to GlassSurface', () => {
    const offenders = M9_FILES.filter((file) =>
      /from 'expo-blur'/.test(fs.readFileSync(file, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });

  it('writes no brand hex, so the tenant tint keeps working', () => {
    const offenders = M9_FILES.filter((file) =>
      /#[0-9a-fA-F]{6}\b/.test(executableCode(file)),
    );
    expect(offenders).toEqual([]);
  });

  it('never decides authority on the client', () => {
    const offenders = M9_FILES.filter((file) =>
      /function\s+can[A-Z]/.test(executableCode(file)),
    );
    expect(offenders).toEqual([]);
  });
});
