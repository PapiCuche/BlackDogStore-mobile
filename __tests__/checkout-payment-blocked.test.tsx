import { act, fireEvent, renderHook, screen, waitFor } from '@testing-library/react-native';

import type { CheckoutDetails } from '@/api/endpoints/customer-checkout-v1';
import CartScreen from '@/app/cart';
import CheckoutScreen from '@/app/checkout';
import type { AuthRepository } from '@/auth/auth-repository';
import type { AuthSession } from '@/auth/types';
import {
  CUSTOMER_PAYMENT_UNAVAILABLE,
  customerPaymentAvailability,
} from '@/config/customer-payment';
import { featureIntegration } from '@/config/integration-status';
import type { CartLine } from '@/domain/cart/types';
import { useCheckout } from '@/features/checkout/use-checkout';

import { renderWithProviders } from './support/render';

/**
 * P0 — the customer checkout fails closed while paying from the app is blocked.
 *
 * WHY THIS EXISTS. On `origin/master` 2dca0a3 the checkout answers with an
 * Izipay session this app cannot open, so every submitted checkout left a
 * pending order nobody could pay. The fix is not a payment integration. It is
 * making that request impossible from the app until one is proven
 * (BR-010 / H-PAY-01).
 *
 * THE ACCEPTANCE CRITERION IS AT THE NETWORK: zero checkout requests, whatever
 * the customer presses and whatever calls the hook directly.
 */

// ── mocks ──────────────────────────────────────────────────────────────────

const mockPostCheckout = jest.fn();
jest.mock('@/api/endpoints/customer-checkout-v1', () => ({
  ...jest.requireActual('@/api/endpoints/customer-checkout-v1'),
  postCheckout: (...args: unknown[]) => mockPostCheckout(...args),
}));

// One layer further down: even a request that bypassed `postCheckout` would
// have to come through here.
const mockAuthenticatedRequest = jest.fn();
jest.mock('@/api/authenticated-request', () => ({
  ...jest.requireActual('@/api/authenticated-request'),
  authenticatedRequest: (...args: unknown[]) => mockAuthenticatedRequest(...args),
}));

const mockMakeIdempotencyKey = jest.fn();
jest.mock('@/domain/idempotency', () => ({
  ...jest.requireActual('@/domain/idempotency'),
  makeIdempotencyKey: (...args: unknown[]) => mockMakeIdempotencyKey(...args),
}));

jest.mock('@/auth/auth-runtime', () => ({
  getAuthRuntime: () => ({ coordinator: {} }),
}));

// `useCheckout` reads the session scope for its idempotency intention. The hook
// suites below render it without an AuthProvider, so the scope is fixed here.
// The gate itself reads no scope, and a test below changes it to prove that.
let mockScope: { tenant: string; user: string | null } = { tenant: 'blackdog', user: '7' };
jest.mock('@/providers/use-query-scope', () => ({
  ...jest.requireActual('@/providers/use-query-scope'),
  useQueryScope: () => mockScope,
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
  Stack: { Screen: () => null },
}));

const mockOpenExternalLink = jest.fn();
jest.mock('@/utils/external-links', () => ({
  ...jest.requireActual('@/utils/external-links'),
  openExternalLink: (...args: unknown[]) => mockOpenExternalLink(...args),
}));

const mockUseOrder = jest.fn();
jest.mock('@/hooks/use-orders', () => ({
  ...jest.requireActual('@/hooks/use-orders'),
  useOrder: (...args: unknown[]) => mockUseOrder(...args),
}));

const LINE: CartLine = {
  productSlug: 'iphone-15',
  quantity: 1,
  name: 'iPhone 15',
  imageUrl: '',
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

// ── fixtures ───────────────────────────────────────────────────────────────

const TITLE = CUSTOMER_PAYMENT_UNAVAILABLE.title;

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

function signedInAs(id: number, username: string): AuthRepository {
  const session: AuthSession = {
    user: {
      id,
      username,
      email: `${username}@example.com`,
      firstName: username,
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

function checkoutRequests(): unknown[][] {
  return mockAuthenticatedRequest.mock.calls.filter(([path]) => String(path).includes('/checkout/'));
}

async function openCheckout(repository?: AuthRepository) {
  await renderWithProviders(<CheckoutScreen />, repository ? { authRepository: repository } : {});
  await waitFor(() => {
    expect(screen.getByText(TITLE)).toBeOnTheScreen();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuthenticatedRequest.mockResolvedValue({});
  mockMakeIdempotencyKey.mockImplementation((shape: string) =>
    jest.requireActual('@/domain/idempotency').makeIdempotencyKey(shape),
  );
  mockUseOrder.mockReturnValue({ data: undefined, refetch: jest.fn() });
  mockOpenExternalLink.mockResolvedValue(true);
  mockCart = cartValue();
  mockScope = { tenant: 'blackdog', user: '7' };
});

// ── UX ─────────────────────────────────────────────────────────────────────

describe('the checkout screen, while paying from the app is blocked', () => {
  it('says so before asking for any detail', async () => {
    await openCheckout(signedInAs(7, 'ana'));

    expect(screen.getByText(CUSTOMER_PAYMENT_UNAVAILABLE.checkout)).toBeOnTheScreen();
    for (const field of ['Nombre completo', 'Teléfono', 'DNI']) {
      expect(screen.queryByLabelText(field)).toBeNull();
    }
  });

  it('offers no way to continue to payment', async () => {
    await openCheckout(signedInAs(7, 'ana'));

    expect(screen.queryByRole('button', { name: 'Continuar al pago' })).toBeNull();
    expect(screen.queryAllByText(/continuar al pago/i)).toHaveLength(0);
  });

  it('takes the customer back to the cart or on to the shop', async () => {
    await openCheckout(signedInAs(7, 'ana'));

    await fireEvent.press(screen.getByRole('button', { name: 'Volver al carrito' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Explorar tienda' }));

    expect(mockPush).toHaveBeenCalledWith('/cart');
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/shop');
  });

  it('shows no success and no order in progress', async () => {
    await openCheckout(signedInAs(7, 'ana'));

    expect(screen.queryAllByText(/pago confirmado|pedido #\d+|en proceso/i)).toHaveLength(0);
  });

  it('does not send a signed-out customer to a login first', async () => {
    await openCheckout();

    expect(screen.queryAllByText(/inicia sesión/i)).toHaveLength(0);
  });

  it.each([
    ['ana', 7],
    ['beto', 8],
  ])('stays blocked for %s: a different session unlocks nothing', async (username, id) => {
    await openCheckout(signedInAs(id, username));

    expect(screen.queryByRole('button', { name: 'Continuar al pago' })).toBeNull();
    expect(mockPostCheckout).not.toHaveBeenCalled();
  });
});

// ── network and state, from the screen ─────────────────────────────────────

describe('zero checkout requests from the screen', () => {
  it('sends nothing, whatever the customer presses', async () => {
    await openCheckout(signedInAs(7, 'ana'));

    for (const name of ['Volver al carrito', 'Explorar tienda']) {
      await fireEvent.press(screen.getByRole('button', { name }));
    }

    expect(mockPostCheckout).not.toHaveBeenCalled();
    expect(checkoutRequests()).toHaveLength(0);
    expect(mockOpenExternalLink).not.toHaveBeenCalled();
  });

  it('keeps every line of the cart', async () => {
    await openCheckout(signedInAs(7, 'ana'));
    await fireEvent.press(screen.getByRole('button', { name: 'Volver al carrito' }));

    for (const change of ['clearPurchased', 'remove', 'setQuantity', 'clear'] as const) {
      expect(mockCart[change]).not.toHaveBeenCalled();
    }
  });

  it('never asks for an order it did not create', async () => {
    await openCheckout(signedInAs(7, 'ana'));

    for (const [id] of mockUseOrder.mock.calls) expect(id).toBeUndefined();
  });
});

// ── the second defence, below the screen ───────────────────────────────────

describe('useCheckout refuses below the screen', () => {
  it('a direct submit sends no checkout request and says why', async () => {
    const hook = await renderHook(() => useCheckout());
    let returned: unknown = 'not called';

    await act(async () => {
      returned = await hook.result.current.submit(DETAILS);
    });

    expect(returned).toBeNull();
    expect(mockPostCheckout).not.toHaveBeenCalled();
    expect(checkoutRequests()).toHaveLength(0);
    expect(hook.result.current.state).toEqual({ status: 'unavailable', message: TITLE });
  });

  it('mints no idempotency key for a purchase it will not attempt', async () => {
    const hook = await renderHook(() => useCheckout());

    await act(async () => {
      await hook.result.current.submit(DETAILS);
    });

    expect(mockMakeIdempotencyKey).not.toHaveBeenCalled();
  });

  it('pressing again, and again, still sends nothing and never looks in progress', async () => {
    const hook = await renderHook(() => useCheckout());
    const seen: string[] = [];

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await act(async () => {
        await hook.result.current.submit(DETAILS);
      });
      seen.push(hook.result.current.state.status);
    }

    expect(mockPostCheckout).not.toHaveBeenCalled();
    expect(seen).toEqual(['unavailable', 'unavailable', 'unavailable']);
  });

  it('leaves the cart untouched', async () => {
    const hook = await renderHook(() => useCheckout());

    await act(async () => {
      await hook.result.current.submit(DETAILS);
    });

    for (const change of ['clearPurchased', 'remove', 'setQuantity', 'clear'] as const) {
      expect(mockCart[change]).not.toHaveBeenCalled();
    }
  });

  it.each([
    ['otro usuario', { tenant: 'blackdog', user: '8' }],
    ['otra empresa', { tenant: 'otra-tienda', user: '7' }],
    ['sin sesión', { tenant: 'blackdog', user: null }],
  ])('%s: still nothing is sent', async (_label, scope) => {
    mockScope = scope;
    const hook = await renderHook(() => useCheckout());

    await act(async () => {
      await hook.result.current.submit(DETAILS);
    });

    expect(mockPostCheckout).not.toHaveBeenCalled();
    expect(hook.result.current.state.status).toBe('unavailable');
  });
});

// ── regression: the rest of the customer surface ───────────────────────────

describe('the rest of the customer surface is untouched', () => {
  it('the cart still lists its lines and lets them change', async () => {
    await renderWithProviders(<CartScreen />);

    expect(await screen.findByText('iPhone 15')).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText('Agregar uno de iPhone 15'));

    expect(mockCart.setQuantity).toHaveBeenCalledWith('iphone-15', 2);
  });

  it('the cart explains the pause instead of offering "Ir a pagar"', async () => {
    await renderWithProviders(<CartScreen />);

    expect(await screen.findByText(TITLE)).toBeOnTheScreen();
    expect(screen.getByText(CUSTOMER_PAYMENT_UNAVAILABLE.cart)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Ir a pagar' })).toBeNull();
    expect(mockPush).not.toHaveBeenCalledWith('/checkout');
    expect(checkoutRequests()).toHaveLength(0);
  });

  it('catalogue, orders, repairs, sign-in and brand stay integrated', () => {
    for (const key of ['catalog', 'orders', 'repairs', 'auth', 'companyBrand'] as const) {
      expect(['INTEGRATED', 'TESTED']).toContain(featureIntegration[key].status);
    }
  });

  it('names exactly what is blocked, and nothing else', () => {
    const blocked = Object.entries(featureIntegration)
      .filter(([, row]) => row.status === 'BLOCKED')
      .map(([key]) => key)
      .sort();

    expect(blocked).toEqual(['checkout', 'customerPayment']);
  });
});

// ── structural ─────────────────────────────────────────────────────────────

type FS = {
  readFileSync(p: string, e: 'utf8'): string;
  readdirSync(p: string, o: { recursive: true }): string[];
};
const fs = jest.requireActual('fs') as FS;

/** A source file, relative to the repo root, with its comments removed. */
function source(relative: string): string {
  return fs
    .readFileSync(relative, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function srcFiles(): string[] {
  return fs
    .readdirSync('src', { recursive: true })
    .filter((file) => /\.(ts|tsx)$/.test(file))
    .map((file) => `src/${file}`);
}

const GATE = 'src/config/customer-payment.ts';
const ENDPOINT = 'src/api/endpoints/customer-checkout-v1.ts';
const HOOK = 'src/features/checkout/use-checkout.ts';
const CHECKOUT_FILES = ['src/app/checkout.tsx', 'src/app/cart.tsx', HOOK, ENDPOINT, GATE];

describe('the gate is explicit, and nothing about the build or the session moves it', () => {
  it('is blocked', () => {
    expect(customerPaymentAvailability).toBe('blocked');
  });

  it('reads no environment, platform, session, tenant or mock policy', () => {
    const gate = source(GATE);

    expect(gate).not.toMatch(/^\s*import\s/m);
    expect(gate).not.toMatch(
      /__DEV__|Platform|process\.env|EXPO_PUBLIC|useMockData|appEnvironment|isReleaseBuild/,
    );
  });

  it('keeps the checkout path off any mock data source', () => {
    for (const file of [HOOK, ENDPOINT]) {
      expect(source(file)).not.toMatch(/repositories\/mock|\bMock[A-Z]\w*|useMockData/);
    }
  });
});

describe('what this change must never bring back', () => {
  it('only useCheckout calls the checkout endpoint, and only behind the gate', () => {
    const callers = srcFiles().filter(
      (file) => file !== ENDPOINT && /\bpostCheckout\(/.test(source(file)),
    );
    expect(callers).toEqual([HOOK]);

    const hook = source(HOOK);
    expect(hook).toMatch(/if \(customerPaymentAvailability !== 'available'\)/);
    expect(hook).toMatch(/submit: guardedSubmit/);
  });

  it('carries no Stripe code and no hosted-page URL anywhere in the app', () => {
    for (const file of srcFiles()) {
      expect(source(file)).not.toMatch(/stripe|checkout_url|checkoutUrl/i);
    }
  });

  it('reads no payment session and holds no gateway secret', () => {
    expect(source(ENDPOINT)).not.toMatch(/\.payment\b|authorization|public_key|merchant_code|\.config\b/);
    for (const file of CHECKOUT_FILES) {
      expect(source(file)).not.toMatch(/IZIPAY_|hash_?key|api_?key/i);
    }
  });

  it('opens no payment URL', () => {
    for (const file of CHECKOUT_FILES) {
      expect(source(file)).not.toMatch(/openExternalLink|Linking\.openURL|openBrowserAsync|WebBrowser/);
    }
  });

  it('adds no WebView and no payment SDK', () => {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    for (const name of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) {
      expect(name).not.toMatch(/webview|stripe|izipay/i);
    }
    for (const file of srcFiles()) {
      expect(source(file)).not.toMatch(/react-native-webview|<WebView/);
    }
  });

  it('reaches no admin surface and invents no route', () => {
    for (const file of CHECKOUT_FILES) {
      expect(source(file)).not.toMatch(/\/api\/admin\//);
    }
    const routes = source(ENDPOINT).match(/['"`]\/api\/[^'"`]*/g) ?? [];
    expect(routes).toHaveLength(1);
    expect(routes[0]).toMatch(/^`\/api\/v1\/customer\//);
  });

  it('does not retry', () => {
    const hook = source(HOOK);

    expect(hook).not.toMatch(/\bretry\b|\bfor\s*\(|\bwhile\s*\(/);
    expect(hook.match(/postCheckout\(/g)).toHaveLength(1);
  });

  it('touches neither sign-in nor the internal audience', () => {
    expect(source(GATE)).not.toMatch(/auth|session|signIn|signOut/i);

    const internal = srcFiles().filter((file) => /\/internal\/|use-internal-/.test(file));
    expect(internal.length).toBeGreaterThan(0);
    for (const file of internal) {
      expect(source(file)).not.toMatch(/customer-payment/);
    }
  });
});
