import { pilotCompanyBrand } from '@/domain/company/pilot-brand';
import {
  DEFAULT_ENABLED_FEATURES,
  hasFeature,
  resolveEnabledFeatures,
  type CompanyBrand,
  type CompanyBrandState,
} from '@/domain/company/types';

/**
 * Tenant isolation rules.
 *
 * The failure this guards against is a build for company B briefly — or
 * permanently — presenting company A's identity because A happened to be the
 * bundled fallback.
 */

describe('resolveEnabledFeatures', () => {
  it('uses the tenant’s own feature list once the brand is ready', () => {
    const brand: CompanyBrand = { ...pilotCompanyBrand, slug: 'acme', enabledFeatures: ['shop'] };
    const state: CompanyBrandState = { status: 'ready', brand, source: 'backend' };

    expect(resolveEnabledFeatures(state)).toEqual(['shop']);
  });

  it('falls back to a tenant-NEUTRAL set while loading', () => {
    expect(resolveEnabledFeatures({ status: 'loading' })).toBe(DEFAULT_ENABLED_FEATURES);
  });

  it('falls back to the neutral set when the brand is unavailable', () => {
    expect(resolveEnabledFeatures({ status: 'unavailable', reason: 'x' })).toBe(
      DEFAULT_ENABLED_FEATURES,
    );
  });

  it('does not use the pilot’s configuration as the universal default', () => {
    // If the neutral default were `pilotCompanyBrand.enabledFeatures`, this
    // would pass by coincidence today and leak the pilot's setup the moment the
    // pilot changed it. The two must be independent values.
    const pilotOnly: CompanyBrand = { ...pilotCompanyBrand, enabledFeatures: ['support'] };
    const state: CompanyBrandState = {
      status: 'ready',
      brand: pilotOnly,
      source: 'pilot-fixture',
    };

    expect(resolveEnabledFeatures(state)).toEqual(['support']);
    expect(DEFAULT_ENABLED_FEATURES).not.toEqual(['support']);
  });
});

describe('DEFAULT_ENABLED_FEATURES', () => {
  it('exposes only the core modules, and reveals nothing tenant-specific', () => {
    expect([...DEFAULT_ENABLED_FEATURES].sort()).toEqual(
      ['orders', 'repairs', 'shop', 'support'].sort(),
    );
  });
});

describe('pilotCompanyBrand', () => {
  it('is the pilot tenant and says so', () => {
    expect(pilotCompanyBrand.slug).toBe('blackdog');
  });

  it('carries no invented support email', () => {
    // The Web brand master document lists WhatsApp and social channels only.
    // An address made up here would end up in front of a customer.
    expect(pilotCompanyBrand.supportEmail).toBe('');
  });

  it('has no bundled remote logo url', () => {
    // The pilot logo is a bundled asset gated on `source === 'pilot-fixture'`,
    // not a URL that any tenant could inherit.
    expect(pilotCompanyBrand.logoUrl).toBeNull();
  });
});

describe('hasFeature', () => {
  it('reads the brand’s own list', () => {
    const brand: CompanyBrand = { ...pilotCompanyBrand, enabledFeatures: ['shop', 'orders'] };
    expect(hasFeature(brand, 'shop')).toBe(true);
    expect(hasFeature(brand, 'repairs')).toBe(false);
  });
});
