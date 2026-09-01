import {
  fetchInternalContext,
  fetchInternalOrder,
  fetchInternalOrders,
  patchInternalOrderFulfillment,
  type InternalOrderQuery,
} from '@/api/endpoints/internal-v1';
import type { RefreshCoordinator } from '@/auth/refresh-coordinator';
import type {
  FulfillmentStatus,
  InternalContext,
  InternalSalesOrderDetail,
  InternalSalesOrderPage,
} from '@/domain/internal/types';

/**
 * The company's sales, over `/api/v1/internal/`.
 *
 * A SEPARATE repository from `V1CustomerOrderRepository`, not a mode of it.
 * They answer different questions — "my purchases" and "this company's sales" —
 * and one class that switched between them would be one refactor away from
 * answering the wrong one.
 *
 * Never touches `/api/admin/`: that surface speaks cookies and CSRF, and a
 * Bearer token has no business there.
 */
export class V1InternalSalesRepository {
  constructor(private readonly deps: { refreshCoordinator: RefreshCoordinator }) {}

  /** The fresh answer to "may I still be here?". Called when the area opens. */
  async getContext(signal?: AbortSignal): Promise<InternalContext> {
    return fetchInternalContext(this.deps, signal);
  }

  async listOrders(
    query: InternalOrderQuery = {},
    signal?: AbortSignal,
  ): Promise<InternalSalesOrderPage> {
    return fetchInternalOrders(query, this.deps, signal);
  }

  async getOrder(id: number, signal?: AbortSignal): Promise<InternalSalesOrderDetail> {
    return fetchInternalOrder(id, this.deps, signal);
  }

  async setFulfillmentStatus(
    input: { id: number; fulfillmentStatus: FulfillmentStatus; note?: string },
    signal?: AbortSignal,
  ): Promise<InternalSalesOrderDetail> {
    return patchInternalOrderFulfillment(input, this.deps, signal);
  }
}
