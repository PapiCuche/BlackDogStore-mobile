import { companySlug } from '@/config/env';
import type { CompanyBrand, CompanyFeature } from '@/domain/company/types';

import { request } from '../client';

/**
 * The tenant's public configuration — `/api/v1/storefront/<slug>/config/`.
 *
 * BR-006, closed. Until M5 the app had no way to learn a company's name, logo,
 * colours or support channels, so a non-pilot build rendered neutrally and the
 * "Consultar por WhatsApp" button was deliberately inert — wiring it would have
 * meant hardcoding the pilot's phone number into every tenant's app.
 *
 * ANONYMOUS. Branding is what the app draws before anyone signs in; gating it
 * would make the login screen unbrandable.
 *
 * Verified on `PapiCuche/BlackDogStore-web` @ `origin/master` `0b184d3` (PR #4). It is
 * the SAME payload the web receives from `/api/storefront/config/`, built by the
 * same function — the backend has a test comparing the two responses.
 */

export class MissingTenantError extends Error {
  constructor() {
    super('Esta build no tiene empresa configurada (EXPO_PUBLIC_COMPANY_SLUG).');
    this.name = 'MissingTenantError';
  }
}

type ConfigWire = {
  company: { name?: string; slug?: string; legal_name?: string; tax_id?: string };
  branding: { logo_url?: string; colors?: Record<string, string> };
  contact: {
    email?: string;
    phone?: string;
    whatsapp_number?: string;
    whatsapp_link?: string;
    website_url?: string;
    address?: string;
    city?: string;
  };
  policies: {
    warranty_text?: string;
    warranty_url?: string;
    terms_url?: string;
    privacy_url?: string;
  };
};

/** Everything the app shows about the shop itself, beyond `CompanyBrand`. */
export type StorefrontPolicies = {
  warrantyText: string;
  warrantyUrl: string;
  termsUrl: string;
  privacyUrl: string;
};

export type StorefrontConfig = {
  brand: CompanyBrand;
  /** Ready-to-open WhatsApp link, or empty when the tenant published none. */
  whatsappLink: string;
  policies: StorefrontPolicies;
};

/**
 * Which modules this build offers.
 *
 * The backend has no per-company feature switch yet, so every tenant gets the
 * full set rather than an invented subset. Reporting fewer would hide a module
 * the company actually has; reporting a guess would be worse than reporting the
 * truth that there is no switch.
 */
const ALL_FEATURES: readonly CompanyFeature[] = ['shop', 'repairs', 'orders', 'support'];

function readColor(colors: Record<string, string> | undefined, ...names: string[]): string {
  for (const name of names) {
    const value = colors?.[name];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return '';
}

export function toStorefrontConfig(wire: ConfigWire): StorefrontConfig {
  const company = wire.company ?? {};
  const branding = wire.branding ?? {};
  const contact = wire.contact ?? {};
  const policies = wire.policies ?? {};

  const address = [contact.address, contact.city].filter(Boolean).join(', ');

  return {
    brand: {
      slug: String(company.slug ?? ''),
      name: String(company.name ?? ''),
      // The backend has no tagline field. An empty string is honest; inventing
      // marketing copy for someone else's business is not.
      tagline: '',
      logoUrl: branding.logo_url ? String(branding.logo_url) : null,
      primaryColor: readColor(branding.colors, 'primary', 'accent'),
      secondaryColor: readColor(branding.colors, 'secondary'),
      backgroundColor: readColor(branding.colors, 'background') || null,
      supportPhone: String(contact.phone ?? ''),
      supportEmail: String(contact.email ?? ''),
      website: String(contact.website_url ?? ''),
      address: address || null,
      enabledFeatures: ALL_FEATURES,
    },
    whatsappLink: String(contact.whatsapp_link ?? ''),
    policies: {
      warrantyText: String(policies.warranty_text ?? ''),
      warrantyUrl: String(policies.warranty_url ?? ''),
      termsUrl: String(policies.terms_url ?? ''),
      privacyUrl: String(policies.privacy_url ?? ''),
    },
  };
}

export async function fetchStorefrontConfig(signal?: AbortSignal): Promise<StorefrontConfig> {
  if (!companySlug) throw new MissingTenantError();
  const wire = await request<ConfigWire>(
    `/api/v1/storefront/${encodeURIComponent(companySlug)}/config/`,
    { signal },
  );
  return toStorefrontConfig(wire);
}
