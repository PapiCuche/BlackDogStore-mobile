import { Directory, File, Paths } from 'expo-file-system';

import { apiBaseUrl, companySlug } from '@/config/env';
import type { RefreshCoordinator } from '@/auth/refresh-coordinator';
import type { AccessTokenStore } from '@/auth/tokens/access-token-store';

import { resolveImageAuthorization } from '../authenticated-image';
import { ApiError } from '../errors';
import {
  InternalAccessDeniedError,
  InternalCapabilityMissingError,
} from './internal-v1';

/**
 * The 80 mm ticket of an approved quote — QUOTE-TICKET.
 *
 * Verified on `PapiCuche/BlackDogStore-web` @ `origin/master`
 * `5da4e99` (`store/v1_service_views.py` > `V1ServiceQuoteTicketView`):
 *
 *   GET .../quotes/<id>/ticket/?formato=ticket80   `service.orders.view`
 *   → `application/pdf`, `Cache-Control: private, no-store`
 *
 * THE SERVER DRAWS IT, NOT THIS APP. `quote_ticket.generate_pdf` lays out what
 * was agreed, with the shop's identity and its own time zone (DOC-TIMEZONE).
 * Generating a second PDF here would be a document that disagrees with the one
 * the counter prints.
 *
 * WHAT THE SERVER DECIDES, AND SAYS SO. A quote that is not approved — or whose
 * approval was superseded — answers 400 whatever this screen showed; the
 * refusal is the domain's sentence, not a guess made before asking.
 *
 * `?formato=ticket80` is the only format and an unknown one is refused rather
 * than guessed, so the client sends exactly that and nothing else.
 *
 * BYTES NEED THE BEARER. The route is authenticated like every other internal
 * read, so the download carries the same header an image does — see
 * `api/authenticated-image.ts` for why the token is made good first.
 */

export class MissingTenantError extends Error {
  constructor() {
    super(
      'Esta build no tiene empresa configurada (EXPO_PUBLIC_COMPANY_SLUG). ' +
        'No se puede pedir un ticket sin saber de qué empresa.',
    );
    this.name = 'MissingTenantError';
  }
}

export const TICKET_FORMAT = 'ticket80';

type Deps = { refreshCoordinator: RefreshCoordinator; accessTokens?: AccessTokenStore };

function requireTenant(): string {
  if (!companySlug) throw new MissingTenantError();
  return companySlug;
}

/** Absolute URL of the ticket. Not a credential: the route authorises. */
export function quoteTicketUrl(orderId: number, quoteId: number): string {
  const path = `/api/v1/internal/${encodeURIComponent(requireTenant())}/service/orders/${encodeURIComponent(
    String(orderId),
  )}/quotes/${encodeURIComponent(String(quoteId))}/ticket/`;
  return `${apiBaseUrl}${path}?formato=${TICKET_FORMAT}`;
}

/** A name a person can recognise in a share sheet or a file list. */
export function quoteTicketFilename(orderId: number, quoteId: number): string {
  return `cotizacion-${orderId}-${quoteId}.pdf`;
}

export type DownloadedTicket = {
  /** `file://` URI of the saved PDF. */
  uri: string;
  filename: string;
};

/**
 * Download the ticket into the CACHE directory.
 *
 * Cache, not documents: a ticket is a printout of something the server can
 * redraw at any time, so it is disposable by design and the OS may reclaim it.
 * Keeping it in documents would make the phone a filing cabinet for records
 * that already live on the server.
 *
 * `downloaderFor` exists so a test can run the whole path without a native
 * filesystem; nothing else overrides it.
 */
export async function downloadQuoteTicket(
  orderId: number,
  quoteId: number,
  deps: Deps & {
    download?: (url: string, target: unknown, options: { headers: Record<string, string> }) => Promise<{ uri: string }>;
  },
  signal?: AbortSignal,
): Promise<DownloadedTicket> {
  const url = quoteTicketUrl(orderId, quoteId);
  const filename = quoteTicketFilename(orderId, quoteId);
  const authorization = await resolveImageAuthorization(deps);
  const download = deps.download ?? ((u, target, options) =>
    File.downloadFileAsync(u, target as File, options));

  try {
    const target = new File(new Directory(Paths.cache), filename);
    const saved = await download(url, target, { headers: { Authorization: authorization } });
    signal?.throwIfAborted?.();
    return { uri: saved.uri, filename };
  } catch (error) {
    // The downloader reports an HTTP failure as a plain Error, so the status is
    // read off the message rather than invented: a refusal must not arrive as
    // "no se pudo descargar" when the server explained itself.
    const message = error instanceof Error ? error.message : String(error);
    if (/\b403\b/.test(message)) throw new InternalCapabilityMissingError();
    if (/\b404\b/.test(message)) throw new InternalAccessDeniedError();
    if (/\b400\b/.test(message)) {
      throw new ApiError(
        'validation',
        'El servidor no emitió el ticket: la cotización no está aprobada.',
        { status: 400 },
      );
    }
    throw error;
  }
}
