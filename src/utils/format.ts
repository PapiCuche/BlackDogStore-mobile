/**
 * Formatting helpers.
 *
 * Money and dates are the two things most likely to be quietly wrong, so both
 * live here rather than being inlined per screen.
 */

/**
 * Currency. The pilot tenant sells in Peruvian soles.
 *
 * Prices arrive from DRF as decimal STRINGS. They are parsed here, at the very
 * last moment before display, and never earlier — arithmetic on a float that
 * came from "4899.00" is how a price ends up as S/ 4898.99.
 */
const currencyFormatter = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCurrency(amount: string | number): string {
  const value = typeof amount === 'number' ? amount : Number.parseFloat(amount);
  if (!Number.isFinite(value)) return '—';
  return currencyFormatter.format(value);
}

const dateFormatter = new Intl.DateTimeFormat('es-PE', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return '—';
  return dateFormatter.format(new Date(parsed));
}

/**
 * "hace 25 min".
 *
 * Rolls over to an absolute date after a week: "hace 34 días" is less useful
 * than "12 jul 2026", and the imprecision starts to read as neglect.
 *
 * `now` is a parameter so this is testable without freezing the clock.
 */
export function formatRelativeTime(iso: string | null, now: number = Date.now()): string {
  if (!iso) return '—';
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return '—';

  const elapsedMs = now - parsed;
  if (elapsedMs < 0) return formatDate(iso);

  const minutes = Math.floor(elapsedMs / 60_000);
  if (minutes < 1) return 'hace un momento';
  if (minutes < 60) return `hace ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;

  const days = Math.floor(hours / 24);
  if (days === 1) return 'ayer';
  if (days < 7) return `hace ${days} días`;

  return formatDate(iso);
}

/** Greeting that matches the time of day. Used by the Home header. */
export function greetingForHour(hour: number = new Date().getHours()): string {
  if (hour < 12) return 'Buenos días';
  if (hour < 19) return 'Buenas tardes';
  return 'Buenas noches';
}
