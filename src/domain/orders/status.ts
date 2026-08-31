import type { FulfillmentStatus, PaymentStatus } from './types';

/**
 * Presentation metadata for the two order lifecycles.
 *
 * Labels are the Spanish strings Django already uses in its `TextChoices`, so
 * the customer sees the same word in the app, in the web store and on the
 * emailed receipt. Changing one here without changing it there is a bug.
 */
export type StatusTone = 'neutral' | 'info' | 'progress' | 'warning' | 'success' | 'danger';

type StatusMeta = { label: string; tone: StatusTone };

export const paymentStatusMeta: Record<PaymentStatus, StatusMeta> = {
  pending_payment: { label: 'Pendiente de pago', tone: 'warning' },
  paid: { label: 'Pagado', tone: 'success' },
  failed: { label: 'Fallido', tone: 'danger' },
  cancelled: { label: 'Cancelado', tone: 'neutral' },
  expired: { label: 'Expirado', tone: 'neutral' },
  refunded: { label: 'Reembolsado', tone: 'info' },
};

export const fulfillmentStatusMeta: Record<FulfillmentStatus, StatusMeta> = {
  pending: { label: 'Pendiente', tone: 'neutral' },
  confirmed: { label: 'Confirmado', tone: 'info' },
  preparing: { label: 'En preparación', tone: 'progress' },
  ready_for_pickup: { label: 'Listo para retiro', tone: 'success' },
  shipped: { label: 'Enviado', tone: 'progress' },
  delivered: { label: 'Entregado', tone: 'success' },
  cancelled: { label: 'Cancelado operativo', tone: 'danger' },
};

/** Fallback for the null `fulfillmentStatus` the serializer currently forces. */
export const unknownFulfillmentMeta: StatusMeta = {
  label: 'Sin información',
  tone: 'neutral',
};

export function describePaymentStatus(status: PaymentStatus): StatusMeta {
  return paymentStatusMeta[status];
}

export function describeFulfillmentStatus(status: FulfillmentStatus | null): StatusMeta {
  return status === null ? unknownFulfillmentMeta : fulfillmentStatusMeta[status];
}
