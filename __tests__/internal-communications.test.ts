/**
 * M12C — communiqués, read side.
 *
 * Contract on `PapiCuche/BlackDogStore-web` @ `origin/master`
 * `aec829c697674efb61f9776a4f796bfc05663ddc` (`store/announcement_views.py`,
 * `store/announcement_services.py`):
 *
 *   GET communications/              `communications.manage`
 *   GET communications/<id>/         same, WITH the audience rules
 *   GET communications/<id>/stats/   same, aggregates only
 *   GET announcements/<id>/          no capability; the server proves the send
 *
 * THE TWO READS ARE DIFFERENT QUESTIONS. The manager's detail carries the
 * targeting; a recipient's does not, because publishing a message does not
 * publish the reasoning behind its distribution list. They must never share a
 * cache slot, or whichever loaded first would decide what the other shows.
 */
import { queryKeys } from '@/providers/query-client';
import { makeQueryScope } from '@/providers/query-scope';

const BASE = 'https://api.example.test';
const DEPS = { refreshCoordinator: {} as never };
const SCOPE = makeQueryScope({ tenantSlug: 'blackdog', userId: 42 });

type Loaded = typeof import('@/api/endpoints/internal-communications-v1');

const SUMMARY = {
  id: 12,
  title: 'Cierre por inventario el sábado',
  priority: 'action',
  status: 'published',
  author: 'Ana Torres',
  created_at: '2026-10-01T09:00:00Z',
  published_at: '2026-10-02T09:00:00Z',
  recipient_count: 40,
};

function load(
  options: {
    slug?: string | null;
    result?: unknown;
    makeError?: (ApiError: typeof import('@/api/errors').ApiError) => Error;
  } = {},
) {
  let thrown: Error | null = null;
  const send = jest.fn(async (..._args: unknown[]) => {
    if (thrown) throw thrown;
    return options.result ?? { count: 1, page: 1, page_size: 20, results: [SUMMARY] };
  });

  let module!: Loaded;
  jest.isolateModules(() => {
    jest.doMock('@/api/authenticated-request', () => ({
      authenticatedRequest: (path: string, opts: unknown, d: unknown) => send(path, opts, d),
    }));
    jest.doMock('@/config/env', () => ({
      ...jest.requireActual('@/config/env'),
      companySlug: options.slug === undefined ? 'blackdog' : options.slug,
      apiBaseUrl: BASE,
      isApiConfigured: true,
    }));
    const { ApiError } = require('@/api/errors');
    if (options.makeError) thrown = options.makeError(ApiError);
    module = require('@/api/endpoints/internal-communications-v1');
  });

  return { module, send, deps: DEPS };
}

afterEach(() => {
  jest.resetModules();
  jest.dontMock('@/api/authenticated-request');
  jest.dontMock('@/config/env');
});

describe("the sender's list", () => {
  it('reads this company communiqués on the internal surface', async () => {
    const { module, send } = load();

    await module.fetchAnnouncements({}, DEPS);

    expect(send.mock.calls[0]![0]).toBe('/api/v1/internal/blackdog/communications/');
    expect(String(send.mock.calls[0]![0])).not.toMatch(/\/api\/admin\//);
  });

  it('passes the status filter in the server vocabulary', async () => {
    const { module, send } = load();

    await module.fetchAnnouncements({ status: 'draft', page: 2, pageSize: 50 }, DEPS);

    const query = (send.mock.calls[0]![1] as { query: Record<string, unknown> }).query;
    expect(query).toEqual({ status: 'draft', page: 2, page_size: 50 });
  });

  it('sends no status at all when none was chosen', async () => {
    const { module, send } = load();

    await module.fetchAnnouncements({}, DEPS);

    const query = (send.mock.calls[0]![1] as { query: Record<string, unknown> }).query;
    expect(query.status).toBeUndefined();
  });

  it('maps a summary and keeps the server paging', async () => {
    const { module } = load({
      result: { count: 97, page: 3, page_size: 20, results: [SUMMARY] },
    });

    const page = await module.fetchAnnouncements({ page: 3 }, DEPS);

    expect(page.items[0]).toEqual({
      id: 12,
      title: 'Cierre por inventario el sábado',
      priority: 'action',
      status: 'published',
      author: 'Ana Torres',
      createdAt: '2026-10-01T09:00:00Z',
      publishedAt: '2026-10-02T09:00:00Z',
      recipientCount: 40,
    });
    expect(page.count).toBe(97);
    expect(page.page).toBe(3);
  });

  it('reads an unknown status as a DRAFT, never as published', async () => {
    // Claiming something was published is a claim about who has been told.
    const { module } = load({
      result: { count: 1, results: [{ ...SUMMARY, status: 'teleported' }] },
    });

    expect((await module.fetchAnnouncements({}, DEPS)).items[0]!.status).toBe('draft');
  });

  it('turns a 403 into a missing capability and a 404 into no access', async () => {
    const capability = load({
      makeError: (ApiError) => new ApiError('unauthorized', 'No permitido.', { status: 403 }),
    });
    await expect(capability.module.fetchAnnouncements({}, DEPS)).rejects.toMatchObject({
      name: 'InternalCapabilityMissingError',
    });

    const scope = load({
      makeError: (ApiError) => new ApiError('not_found', 'No encontrado.', { status: 404 }),
    });
    await expect(scope.module.fetchAnnouncements({}, DEPS)).rejects.toMatchObject({
      name: 'InternalAccessDeniedError',
    });
  });

  it('refuses to guess a tenant', async () => {
    const { module, send } = load({ slug: null });

    await expect(module.fetchAnnouncements({}, DEPS)).rejects.toMatchObject({
      name: 'MissingTenantError',
    });
    expect(send).not.toHaveBeenCalled();
  });
});

describe("the sender's detail", () => {
  it('reads one message with its audience rules', async () => {
    const { module, send } = load({
      result: {
        ...SUMMARY,
        body: 'Cerramos de 8 a 12.',
        audience: [
          { kind: 'branch', company: 'blackdog', branch: 'Cayma', role: null, capability_code: null, user: null },
          { kind: 'capability', company: 'blackdog', branch: null, role: null, capability_code: 'sales.pos.use', user: null },
        ],
      },
    });

    const detail = await module.fetchAnnouncement(12, DEPS);

    expect(send.mock.calls[0]![0]).toBe('/api/v1/internal/blackdog/communications/12/');
    expect(detail.body).toBe('Cerramos de 8 a 12.');
    expect(detail.audience).toHaveLength(2);
    expect(detail.audience![1]).toEqual({
      kind: 'capability',
      company: 'blackdog',
      branch: null,
      role: null,
      capabilityCode: 'sales.pos.use',
      user: null,
    });
  });

  it('reads an ABSENT audience as null, not as an empty list', async () => {
    // Absent means "you are a recipient, not the sender". An empty array would
    // read on screen as "sent to nobody".
    const { module } = load({ result: { ...SUMMARY, body: 'x' } });

    expect((await module.fetchAnnouncement(12, DEPS)).audience).toBeNull();
  });
});

describe('the numbers', () => {
  it('reads the aggregates the server computed', async () => {
    const { module, send } = load({
      result: { recipients: 40, read: 11, unread: 29, read_pct: 27.5 },
    });

    const stats = await module.fetchAnnouncementStats(12, DEPS);

    expect(send.mock.calls[0]![0]).toBe('/api/v1/internal/blackdog/communications/12/stats/');
    expect(stats).toEqual({ recipients: 40, read: 11, unread: 29, readPct: 27.5 });
  });

  it('never computes the percentage itself', async () => {
    // The server divides. If it sends nothing usable, the app shows 0 rather
        // than a figure it invented from the other two numbers.
    const { module } = load({ result: { recipients: 40, read: 11, unread: 29 } });

    expect((await module.fetchAnnouncementStats(12, DEPS)).readPct).toBe(0);
  });

  it('exposes no per-person list to ask for', () => {
    const { module } = load();

    const names = Object.keys(module).map((n) => n.toLowerCase());
    expect(names.some((n) => n.includes('readers') || n.includes('recipientlist'))).toBe(false);
  });
});

describe('a message sent to ME', () => {
  it('reads it on its own route, with no capability involved', async () => {
    const { module, send } = load({ result: { ...SUMMARY, body: 'Para ti.' } });

    const detail = await module.fetchAddressedAnnouncement(12, DEPS);

    expect(send.mock.calls[0]![0]).toBe('/api/v1/internal/blackdog/announcements/12/');
    expect(detail.body).toBe('Para ti.');
    expect(detail.audience).toBeNull();
  });

  it('reads a 404 as "not available", which is what the server means', async () => {
    // "Not yours", "not published" and "not at all" are one answer on purpose:
    // distinguishing them would let somebody enumerate other companies' notices.
    const { module } = load({
      makeError: (ApiError) => new ApiError('not_found', 'No encontrado.', { status: 404 }),
    });

    await expect(module.fetchAddressedAnnouncement(12, DEPS)).rejects.toMatchObject({
      name: 'InternalAccessDeniedError',
    });
  });
});

describe('the two views never share a cache slot', () => {
  it('keys the manager detail apart from the recipient read', () => {
    expect(queryKeys.internalAnnouncement(SCOPE, 12)).not.toEqual(
      queryKeys.internalAddressedAnnouncement(SCOPE, 12),
    );
  });

  it('keeps both inside the internal namespace', () => {
    expect(queryKeys.internalAnnouncements(SCOPE).join('/')).toContain('internal');
    expect(queryKeys.internalAddressedAnnouncement(SCOPE, 12).join('/')).toContain('internal');
  });

  it('separates tenants and users', () => {
    const otherTenant = makeQueryScope({ tenantSlug: 'otra', userId: 42 });
    const otherUser = makeQueryScope({ tenantSlug: 'blackdog', userId: 43 });

    expect(queryKeys.internalAddressedAnnouncement(SCOPE, 12)).not.toEqual(
      queryKeys.internalAddressedAnnouncement(otherTenant, 12),
    );
    expect(queryKeys.internalAddressedAnnouncement(SCOPE, 12)).not.toEqual(
      queryKeys.internalAddressedAnnouncement(otherUser, 12),
    );
  });

  it('gives each status filter its own slot', () => {
    expect(queryKeys.internalAnnouncements(SCOPE, { status: 'draft' })).not.toEqual(
      queryKeys.internalAnnouncements(SCOPE, { status: 'published' }),
    );
  });
});

describe('authoring', () => {
  const DRAFT = { ...SUMMARY, status: 'draft', published_at: null, recipient_count: 0,
    body: 'El sábado cerramos para inventario.', audience: [] };

  it('creates a draft with the text and nothing else', async () => {
    const { module, send, deps } = load({ result: DRAFT });

    await module.createAnnouncementDraft(
      { title: 'Cierre', body: 'El sábado cerramos.', priority: 'action' },
      deps,
    );

    const [path, options] = send.mock.calls[0]! as [string, Record<string, unknown>];
    expect(path).toBe('/api/v1/internal/blackdog/communications/');
    expect(options.method).toBe('POST');
    // No audience and no status: the server makes it a draft addressed to
    // nobody, and there is no field here that could publish it.
    expect(options.body).toEqual({
      title: 'Cierre',
      body: 'El sábado cerramos.',
      priority: 'action',
    });
  });

  it('sends only the fields a caller actually changed', async () => {
    const { module, send, deps } = load({ result: DRAFT });

    await module.updateAnnouncementDraft(12, { title: 'Otro título' }, deps);

    const options = send.mock.calls[0]![1] as Record<string, unknown>;
    expect(options.method).toBe('PATCH');
    expect(options.body).toEqual({ title: 'Otro título' });
  });

  it('never sends an audience unless asked', async () => {
    // `set_audience` REPLACES the rules. A PATCH that carried an audience by
    // habit would overwrite a list composed in the Web console out of branches
    // and roles this app cannot even display.
    const { module, send, deps } = load({ result: DRAFT });

    await module.updateAnnouncementDraft(12, { body: 'Texto nuevo' }, deps);

    expect(send.mock.calls[0]![1] as Record<string, unknown>).not.toHaveProperty(
      'body.audience',
    );
    expect((send.mock.calls[0]![1] as { body: Record<string, unknown> }).body)
      .not.toHaveProperty('audience');
  });

  it('addresses the whole company with the literal the server defines', async () => {
    const { module, send, deps } = load({ result: DRAFT });

    await module.updateAnnouncementDraft(12, { audienceAllCompany: true }, deps);

    expect((send.mock.calls[0]![1] as { body: Record<string, unknown> }).body.audience)
      .toEqual([{ kind: 'all_company' }]);
  });

  it('names no branch, role, capability or person in the rule it sends', async () => {
    // Those four kinds need a `branch_id`, a `role_id`, a `capability_code`
    // from the catalogue or a `user_id`, and no `/api/v1/` route lists any of
    // them (BR-012). A guessed id would address a message to the wrong people,
    // so the one rule this app sends carries nothing but its kind.
    const { module, send, deps } = load({ result: DRAFT });

    await module.updateAnnouncementDraft(12, { audienceAllCompany: true }, deps);

    const audience = (send.mock.calls[0]![1] as { body: { audience: object[] } }).body.audience;
    expect(audience).toHaveLength(1);
    expect(Object.keys(audience[0]!)).toEqual(['kind']);
  });

  it('asks for the reach with a POST and maps what comes back', async () => {
    const { module, send, deps } = load({
      result: {
        companies: [{ slug: 'blackdog', name: 'Black Dog', recipient_count: 40 }],
        company_count: 1,
        recipient_count: 40,
      },
    });

    const reach = await module.previewAnnouncement(12, deps);

    expect(send.mock.calls[0]![0]).toBe('/api/v1/internal/blackdog/communications/12/preview/');
    expect((send.mock.calls[0]![1] as { method: string }).method).toBe('POST');
    expect(reach).toEqual({
      recipientCount: 40,
      companyCount: 1,
      companies: [{ slug: 'blackdog', name: 'Black Dog', recipientCount: 40 }],
    });
  });

  it('publishes through the server route and reads the frozen count back', async () => {
    // The audience is frozen at publication: one notification row per
    // recipient, written inside the server's transaction.
    const { module, send, deps } = load({
      result: { ...SUMMARY, body: 'Texto', audience: [], recipient_count: 40 },
    });

    const published = await module.publishAnnouncement(12, deps);

    expect(send.mock.calls[0]![0]).toBe('/api/v1/internal/blackdog/communications/12/publish/');
    expect(published.recipientCount).toBe(40);
    expect(published.status).toBe('published');
  });

  it('cancels through the server route', async () => {
    const { module, send, deps } = load({
      result: { ...DRAFT, status: 'cancelled' },
    });

    const cancelled = await module.cancelAnnouncementDraft(12, deps);

    expect(send.mock.calls[0]![0]).toBe('/api/v1/internal/blackdog/communications/12/cancel/');
    expect(cancelled.status).toBe('cancelled');
  });

  it('keeps the server refusal of a draft with no audience', async () => {
    // «Elige a quién va dirigido el comunicado.» is the whole point: an
    // omitted audience is a mistake, never a broadcast.
    const { module, deps } = load({
      makeError: (ApiError) =>
        new ApiError('validation', 'Elige a quién va dirigido el comunicado.', {
          status: 400,
        }),
    });

    await expect(module.publishAnnouncement(12, deps)).rejects.toMatchObject({
      message: 'Elige a quién va dirigido el comunicado.',
    });
  });

  it('reads a 403 as the capability missing and a 404 as not ours', async () => {
    const capability = load({
      makeError: (ApiError) => new ApiError('unauthorized', 'No permitido.', { status: 403 }),
    });
    await expect(
      capability.module.createAnnouncementDraft(
        { title: 'T', body: 'B', priority: 'info' },
        capability.deps,
      ),
    ).rejects.toMatchObject({ name: 'InternalCapabilityMissingError' });

    const other = load({
      makeError: (ApiError) => new ApiError('not_found', 'No encontrado.', { status: 404 }),
    });
    await expect(other.module.publishAnnouncement(99, other.deps)).rejects.toMatchObject({
      name: 'InternalAccessDeniedError',
    });
  });

  it('refuses to guess a tenant', async () => {
    const { module, send, deps } = load({ slug: null });

    await expect(module.previewAnnouncement(12, deps)).rejects.toMatchObject({
      name: 'MissingTenantError',
    });
    expect(send).not.toHaveBeenCalled();
  });
});

describe('what this module deliberately cannot do', () => {
  it('reaches no legacy surface and no invented route', () => {
    const fs = jest.requireActual('fs') as { readFileSync(p: string, e: 'utf8'): string };
    const source = fs.readFileSync('src/api/endpoints/internal-communications-v1.ts', 'utf8');

    expect(source).not.toContain('/api/admin/');
    // Those four do not exist on the server, and inventing one to fill the
    // audience editor is exactly what BR-012 is filed instead of.
    for (const invented of ['/branches', '/roles', '/members', '/capabilities']) {
      expect(source).not.toContain(invented);
    }
  });
});
