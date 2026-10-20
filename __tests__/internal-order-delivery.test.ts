/**
 * DELIVERY-01 — an order's delivery as staff keep it — and SERIAL-PICK-01 at
 * the till.
 *
 * Contract on `PapiCuche/BlackDogStore-web` @ `origin/master` `1448a5dd`
 * (`store/v1_internal_views.py` > `V1InternalOrderDeliveryView`,
 * `store/delivery_services.py`, `store/v1_pos_views.py` > `V1PosUnitLookupView`,
 * `store/pos_services.py` > `check_line_units`):
 *
 *   GET   internal/<slug>/orders/<id>/delivery/     sales.orders.view
 *   PATCH internal/<slug>/orders/<id>/delivery/     sales.orders.manage
 *   GET   internal/<slug>/sales/pos/units/lookup/?code=&branch=&method=
 *
 * THE RECORD IS NOT THE ORDER. Writing it changes neither the delivery method
 * the buyer chose, nor the address they typed, nor the total — freight is
 * information — nor the dispatch state.
 */
import { conditionsSignature } from '@/features/internal/pos-conditions';
import type { PosProduct } from '@/domain/internal/pos-types';
import { lineIsComplete } from '@/domain/internal/pos-types';

const BASE = 'https://api.example.test';
const DEPS = { refreshCoordinator: {} as never };

type Internal = typeof import('@/api/endpoints/internal-v1');
type Pos = typeof import('@/api/endpoints/internal-pos-v1');

const RECORD = {
  exists: true,
  can_edit: true,
  mode: 'national_address',
  mode_label: 'Envío nacional a domicilio',
  allowed_modes: ['national_address', 'agency_pickup'],
  recipient_name: 'Ana Torres',
  recipient_document_type: 'dni',
  recipient_document_number: '12345678',
  recipient_phone: '987654321',
  address_line: 'Av. Siempre Viva 742',
  district: 'Miraflores',
  city: 'Lima',
  department: 'Lima',
  reference: 'Portón azul',
  carrier: 3,
  carrier_name: 'Shalom',
  agency_name: '',
  agency_locality: '',
  freight_amount: '25.00',
  freight_paid_by: 'customer_at_destination',
  waybill_number: 'G-0001',
  tracking_code: 'TRK-9',
  tracking_url: 'https://shalom.test/track/G-0001',
  tracking_url_typed: false,
  shipped_at: '2026-10-19T18:00:00Z',
  updated_by: 'Ana Torres',
  updated_at: '2026-10-19T18:05:00Z',
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
    return options.result ?? RECORD;
  });

  let internal!: Internal;
  let pos!: Pos;
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
    internal = require('@/api/endpoints/internal-v1');
    pos = require('@/api/endpoints/internal-pos-v1');
  });

  return { internal, pos, send, deps: DEPS };
}

afterEach(() => {
  jest.resetModules();
  jest.dontMock('@/api/authenticated-request');
  jest.dontMock('@/config/env');
});

describe('reading the delivery record', () => {
  it('asks the delivery route of that order', async () => {
    const { internal, send, deps } = load();

    await internal.fetchOrderDelivery(77, deps);

    expect(send.mock.calls[0]![0]).toBe('/api/v1/internal/blackdog/orders/77/delivery/');
    expect(String(send.mock.calls[0]![0])).not.toMatch(/\/api\/admin\//);
  });

  it('maps the record, the allowed modes and who edited it', async () => {
    const { internal, deps } = load();

    const record = await internal.fetchOrderDelivery(77, deps);

    expect(record).toMatchObject({
      exists: true,
      canEdit: true,
      mode: 'national_address',
      allowedModes: ['national_address', 'agency_pickup'],
      carrier: 3,
      carrierName: 'Shalom',
      freightAmount: '25.00',
      freightPaidBy: 'customer_at_destination',
      trackingUrlTyped: false,
      updatedBy: 'Ana Torres',
    });
  });

  it('keeps the freight as the string it came as', async () => {
    // Freight is information about what the shop paid. Parsing it would be
    // this app deciding what a decimal means.
    const { internal, deps } = load({ result: { ...RECORD, freight_amount: '25.50' } });

    expect((await internal.fetchOrderDelivery(77, deps)).freightAmount).toBe('25.50');
  });

  it('reads a blank record as the same shape, not as an error', async () => {
    // An order with no record answers every field empty; `exists` is what
    // tells the two apart.
    const { internal, deps } = load({
      result: { exists: false, can_edit: false, mode: '', allowed_modes: [] },
    });

    const record = await internal.fetchOrderDelivery(77, deps);

    expect(record.exists).toBe(false);
    expect(record.canEdit).toBe(false);
    expect(record.freightAmount).toBeNull();
  });

  it('reads an absent can_edit as read-only', async () => {
    // A till sale has no delivery. Offering the form would be offering an act
    // the server answers 409 to.
    const { internal, deps } = load({ result: { ...RECORD, can_edit: undefined } });

    expect((await internal.fetchOrderDelivery(77, deps)).canEdit).toBe(false);
  });

  it('drops a mode it does not know rather than showing the wrong one', async () => {
    const { internal, deps } = load({
      result: { ...RECORD, mode: 'drone', allowed_modes: ['drone', 'agency_pickup'] },
    });

    const record = await internal.fetchOrderDelivery(77, deps);

    expect(record.mode).toBe('');
    expect(record.allowedModes).toEqual(['agency_pickup']);
  });
});

describe('writing the delivery record', () => {
  it('sends only the fields that changed', async () => {
    const { internal, send, deps } = load();

    await internal.patchOrderDelivery(77, { waybillNumber: 'G-0002' }, deps);

    const options = send.mock.calls[0]![1] as { method: string; body: Record<string, unknown> };
    expect(options.method).toBe('PATCH');
    expect(options.body).toEqual({ waybill_number: 'G-0002' });
  });

  it('does not send the tracking link when nobody typed one', async () => {
    // Untyped, the server derives it from the carrier and the waybill and
    // moves it when either changes. Echoing the old link back with a new
    // waybill would freeze a page for a number that no longer exists.
    const { internal, send, deps } = load();

    await internal.patchOrderDelivery(77, { waybillNumber: 'G-0002' }, deps);

    expect((send.mock.calls[0]![1] as { body: Record<string, unknown> }).body)
      .not.toHaveProperty('tracking_url');
  });

  it('sends a link somebody did type', async () => {
    const { internal, send, deps } = load();

    await internal.patchOrderDelivery(77, { trackingUrl: 'https://propio.test/x' }, deps);

    expect((send.mock.calls[0]![1] as { body: Record<string, unknown> }).body.tracking_url)
      .toBe('https://propio.test/x');
  });

  it('never sends the buyer own address', async () => {
    // `STAFF_FIELDS` does not include it: the address is what the buyer typed,
    // and a form that offered it would promise a correction the save drops.
    const fs = jest.requireActual('fs') as { readFileSync(p: string, e: 'utf8'): string };
    const source = fs.readFileSync('src/api/endpoints/internal-v1.ts', 'utf8');
    const patch = source.slice(source.indexOf('export async function patchOrderDelivery'));

    for (const forbidden of ['address_line', 'district =', 'body.city', 'body.reference']) {
      expect(patch).not.toContain(forbidden);
    }
  });

  it('sends the document as a pair, like every other identity on this platform', async () => {
    const { internal, send, deps } = load();

    await internal.patchOrderDelivery(77, { recipientDocumentType: 'ce' }, deps);

    expect((send.mock.calls[0]![1] as { body: Record<string, unknown> }).body).toEqual({
      recipient_document_type: 'ce',
      recipient_document_number: '',
    });
  });

  it('keeps the shop sentence when a mode cannot change', async () => {
    const { internal, deps } = load({
      makeError: (ApiError) =>
        new ApiError(
          'validation',
          'Esta entrega sólo puede cambiar entre envío a domicilio y recojo en agencia.',
          { status: 400 },
        ),
    });

    await expect(
      internal.patchOrderDelivery(77, { mode: 'pickup_store' }, deps),
    ).rejects.toMatchObject({ message: expect.stringContaining('sólo puede cambiar') });
  });

  it('keeps a 409 as «this is not an online order»', async () => {
    const { internal, deps } = load({
      makeError: (ApiError) =>
        new ApiError('unknown', 'Esta venta no tiene entrega.', { status: 409 }),
    });

    await expect(internal.patchOrderDelivery(77, { waybillNumber: 'X' }, deps)).rejects
      .toMatchObject({ status: 409 });
  });

  it('refuses to guess a tenant', async () => {
    const { internal, send, deps } = load({ slug: null });

    await expect(internal.fetchOrderDelivery(77, deps)).rejects.toMatchObject({
      name: 'MissingTenantError',
    });
    expect(send).not.toHaveBeenCalled();
  });
});

describe('selling a device at the till', () => {
  const UNIT = {
    unit: {
      unit_id: 31,
      product_id: 9,
      product_name: 'iPhone 13 · Negro',
      serial_number: 'SN-1',
      imei: '356938035643809',
      imei2: '',
      condition: 'new',
      condition_label: 'Nuevo',
      requires_imei: true,
    },
    product: {
      id: 9,
      name: 'iPhone 13',
      price: '2999.00',
      available: 2,
      barcode: '',
      is_serialized: true,
      requires_imei: true,
    },
    method: 'scanner',
  };

  it('asks the till unit route with the code, the branch and the method', async () => {
    const { pos, send, deps } = load({ result: UNIT });

    await pos.lookupPosUnit({ code: 'SN-1', branch: 2, method: 'manual' }, deps);

    const [path, options] = send.mock.calls[0]! as [string, Record<string, unknown>];
    expect(path).toBe('/api/v1/internal/blackdog/sales/pos/units/lookup/');
    expect(options.query).toEqual({ code: 'SN-1', branch: 2, method: 'manual' });
  });

  it('answers the device and the article it is', async () => {
    const { pos, deps } = load({ result: UNIT });

    const found = await pos.lookupPosUnit({ code: 'SN-1', branch: 2 }, deps);

    expect(found!.unit.unitId).toBe(31);
    expect(found!.product).toMatchObject({ id: 9, isSerialized: true, requiresImei: true });
  });

  it('reads a 404 as null, for a device that is not sellable here', async () => {
    // A device that exists nowhere and one on another company's shelf answer
    // the same way, on purpose.
    const { pos, deps } = load({
      makeError: (ApiError) => new ApiError('not_found', 'No encontrado.', { status: 404 }),
    });

    expect(await pos.lookupPosUnit({ code: 'SN-1', branch: 2 }, deps)).toBeNull();
  });

  it('reads is_serialized off the catalogue, defaulting to NOT serialised', async () => {
    const { pos, deps } = load({
      result: { results: [{ id: 4, name: 'Funda', price: '30.00', available: 5, barcode: '' }] },
    });

    const [product] = await pos.searchPosProducts({ q: 'funda', branch: 2 }, deps);

    expect(product!.isSerialized).toBe(false);
  });

  it('sends the devices of a serialised line on the preview', async () => {
    const { pos, send, deps } = load({ result: { items: [], total: '0.00' } });

    await pos.previewPosSale(
      {
        branch: 2,
        items: [{ product: 9, quantity: 2, units: [
          { unitId: 31, method: 'scanner' },
          { unitId: 32, method: 'manual' },
        ] }],
      },
      deps,
    );

    expect((send.mock.calls[0]![1] as { body: { items: unknown[] } }).body.items).toEqual([
      {
        product: 9,
        quantity: 2,
        units: [
          { id: 31, method: 'scanner' },
          { id: 32, method: 'manual' },
        ],
      },
    ]);
  });

  it('omits `units` entirely for an ordinary article', async () => {
    // A basket without it hashes exactly as it did before SERIAL-PICK-01,
    // which is what keeps an idempotency key meaning the same basket.
    const { pos, send, deps } = load({ result: { items: [], total: '0.00' } });

    await pos.previewPosSale({ branch: 2, items: [{ product: 4, quantity: 1, units: [] }] }, deps);

    expect((send.mock.calls[0]![1] as { body: { items: unknown[] } }).body.items).toEqual([
      { product: 4, quantity: 1 },
    ]);
  });
});

describe('a basket that cannot be charged', () => {
  const serialised: PosProduct = {
    id: 9,
    name: 'iPhone 13',
    price: '2999.00',
    available: 2,
    barcode: '',
    isSerialized: true,
    requiresImei: true,
  };
  const ordinary: PosProduct = { ...serialised, id: 4, isSerialized: false, requiresImei: false };

  it('is incomplete while a serialised line names fewer devices than it sells', () => {
    // `check_line_units`: «se vende por su IMEI o serie. La venta lleva 2 y
    // hay 1 identificado(s)».
    expect(lineIsComplete({ product: serialised, quantity: 2, units: [] })).toBe(false);
    expect(
      lineIsComplete({
        product: serialised,
        quantity: 2,
        units: [{ unitId: 31, method: 'scanner' }],
      }),
    ).toBe(false);
    expect(
      lineIsComplete({
        product: serialised,
        quantity: 2,
        units: [
          { unitId: 31, method: 'scanner' },
          { unitId: 32, method: 'scanner' },
        ],
      }),
    ).toBe(true);
  });

  it('is incomplete when an ordinary line names a device', () => {
    // «no se controla por número de serie».
    expect(
      lineIsComplete({ product: ordinary, quantity: 1, units: [{ unitId: 31, method: 'scanner' }] }),
    ).toBe(false);
    expect(lineIsComplete({ product: ordinary, quantity: 1, units: [] })).toBe(true);
  });
});

describe('the idempotency key and the devices', () => {
  const serialised: PosProduct = {
    id: 9,
    name: 'iPhone 13',
    price: '2999.00',
    available: 2,
    barcode: '',
    isSerialized: true,
    requiresImei: true,
  };
  const base = {
    branch: 2,
    couponCode: '',
    manualDiscountType: '' as const,
    manualDiscountValue: '',
    discountReason: '',
    seller: null,
  };

  it('tells two baskets apart when only the DEVICE differs', () => {
    // The key is minted from this signature and the server fingerprints the
    // sale WITH its units. One key for two different devices would come back
    // refused as a key already used for something else.
    const first = conditionsSignature({
      ...base,
      lines: [{ product: serialised, quantity: 1, units: [{ unitId: 31, method: 'scanner' }] }],
    });
    const second = conditionsSignature({
      ...base,
      lines: [{ product: serialised, quantity: 1, units: [{ unitId: 32, method: 'scanner' }] }],
    });

    expect(first).not.toBe(second);
  });

  it('still treats the same devices in another order as one basket', () => {
    const a = conditionsSignature({
      ...base,
      lines: [{ product: serialised, quantity: 2, units: [
        { unitId: 31, method: 'scanner' },
        { unitId: 32, method: 'manual' },
      ] }],
    });
    const b = conditionsSignature({
      ...base,
      lines: [{ product: serialised, quantity: 2, units: [
        { unitId: 32, method: 'manual' },
        { unitId: 31, method: 'scanner' },
      ] }],
    });

    expect(a).toBe(b);
  });
});
