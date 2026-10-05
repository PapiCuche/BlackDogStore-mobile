import type { StatusTone } from '@/domain/orders/status';

/**
 * A notice the platform sent to ONE person.
 *
 * Backend (`store/models.py` > `Notification`) keeps one row per recipient, so
 * what arrives here is already personal: there is no list of addressees to
 * filter and no audience flag to branch on. Staff read a different endpoint
 * entirely — M12B split the two surfaces so that neither is one boolean away
 * from the other.
 *
 * A NOTIFICATION IS NOT AN AUTHORISATION. `targetType` / `targetId` describe
 * where the notice points, never a URL and never a grant. The destination
 * re-checks tenant and ownership when it opens, so a stale notice in an old
 * inbox opens nothing its holder could not already see.
 */
export type NotificationPriority = 'info' | 'action' | 'warning' | 'critical';

/** `system` is an event; `announcement` is a composed message (M12C). */
export type NotificationSource = 'system' | 'announcement';

export type AppNotification = {
  id: number;
  title: string;
  body: string;
  priority: NotificationPriority;
  source: NotificationSource;
  /** Structured destination, e.g. `repair_order`. Empty when it points nowhere. */
  targetType: string;
  targetId: number | null;
  /** ISO timestamp, or null while unread. */
  readAt: string | null;
  createdAt: string;
};

/** One page of an inbox. The server paginates; this app never slices. */
export type NotificationPage = {
  items: AppNotification[];
  count: number;
  page: number;
  pageSize: number;
};

/**
 * How a priority is drawn.
 *
 * The tone lives in the domain, not in the card, for the reason every other
 * status does: "Requiere acción" must look the same wherever it appears, and
 * a screen that picked its own colour would drift from the next screen.
 *
 * `info` deliberately has no badge — see `label === null`. A badge on every
 * notice makes the badge meaningless.
 */
export function describeNotificationPriority(
  priority: NotificationPriority,
): { label: string | null; tone: StatusTone } {
  switch (priority) {
    case 'action':
      return { label: 'Requiere acción', tone: 'info' };
    case 'warning':
      return { label: 'Advertencia', tone: 'warning' };
    case 'critical':
      return { label: 'Crítico', tone: 'danger' };
    case 'info':
      return { label: null, tone: 'neutral' };
  }
}

export const EMPTY_NOTIFICATION_PAGE: NotificationPage = {
  items: [],
  count: 0,
  page: 1,
  pageSize: 20,
};
