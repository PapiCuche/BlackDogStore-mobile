import {
  fetchInternalNotifications,
  fetchInternalUnreadCount,
  markAllInternalNotificationsRead,
  markInternalNotificationRead,
  type InternalNotificationQuery,
} from '@/api/endpoints/internal-notifications-v1';
import type { RefreshCoordinator } from '@/auth/refresh-coordinator';
import type { AppNotification, NotificationPage } from '@/domain/notifications/types';

/**
 * The staff inbox, over `/api/v1/internal/<slug>/notifications/`.
 *
 * A separate class from the customer one even though the row shape is the same:
 * they are different audiences on different paths, and one class that switched
 * between them would be one refactor away from reading the wrong inbox.
 */
export class V1InternalNotificationRepository {
  constructor(private readonly deps: { refreshCoordinator: RefreshCoordinator }) {}

  async listNotifications(
    params: InternalNotificationQuery,
    signal?: AbortSignal,
  ): Promise<NotificationPage> {
    return fetchInternalNotifications(params, this.deps, signal);
  }

  async getUnreadCount(signal?: AbortSignal): Promise<number> {
    return fetchInternalUnreadCount(this.deps, signal);
  }

  async markRead(id: number, signal?: AbortSignal): Promise<AppNotification> {
    return markInternalNotificationRead(id, this.deps, signal);
  }

  async markAllRead(signal?: AbortSignal): Promise<number> {
    return markAllInternalNotificationsRead(this.deps, signal);
  }
}
