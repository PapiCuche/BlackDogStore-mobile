import type { Order } from '@/domain/orders/types';
import type { OrderRepository } from '@/repositories/types';

import { mockOrders } from './fixtures';
import { simulateLatency } from './latency';

/**
 * Orders backed by fixtures.
 *
 * `GET /api/orders/` DOES exist and is verified, but it requires an
 * authenticated session over the cookie+CSRF contract this client cannot speak
 * (BR-001), and it does not serialize `fulfillment_status` (BR-003). So the
 * screens are built against this until both are resolved.
 */
export class MockOrderRepository implements OrderRepository {
  private readonly orders: readonly Order[];

  constructor(orders: readonly Order[] = mockOrders) {
    this.orders = orders;
  }

  async listOrders(signal?: AbortSignal): Promise<Order[]> {
    await simulateLatency(signal);
    return [...this.orders].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }

  async getOrderById(id: number, signal?: AbortSignal): Promise<Order | null> {
    await simulateLatency(signal);
    return this.orders.find((order) => order.id === id) ?? null;
  }
}
