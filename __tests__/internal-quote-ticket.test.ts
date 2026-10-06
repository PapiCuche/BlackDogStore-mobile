/**
 * QUOTE-TICKET — the 80 mm ticket of an approved quote.
 *
 * Contract on `PapiCuche/BlackDogStore-web` @ `origin/master` `5da4e99`
 * (`store/v1_service_views.py` > `V1ServiceQuoteTicketView`):
 *
 *   GET .../quotes/<id>/ticket/?formato=ticket80   `service.orders.view`
 *   → application/pdf, `Cache-Control: private, no-store`
 *
 * THE SERVER DRAWS IT. `quote_ticket.generate_pdf` lays out what was agreed,
 * in the shop's own time zone (DOC-TIMEZONE). A PDF composed on the phone would
 * be a second document that disagrees with the one the counter prints, so this
 * client only fetches and saves bytes.
 *
 * `?formato=ticket80` is the ONLY format and an unknown one is refused rather
 * than guessed, so exactly that is sent.
 */
import { TICKET_FORMAT, quoteTicketFilename } from '@/api/endpoints/internal-quote-ticket-v1';

const BASE = 'https://api.example.test';

type Loaded = typeof import('@/api/endpoints/internal-quote-ticket-v1');

function load(
  options: { slug?: string | null; fail?: Error; token?: string | null } = {},
) {
  let module!: Loaded;
  jest.isolateModules(() => {
    jest.doMock('@/config/env', () => ({
      ...jest.requireActual('@/config/env'),
      companySlug: options.slug === undefined ? 'blackdog' : options.slug,
      apiBaseUrl: BASE,
      isApiConfigured: true,
    }));
    module = require('@/api/endpoints/internal-quote-ticket-v1');
  });

  const download = jest.fn(async (url: string, _target: unknown, _options: unknown) => {
    if (options.fail) throw options.fail;
    return { uri: `file:///cache/${url.split('/').pop()}` };
  });
  const deps = {
    refreshCoordinator: {
      refresh: async () => ({ status: 'refreshed', accessToken: 'fresh' }),
    } as never,
    accessTokens: {
      get: () => (options.token === undefined ? 'memory-token' : options.token),
      peek: () => null,
      set: () => undefined,
      clear: () => undefined,
      isExpired: () => false,
    },
    download,
  };
  return { module, deps, download };
}

afterEach(() => {
  jest.resetModules();
  jest.dontMock('@/config/env');
});

describe('where the ticket comes from', () => {
  it('asks the ticket route of that quote, in the only format there is', () => {
    const { module } = load();

    expect(module.quoteTicketUrl(77, 5)).toBe(
      `${BASE}/api/v1/internal/blackdog/service/orders/77/quotes/5/ticket/?formato=ticket80`,
    );
    expect(TICKET_FORMAT).toBe('ticket80');
  });

  it('never reaches the legacy surface', () => {
    const { module } = load();

    expect(module.quoteTicketUrl(77, 5)).toMatch(/\/api\/v1\/internal\//);
    expect(module.quoteTicketUrl(77, 5)).not.toMatch(/\/api\/admin\//);
  });

  it('refuses to guess a tenant', () => {
    const { module } = load({ slug: null });

    expect(() => module.quoteTicketUrl(77, 5)).toThrow(
      expect.objectContaining({ name: 'MissingTenantError' }),
    );
  });

  it('names the file after the order and the quote', () => {
    expect(quoteTicketFilename(77, 5)).toBe('cotizacion-77-5.pdf');
  });
});

describe('the download', () => {
  it('carries the Bearer header the route demands', async () => {
    const { module, deps, download } = load();

    await module.downloadQuoteTicket(77, 5, deps);

    const [url, , options] = download.mock.calls[0]!;
    expect(String(url)).toContain('/quotes/5/ticket/?formato=ticket80');
    expect((options as { headers: Record<string, string> }).headers.Authorization).toBe(
      'Bearer memory-token',
    );
  });

  it('refreshes before the request when no token is usable', async () => {
    // A downloader cannot retry a 401 the way the JSON pipeline does.
    const { module, deps, download } = load({ token: null });

    await module.downloadQuoteTicket(77, 5, deps);

    expect(
      (download.mock.calls[0]![2] as { headers: Record<string, string> }).headers.Authorization,
    ).toBe('Bearer fresh');
  });

  it('answers with a local file and the name a person will recognise', async () => {
    const { module, deps } = load();

    const ticket = await module.downloadQuoteTicket(77, 5, deps);

    expect(ticket.filename).toBe('cotizacion-77-5.pdf');
    expect(ticket.uri.startsWith('file://')).toBe(true);
  });

  it('reads a 400 as the domain refusal, not as a broken download', async () => {
    // "This quote is not approved" is something the server decided; saying
    // "no se pudo descargar" would hide the only useful thing it said.
    const { module, deps } = load({ fail: new Error('Download failed with status 400') });

    await expect(module.downloadQuoteTicket(77, 5, deps)).rejects.toMatchObject({
      status: 400,
    });
  });

  it('reads a 403 as a missing capability and a 404 as out of scope', async () => {
    const cap = load({ fail: new Error('HTTP error 403 Forbidden') });
    await expect(cap.module.downloadQuoteTicket(77, 5, cap.deps)).rejects.toMatchObject({
      name: 'InternalCapabilityMissingError',
    });

    const scope = load({ fail: new Error('request failed: 404') });
    await expect(scope.module.downloadQuoteTicket(77, 5, scope.deps)).rejects.toMatchObject({
      name: 'InternalAccessDeniedError',
    });
  });

  it('lets an unexplained failure through unchanged', async () => {
    const { module, deps } = load({ fail: new Error('socket closed') });

    await expect(module.downloadQuoteTicket(77, 5, deps)).rejects.toThrow('socket closed');
  });
});

describe('what this module deliberately cannot do', () => {
  it('composes no document of its own', () => {
    const fs = jest.requireActual('fs') as { readFileSync(p: string, e: 'utf8'): string };
    const source = fs.readFileSync('src/api/endpoints/internal-quote-ticket-v1.ts', 'utf8');

    // No layout, no totals, no fonts: the server draws the ticket, including
    // the shop's time zone (DOC-TIMEZONE).
    for (const forbidden of ['jsPDF', 'pdfmake', 'printToFileAsync', 'html']) {
      expect(source).not.toContain(forbidden);
    }
  });

  it('saves to the CACHE directory, not to documents', () => {
    const fs = jest.requireActual('fs') as { readFileSync(p: string, e: 'utf8'): string };
    const source = fs.readFileSync('src/api/endpoints/internal-quote-ticket-v1.ts', 'utf8');

    // A ticket is a printout of something the server can redraw; the phone is
    // not a filing cabinet for records that already live there.
    expect(source).toContain('Paths.cache');
    expect(source).not.toContain('Paths.document');
  });
});
