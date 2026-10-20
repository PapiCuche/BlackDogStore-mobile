/**
 * SERIAL-PICK-01 (which device left) and CLIENT-SEC-01 (the review a person
 * decides), on the internal order.
 *
 * Contract on `PapiCuche/BlackDogStore-web` @ `origin/master` `1448a5dd`
 * (`store/v1_internal_views.py`, `store/unit_identification.py`,
 * `store/order_risk.py`, `store/v1_internal_serializers.py`):
 *
 *   GET    internal/<slug>/orders/<id>/units/lookup/?code=&method=
 *   POST   internal/<slug>/orders/<id>/units/          {code, method}
 *   DELETE internal/<slug>/orders/<id>/units/<unit>/
 *   POST   internal/<slug>/orders/<id>/risk-review/    {decision, note?}
 *
 * ONE RULE, TWO SURFACES: the same services the web panel calls, behind
 * `sales.orders.manage` and the same order visibility. The app that is refused
 * «entregado» because a device is missing must be able to say which one.
 */
import {
  UNIT_ERROR_CODES,
  UNIT_METHODS,
  describeUnitMethod,
} from '@/domain/internal/order-unit-types';

const BASE = 'https://api.example.test';
const DEPS = { refreshCoordinator: {} as never };

type Loaded = typeof import('@/api/endpoints/internal-v1');

const UNIT_ROW = {
  id: 55,
  product_id: 9,
  serial_number: 'SN-0001',
  imei: '356938035643809',
  imei2: '',
  method: 'scanner',
  method_label: 'Lector',
  identified_at: '2026-10-19T15:00:00Z',
  identified_by: 'vendedor1',
  can_remove: true,
};

const ORDER_ROW = {
  id: 77,
  status: 'paid',
  fulfillment_status: 'preparing',
  total: '1999.00',
  items: [],
  available_fulfillment_transitions: ['ready_for_pickup'],
  units: [UNIT_ROW],
  units_pending: 1,
  units_pending_by_product: { '9': 1 },
  units_can_change: true,
  risk: {
    level: 'high',
    level_label: 'Alto',
    score: 70,
    signals: [{ code: 'new_account', label: 'Cuenta creada hoy' }],
    review_status: 'pending',
    review_status_label: 'Pendiente',
    reviewed_by: null,
    reviewed_at: null,
    review_note: '',
    assessed_at: '2026-10-19T14:00:00Z',
    can_review: true,
  },
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
    return options.result ?? ORDER_ROW;
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
    module = require('@/api/endpoints/internal-v1');
  });

  return { module, send, deps: DEPS };
}

afterEach(() => {
  jest.resetModules();
  jest.dontMock('@/api/authenticated-request');
  jest.dontMock('@/config/env');
});

describe('what the order says about its devices', () => {
  it('maps the records, the server count and whether more can be named', async () => {
    const { module, deps } = load();

    const order = await module.fetchInternalOrder(77, deps);

    expect(order.unitsPending).toBe(1);
    expect(order.unitsPendingByProduct).toEqual({ '9': 1 });
    expect(order.unitsCanChange).toBe(true);
    expect(order.units[0]).toEqual({
      id: 55,
      productId: 9,
      serialNumber: 'SN-0001',
      imei: '356938035643809',
      imei2: '',
      method: 'scanner',
      methodLabel: 'Lector',
      identifiedAt: '2026-10-19T15:00:00Z',
      identifiedBy: 'vendedor1',
      canRemove: true,
    });
  });

  it('counts nothing of its own', async () => {
    // `pending_units` already subtracts devices that went back to the shelf and
    // lines still on order from a supplier. A count from `units.length` would
    // disagree the first time either happens.
    const { module, deps } = load({
      result: { ...ORDER_ROW, units: [UNIT_ROW, { ...UNIT_ROW, id: 56 }], units_pending: 3 },
    });

    const order = await module.fetchInternalOrder(77, deps);

    expect(order.units).toHaveLength(2);
    expect(order.unitsPending).toBe(3);
  });

  it('reads an absent permission as «cannot change»', async () => {
    const { module, deps } = load({
      result: { ...ORDER_ROW, units_can_change: undefined, units: [{ ...UNIT_ROW, can_remove: undefined }] },
    });

    const order = await module.fetchInternalOrder(77, deps);

    expect(order.unitsCanChange).toBe(false);
    expect(order.units[0]!.canRemove).toBe(false);
  });

  it('keeps a risk block of null as null', async () => {
    // An order nobody assessed has none, and an empty block would read as
    // «assessed, nothing found».
    const { module, deps } = load({ result: { ...ORDER_ROW, risk: null } });

    expect((await module.fetchInternalOrder(77, deps)).risk).toBeNull();
  });

  it('maps the assessment with the server labels and its own verdict on who may decide', async () => {
    const { module, deps } = load();

    const risk = (await module.fetchInternalOrder(77, deps)).risk!;

    expect(risk.levelLabel).toBe('Alto');
    expect(risk.signals).toEqual([{ code: 'new_account', label: 'Cuenta creada hoy' }]);
    expect(risk.canReview).toBe(true);
    expect(risk.reviewedBy).toBeNull();
  });

  it('reads an absent can_review as «may not decide»', async () => {
    const { module, deps } = load({
      result: { ...ORDER_ROW, risk: { ...ORDER_ROW.risk, can_review: undefined } },
    });

    expect((await module.fetchInternalOrder(77, deps)).risk!.canReview).toBe(false);
  });
});

describe('looking a device up before committing it', () => {
  const CANDIDATE = {
    unit: {
      unit_id: 31,
      product_id: 9,
      product_name: 'iPhone 13 · Negro',
      serial_number: 'SN-0001',
      imei: '356938035643809',
      imei2: '',
      condition: 'new',
      condition_label: 'Nuevo',
      requires_imei: true,
    },
    method: 'scanner',
  };

  it('asks the lookup route with the code and the method, and writes nothing', async () => {
    const { module, send, deps } = load({ result: CANDIDATE });

    await module.lookupOrderUnit(77, 'SN-0001', 'scanner', deps);

    const [path, options] = send.mock.calls[0]! as [string, Record<string, unknown>];
    expect(path).toBe('/api/v1/internal/blackdog/orders/77/units/lookup/');
    expect(options.method).toBeUndefined();
    expect(options.query).toEqual({ code: 'SN-0001', method: 'scanner' });
  });

  it('describes the device so a person can confirm «yes, this one»', async () => {
    const { module, deps } = load({ result: CANDIDATE });

    expect(await module.lookupOrderUnit(77, 'SN-0001', 'scanner', deps)).toEqual({
      unitId: 31,
      productId: 9,
      productName: 'iPhone 13 · Negro',
      serialNumber: 'SN-0001',
      imei: '356938035643809',
      imei2: '',
      condition: 'new',
      conditionLabel: 'Nuevo',
      requiresImei: true,
    });
  });

  it('never reaches the legacy surface', async () => {
    const { module, send, deps } = load({ result: CANDIDATE });

    await module.lookupOrderUnit(77, 'SN-0001', 'scanner', deps);

    expect(String(send.mock.calls[0]![0])).not.toMatch(/\/api\/admin\//);
  });
});

describe('committing and taking back a device', () => {
  it('posts the code and the method, and reads the whole order back', async () => {
    const { module, send, deps } = load();

    const order = await module.identifyOrderUnit(77, 'SN-0001', 'manual', deps);

    const [path, options] = send.mock.calls[0]! as [string, Record<string, unknown>];
    expect(path).toBe('/api/v1/internal/blackdog/orders/77/units/');
    expect(options.method).toBe('POST');
    expect(options.body).toEqual({ code: 'SN-0001', method: 'manual' });
    // The answer carries the remaining count, so nothing is computed locally.
    expect(order.unitsPending).toBe(1);
  });

  it('sends only the two methods the server accepts', () => {
    expect(UNIT_METHODS).toEqual(['scanner', 'manual']);
  });

  it('deletes one record by its own id', async () => {
    const { module, send, deps } = load();

    await module.forgetOrderUnit(77, 55, deps);

    const [path, options] = send.mock.calls[0]! as [string, Record<string, unknown>];
    expect(path).toBe('/api/v1/internal/blackdog/orders/77/units/55/');
    expect(options.method).toBe('DELETE');
  });

  it('keeps the server sentence when the code is not a device', async () => {
    const { module, deps } = load({
      makeError: (ApiError) =>
        new ApiError('not_found', 'Ese código no corresponde a ningún equipo.', { status: 404 }),
    });

    await expect(module.identifyOrderUnit(77, 'NOPE', 'manual', deps)).rejects.toMatchObject({
      name: 'InternalAccessDeniedError',
    });
  });

  it('keeps a 409 as a conflict about the device, not as a permission problem', async () => {
    // «Ese equipo ya salió con otro pedido» is a device that exists and cannot
    // be used here. Telling somebody they lack a capability they hold would
    // send them to the wrong person.
    const { module, deps } = load({
      makeError: (ApiError) =>
        new ApiError('unknown', 'Ese equipo ya salió con otro pedido.', { status: 409 }),
    });

    await expect(module.identifyOrderUnit(77, 'SN-0001', 'scanner', deps)).rejects.toMatchObject({
      status: 409,
      message: 'Ese equipo ya salió con otro pedido.',
    });
  });

  it('reads a 403 as the capability missing', async () => {
    const { module, deps } = load({
      makeError: (ApiError) => new ApiError('unauthorized', 'No permitido.', { status: 403 }),
    });

    await expect(module.forgetOrderUnit(77, 55, deps)).rejects.toMatchObject({
      name: 'InternalCapabilityMissingError',
    });
  });

  it('refuses to guess a tenant', async () => {
    const { module, send, deps } = load({ slug: null });

    await expect(module.identifyOrderUnit(77, 'SN-0001', 'scanner', deps)).rejects.toMatchObject({
      name: 'MissingTenantError',
    });
    expect(send).not.toHaveBeenCalled();
  });
});

describe('deciding the review', () => {
  const DECIDED = {
    risk: {
      ...ORDER_ROW.risk,
      review_status: 'approved',
      review_status_label: 'Aprobado',
      reviewed_by: 'Ana Torres',
      reviewed_at: '2026-10-19T16:00:00Z',
      review_note: 'Llamé al cliente.',
      can_review: false,
    },
  };

  it('sends the server own words for the decision', async () => {
    // `ChoiceField(choices=['approve', 'reject'])`. A client vocabulary of
    // «approved»/«rejected» is exactly the drift that broke the quote decision.
    const { module, send, deps } = load({ result: DECIDED });

    await module.reviewOrderRisk(77, 'approve', 'Llamé al cliente.', deps);

    const [path, options] = send.mock.calls[0]! as [string, Record<string, unknown>];
    expect(path).toBe('/api/v1/internal/blackdog/orders/77/risk-review/');
    expect(options.method).toBe('POST');
    expect(options.body).toEqual({ decision: 'approve', note: 'Llamé al cliente.' });
  });

  it('omits an empty note rather than sending a blank one', async () => {
    const { module, send, deps } = load({ result: DECIDED });

    await module.reviewOrderRisk(77, 'reject', '   ', deps);

    expect((send.mock.calls[0]![1] as { body: Record<string, unknown> }).body).toEqual({
      decision: 'reject',
    });
  });

  it('reads back the assessment alone, because manage does not imply view', async () => {
    const { module, deps } = load({ result: DECIDED });

    const risk = await module.reviewOrderRisk(77, 'approve', '', deps);

    expect(risk).toMatchObject({
      reviewStatus: 'approved',
      reviewedBy: 'Ana Torres',
      reviewNote: 'Llamé al cliente.',
      canReview: false,
    });
  });

  it('keeps a 409 as «somebody already decided»', async () => {
    const { module, deps } = load({
      makeError: (ApiError) =>
        new ApiError('unknown', 'Esta revisión ya fue resuelta.', { status: 409 }),
    });

    await expect(module.reviewOrderRisk(77, 'approve', '', deps)).rejects.toMatchObject({
      status: 409,
      message: 'Esta revisión ya fue resuelta.',
    });
  });
});

describe('what this module does not decide', () => {
  it('names the error codes the server uses, and invents none', () => {
    expect(UNIT_ERROR_CODES).toEqual({
      invalidCode: 'invalid_code',
      invalidMethod: 'invalid_method',
      manualNeedsImei: 'manual_needs_imei',
      notFound: 'not_found',
    });
  });

  it('prefers the server label for a method over its own words', () => {
    expect(describeUnitMethod('scanner', 'Lector')).toBe('Lector');
    expect(describeUnitMethod('legacy', 'Asignado por el sistema (regla anterior)')).toBe(
      'Asignado por el sistema (regla anterior)',
    );
    // Only a payload that sent no label falls back to these.
    expect(describeUnitMethod('manual', '')).toBe('Ingreso manual');
  });

  it('computes no pending count anywhere in the mapper', () => {
    const fs = jest.requireActual('fs') as { readFileSync(p: string, e: 'utf8'): string };
    const source = fs.readFileSync('src/api/endpoints/internal-v1.ts', 'utf8');

    // No subtraction of identified from wanted: `pending_units` is the server's.
    expect(source).not.toContain('units.length -');
    expect(source).not.toContain('- done');
  });
});
