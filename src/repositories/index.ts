import { authRuntimePolicy } from '@/auth/auth-policy';
import { getAuthRuntime } from '@/auth/auth-runtime';
import {
  catalogPolicy, companySlug, isApiConfigured, isPilotTenant, useMockData,
} from '@/config/env';

import { V1ApiCatalogRepository } from './api/v1-api-catalog-repository';
import { V1CompanyRepository } from './api/v1-company-repository';
import { V1CustomerOrderRepository } from './api/v1-customer-order-repository';
import { V1CustomerRepairRepository } from './api/v1-customer-repair-repository';
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

/**
 * Where a customer's own orders come from.
 *
 * M4 — the first PRIVATE integration. Unlike the catalogue, this needs a real
 * session, so the deciding input is the AUTH policy rather than the mock flag:
 *
 *   backend mode  → V1CustomerOrderRepository  (/api/v1/customer/…)
 *   mock mode     → MockOrderRepository        (development demo)
 *   unavailable   → null
 *
 * `unavailable` covers a build with no auth contract AND a build that has one
 * but no API url. Neither can fetch a private record, and neither should show a
 * screen that pretends otherwise.
 *
 * Note this says nothing about whether the signed-in person HAS any orders, or
 * even a relation with this company. That is the server's answer, not a
 * composition decision — asking is safe, and the reply is theirs alone.
 */
function resolveOrderRepository(): OrderRepository | null {
  switch (authRuntimePolicy.mode) {
    case 'backend':
      return new V1CustomerOrderRepository({
        refreshCoordinator: getAuthRuntime().coordinator,
      });
    case 'mock':
      return useMockData ? new MockOrderRepository() : null;
    case 'unavailable':
      return null;
  }
}

/**
 * Where this build's branding comes from.
 *
 * M5 — BR-006 landed, so there is finally a real source. Before it, the only
 * option was a bundled fixture belonging to the pilot, which is why a non-pilot
 * build received NOTHING: one company's identity inside another company's app
 * is worse than a neutral screen.
 *
 *   mocks on + pilot  → MockCompanyRepository  (the bundled pilot fixture)
 *   tenant + API url  → V1CompanyRepository    (/api/v1/storefront/<slug>/config/)
 *   otherwise         → null
 *
 * The pilot fixture keeps its narrow gate rather than being deleted: it is what
 * makes the app runnable straight after a clone, with no server.
 */
/**
 * Where this build's repairs come from.
 *
 * M8 — BR-005A landed, so there is finally a real source. Until then this was
 * the ONLY feature still gated on the raw `useMockData` flag rather than on the
 * auth policy, and that was correct while the alternative to a fixture was
 * nothing at all.
 *
 * It is not correct now. A repair is PRIVATE data: reading it needs a session,
 * so the deciding input is the same one orders use — `authRuntimePolicy.mode`,
 * not whether mocks happen to be switched on.
 */
function resolveRepairRepository(): RepairRepository | null {
  switch (authRuntimePolicy.mode) {
    case 'backend':
      return new V1CustomerRepairRepository({
        refreshCoordinator: getAuthRuntime().coordinator,
      });
    case 'mock':
      return useMockData ? new MockRepairRepository() : null;
    case 'unavailable':
      return null;
  }
}

function resolveCompanyRepository(): CompanyRepository | null {
  if (useMockData) {
    return isPilotTenant ? new MockCompanyRepository() : null;
  }
  return companySlug && isApiConfigured ? new V1CompanyRepository() : null;
}

export const repositories: {
  catalog: CatalogRepository | null;
  repairs: RepairRepository | null;
  orders: OrderRepository | null;
  company: CompanyRepository | null;
} = {
  catalog: resolveCatalogRepository(),
  repairs: resolveRepairRepository(),
  orders: resolveOrderRepository(),
  company: resolveCompanyRepository(),
};

export { FeatureUnavailableError, featureUnavailable } from './errors';
export type {
  CatalogRepository,
  CompanyRepository,
  OrderRepository,
  RepairRepository,
} from './types';
