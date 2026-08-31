import { useCallback, useRef, useState } from 'react';

import {
  CheckoutConflictError,
  CheckoutRejectedError,
  postCheckout,
  type CheckoutDetails,
} from '@/api/endpoints/customer-checkout-v1';
import { getAuthRuntime } from '@/auth/auth-runtime';
import { useCart } from '@/cart/cart-provider';
import type { Cart } from '@/domain/cart/types';

/**
 * Driving one purchase attempt.
 *
 * THE IDEMPOTENCY KEY IS THE INTERESTING PART. It is generated ONCE per basket
 * attempt and reused for every retry of that attempt, which is what lets the
 * server recognise a repeat and answer with the original order instead of
 * creating a second one.
 *
 * It is regenerated when the basket CHANGES, because a different basket is a
 * different purchase — and reusing the key there would earn a 409 rather than
 * silently buying the wrong thing.
 */

export type CheckoutState =
  | { status: 'idle' }
  | { status: 'submitting' }
  /** The hosted payment page is open. The order exists and is unpaid. */
  | { status: 'awaiting-payment'; orderId: number }
  | { status: 'rejected'; message: string; reasons: readonly string[] }
  | { status: 'conflict'; message: string }
  | { status: 'error'; message: string };

function basketShape(cart: Cart): string {
  return cart.lines.map((line) => `${line.productSlug}x${line.quantity}`).sort().join('|');
}

/** A key that is stable for one basket and different for the next. */
function makeIdempotencyKey(shape: string): string {
  // Enough entropy that two devices never collide, plus the basket shape so a
  // changed basket cannot reuse a key by accident.
  const nonce = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `${nonce}-${hash(shape)}`.slice(0, 100);
}

/** Small non-cryptographic hash. This identifies a retry; it protects nothing. */
function hash(value: string): string {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export function useCheckout() {
  const { cart } = useCart();
  const [state, setState] = useState<CheckoutState>({ status: 'idle' });

  // Held in a ref, not state: changing it must not re-render, and a retry has to
  // see exactly the value the first attempt used.
  const attempt = useRef<{ key: string; shape: string } | null>(null);

  const submit = useCallback(
    async (details: CheckoutDetails) => {
      const shape = basketShape(cart);
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
          // The key was reused for a different basket. A fresh attempt is the
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
    [cart],
  );

  const reset = useCallback(() => {
    attempt.current = null;
    setState({ status: 'idle' });
  }, []);

  return { state, submit, reset };
}
