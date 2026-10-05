/**
 * M12B — the customer inbox wire.
 *
 * Contract, read on `PapiCuche/BlackDogStore-web` @ `origin/master`
 * `aec829c697674efb61f9776a4f796bfc05663ddc`, in `store/notification_views.py`
 * and `store/v1_urls.py`:
 *
 *   GET    customer/<slug>/notifications/               page, `unread` filter
 *   GET    customer/<slug>/notifications/unread-count/  `{ unread: n }`
 *   POST   customer/<slug>/notifications/<id>/read/     the notice, now read
 *   POST   customer/<slug>/notifications/read-all/      `{ marked: n }`
 *
 * No capability: the queryset is the caller's own `Customer` row in that
 * company, so a colleague's id answers 404. What this file guards is that the
 * client sends the server's own vocabulary, never derives a count or a read
 * timestamp of its own, and never reaches the legacy surface.
 */

const BASE = 'https://api.example.test';
const DEPS = { refreshCoordinator: {} as never };

type Loaded = typeof import('@/api/endpoints/customer-notifications-v1');

const ROW = {
  id: 7,
  title: 'Tu equipo está listo',
  body: 'Puedes recogerlo en tienda.',
  priority: 'action',
  source: 'system',
  target_type: 'repair_order',
  target_id: 31,
  read_at: null,
  created_at: '2026-10-01T15:04:05Z',
};

function load(
  options: {
    slug?: string | null;
    result?: unknown;
    makeError?: (ApiError: typeof import('@/api/errors').ApiError) => Error;
  } = {},
) {
  let thrown: Error | null = null;
  const send = jest.fn(async (_path: string, _options: unknown, _deps: unknown) => {
    if (thrown) throw thrown;
    return options.result ?? { results: [ROW], count: 1, page: 1, page_size: 20 };
  });

  let module!: Loaded;

  jest.isolateModules(() => {
    jest.doMock('@/api/authenticated-request', () => ({
      authenticatedRequest: (path: string, opts: unknown, deps: unknown) => send(path, opts, deps),
    }));
    jest.doMock('@/config/env', () => ({
      ...jest.requireActual('@/config/env'),
      companySlug: options.slug === undefined ? 'blackdog' : options.slug,
      apiBaseUrl: BASE,
      isApiConfigured: true,
    }));
    const { ApiError } = require('@/api/errors');
    if (options.makeError) thrown = options.makeError(ApiError);
    module = require('@/api/endpoints/customer-notifications-v1');
  });

  return { module, send };
}

afterEach(() => {
  jest.resetModules();
  jest.dontMock('@/api/authenticated-request');
  jest.dontMock('@/config/env');
});

describe('where the requests go', () => {
  it('reads the inbox of THIS tenant, on the customer surface', async () => {
    const { module, send } = load();

    await module.fetchCustomerNotifications({}, DEPS);

    expect(send.mock.calls[0]![0]).toBe('/api/v1/customer/blackdog/notifications/');
  });

  it('asks for the badge separately', async () => {
    const { module, send } = load({ result: { unread: 4 } });

    await module.fetchCustomerUnreadCount(DEPS);

    expect(send.mock.calls[0]![0]).toBe('/api/v1/customer/blackdog/notifications/unread-count/');
  });

  it('marks one notice at its own route', async () => {
    const { module, send } = load({ result: { ...ROW, read_at: '2026-10-02T10:00:00Z' } });

    await module.markCustomerNotificationRead(7, DEPS);

    expect(send.mock.calls[0]![0]).toBe('/api/v1/customer/blackdog/notifications/7/read/');
    expect((send.mock.calls[0]![1] as { method: string }).method).toBe('POST');
  });

  it('marks everything at the read-all route', async () => {
    const { module, send } = load({ result: { marked: 9 } });

    await module.markAllCustomerNotificationsRead(DEPS);

    expect(send.mock.calls[0]![0]).toBe('/api/v1/customer/blackdog/notifications/read-all/');
    expect((send.mock.calls[0]![1] as { method: string }).method).toBe('POST');
  });

  it('declares the authenticated v1 scope on every call', async () => {
    const { module, send } = load({ result: { unread: 0 } });

    await module.fetchCustomerUnreadCount(DEPS);
    await module.markAllCustomerNotificationsRead(DEPS);

    for (const call of send.mock.calls) {
      expect((call[1] as { scope: string }).scope).toBe('authenticated-v1');
    }
  });

  it('never touches the legacy surface', async () => {
    const { module, send } = load();

    await module.fetchCustomerNotifications({ unreadOnly: true, page: 2 }, DEPS);

    for (const call of send.mock.calls) {
      expect(String(call[0])).not.toMatch(/\/api\/(admin|me|auth)\//);
      expect(String(call[0])).toMatch(/^\/api\/v1\//);
    }
  });

  it('refuses to guess a tenant', async () => {
    const { module, send } = load({ slug: null });

    await expect(module.fetchCustomerNotifications({}, DEPS)).rejects.toMatchObject({
      name: 'MissingTenantError',
    });
    expect(send).not.toHaveBeenCalled();
  });
});

describe('the query the server understands', () => {
  it('passes paging in the server vocabulary', async () => {
    const { module, send } = load();

    await module.fetchCustomerNotifications({ page: 3, pageSize: 50 }, DEPS);

    const query = (send.mock.calls[0]![1] as { query: Record<string, unknown> }).query;
    expect(query.page).toBe(3);
    expect(query.page_size).toBe(50);
  });

  it('sends `unread` ONLY when the filter is on', async () => {
    // An absent filter and `unread=0` are not the same request: the server
    // reads any value as truthy, so sending a zero would hide read notices.
    const { module, send } = load();

    await module.fetchCustomerNotifications({ unreadOnly: false }, DEPS);
    await module.fetchCustomerNotifications({ unreadOnly: true }, DEPS);

    const off = (send.mock.calls[0]![1] as { query: Record<string, unknown> }).query;
    const on = (send.mock.calls[1]![1] as { query: Record<string, unknown> }).query;
    expect(off.unread).toBeUndefined();
    expect(on.unread).toBe('1');
  });
});

describe('what comes back', () => {
  it('maps a notice into the app shape', async () => {
    const { module } = load();

    const page = await module.fetchCustomerNotifications({}, DEPS);

    expect(page.items[0]).toEqual({
      id: 7,
      title: 'Tu equipo está listo',
      body: 'Puedes recogerlo en tienda.',
      priority: 'action',
      source: 'system',
      targetType: 'repair_order',
      targetId: 31,
      readAt: null,
      createdAt: '2026-10-01T15:04:05Z',
    });
  });

  it('keeps the server paging, never recounting the page', async () => {
    const { module } = load({
      result: { results: [ROW, { ...ROW, id: 8 }], count: 97, page: 2, page_size: 20 },
    });

    const page = await module.fetchCustomerNotifications({ page: 2 }, DEPS);

    expect(page.count).toBe(97);
    expect(page.page).toBe(2);
    expect(page.pageSize).toBe(20);
    expect(page.items).toHaveLength(2);
  });

  it('reads an unknown priority as info, never as critical', async () => {
    // Inventing urgency the server did not send trains people to ignore the
    // notices that matter.
    const { module } = load({
      result: { results: [{ ...ROW, priority: 'apocalyptic' }], count: 1, page: 1, page_size: 20 },
    });

    const page = await module.fetchCustomerNotifications({}, DEPS);

    expect(page.items[0]!.priority).toBe('info');
  });

  it('reads an unknown source as a system event', async () => {
    const { module } = load({
      result: { results: [{ ...ROW, source: 'telepathy' }], count: 1, page: 1, page_size: 20 },
    });

    const page = await module.fetchCustomerNotifications({}, DEPS);

    expect(page.items[0]!.source).toBe('system');
  });

  it('keeps a target with no id as null rather than zero', async () => {
    // `target_id: 0` would be a real primary key somewhere. Null is "points at
    // nothing", and the screen must be able to tell them apart.
    const { module } = load({
      result: {
        results: [{ ...ROW, target_type: '', target_id: null }],
        count: 1,
        page: 1,
        page_size: 20,
      },
    });

    const page = await module.fetchCustomerNotifications({}, DEPS);

    expect(page.items[0]!.targetId).toBeNull();
    expect(page.items[0]!.targetType).toBe('');
  });

  it('returns the notice as the SERVER now reports it after a read', async () => {
    // Not a locally stamped timestamp: `read_at` is the server's record.
    const { module } = load({ result: { ...ROW, read_at: '2026-10-02T10:00:00Z' } });

    const notification = await module.markCustomerNotificationRead(7, DEPS);

    expect(notification.readAt).toBe('2026-10-02T10:00:00Z');
  });

  it('reads the badge as a number the server counted', async () => {
    const { module } = load({ result: { unread: 12 } });

    expect(await module.fetchCustomerUnreadCount(DEPS)).toBe(12);
  });

  it('reads a missing or nonsense count as zero', async () => {
    const { module } = load({ result: { unread: 'muchos' } });

    expect(await module.fetchCustomerUnreadCount(DEPS)).toBe(0);
  });

  it('reports how many read-all moved', async () => {
    const { module } = load({ result: { marked: 9 } });

    expect(await module.markAllCustomerNotificationsRead(DEPS)).toBe(9);
  });
});

describe('the refusals', () => {
  it('reads a 404 on the inbox as an empty inbox', async () => {
    // On this surface "unknown company", "inactive company" and "not a client
    // here" are deliberately indistinguishable, and all three read the same to
    // a person: there is nothing of yours here.
    const { module } = load({
      makeError: (ApiError) => new ApiError('not_found', 'No encontrado.', { status: 404 }),
    });

    const page = await module.fetchCustomerNotifications({}, DEPS);

    expect(page.items).toEqual([]);
    expect(page.count).toBe(0);
  });

  it('reads a 404 on the badge as no badge', async () => {
    const { module } = load({
      makeError: (ApiError) => new ApiError('not_found', 'No encontrado.', { status: 404 }),
    });

    expect(await module.fetchCustomerUnreadCount(DEPS)).toBe(0);
  });

  it('lets a 404 on a single read surface, rather than pretending it worked', async () => {
    // Marking somebody else's notice must fail loudly: swallowing it would
    // leave the UI showing a row as read that the server never touched.
    const { module } = load({
      makeError: (ApiError) => new ApiError('not_found', 'No encontrado.', { status: 404 }),
    });

    await expect(module.markCustomerNotificationRead(7, DEPS)).rejects.toMatchObject({
      status: 404,
    });
  });

  it('propagates a 401 instead of showing an empty inbox', async () => {
    const { module } = load({
      makeError: (ApiError) => new ApiError('unauthorized', 'Sin sesión.', { status: 401 }),
    });

    await expect(module.fetchCustomerNotifications({}, DEPS)).rejects.toMatchObject({
      status: 401,
    });
  });
});

describe('the client computes nothing of its own', () => {
  it('sends no body field that the server owns', async () => {
    const { module, send } = load({ result: { ...ROW, read_at: '2026-10-02T10:00:00Z' } });

    await module.markCustomerNotificationRead(7, DEPS);

    const body = (send.mock.calls[0]![1] as { body: Record<string, unknown> }).body;
    for (const owned of ['read_at', 'user', 'customer', 'company', 'audience', 'priority']) {
      expect(body).not.toHaveProperty(owned);
    }
  });

  it('never derives the badge from a page of rows', async () => {
    const fs = jest.requireActual('fs') as { readFileSync(p: string, e: 'utf8'): string };
    const source = fs.readFileSync('src/hooks/use-notifications.ts', 'utf8');

    // The page is twenty rows out of however many exist. A badge counted from
    // it would say "20" to somebody with two hundred unread.
    expect(source).not.toMatch(/\.items\.(filter|reduce)/);
    expect(source).toMatch(/getUnreadCount/);
  });
});
