import { useQuery } from '@tanstack/react-query';

import { pilotCompanyBrand } from '@/domain/company/pilot-brand';
import type { CompanyBrand } from '@/domain/company/types';
import { queryKeys } from '@/providers/query-client';
import { repositories } from '@/repositories';

/**
 * The active tenant's brand.
 *
 * Never suspends and never returns undefined: the pilot brand is the
 * `initialData`, so the very first frame already has a company name to render.
 * A storefront that shows a blank header while it fetches its own identity
 * looks broken, and once BR-006 makes this a real request that first frame is
 * exactly when it would happen.
 */
export function useCompanyBrand(): CompanyBrand {
  const { data } = useQuery({
    queryKey: queryKeys.companyBrand(),
    queryFn: ({ signal }) => repositories.company.getBrand(signal),
    initialData: pilotCompanyBrand,
    staleTime: Infinity,
  });
  return data;
}
