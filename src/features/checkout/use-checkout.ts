import { useCallback, useRef, useState } from 'react';

import {
  CheckoutConflictError,
  CheckoutRejectedError,
  postCheckout,
  type CheckoutDetails,
} from '@/api/endpoints/customer-checkout-v1';
import { getAuthRuntime } from '@/auth/auth-runtime';
import { useCart } from '@/cart/cart-provider';
import {
  CUSTOMER_PAYMENT_UNAVAILABLE,
  customerPaymentAvailability,
} from '@/config/customer-payment';
import { makeIdempotencyKey } from '@/domain/idempotency';
import { useQueryScope } from '@/providers/use-query-scope';

import { checkoutIntentShape } from './checkout-intent';

/**
 * Driving one purchase attempt.
 *
 * THE IDEMPOTENCY KEY IS THE INTERESTING PART. It is generated ONCE per
 * intention and reused for every retry of that intention, which is what lets
 * the server recognise a repeat and answer with the original order instead of
 * creating a second one.
 *
 * It is regenerated when the INTENTION changes — the basket, the coupon, or
 * anything else the server fingerprints (see `checkout-intent.ts`) — because a
 * different ask is a different purchase, and reusing the key there would earn a
 * 409 rather than silently buying the wrong thing.
 */

export type CheckoutState =
  | { status: 'idle' }
  | { status: 'submitting' }
  /** The order exists and is unpaid. */
  | { status: 'awaiting-payment'; orderId: number }
  /** Paying from the app is blocked, so nothing was sent. See `config/customer-payment.ts`. */
  | { status: 'unavailable'; message: string }
  | { status: 'rejected'; message: string; reasons: readonly string[] }
  | { status: 'conflict'; message: string }
  | { status: 'error'; message: string };

// The key generator moved to `@/domain/idempotency` in M10, when a second
// caller needed it. Same function, same behaviour, one copy.

export function useCheckout() {
  const { cart } = useCart();
  const scope = useQueryScope();
  const [state, setState] = useState<CheckoutState>({ status: 'idle' });

  // Held in a ref, not state: changing it must not re-render, and a retry has to
  // see exactly the value the first attempt used.
  const attempt = useRef<{ key: string; shape: string } | null>(null);

  const submit = useCallback(
    async (details: CheckoutDetails) => {
      const shape = checkoutIntentShape(scope, cart, details);
      if (attempt.current === null || attempt.current.shape !== shape) {
        attempt.current = { key: makeIdempotencyKey(shape), shape };
      }

      setState({ status: 'submitting' });
      try {
        const result = await postCheckout(
          { cart, details, idempotencyKey: attempt.current.key },
          { refreshCoordinator: getAuthRuntime().coordinator },
        );
        setState({ status: 'awaiting-payment', orderId: result.orderId });
        return result;
      } catch (error) {
        if (error instanceof CheckoutRejectedError) {
          setState({ status: 'rejected', message: error.message, reasons: error.reasons });
        } else if (error instanceof CheckoutConflictError) {
          // The key was reused for a different purchase. A fresh attempt is the
          // fix, so the next submit generates a new key.
          attempt.current = null;
          setState({ status: 'conflict', message: error.message });
        } else {
          // Deliberately generic: a raw backend message can carry operational
          // detail a customer should not read, and cannot be acted on anyway.
          setState({
            status: 'error',
            message: 'No pudimos iniciar el pago. Revisa tu conexión e inténtalo de nuevo.',
          });
        }
        return null;
      }
    },
    [cart, scope],
  );

  const reset = useCallback(() => {
    attempt.current = null;
    setState({ status: 'idle' });
  }, []);

  /**
   * THE GATE, AND WHY IT WRAPS `submit` INSTEAD OF LIVING IN THE SCREEN.
   *
   * Hiding the button is the first defence. This is the one a stray
   * `onSubmitEditing`, a test harness or a future screen cannot walk past: while
   * paying from the app is blocked it answers before `submit` runs at all. No
   * idempotency key is minted, no "submitting" state appears and no checkout
   * request leaves the phone, so no pending order exists for anyone to fail to
   * pay.
   */
  const guardedSubmit = useCallback(
    async (details: CheckoutDetails) => {
      if (customerPaymentAvailability !== 'available') {
        setState({ status: 'unavailable', message: CUSTOMER_PAYMENT_UNAVAILABLE.title });
        return null;
      }
      return submit(details);
    },
    [submit],
  );

  return { state, submit: guardedSubmit, reset };
}
