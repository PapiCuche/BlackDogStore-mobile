import {
  fetchInternalContext,
  fetchOrderDelivery,
  forgetOrderUnit,
  identifyOrderUnit,
  lookupOrderUnit,
  fetchInternalOrder,
  fetchInternalOrders,
  patchInternalOrderFulfillment,
  patchOrderDelivery,
  reviewOrderRisk,
  type InternalOrderQuery,
} from '@/api/endpoints/internal-v1';
import type { RefreshCoordinator } from '@/auth/refresh-coordinator';
import type {
  OrderDeliveryInput,
  OrderDeliveryRecord,
} from '@/domain/internal/delivery-types';
import type {
  OrderRisk,
  RiskDecision,
  UnitCandidate,
  UnitMethodInput,
} from '@/domain/internal/order-unit-types';
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

  // SERIAL-PICK-01. The lookup writes nothing; the other two answer with the
  // whole order again, devices and remaining count included.
  async lookupUnit(
    orderId: number,
    code: string,
    method: UnitMethodInput,
    signal?: AbortSignal,
  ): Promise<UnitCandidate> {
    return lookupOrderUnit(orderId, code, method, this.deps, signal);
  }

  async identifyUnit(
    orderId: number,
    code: string,
    method: UnitMethodInput,
    signal?: AbortSignal,
  ): Promise<InternalSalesOrderDetail> {
    return identifyOrderUnit(orderId, code, method, this.deps, signal);
  }

  async forgetUnit(
    orderId: number,
    orderUnitId: number,
    signal?: AbortSignal,
  ): Promise<InternalSalesOrderDetail> {
    return forgetOrderUnit(orderId, orderUnitId, this.deps, signal);
  }

  // DELIVERY-01. Reading takes `sales.orders.view`; writing takes `manage`,
  // and the record is never the order: freight is information, and «enviado»
  // is still said where it always was.
  async getDelivery(orderId: number, signal?: AbortSignal): Promise<OrderDeliveryRecord> {
    return fetchOrderDelivery(orderId, this.deps, signal);
  }

  async saveDelivery(
    orderId: number,
    input: OrderDeliveryInput,
    signal?: AbortSignal,
  ): Promise<OrderDeliveryRecord> {
    return patchOrderDelivery(orderId, input, this.deps, signal);
  }

  /** CLIENT-SEC-01. Answers the assessment alone: `manage` does not imply `view`. */
  async reviewRisk(
    orderId: number,
    decision: RiskDecision,
    note: string,
    signal?: AbortSignal,
  ): Promise<OrderRisk | null> {
    return reviewOrderRisk(orderId, decision, note, this.deps, signal);
  }
}
