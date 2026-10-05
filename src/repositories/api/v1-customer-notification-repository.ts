import {
  fetchCustomerNotifications,
  fetchCustomerUnreadCount,
  markAllCustomerNotificationsRead,
  markCustomerNotificationRead,
  type NotificationQuery,
} from '@/api/endpoints/customer-notifications-v1';
import type { RefreshCoordinator } from '@/auth/refresh-coordinator';
import type { AppNotification, NotificationPage } from '@/domain/notifications/types';
import type { NotificationRepository } from '@/repositories/types';

/**
 * A customer's own inbox, over `/api/v1/customer/<slug>/notifications/`.
 *
 * The refresh coordinator is INJECTED, like every other private repository, so
 * the whole app shares one token graph instead of building a second one over
 * the same Keychain entry.
 *
 * No filtering, no counting, no sorting here. The server pages, orders by
 * recency and counts the unread; a client that re-derived any of those would
 * eventually disagree with the badge it drew.
 */
export class V1CustomerNotificationRepository implements NotificationRepository {
  constructor(private readonly deps: { refreshCoordinator: RefreshCoordinator }) {}

  async listNotifications(
    params: NotificationQuery,
    signal?: AbortSignal,
  ): Promise<NotificationPage> {
    return fetchCustomerNotifications(params, this.deps, signal);
  }

  async getUnreadCount(signal?: AbortSignal): Promise<number> {
    return fetchCustomerUnreadCount(this.deps, signal);
  }

  async markRead(id: number, signal?: AbortSignal): Promise<AppNotification> {
    return markCustomerNotificationRead(id, this.deps, signal);
  }

  async markAllRead(signal?: AbortSignal): Promise<number> {
    return markAllCustomerNotificationsRead(this.deps, signal);
  }
}
