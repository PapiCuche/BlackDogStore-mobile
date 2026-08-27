/**
 * The tenant this build is a storefront for.
 *
 * Black Dog Store is the pilot, but nothing commercial may be hardcoded across
 * the app: the SaaS backend already models `Company`, so the mobile side has to
 * be able to render a different tenant without a code change.
 *
 * The distinction that matters here — and the one this type exists to enforce:
 *   - DISTRIBUTION BRANDING (this type) varies per tenant: name, logo, colours,
 *     support channels, which modules are switched on.
 *   - UNIVERSAL SAAS BUSINESS RULES do not: an order is an order, a repair has
 *     the same lifecycle, prices are money. Those live in the other domain
 *     modules and must never be branched on `CompanyBrand`.
 */
export type CompanyFeature = 'shop' | 'repairs' | 'orders' | 'support';

export type CompanyBrand = {
  /** Company.slug in Django. The tenant key. */
  slug: string;
  /** Commercial name, shown in the UI. */
  name: string;
  /** Short descriptor under the name. */
  tagline: string;
  /**
   * Remote logo. Null in M0 — the pilot logo is bundled, because a storefront
   * that cannot render its own brand offline is worse than one that cannot
   * rebrand at runtime. See BR-006.
   */
  logoUrl: string | null;
  /** Tenant accent. Overrides the `accent` token when supplied. */
  primaryColor: string;
  secondaryColor: string;
  /** Optional background override. Null keeps the design-system default. */
  backgroundColor: string | null;
  supportPhone: string;
  supportEmail: string;
  website: string;
  /** Physical location, when the tenant has one. */
  address: string | null;
  /** Modules switched on for this tenant. The tab bar is built from this. */
  enabledFeatures: readonly CompanyFeature[];
};

export function hasFeature(brand: CompanyBrand, feature: CompanyFeature): boolean {
  return brand.enabledFeatures.includes(feature);
}
