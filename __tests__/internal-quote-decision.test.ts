/**
 * SERVICE-TRACKING — the answer a customer gives a PERSON, and reopening an
 * approval when the work turns out to be different.
 *
 * Contract on `PapiCuche/BlackDogStore-web` @ `origin/master`
 * `aec829c697674efb61f9776a4f796bfc05663ddc`:
 *
 *   POST quotes/<id>/decision/  `service.orders.view` + `service.quotes.record_decision`
 *   POST quotes/<id>/reopen/    `service.diagnostic.manage`
 *
 * TWO CAPABILITIES, NOT ONE. `record_staff_quote_decision` is deliberately not
 * `service.diagnostic.manage`: the person who quotes the work should not, by
 * that alone, be the one who says it was accepted. The client mirrors that by
 * asking for the two answers separately and drawing each control from its own.
 *
 * The channel is required and comes from `RepairQuoteDecision.STAFF_CHANNELS`.
 * The customer's OWN channels are not in that list, because a staff member
 * must not be able to record an answer as if the customer had given it.
 */
import {
  STAFF_DECISION_CHANNELS,
  STAFF_DECISION_NOTE_MAX_LENGTH,
} from '@/domain/internal/service-types';

const BASE = 'https://api.example.test';
const DEPS = { refreshCoordinator: {} as never };

type Loaded = typeof import('@/api/endpoints/internal-service-v1');

const QUOTE = {
  id: 5,
  revision: 2,
  status: 'approved',
  status_label: 'Aprobada',
  currency: 'PEN',
  subtotal: '100.00',
  discount_amount: '0.00',
  tax_amount: '18.00',
  total: '118.00',
  items: [],
  decision: {
    decision: 'approved',
    decided_at: '2026-10-04T09:00:00Z',
    channel: 'phone',
    recorded_by_name: 'Ana',
  },
  created_at: '2026-10-01T09:00:00Z',
  updated_at: '2026-10-04T09:00:00Z',
};

function load(
  options: {
    slug?: string | null;
    result?: unknown;
    makeError?: (ApiError: typeof import('@/api/errors').ApiError) => Error;
  } = {},
) {
  let thrown: Error | null = null;
  const send = jest.fn(async (..._args: unknown[]) => {
    if (thrown) throw thrown;
    return options.result ?? { quote: QUOTE };
  });

  let module!: Loaded;
  jest.isolateModules(() => {
    jest.doMock('@/api/authenticated-request', () => ({
      authenticatedRequest: (path: string, opts: unknown, d: unknown) => send(path, opts, d),
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

describe('recording the answer', () => {
  it('posts to the quote decision route of that order', async () => {
    const { module, send } = load();

    await module.postServiceQuoteStaffDecision(
      77,
      5,
      { decision: 'approved', channel: 'phone' },
      DEPS,
    );

    expect(send.mock.calls[0]![0]).toBe(
      '/api/v1/internal/blackdog/service/orders/77/quotes/5/decision/',
    );
    const options = send.mock.calls[0]![1] as { method: string; scope: string };
    expect(options.method).toBe('POST');
    expect(options.scope).toBe('authenticated-v1');
  });

  it('sends the answer and the channel it arrived by', async () => {
    const { module, send } = load();

    await module.postServiceQuoteStaffDecision(
      77,
      5,
      { decision: 'rejected', channel: 'in_person' },
      DEPS,
    );

    const body = (send.mock.calls[0]![1] as { body: Record<string, unknown> }).body;
    expect(body).toEqual({ decision: 'rejected', channel: 'in_person' });
  });

  it('never names who recorded it: the session does', async () => {
    const { module, send } = load();

    await module.postServiceQuoteStaffDecision(
      77,
      5,
      { decision: 'approved', channel: 'whatsapp', note: 'Confirmó por chat' },
      DEPS,
    );

    const body = (send.mock.calls[0]![1] as { body: Record<string, unknown> }).body;
    for (const owned of ['recorded_by', 'actor', 'user', 'customer', 'decided_at', 'status']) {
      expect(body).not.toHaveProperty(owned);
    }
    expect(body.note).toBe('Confirmó por chat');
  });

  it('omits an empty note rather than sending a blank one', async () => {
    const { module, send } = load();

    await module.postServiceQuoteStaffDecision(
      77,
      5,
      { decision: 'approved', channel: 'other', note: '   ' },
      DEPS,
    );

    expect((send.mock.calls[0]![1] as { body: Record<string, unknown> }).body).not.toHaveProperty(
      'note',
    );
  });

  it('offers only the channels the SERVER accepts from staff', () => {
    // `STAFF_CHANNELS` is in_person / phone / whatsapp / other. The customer's
    // own channels are absent so that an answer cannot be recorded as if they
    // had given it themselves.
    expect(STAFF_DECISION_CHANNELS.map((c) => c.value)).toEqual([
      'in_person',
      'phone',
      'whatsapp',
      'other',
    ]);
    expect(STAFF_DECISION_CHANNELS.map((c) => c.value)).not.toContain('app');
    expect(STAFF_DECISION_CHANNELS.map((c) => c.value)).not.toContain('tracking_link');
  });

  it('caps the note where the server caps it', () => {
    expect(STAFF_DECISION_NOTE_MAX_LENGTH).toBe(300);
  });

  it('reads the quote out of the envelope the server returns', async () => {
    const { module } = load();

    const quote = await module.postServiceQuoteStaffDecision(
      77,
      5,
      { decision: 'approved', channel: 'phone' },
      DEPS,
    );

    expect(quote.id).toBe(5);
    expect(quote.status).toBe('approved');
    expect(quote.decision?.decision).toBe('approved');
  });

  it('turns a 409 into the domain conflict, with the server sentence', async () => {
    // One answer per quote. A second one is a real outcome, and the operator
    // needs to read what the server said rather than a generic failure.
    const { module } = load({
      makeError: (ApiError) =>
        new ApiError('unknown', 'Esta cotización ya tiene una respuesta registrada.', {
          status: 409,
        }),
    });

    await expect(
      module.postServiceQuoteStaffDecision(77, 5, { decision: 'approved', channel: 'phone' }, DEPS),
    ).rejects.toMatchObject({
      message: 'Esta cotización ya tiene una respuesta registrada.',
    });
  });

  it('turns a 403 into a missing capability, not a logout', async () => {
    const { module } = load({
      makeError: (ApiError) => new ApiError('unauthorized', 'No permitido.', { status: 403 }),
    });

    await expect(
      module.postServiceQuoteStaffDecision(77, 5, { decision: 'approved', channel: 'phone' }, DEPS),
    ).rejects.toMatchObject({ name: 'InternalCapabilityMissingError' });
  });

  it('refuses to guess a tenant', async () => {
    const { module, send } = load({ slug: null });

    await expect(
      module.postServiceQuoteStaffDecision(77, 5, { decision: 'approved', channel: 'phone' }, DEPS),
    ).rejects.toMatchObject({ name: 'MissingTenantError' });
    expect(send).not.toHaveBeenCalled();
  });
});

describe('reopening an approval', () => {
  it('posts to the reopen route and returns the NEW draft', async () => {
    const { module, send } = load({
      result: { quote: { ...QUOTE, id: 6, revision: 3, status: 'draft', decision: null } },
    });

    const fresh = await module.postServiceQuoteReopen(77, 5, 'El equipo trae otra falla', DEPS);

    expect(send.mock.calls[0]![0]).toBe(
      '/api/v1/internal/blackdog/service/orders/77/quotes/5/reopen/',
    );
    expect(fresh.id).toBe(6);
    expect(fresh.revision).toBe(3);
    expect(fresh.status).toBe('draft');
  });

  it('sends the reason, and nothing else', async () => {
    const { module, send } = load({ result: { quote: QUOTE } });

    await module.postServiceQuoteReopen(77, 5, '  Cambió el repuesto  ', DEPS);

    expect((send.mock.calls[0]![1] as { body: Record<string, unknown> }).body).toEqual({
      reason: 'Cambió el repuesto',
    });
  });

  it('omits an empty reason instead of sending a blank string', async () => {
    const { module, send } = load({ result: { quote: QUOTE } });

    await module.postServiceQuoteReopen(77, 5, '', DEPS);

    expect((send.mock.calls[0]![1] as { body: Record<string, unknown> }).body).toEqual({});
  });

  it('turns a 400 into the domain refusal', async () => {
    const { module } = load({
      makeError: (ApiError) =>
        new ApiError('validation', 'Sólo se puede reabrir una cotización aprobada.', {
          status: 400,
        }),
    });

    await expect(module.postServiceQuoteReopen(77, 5, 'x', DEPS)).rejects.toMatchObject({
      message: 'Sólo se puede reabrir una cotización aprobada.',
    });
  });
});
