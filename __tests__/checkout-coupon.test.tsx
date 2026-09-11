import { act, fireEvent, renderHook, screen, waitFor } from '@testing-library/react-native';

import {
  CheckoutConflictError,
  CheckoutRejectedError,
  type CheckoutDetails,
} from '@/api/endpoints/customer-checkout-v1';
import { ApiError } from '@/api/errors';
import CheckoutScreen from '@/app/checkout';
import type { AuthRepository } from '@/auth/auth-repository';
import type { AuthSession } from '@/auth/types';
import { CUSTOMER_PAYMENT_UNAVAILABLE } from '@/config/customer-payment';
import type { CartLine } from '@/domain/cart/types';
import { checkoutIntentShape } from '@/features/checkout/checkout-intent';
import { useCheckout } from '@/features/checkout/use-checkout';
import { formatCurrency } from '@/utils/format';
import { COUPON_CODE_MAX_LENGTH } from '@/validation/checkout-schemas';

import { renderWithProviders } from './support/render';

/**
 * Customer checkout — the coupon.
 *
 * The contract, re-read on `origin/master` 2dca0a3 before any of this was
 * written: `POST /api/v1/customer/<slug>/checkout/` takes an optional
 * `coupon_code` (at most 50 characters); `checkout_services.price_checkout`
 * applies it inside the company; and `payload_fingerprint` counts it — with the
 * basket, the delivery method, the receipt type and the document — as part of
 * what ONE purchase is.
 *
 * So these tests guard three things. The code reaches the server as typed
 * intent. Nothing on the phone turns it into money. And the idempotency key
 * changes exactly when the server would see a different purchase.
 */

// ── mocks ──────────────────────────────────────────────────────────────────

const mockPostCheckout = jest.fn();
jest.mock('@/api/endpoints/customer-checkout-v1', () => ({
  ...jest.requireActual('@/api/endpoints/customer-checkout-v1'),
  postCheckout: (...args: unknown[]) => mockPostCheckout(...args),
}));

jest.mock('@/auth/auth-runtime', () => ({
  getAuthRuntime: () => ({ coordinator: {} }),
}));

/**
 * THE FUTURE PATH, OPENED FOR THIS FILE ONLY.
 *
 * Paying from the app is blocked in production (`config/customer-payment.ts`,
 * BR-010 / H-PAY-01), so the coupon's submit path cannot be reached there. These
 * tests exercise that path by mocking the gate open. Jest scopes the mock to this
 * file's module registry, so no other suite sees it, and the production constant
 * is untouched: a structural test below reads it from disk and asserts it is
 * still `blocked`, a describe below closes the gate and proves the coupon waits
 * behind it, and `checkout-payment-blocked.test.tsx` proves the real app sends
 * nothing.
 *
 * A plain property on the mocked module, switched by `setPaymentGate`. The app
 * reads `customerPaymentAvailability` from that module object on every call, so
 * writing the property is seen at once, with no getter involved.
 */
jest.mock('@/config/customer-payment', () => ({
  ...jest.requireActual('@/config/customer-payment'),
  customerPaymentAvailability: 'available',
}));

function setPaymentGate(value: 'blocked' | 'available') {
  jest.requireMock<{ customerPaymentAvailability: string }>(
    '@/config/customer-payment',
  ).customerPaymentAvailability = value;
}

let mockScope: { tenant: string; user: string | null } = { tenant: 'blackdog', user: '7' };
jest.mock('@/providers/use-query-scope', () => ({
  ...jest.requireActual('@/providers/use-query-scope'),
  useQueryScope: () => mockScope,
}));

const LINE: CartLine = {
  productSlug: 'iphone-15',
  quantity: 1,
  name: 'iPhone 15',
  imageUrl: 'https://cdn.test/i.png',
  lastSeenPrice: '4000.00',
};

function cartValue(lines: CartLine[] = [LINE]) {
  return {
    cart: { tenantSlug: 'blackdog', lines },
    totals: { itemCount: lines.length, lineCount: lines.length, estimatedSubtotal: '4000.00' },
    isReady: true,
    tenantSlug: 'blackdog',
    add: jest.fn(),
    setQuantity: jest.fn(),
    remove: jest.fn(),
    clearPurchased: jest.fn(),
    clear: jest.fn(),
  };
}

let mockCart = cartValue();
jest.mock('@/cart/cart-provider', () => ({
  ...jest.requireActual('@/cart/cart-provider'),
  useCart: () => mockCart,
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
  Stack: { Screen: () => null },
}));

jest.mock('@/hooks/use-orders', () => ({
  ...jest.requireActual('@/hooks/use-orders'),
  useOrder: () => ({ data: undefined, refetch: jest.fn() }),
}));

// ── fixtures ───────────────────────────────────────────────────────────────

const DETAILS: CheckoutDetails = {
  customerName: 'Ana Torres',
  customerPhone: '987654321',
  documentType: 'dni',
  documentNumber: '12345678',
  deliveryMethod: 'pickup_store',
  receiptType: 'boleta',
  acceptedTerms: true,
  acceptedWarrantyPolicy: true,
};

type SentInput = { details: CheckoutDetails; idempotencyKey: string };

function sent(index: number): SentInput {
  return mockPostCheckout.mock.calls[index]![0] as SentInput;
}

beforeEach(() => {
  mockPostCheckout.mockReset();
  mockPostCheckout.mockResolvedValue({ orderId: 1 });
  mockPush.mockClear();
  mockCart = cartValue();
  mockScope = { tenant: 'blackdog', user: '7' };
  setPaymentGate('available');
});

// ── the intention ──────────────────────────────────────────────────────────

describe('checkoutIntentShape', () => {
  it('does not depend on the order the basket was built in', () => {
    const other: CartLine = { ...LINE, productSlug: 'funda', quantity: 2 };
    const scope = { tenant: 'blackdog', user: '7' };

    expect(
      checkoutIntentShape(scope, { tenantSlug: 'blackdog', lines: [LINE, other] }, DETAILS),
    ).toBe(checkoutIntentShape(scope, { tenantSlug: 'blackdog', lines: [other, LINE] }, DETAILS));
  });

  it('cannot be confused by a coupon that contains a separator', () => {
    const scope = { tenant: 'blackdog', user: '7' };
    const cart = { tenantSlug: 'blackdog', lines: [LINE] };

    expect(checkoutIntentShape(scope, cart, { ...DETAILS, couponCode: 'A|pickup_store' })).not.toBe(
      checkoutIntentShape(scope, cart, { ...DETAILS, couponCode: 'A' }),
    );
  });
});

async function checkoutHook() {
  const hook = await renderHook(() => useCheckout());
  return {
    ...hook,
    submit: async (details: CheckoutDetails) => {
      await act(async () => {
        await hook.result.current.submit(details);
      });
    },
  };
}

describe('one intention, one key', () => {
  it('a retry of the same intention keeps its key', async () => {
    mockPostCheckout.mockRejectedValueOnce(new ApiError('offline', 'sin conexión', { status: null }));
    const hook = await checkoutHook();

    await hook.submit({ ...DETAILS, couponCode: 'ABC' });
    await hook.submit({ ...DETAILS, couponCode: 'ABC' });

    expect(sent(1).idempotencyKey).toBe(sent(0).idempotencyKey);
  });

  it('the same code with spaces around it is the same intention', async () => {
    const hook = await checkoutHook();

    await hook.submit({ ...DETAILS, couponCode: 'ABC' });
    await hook.submit({ ...DETAILS, couponCode: '  ABC ' });

    expect(sent(1).idempotencyKey).toBe(sent(0).idempotencyKey);
  });

  it.each([
    ['sin cupón → ABC', undefined, 'ABC'],
    ['ABC → XYZ', 'ABC', 'XYZ'],
    ['ABC → sin cupón', 'ABC', undefined],
    ['ABC → cadena vacía', 'ABC', ''],
    ['vacío → ABC', '', 'ABC'],
  ])('%s is a new intention', async (_label, before, after) => {
    const hook = await checkoutHook();

    await hook.submit({ ...DETAILS, couponCode: before });
    await hook.submit({ ...DETAILS, couponCode: after });

    expect(sent(1).idempotencyKey).not.toBe(sent(0).idempotencyKey);
  });

  it('does not fold case: that rule belongs to the server', async () => {
    // A case-only edit is a new attempt here. It can open a second pending
    // order, never a 409 — and copying the server's upper-casing would be a
    // second implementation of a rule this app does not own.
    const hook = await checkoutHook();

    await hook.submit({ ...DETAILS, couponCode: 'abc' });
    await hook.submit({ ...DETAILS, couponCode: 'ABC' });

    expect(sent(1).idempotencyKey).not.toBe(sent(0).idempotencyKey);
  });

  it('a basket change still rotates the key', async () => {
    const hook = await checkoutHook();
    await hook.submit({ ...DETAILS, couponCode: 'ABC' });

    mockCart = cartValue([{ ...LINE, quantity: 2 }]);
    await hook.rerender({});
    await hook.submit({ ...DETAILS, couponCode: 'ABC' });

    expect(sent(1).idempotencyKey).not.toBe(sent(0).idempotencyKey);
  });

  it.each<[string, Partial<CheckoutDetails>]>([
    ['el documento', { documentNumber: '87654321' }],
    ['el método de entrega', { deliveryMethod: 'delivery_arequipa' }],
    ['el comprobante', { receiptType: 'factura', documentType: 'ruc', documentNumber: '20123456789' }],
  ])('changing %s — also in the server fingerprint — rotates the key', async (_label, change) => {
    const hook = await checkoutHook();

    await hook.submit(DETAILS);
    await hook.submit({ ...DETAILS, ...change });

    expect(sent(1).idempotencyKey).not.toBe(sent(0).idempotencyKey);
  });

  it('fields the server does not fingerprint keep the key', async () => {
    // The server calls these the same purchase retried; so does the app.
    const hook = await checkoutHook();

    await hook.submit({ ...DETAILS, couponCode: 'ABC' });
    await hook.submit({
      ...DETAILS,
      couponCode: 'ABC',
      customerName: 'Ana María Torres',
      customerPhone: '912345678',
      notes: 'Llamar antes',
      contactEmail: 'ana@example.com',
    });

    expect(sent(1).idempotencyKey).toBe(sent(0).idempotencyKey);
  });

  it('re-rendering never mints a key', async () => {
    const hook = await checkoutHook();
    await hook.submit({ ...DETAILS, couponCode: 'ABC' });

    // A new cart OBJECT with the same content, as a provider re-render produces.
    mockCart = cartValue();
    await hook.rerender({});
    await hook.rerender({});
    await hook.rerender({});
    await hook.submit({ ...DETAILS, couponCode: 'ABC' });

    expect(sent(1).idempotencyKey).toBe(sent(0).idempotencyKey);
  });

  it('a 409 retires the key: the next attempt is new even with identical data', async () => {
    mockPostCheckout.mockRejectedValueOnce(new CheckoutConflictError(55));
    const hook = await checkoutHook();

    await hook.submit({ ...DETAILS, couponCode: 'ABC' });
    expect(hook.result.current.state.status).toBe('conflict');
    await hook.submit({ ...DETAILS, couponCode: 'ABC' });

    expect(sent(1).idempotencyKey).not.toBe(sent(0).idempotencyKey);
  });

  it('another user never inherits the intention', async () => {
    const hook = await checkoutHook();
    await hook.submit({ ...DETAILS, couponCode: 'ABC' });

    mockScope = { tenant: 'blackdog', user: '8' };
    await hook.rerender({});
    await hook.submit({ ...DETAILS, couponCode: 'ABC' });

    expect(sent(1).idempotencyKey).not.toBe(sent(0).idempotencyKey);
  });

  it('another tenant never inherits the intention', async () => {
    const hook = await checkoutHook();
    await hook.submit({ ...DETAILS, couponCode: 'ABC' });

    mockScope = { tenant: 'otra-tienda', user: '7' };
    await hook.rerender({});
    await hook.submit({ ...DETAILS, couponCode: 'ABC' });

    expect(sent(1).idempotencyKey).not.toBe(sent(0).idempotencyKey);
  });
});

describe('the hook does not retry, and does not decide', () => {
  it('a failed attempt is sent exactly once', async () => {
    mockPostCheckout.mockRejectedValueOnce(new ApiError('offline', 'sin conexión', { status: null }));
    const hook = await checkoutHook();

    await hook.submit({ ...DETAILS, couponCode: 'ABC' });

    expect(mockPostCheckout).toHaveBeenCalledTimes(1);
    expect(hook.result.current.state.status).toBe('error');
  });

  it('a 401 is a failed attempt here; the auth pipeline owns what happens next', async () => {
    mockPostCheckout.mockRejectedValueOnce(new ApiError('unauthorized', 'no', { status: 401 }));
    const hook = await checkoutHook();

    await hook.submit(DETAILS);

    expect(mockPostCheckout).toHaveBeenCalledTimes(1);
    expect(hook.result.current.state.status).toBe('error');
  });

  it('carries the server’s refusal verbatim', async () => {
    mockPostCheckout.mockRejectedValueOnce(new CheckoutRejectedError('El cupón ha expirado.'));
    const hook = await checkoutHook();

    await hook.submit({ ...DETAILS, couponCode: 'VIEJO' });

    expect(hook.result.current.state).toEqual({
      status: 'rejected',
      message: 'El cupón ha expirado.',
      reasons: [],
    });
  });

  it('hands the endpoint the code as intent and no money', async () => {
    const hook = await checkoutHook();

    await hook.submit({ ...DETAILS, couponCode: 'ABC' });

    const { details } = sent(0);
    expect(details.couponCode).toBe('ABC');
    for (const money of ['discount', 'discountAmount', 'total', 'subtotal']) {
      expect(details).not.toHaveProperty(money);
    }
  });
});

// ── the screen ─────────────────────────────────────────────────────────────

function signedIn(): AuthRepository {
  const session: AuthSession = {
    user: {
      id: 7,
      username: 'ana',
      email: 'ana@example.com',
      firstName: 'Ana',
      lastName: 'Torres',
      role: 'customer',
      isEmailVerified: true,
    },
    mode: 'mock',
    accessContexts: [],
    platform: { isMaster: false },
    expiresAt: null,
    tenant: null,
  };
  return {
    restoreSession: async () => session,
    signIn: async () => session,
    register: async () => session,
    signOut: async () => undefined,
  };
}

const COUPON_LABEL = 'Código de cupón (opcional)';

async function openCheckout() {
  await renderWithProviders(<CheckoutScreen />, { authRepository: signedIn() });
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Continuar al pago' })).toBeOnTheScreen();
  });
}

async function fillBuyer() {
  await fireEvent.changeText(screen.getByLabelText('Nombre completo'), 'Ana Torres');
  await fireEvent.changeText(screen.getByLabelText('Teléfono'), '987654321');
  await fireEvent.changeText(screen.getByLabelText('DNI'), '12345678');
}

async function pay(expectedCalls: number) {
  await fireEvent.press(screen.getByRole('button', { name: 'Continuar al pago' }));
  await waitFor(() => {
    expect(mockPostCheckout).toHaveBeenCalledTimes(expectedCalls);
  });
}

describe('the checkout screen', () => {
  it('offers a labelled coupon field, and a purchase without one sends none', async () => {
    await openCheckout();
    expect(screen.getByLabelText(COUPON_LABEL)).toBeOnTheScreen();

    await fillBuyer();
    await pay(1);

    expect(sent(0).details.couponCode).toBeUndefined();
  });

  it('sends the code as typed, without the spaces around it', async () => {
    await openCheckout();
    await fillBuyer();
    await fireEvent.changeText(screen.getByLabelText(COUPON_LABEL), '  BIENVENIDO10 ');

    await pay(1);

    expect(sent(0).details.couponCode).toBe('BIENVENIDO10');
  });

  it('does not upper-case what the customer typed', async () => {
    await openCheckout();
    await fillBuyer();
    await fireEvent.changeText(screen.getByLabelText(COUPON_LABEL), 'bienvenido10');

    await pay(1);

    expect(sent(0).details.couponCode).toBe('bienvenido10');
  });

  it('limits the field to the contract’s 50 characters', async () => {
    await openCheckout();

    expect(COUPON_CODE_MAX_LENGTH).toBe(50);
    expect(screen.getByLabelText(COUPON_LABEL).props.maxLength).toBe(COUPON_CODE_MAX_LENGTH);
  });

  it.each(['Cupón no válido o inactivo.', 'El cupón ha expirado.'])(
    'shows the refusal %p in the server’s own words',
    async (detail) => {
      mockPostCheckout.mockRejectedValueOnce(new CheckoutRejectedError(detail));
      await openCheckout();
      await fillBuyer();
      await fireEvent.changeText(screen.getByLabelText(COUPON_LABEL), 'ABC');

      await pay(1);

      expect(await screen.findByText(detail)).toBeOnTheScreen();
      // No reinterpretation: the app says exactly what the server said.
      expect(screen.queryAllByText(/otra tienda|otra empresa|no existe/i)).toHaveLength(0);
    },
  );

  it('a corrected coupon is a new attempt, not a retry of the refused one', async () => {
    mockPostCheckout.mockRejectedValueOnce(new CheckoutRejectedError('Cupón no válido o inactivo.'));
    await openCheckout();
    await fillBuyer();
    await fireEvent.changeText(screen.getByLabelText(COUPON_LABEL), 'ABC');
    await pay(1);
    await screen.findByText('Cupón no válido o inactivo.');

    await fireEvent.changeText(screen.getByLabelText(COUPON_LABEL), 'XYZ');
    await pay(2);

    expect(sent(1).details.couponCode).toBe('XYZ');
    expect(sent(1).idempotencyKey).not.toBe(sent(0).idempotencyKey);
  });

  it('pressing pay again with nothing changed retries the SAME attempt', async () => {
    mockPostCheckout.mockRejectedValueOnce(new ApiError('offline', 'sin conexión', { status: null }));
    await openCheckout();
    await fillBuyer();
    await fireEvent.changeText(screen.getByLabelText(COUPON_LABEL), 'ABC');

    await pay(1);
    await screen.findByText('No pudimos iniciar el pago. Revisa tu conexión e inténtalo de nuevo.');
    await pay(2);

    expect(sent(1).idempotencyKey).toBe(sent(0).idempotencyKey);
  });

  it('never shows a discount, a saving or a coupon-adjusted total', async () => {
    await openCheckout();
    const estimate = formatCurrency('4000.00');
    expect(screen.getAllByText(estimate)).toHaveLength(1);

    await fireEvent.changeText(screen.getByLabelText(COUPON_LABEL), 'BIENVENIDO10');

    expect(screen.queryAllByText(/descuento|ahorr|aplicado|nuevo total|\d\s?%/i)).toHaveLength(0);
    expect(screen.getAllByText(estimate)).toHaveLength(1);
  });
});

// ── the same code, with the production gate closed ─────────────────────────

describe('with the production gate closed, the coupon waits behind it', () => {
  beforeEach(() => {
    setPaymentGate('blocked');
  });

  it('the hook sends nothing, coupon or not', async () => {
    const hook = await checkoutHook();

    await hook.submit({ ...DETAILS, couponCode: 'ABC' });

    expect(mockPostCheckout).not.toHaveBeenCalled();
    expect(hook.result.current.state).toEqual({
      status: 'unavailable',
      message: CUSTOMER_PAYMENT_UNAVAILABLE.title,
    });
  });

  it('the screen shows no coupon field and no way to pay', async () => {
    await renderWithProviders(<CheckoutScreen />, { authRepository: signedIn() });
    await waitFor(() => {
      expect(screen.getByText(CUSTOMER_PAYMENT_UNAVAILABLE.title)).toBeOnTheScreen();
    });

    expect(screen.queryByLabelText(COUPON_LABEL)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Continuar al pago' })).toBeNull();
    expect(mockPostCheckout).not.toHaveBeenCalled();
  });
});

// ── what the code must never contain ───────────────────────────────────────

type FS = { readFileSync(p: string, e: 'utf8'): string };
const fs = jest.requireActual('fs') as FS;

/** A source file, relative to the repo root, with its comments removed. */
function source(relative: string): string {
  return fs
    .readFileSync(relative, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const CHECKOUT_FILES = [
  'src/app/checkout.tsx',
  'src/features/checkout/use-checkout.ts',
  'src/features/checkout/checkout-intent.ts',
  'src/validation/checkout-schemas.ts',
];

describe('server-owned money stays on the server', () => {
  it.each(CHECKOUT_FILES)('%s has no discount, validity or expiry rule', (file) => {
    const code = source(file);

    expect(code).not.toMatch(/discount|percent|expir|isActive|is_active/i);
    expect(code).not.toMatch(/toUpperCase|toLowerCase/);
  });

  it.each(CHECKOUT_FILES)('%s does no arithmetic with a coupon', (file) => {
    for (const line of source(file).split('\n')) {
      if (/coupon/i.test(line)) expect(line).not.toMatch(/\s[*/+-]\s/);
    }
  });

  it.each(CHECKOUT_FILES)('%s carries no catalogue of coupon codes', (file) => {
    expect(source(file)).not.toMatch(/['"`][A-Z][A-Z0-9]{3,}['"`]/);
  });

  it.each(CHECKOUT_FILES)('%s keeps the coupon out of storage that outlives the screen', (file) => {
    expect(source(file)).not.toMatch(/AsyncStorage|SecureStore|preferences-storage|cart-storage/);
  });
});

describe('the wire and the authority', () => {
  it('checkout reaches only the customer v1 surface', () => {
    const endpoint = source('src/api/endpoints/customer-checkout-v1.ts');

    expect(endpoint).toContain('/api/v1/customer/');
    expect(endpoint).not.toContain('/api/admin/');
    // An import such as '@/api/endpoints/…' is a module, not a URL. A string that
    // STARTS with /api/ is a route somebody wrote by hand outside the endpoint.
    for (const file of CHECKOUT_FILES) {
      expect(source(file)).not.toMatch(/['"`]\/api\//);
    }
  });

  it('the hook sends once, never retries and signs nobody out', () => {
    const hook = source('src/features/checkout/use-checkout.ts');

    expect(hook.match(/postCheckout\(/g)).toHaveLength(1);
    expect(hook).not.toMatch(/\bretry\b|\bfor\s*\(|\bwhile\s*\(/);
    expect(hook).not.toMatch(/signOut|clearSession|logout/i);
  });

  it('the intention is built from the session scope, not from a role', () => {
    const hook = source('src/features/checkout/use-checkout.ts');

    expect(hook).toContain('useQueryScope()');
    expect(hook).toContain('checkoutIntentShape(scope, cart, details)');
    for (const file of CHECKOUT_FILES) {
      expect(source(file)).not.toMatch(/role\s*[!=]==|isAdmin/);
    }
  });

  it('the gate this file opens is still closed in production', () => {
    // Read from disk: the module itself is mocked at the top of this file.
    expect(source('src/config/customer-payment.ts')).toMatch(
      /export const customerPaymentAvailability = 'blocked' as CustomerPaymentAvailability;/,
    );
  });
});
