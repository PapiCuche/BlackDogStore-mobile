import { useMockData } from '@/config/env';

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
 * Repairs, orders and company brand have no `Api*` sibling on purpose — writing
 * one would mean inventing an endpoint. They stay mock-only until the matching
 * backend requirement is accepted.
 */
export const repositories: {
  catalog: CatalogRepository;
  repairs: RepairRepository;
  orders: OrderRepository;
  company: CompanyRepository;
} = {
  catalog: useMockData ? new MockCatalogRepository() : new ApiCatalogRepository(),
  repairs: new MockRepairRepository(),
  orders: new MockOrderRepository(),
  company: new MockCompanyRepository(),
};

export type {
  CatalogRepository,
  CompanyRepository,
  OrderRepository,
  RepairRepository,
} from './types';
