/**
 * DC3 at the till — «bajo pedido».
 *
 * Contract on `PapiCuche/BlackDogStore-web` @ `origin/master` `1448a5d`
 * (`store/pos_payloads.py` > `product_payload`, `store/pos_services.py` >
 * `_clean_items` / `check_line_units` / `MAX_SUPPLY_REASON`):
 *
 *   product.on_order   {lead_time_days, price, over_stock?} or null
 *   line.on_order      true — this line is ORDERED, not taken off the shelf
 *   line.supply_reason free text, 200 characters
 *
 * THREE RULES THE SERVER ENFORCES, AND THE TILL MUST NOT FIGHT:
 *   · one product is sold from stock OR on order, never both in one sale;
 *   · an ordered line names NO device — none exists yet, it is identified when
 *     the article is received;
 *   · a serialised line taken off the shelf names exactly as many devices as
 *     it sells.
 */
import { describeScan } from '@/features/internal/pos-scan';
import type { PosProduct } from '@/domain/internal/pos-types';
import {
  SUPPLY_REASON_MAX_LENGTH,
  describePosOnOrder,
  lineIsComplete,
} from '@/domain/internal/pos-types';

const BASE = 'https://api.example.test';
const DEPS = { refreshCoordinator: {} as never };

type Pos = typeof import('@/api/endpoints/internal-pos-v1');

function load(result: unknown) {
  const send = jest.fn(async (..._args: unknown[]) => result);
  let pos!: Pos;
  jest.isolateModules(() => {
    jest.doMock('@/api/authenticated-request', () => ({
      authenticatedRequest: (path: string, opts: unknown, d: unknown) => send(path, opts, d),
    }));
    jest.doMock('@/config/env', () => ({
      ...jest.requireActual('@/config/env'),
      companySlug: 'blackdog',
      apiBaseUrl: BASE,
      isApiConfigured: true,
    }));
    pos = require('@/api/endpoints/internal-pos-v1');
  });
  return { pos, send, deps: DEPS };
}

afterEach(() => {
  jest.resetModules();
  jest.dontMock('@/api/authenticated-request');
  jest.dontMock('@/config/env');
});

function product(extra: Partial<PosProduct> = {}): PosProduct {
  return {
    id: 3,
    name: 'Cargador 20W',
    price: '99.00',
    available: 0,
    barcode: '',
    isSerialized: false,
    requiresImei: false,
    onOrder: null,
    ...extra,
  };
}

describe('what the till reads about an offer', () => {
  it('maps the lead time, the on-order price and over_stock', async () => {
    const { pos, deps } = load({
      results: [
        {
          id: 3,
          name: 'Cargador 20W',
          price: '99.00',
          available: 0,
          barcode: '',
          is_serialized: false,
          requires_imei: false,
          on_order: { lead_time_days: 5, price: '109.90', over_stock: true },
        },
      ],
    });

    const [found] = await pos.searchPosProducts({ q: 'cargador', branch: 2 }, deps);

    expect(found!.onOrder).toEqual({ leadTimeDays: 5, price: '109.90', overStock: true });
  });

  it('reads a half-written offer as no offer', async () => {
    const { pos, deps } = load({
      results: [
        {
          id: 3, name: 'x', price: '1.00', available: 0, barcode: '',
          on_order: { price: '109.90' },
        },
      ],
    });

    const [found] = await pos.searchPosProducts({ q: 'x', branch: 2 }, deps);

    expect(found!.onOrder).toBeNull();
  });
});

describe('what a scan does with an empty shelf', () => {
  it('offers to order it rather than adding it', async () => {
    // Ordering from a supplier commits the shop to buying something. The web
    // till waits for the operator here and so does this one.
    const outcome = describeScan(
      '123',
      product({ onOrder: { leadTimeDays: 5, price: '109.90', overStock: false } }),
    );

    expect(outcome.kind).toBe('on_order_available');
    expect(outcome.message).toContain('bajo pedido');
  });

  it('still refuses an article with nothing on the shelf and no offer', async () => {
    expect(describeScan('123', product()).kind).toBe('no_stock');
  });

  it('adds one from the shelf as before, offer or no offer', async () => {
    const outcome = describeScan(
      '123',
      product({
        available: 4,
        onOrder: { leadTimeDays: 5, price: '109.90', overStock: true },
      }),
    );

    expect(outcome.kind).toBe('add');
  });
});

describe('what the basket sends', () => {
  it('marks an ordered line and carries its reason', async () => {
    const { pos, send, deps } = load({ items: [], total: '0.00' });

    await pos.previewPosSale(
      {
        branch: 2,
        items: [
          { product: 3, quantity: 1, onOrder: true, supplyReason: '  El cliente lo espera  ' },
        ],
      },
      deps,
    );

    expect((send.mock.calls[0]![1] as { body: { items: unknown[] } }).body.items).toEqual([
      { product: 3, quantity: 1, on_order: true, supply_reason: 'El cliente lo espera' },
    ]);
  });

  it('sends no reason for a line nobody explained', async () => {
    const { pos, send, deps } = load({ items: [], total: '0.00' });

    await pos.previewPosSale(
      { branch: 2, items: [{ product: 3, quantity: 1, onOrder: true, supplyReason: '   ' }] },
      deps,
    );

    expect((send.mock.calls[0]![1] as { body: { items: unknown[] } }).body.items).toEqual([
      { product: 3, quantity: 1, on_order: true },
    ]);
  });

  it('says nothing at all for an ordinary shelf line', async () => {
    // A basket without `on_order` hashes exactly as it did before DC3, which
    // is what keeps an idempotency key meaning the same basket.
    const { pos, send, deps } = load({ items: [], total: '0.00' });

    await pos.previewPosSale(
      { branch: 2, items: [{ product: 3, quantity: 1, onOrder: false, supplyReason: '' }] },
      deps,
    );

    expect((send.mock.calls[0]![1] as { body: { items: unknown[] } }).body.items).toEqual([
      { product: 3, quantity: 1 },
    ]);
  });

  it('carries the same marks on the sale as on the preview', async () => {
    const { pos, send, deps } = load({ order_id: 9, status: 'paid' });

    await pos.createPosSale(
      {
        branch: 2,
        items: [{ product: 3, quantity: 1, onOrder: true, supplyReason: 'Pedido' }],
        paymentMethod: 'cash',
        idempotencyKey: 'till-0000001',
        termsConfirmed: true,
      },
      deps,
    );

    expect((send.mock.calls[0]![1] as { body: { items: unknown[] } }).body.items).toEqual([
      { product: 3, quantity: 1, on_order: true, supply_reason: 'Pedido' },
    ]);
  });

  it('keeps the reason within what the server accepts', () => {
    expect(SUPPLY_REASON_MAX_LENGTH).toBe(200);
  });
});

describe('when a line is ready to be charged', () => {
  const serialised = product({ id: 9, isSerialized: true, available: 2 });

  it('an ordered line names no device, even for a serialised article', () => {
    // DC3: no device exists yet; it is identified when the article is
    // received. The server refuses an ordered line that names one.
    expect(
      lineIsComplete({
        product: serialised,
        quantity: 1,
        units: [],
        onOrder: true,
        supplyReason: '',
      }),
    ).toBe(true);
    expect(
      lineIsComplete({
        product: serialised,
        quantity: 1,
        units: [{ unitId: 31, method: 'scanner' }],
        onOrder: true,
        supplyReason: '',
      }),
    ).toBe(false);
  });

  it('a serialised line off the shelf still needs its devices', () => {
    expect(
      lineIsComplete({
        product: serialised,
        quantity: 1,
        units: [],
        onOrder: false,
        supplyReason: '',
      }),
    ).toBe(false);
  });
});

describe('the words for an offer', () => {
  it('writes the plazo, in the singular for one day', () => {
    expect(describePosOnOrder({ leadTimeDays: 5, price: '1.00', overStock: false })).toBe(
      'Bajo pedido · 5 días',
    );
    expect(describePosOnOrder({ leadTimeDays: 1, price: '1.00', overStock: false })).toBe(
      'Bajo pedido · 1 día',
    );
  });
});
