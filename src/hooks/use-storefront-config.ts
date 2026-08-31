import { useQuery } from '@tanstack/react-query';

import { fetchStorefrontConfig, type StorefrontConfig } from '@/api/endpoints/storefront-config-v1';
import { companySlug, isApiConfigured, useMockData } from '@/config/env';
import { queryKeys } from '@/providers/query-client';
import { useQueryScope } from '@/providers/use-query-scope';

/**
 * The tenant's public configuration.
 *
 * BR-006, integrated in M5. Public and cached hard: a shop's name, colours and
 * phone number change on the order of months, and refetching them on every
 * screen would be spending a customer's data on nothing.
 *
 * Everything degrades to empty rather than to the pilot's values. A build that
 * cannot reach its own configuration shows neutral copy; showing Black Dog
 * Store's phone number inside another company's app would be worse than showing
 * none, which is the same rule `useCompanyBrand` has followed since M0.1.
 */
const EMPTY: Pick<StorefrontConfig, 'whatsappLink' | 'policies'> = {
  whatsappLink: '',
  policies: { warrantyText: '', warrantyUrl: '', termsUrl: '', privacyUrl: '' },
};

export function useStorefrontConfig() {
  const scope = useQueryScope();
  const enabled = !useMockData && Boolean(companySlug) && isApiConfigured;

  const { data } = useQuery({
    queryKey: queryKeys.storefrontConfig(scope),
    queryFn: ({ signal }) => fetchStorefrontConfig(signal),
    enabled,
    staleTime: Infinity,
    retry: false,
  });

  return {
    config: data ?? null,
    whatsappLink: data?.whatsappLink ?? EMPTY.whatsappLink,
    policies: data?.policies ?? EMPTY.policies,
  };
}
