/**
 * M12B — the STAFF inbox.
 *
 * Contract on `PapiCuche/BlackDogStore-web` @ `origin/master`
 * `aec829c697674efb61f9776a4f796bfc05663ddc` (`store/notification_views.py`):
 * four routes under `internal/<slug>/notifications/`, no capability, scoped to
 * the caller's own notices in that company.
 *
 * The thing this file exists to hold down is the SEPARATION. The backend
 * refused to serve both audiences from one endpoint that branches on
 * `is_staff`, and the app must not quietly reunite them: different paths,
 * different repositories, different cache namespaces.
 */
import { queryKeys } from '@/providers/query-client';
import { makeQueryScope } from '@/providers/query-scope';

const BASE = 'https://api.example.test';
const DEPS = { refreshCoordinator: {} as never };
const SCOPE = makeQueryScope({ tenantSlug: 'blackdog', userId: 42 });

type Loaded = typeof import('@/api/endpoints/internal-notifications-v1');

const ROW = {
  id: 9,
  title: 'Te asignaron una reparación',
  body: 'Orden #77 — iPhone 13',
  priority: 'action',
  source: 'system',
  target_type: 'repair_order',
  target_id: 77,
  read_at: null,
  created_at: '2026-10-03T12:00:00Z',
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
    return options.result ?? { results: [ROW], count: 1, page: 1, page_size: 20 };
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
    module = require('@/api/endpoints/internal-notifications-v1');
  });

  return { module, send };
}

afterEach(() => {
  jest.resetModules();
  jest.dontMock('@/api/authenticated-request');
  jest.dontMock('@/config/env');
});

describe('the staff surface, and only it', () => {
  it('reads the inbox under internal/, never under customer/', async () => {
    const { module, send } = load();

    await module.fetchInternalNotifications({}, DEPS);

    expect(send.mock.calls[0]![0]).toBe('/api/v1/internal/blackdog/notifications/');
    expect(String(send.mock.calls[0]![0])).not.toContain('/customer/');
  });

  it('puts every operation on the internal path', async () => {
    const list = load();
    await list.module.fetchInternalNotifications({}, DEPS);
    const count = load({ result: { unread: 2 } });
    await count.module.fetchInternalUnreadCount(DEPS);
    const one = load({ result: ROW });
    await one.module.markInternalNotificationRead(9, DEPS);
    const all = load({ result: { marked: 5 } });
    await all.module.markAllInternalNotificationsRead(DEPS);

    expect(count.send.mock.calls[0]![0]).toBe(
      '/api/v1/internal/blackdog/notifications/unread-count/',
    );
    expect(one.send.mock.calls[0]![0]).toBe('/api/v1/internal/blackdog/notifications/9/read/');
    expect(all.send.mock.calls[0]![0]).toBe('/api/v1/internal/blackdog/notifications/read-all/');
    for (const call of [...one.send.mock.calls, ...all.send.mock.calls]) {
      expect((call[1] as { method: string }).method).toBe('POST');
    }
  });

  it('declares the authenticated v1 scope and no legacy surface', async () => {
    const { module, send } = load();

    await module.fetchInternalNotifications({ unreadOnly: true }, DEPS);

    const options = send.mock.calls[0]![1] as { scope: string; query: Record<string, unknown> };
    expect(options.scope).toBe('authenticated-v1');
    expect(options.query.unread).toBe('1');
    expect(String(send.mock.calls[0]![0])).not.toMatch(/\/api\/(admin|me|auth)\//);
  });

  it('refuses to guess a tenant', async () => {
    const { module, send } = load({ slug: null });

    await expect(module.fetchInternalNotifications({}, DEPS)).rejects.toMatchObject({
      name: 'MissingTenantError',
    });
    expect(send).not.toHaveBeenCalled();
  });
});

describe('what comes back', () => {
  it('maps a staff notice with the same shape the customer one uses', async () => {
    // One payload, one mapper. Two mappers for one server shape drift the
    // moment a field moves.
    const { module } = load();

    const page = await module.fetchInternalNotifications({}, DEPS);

    expect(page.items[0]).toEqual({
      id: 9,
      title: 'Te asignaron una reparación',
      body: 'Orden #77 — iPhone 13',
      priority: 'action',
      source: 'system',
      targetType: 'repair_order',
      targetId: 77,
      readAt: null,
      createdAt: '2026-10-03T12:00:00Z',
    });
  });

  it('keeps the server paging', async () => {
    const { module } = load({
      result: { results: [ROW], count: 64, page: 3, page_size: 20 },
    });

    const page = await module.fetchInternalNotifications({ page: 3 }, DEPS);

    expect(page.count).toBe(64);
    expect(page.page).toBe(3);
  });

  it('reads a 404 as an empty inbox, because membership is the question', async () => {
    // Unknown company, closed company and "not a member here" are one answer
    // on the internal surface, so a valid login cannot map the platform.
    const { module } = load({
      makeError: (ApiError) => new ApiError('not_found', 'No encontrado.', { status: 404 }),
    });

    expect((await module.fetchInternalNotifications({}, DEPS)).items).toEqual([]);
    expect(await module.fetchInternalUnreadCount(DEPS)).toBe(0);
  });

  it('propagates a 403 instead of pretending the inbox is empty', async () => {
    const { module } = load({
      makeError: (ApiError) => new ApiError('unauthorized', 'No permitido.', { status: 403 }),
    });

    await expect(module.fetchInternalNotifications({}, DEPS)).rejects.toMatchObject({
      status: 403,
    });
  });

  it('sends nothing the server owns when marking read', async () => {
    const { module, send } = load({ result: ROW });

    await module.markInternalNotificationRead(9, DEPS);

    const body = (send.mock.calls[0]![1] as { body: Record<string, unknown> }).body;
    for (const owned of ['read_at', 'user', 'company', 'audience', 'priority']) {
      expect(body).not.toHaveProperty(owned);
    }
  });
});

describe('the two inboxes never share a cache slot', () => {
  it('keys the staff inbox under the INTERNAL audience', () => {
    expect(queryKeys.internalNotifications(SCOPE).join('/')).toContain('internal');
    expect(queryKeys.internalNotifications(SCOPE).join('/')).not.toContain('customer');
  });

  it('keys the customer inbox under the CUSTOMER audience', () => {
    expect(queryKeys.notifications(SCOPE).join('/')).toContain('customer');
    expect(queryKeys.notifications(SCOPE).join('/')).not.toContain('internal');
  });

  it('never lets one audience read the other out of the cache', () => {
    // The dangerous direction is a colleague's assignment notice appearing in
    // a buyer's inbox, which is exactly what one shared key would allow.
    expect(queryKeys.internalNotifications(SCOPE)).not.toEqual(queryKeys.notifications(SCOPE));
    expect(queryKeys.internalNotificationsUnread(SCOPE)).not.toEqual(
      queryKeys.notificationsUnread(SCOPE),
    );
  });

  it('separates tenants and users inside the staff namespace', () => {
    const otherTenant = makeQueryScope({ tenantSlug: 'otra', userId: 42 });
    const otherUser = makeQueryScope({ tenantSlug: 'blackdog', userId: 43 });

    expect(queryKeys.internalNotifications(SCOPE)).not.toEqual(
      queryKeys.internalNotifications(otherTenant),
    );
    expect(queryKeys.internalNotifications(SCOPE)).not.toEqual(
      queryKeys.internalNotifications(otherUser),
    );
  });

  it('gives the unread filter its own slot', () => {
    expect(queryKeys.internalNotifications(SCOPE, { unreadOnly: true })).not.toEqual(
      queryKeys.internalNotifications(SCOPE, { unreadOnly: false }),
    );
  });
});
