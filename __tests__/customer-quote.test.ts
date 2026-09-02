import {
  CUSTOMER_QUOTE_STATUSES,
  isAwaitingDecision,
  toQuoteStatus,
  undecidableReason,
  type RepairQuote,
} from '@/domain/repairs/quote';
import { describeRepairStatus } from '@/domain/repairs/status';
import {
  findActiveRepair,
  isRepairOpen,
  repairStageIndex,
  toRepairStatus,
} from '@/domain/repairs/types';
import { CUSTOMER_AUDIENCE, INTERNAL_AUDIENCE, queryKeys } from '@/providers/query-client';
import { isPrivateQueryKey, makeQueryScope } from '@/providers/query-scope';

/**
 * M9 — the quote a customer answers.
 *
 * The server owns ownership, expiry and idempotency. These pin down that the
 * app asks the right surface, sends only an intention, renders only what came
 * back, and cannot show what never arrived.
 */

const BASE = 'https://api.example.test';
const DEPS = { refreshCoordinator: {} as never };

type Loaded = typeof import('@/api/endpoints/customer-repairs-v1');

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
    module = require('@/api/endpoints/customer-repairs-v1');
  });

  return { module, send };
}

afterEach(() => {
  jest.resetModules();
  jest.dontMock('@/api/authenticated-request');
  jest.dontMock('@/config/env');
});

const WIRE_QUOTE = {
  id: 5001,
  revision: 1,
  status: 'sent',
  status_label: 'Enviada',
  currency: 'PEN',
  subtotal: '245.00',
  discount_amount: '20.00',
  tax_amount: '0.00',
  total: '225.00',
  valid_until: '2026-09-08T16:02:00-05:00',
  is_expired: false,
  can_be_decided: true,
  customer_notes: 'Incluye 3 meses de garantía.',
  items: [
    {
      id: 1, item_type: 'part', item_type_label: 'Repuesto',
      description: 'Batería original', quantity: '1.00',
      unit_price: '185.00', line_total: '185.00',
    },
  ],
  decision: null,
  sent_at: '2026-09-01T16:02:00-05:00',
};

describe('the lifecycle learned the two states M9 added', () => {
  it('recognises approved and rejected instead of degrading them', () => {
    // The bug this prevents: `toRepairStatus` used to coerce anything unknown
    // to 'received', so a repair the customer had just approved rendered as
    // "Recibido" — silently, and in the direction the app claimed was safe.
    expect(toRepairStatus('approved')).toBe('approved');
    expect(toRepairStatus('rejected')).toBe('rejected');
  });

  it('still refuses to render an unknown code as further along', () => {
    // M10 built `in_repair`, so it is a known code now. The guarantee moved
    // rather than went away: a code this build has never heard of is carried
    // through verbatim and given NO ladder position, instead of being coerced
    // into one — which is what made M9's "safe" fallback show "Recibido" over
    // an approved repair.
    expect(toRepairStatus('in_repair')).toBe('in_repair');
    // M11 built `quality_control`, so the example moves to one that still has
    // no module. The guarantee has not moved at all.
    expect(toRepairStatus('delivered')).toBe('delivered');
    expect(repairStageIndex('delivered')).toBe(-1);
    // Only an absent status falls back.
    expect(toRepairStatus(undefined)).toBe('received');
  });

  it('treats rejected as finished and approved as still going', () => {
    // Approval authorises work; it does not finish it, and the backend stamps
    // no completion of any kind.
    const base = {
      id: 1, number: 'SRV-1', deviceSummary: 'X', statusLabel: 'x',
      reportedIssue: 'y', receivedAt: '', closedAt: null, updatedAt: '', timeline: [],
    };
    expect(isRepairOpen({ ...base, status: 'approved' })).toBe(true);
    expect(isRepairOpen({ ...base, status: 'rejected' })).toBe(false);
    expect(isRepairOpen({ ...base, status: 'cancelled' })).toBe(false);
  });

  it('keeps rejected outside the linear sequence', () => {
    // It ends a repair without advancing it, exactly like cancelled, so it must
    // not compare as "further along" than a stage the device really passed.
    expect(repairStageIndex('rejected')).toBe(-1);
    expect(repairStageIndex('cancelled')).toBe(-1);
    expect(repairStageIndex('approved')).toBeGreaterThan(
      repairStageIndex('waiting_approval'),
    );
  });

  it('does not surface a rejected repair as the active one on Home', () => {
    const base = {
      number: 'SRV-1', deviceSummary: 'X', statusLabel: 'x', reportedIssue: 'y',
      receivedAt: '', closedAt: null, timeline: [],
    };
    const result = findActiveRepair([
      { ...base, id: 1, status: 'rejected', updatedAt: '2026-09-02T10:00:00Z' },
      { ...base, id: 2, status: 'approved', updatedAt: '2026-09-01T10:00:00Z' },
    ]);
    expect(result?.id).toBe(2);
  });

  it('labels the two new states, preferring the tenant word', () => {
    expect(describeRepairStatus('approved').label).toBe('Aprobado');
    expect(describeRepairStatus('rejected').tone).toBe('danger');
    expect(describeRepairStatus('approved', 'Autorizado').label).toBe('Autorizado');
  });
});

describe('the client asks the customer surface for the quote', () => {
  it('reads it from the repair it belongs to', async () => {
    const { module, send } = load({ result: { quote: WIRE_QUOTE } });

    await module.fetchCustomerRepairQuote(42, DEPS);

    expect(send.mock.calls[0]![0]).toBe('/api/v1/customer/blackdog/repairs/42/quote/');
    expect(send.mock.calls[0]![0]).not.toContain('/internal/');
  });

  it('posts a decision to the quote on that repair', async () => {
    const { module, send } = load({ result: { quote: WIRE_QUOTE } });

    await module.postQuoteDecision(
      { repairId: 42, quoteId: 5001, decision: 'approve' }, DEPS,
    );

    expect(send.mock.calls[0]![0]).toBe(
      '/api/v1/customer/blackdog/repairs/42/quotes/5001/decision/',
    );
    expect((send.mock.calls[0]![1] as { method: string }).method).toBe('POST');
  });

  it('treats a null quote as a normal answer, not an error', async () => {
    const { module } = load({ result: { quote: null } });
    await expect(module.fetchCustomerRepairQuote(42, DEPS)).resolves.toBeNull();
  });

  it('refuses to ask without a tenant', async () => {
    const { module, send } = load({ slug: null });
    await expect(module.fetchCustomerRepairQuote(1, DEPS)).rejects.toBeInstanceOf(
      module.MissingTenantError,
    );
    expect(send).not.toHaveBeenCalled();
  });
});

describe('a decision is an INTENTION and nothing else', () => {
  it('sends the answer, and optionally the reason', async () => {
    const { module, send } = load({ result: { quote: WIRE_QUOTE } });

    await module.postQuoteDecision(
      { repairId: 42, quoteId: 5001, decision: 'reject', reason: 'Muy caro.' }, DEPS,
    );

    expect((send.mock.calls[0]![1] as { body: unknown }).body).toEqual({
      decision: 'reject', reason: 'Muy caro.',
    });
  });

  it('omits the reason entirely when there is none', async () => {
    const { module, send } = load({ result: { quote: WIRE_QUOTE } });

    await module.postQuoteDecision(
      { repairId: 42, quoteId: 5001, decision: 'approve' }, DEPS,
    );

    expect((send.mock.calls[0]![1] as { body: unknown }).body).toEqual({
      decision: 'approve',
    });
  });

  it('has no field for anything the server already knows', async () => {
    // Who decided, for which customer, in which company, through which channel,
    // at what total, from which address — a client that could state any of them
    // could state a better-looking version of what happened.
    const { module, send } = load({ result: { quote: WIRE_QUOTE } });

    await module.postQuoteDecision(
      { repairId: 42, quoteId: 5001, decision: 'approve' }, DEPS,
    );

    const body = (send.mock.calls[0]![1] as { body: Record<string, unknown> }).body;
    for (const forbidden of [
      'customer_id', 'company_id', 'user_id', 'amount', 'quoted_total',
      'currency', 'status', 'approved_at', 'decided_at', 'channel',
    ]) {
      expect(Object.keys(body)).not.toContain(forbidden);
    }
  });
});

describe('the three outcomes stay distinct', () => {
  it('turns a 409 into ALREADY DECIDED, not a generic failure', async () => {
    // The screen must refetch and show the real state, not "error inesperado".
    const { module } = load({
      makeError: (ApiError) =>
        new ApiError('unknown', 'Esta cotización ya tiene una respuesta registrada.', {
          status: 409,
        }),
    });

    await expect(
      module.postQuoteDecision({ repairId: 1, quoteId: 1, decision: 'approve' }, DEPS),
    ).rejects.toBeInstanceOf(module.QuoteAlreadyDecidedError);
  });

  it('turns a 400 into a REJECTION carrying the server words', async () => {
    const { module } = load({
      makeError: (ApiError) =>
        new ApiError('validation', 'Esta cotización venció y ya no se puede responder.', {
          status: 400,
        }),
    });

    await expect(
      module.postQuoteDecision({ repairId: 1, quoteId: 1, decision: 'approve' }, DEPS),
    ).rejects.toThrow('venció');
  });

  it('turns a 404 into the same ownership outcome as everything else', async () => {
    const { module } = load({
      makeError: (ApiError) => new ApiError('not_found', 'no', { status: 404 }),
    });

    await expect(module.fetchCustomerRepairQuote(1, DEPS)).rejects.toBeInstanceOf(
      module.RepairNotAvailableError,
    );
  });

  it('shows the domain words rather than a generic message', async () => {
    const { module } = load();
    expect(module.quoteErrorMessage(new module.QuoteAlreadyDecidedError()))
      .toContain('respuesta registrada');
  });
});

describe('mapping — verified against a real response', () => {
  it('maps the quote', () => {
    const { module } = load();

    expect(module.toQuote(WIRE_QUOTE)).toMatchObject({
      id: 5001,
      revision: 1,
      status: 'sent',
      statusLabel: 'Enviada',
      currency: 'PEN',
      total: '225.00',
      discountAmount: '20.00',
      isExpired: false,
      canBeDecided: true,
      decision: null,
    });
  });

  it('keeps every amount as the STRING the server sent', () => {
    // Parsed at the point of display and never earlier: arithmetic on a float
    // that came from '4899.00' is how a price ends up a cent short.
    const { module } = load();
    const quote = module.toQuote(WIRE_QUOTE);

    expect(typeof quote.total).toBe('string');
    expect(typeof quote.items[0]!.lineTotal).toBe('string');
    expect(quote.items[0]!.lineTotal).toBe('185.00');
  });

  it('requires the two server-computed flags to be strictly true', () => {
    const { module } = load();
    const quote = module.toQuote({
      ...WIRE_QUOTE, is_expired: 'yes', can_be_decided: 1,
    });

    expect(quote.isExpired).toBe(false);
    expect(quote.canBeDecided).toBe(false);
  });

  it('maps a settled quote with its decision', () => {
    const { module } = load();
    const quote = module.toQuote({
      ...WIRE_QUOTE,
      status: 'approved',
      decision: { decision: 'approve', decided_at: '2026-09-01T21:02:11Z' },
    });

    expect(quote.decision).toEqual({
      decision: 'approve', decidedAt: '2026-09-01T21:02:11Z',
    });
  });

  it('drops every internal field a future payload might carry', () => {
    const { module } = load();
    const quote = module.toQuote({
      ...WIRE_QUOTE,
      internal_notes: 'margen ajustado',
      created_by_name: 'Tomás Técnico',
      is_editable: true,
      diagnostic: 7,
      cancelled_at: '2026-09-01T00:00:00Z',
      decision: {
        decision: 'reject', decided_at: 'x', reason: 'me pareció caro', channel: 'x',
      },
      items: [{ ...WIRE_QUOTE.items[0], product: 99, sort_order: 3 }],
    });
    const raw = JSON.stringify(quote);

    expect(raw).not.toContain('margen ajustado');
    expect(raw).not.toContain('Tomás');
    // Not even the customer's OWN reason: they typed it and do not need it read
    // back, and leaving it out means no future change can start showing one
    // person's words to another.
    expect(raw).not.toContain('me pareció caro');
    expect(Object.keys(quote)).not.toContain('internalNotes');
    expect(Object.keys(quote)).not.toContain('isEditable');
    expect(Object.keys(quote.items[0]!)).not.toContain('product');
  });

  it('never guesses an unknown quote status', () => {
    const { module } = load();
    expect(module.toQuote({ ...WIRE_QUOTE, status: 'draft' }).status).toBe('sent');
    expect(CUSTOMER_QUOTE_STATUSES).not.toContain('draft' as never);
    expect(toQuoteStatus('cancelled')).toBe('sent');
  });
});

describe('whether a quote can be answered is the SERVER decision', () => {
  const quote = (over: Partial<RepairQuote> = {}): RepairQuote => ({
    id: 1, revision: 1, status: 'sent', statusLabel: 'Enviada', currency: 'PEN',
    subtotal: '10.00', discountAmount: '0.00', taxAmount: '0.00', total: '10.00',
    validUntil: null, isExpired: false, canBeDecided: true, customerNotes: '',
    items: [], decision: null, sentAt: '', ...over,
  });

  it('awaits a decision only when the server says it can be decided', () => {
    expect(isAwaitingDecision(quote())).toBe(true);
    expect(isAwaitingDecision(quote({ canBeDecided: false }))).toBe(false);
  });

  it('never recomputes expiry from validUntil on the device', () => {
    // A phone's clock is not the authority on whether an offer is still open.
    const expiredByServer = quote({ isExpired: true, canBeDecided: false });
    const stillValidByServer = quote({
      validUntil: '2000-01-01T00:00:00Z', isExpired: false, canBeDecided: true,
    });

    expect(undecidableReason(expiredByServer)).toContain('venció');
    expect(undecidableReason(stillValidByServer)).toBeNull();
  });

  it('explains a settled quote before an expired one', () => {
    expect(
      undecidableReason(quote({ decision: { decision: 'approve', decidedAt: 'x' } })),
    ).toContain('respondiste');
  });
});

describe('cache — the quote lives under its repair', () => {
  const scope = makeQueryScope({ tenantSlug: 'blackdog', userId: 42 });

  it('nests under the repair key, so one invalidation sweeps both', () => {
    // Answering changes the quote AND the repair's status and timeline;
    // refetching one without the others shows a screen that disagrees with
    // itself.
    const repair = queryKeys.repair(scope, 42);
    expect(queryKeys.repairQuote(scope, 42).slice(0, repair.length)).toEqual(repair);
  });

  it('stays in the CUSTOMER audience', () => {
    const key = queryKeys.repairQuote(scope, 1);
    expect(key).toContain(CUSTOMER_AUDIENCE);
    expect(key).not.toContain(INTERNAL_AUDIENCE);
  });

  it('is private, so signing out evicts it', () => {
    expect(isPrivateQueryKey(queryKeys.repairQuote(scope, 1))).toBe(true);
  });

  it('gives two repairs and two users different slots', () => {
    const other = makeQueryScope({ tenantSlug: 'blackdog', userId: 77 });
    expect(queryKeys.repairQuote(scope, 1)).not.toEqual(queryKeys.repairQuote(scope, 2));
    expect(queryKeys.repairQuote(scope, 1)).not.toEqual(queryKeys.repairQuote(other, 1));
  });

  it('never collides with the internal quote namespace', () => {
    expect(queryKeys.repairQuote(scope, 7)).not.toEqual(
      queryKeys.internalServiceQuotes(scope, 7),
    );
  });
});

describe('structural — the customer surface cannot drift', () => {
  type FileSystem = { readFileSync(path: string, encoding: 'utf8'): string };
  const fs = jest.requireActual('fs') as FileSystem;

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

  const QUOTE_FILES = [
    'src/domain/repairs/quote.ts',
    'src/domain/repairs/types.ts',
    'src/api/endpoints/customer-repairs-v1.ts',
    'src/hooks/use-repairs.ts',
    'src/features/repairs/repair-quote-card.tsx',
    'src/app/repairs/[id].tsx',
  ];

  it('never names an internal or admin route', () => {
    const offenders = QUOTE_FILES.filter((file) =>
      /\/api\/(admin|v1\/internal)\//.test(executableCode(file)),
    );
    expect(offenders).toEqual([]);
  });

  it('declares no internal field, however a payload grows', () => {
    // The mapper is a whitelist. This is the second lock: a field that has no
    // name here cannot reach a customer's screen even by accident.
    const offenders = QUOTE_FILES.filter((file) =>
      /(internalNotes|internal_notes|createdByName|isEditable|diagnosedBy)/.test(
        executableCode(file),
      ),
    );
    expect(offenders).toEqual([]);
  });

  it('does no money arithmetic', () => {
    const offenders = QUOTE_FILES.filter((file) => {
      const code = executableCode(file);
      return /(unitPrice|lineTotal|subtotal|taxAmount)\s*[*+]/.test(code)
        || /parseFloat\s*\(\s*(quote|item)\./.test(code);
    });
    expect(offenders).toEqual([]);
  });

  it('recomputes neither expiry nor eligibility from a device clock', () => {
    // `Date.now()` inside this surface would mean the phone deciding whether an
    // offer is still open. Only the server knows that.
    const offenders = QUOTE_FILES.filter((file) =>
      /Date\.now\(\)|new Date\(\)\s*[<>]/.test(executableCode(file)),
    );
    expect(offenders).toEqual([]);
  });

  it('writes no lifecycle transition table', () => {
    const offenders = QUOTE_FILES.filter((file) =>
      /(TRANSITIONS|allowedTransitions|transitionMap)/.test(executableCode(file)),
    );
    expect(offenders).toEqual([]);
  });

  it('imports expo-blur nowhere and hardcodes no brand hex', () => {
    const offenders = QUOTE_FILES.filter((file) => {
      const raw = fs.readFileSync(file, 'utf8');
      return /from 'expo-blur'/.test(raw) || /#[0-9a-fA-F]{6}\b/.test(executableCode(file));
    });
    expect(offenders).toEqual([]);
  });

  it('has no offline queue and no retry around a decision', () => {
    const offenders = QUOTE_FILES.filter((file) =>
      /(retry:\s+(?!false\b)\S|enqueue|pendingMutations|AsyncStorage)/.test(
        executableCode(file),
      ),
    );
    expect(offenders).toEqual([]);
  });
});
