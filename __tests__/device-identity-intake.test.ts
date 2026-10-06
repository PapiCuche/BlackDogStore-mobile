/**
 * DEVICE-IDENTITY — what identifies a device, and when it is required.
 *
 * Contract on `PapiCuche/BlackDogStore-web` @ `origin/master`
 * `aec829c697674efb61f9776a4f796bfc05663ddc` (`store/device_identity.py`,
 * `store/v1_service_serializers.py`). CAUGHT AGAINST A LIVE SERVER, not by a
 * test: creating a phone without an IMEI answers
 *
 *   400 {"serial_number": ["Indica el número de serie. Si no se puede leer,
 *        explica por qué en «Motivo por el que falta»."],
 *        "imei": ["Un teléfono lleva IMEI. …"]}
 *
 * and the app was still labelling both fields «opcional», with no field for
 * the reason the server asks for.
 *
 * THE RULE IS BY TYPE, NOT «IMEI ALWAYS». A laptop, a Wi-Fi tablet or a watch
 * has none, and demanding one fills the database with placeholders.
 *
 * EMPTY MEANS «HAS NONE». Never «N/A», never a number that fails its check
 * digit: those are fake data that later read as duplicates of real devices.
 */
import {
  DEVICE_PENDING_REASON_MAX_LENGTH,
  deviceRequiresImei,
  deviceRequiresSerial,
  isIdentifierPlaceholder,
  isPlausibleImei,
} from '@/domain/internal/service-types';

const BASE = 'https://api.example.test';
const DEPS = { refreshCoordinator: {} as never };

type Loaded = typeof import('@/api/endpoints/internal-service-v1');

function load(options: { result?: unknown } = {}) {
  const send = jest.fn(async (..._args: unknown[]) => options.result ?? { id: 9 });
  let module!: Loaded;
  jest.isolateModules(() => {
    jest.doMock('@/api/authenticated-request', () => ({
      authenticatedRequest: (path: string, opts: unknown, d: unknown) => send(path, opts, d),
    }));
    jest.doMock('@/config/env', () => ({
      ...jest.requireActual('@/config/env'),
      companySlug: 'blackdog',
      apiBaseUrl: BASE,
      isApiConfigured: true,
    }));
    module = require('@/api/endpoints/internal-service-v1');
  });
  return { module, send };
}

afterEach(() => {
  jest.resetModules();
  jest.dontMock('@/api/authenticated-request');
  jest.dontMock('@/config/env');
});

describe('which identifier each type demands', () => {
  it('asks a phone for both, and only a phone for an IMEI', () => {
    expect(deviceRequiresSerial('phone')).toBe(true);
    expect(deviceRequiresImei('phone')).toBe(true);
    for (const type of ['tablet', 'laptop', 'desktop', 'console', 'wearable']) {
      expect(deviceRequiresSerial(type)).toBe(true);
      expect(deviceRequiresImei(type)).toBe(false);
    }
  });

  it('asks nothing of a type the rule does not name', () => {
    // `device_identity` decides by TYPE and knows no brands; an unlisted type
    // is not quietly treated as a phone.
    expect(deviceRequiresSerial('other')).toBe(false);
    expect(deviceRequiresImei('other')).toBe(false);
  });
});

describe('what counts as a real identifier', () => {
  it('rejects what people type when they have no data', () => {
    for (const fake of ['N/A', 'na', 'sin serie', 'S/N', 'XXXX', 'pendiente', 'ILEGIBLE']) {
      expect(isIdentifierPlaceholder(fake)).toBe(true);
    }
  });

  it('accepts a real-looking serial, and says nothing about an empty one', () => {
    expect(isIdentifierPlaceholder('F17GQ0ABCD')).toBe(false);
    expect(isIdentifierPlaceholder('')).toBe(false);
    expect(isIdentifierPlaceholder('   ')).toBe(false);
  });

  it('checks an IMEI against its own check digit', () => {
    expect(isPlausibleImei('356938035643809')).toBe(true);
    // Same number with the last digit changed: fifteen digits, still wrong.
    expect(isPlausibleImei('356938035643801')).toBe(false);
    expect(isPlausibleImei('35693803564380')).toBe(false);
    expect(isPlausibleImei('')).toBe(false);
  });

  it('counts an IMEI the way the server does, ignoring punctuation', () => {
    expect(isPlausibleImei('35-69-380-356-43809')).toBe(true);
  });

  it('caps the reason where the server caps it', () => {
    expect(DEVICE_PENDING_REASON_MAX_LENGTH).toBe(200);
  });
});

describe('what the client sends', () => {
  it('carries the second IMEI and the pending reason', async () => {
    const { module, send } = load();

    await module.postServiceDevice(
      {
        customerId: 4,
        deviceType: 'phone',
        brand: 'Apple',
        model: 'iPhone 13',
        imei: '356938035643809',
        imei2: '356938035643817',
        identifiersPendingReason: 'La etiqueta está borrada.',
      },
      DEPS,
    );

    const body = (send.mock.calls[0]![1] as { body: Record<string, unknown> }).body;
    expect(body.imei).toBe('356938035643809');
    expect(body.imei2).toBe('356938035643817');
    expect(body.identifiers_pending_reason).toBe('La etiqueta está borrada.');
  });

  it('omits what was not filled rather than sending empty strings', async () => {
    // An absent identifier means "has none"; `''` would be a value.
    const { module, send } = load();

    await module.postServiceDevice(
      { customerId: 4, deviceType: 'laptop', brand: 'Dell', model: 'XPS' },
      DEPS,
    );

    const body = (send.mock.calls[0]![1] as { body: Record<string, unknown> }).body;
    for (const key of ['serial_number', 'imei', 'imei2', 'identifiers_pending_reason']) {
      expect(body).not.toHaveProperty(key);
    }
  });

  it('reads both identifiers and the reason back off a device', async () => {
    const { module } = load({
      result: {
        id: 9,
        customer: 4,
        device_type: 'phone',
        brand: 'Apple',
        model: 'iPhone 13',
        serial_number: '',
        imei: '356938035643809',
        imei2: '356938035643817',
        identifiers_pending_reason: 'Etiqueta borrada.',
      },
    });

    const created = await module.postServiceDevice(
      { customerId: 4, deviceType: 'phone', brand: 'Apple', model: 'iPhone 13' },
      DEPS,
    );

    expect(created.imei2).toBe('356938035643817');
    expect(created.identifiersPendingReason).toBe('Etiqueta borrada.');
    expect(created.serialNumber).toBe('');
  });
});
