import { useQuery } from '@tanstack/react-query';

import { isPilotTenant, useMockData } from '@/config/env';
import { pilotCompanyBrand } from '@/domain/company/pilot-brand';
import {
  resolveEnabledFeatures,
  type CompanyBrandState,
  type CompanyFeature,
} from '@/domain/company/types';
import { queryKeys } from '@/providers/query-client';
import { useQueryScope } from '@/providers/use-query-scope';
import { repositories } from '@/repositories';

/**
 * Whether this build is allowed to assume the bundled pilot branding.
 *
 * Only when BOTH are true: the build is configured for the pilot tenant, AND it
 * is running on mock data. Either alone is not enough — a real API build for
 * Black Dog should get its branding from the backend (BR-006), not from a
 * fixture compiled months ago.
 */
const canUsePilotFixture = isPilotTenant && useMockData;

/**
 * The active tenant's brand.
 *
 * M0.1 CHANGE: this no longer returns a `CompanyBrand` unconditionally.
 *
 * It used to pass `pilotCompanyBrand` as `initialData` so the first frame
 * always had a company name. That is right for the pilot and wrong for
 * everyone else: a build for another company would flash "Black Dog Store"
 * before its own branding loaded — one tenant's identity inside another
 * tenant's app, however briefly.
 *
 * So the pilot fixture is now seeded ONLY for a pilot mock build. Every other
 * build gets `loading` and then, until BR-006 exists, `unavailable`. Callers
 * render neutrally rather than borrowing someone else's brand.
 */
export function useCompanyBrand(): CompanyBrandState {
  const repository = repositories.company;
  const scope = useQueryScope();

  const { data, isPending, isError } = useQuery({
    queryKey: queryKeys.companyBrand(scope),
    queryFn: ({ signal }) => repository!.getBrand(signal),
    enabled: repository !== null,
    initialData: canUsePilotFixture ? pilotCompanyBrand : undefined,
    staleTime: Infinity,
  });

  if (data) {
    return {
      status: 'ready',
      brand: data,
      source: canUsePilotFixture ? 'pilot-fixture' : 'backend',
    };
  }

  if (repository === null) {
    return {
      status: 'unavailable',
      reason:
        'No hay origen de marca para este tenant. El endpoint público de marca es una propuesta pendiente (BR-006).',
    };
  }

  if (isError) {
    return { status: 'unavailable', reason: 'No se pudo cargar la marca de la empresa.' };
  }

  return isPending ? { status: 'loading' } : { status: 'unavailable', reason: 'Marca no disponible.' };
}

/**
 * The modules this build offers.
 *
 * Falls back to a tenant-NEUTRAL set while the brand is unknown, never to the
 * pilot's own feature list.
 */
export function useCompanyFeatures(): readonly CompanyFeature[] {
  return resolveEnabledFeatures(useCompanyBrand());
}
