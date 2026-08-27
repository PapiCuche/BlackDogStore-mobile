/**
 * Catalogue types.
 *
 * VERIFIED against `store/serializers.py` in the Web repository — field names
 * and nullability mirror `ProductSerializer` and `CategorySerializer` exactly.
 * Do not add a field here that the serializer does not emit.
 */

export type Category = {
  id: number;
  name: string;
  slug: string;
};

export type Product = {
  id: number;
  name: string;
  slug: string;
  description: string;
  /**
   * DRF renders a DecimalField as a STRING ("1299.00"), not a number. Keeping
   * it a string all the way to the formatter is what stops a float rounding
   * error from turning into a wrong price on screen.
   */
  price: string;
  inventory: number;
  /** Null when the product's category was deleted (`on_delete=SET_NULL`). */
  category: Category | null;
  /** `URLField(blank=True, default='')` — empty string, never null. */
  imageUrl: string;
  /** Null when the product has no reviews yet. */
  averageRating: number | null;
  reviewCount: number;
};

export type ProductAvailability = 'in_stock' | 'low_stock' | 'out_of_stock';

/**
 * Stock is a single integer per product in Django (not per branch — see
 * "Inventory branch isolation" in the Web repo's saas-multiempresa.md), so the
 * only honest thing the app can say is these three states.
 */
export function productAvailability(product: Product): ProductAvailability {
  if (product.inventory <= 0) return 'out_of_stock';
  if (product.inventory <= 3) return 'low_stock';
  return 'in_stock';
}
