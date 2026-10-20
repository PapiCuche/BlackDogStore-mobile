import { posErrorMessage } from '@/api/endpoints/internal-pos-v1';
import {
  InternalAccessDeniedError,
  InternalCapabilityMissingError,
} from '@/api/endpoints/internal-v1';
import type { TextColor } from '@/design-system';
import type { PosProduct } from '@/domain/internal/pos-types';
import { describePosOnOrder } from '@/domain/internal/pos-types';

/**
 * What a scan at the counter means. The till's `handleScan`, as a function.
 *
 * THE RULES ARE THE WEB TILL'S, WORD FOR WORD. `frontend/app/admin/sales/pos`
 * trims the code, asks the server, and then does exactly one of four things:
 * says the code is unknown, offers to ORDER an article the shop can bring in,
 * refuses one with nothing on this shelf and no offer, or adds one unit. It
 * never asks what an unknown code "might be", never adds an article it has
 * just been told is out of stock, and never prices anything. Neither does
 * this.
 *
 * NOTHING HERE IS AUTHORITY. `available` is the server's count for this shop,
 * read once to decide whether to put a line in a basket that is still only an
 * intention; the sale is re-checked against the shelf when it is charged, and a
 * shortage there still answers 409. The price in the message is the string the
 * server sent, printed.
 */
export type ScanOutcome =
  | { kind: 'not_found'; message: string }
  | { kind: 'no_stock'; message: string }
  /**
   * DC3 — nothing on this shelf, but the shop can order it.
   *
   * NOT added by the scan. Ordering from a supplier commits the shop to buying
   * something; the operator says so explicitly, exactly as the web till makes
   * them.
   */
  | { kind: 'on_order_available'; product: PosProduct; message: string }
  | { kind: 'add'; product: PosProduct; message: string };

/** A scan that could not be answered at all — network, capability, a refused shop. */
export type ScanNotice = ScanOutcome | { kind: 'error'; message: string };

/**
 * The code as the server will read it: trimmed, and nothing else.
 *
 * `normalize_barcode` strips the wrapping whitespace a keyboard-wedge scanner
 * adds — above all the trailing CR/LF it sends instead of Enter — and stops
 * there. It does not upper-case, because Code128 carries case a scanner
 * reproduces faithfully, and it does not cast to a number, because
 * `0123456789012` and `123456789012` are different articles.
 */
export function scanCode(raw: string): string {
  return raw.trim();
}

export function describeScan(code: string, product: PosProduct | null): ScanOutcome {
  if (product === null) {
    return { kind: 'not_found', message: `Código no encontrado: ${code}` };
  }
  if (product.available <= 0) {
    // DC3 — nothing on this shelf, and the shop can order it. The web till
    // says the same thing in the same place and then waits for the operator:
    // ordering from a supplier is not something a scan decides.
    if (product.onOrder) {
      return {
        kind: 'on_order_available',
        product,
        // Written out rather than lower-cased from the badge: this module
        // reshapes no string, and a guard pins that — a scanner's code must
        // reach the server exactly as it was read.
        message:
          `${product.name} sin stock en esta sucursal. `
          + `Se puede vender bajo pedido: ${describePosOnOrder(product.onOrder)}.`,
      };
    }
    return {
      kind: 'no_stock',
      message: `${product.name} sin stock en esta sucursal.`,
    };
  }
  return { kind: 'add', product, message: `${product.name} · ${product.price}` };
}

/**
 * The sentence for a scan that failed.
 *
 * `posErrorMessage` knows the till's own refusals; the two internal access
 * errors are not among them, and the generic fallback would turn "you may no
 * longer sell here" into "something went wrong".
 */
export function scanFailureMessage(error: unknown): string {
  if (
    error instanceof InternalCapabilityMissingError ||
    error instanceof InternalAccessDeniedError
  ) {
    return error.message;
  }
  return posErrorMessage(error);
}

/**
 * `add` is not a success colour: a line in a basket is an intention, and the
 * only thing that has succeeded is a lookup. The warning belongs to a server
 * state — this shelf is empty — and danger to an answer the operator must act on.
 */
export function scanNoticeColor(kind: ScanNotice['kind']): TextColor {
  switch (kind) {
    case 'add':
      return 'textSecondary';
    case 'no_stock':
    // DC3 — an offer to order is the same kind of fact as an empty shelf: the
    // till is telling the operator about a state, not reporting a failure.
    case 'on_order_available':
      return 'statusWarning';
    case 'not_found':
    case 'error':
      return 'danger';
  }
}
