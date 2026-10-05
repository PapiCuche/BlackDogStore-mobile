import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, renderHook, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import type { AppNotification, NotificationPage } from '@/domain/notifications/types';
import { describeNotificationPriority } from '@/domain/notifications/types';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
} from '@/hooks/use-notifications';
import { queryKeys } from '@/providers/query-client';
import { makeQueryScope } from '@/providers/query-scope';

import { renderWithProviders } from './support/render';

/**
 * The inbox screen and its cache — M12B.
 *
 * What this file holds down, beyond "it renders":
 *
 *  - the UNREAD FILTER is the server's parameter, not a local predicate. The
 *    page is twenty rows of however many exist, so filtering in hand would
 *    tell somebody they have nothing unread while page two is full of it.
 *  - reading a notice invalidates the page AND the badge. They are separate
 *    keys, and a badge that survived a read is a number the screen contradicts.
 *  - nothing is drawn as read before the server says so. `read_at` is the
 *    server's record; an optimistic row would outlive a failed request.
 */
const SCOPE = makeQueryScope({ tenantSlug: 'blackdog', userId: 42 });

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  Stack: { Screen: () => null },
}));

jest.mock('@/providers/use-query-scope', () => {
  const { makeQueryScope: make } = jest.requireActual('@/providers/query-scope');
  const scope = make({ tenantSlug: 'blackdog', userId: 42 });
  // Spread the real module: the theme provider reads the PUBLIC scope above
  // the auth boundary, and a mock that dropped it takes the whole tree down.
  return {
    ...jest.requireActual('@/providers/use-query-scope'),
    useQueryScope: () => scope,
  };
});

// The private gate is exercised by its own suite. Here the screen is asked
// what it draws for somebody who IS signed in.
jest.mock('@/features/auth/private-action-gate', () => ({
  usePrivateActionState: () => 'ready',
  PrivateActionPrompt: () => null,
}));

const mockList = jest.fn();
const mockUnread = jest.fn();
const mockMarkRead = jest.fn();
const mockMarkAll = jest.fn();

jest.mock('@/repositories', () => ({
  ...jest.requireActual('@/repositories'),
  repositories: {
    catalog: null,
    repairs: null,
    orders: null,
    company: null,
    notifications: {
      listNotifications: (...args: unknown[]) => mockList(...args),
      getUnreadCount: (...args: unknown[]) => mockUnread(...args),
      markRead: (...args: unknown[]) => mockMarkRead(...args),
      markAllRead: (...args: unknown[]) => mockMarkAll(...args),
    },
  },
}));

function notification(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: 7,
    title: 'Tu equipo está listo',
    body: 'Puedes recogerlo en tienda.',
    priority: 'action',
    source: 'system',
    targetType: 'repair_order',
    targetId: 31,
    readAt: null,
    createdAt: '2026-10-01T15:04:05Z',
    ...overrides,
  };
}

function page(items: AppNotification[]): NotificationPage {
  return { items, count: items.length, page: 1, pageSize: 20 };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockList.mockResolvedValue(page([notification()]));
  mockUnread.mockResolvedValue(1);
  mockMarkRead.mockResolvedValue(notification({ readAt: '2026-10-02T10:00:00Z' }));
  mockMarkAll.mockResolvedValue(1);
});

async function renderScreen() {
  const NotificationsScreen = require('@/app/notifications').default;
  return renderWithProviders(<NotificationsScreen />);
}

describe('the inbox screen', () => {
  it('shows what the shop sent', async () => {
    await renderScreen();

    expect(await screen.findByText('Tu equipo está listo')).toBeTruthy();
    expect(screen.getByText('Puedes recogerlo en tienda.')).toBeTruthy();
  });

  it('says in WORDS that a notice is unread, not only in colour', async () => {
    await renderScreen();

    expect(await screen.findByText(/No leído/)).toBeTruthy();
  });

  it('asks the SERVER for the unread filter instead of trimming the page', async () => {
    await renderScreen();
    await screen.findByText('Tu equipo está listo');

    fireEvent.press(screen.getByText('Solo no leídos'));

    await waitFor(
      () => {
        const asked = mockList.mock.calls.map((call) => call[0]);
        expect(asked).toContainEqual(expect.objectContaining({ unreadOnly: true }));
      },
      { timeout: 3000 },
    );
  });

  it('marks one notice read through the server', async () => {
    await renderScreen();

    fireEvent.press(await screen.findByText('Tu equipo está listo'));

    await waitFor(() => expect(mockMarkRead).toHaveBeenCalledWith(7));
  });

  it('offers no read action on a notice already read', async () => {
    mockList.mockResolvedValue(page([notification({ readAt: '2026-10-02T10:00:00Z' })]));
    await renderScreen();

    fireEvent.press(await screen.findByText('Tu equipo está listo'));

    expect(mockMarkRead).not.toHaveBeenCalled();
  });

  it('marks everything read when asked', async () => {
    await renderScreen();

    fireEvent.press(await screen.findByText('Marcar todo leído'));

    await waitFor(() => expect(mockMarkAll).toHaveBeenCalled());
  });

  it('hides the bulk action when nothing is unread', async () => {
    mockList.mockResolvedValue(page([notification({ readAt: '2026-10-02T10:00:00Z' })]));
    await renderScreen();
    await screen.findByText('Tu equipo está listo');

    expect(screen.queryByText('Marcar todo leído')).toBeNull();
  });

  it('says the inbox is empty rather than showing a blank page', async () => {
    mockList.mockResolvedValue(page([]));
    await renderScreen();

    expect(await screen.findByText('Aún no tienes avisos')).toBeTruthy();
  });

  it('distinguishes an empty filter from an empty inbox', async () => {
    mockList.mockResolvedValue(page([]));
    await renderScreen();
    await screen.findByText('Aún no tienes avisos');

    fireEvent.press(screen.getByText('Solo no leídos'));

    expect(await screen.findByText('Nada sin leer')).toBeTruthy();
  });

  it('shows the failure instead of an empty inbox when the read fails', async () => {
    mockList.mockRejectedValue(new Error('boom'));
    await renderScreen();

    expect(await screen.findByText('Reintentar')).toBeTruthy();
    expect(screen.queryByText('Aún no tienes avisos')).toBeNull();
  });
});

describe('the cache', () => {
  function wrapper(client: QueryClient) {
    return function Wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    };
  }

  it('invalidates the page AND the badge after reading one notice', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const { result } = await renderHook(() => useMarkNotificationRead(), {
      wrapper: wrapper(client),
    });

    await result.current.mutateAsync(7);

    const keys = invalidate.mock.calls.map((call) => JSON.stringify(call[0]?.queryKey));
    expect(keys).toContain(JSON.stringify(queryKeys.notificationsRoot(SCOPE)));
    expect(keys).toContain(JSON.stringify(queryKeys.notificationsUnread(SCOPE)));
  });

  it('invalidates both after marking everything read', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const { result } = await renderHook(() => useMarkAllNotificationsRead(), {
      wrapper: wrapper(client),
    });

    await result.current.mutateAsync();

    const keys = invalidate.mock.calls.map((call) => JSON.stringify(call[0]?.queryKey));
    expect(keys).toContain(JSON.stringify(queryKeys.notificationsRoot(SCOPE)));
    expect(keys).toContain(JSON.stringify(queryKeys.notificationsUnread(SCOPE)));
  });

  it('invalidates even when the write FAILED', async () => {
    // `onSettled`, not `onSuccess`: a 404 means the row is not what the screen
    // thinks it is, and the honest next step is to refetch what is really there.
    mockMarkRead.mockRejectedValue(new Error('nope'));
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const { result } = await renderHook(() => useMarkNotificationRead(), {
      wrapper: wrapper(client),
    });

    await expect(result.current.mutateAsync(7)).rejects.toThrow('nope');

    expect(invalidate).toHaveBeenCalled();
  });

  it('keeps the inbox inside the tenant + user + customer namespace', async () => {
    // Two audiences sharing a cache slot is how internal data lands in a
    // customer screen. The badge and the page both carry the whole prefix.
    const other = makeQueryScope({ tenantSlug: 'otra-tienda', userId: 42 });

    expect(queryKeys.notifications(SCOPE)).not.toEqual(queryKeys.notifications(other));
    expect(queryKeys.notificationsUnread(SCOPE)).not.toEqual(
      queryKeys.notificationsUnread(other),
    );
    expect(queryKeys.notifications(SCOPE).join('/')).toContain('customer');
  });

  it('gives the unread filter its own cache slot', async () => {
    expect(queryKeys.notifications(SCOPE, { unreadOnly: true })).not.toEqual(
      queryKeys.notifications(SCOPE, { unreadOnly: false }),
    );
  });
});

describe('priority is the domain word, not the screen opinion', () => {
  it('shows no badge for an ordinary notice', () => {
    expect(describeNotificationPriority('info').label).toBeNull();
  });

  it('keeps each priority on one tone everywhere', () => {
    expect(describeNotificationPriority('action')).toEqual({
      label: 'Requiere acción',
      tone: 'info',
    });
    expect(describeNotificationPriority('warning').tone).toBe('warning');
    expect(describeNotificationPriority('critical').tone).toBe('danger');
  });
});
