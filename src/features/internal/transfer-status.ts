import type { StatusTone } from '@/domain/orders/status';

/**
 * How a transfer's status is PAINTED. IP1B.
 *
 * THIS IS NOT A STATE MACHINE, and the difference is the whole point of the
 * file. There is no map from one status to the next here, no list of allowed
 * transitions and no notion of what "comes after" anything: those live in
 * `inventory_services` on the server, which is the only place that can enforce
 * them. This maps a status the server SENT to a colour, and falls back to
 * neutral for a status it has never heard of — a new state must show up looking
 * plain, never be silently mislabelled as one of these.
 *
 * The WORD is never translated here either. `statusLabel` arrives from the
 * server's own display value, so a business that renames a state renames it
 * everywhere at once.
 */
export function transferStatusTone(status: string): StatusTone {
  switch (status) {
    case 'draft':
      return 'neutral';
    case 'in_transit':
      return 'progress';
    case 'received':
      return 'success';
    case 'cancelled':
      return 'danger';
    default:
      return 'neutral';
  }
}
