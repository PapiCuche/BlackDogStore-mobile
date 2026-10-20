/**
 * THE COMPROBANTE — what the counter hands over, and what the till may issue.
 *
 * Contract on `PapiCuche/BlackDogStore-web` @ `origin/master` `50e7afe`
 * (`store/pos_payloads.py` > `context_payload` / `sale_payload`,
 * `store/pos_services.py` > `register_sale`), confirmed live against a scratch
 * copy of that tree:
 *
 *   POST sales/pos/sales/  {…, receipt_type?}
 *     → 201 {order_id, receipt_type, document_number, document_status, tax, items[].units}
 *   sin `receipt_type`  → the sale is recorded and NO document is issued
 *   con 'sales_note'    → «NV-000038», status «issued»
 *
 * The app shipped neither half: it never sent `receipt_type`, so no document
 * was ever issued, and it dropped `document_number`, `document_status` and
 * `tax` from the answer, so the operator had nothing to read back.
 */
import {
  describeDocumentStatus,
  describeReceiptType,
} from '@/domain/internal/pos-types';

const BASE = 'https://api.example.test';
const DEPS = { refreshCoordinator: {} as never };

type Pos = typeof import('@/api/endpoints/internal-pos-v1');

const SALE = {
  order_id: 41,
  created: true,
  receipt_type: 'sales_note',
  document_number: 'NV-000038',
  document_status: 'issued',
  subtotal: '999.00',
  discount: '0.00',
  discount_source: '',
  discount_reason: '',
  total: '999.00',
  paid_at: '2026-10-20T15:45:00Z',
  payment_method: 'cash',
  amount_received: '1000.00',
  change_amount: '1.00',
  payment_reference: '',
  branch: { id: 1, name: 'Tienda principal' },
  seller: 'dev_sales',
  customer: '',
  commission: null,
  tax: {
    currency: 'PEN',
    subtotal: '999.00',
    discount_amount: '0.00',
    taxable_amount: '846.61',
    tax_amount: '152.39',
    tax_rate: '0.18',
    tax_treatment: 'taxed',
    total: '999.00',
    base_label: 'Op. gravada',
    tax_label: 'IGV (18%)',
  },
  items: [
    {
      product: 3,
      name: 'AirPods Pro (2.ª gen)',
      quantity: 1,
      price: '999.00',
      units: [{ serial_number: 'SN-9', imei: '', imei2: '', method: 'scanner' }],
    },
  ],
};

const CONTEXT = {
  company: { id: 1, name: 'Black Dog Store' },
  branches: [{ id: 1, name: 'Tienda principal' }],
  default_branch: 1,
  receipt_options: [
    {
      value: 'sales_note',
      label: 'Nota de venta interna',
      branches: [1],
      enabled: true,
      disabled_code: '',
      disabled_reason: '',
    },
    {
      value: 'boleta',
      label: 'Boleta electrónica',
      branches: [1],
      enabled: false,
      disabled_code: 'fiscal_disabled',
      disabled_reason: 'La emisión fiscal no está habilitada.',
    },
  ],
  payment_methods: [{ value: 'cash', label: 'Efectivo' }],
  seller: { id: 3, username: 'dev_sales', name: 'Ventas' },
  sellers: [],
};

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

describe('what the till may issue', () => {
  it('reads the options, their branches and why one is refused', async () => {
    const { pos, deps } = load(CONTEXT);

    const context = await pos.fetchPosContext(deps);

    expect(context.receiptOptions).toEqual([
      {
        value: 'sales_note',
        label: 'Nota de venta interna',
        branches: [1],
        enabled: true,
        disabledCode: '',
        disabledReason: '',
      },
      {
        value: 'boleta',
        label: 'Boleta electrónica',
        branches: [1],
        enabled: false,
        disabledCode: 'fiscal_disabled',
        disabledReason: 'La emisión fiscal no está habilitada.',
      },
    ]);
  });

  it('reads a missing `enabled` as NOT issuable', async () => {
    // Offering a document the server would refuse sends somebody back to the
    // counter empty-handed.
    const { pos, deps } = load({
      ...CONTEXT,
      receipt_options: [{ value: 'factura', label: 'Factura', branches: [1] }],
    });

    expect((await pos.fetchPosContext(deps)).receiptOptions[0]!.enabled).toBe(false);
  });

  it('survives a server that offers none', async () => {
    const { pos, deps } = load({ ...CONTEXT, receipt_options: undefined });

    expect((await pos.fetchPosContext(deps)).receiptOptions).toEqual([]);
  });
});

describe('issuing one with the sale', () => {
  it('sends the type the operator chose', async () => {
    const { pos, send, deps } = load(SALE);

    await pos.createPosSale(
      {
        branch: 1,
        items: [{ product: 3, quantity: 1 }],
        paymentMethod: 'cash',
        receiptType: 'sales_note',
        idempotencyKey: 'till-00000001',
        termsConfirmed: true,
      },
      deps,
    );

    expect((send.mock.calls[0]![1] as { body: Record<string, unknown> }).body.receipt_type)
      .toBe('sales_note');
  });

  it('sends nothing when none was chosen, which is the server default', async () => {
    // An absent `receipt_type` means «issue no document». Sending a default
    // would be the app deciding what the shop bills.
    const { pos, send, deps } = load(SALE);

    await pos.createPosSale(
      {
        branch: 1,
        items: [{ product: 3, quantity: 1 }],
        paymentMethod: 'cash',
        idempotencyKey: 'till-00000002',
        termsConfirmed: true,
      },
      deps,
    );

    expect((send.mock.calls[0]![1] as { body: Record<string, unknown> }).body)
      .not.toHaveProperty('receipt_type');
  });
});

describe('what the sale answers back', () => {
  it('carries the document, its number and where its issuance stands', async () => {
    const { pos, deps } = load(SALE);

    const sale = await pos.createPosSale(
      {
        branch: 1,
        items: [{ product: 3, quantity: 1 }],
        paymentMethod: 'cash',
        idempotencyKey: 'till-00000003',
        termsConfirmed: true,
      },
      deps,
    );

    expect(sale.receiptType).toBe('sales_note');
    expect(sale.documentNumber).toBe('NV-000038');
    expect(sale.documentStatus).toBe('issued');
  });

  it('carries the frozen tax breakdown with the server labels', async () => {
    // Read off the order rather than recomputed, so a reprint a year from now
    // says the same thing even if the rate changed.
    const { pos, deps } = load(SALE);

    const sale = await pos.createPosSale(
      {
        branch: 1,
        items: [{ product: 3, quantity: 1 }],
        paymentMethod: 'cash',
        idempotencyKey: 'till-00000004',
        termsConfirmed: true,
      },
      deps,
    );

    expect(sale.tax).toMatchObject({
      baseLabel: 'Op. gravada',
      taxLabel: 'IGV (18%)',
      taxableAmount: '846.61',
      taxAmount: '152.39',
      total: '999.00',
    });
  });

  it('reads back the devices each line handed over', async () => {
    const { pos, deps } = load(SALE);

    const sale = await pos.createPosSale(
      {
        branch: 1,
        items: [{ product: 3, quantity: 1 }],
        paymentMethod: 'cash',
        idempotencyKey: 'till-00000005',
        termsConfirmed: true,
      },
      deps,
    );

    expect(sale.items[0]!.units).toEqual([
      { serialNumber: 'SN-9', imei: '', imei2: '', method: 'scanner' },
    ]);
  });

  it('invents no tax for a sale that reported none', async () => {
    // «IGV S/ 0.00» on a sale nobody computed tax for is a figure the shop did
    // not state.
    const { pos, deps } = load({ ...SALE, tax: null });

    const sale = await pos.createPosSale(
      {
        branch: 1,
        items: [{ product: 3, quantity: 1 }],
        paymentMethod: 'cash',
        idempotencyKey: 'till-00000006',
        termsConfirmed: true,
      },
      deps,
    );

    expect(sale.tax).toBeNull();
  });
});

describe('the words the counter uses', () => {
  it('names the documents the server can issue', () => {
    expect(describeReceiptType('sales_note')).toBe('Nota de venta');
    expect(describeReceiptType('boleta')).toBe('Boleta');
    expect(describeReceiptType('factura')).toBe('Factura');
    expect(describeReceiptType('')).toBe('Sin comprobante');
  });

  it('shows an unknown status as it came, rather than translating it', () => {
    // Telling somebody their invoice is fine when nobody said so is worse than
    // showing a word they can quote to the console.
    expect(describeDocumentStatus('accepted')).toBe('Aceptado por SUNAT');
    expect(describeDocumentStatus('observado')).toBe('observado');
    expect(describeDocumentStatus('')).toBe('');
  });
});
