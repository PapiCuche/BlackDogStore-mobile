import { toStorefrontConfig } from '@/api/endpoints/storefront-config-v1';
import { isOpenableLink } from '@/utils/external-links';

/**
 * M5 — BR-006 closed.
 *
 * Until now the app had no source for a tenant's identity, so a non-pilot build
 * rendered neutrally and the WhatsApp button was deliberately inert. The rule
 * that made it inert still holds: whatever this maps must come from the server,
 * never from a constant.
 */

const WIRE = {
  company: {
    name: 'Black Dog Store',
    slug: 'blackdog',
    legal_name: 'CMAU CORP E.I.R.L.',
    tax_id: '20610159886',
  },
  branding: {
    logo_url: 'https://cdn.test/logo.png',
    colors: { primary: '#D4AF37', secondary: '#C0C0C0', background: '#0A0A0A' },
  },
  contact: {
    email: 'hola@example.test',
    phone: '+51 936 449 536',
    whatsapp_number: '51936449536',
    whatsapp_link: 'https://wa.me/51936449536',
    website_url: 'https://example.test',
    address: 'Calle Octavio Muñoz Najar 238',
    city: 'Arequipa',
  },
  policies: {
    warranty_text: 'Garantía de 6 meses.',
    warranty_url: 'https://example.test/garantia',
    terms_url: 'https://example.test/terminos',
    privacy_url: 'https://example.test/privacidad',
  },
};

describe('mapping the tenant config', () => {
  it('maps the brand', () => {
    const config = toStorefrontConfig(WIRE);

    expect(config.brand.slug).toBe('blackdog');
    expect(config.brand.name).toBe('Black Dog Store');
    expect(config.brand.logoUrl).toBe('https://cdn.test/logo.png');
    expect(config.brand.primaryColor).toBe('#D4AF37');
  });

  it('joins the address with the city, as a customer reads it', () => {
    expect(toStorefrontConfig(WIRE).brand.address).toBe(
      'Calle Octavio Muñoz Najar 238, Arequipa',
    );
  });

  it('maps the WhatsApp link the SERVER published', () => {
    expect(toStorefrontConfig(WIRE).whatsappLink).toBe('https://wa.me/51936449536');
  });

  it('maps the policies', () => {
    const { policies } = toStorefrontConfig(WIRE);

    expect(policies.warrantyUrl).toBe('https://example.test/garantia');
    expect(policies.termsUrl).toBe('https://example.test/terminos');
  });

  it('does NOT invent a tagline the backend has no field for', () => {
    // Writing marketing copy for someone else's business is not the app's job.
    expect(toStorefrontConfig(WIRE).brand.tagline).toBe('');
  });

  it('degrades a missing logo to null rather than a broken image', () => {
    const config = toStorefrontConfig({ ...WIRE, branding: { colors: {} } });

    expect(config.brand.logoUrl).toBeNull();
  });

  it('survives a config with empty sections', () => {
    const config = toStorefrontConfig({
      company: {}, branding: {}, contact: {}, policies: {},
    });

    expect(config.brand.name).toBe('');
    expect(config.whatsappLink).toBe('');
    expect(config.brand.address).toBeNull();
  });

  it('never carries a value from another tenant', () => {
    const other = toStorefrontConfig({
      ...WIRE,
      company: { ...WIRE.company, slug: 'otra', name: 'Otra Empresa' },
      contact: { ...WIRE.contact, whatsapp_link: 'https://wa.me/51999999999' },
    });

    expect(other.brand.name).toBe('Otra Empresa');
    expect(other.whatsappLink).not.toContain('936449536');
  });
});

describe('opening a link the server sent', () => {
  it.each([
    'https://wa.me/51936449536',
    'whatsapp://send?phone=51936449536',
    'tel:+51936449536',
    'mailto:hola@example.test',
  ])('opens %p', (link) => {
    expect(isOpenableLink(link)).toBe(true);
  });

  it.each([
    'javascript:alert(1)',
    'file:///etc/passwd',
    'data:text/html,<script>',
    'intent://evil',
    '',
    'no-es-una-url',
    null,
    undefined,
  ])('refuses %p', (link) => {
    // A URL is the one response field that becomes an action. The server is
    // trusted and this still checks.
    expect(isOpenableLink(link)).toBe(false);
  });
});
