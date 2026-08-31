import { fetchStorefrontConfig } from '@/api/endpoints/storefront-config-v1';
import type { CompanyBrand } from '@/domain/company/types';
import type { CompanyRepository } from '@/repositories/types';

/**
 * The tenant's brand, from `/api/v1/storefront/<slug>/config/`.
 *
 * BR-006 closed. Before M5 the only source was a bundled fixture that belonged
 * to the pilot, so any other tenant's build had no brand at all — correctly,
 * since showing one company's identity inside another's app is worse than
 * showing none.
 */
export class V1CompanyRepository implements CompanyRepository {
  async getBrand(signal?: AbortSignal): Promise<CompanyBrand> {
    return (await fetchStorefrontConfig(signal)).brand;
  }
}
