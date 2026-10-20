/**
 * «Mi cuenta» — CLIENT-SEC-01 (profile, own-email verification) and
 * DELIVERY-01 (address book).
 *
 * Contract on `PapiCuche/BlackDogStore-web` @ `origin/master` `1448a5dd`
 * (`store/v1_customer_views.py`, `store/customer_profile.py`,
 * `store/delivery_services.py`, `store/account_views.py`):
 *
 *   GET/PATCH customer/<slug>/profile/
 *   POST      customer/<slug>/verify-email/send/      (no address in the body)
 *   POST      customer/<slug>/verify-email/confirm/   {code}
 *   GET/POST  customer/<slug>/addresses/
 *   PATCH/DELETE customer/<slug>/addresses/<id>/
 *   POST      customer/<slug>/addresses/<id>/default/
 *
 * NO CAPABILITY ANYWHERE HERE: it is the caller's own record. The gate is
 * being a client of the company in the path, and whoever is not gets the 404
 * of the whole customer surface.
 */
import {
  CUSTOMER_DOCUMENT_TYPES,
  DOCUMENT_PATTERNS,
  isPlausibleCustomerPhone,
} from '@/domain/customer/profile-types';

const BASE = 'https://api.example.test';
const DEPS = { refreshCoordinator: {} as never };

type Profile = typeof import('@/api/endpoints/customer-profile-v1');
type Addresses = typeof import('@/api/endpoints/customer-addresses-v1');

const PROFILE_ROW = {
  email: 'ana@example.test',
  email_verified_at: null,
  email_verification_available: true,
  first_name: 'Ana',
  last_name: 'Torres',
  phone: '987654321',
  document_type: 'dni',
  document_number: '12345678',
  document_locked: false,
};

const ADDRESS_ROW = {
  id: 7,
  label: 'Casa',
  kind: 'address',
  recipient_name: 'Ana Torres',
  recipient_document_type: 'dni',
  recipient_document_number: '12345678',
  recipient_phone: '987654321',
  address_line: 'Av. Siempre Viva 742',
  district: 'Miraflores',
  city: 'Lima',
  department: 'Lima',
  reference: 'Portón azul',
  carrier: null,
  carrier_name: '',
  agency_name: '',
  agency_locality: '',
  is_default: true,
};

function load(
  options: {
    slug?: string | null;
    result?: unknown;
    makeError?: (ApiError: typeof import('@/api/errors').ApiError) => Error;
  } = {},
) {
  let thrown: Error | null = null;
  const send = jest.fn(async (..._args: unknown[]) => {
    if (thrown) throw thrown;
    return options.result ?? PROFILE_ROW;
  });

  let profile!: Profile;
  let addresses!: Addresses;
  jest.isolateModules(() => {
    jest.doMock('@/api/authenticated-request', () => ({
      authenticatedRequest: (path: string, opts: unknown, d: unknown) => send(path, opts, d),
    }));
    jest.doMock('@/config/env', () => ({
      ...jest.requireActual('@/config/env'),
      companySlug: options.slug === undefined ? 'blackdog' : options.slug,
      apiBaseUrl: BASE,
      isApiConfigured: true,
    }));
    const { ApiError } = require('@/api/errors');
    if (options.makeError) thrown = options.makeError(ApiError);
    profile = require('@/api/endpoints/customer-profile-v1');
    addresses = require('@/api/endpoints/customer-addresses-v1');
  });

  return { profile, addresses, send, deps: DEPS };
}

afterEach(() => {
  jest.resetModules();
  jest.dontMock('@/api/authenticated-request');
  jest.dontMock('@/config/env');
});

describe('my own record', () => {
  it('reads it on the customer surface of this company', async () => {
    const { profile, send, deps } = load();

    await profile.fetchCustomerProfile(deps);

    expect(send.mock.calls[0]![0]).toBe('/api/v1/customer/blackdog/profile/');
    expect(String(send.mock.calls[0]![0])).not.toMatch(/\/api\/admin\//);
  });

  it('maps the five fields plus what is known of the address', async () => {
    const { profile, deps } = load();

    expect(await profile.fetchCustomerProfile(deps)).toEqual({
      email: 'ana@example.test',
      emailVerifiedAt: null,
      emailVerificationAvailable: true,
      firstName: 'Ana',
      lastName: 'Torres',
      phone: '987654321',
      documentType: 'dni',
      documentNumber: '12345678',
      documentLocked: false,
    });
  });

  it('treats a missing lock as LOCKED', async () => {
    // The safe default is not offering to edit a document the shop may own.
    const { profile, deps } = load({
      result: { ...PROFILE_ROW, document_locked: undefined },
    });

    expect((await profile.fetchCustomerProfile(deps)).documentLocked).toBe(true);
  });

  it('treats a missing verification flag as unavailable', async () => {
    // Offering a code the server would refuse teaches people the button is broken.
    const { profile, deps } = load({
      result: { ...PROFILE_ROW, email_verification_available: undefined },
    });

    expect((await profile.fetchCustomerProfile(deps)).emailVerificationAvailable).toBe(false);
  });

  it('reads an unknown document type as none at all', async () => {
    // Showing «DNI» for something the server called something else would
    // misdescribe somebody's identity.
    const { profile, deps } = load({ result: { ...PROFILE_ROW, document_type: 'passport' } });

    expect((await profile.fetchCustomerProfile(deps)).documentType).toBe('');
  });
});

describe('saving my record', () => {
  it('sends only the fields that changed', async () => {
    // The server KEEPS any field the body omits, so a full form would
    // overwrite a phone corrected at the counter a minute ago.
    const { profile, send, deps } = load();

    await profile.updateCustomerProfile({ firstName: 'Ana María' }, deps);

    const options = send.mock.calls[0]![1] as { method: string; body: Record<string, unknown> };
    expect(options.method).toBe('PATCH');
    expect(options.body).toEqual({ first_name: 'Ana María' });
  });

  it('sends the document as a pair, because the server judges it as one', async () => {
    const { profile, send, deps } = load();

    await profile.updateCustomerProfile({ documentType: 'ruc' }, deps);

    expect((send.mock.calls[0]![1] as { body: Record<string, unknown> }).body).toEqual({
      document_type: 'ruc',
      document_number: '',
    });
  });

  it('can clear the document by sending both empty', async () => {
    const { profile, send, deps } = load();

    await profile.updateCustomerProfile({ documentType: '', documentNumber: '' }, deps);

    expect((send.mock.calls[0]![1] as { body: Record<string, unknown> }).body).toEqual({
      document_type: '',
      document_number: '',
    });
  });

  it('answers with the record as it now stands', async () => {
    // The server normalises a phone and may keep the document locked, so the
    // answer — not the request — is what the form is re-seeded from.
    const { profile, deps } = load({
      result: { ...PROFILE_ROW, phone: '+51987654321', document_locked: true },
    });

    const saved = await profile.updateCustomerProfile({ phone: '+51 987 654 321' }, deps);

    expect(saved.phone).toBe('+51987654321');
    expect(saved.documentLocked).toBe(true);
  });

  it('refuses to guess a tenant', async () => {
    const { profile, send, deps } = load({ slug: null });

    await expect(profile.fetchCustomerProfile(deps)).rejects.toMatchObject({
      name: 'MissingTenantError',
    });
    expect(send).not.toHaveBeenCalled();
  });
});

describe('proving my own address', () => {
  it('never sends an address: the server reads it from the session', async () => {
    const { profile, send, deps } = load({ result: { detail: 'Código enviado.' } });

    await profile.sendOwnEmailCode(deps);

    const [path, options] = send.mock.calls[0]! as [string, { method: string; body: unknown }];
    expect(path).toBe('/api/v1/customer/blackdog/verify-email/send/');
    expect(options.method).toBe('POST');
    expect(options.body).toEqual({});
  });

  it('reads «already verified» as an answer, not a failure', async () => {
    const { profile, deps } = load({
      result: {
        detail: 'Tu correo ya está verificado.',
        already_verified: true,
        email_verified_at: '2026-10-19T12:00:00Z',
      },
    });

    expect(await profile.sendOwnEmailCode(deps)).toEqual({
      detail: 'Tu correo ya está verificado.',
      alreadyVerified: true,
      emailVerifiedAt: '2026-10-19T12:00:00Z',
    });
  });

  it('recognises the throttle, which is information rather than an error', async () => {
    // One a minute and five a day, counted on the account.
    const { profile, deps } = load({
      makeError: (ApiError) =>
        new ApiError('rate_limited', 'Ya te enviamos un código hace poco.', { status: 429 }),
    });

    await expect(profile.sendOwnEmailCode(deps)).rejects.toMatchObject({ status: 429 });
    try {
      await profile.sendOwnEmailCode(deps);
    } catch (error) {
      expect(profile.isEmailCodeThrottled(error)).toBe(true);
    }
  });

  it('hands the code back trimmed, and nothing else', async () => {
    const { profile, send, deps } = load({ result: { detail: 'Correo verificado.' } });

    await profile.confirmOwnEmailCode('  123456 ', deps);

    const [path, options] = send.mock.calls[0]! as [string, { body: Record<string, unknown> }];
    expect(path).toBe('/api/v1/customer/blackdog/verify-email/confirm/');
    expect(options.body).toEqual({ code: '123456' });
  });
});

describe('my address book', () => {
  const BOOK = {
    results: [ADDRESS_ROW],
    limit: 10,
    agency_carriers: [{ id: 3, name: 'Shalom' }],
  };

  it('reads the book, the shop limit and the agencies it offers today', async () => {
    const { addresses, send, deps } = load({ result: BOOK });

    const book = await addresses.fetchAddressBook(deps);

    expect(send.mock.calls[0]![0]).toBe('/api/v1/customer/blackdog/addresses/');
    expect(book.limit).toBe(10);
    expect(book.agencyCarriers).toEqual([{ id: 3, name: 'Shalom' }]);
    expect(book.entries[0]).toMatchObject({
      id: 7,
      kind: 'address',
      addressLine: 'Av. Siempre Viva 742',
      isDefault: true,
      carrier: null,
    });
  });

  it('drops a carrier with no usable id rather than offering it', async () => {
    // Offering a name somebody can pick, that the save then refuses, is worse
    // than not offering it.
    const { addresses, deps } = load({
      result: { ...BOOK, agency_carriers: [{ name: 'Sin id' }, { id: 3, name: 'Shalom' }] },
    });

    expect((await addresses.fetchAddressBook(deps)).agencyCarriers).toEqual([
      { id: 3, name: 'Shalom' },
    ]);
  });

  it('reads anything but the server word for an agency as a door', async () => {
    const { addresses, deps } = load({
      result: { ...BOOK, results: [{ ...ADDRESS_ROW, kind: 'warehouse' }] },
    });

    expect((await addresses.fetchAddressBook(deps)).entries[0]!.kind).toBe('address');
  });

  it('adds an entry with the fields of its kind', async () => {
    const { addresses, send, deps } = load({ result: ADDRESS_ROW });

    await addresses.createAddress(
      {
        kind: 'address',
        recipientName: 'Ana Torres',
        addressLine: 'Av. Siempre Viva 742',
        district: 'Miraflores',
        city: 'Lima',
      },
      deps,
    );

    const [path, options] = send.mock.calls[0]! as [string, { method: string; body: Record<string, unknown> }];
    expect(path).toBe('/api/v1/customer/blackdog/addresses/');
    expect(options.method).toBe('POST');
    expect(options.body).toEqual({
      kind: 'address',
      recipient_name: 'Ana Torres',
      address_line: 'Av. Siempre Viva 742',
      district: 'Miraflores',
      city: 'Lima',
    });
  });

  it('names a carrier by the id the server published, never by text', async () => {
    const { addresses, send, deps } = load({ result: ADDRESS_ROW });

    await addresses.createAddress(
      {
        kind: 'agency',
        recipientName: 'Ana Torres',
        agencyName: 'Shalom Centro',
        agencyLocality: 'Trujillo',
        carrier: 3,
      },
      deps,
    );

    const body = (send.mock.calls[0]![1] as { body: Record<string, unknown> }).body;
    expect(body.carrier).toBe(3);
    expect(body).not.toHaveProperty('carrier_name');
  });

  it('corrects only what a caller passed', async () => {
    const { addresses, send, deps } = load({ result: ADDRESS_ROW });

    await addresses.updateAddress(7, { label: 'Casa de mi madre' }, deps);

    const [path, options] = send.mock.calls[0]! as [string, { method: string; body: unknown }];
    expect(path).toBe('/api/v1/customer/blackdog/addresses/7/');
    expect(options.method).toBe('PATCH');
    expect(options.body).toEqual({ label: 'Casa de mi madre' });
  });

  it('removes an entry and expects nothing back', async () => {
    const { addresses, send, deps } = load({ result: undefined });

    await addresses.removeAddress(7, deps);

    const options = send.mock.calls[0]![1] as { method: string };
    expect(options.method).toBe('DELETE');
    expect(send.mock.calls[0]![0]).toBe('/api/v1/customer/blackdog/addresses/7/');
  });

  it('asks the server to move the default rather than moving it here', async () => {
    // Exactly one active entry can be the default, enforced in the database.
    const { addresses, send, deps } = load({ result: { ...ADDRESS_ROW, is_default: true } });

    const entry = await addresses.setDefaultAddress(7, deps);

    expect(send.mock.calls[0]![0]).toBe('/api/v1/customer/blackdog/addresses/7/default/');
    expect((send.mock.calls[0]![1] as { method: string }).method).toBe('POST');
    expect(entry.isDefault).toBe(true);
  });

  it('keeps the shop sentence when the book is full', async () => {
    const { addresses, deps } = load({
      makeError: (ApiError) =>
        new ApiError('validation', 'Puedes guardar hasta 10 direcciones. Quita una para agregar otra.', {
          status: 400,
        }),
    });

    await expect(addresses.createAddress({ recipientName: 'Ana' }, deps)).rejects.toMatchObject({
      message: 'Puedes guardar hasta 10 direcciones. Quita una para agregar otra.',
    });
  });

  it('keeps the shop sentence when the record has no name yet', async () => {
    // The first entry of a book makes its owner a client of the shop.
    const { addresses, deps } = load({
      makeError: (ApiError) =>
        new ApiError('validation', 'Completa tu nombre en «Mi cuenta» antes de guardar una dirección.', {
          status: 400,
        }),
    });

    await expect(addresses.createAddress({ recipientName: 'Ana' }, deps)).rejects.toMatchObject({
      message: expect.stringContaining('Completa tu nombre'),
    });
  });

  it('refuses to guess a tenant', async () => {
    const { addresses, send, deps } = load({ slug: null });

    await expect(addresses.fetchAddressBook(deps)).rejects.toMatchObject({
      name: 'MissingTenantError',
    });
    expect(send).not.toHaveBeenCalled();
  });
});

describe('what the phone checks before asking the server', () => {
  it('accepts the three ways a Peruvian mobile is written', () => {
    for (const value of ['987654321', '+51987654321', '+51 987 654 321', '51987654321']) {
      expect(isPlausibleCustomerPhone(value)).toBe(true);
    }
  });

  it('accepts no phone at all, which is a legitimate answer', () => {
    expect(isPlausibleCustomerPhone('')).toBe(true);
  });

  it('refuses a landline or a truncated number', () => {
    for (const value of ['12345678', '98765432', 'abc']) {
      expect(isPlausibleCustomerPhone(value)).toBe(false);
    }
  });

  it('mirrors the document SHAPES and leaves the arithmetic to the server', () => {
    expect(DOCUMENT_PATTERNS.dni.test('12345678')).toBe(true);
    expect(DOCUMENT_PATTERNS.dni.test('1234567')).toBe(false);
    expect(DOCUMENT_PATTERNS.ruc.test('20123456789')).toBe(true);
    expect(DOCUMENT_PATTERNS.ce.test('AB1234')).toBe(true);
    expect(CUSTOMER_DOCUMENT_TYPES).toEqual(['dni', 'ruc', 'ce']);
  });

  it('computes no RUC check digit', () => {
    // Module 11 with its weights is the server's authority on which RUC
    // exists; a second implementation here would be a second answer.
    const fs = jest.requireActual('fs') as { readFileSync(p: string, e: 'utf8'): string };
    const source = fs.readFileSync('src/domain/customer/profile-types.ts', 'utf8');

    expect(source).not.toContain('11 -');
    expect(source).not.toContain('weights');
  });
});
