import type { StatusTone } from '@/domain/orders/status';

import { isKnownRepairStatus, type KnownRepairStatus, type RepairStatus } from './types';

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
export const repairStatusMeta: Record<KnownRepairStatus, StatusMeta> = {
  received: { label: 'Recibido', tone: 'neutral' },
  diagnosing: { label: 'En diagnóstico', tone: 'info' },
  waiting_approval: { label: 'Esperando aprobación', tone: 'warning' },
  // M9. The fallback labels match Django's own display strings, so a tenant
  // that never renamed anything sees the same word from either side.
  approved: { label: 'Aprobado', tone: 'success' },
  // M10. `repaired` is 'success' because the work is done; it is NOT
  // 'Listo para recoger', because nobody has checked it and nobody has called
  // the customer. `waiting_parts` is a warning rather than a failure: the shop
  // is blocked, not broken.
  in_repair: { label: 'En reparación', tone: 'info' },
  waiting_parts: { label: 'Esperando repuestos', tone: 'warning' },
  repaired: { label: 'Reparado', tone: 'success' },
  // M11. `quality_control` is 'info' — being tested is progress, not a problem.
  // `ready_for_pickup` is the only genuinely good news in the ladder, and its
  // label says what it means and nothing more.
  quality_control: { label: 'En control de calidad', tone: 'info' },
  ready_for_pickup: { label: 'Listo para recoger', tone: 'success' },
  rejected: { label: 'Rechazado', tone: 'danger' },
  cancelled: { label: 'Cancelado', tone: 'danger' },
};

/**
 * What an UNRECOGNISED code looks like.
 *
 * Neutral, because this build has no idea whether the state is good news. The
 * label is filled in from the server at the call site — the shop's own word is
 * the only honest thing to show for a state the app has never heard of.
 */
const UNKNOWN_META: StatusMeta = { label: '', tone: 'neutral' };

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
  // A code from a phase this build predates keeps the SERVER's label and a
  // neutral tone. M9 taught this the expensive way: coercing an unknown status
  // to a known one rendered "Recibido" over a repair the customer had just
  // approved. Showing the shop's own word and no opinion is the honest answer,
  // and it means a backend can ship a state without this app contradicting it.
  const fallback = isKnownRepairStatus(status) ? repairStatusMeta[status] : UNKNOWN_META;
  if (serverLabel) return { ...fallback, label: serverLabel };
  // Last resort: the raw code. Ugly on purpose — an unlabelled unknown state is
  // a contract gap somebody should see, not something to paper over.
  return fallback.label ? fallback : { ...fallback, label: status };
}
