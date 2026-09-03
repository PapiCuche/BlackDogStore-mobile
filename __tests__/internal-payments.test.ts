import {
  CAP_SERVICE_DELIVERY_MANAGE,
  CAP_SERVICE_ORDERS_MANAGE,
  CAP_SERVICE_ORDERS_VIEW,
  CAP_SERVICE_PAYMENTS_MANAGE,
  CAP_SERVICE_QUALITY_MANAGE,
  CAP_SERVICE_REPAIR_MANAGE,
  PAYMENT_METHODS,
} from '@/domain/internal/service-types';
import { hasUxCapability, type InternalContext } from '@/domain/internal/types';
import { queryKeys } from '@/providers/query-client';
import { makeQueryScope } from '@/providers/query-scope';

/**
 * M12B — the till.
 *
 * This is the first screen in the product that moves money, and the failure
 * modes are specific: arithmetic done twice in two places, a key that changes
 * between a tap and its retry, a null balance drawn as zero, an `online` method
 * a gateway never saw, and a refusal reported as the wrong kind of failure.
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

const WIRE_PAYMENT = {
  id: 900,
  amount: '200.00',
  currency: 'PEN',
  method: 'cash',
  reference: 'V-001',
  notes: '',
  received_by_name: 'Ana Caja',
  received_at: '2026-09-02T15:00:00Z',
  created_at: '2026-09-02T15:00:00Z',
  is_reversed: false,
  reversed_at: null,
  reversed_by_name: '',
  reversal_reason: '',
};

const WIRE_SUMMARY = {
  currency: 'PEN',
  quoted_total: '500.00',
  confirmed_paid: '200.00',
  outstanding: '300.00',
  credit: '0.00',
  payment_status: 'partial',
  requires_payment_before_delivery: false,
};

describe('the payment methods this app offers', () => {
  it('are exactly the four the server accepts', () => {
    expect(PAYMENT_METHODS.map((m) => m.value))
      .toEqual(['cash', 'card', 'transfer', 'other']);
  });

  it('do NOT include online', () => {
    // It names a gateway flow nobody built. The server refuses it in the
    // service layer AND in a database constraint, so offering it here would
    // only be promising a 400 — and would let a counter assert that a provider
    // authorised something it never saw.
    expect(PAYMENT_METHODS.map((m) => m.value)).not.toContain('online');
  });
});

describe('the client talks to the payment surface', () => {
  it('hangs every route off the order', async () => {
    const cases: [string, (m: Loaded) => Promise<unknown>][] = [
      ['/api/v1/internal/blackdog/service/orders/7/payments/',
        (m) => m.fetchServicePayments(7, DEPS)],
      ['/api/v1/internal/blackdog/service/orders/7/payment-summary/',
        (m) => m.fetchServicePaymentSummary(7, DEPS)],
      ['/api/v1/internal/blackdog/service/orders/7/payments/',
        (m) => m.postServicePayment(
          7, { amount: '10.00', method: 'cash', idempotencyKey: 'k' }, DEPS,
        )],
      ['/api/v1/internal/blackdog/service/orders/7/payments/900/reverse/',
        (m) => m.postServicePaymentReverse(7, 900, '', DEPS)],
    ];
    for (const [path, call] of cases) {
      const { module, send } = load({ result: { ...WIRE_SUMMARY, results: [] } });
      await call(module);
      expect(send.mock.calls[0]![0]).toBe(path);
    }
  });

  it('exports no update and no delete, because the server has none', () => {
    const { module } = load();
    for (const absent of [
      'patchServicePayment', 'putServicePayment', 'deleteServicePayment',
      'updateServicePayment',
    ]) {
      expect((module as Record<string, unknown>)[absent]).toBeUndefined();
    }
  });

  it('never names the admin surface', async () => {
    const { module, send } = load({ result: WIRE_PAYMENT });
    await module.postServicePayment(
      7, { amount: '10.00', method: 'cash', idempotencyKey: 'k' }, DEPS,
    );
    expect(send.mock.calls[0]![0]).not.toContain('/api/admin/');
  });

  it('treats a 404 as out of scope, not lost membership', async () => {
    const { module } = load({
      makeError: (ApiError) => new ApiError('not_found', 'no', { status: 404 }),
    });
    await expect(module.fetchServicePayments(7, DEPS)).rejects.toBeInstanceOf(
      module.ServiceOutOfScopeError,
    );
  });

  it('turns a 409 idempotency_conflict into its own error', async () => {
    const { module } = load({
      makeError: (ApiError) =>
        new ApiError('validation', 'Esa clave ya se usó para un pago diferente.', {
          status: 409, code: 'idempotency_conflict',
        }),
    });
    await expect(
      module.postServicePayment(
        7, { amount: '10.00', method: 'cash', idempotencyKey: 'k' }, DEPS,
      ),
    ).rejects.toBeInstanceOf(module.ServiceIdempotencyConflictError);
  });

  it('turns a 409 payment_required into a DIFFERENT error', async () => {
    // THE DISTINCTION THAT MATTERS AT A COUNTER. Both arrive as 409. One means
    // "you reused a key"; the other means "this shop wants the balance settled
    // first", and only the second should make a screen refetch a balance.
    const { module } = load({
      makeError: (ApiError) =>
        new ApiError('validation', 'Saldo pendiente: 300.00 PEN.', {
          status: 409, code: 'payment_required',
        }),
    });
    await expect(
      module.postServiceDelivery(7, { recipientName: 'Ana', idempotencyKey: 'k' }, DEPS),
    ).rejects.toBeInstanceOf(module.ServicePaymentRequiredError);
  });

  it('keeps the two 409 errors distinguishable by class', () => {
    const { module } = load();
    expect(module.ServicePaymentRequiredError)
      .not.toBe(module.ServiceIdempotencyConflictError);
    const err = new module.ServicePaymentRequiredError('Saldo pendiente.');
    expect(err).not.toBeInstanceOf(module.ServiceIdempotencyConflictError);
  });

  it('turns a refused payment into the server words', async () => {
    const { module } = load({
      makeError: (ApiError) =>
        new ApiError('validation', 'El saldo pendiente es 300.00 PEN.', { status: 400 }),
    });
    await expect(
      module.postServicePayment(
        7, { amount: '900.00', method: 'cash', idempotencyKey: 'k' }, DEPS,
      ),
    ).rejects.toThrow('saldo pendiente');
  });
});

describe('a write is an INTENTION, never a record', () => {
  it('sends the amount, method and key, and nothing else by default', async () => {
    const { module, send } = load({ result: WIRE_PAYMENT });
    await module.postServicePayment(
      7, { amount: '200.00', method: 'cash', idempotencyKey: 'k1' }, DEPS,
    );
    expect((send.mock.calls[0]![1] as { body: unknown }).body).toEqual({
      amount: '200.00', method: 'cash', idempotency_key: 'k1',
    });
  });

  it('has NO currency, clock, cashier or status field', async () => {
    // Currency comes from the approved quote. A client that could choose one
    // could record a payment against a debt in another.
    const { module, send } = load({ result: WIRE_PAYMENT });
    await module.postServicePayment(
      7,
      { amount: '200.00', method: 'card', reference: 'V-9', notes: 'n', idempotencyKey: 'k' },
      DEPS,
    );
    const body = (send.mock.calls[0]![1] as { body: Record<string, unknown> }).body;
    expect(Object.keys(body).sort())
      .toEqual(['amount', 'idempotency_key', 'method', 'notes', 'reference']);
    for (const forbidden of [
      'currency', 'received_at', 'received_by', 'company', 'repair_order',
      'payment_status', 'is_reversed', 'outstanding', 'balance', 'paid',
    ]) {
      expect(Object.keys(body)).not.toContain(forbidden);
    }
  });

  it('trims the amount rather than sending what a keypad left behind', async () => {
    const { module, send } = load({ result: WIRE_PAYMENT });
    await module.postServicePayment(
      7, { amount: '  200.00  ', method: 'cash', idempotencyKey: 'k' }, DEPS,
    );
    expect((send.mock.calls[0]![1] as { body: Record<string, unknown> }).body.amount)
      .toBe('200.00');
  });

  it('omits a blank reference rather than sending an empty string', async () => {
    const { module, send } = load({ result: WIRE_PAYMENT });
    await module.postServicePayment(
      7, { amount: '10.00', method: 'cash', reference: '  ', idempotencyKey: 'k' }, DEPS,
    );
    expect(Object.keys((send.mock.calls[0]![1] as { body: object }).body).sort())
      .toEqual(['amount', 'idempotency_key', 'method']);
  });

  it('sends only a reason when it reverses, never an amount', async () => {
    const { module, send } = load({ result: WIRE_PAYMENT });
    await module.postServicePaymentReverse(7, 900, 'Se tecleó de más.', DEPS);
    expect((send.mock.calls[0]![1] as { body: unknown }).body)
      .toEqual({ reason: 'Se tecleó de más.' });
  });

  it('always sends a key, because only the client can mint one', async () => {
    const { module, send } = load({ result: WIRE_PAYMENT });
    await module.postServicePayment(
      7, { amount: '10.00', method: 'cash', idempotencyKey: 'k1' }, DEPS,
    );
    expect((send.mock.calls[0]![1] as { body: Record<string, unknown> }).body)
      .toHaveProperty('idempotency_key', 'k1');
  });
});

describe('mapping — verified against a real response', () => {
  it('maps a payment', async () => {
    const { module } = load({ result: { count: 1, results: [WIRE_PAYMENT], summary: WIRE_SUMMARY } });
    const page = await module.fetchServicePayments(7, DEPS);
    expect(page.results[0]).toEqual({
      id: 900,
      amount: '200.00',
      currency: 'PEN',
      method: 'cash',
      reference: 'V-001',
      notes: '',
      receivedByName: 'Ana Caja',
      receivedAt: '2026-09-02T15:00:00Z',
      createdAt: '2026-09-02T15:00:00Z',
      isReversed: false,
      reversedAt: null,
      reversedByName: '',
      reversalReason: '',
    });
  });

  it('keeps every amount a STRING and never parses one', async () => {
    // `0.1 + 0.2`. A number computed here could disagree with the shop's, and
    // the one that disagrees is the one somebody is reading across a counter.
    const { module } = load({ result: { count: 1, results: [WIRE_PAYMENT], summary: WIRE_SUMMARY } });
    const page = await module.fetchServicePayments(7, DEPS);
    expect(typeof page.results[0]!.amount).toBe('string');
    for (const v of [
      page.summary.quotedTotal, page.summary.confirmedPaid,
      page.summary.outstanding, page.summary.credit,
    ]) {
      expect(typeof v).toBe('string');
    }
  });

  it('preserves a NULL total and a NULL balance, which are not zero', async () => {
    // Null means "no agreed price". Coercing it to '0.00' would tell somebody
    // their repair is free.
    const { module } = load({
      result: {
        ...WIRE_SUMMARY, quoted_total: null, outstanding: null,
        payment_status: 'no_quote',
      },
    });
    const summary = await module.fetchServicePaymentSummary(7, DEPS);
    expect(summary.quotedTotal).toBeNull();
    expect(summary.outstanding).toBeNull();
    expect(summary.paymentStatus).toBe('no_quote');
  });

  it('requires the computed flags to be strictly true', async () => {
    const { module } = load({
      result: {
        count: 1,
        results: [{ ...WIRE_PAYMENT, is_reversed: 'yes' }],
        summary: { ...WIRE_SUMMARY, requires_payment_before_delivery: 1 },
      },
    });
    const page = await module.fetchServicePayments(7, DEPS);
    expect(page.results[0]!.isReversed).toBe(false);
    expect(page.summary.requiresPaymentBeforeDelivery).toBe(false);
  });

  it('carries no key and no fingerprint, because the server sends none', async () => {
    const { module } = load({
      result: {
        count: 1,
        results: [{ ...WIRE_PAYMENT, idempotency_key: 'k', request_fingerprint: 'f' }],
        summary: WIRE_SUMMARY,
      },
    });
    const page = await module.fetchServicePayments(7, DEPS);
    expect(Object.keys(page.results[0]!)).not.toContain('idempotencyKey');
    expect(Object.keys(page.results[0]!)).not.toContain('requestFingerprint');
  });

  it('reports the tenant policy so a screen can explain a refusal', async () => {
    const { module } = load({
      result: { ...WIRE_SUMMARY, requires_payment_before_delivery: true },
    });
    const summary = await module.fetchServicePaymentSummary(7, DEPS);
    expect(summary.requiresPaymentBeforeDelivery).toBe(true);
  });
});

describe('capabilities keep the till and the workshop apart', () => {
  it('does not imply payments from the wide lifecycle capability', () => {
    const lifecycle = context([CAP_SERVICE_ORDERS_VIEW, CAP_SERVICE_ORDERS_MANAGE]);
    expect(hasUxCapability(lifecycle, CAP_SERVICE_ORDERS_MANAGE)).toBe(true);
    expect(hasUxCapability(lifecycle, CAP_SERVICE_PAYMENTS_MANAGE)).toBe(false);
  });

  it('does not imply payments from repairing, inspecting or delivering', () => {
    // The owner's decision: authorised technicians manage the STATES of a
    // repair, and it does not follow that every technician handles cash.
    const bench = context([
      CAP_SERVICE_ORDERS_VIEW, CAP_SERVICE_REPAIR_MANAGE,
      CAP_SERVICE_QUALITY_MANAGE, CAP_SERVICE_DELIVERY_MANAGE,
    ]);
    expect(hasUxCapability(bench, CAP_SERVICE_DELIVERY_MANAGE)).toBe(true);
    expect(hasUxCapability(bench, CAP_SERVICE_PAYMENTS_MANAGE)).toBe(false);
  });

  it('lets a till take money without repairing or cancelling anything', () => {
    const till = context([CAP_SERVICE_ORDERS_VIEW, CAP_SERVICE_PAYMENTS_MANAGE]);
    expect(hasUxCapability(till, CAP_SERVICE_PAYMENTS_MANAGE)).toBe(true);
    for (const denied of [
      CAP_SERVICE_ORDERS_MANAGE, CAP_SERVICE_REPAIR_MANAGE,
      CAP_SERVICE_QUALITY_MANAGE, CAP_SERVICE_DELIVERY_MANAGE,
    ]) {
      expect(hasUxCapability(till, denied)).toBe(false);
    }
  });

  it('uses the SAME capability string the backend enforces', () => {
    expect(CAP_SERVICE_PAYMENTS_MANAGE).toBe('service.payments.manage');
  });
});

describe('cache — the ledger hangs off its order', () => {
  const scope = makeQueryScope({ tenantSlug: 'blackdog', userId: 42 });

  it('nests both keys under the service root', () => {
    const root = queryKeys.internalServiceRoot(scope);
    for (const key of [
      queryKeys.internalServicePayments(scope, 7),
      queryKeys.internalServicePaymentSummary(scope, 7),
    ]) {
      expect(key.slice(0, root.length)).toEqual(root);
    }
  });

  it('keeps the ledger apart from the summary and from other orders', () => {
    expect(queryKeys.internalServicePayments(scope, 7))
      .not.toEqual(queryKeys.internalServicePaymentSummary(scope, 7));
    expect(queryKeys.internalServicePayments(scope, 7))
      .not.toEqual(queryKeys.internalServicePayments(scope, 8));
  });

  it('does not collide with delivery, quality, execution or parts', () => {
    for (const other of [
      queryKeys.internalServiceDelivery(scope, 7),
      queryKeys.internalServiceQuality(scope, 7),
      queryKeys.internalServiceExecution(scope, 7),
      queryKeys.internalServiceParts(scope, 7),
    ]) {
      expect(queryKeys.internalServicePayments(scope, 7)).not.toEqual(other);
    }
  });

  it('separates tenants and users', () => {
    const otherTenant = makeQueryScope({ tenantSlug: 'otra', userId: 42 });
    const otherUser = makeQueryScope({ tenantSlug: 'blackdog', userId: 43 });
    expect(queryKeys.internalServicePayments(scope, 7))
      .not.toEqual(queryKeys.internalServicePayments(otherTenant, 7));
    expect(queryKeys.internalServicePayments(scope, 7))
      .not.toEqual(queryKeys.internalServicePayments(otherUser, 7));
  });

  it('nests the CUSTOMER balance under the repair, like the quote', () => {
    // Approving a quote changes what is owed. A balance that survived the
    // repair's invalidation would show a figure the shop no longer agrees with.
    const repair = queryKeys.repair(scope, 7);
    expect(queryKeys.repairPaymentSummary(scope, 7).slice(0, repair.length))
      .toEqual(repair);
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

  const M12B_FILES = [
    'src/features/internal/service-payment-section.tsx',
    'src/features/repairs/repair-payment-card.tsx',
    ...sourceFiles('src/app/internal/service'),
  ];

  it('does no arithmetic on money, anywhere', () => {
    // `0.1 + 0.2`. Every figure is a decimal STRING the server computed; a
    // number produced here could disagree with the shop's, and the one that
    // disagrees is the one somebody is reading across a counter.
    //
    // THE PATTERN NAMES THE MONEY, not the parsing. A first draft matched any
    // `Number(` and flagged `Number(id)` on a route param and — worse —
    // `setSerialNumber(`, which merely ENDS in `Number(`. Same false positive
    // as `waiting_parts` matching /part/: a guard that fires on innocent code
    // gets loosened by the next person, and then it guards nothing.
    const MONEY = '(amount|outstanding|paid|quotedTotal|confirmedPaid|credit|total)';
    // `[\w.?!\[\]'"]` and not `[\w.]`: the first draft of this guard missed
    // `Number(summary?.outstanding ?? '0')` because `?.` was not in the class,
    // and a guard that cannot see the obvious form of the mistake it exists for
    // is decoration. Verified by planting that exact line and watching it fail.
    const PATH = "[\\w.?!\\[\\]'\"]*";
    const offenders = M12B_FILES.filter((f) => {
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

  it('never sends a currency, a clock or a cashier', () => {
    const section = code('src/features/internal/service-payment-section.tsx');
    for (const forbidden of ['currency:', 'receivedAt:', 'receivedBy:']) {
      expect(section).not.toContain(forbidden);
    }
  });

  it('offers no way to edit or delete a payment', () => {
    const section = code('src/features/internal/service-payment-section.tsx');
    for (const forbidden of ['onEdit', 'onDelete', 'updatePayment', 'deletePayment']) {
      expect(section).not.toContain(forbidden);
    }
  });

  it('mints the key OUTSIDE render state', () => {
    // A key that changed on re-render would be no key at all — which for this
    // screen means charging somebody twice.
    const section = code('src/features/internal/service-payment-section.tsx');
    expect(section).toContain('useRef');
    expect(section).not.toMatch(/useState[^\n]*makeIdempotencyKey/);
  });

  it('warns that a reversal returns no money, before the button does anything', () => {
    const raw = fs.readFileSync(
      'src/features/internal/service-payment-section.tsx', 'utf8',
    );
    expect(raw).toContain('NO devuelve dinero');
  });

  it('never authorizes on a role name', () => {
    const offenders = M12B_FILES.filter((f) =>
      /(role\s*===|role\s*==\s*'|isTechnician|isAdmin\b|isMaster|is_platform_master)/
        .test(code(f)),
    );
    expect(offenders).toEqual([]);
  });

  it('gates on the capability instead', () => {
    const screen = code('src/app/internal/service/orders/[id].tsx');
    expect(screen).toContain('CAP_SERVICE_PAYMENTS_MANAGE');
    expect(screen).toContain('hasUxCapability');
  });

  it('writes no status and asserts no lifecycle target', () => {
    // Money and lifecycle are orthogonal: no payment moves an order, and there
    // is no `paid` state to move it to.
    const offenders = M12B_FILES.filter((f) => {
      const c = code(f);
      return /(TRANSITIONS|allowedTransitions|transitionMap)/.test(c)
        || /status:\s*'paid'/.test(c);
    });
    expect(offenders).toEqual([]);
  });

  it('retries nothing and queues nothing offline', () => {
    const offenders = M12B_FILES.filter((f) =>
      /(retry:\s+(?!false\b)\S|enqueue|pendingMutations|AsyncStorage)/.test(code(f)),
    );
    expect(offenders).toEqual([]);
  });

  it('never retries a payment or a reversal', () => {
    const hooks = code('src/hooks/use-internal-service.ts');
    expect(hooks).toContain('useRecordServicePayment');
    expect(hooks).toContain('useReverseServicePayment');
    expect(hooks).not.toMatch(/retry:\s+(?!false\b)\S/);
  });

  it('imports expo-blur nowhere and writes no brand hex', () => {
    const offenders = M12B_FILES.filter((f) => {
      const raw = fs.readFileSync(f, 'utf8');
      return /from 'expo-blur'/.test(raw) || /#[0-9a-fA-F]{6}\b/.test(code(f));
    });
    expect(offenders).toEqual([]);
  });

  it('keeps the customer surface out of every internal file', () => {
    const offenders = M12B_FILES.filter((f) => /\/api\/v1\/customer\//.test(code(f)));
    expect(offenders).toEqual([]);
  });

  it('offers the customer no way to pay and no fiscal document', () => {
    const card = code('src/features/repairs/repair-payment-card.tsx');
    for (const forbidden of [
      'onPay', 'checkout', 'izipay', 'stripe', 'Pagar', 'boleta', 'factura',
      'invoice', 'receipt',
    ]) {
      expect(card).not.toContain(forbidden);
    }
  });

  it('tells the customer where payment actually happens', () => {
    const raw = fs.readFileSync('src/features/repairs/repair-payment-card.tsx', 'utf8');
    expect(raw).toContain('El pago se realiza en el taller');
  });
});
