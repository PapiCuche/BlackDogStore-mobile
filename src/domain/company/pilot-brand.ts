import type { CompanyBrand } from './types';

/**
 * The pilot tenant.
 *
 * Every value is taken from the Web repository's
 * `docs/black-dog-store-brand-master.md` (sections 3 and 19) — none of it is
 * invented here. It is a FIXTURE standing in for BR-006; when the backend
 * serves brand data this object becomes the offline fallback, not the source.
 *
 * `supportEmail` is deliberately absent from the brand master document, which
 * lists WhatsApp and social channels only. Rather than invent an address, the
 * field carries the empty string and the UI hides the row — see
 * PENDIENTE BRANDING in docs/DESIGN_SYSTEM.md.
 */
export const pilotCompanyBrand: CompanyBrand = {
  slug: 'blackdog',
  name: 'Black Dog Store',
  tagline: 'Tu Apple, con respaldo especializado.',
  logoUrl: null,
  primaryColor: '#D4AF37',
  secondaryColor: '#C0C0C0',
  backgroundColor: null,
  supportPhone: '+51 936 449 536',
  supportEmail: '',
  website: 'https://biolink.info/BlackDogStorePeru',
  address: 'Calle Octavio Muñoz Najar 238, Tienda 104, Arequipa, Perú',
  enabledFeatures: ['shop', 'repairs', 'orders', 'support'],
};
