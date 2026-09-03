import {
  fetchInventoryMovements,
  fetchInventoryStock,
  fetchInventorySummary,
  postStockAdjustment,
  cancelTransfer,
  createTransfer,
  dispatchTransfer,
  fetchTransfer,
  fetchTransfers,
  receiveTransfer,
  setTransferItem,
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
  StockTransfer,
  TransferCreateInput,
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

/**
 * Inter-branch transfers, over the same `/inventory/` prefix. IP1B.
 *
 * A SEPARATE class from `V1InternalInventoryRepository` even though the URL
 * prefix is shared, because the two answer different questions: that one reads
 * and adjusts what a shop holds, this one moves units BETWEEN shops and has a
 * lifecycle. Reading takes `inventory.view`; every write takes
 * `inventory.adjust`, and the server also demands access to BOTH ends before it
 * will move anything.
 *
 * ONE METHOD PER TRANSITION, and no `setStatus`. See the endpoint module.
 */
export class V1InternalTransferRepository {
  constructor(private readonly deps: { refreshCoordinator: RefreshCoordinator }) {}

  async list(
    params: { status?: string; branchId?: number } = {},
    signal?: AbortSignal,
  ): Promise<{ count: number; results: StockTransfer[] }> {
    return fetchTransfers(params, this.deps, signal);
  }

  async get(transferId: number, signal?: AbortSignal): Promise<StockTransfer> {
    return fetchTransfer(transferId, this.deps, signal);
  }

  /** Opens a DRAFT. Moves nothing — dispatching does that. */
  async create(input: TransferCreateInput, signal?: AbortSignal): Promise<StockTransfer> {
    return createTransfer(input, this.deps, signal);
  }

  /** Sets the quantity of one product on a draft; zero removes the line. */
  async setItem(
    transferId: number,
    input: { productSlug: string; quantity: number },
    signal?: AbortSignal,
  ): Promise<StockTransfer> {
    return setTransferItem(transferId, input, this.deps, signal);
  }

  async dispatch(transferId: number, signal?: AbortSignal): Promise<StockTransfer> {
    return dispatchTransfer(transferId, this.deps, signal);
  }

  async receive(transferId: number, signal?: AbortSignal): Promise<StockTransfer> {
    return receiveTransfer(transferId, this.deps, signal);
  }

  async cancel(transferId: number, signal?: AbortSignal): Promise<StockTransfer> {
    return cancelTransfer(transferId, this.deps, signal);
  }
}
