import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  AnnouncementDetail,
  AnnouncementDraftInput,
  AnnouncementPreview,
  AnnouncementStatus,
} from '@/domain/internal/announcement-types';
import { getAuthRuntime } from '@/auth/auth-runtime';
import { queryKeys } from '@/providers/query-client';
import { useQueryScope } from '@/providers/use-query-scope';
import { V1InternalCommunicationsRepository } from '@/repositories/api/v1-internal-communications-repository';

/**
 * Communiqués — M12C, read side.
 *
 * `retry: false` throughout, like the rest of the internal surface: the
 * interesting failures are permanent answers. 403 means the capability is gone,
 * 404 means this company is closed to you or the message was never sent to you.
 */
function repository(): V1InternalCommunicationsRepository {
  return new V1InternalCommunicationsRepository({
    refreshCoordinator: getAuthRuntime().coordinator,
  });
}

/** What this company has sent. `communications.manage`. */
export function useAnnouncements(
  params: { status?: AnnouncementStatus; page?: number } = {},
  options: { enabled?: boolean } = {},
) {
  const scope = useQueryScope();
  return useQuery({
    queryKey: queryKeys.internalAnnouncements(scope, params),
    queryFn: ({ signal }) => repository().listAnnouncements(params, signal),
    enabled: options.enabled ?? true,
    retry: false,
  });
}

export function useAnnouncement(
  id: number | undefined,
  options: { enabled?: boolean } = {},
) {
  const scope = useQueryScope();
  return useQuery({
    queryKey: queryKeys.internalAnnouncement(scope, id ?? -1),
    queryFn: ({ signal }) => repository().getAnnouncement(id!, signal),
    enabled: (options.enabled ?? true) && id !== undefined && Number.isFinite(id),
    retry: false,
  });
}

/**
 * How far a published message got.
 *
 * SECONDARY: the detail screen renders it inline and never gates on it. A draft
 * has no numbers worth asking for, so the caller holds this back.
 */
export function useAnnouncementStats(
  id: number | undefined,
  options: { enabled?: boolean } = {},
) {
  const scope = useQueryScope();
  return useQuery({
    queryKey: queryKeys.internalAnnouncementStats(scope, id ?? -1),
    queryFn: ({ signal }) => repository().getAnnouncementStats(id!, signal),
    enabled: (options.enabled ?? true) && id !== undefined && Number.isFinite(id),
    retry: false,
  });
}

/**
 * A message that was sent to ME.
 *
 * No capability, and a different cache key from the manager's view of the same
 * message: the two carry different fields — the sender sees the audience rules,
 * a recipient must not — and one shared slot would let whichever loaded first
 * decide what the other shows.
 */
export function useAddressedAnnouncement(
  id: number | undefined,
  options: { enabled?: boolean } = {},
) {
  const scope = useQueryScope();
  return useQuery({
    queryKey: queryKeys.internalAddressedAnnouncement(scope, id ?? -1),
    queryFn: ({ signal }) => repository().getAddressedAnnouncement(id!, signal),
    enabled: (options.enabled ?? true) && id !== undefined && Number.isFinite(id),
    retry: false,
  });
}

/**
 * AUTHORING — M12C, write side.
 *
 * Every one of these invalidates the sender's whole `communications` prefix:
 * publishing changes the message, the frozen recipient count, the list it
 * appears in and the numbers underneath it at once.
 *
 * NOTHING RETRIES. Publishing writes one notification row per recipient, so a
 * repeated POST is a second message in everybody's inbox; the server has no
 * idempotency key for this route, which is itself the reason not to invent a
 * retry policy for it.
 *
 * `internalAddressedAnnouncement` is deliberately NOT invalidated here. What a
 * recipient was sent is a different question with a different gate, and the
 * sender's act does not make the reader's copy stale.
 */
function useCommunicationsMutation<TInput, TResult>(
  run: (input: TInput) => Promise<TResult>,
) {
  const client = useQueryClient();
  const scope = useQueryScope();

  return useMutation({
    mutationFn: run,
    onSuccess: () => {
      void client.invalidateQueries({
        queryKey: queryKeys.internalAnnouncementsRoot(scope),
      });
    },
    retry: false,
  });
}

/** A new draft: title, body, priority. No audience, and not published. */
export function useCreateAnnouncementDraft() {
  return useCommunicationsMutation<AnnouncementDraftInput, AnnouncementDetail>((input) =>
    repository().createDraft(input),
  );
}

/**
 * Edit a draft, and optionally address it to the whole company.
 *
 * `audienceAllCompany` is opt-in per call because `set_audience` REPLACES the
 * rules — a PATCH that sent it by habit would overwrite a distribution list
 * composed in the Web console out of branches and roles this app cannot show.
 */
export function useUpdateAnnouncementDraft() {
  return useCommunicationsMutation<
    { id: number } & Partial<AnnouncementDraftInput> & { audienceAllCompany?: true },
    AnnouncementDetail
  >(({ id, ...changes }) => repository().updateDraft(id, changes));
}

/**
 * How many people it would reach.
 *
 * A mutation rather than a query, and never cached: the server resolves the
 * audience to answer and resolves it again at publication, so holding this
 * number would be holding a recipient list that nobody promised.
 */
export function usePreviewAnnouncement() {
  return useCommunicationsMutation<{ id: number }, AnnouncementPreview>(({ id }) =>
    repository().previewDraft(id),
  );
}

export function usePublishAnnouncement() {
  return useCommunicationsMutation<{ id: number }, AnnouncementDetail>(({ id }) =>
    repository().publishDraft(id),
  );
}

export function useCancelAnnouncementDraft() {
  return useCommunicationsMutation<{ id: number }, AnnouncementDetail>(({ id }) =>
    repository().cancelDraft(id),
  );
}
