import { catalogPolicy, isPilotTenant, useMockData } from '@/config/env';

import { V1ApiCatalogRepository } from './api/v1-api-catalog-repository';
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
 * to point a release at the pre-SaaS Django catalogue, which returned **every
 * company's products**. "Not mock" was being treated as "safe", and the two are
 * not the same thing.
 *
 * M2 — THE REAL CATALOGUE ARRIVED, AND THE LEGACY ONE WAS DELETED.
 *
 * `origin/master` `b301637b` ships `/api/v1/storefront/<company_slug>/…`, where
 * the server resolves an active company from the path and builds every queryset
 * from it. So a release build finally has a catalogue it is safe to serve.
 *
 * The legacy repository, its endpoint wrapper, its network guard and
 * `EXPO_PUBLIC_ENABLE_LEGACY_CATALOG` were REMOVED rather than switched off. A
 * second path to the same data — especially the unsafe one — is a path that
 * eventually gets used by someone who does not know why it was left there.
 *
 *   mock    → MockCatalogRepository
 *   api-v1  → V1ApiCatalogRepository
 *   none    → null  (no tenant, or no API URL: fails safe, never to mocks)
 */
function resolveCatalogRepository(): CatalogRepository | null {
  switch (catalogPolicy.source) {
    case 'mock':
      return new MockCatalogRepository();
    case 'api-v1':
      return new V1ApiCatalogRepository();
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
