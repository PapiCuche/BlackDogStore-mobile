import type { StatusTone } from '@/domain/orders/status';

import type { RepairStatus } from './types';

type StatusMeta = { label: string; tone: StatusTone };

/**
 * TONE per lifecycle code — and only the tone.
 *
 * WHAT THIS FILE STOPPED BEING. It used to hold Mobile's own Spanish wording
 * for a lifecycle Mobile had proposed, because there was no backend to copy
 * from. There is one now, and it is per tenant: a company that renamed
 * "Recibido" to "En mostrador" sends its own word in `status_label`, and an app
 * that kept its own table would quietly overrule a decision that business made.
 *
 * So the label here is a FALLBACK, used when a payload arrives without one —
 * never a preference. The colour stays local because it is presentation, not
 * vocabulary, and the tenant does not configure it.
 */
export const repairStatusMeta: Record<RepairStatus, StatusMeta> = {
  received: { label: 'Recibido', tone: 'neutral' },
  diagnosing: { label: 'En diagnóstico', tone: 'info' },
  waiting_approval: { label: 'Esperando aprobación', tone: 'warning' },
  // M9. The fallback labels match Django's own display strings, so a tenant
  // that never renamed anything sees the same word from either side.
  approved: { label: 'Aprobado', tone: 'success' },
  rejected: { label: 'Rechazado', tone: 'danger' },
  cancelled: { label: 'Cancelado', tone: 'danger' },
};

/**
 * How to draw a status, preferring the tenant's own word.
 *
 * `serverLabel` wins whenever the server sent one. That is the whole point of
 * the backend carrying per-company labels.
 */
export function describeRepairStatus(
  status: RepairStatus,
  serverLabel?: string,
): StatusMeta {
  const fallback = repairStatusMeta[status];
  return serverLabel ? { ...fallback, label: serverLabel } : fallback;
}
