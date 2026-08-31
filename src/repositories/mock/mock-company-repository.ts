import { pilotCompanyBrand } from '@/domain/company/pilot-brand';
import type { CompanyBrand } from '@/domain/company/types';
import type { CompanyRepository } from '@/repositories/types';

import { simulateLatency } from './latency';

/**
 * Brand data for the pilot tenant.
 *
 * Django models `Company` but exposes no branding fields and no public
 * endpoint — the only company serializer is admin-scoped. BR-006 proposes one.
 */
export class MockCompanyRepository implements CompanyRepository {
  private readonly brand: CompanyBrand;

  constructor(brand: CompanyBrand = pilotCompanyBrand) {
    this.brand = brand;
  }

  async getBrand(signal?: AbortSignal): Promise<CompanyBrand> {
    await simulateLatency(signal, 0);
    return this.brand;
  }
}
