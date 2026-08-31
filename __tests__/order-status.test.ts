import {
  describeFulfillmentStatus,
  describePaymentStatus,
  fulfillmentStatusMeta,
  paymentStatusMeta,
} from '@/domain/orders/status';
import { orderItemCount, orderNumber } from '@/domain/orders/types';
import { mockOrders } from '@/repositories/mock/fixtures';

/**
 * The rule under test is the one most likely to be broken by a well-meaning
 * refactor: payment and fulfilment are INDEPENDENT and must never be collapsed.
 */
describe('order status', () => {
  it('describes every payment status Django can emit', () => {
    // Mirrors `Order.Status` in the Web repository. A value added there without
    // a matching entry here would render as `undefined`.
    expect(Object.keys(paymentStatusMeta).sort()).toEqual(
      ['cancelled', 'expired', 'failed', 'paid', 'pending_payment', 'refunded'].sort(),
    );
  });

  it('describes every fulfilment status Django can emit', () => {
    expect(Object.keys(fulfillmentStatusMeta).sort()).toEqual(
      [
        'cancelled',
        'confirmed',
        'delivered',
        'pending',
        'preparing',
        'ready_for_pickup',
        'shipped',
      ].sort(),
    );
  });

  it('keeps payment and fulfilment independent', () => {
    // A paid order that is still being prepared is the NORMAL case. If these
    // two ever resolve from one another, this is where it shows up.
    const payment = describePaymentStatus('paid');
    const fulfillment = describeFulfillmentStatus('preparing');

    expect(payment.label).toBe('Pagado');
    expect(fulfillment.label).toBe('En preparación');
    expect(payment.tone).not.toBe(fulfillment.tone);
  });

  it('admits ignorance when the serializer omits fulfillment_status', () => {
    // Django's OrderSerializer does not expose the field yet (BR-003). Guessing
    // `pending` would show the customer a state the server never claimed.
    const result = describeFulfillmentStatus(null);
    expect(result.label).toBe('Sin información');
    expect(result.tone).toBe('neutral');
  });

  it('counts items by quantity, not by line', () => {
    // Only `quantity` is read, so a partial item is a faithful stand-in.
    const order = { items: [{ quantity: 2 }, { quantity: 3 }] } as unknown as Parameters<
      typeof orderItemCount
    >[0];
    expect(orderItemCount(order)).toBe(5);
  });

  it('renders the order number from the primary key', () => {
    expect(orderNumber({ id: 1042 })).toBe('#1042');
  });

  it('has fixtures whose statuses are all describable', () => {
    for (const order of mockOrders) {
      expect(describePaymentStatus(order.paymentStatus).label).toBeTruthy();
      expect(describeFulfillmentStatus(order.fulfillmentStatus).label).toBeTruthy();
    }
  });
});
