import {
  fetchCustomerOrderById,
  fetchCustomerOrders,
} from '@/api/endpoints/customer-orders-v1';
import type { RefreshCoordinator } from '@/auth/refresh-coordinator';
import type { Order } from '@/domain/orders/types';
import type { OrderRepository } from '@/repositories/types';

/**
 * A customer's own orders, over `/api/v1/customer/`.
 *
 * M4 — the second real integration, and the first PRIVATE one. The catalogue is
 * anonymous; this needs a token, which is why it exists only once M3 shipped a
 * session.
 *
 * No client-side filtering, deliberately. The server scopes by ownership
 * (`Order.user` or `Order.customer.user`) and by company, and a client that
 * trimmed another person's rows out of a response would already have received
 * them.
 *
 * The refresh coordinator is INJECTED rather than imported so that this
 * repository shares the one token graph (`auth/auth-runtime.ts`) instead of
 * building a second one over the same Keychain entry.
 */
export class V1CustomerOrderRepository implements OrderRepository {
  constructor(private readonly deps: { refreshCoordinator: RefreshCoordinator }) {}

  async listOrders(signal?: AbortSignal): Promise<Order[]> {
    return fetchCustomerOrders(this.deps, signal);
  }

  async getOrderById(id: number, signal?: AbortSignal): Promise<Order | null> {
    return fetchCustomerOrderById(id, this.deps, signal);
  }
}
