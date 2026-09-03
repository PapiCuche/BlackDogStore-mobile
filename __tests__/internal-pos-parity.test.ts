import {
  conditionsSignature,
  type PosConditions,
} from '@/features/internal/pos-conditions';
import type { PosProduct } from '@/domain/internal/pos-types';

/**
 * IP2A — the till, completed.
 *
 * Everything here asserts that Mobile INTEGRATES what the backend already had:
 * the same preview, the same discount rules, the same attribution, the same
 * server-owned money. Verified against `PapiCuche/BlackDogStore-web` @
 * `origin/master` `22a57d5` with a 64-assertion live smoke.
 */

const BASE = 'https://api.example.test';
const DEPS = { refreshCoordinator: {} as never };

type Loaded = typeof import('@/api/endpoints/internal-pos-v1');

function load(
  options: {
    result?: unknown;
    errorStatus?: number;
    errorCode?: string;
    errorBody?: unknown;
    errorDetail?: string;
  } = {},
) {
  // The thrown error is built INSIDE `isolateModules`, from the same module
  // registry the endpoint imports. Built outside, it is a different `ApiError`
  // class and every `instanceof` in `translate()` silently misses — the test
  // would pass an `ApiError` straight through and prove nothing.
  let makeError: (() => Error) | null = null;
  const send = jest.fn(
    async (_p: string, o: Record<string, unknown>, _d: unknown) => {
      if (makeError) {
        // The client hands the parsed body to a caller that asked for it, then
        // throws. Reproduced exactly so the test exercises the real contract.
        (o.onErrorBody as ((b: unknown) => void) | undefined)?.(options.errorBody);
        throw makeError();
      }
      return options.result ?? {};
    },
  );

  let module!: Loaded;
  jest.isolateModules(() => {
    jest.doMock('@/api/authenticated-request', () => ({
      authenticatedRequest: (p: string, o: Record<string, unknown>, d: unknown) =>
        send(p, o, d),
    }));
    jest.doMock('@/config/env', () => ({
      ...jest.requireActual('@/config/env'),
      companySlug: 'blackdog',
      apiBaseUrl: BASE,
      isApiConfigured: true,
    }));
    if (options.errorStatus) {
      const { ApiError } = require('@/api/errors');
      const status = options.errorStatus;
      makeError = () => new ApiError(
        status === 409 ? 'unknown' : 'validation',
        options.errorDetail ?? 'refused',
        { status, code: options.errorCode ?? '' },
      );
    }
    module = require('@/api/endpoints/internal-pos-v1');
  });
  return { module, send };
}

afterEach(() => {
  jest.resetModules();
  jest.dontMock('@/api/authenticated-request');
  jest.dontMock('@/config/env');
});

const WIRE_PREVIEW = {
  subtotal: '50.00',
  discount: '0.00',
  discount_source: 'none',
  coupon_code: '',
  promotions: [
    {
      id: 1, name: 'Funda + Mica', applications: 1,
      regular_amount: '50.00', discount_amount: '25.00',
    },
  ],
  total: '25.00',
  seller: { id: 3, name: 'Vendedor' },
  customer: null,
  commission: { rate_percent: '7.50', base_amount: '25.00', amount: '1.88' },
  lines: [{ product: 5, name: 'Funda', quantity: 1, price: '30.00' }],
};

const product = (id: number): PosProduct => ({
  id, name: `P${id}`, price: '10.00', available: 5, barcode: '',
});

const CONDITIONS: PosConditions = {
  branch: 2,
  lines: [{ product: product(4), quantity: 2 }],
  couponCode: '',
  manualDiscountType: '',
  manualDiscountValue: '',
  discountReason: '',
  seller: null,
};

describe('the preview is the only source of a total', () => {
  it('sends every pricing condition the server accepts', async () => {
    const { module, send } = load({ result: WIRE_PREVIEW });
    await module.previewPosSale(
      {
        branch: 2,
        items: [{ product: 5, quantity: 1 }],
        couponCode: 'BIENVENIDO10',
        seller: 3,
        manualDiscountType: 'percent',
        manualDiscountValue: '10',
        discountReason: 'Cliente frecuente',
      },
      DEPS,
    );
    const body = (send.mock.calls[0]![1] as { body: Record<string, unknown> }).body;
    expect(body).toMatchObject({
      branch: 2,
      items: [{ product: 5, quantity: 1 }],
      coupon_code: 'BIENVENIDO10',
      seller: 3,
      manual_discount_type: 'percent',
      manual_discount_value: '10',
      discount_reason: 'Cliente frecuente',
    });
  });

  it('asserts no price of its own when asking', async () => {
    const { module, send } = load({ result: WIRE_PREVIEW });
    await module.previewPosSale(
      { branch: 2, items: [{ product: 5, quantity: 1 }] }, DEPS,
    );
    const body = (send.mock.calls[0]![1] as { body: Record<string, unknown> }).body;
    for (const forbidden of ['total', 'subtotal', 'price', 'discount', 'commission']) {
      expect(body).not.toHaveProperty(forbidden);
    }
  });

  it('reads the server figures through unchanged', async () => {
    const { module } = load({ result: WIRE_PREVIEW });
    const preview = await module.previewPosSale(
      { branch: 2, items: [{ product: 5, quantity: 1 }] }, DEPS,
    );
    expect(preview.subtotal).toBe('50.00');
    expect(preview.total).toBe('25.00');
    // Strings, from the wire to the pixel. A total that went through a Number
    // could come back 24.999999999999996.
    expect(typeof preview.total).toBe('string');
  });

  it('carries the promotions the server applied on its own', async () => {
    const { module } = load({ result: WIRE_PREVIEW });
    const preview = await module.previewPosSale(
      { branch: 2, items: [{ product: 5, quantity: 1 }] }, DEPS,
    );
    expect(preview.promotions).toHaveLength(1);
    expect(preview.promotions[0]).toMatchObject({
      id: 1, name: 'Funda + Mica', applications: 1, discountAmount: '25.00',
    });
  });

  it('shows a commission only when the payload carried one', async () => {
    const withIt = load({ result: WIRE_PREVIEW });
    expect(
      (await withIt.module.previewPosSale({ branch: 2, items: [] }, DEPS)).commission,
    ).toMatchObject({ ratePercent: '7.50', amount: '1.88' });

    jest.resetModules();
    const without = load({ result: { ...WIRE_PREVIEW, commission: null } });
    expect(
      (await without.module.previewPosSale({ branch: 2, items: [] }, DEPS)).commission,
    ).toBeNull();
  });
});

describe('the priced total and the payable total are the same thing', () => {
  it('changes signature when anything that moves the price moves', () => {
    const base = conditionsSignature(CONDITIONS);
    const variants: PosConditions[] = [
      { ...CONDITIONS, branch: 4 },
      { ...CONDITIONS, lines: [{ product: product(4), quantity: 3 }] },
      { ...CONDITIONS, lines: [] },
      { ...CONDITIONS, couponCode: 'BIENVENIDO10' },
      { ...CONDITIONS, manualDiscountType: 'percent' },
      { ...CONDITIONS, manualDiscountValue: '10' },
      { ...CONDITIONS, discountReason: 'porque sí' },
      { ...CONDITIONS, seller: 9 },
    ];
    for (const variant of variants) {
      expect(conditionsSignature(variant)).not.toBe(base);
    }
  });

  it('does not change when only the order of the basket changes', () => {
    // Adding A then B and adding B then A are the same basket. Re-pricing on a
    // reorder would make a correct total flicker for no reason.
    const a = conditionsSignature({
      ...CONDITIONS,
      lines: [
        { product: product(4), quantity: 1 },
        { product: product(9), quantity: 2 },
      ],
    });
    const b = conditionsSignature({
      ...CONDITIONS,
      lines: [
        { product: product(9), quantity: 2 },
        { product: product(4), quantity: 1 },
      ],
    });
    expect(a).toBe(b);
  });
});

describe('a refusal carries what the operator needs to act on it', () => {
  it('names the order that already spent the key', async () => {
    const { module } = load({
      errorStatus: 409,
      errorCode: 'idempotency_conflict',
      errorDetail: 'Esa clave ya se usó con otra canasta.',
      errorBody: {
        detail: 'Esa clave ya se usó con otra canasta.',
        code: 'idempotency_conflict',
        existing_order: 41,
      },
    });
    await expect(
      module.createPosSale(
        {
          branch: 2, items: [{ product: 4, quantity: 1 }], paymentMethod: 'cash',
          idempotencyKey: 'k'.repeat(12), termsConfirmed: true,
        },
        DEPS,
      ),
    ).rejects.toMatchObject({
      name: 'PosIdempotencyConflictError',
      existingOrder: 41,
    });
  });

  it('says which shops still hold the article', async () => {
    const { module } = load({
      errorStatus: 409,
      errorCode: 'insufficient_stock',
      errorDetail: 'Stock insuficiente.',
      errorBody: {
        detail: 'Stock insuficiente.',
        code: 'insufficient_stock',
        available_elsewhere: [
          { branch: 4, branch_name: 'Norte', product: 4, product_name: 'Cable', available: 7 },
        ],
      },
    });
    await expect(
      module.createPosSale(
        {
          branch: 2, items: [{ product: 4, quantity: 99 }], paymentMethod: 'cash',
          idempotencyKey: 'k'.repeat(12), termsConfirmed: true,
        },
        DEPS,
      ),
    ).rejects.toMatchObject({
      name: 'PosInsufficientStockError',
      availableElsewhere: [
        { branch: 4, branchName: 'Norte', productName: 'Cable', available: 7 },
      ],
    });
  });

  it('survives a server that stops sending the detail', async () => {
    // A field that disappears becomes an empty list, not an `undefined` that
    // surfaces three components deep.
    const { module } = load({
      errorStatus: 409, errorCode: 'insufficient_stock',
      errorDetail: 'Stock insuficiente.', errorBody: { detail: 'x', code: 'insufficient_stock' },
    });
    await expect(
      module.createPosSale(
        {
          branch: 2, items: [{ product: 4, quantity: 99 }], paymentMethod: 'cash',
          idempotencyKey: 'k'.repeat(12), termsConfirmed: true,
        },
        DEPS,
      ),
    ).rejects.toMatchObject({ availableElsewhere: [] });
  });

  it('asks for the error body on the sale and nowhere else', async () => {
    // The narrow door stays narrow. A module that reads every response body is
    // one refactor away from a screen that depends on an undocumented field.
    const { module, send } = load({ result: WIRE_PREVIEW });
    await module.previewPosSale({ branch: 2, items: [] }, DEPS);
    expect((send.mock.calls[0]![1] as { onErrorBody?: unknown }).onErrorBody)
      .toBeUndefined();

    jest.resetModules();
    const sale = load({ result: { order_id: 1, created: true, total: '10.00', items: [] } });
    await sale.module.createPosSale(
      {
        branch: 2, items: [{ product: 4, quantity: 1 }], paymentMethod: 'cash',
        idempotencyKey: 'k'.repeat(12), termsConfirmed: true,
      },
      DEPS,
    );
    expect(typeof (sale.send.mock.calls[0]![1] as { onErrorBody?: unknown }).onErrorBody)
      .toBe('function');
  });
});

describe('structural — the completed till cannot drift', () => {
  type FS = { readFileSync(p: string, e: 'utf8'): string };
  const fs = jest.requireActual('fs') as FS;

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
  const SCREEN = 'src/app/internal/pos/index.tsx';

  it('computes no money at all', () => {
    // Not a subtotal, not a running total, not a change amount. Every figure on
    // the screen arrived in a response.
    const source = code(SCREEN);
    // The operand matters. An earlier draft matched `title="Total" />` — the
    // quote, then the JSX self-close read as a division — and a guard that
    // fires on markup is a guard somebody deletes. So: a money identifier,
    // optional property access, an operator, and something that could be a
    // NUMBER on the other side of it.
    for (const forbidden of [
      /\btotal[\w.?![\]]*\s*[-+*/]\s*[\w(]/i,
      /\bsubtotal[\w.?![\]]*\s*[-+*/]\s*[\w(]/i,
      /\bprice[\w.?![\]]*\s*[-+*/]\s*[\w(]/i,
      /\bdiscount[\w.?![\]]*\s*[-+*/]\s*[\w(]/i,
      /\bcommission[\w.?![\]]*\s*[-+*/]\s*[\w(]/i,
      /\bamountReceived[\w.?![\]]*\s*[-+*/]\s*[\w(]/i,
      /parseFloat/,
      /toFixed/,
      /\.reduce\(/,
      /Number\(\s*(priced|preview|result)\b/,
    ]) {
      expect(source).not.toMatch(forbidden);
    }
  });

  it('never charges without pricing first', () => {
    // `canSell` requires a preview taken under the CURRENT conditions. Losing
    // that would let the till charge a total nobody was shown.
    const source = code(SCREEN);
    expect(source).toMatch(/const canSell = canPrice && priced !== null/);
    expect(source).toMatch(/disabled=\{!canSell \|\| busy\}/);
    expect(source).toMatch(/pricedUnder === signature/);
  });

  it('blanks the total whenever a pricing condition moves', () => {
    const source = code(SCREEN);
    // EVERY occurrence, not the first. `clearAfterSale` legitimately touches
    // the same setters and invalidates with `setPricedUnder(null)` directly;
    // an earlier draft looked only at `indexOf` and read that one reset as the
    // whole answer, which would have let a real handler forget to reprice.
    for (const setter of [
      'setCoupon', 'setDiscountType', 'setDiscountValue', 'setDiscountReason',
      'setSeller', 'setBranchId',
    ]) {
      const occurrences: number[] = [];
      for (let at = source.indexOf(setter + '('); at !== -1;
           at = source.indexOf(setter + '(', at + 1)) {
        occurrences.push(at);
      }
      expect(occurrences.length).toBeGreaterThan(0);
      for (const at of occurrences) {
        expect(source.slice(at, at + 420)).toMatch(
          /repriceNeeded\(\)|setPricedUnder\(null\)/,
        );
      }
    }
  });

  it('sends the server no figure it produced itself', () => {
    const source = code(SCREEN);
    // The sale body is built from the basket and the conditions. A total, a
    // commission or a promotion result in it would turn something this app is
    // displaying into something it is asserting.
    const at = source.indexOf('sale.mutate(');
    const body = source.slice(at, source.indexOf('idempotencyKey', at) + 400);
    for (const forbidden of [
      /\btotal\s*:/, /\bsubtotal\s*:/, /\bprice\s*:/, /\bcommission\s*:/,
      /\bpromotions?\s*:/, /\bdiscountAmount\s*:/,
    ]) {
      expect(body).not.toMatch(forbidden);
    }
  });

  it('draws a capability control only when the server allowed it', () => {
    const source = code(SCREEN);
    expect(source).toMatch(/ctx\.canApplyDiscount \?/);
    expect(source).toMatch(/ctx\.canAssignSeller && ctx\.sellers\.length > 0 \?/);
  });

  it('invents no capability for the coupon', () => {
    // The server asks for none, by design: the company configured the promotion
    // in advance, so honouring it is not the cashier's decision. A guard here
    // because inventing one would look like caution and would be a bug.
    const source = code(SCREEN);
    const at = source.indexOf('Código promocional');
    const around = source.slice(Math.max(0, at - 700), at + 200);
    expect(around).not.toMatch(/canApplyDiscount/);
    expect(around).not.toMatch(/hasUxCapability/);
  });

  it('uses no role name as authority', () => {
    const source = code(SCREEN);
    for (const forbidden of [
      /\brole\s*===/, /\brole\s*==/, /isAdmin/, /isCashier/, /isSales/,
      /isManager/, /is_platform_master/,
    ]) {
      expect(source).not.toMatch(forbidden);
    }
  });

  it('queues nothing and retries nothing', () => {
    const sources = [SCREEN, 'src/hooks/use-internal-pos.ts'].map(code).join('\n');
    for (const forbidden of [/offlineQueue/i, /AsyncStorage/, /persistQueue/i]) {
      expect(sources).not.toMatch(forbidden);
    }
    const hooks = code('src/hooks/use-internal-pos.ts');
    expect(hooks).not.toMatch(/retry:\s*(?!false)\w/);
  });

  it('keeps the counter basket out of the customer cart', () => {
    const source = code(SCREEN);
    expect(source).not.toMatch(/use-cart|cart-store|useCart/);
  });

  it('never reaches the legacy admin surface', () => {
    const sources = [SCREEN, 'src/api/endpoints/internal-pos-v1.ts'].map(code).join('\n');
    expect(sources).not.toMatch(/\/api\/admin\//);
  });
});
