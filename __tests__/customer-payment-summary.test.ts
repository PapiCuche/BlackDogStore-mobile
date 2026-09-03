/**
 * M12B — what the CUSTOMER is told about the money, and what they are not.
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
    module = require('@/api/endpoints/customer-repairs-v1');
  });

  return { module, send };
}

afterEach(() => {
  jest.resetModules();
  jest.dontMock('@/api/authenticated-request');
  jest.dontMock('@/config/env');
});

const WIRE = {
  currency: 'PEN',
  quoted_total: '500.00',
  paid: '200.00',
  outstanding: '300.00',
  status: 'partial',
};

describe('the customer balance', () => {
  it('reaches the customer surface, never the internal one', async () => {
    const { module, send } = load({ result: WIRE });
    await module.fetchCustomerPaymentSummary(7, DEPS);
    expect(send.mock.calls[0]![0])
      .toBe('/api/v1/customer/blackdog/repairs/7/payment-summary/');
    expect(send.mock.calls[0]![0]).not.toContain('/internal/');
    expect(send.mock.calls[0]![0]).not.toContain('/api/admin/');
  });

  it('maps exactly five fields', async () => {
    const { module } = load({ result: WIRE });
    const summary = await module.fetchCustomerPaymentSummary(7, DEPS);
    expect(Object.keys(summary).sort())
      .toEqual(['currency', 'outstanding', 'paid', 'quotedTotal', 'status']);
  });

  it('keeps every figure a STRING', async () => {
    const { module } = load({ result: WIRE });
    const s = await module.fetchCustomerPaymentSummary(7, DEPS);
    for (const v of [s.quotedTotal, s.paid, s.outstanding]) {
      expect(typeof v).toBe('string');
    }
  });

  it('preserves a NULL total, which is not zero', async () => {
    const { module } = load({
      result: { ...WIRE, quoted_total: null, outstanding: null, status: 'no_quote' },
    });
    const s = await module.fetchCustomerPaymentSummary(7, DEPS);
    expect(s.quotedTotal).toBeNull();
    expect(s.outstanding).toBeNull();
    expect(s.status).toBe('no_quote');
  });

  it('drops any till detail the server should never have sent', async () => {
    // Defence in depth. The server allowlists five fields; this maps five. If
    // an upstream change ever widened that payload, nothing here would carry it
    // to a screen.
    const { module } = load({
      result: {
        ...WIRE,
        method: 'cash', reference: 'V-001', received_by_name: 'Ana Caja',
        is_reversed: true, reversal_reason: 'Error de caja', credit: '50.00',
      },
    });
    const s = await module.fetchCustomerPaymentSummary(7, DEPS);
    const body = JSON.stringify(s);
    for (const leak of [
      'cash', 'V-001', 'Ana Caja', 'Error de caja', 'credit', 'reversal',
    ]) {
      expect(body).not.toContain(leak);
    }
  });

  it('exports nothing that could take a payment', () => {
    const { module } = load();
    for (const absent of [
      'postCustomerPayment', 'payRepair', 'startRepairCheckout',
      'requestPaymentSession',
    ]) {
      expect((module as Record<string, unknown>)[absent]).toBeUndefined();
    }
  });

  it('refuses to build a URL with no tenant', async () => {
    const { module } = load({ slug: null, result: WIRE });
    await expect(module.fetchCustomerPaymentSummary(7, DEPS)).rejects.toThrow();
  });
});
