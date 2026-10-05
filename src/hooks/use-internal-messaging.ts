import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { InternalCapabilityMissingError } from '@/api/endpoints/internal-v1';
import { getAuthRuntime } from '@/auth/auth-runtime';
import type { MessagingSettingsInput } from '@/domain/internal/messaging-types';
import { queryKeys } from '@/providers/query-client';
import { useQueryScope } from '@/providers/use-query-scope';
import { V1InternalMessagingRepository } from '@/repositories/api/v1-internal-messaging-repository';

/**
 * The tenant's WhatsApp setup — WHATSAPP-NOTIFY.
 *
 * `retry: false` on both: a 403 means the capability is gone and a 400 is the
 * server refusing a value, and neither improves on a second try.
 */
function repository(): V1InternalMessagingRepository {
  return new V1InternalMessagingRepository({
    refreshCoordinator: getAuthRuntime().coordinator,
  });
}

export function useMessagingSettings(options: { enabled?: boolean } = {}) {
  const scope = useQueryScope();
  return useQuery({
    queryKey: queryKeys.internalMessagingSettings(scope),
    queryFn: ({ signal }) => repository().getSettings(signal),
    enabled: options.enabled ?? true,
    retry: false,
  });
}

/**
 * Save the part of it the shop owns.
 *
 * NOTHING OPTIMISTIC. `enabled` is refused while the provider side is
 * incomplete, and a template name is refused if it breaks the server's rule —
 * so what the screen must show is what came back, not what was typed.
 *
 * On a lost capability the internal cache is dropped, the same way the service
 * module does it: continuing to show settings the server has just refused would
 * be showing something this person is no longer entitled to.
 */
export function useSaveMessagingSettings() {
  const client = useQueryClient();
  const scope = useQueryScope();

  return useMutation({
    mutationFn: (input: MessagingSettingsInput) => repository().updateSettings(input),
    onSuccess: (settings) => {
      // The answer IS the new state, so it is written straight into the cache
      // rather than refetched: one round trip, and no window where the screen
      // shows the old values.
      client.setQueryData(queryKeys.internalMessagingSettings(scope), settings);
    },
    onError: (error) => {
      if (error instanceof InternalCapabilityMissingError) {
        client.removeQueries({ queryKey: queryKeys.internalMessagingSettings(scope) });
        client.removeQueries({ queryKey: queryKeys.internalContext(scope) });
      }
    },
    retry: false,
  });
}
