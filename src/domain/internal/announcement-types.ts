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

/**
 * WHAT A COMMUNIQUÉ IS ALLOWED TO SAY — `announcement_services.TITLE_MAX` and
 * `BODY_MAX`. Mirrored to stop a long text at the keyboard rather than after a
 * round trip; the server validates it again and its refusal is what is shown.
 */
export const ANNOUNCEMENT_TITLE_MAX_LENGTH = 140;
export const ANNOUNCEMENT_BODY_MAX_LENGTH = 4000;

/**
 * THE AUDIENCE KINDS, and the one this app can compose.
 *
 * `AnnouncementAudienceRule.Kind` has five. Four of them name something by id
 * — a branch, a role, a capability code from the catalogue, a person — and
 * `/api/v1/` publishes no route that lists any of those, so this app cannot
 * offer them without inventing identifiers. Addressing a message to a guessed
 * id would send it to the wrong people, which is worse than not sending it.
 *
 * `all_company` names nothing, so it is composable and complete: the server
 * resolves it to the company's active members at publication.
 *
 * See BR-012 in docs/BACKEND_REQUIREMENTS.md for the roster that would unlock
 * the other four.
 */
export const ANNOUNCEMENT_AUDIENCE_ALL_COMPANY = 'all_company';

/** What this app sends as an audience. One rule, naming no identifiers. */
export type AnnouncementAudienceInput = readonly [
  { readonly kind: typeof ANNOUNCEMENT_AUDIENCE_ALL_COMPANY },
];

export type AnnouncementDraftInput = {
  title: string;
  body: string;
  priority: NotificationPriority;
};

/**
 * How many people a draft WOULD reach, asked just before publishing.
 *
 * INFORMATIVE, NEVER AUTHORITATIVE — the server says so in as many words:
 * publication resolves the audience again from scratch, because somebody joins
 * or leaves in between. It is shown as a number from a moment, never kept as
 * the recipient list.
 */
export type AnnouncementPreview = {
  recipientCount: number;
  companyCount: number;
  companies: readonly { slug: string; name: string; recipientCount: number }[];
};
