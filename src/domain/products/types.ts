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
  /**
   * DC2 — whether this article is new or used, in the server's own word.
   *
   * A used device is not a cheaper new one: its price belongs to the device
   * rather than to the article, which is why the storefront does not even list
   * the used variants of a model yet.
   */
  conditionLine: ProductConditionLine;
  /**
   * DC2 — the slug of the MODEL this is a variant of, or null.
   *
   * Carried because the server sends it, and shown as nothing: no `/api/v1/`
   * route lists a model's variants, so there is no screen to go to. See
   * BR-014.
   */
  productModel: string | null;
  /**
   * DC2 — the web sells this article device by device.
   *
   * This app cannot: choosing a device needs the unit surface the storefront
   * uses, and `V1StorefrontProductViewSet` does not even serve used variants
   * for that reason. Shown as a sentence rather than as a disabled button.
   */
  sellsByUnit: boolean;
  /**
   * DC3 — «Bajo pedido — entrega en N días», or null.
   *
   * What the shop may say publicly about selling it on order: the lead time
   * and the price at which it would. NEVER the cost, the supplier, or how many
   * it confirmed — the server does not send those and no screen may infer
   * them.
   */
  onOrder: ProductOnOrder | null;
};

export type ProductConditionLine = 'new' | 'used' | '';

export type ProductOnOrder = {
  leadTimeDays: number;
  /** A decimal STRING, like every other price. The ON-ORDER price, not the shelf one. */
  price: string;
  /**
   * The company lets the web offer it on order EVEN WITH STOCK on the shelf.
   * Absent otherwise, which is the shape the payload had before DC3.
   */
  overStock: boolean;
};

export function describeConditionLine(line: ProductConditionLine): string | null {
  if (line === 'used') return 'Usado';
  if (line === 'new') return 'Nuevo';
  return null;
}

/** «Bajo pedido — entrega en 5 días», as the web's availability line reads. */
export function describeOnOrder(onOrder: ProductOnOrder): string {
  const days = onOrder.leadTimeDays;
  return `Bajo pedido — entrega en ${days} ${days === 1 ? 'día' : 'días'}`;
}

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
