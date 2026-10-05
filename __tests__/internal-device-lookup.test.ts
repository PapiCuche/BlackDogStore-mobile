/**
 * DEVICE-IDENTITY and POS-SVC-01 — the two questions the counter asks BEFORE
 * an order exists.
 *
 * Contract on `PapiCuche/BlackDogStore-web` @ `origin/master`
 * `aec829c697674efb61f9776a4f796bfc05663ddc`:
 *
 *   GET service/devices/lookup/?serial_number=&imei=&imei2=   `service.devices.view`
 *   GET service/technicians/?branch_id=                       assignment authority
 *
 * MATCHING IS EXACT AND COMPANY-SCOPED. What another company holds is NOT
 * FOUND — not hidden, not fuzzily matched — so a serial cannot be used to ask
 * whether a competitor ever serviced a device.
 *
 * THE LOOKUP IS FORGIVING ON PURPOSE. The server normalises and then ignores a
 * value too short to mean anything, because validation belongs to saving and a
 * lookup that errored on a half-typed IMEI would help nobody. The client
 * mirrors that rule only to stay QUIET, never to decide validity.
 */
import {
  DEVICE_IMEI_LENGTH,
  DEVICE_SERIAL_MIN_LENGTH,
  isDeviceLookupWorthAsking,
  normaliseDeviceImei,
  normaliseDeviceSerial,
} from '@/domain/internal/service-types';

const BASE = 'https://api.example.test';
const DEPS = { refreshCoordinator: {} as never };

type Loaded = typeof import('@/api/endpoints/internal-service-v1');

const MATCH = {
  id: 9,
  customer: 4,
  customer_name: 'Ana Torres',
  device_type: 'smartphone',
  device_type_label: 'Smartphone',
  brand: 'Apple',
  model: 'iPhone 13',
  display_name: 'Apple iPhone 13',
  serial_number: 'F17GQ0ABCD',
  imei: '356938035643809',
  color: 'Negro',
  storage_capacity: '128 GB',
  notes: '',
  created_at: '2026-03-02T10:00:00Z',
  updated_at: '2026-03-02T10:00:00Z',
  repair_orders_count: 2,
  last_repair_order: {
    id: 55,
    status: 'delivered',
    status_label: 'Entregado',
    created_at: '2026-03-02T10:00:00Z',
  },
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
    return options.result ?? { results: [MATCH] };
  });

  let module!: Loaded;
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
    module = require('@/api/endpoints/internal-service-v1');
  });

  return { module, send };
}

afterEach(() => {
  jest.resetModules();
  jest.dontMock('@/api/authenticated-request');
  jest.dontMock('@/config/env');
});

describe('the lookup', () => {
  it('asks the device lookup route of this company', async () => {
    const { module, send } = load();

    await module.lookupServiceDevices({ serialNumber: 'F17GQ0ABCD' }, DEPS);

    expect(send.mock.calls[0]![0]).toBe('/api/v1/internal/blackdog/service/devices/lookup/');
    expect(String(send.mock.calls[0]![0])).not.toMatch(/\/api\/admin\//);
  });

  it('sends the three identifiers in the server vocabulary', async () => {
    const { module, send } = load();

    await module.lookupServiceDevices(
      { serialNumber: 'F17GQ0ABCD', imei: '356938035643809', imei2: '356938035643810' },
      DEPS,
    );

    const query = (send.mock.calls[0]![1] as { query: Record<string, unknown> }).query;
    expect(query).toEqual({
      serial_number: 'F17GQ0ABCD',
      imei: '356938035643809',
      imei2: '356938035643810',
    });
  });

  it('omits what was not typed rather than sending empty strings', async () => {
    const { module, send } = load();

    await module.lookupServiceDevices({ serialNumber: '  ABC123  ', imei: '   ' }, DEPS);

    const query = (send.mock.calls[0]![1] as { query: Record<string, unknown> }).query;
    expect(query).toEqual({ serial_number: 'ABC123' });
  });

  it('maps a match WITH the history that makes it useful', async () => {
    const { module } = load();

    const [match] = await module.lookupServiceDevices({ serialNumber: 'F17GQ0ABCD' }, DEPS);

    expect(match!.id).toBe(9);
    expect(match!.customer).toBe(4);
    expect(match!.displayName).toBe('Apple iPhone 13');
    expect(match!.repairOrdersCount).toBe(2);
    expect(match!.lastRepairOrder).toEqual({
      id: 55,
      status: 'delivered',
      statusLabel: 'Entregado',
      createdAt: '2026-03-02T10:00:00Z',
    });
  });

  it('reads a device with no history as zero and null, not as missing', async () => {
    const { module } = load({
      result: { results: [{ ...MATCH, repair_orders_count: 0, last_repair_order: null }] },
    });

    const [match] = await module.lookupServiceDevices({ imei: '356938035643809' }, DEPS);

    expect(match!.repairOrdersCount).toBe(0);
    expect(match!.lastRepairOrder).toBeNull();
  });

  it('reads an empty result as "never seen it", which is a normal answer', async () => {
    const { module } = load({ result: { results: [] } });

    expect(await module.lookupServiceDevices({ serialNumber: 'NADA' }, DEPS)).toEqual([]);
  });

  it('turns a 403 into a missing capability', async () => {
    const { module } = load({
      makeError: (ApiError) => new ApiError('unauthorized', 'No permitido.', { status: 403 }),
    });

    await expect(
      module.lookupServiceDevices({ serialNumber: 'ABC123' }, DEPS),
    ).rejects.toMatchObject({ name: 'InternalCapabilityMissingError' });
  });

  it('refuses to guess a tenant', async () => {
    const { module, send } = load({ slug: null });

    await expect(
      module.lookupServiceDevices({ serialNumber: 'ABC123' }, DEPS),
    ).rejects.toMatchObject({ name: 'MissingTenantError' });
    expect(send).not.toHaveBeenCalled();
  });
});

describe('when it is worth asking at all', () => {
  it('mirrors the lengths the server will actually match on', () => {
    expect(DEVICE_SERIAL_MIN_LENGTH).toBe(4);
    expect(DEVICE_IMEI_LENGTH).toBe(15);
  });

  it('stays quiet while there is too little typed', () => {
    expect(isDeviceLookupWorthAsking({ serialNumber: 'AB' })).toBe(false);
    expect(isDeviceLookupWorthAsking({ imei: '35693' })).toBe(false);
    expect(isDeviceLookupWorthAsking({})).toBe(false);
  });

  it('asks as soon as either identifier can match', () => {
    expect(isDeviceLookupWorthAsking({ serialNumber: 'ABCD' })).toBe(true);
    expect(isDeviceLookupWorthAsking({ imei: '356938035643809' })).toBe(true);
  });

  it('counts what the server would count, not raw characters', () => {
    // The server upper-cases and strips spaces from a serial and keeps only
    // digits of an IMEI, so a spaced-out number is asked for, and a 14-digit
    // one with dashes is not.
    expect(normaliseDeviceSerial('  f17 gq0  ')).toBe('F17GQ0');
    expect(normaliseDeviceImei('35-69-380-356-43809')).toBe('356938035643809');
    expect(isDeviceLookupWorthAsking({ imei: '35-69-380-356-43809' })).toBe(true);
    expect(isDeviceLookupWorthAsking({ imei: '3569380356438' })).toBe(false);
  });
});

describe('who may take the device', () => {
  it('asks the technicians route for one branch', async () => {
    const { module, send } = load({ result: { candidates: [{ id: 3, name: 'Luis' }] } });

    const candidates = await module.fetchServiceTechnicianCandidates(2, DEPS);

    expect(send.mock.calls[0]![0]).toBe('/api/v1/internal/blackdog/service/technicians/');
    expect((send.mock.calls[0]![1] as { query: Record<string, unknown> }).query).toEqual({
      branch_id: 2,
    });
    expect(candidates).toEqual([{ id: 3, name: 'Luis' }]);
  });

  it('reads an empty list as "nobody here can take it"', async () => {
    const { module } = load({ result: { candidates: [] } });

    expect(await module.fetchServiceTechnicianCandidates(2, DEPS)).toEqual([]);
  });

  it('turns a 404 into out of scope: that branch is not the caller’s', async () => {
    const { module } = load({
      makeError: (ApiError) => new ApiError('not_found', 'No encontrado.', { status: 404 }),
    });

    await expect(module.fetchServiceTechnicianCandidates(99, DEPS)).rejects.toBeInstanceOf(Error);
  });
});
