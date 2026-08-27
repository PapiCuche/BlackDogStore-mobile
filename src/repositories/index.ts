import { isPilotTenant, useMockData } from '@/config/env';

import { ApiCatalogRepository } from './api/api-catalog-repository';
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
 * M0.1 CHANGE — mock-only features are now NULLABLE.
 *
 * Previously repairs, orders and company brand were wired to their mock
 * implementations unconditionally. That quietly defeated the whole point of the
 * mock switch: a production build, where `useMockData` is false, would still
 * have shown fabricated repairs and orders to a real customer.
 *
 * Now a repository exists only when this build is actually allowed to serve it.
 * `null` means "no data source in this build", the hooks surface it as a
 * `FeatureUnavailableError`, and the screens say so. Repairs, orders and brand
 * have no `Api*` sibling on purpose — writing one would mean inventing an
 * endpoint. They stay unavailable until the matching backend requirement is
 * accepted (BR-005, BR-001/BR-003, BR-006).
 */
export const repositories: {
  catalog: CatalogRepository;
  repairs: RepairRepository | null;
  orders: OrderRepository | null;
  company: CompanyRepository | null;
} = {
  catalog: useMockData ? new MockCatalogRepository() : new ApiCatalogRepository(),
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
