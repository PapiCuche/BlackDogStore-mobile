import {
  fetchInventoryMovements,
  fetchInventoryStock,
  fetchInventorySummary,
  postStockAdjustment,
  type InventoryMovementQuery,
  type InventoryStockQuery,
} from '@/api/endpoints/internal-inventory-v1';
import type { RefreshCoordinator } from '@/auth/refresh-coordinator';
import type {
  InternalInventorySummary,
  InternalMovementPage,
  InternalStockMovement,
  InternalStockPage,
  StockAdjustmentInput,
} from '@/domain/internal/inventory-types';

/**
 * The company's stock, over `/api/v1/internal/<slug>/inventory/`.
 *
 * A SEPARATE repository from `V1InternalSalesRepository`, for the same reason
 * that one is separate from the customer's: they are gated by different
 * capabilities. A member may hold `inventory.view` and nothing else, and one
 * class covering both modules would make that asymmetry invisible to whoever
 * reads it next.
 *
 * Never touches `/api/admin/inventory/`: that surface speaks cookies and CSRF.
 */
export class V1InternalInventoryRepository {
  constructor(private readonly deps: { refreshCoordinator: RefreshCoordinator }) {}

  async getSummary(
    params: { branchId?: number } = {},
    signal?: AbortSignal,
  ): Promise<InternalInventorySummary> {
    return fetchInventorySummary(params, this.deps, signal);
  }

  async listStock(
    query: InventoryStockQuery = {},
    signal?: AbortSignal,
  ): Promise<InternalStockPage> {
    return fetchInventoryStock(query, this.deps, signal);
  }

  async listMovements(
    query: InventoryMovementQuery = {},
    signal?: AbortSignal,
  ): Promise<InternalMovementPage> {
    return fetchInventoryMovements(query, this.deps, signal);
  }

  /**
   * Record a manual movement.
   *
   * Deliberately NOT called `setStock`. The contract moves stock and has no
   * field for a final quantity, and a method name that implied otherwise would
   * invite a caller to look for one.
   */
  async adjustStock(
    input: StockAdjustmentInput,
    signal?: AbortSignal,
  ): Promise<InternalStockMovement> {
    return postStockAdjustment(input, this.deps, signal);
  }
}
