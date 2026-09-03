import {
  createPosSale,
  fetchPosContext,
  lookupPosProduct,
  previewPosSale,
  searchPosProducts,
} from '@/api/endpoints/internal-pos-v1';
import type { RefreshCoordinator } from '@/auth/refresh-coordinator';
import type { PosSaleInput } from '@/domain/internal/pos-types';

/**
 * The counter till, over `/api/v1/internal/<slug>/sales/pos/`.
 *
 * Separate from the inventory repository for the reason the types are separate:
 * `Ventas` holds the till and no stock permission, `Inventario` holds stock and
 * no till. One class spanning both would imply an authority nobody has.
 *
 * There is NO `setPrice`, NO `applyDiscount` and NO `calculateTotal` here,
 * because there is no such endpoint. Pricing is the server's, and a method name
 * that suggested otherwise would be an invitation.
 */
export class V1InternalPosRepository {
  constructor(private readonly deps: { refreshCoordinator: RefreshCoordinator }) {}

  async getContext(signal?: AbortSignal) {
    return fetchPosContext(this.deps, signal);
  }

  async searchProducts(params: { q: string; branch: number }, signal?: AbortSignal) {
    return searchPosProducts(params, this.deps, signal);
  }

  async lookupProduct(params: { code: string; branch: number }, signal?: AbortSignal) {
    return lookupPosProduct(params, this.deps, signal);
  }

  async preview(
    input: Parameters<typeof previewPosSale>[0],
    signal?: AbortSignal,
  ) {
    return previewPosSale(input, this.deps, signal);
  }

  /**
   * Deliberately NOT called `checkout`. That word belongs to the storefront and
   * to a customer paying for their own basket; this is an operator ringing up a
   * sale at a counter, and the two must never be mistaken for each other in a
   * codebase that contains both.
   */
  async createSale(input: PosSaleInput, signal?: AbortSignal) {
    return createPosSale(input, this.deps, signal);
  }
}
