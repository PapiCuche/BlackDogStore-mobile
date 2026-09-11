import type { CheckoutDetails } from '@/api/endpoints/customer-checkout-v1';
import type { Cart } from '@/domain/cart/types';
import type { QueryScope } from '@/providers/query-scope';

/**
 * What ONE purchase attempt is, as far as its idempotency key is concerned.
 *
 * THE KEY MUST CHANGE EXACTLY WHEN THE SERVER WOULD CALL IT A DIFFERENT PURCHASE.
 * `payload_fingerprint` in `v1_checkout_views.py` hashes the basket, the coupon,
 * the delivery method, the receipt type and the document. Reusing a key after
 * any of those changed earns a 409 once an order exists for it; minting a new
 * key while none of them changed turns a retry into a second order.
 *
 * Until coupons arrived the shape was the basket alone. That was only safe
 * because nothing else on the screen varied between attempts; a coupon field is
 * precisely something a person edits and submits again.
 *
 * NOT IN IT, ON PURPOSE: name, phone, address, notes and contact email. The
 * server treats a request that differs only there as the same purchase retried,
 * and so does this.
 *
 * TENANT AND USER ARE IN IT. The server already keys orders by (company, user);
 * folding the scope in here means a screen that stays mounted across a sign-out
 * cannot hand the next person the previous person's intention.
 *
 * THE COUPON IS TRIMMED, NOT NORMALISED. Surrounding spaces are the keyboard's,
 * and the serializer strips them too. Case belongs to the server, which
 * upper-cases before it looks the code up; copying that here would be a second
 * implementation of a rule this app does not own. The price of not copying it is
 * deliberate and small: a case-only edit counts as a new attempt. That can open a
 * second pending order but never a 409, and a pending order consumes neither the
 * basket nor stock until the gateway confirms payment.
 */
export function checkoutIntentShape(
  scope: QueryScope,
  cart: Cart,
  details: CheckoutDetails,
): string {
  const basket = cart.lines
    .map((line) => `${line.productSlug}x${line.quantity}`)
    .sort()
    .join('|');

  // An array, serialised: no separator a coupon could contain can make two
  // different intentions read as one.
  return JSON.stringify([
    scope.tenant,
    scope.user ?? 'anonymous',
    basket,
    (details.couponCode ?? '').trim(),
    details.deliveryMethod,
    details.receiptType,
    details.documentType,
    details.documentNumber.trim(),
  ]);
}
