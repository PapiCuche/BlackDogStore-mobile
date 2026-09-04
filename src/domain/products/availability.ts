import type { StatusTone } from '@/domain/orders/status';

import { productAvailability, type Product, type ProductAvailability } from './types';

export type AvailabilityMeta = { label: string; tone: StatusTone };

/**
 * How a product's stock state is SHOWN. Label and tone, decided once.
 *
 * WHY THIS IS IN THE DOMAIN AND NOT IN A SCREEN. `StatusBadge` states the house
 * rule in its own docstring: the tone comes from the domain layer, never from
 * the screen, «that is what guarantees "En reparación" is the same colour
 * everywhere it appears». Payment, fulfillment and repair states all follow it
 * through their `describe*` functions. Availability was the one that did not.
 *
 * It drifted exactly the way that rule predicts. `ProductCard` painted
 * `low_stock` amber; the product detail screen painted the same state green —
 * the same green as `in_stock`. A shopper saw an amber "Últimas unidades" in the
 * list, tapped it, and read a green "Últimas 2 unidades" on the next screen. Two
 * answers to one question, on two screens showing one product.
 *
 * NOTHING HERE DECIDES STOCK. `productAvailability` derives the three states
 * from the server's `inventory` integer and remains the only place that does.
 * This adds the words and the colour, and nothing else.
 */
export function describeAvailability(
  product: Product,
  options: { exact?: boolean } = {},
): AvailabilityMeta {
  const state = productAvailability(product);
  if (state === 'low_stock' && options.exact) {
    // The detail screen has room for the count and the list does not. The
    // NUMBER is the server's; only the sentence around it is ours.
    //
    // Singular is not a flourish: the old string read «Últimas 1 unidades» on
    // the last one in stock, which is the exact moment a shopper is reading
    // most carefully.
    const label =
      product.inventory === 1 ? 'Última unidad' : `Últimas ${product.inventory} unidades`;
    return { label, tone: availabilityMeta.low_stock.tone };
  }
  return availabilityMeta[state];
}

/**
 * `out_of_stock` is `neutral`, not a muted text colour.
 *
 * It used to render in `textTertiary`, which measures 3.04:1 on `surface` in the
 * light theme and 4.20:1 in the dark one — under the 4.5:1 this project already
 * ships as `AA_NORMAL`, at 12pt, where the large-text allowance does not apply.
 * "Agotado" was the least legible of the three states and the one that changes
 * whether somebody can buy. `statusNeutral` clears it in both themes.
 */
const availabilityMeta: Record<ProductAvailability, AvailabilityMeta> = {
  in_stock: { label: 'Disponible', tone: 'success' },
  low_stock: { label: 'Últimas unidades', tone: 'warning' },
  out_of_stock: { label: 'Agotado', tone: 'neutral' },
};
