import type { PosCartLine } from '@/domain/internal/pos-types';

/**
 * Everything that can change what a basket COSTS. IP2A.
 *
 * WHY THIS IS ONE OBJECT AND ONE STRING. The till must never charge a total the
 * operator did not see, and it must never show a total that no longer matches
 * what it is about to charge. Both are the same problem: knowing whether the
 * priced thing and the payable thing are still the same thing.
 *
 * So every input that reaches the server's pricing goes in here, and
 * `conditionsSignature` reduces them to a string. The screen keeps the
 * signature the preview was taken under; when the live signature stops matching
 * it, the figure on screen is stale and the charge button goes away. Adding a
 * field that affects price and forgetting to add it here would let a stale
 * total survive a change that moved it — so the type is the checklist.
 *
 * `paymentMethod` is deliberately ABSENT: it does not change the price on this
 * surface, and including it would blank a correct total when somebody switches
 * from cash to card.
 */
export type PosConditions = {
  branch: number | null;
  lines: readonly PosCartLine[];
  couponCode: string;
  manualDiscountType: '' | 'percent' | 'amount';
  manualDiscountValue: string;
  discountReason: string;
  seller: number | null;
};

/**
 * A stable string for one set of conditions.
 *
 * Lines are sorted by product id so that adding A then B and adding B then A
 * are recognised as the same basket — they are, and re-pricing on a reorder
 * would make the total flicker for no reason.
 */
export function conditionsSignature(conditions: PosConditions): string {
  const lines = conditions.lines
    .map((line) => `${line.product.id}x${line.quantity}`)
    .sort()
    .join(',');
  return [
    conditions.branch ?? '-',
    lines,
    conditions.couponCode.trim(),
    conditions.manualDiscountType,
    conditions.manualDiscountValue.trim(),
    conditions.discountReason.trim(),
    conditions.seller ?? '-',
  ].join('|');
}
