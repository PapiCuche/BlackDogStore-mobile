import type { NotificationPriority } from '@/domain/notifications/types';
import type { StatusTone } from '@/domain/orders/status';

/**
 * A communiqué — M12C.
 *
 * Staff write one, pick who it goes to, and publishing WRITES ONE
 * NOTIFICATION ROW PER RECIPIENT. That is why the audience is frozen at
 * publication: somebody who acquired the role last week was never written to,
 * so last month's communiqué does not exist for them.
 *
 * `communications.manage` administers this company's own messages. Reading one
 * addressed TO you needs no capability at all — a message sent to somebody is
 * not an authority — and the server proves the addressing from the
 * notification row rather than from the reader's current permissions.
 */
export const CAP_COMMUNICATIONS_MANAGE = 'communications.manage';

export type AnnouncementStatus = 'draft' | 'published' | 'cancelled';

export type AnnouncementSummary = {
  id: number;
  title: string;
  priority: NotificationPriority;
  status: AnnouncementStatus;
  /** Who signed it, as the server renders the name. */
  author: string;
  createdAt: string;
  publishedAt: string | null;
  /** FROZEN at publication. 0 while it is still a draft. */
  recipientCount: number;
};

/**
 * One communiqué with its text.
 *
 * `audience` arrives ONLY for somebody who manages this company's messages:
 * which capability was selected and which branches were chosen are the
 * sender's working notes, and publishing a message does not publish the
 * reasoning behind its distribution list.
 */
export type AnnouncementDetail = AnnouncementSummary & {
  body: string;
  audience: readonly AnnouncementAudienceRule[] | null;
};

export type AnnouncementAudienceRule = {
  kind: string;
  company: string;
  branch: string | null;
  role: string | null;
  capabilityCode: string | null;
  user: string | null;
};

/**
 * How far a published communiqué got.
 *
 * AGGREGATES ONLY, by the server's decision: knowing that eleven of forty read
 * a notice is management, and knowing WHICH eleven is surveillance. There is no
 * per-person list to ask for.
 *
 * `recipients` is the frozen denominator, and `readPct` is computed by the
 * server — this app does no arithmetic on it.
 */
export type AnnouncementStats = {
  recipients: number;
  read: number;
  unread: number;
  readPct: number;
};

export function describeAnnouncementStatus(
  status: AnnouncementStatus,
): { label: string; tone: StatusTone } {
  switch (status) {
    case 'published':
      return { label: 'Publicado', tone: 'success' };
    case 'cancelled':
      return { label: 'Descartado', tone: 'neutral' };
    case 'draft':
      return { label: 'Borrador', tone: 'info' };
  }
}

export const ANNOUNCEMENT_STATUSES: readonly AnnouncementStatus[] = [
  'draft',
  'published',
  'cancelled',
];
