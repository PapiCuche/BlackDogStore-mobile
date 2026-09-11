/**
 * Whether a customer can pay from this app.
 *
 * BLOCKED BY H-PAY-01 + UNSUPPORTED MOBILE IZIPAY INTEGRATION.
 * REMOVE ONLY AFTER PAYMENT PARITY IS PROVEN.
 *
 * WHAT HAPPENED. The backend moved its gateway to Izipay (`08b8d7f`,
 * 2026-09-02). `POST /api/v1/customer/<slug>/checkout/` now creates a pending
 * order and answers with an Izipay session built for the WEB SDK. The app has
 * no supported way to open it: Izipay's React Native integration is a native
 * sample rather than a package, and the backend mints the token with web
 * vocabulary the native SDKs do not use (BR-010 / H-PAY-01 in
 * docs/BACKEND_REQUIREMENTS.md). Posting the checkout anyway left an order
 * nobody could pay.
 *
 * SO THE APP DOES NOT POST IT. While this says `blocked`, the cart explains the
 * pause, the checkout screen shows no form, and `useCheckout` refuses before an
 * idempotency key exists or a request leaves the phone. The cart keeps every
 * line.
 *
 * A SOURCE-LEVEL CONSTANT, like `isBackendAuthAvailable` in `env.ts`: never an
 * environment variable, `__DEV__` or a platform check, and it imports nothing,
 * so no build, session or tenant can move it. It may only become `available`
 * in the commit that ships a payment adapter proven against the Izipay sandbox.
 *
 * NOT PAYMENT AUTHORITY. It decides what the app attempts, never whether money
 * arrived; that stays the server's signed notification.
 */
export type CustomerPaymentAvailability = 'blocked' | 'available';

export const customerPaymentAvailability = 'blocked' as CustomerPaymentAvailability;

/**
 * What the customer reads. No gateway, SDK or ticket names: those explain the
 * pause to us, not to them.
 */
export const CUSTOMER_PAYMENT_UNAVAILABLE = {
  title: 'El pago desde la app no está disponible por ahora',
  cart: 'Puedes seguir armando tu carrito: se mantiene intacto.',
  checkout: 'Tu carrito se mantiene intacto y no se ha creado ningún pedido.',
} as const;
