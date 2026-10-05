/**
 * M12C — communiqués that cross companies, read from the platform surface.
 *
 * Contract on `PapiCuche/BlackDogStore-web` @ `origin/master`
 * `aec829c697674efb61f9776a4f796bfc05663ddc` (`store/announcement_views.py` >
 * `_PlatformMixin`, `PlatformAnnouncement*View`):
 *
 *   GET platform/announcements/              list, with a status filter
 *   GET platform/announcements/<id>/         detail, with audience rules
 *   GET platform/announcements/<id>/stats/   aggregates
 *
 * THE AUTHORITY IS THE ACCOUNT, NOT A ROLE. `_PlatformMixin` asks
 * `user.is_superuser` and nothing else, and answers 404 — never 403 — to
 * anybody else: the platform surface does not confirm to a tenant user that it
 * exists. There is NO TENANT in the path, which is the whole reason it is
 * gated this way.
 */
import { queryKeys } from '@/providers/query-client';
import { makeQueryScope } from '@/providers/query-scope';

const BASE = 'https://api.example.test';
const DEPS = { refreshCoordinator: {} as never };
const SCOPE = makeQueryScope({ tenantSlug: 'blackdog', userId: 1 });

type Loaded = typeof import('@/api/endpoints/platform-announcements-v1');

const SUMMARY = {
  id: 3,
  title: 'Mantenimiento de la plataforma el domingo',
  priority: 'warning',
  status: 'published',
  author: 'Soporte',
  created_at: '2026-10-01T09:00:00Z',
  published_at: '2026-10-02T09:00:00Z',
  recipient_count: 310,
};

function load(
  options: {
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
      companySlug: 'blackdog',
      apiBaseUrl: BASE,
      isApiConfigured: true,
    }));
    const { ApiError } = require('@/api/errors');
    if (options.makeError) thrown = options.makeError(ApiError);
    module = require('@/api/endpoints/platform-announcements-v1');
  });

  return { module, send };
}

afterEach(() => {
  jest.resetModules();
  jest.dontMock('@/api/authenticated-request');
  jest.dontMock('@/config/env');
});

describe('the platform surface', () => {
  it('reads the list with NO tenant in the path', async () => {
    const { module, send } = load();

    await module.fetchPlatformAnnouncements({}, DEPS);

    expect(send.mock.calls[0]![0]).toBe('/api/v1/platform/announcements/');
    expect(String(send.mock.calls[0]![0])).not.toContain('blackdog');
    expect(String(send.mock.calls[0]![0])).not.toMatch(/\/api\/admin\//);
  });

  it('passes the status filter and paging in the server vocabulary', async () => {
    const { module, send } = load();

    await module.fetchPlatformAnnouncements({ status: 'draft', page: 2, pageSize: 50 }, DEPS);

    expect((send.mock.calls[0]![1] as { query: Record<string, unknown> }).query).toEqual({
      status: 'draft',
      page: 2,
      page_size: 50,
    });
  });

  it('maps the same summary shape the tenant surface uses', async () => {
    // One payload, one mapper: the two surfaces differ in authority, not shape.
    const { module } = load();

    const page = await module.fetchPlatformAnnouncements({}, DEPS);

    expect(page.items[0]).toEqual({
      id: 3,
      title: 'Mantenimiento de la plataforma el domingo',
      priority: 'warning',
      status: 'published',
      author: 'Soporte',
      createdAt: '2026-10-01T09:00:00Z',
      publishedAt: '2026-10-02T09:00:00Z',
      recipientCount: 310,
    });
    expect(page.count).toBe(1);
  });

  it('reads one with its audience rules', async () => {
    const { module, send } = load({
      result: {
        ...SUMMARY,
        body: 'Habrá una ventana de mantenimiento.',
        audience: [
          { kind: 'all_companies', company: '*', branch: null, role: null, capability_code: null, user: null },
        ],
      },
    });

    const detail = await module.fetchPlatformAnnouncement(3, DEPS);

    expect(send.mock.calls[0]![0]).toBe('/api/v1/platform/announcements/3/');
    expect(detail.body).toBe('Habrá una ventana de mantenimiento.');
    expect(detail.audience).toHaveLength(1);
    expect(detail.audience![0]!.kind).toBe('all_companies');
  });

  it('reads the aggregates', async () => {
    const { module, send } = load({
      result: { recipients: 310, read: 120, unread: 190, read_pct: 38.7 },
    });

    const stats = await module.fetchPlatformAnnouncementStats(3, DEPS);

    expect(send.mock.calls[0]![0]).toBe('/api/v1/platform/announcements/3/stats/');
    expect(stats).toEqual({ recipients: 310, read: 120, unread: 190, readPct: 38.7 });
  });

  it('turns the 404 into "this is not your surface", not an error about a row', async () => {
    // The server refuses the whole surface with 404 so a tenant user cannot
    // learn it exists. Every read maps it the same way.
    const { module } = load({
      makeError: (ApiError) => new ApiError('not_found', 'No encontrado.', { status: 404 }),
    });

    for (const call of [
      () => module.fetchPlatformAnnouncements({}, DEPS),
      () => module.fetchPlatformAnnouncement(3, DEPS),
      () => module.fetchPlatformAnnouncementStats(3, DEPS),
    ]) {
      await expect(call()).rejects.toMatchObject({ name: 'PlatformAccessDeniedError' });
    }
  });

  it('lets any other failure through unchanged', async () => {
    const { module } = load({
      makeError: (ApiError) => new ApiError('server', 'Boom.', { status: 500 }),
    });

    await expect(module.fetchPlatformAnnouncements({}, DEPS)).rejects.toMatchObject({
      status: 500,
    });
  });

  it('exports no authoring path', () => {
    // Publishing one of these writes a notification row for every recipient in
    // every company it names. Not from a phone, and not without an audience
    // editor that makes the blast legible.
    const { module } = load();

    const names = Object.keys(module).map((n) => n.toLowerCase());
    for (const forbidden of ['create', 'publish', 'patch', 'update', 'preview']) {
      expect(names.some((n) => n.includes(forbidden))).toBe(false);
    }
  });
});

describe('the cache', () => {
  it('keeps platform data apart from the tenant communiqués', () => {
    expect(queryKeys.platformAnnouncements(SCOPE)).not.toEqual(
      queryKeys.internalAnnouncements(SCOPE),
    );
    expect(queryKeys.platformAnnouncement(SCOPE, 3)).not.toEqual(
      queryKeys.internalAnnouncement(SCOPE, 3),
    );
  });

  it('stays inside the private namespace so a sign-out evicts it', () => {
    const key = queryKeys.platformAnnouncements(SCOPE).join('/');
    expect(key).toContain('tenant');
    expect(key).toContain('user');
  });

  it('gives each status filter its own slot', () => {
    expect(queryKeys.platformAnnouncements(SCOPE, { status: 'draft' })).not.toEqual(
      queryKeys.platformAnnouncements(SCOPE, { status: 'published' }),
    );
  });
});
