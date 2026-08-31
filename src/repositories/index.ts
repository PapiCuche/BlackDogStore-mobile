import { isPilotTenant, legacyCatalogPolicy, useMockData } from '@/config/env';

import { LegacyApiCatalogRepository } from './api/legacy-api-catalog-repository';
import { MockCatalogRepository } from './mock/mock-catalog-repository';
import { MockCompanyRepository } from './mock/mock-company-repository';
import { MockOrderRepository } from './mock/mock-order-repository';
import { MockRepairRepository } from './mock/mock-repair-repository';
import type {
  CatalogRepository,
  CompanyRepository,
  OrderRepository,
  RepairRepository,
} from './types';

/**
 * Composition root.
 *
 * The ONE place that decides which implementation each feature runs against.
 * Screens and hooks import from here and never construct a repository
 * themselves, which is what keeps "are we on mocks?" a single answerable
 * question instead of something scattered across the app.
 *
 * M0.1 — mock-only features became NULLABLE. Repairs, orders and company brand
 * were wired to their mocks unconditionally, which quietly defeated the mock
 * switch: a production build would still have shown fabricated data.
 *
 * M0.2 — THE CATALOGUE JOINED THEM.
 *
 * It used to read `useMockData ? Mock : Api`, so turning mocks off was enough
 * to point a release at the legacy Django catalogue. That catalogue is public,
 * it works, and it returns **every company's products** — verified on
 * `origin/master` `2624d478`. "Not mock" was being treated as "safe", and the
 * two are not the same thing.
 *
 * Now the source comes from `legacyCatalogPolicy`, which fails closed:
 *
 *   mock                     → MockCatalogRepository
 *   legacy-api (dev + flag)  → LegacyApiCatalogRepository
 *   none                     → null
 *
 * There is no path from a release build to the legacy catalogue.
 */
function resolveCatalogRepository(): CatalogRepository | null {
  switch (legacyCatalogPolicy.source) {
    case 'mock':
      return new MockCatalogRepository();
    case 'legacy-api':
      return new LegacyApiCatalogRepository();
    case 'none':
      return null;
  }
}

export const repositories: {
  catalog: CatalogRepository | null;
  repairs: RepairRepository | null;
  orders: OrderRepository | null;
  company: CompanyRepository | null;
} = {
  catalog: resolveCatalogRepository(),
  repairs: useMockData ? new MockRepairRepository() : null,
  orders: useMockData ? new MockOrderRepository() : null,
  // Also gated on the tenant: the bundled brand belongs to the pilot, so a
  // build configured for any other company must not receive it.
  company: useMockData && isPilotTenant ? new MockCompanyRepository() : null,
};

export { FeatureUnavailableError, featureUnavailable } from './errors';
export type {
  CatalogRepository,
  CompanyRepository,
  OrderRepository,
  RepairRepository,
} from './types';
