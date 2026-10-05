/**
 * DEVICE-IDENTITY — one device and every visit it has made; plus the one
 * editable field of a repair photo.
 *
 * Contract on `PapiCuche/BlackDogStore-web` @ `origin/master`
 * `aec829c697674efb61f9776a4f796bfc05663ddc`:
 *
 *   GET   service/devices/<id>/                     `service.devices.view`
 *   PATCH service/orders/<id>/evidence/<id>/         the photo's STAGE capability
 *
 * The visit list is the point of the first one: a count says "2", and a
 * technician needs March. The second is deliberately narrow — the server
 * accepts `caption` and nothing else, because editing a stage would relabel
 * evidence after the fact and visibility is its own audited act.
 */
import { EVIDENCE_CAPTION_MAX_LENGTH } from '@/domain/internal/evidence-types';

const BASE = 'https://api.example.test';
const DEPS = { refreshCoordinator: {} as never };

const DEVICE = {
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
  notes: 'Trae funda azul.',
  created_at: '2026-03-02T10:00:00Z',
  updated_at: '2026-03-02T10:00:00Z',
  repair_orders_count: 2,
  last_repair_order: { id: 55, status: 'delivered', status_label: 'Entregado', created_at: '2026-03-02T10:00:00Z' },
  repair_orders: [
    { id: 61, number: 'SRV-61', status: 'in_repair', received_at: '2026-10-01T09:00:00Z' },
    { id: 55, number: 'SRV-55', status: 'delivered', received_at: '2026-03-02T10:00:00Z' },
  ],
};

function load(
  module: 'service' | 'evidence',
  options: {
    slug?: string | null;
    result?: unknown;
    makeError?: (ApiError: typeof import('@/api/errors').ApiError) => Error;
  } = {},
) {
  let thrown: Error | null = null;
  const send = jest.fn(async (..._args: unknown[]) => {
    if (thrown) throw thrown;
    return options.result ?? DEVICE;
  });

  let loaded!: typeof import('@/api/endpoints/internal-service-v1')
    & typeof import('@/api/endpoints/internal-service-evidence-v1');

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
    loaded = module === 'service'
      ? require('@/api/endpoints/internal-service-v1')
      : require('@/api/endpoints/internal-service-evidence-v1');
  });

  return { module: loaded, send };
}

afterEach(() => {
  jest.resetModules();
  jest.dontMock('@/api/authenticated-request');
  jest.dontMock('@/config/env');
});

describe('one device, with its visits', () => {
  it('reads the device route of this company', async () => {
    const { module, send } = load('service');

    await module.fetchServiceDeviceDetail(9, DEPS);

    expect(send.mock.calls[0]![0]).toBe('/api/v1/internal/blackdog/service/devices/9/');
    expect(String(send.mock.calls[0]![0])).not.toMatch(/\/api\/admin\//);
  });

  it('keeps the visits in the order the server sent them', async () => {
    // Newest first is the server's ordering, and re-sorting here would be a
    // second answer to a question it already answered.
    const { module } = load('service');

    const device = await module.fetchServiceDeviceDetail(9, DEPS);

    expect(device.repairOrders.map((v) => v.number)).toEqual(['SRV-61', 'SRV-55']);
    expect(device.repairOrders[0]).toEqual({
      id: 61,
      number: 'SRV-61',
      status: 'in_repair',
      receivedAt: '2026-10-01T09:00:00Z',
    });
  });

  it('carries the identity fields the counter reads off the device', async () => {
    const { module } = load('service');

    const device = await module.fetchServiceDeviceDetail(9, DEPS);

    expect(device.serialNumber).toBe('F17GQ0ABCD');
    expect(device.imei).toBe('356938035643809');
    expect(device.repairOrdersCount).toBe(2);
  });

  it('reads a first-time device as an empty visit list', async () => {
    const { module } = load('service', {
      result: { ...DEVICE, repair_orders: [], repair_orders_count: 0, last_repair_order: null },
    });

    const device = await module.fetchServiceDeviceDetail(9, DEPS);

    expect(device.repairOrders).toEqual([]);
    expect(device.repairOrdersCount).toBe(0);
  });

  it('turns a 404 into out of scope: that device is another company’s', async () => {
    const { module } = load('service', {
      makeError: (ApiError) => new ApiError('not_found', 'No encontrado.', { status: 404 }),
    });

    await expect(module.fetchServiceDeviceDetail(9, DEPS)).rejects.toBeInstanceOf(Error);
  });

  it('turns a 403 into a missing capability', async () => {
    const { module } = load('service', {
      makeError: (ApiError) => new ApiError('unauthorized', 'No permitido.', { status: 403 }),
    });

    await expect(module.fetchServiceDeviceDetail(9, DEPS)).rejects.toMatchObject({
      name: 'InternalCapabilityMissingError',
    });
  });
});

describe('the note is the only editable field', () => {
  const PHOTO = {
    id: 31,
    stage: 'quality',
    caption: 'Prueba de carga OK',
    visibility: 'internal',
    mime_type: 'image/jpeg',
    byte_size: 1,
    width: 1,
    height: 1,
    created_at: 'x',
    uploaded_by: 'tecnico1',
    voided_at: null,
    void_reason: null,
  };

  it('PATCHes the caption and nothing else', async () => {
    const { module, send } = load('evidence', { result: { ...PHOTO, caption: 'Corregida' } });

    const updated = await module.updateInternalEvidenceCaption(77, 31, 'Corregida', DEPS);

    expect(send.mock.calls[0]![0]).toBe(
      '/api/v1/internal/blackdog/service/orders/77/evidence/31/',
    );
    const options = send.mock.calls[0]![1] as { method: string; body: Record<string, unknown> };
    expect(options.method).toBe('PATCH');
    expect(options.body).toEqual({ caption: 'Corregida' });
    expect(updated.caption).toBe('Corregida');
  });

  it('sends an EMPTY note as given, because clearing it is a correction', async () => {
    const { module, send } = load('evidence', { result: { ...PHOTO, caption: '' } });

    await module.updateInternalEvidenceCaption(77, 31, '', DEPS);

    expect((send.mock.calls[0]![1] as { body: unknown }).body).toEqual({ caption: '' });
  });

  it('never sends a stage or a visibility', async () => {
    const { module, send } = load('evidence', { result: PHOTO });

    await module.updateInternalEvidenceCaption(77, 31, 'x', DEPS);

    const body = (send.mock.calls[0]![1] as { body: Record<string, unknown> }).body;
    for (const owned of ['stage', 'visibility', 'voided_at', 'uploaded_by']) {
      expect(body).not.toHaveProperty(owned);
    }
  });

  it('surfaces the length refusal with the server sentence', async () => {
    const { module } = load('evidence', {
      makeError: (ApiError) =>
        new ApiError('validation', 'La nota admite hasta 300 caracteres.', { status: 400 }),
    });

    await expect(
      module.updateInternalEvidenceCaption(77, 31, 'x'.repeat(400), DEPS),
    ).rejects.toMatchObject({ message: 'La nota admite hasta 300 caracteres.' });
  });

  it('caps the note where the server caps it', () => {
    expect(EVIDENCE_CAPTION_MAX_LENGTH).toBe(300);
  });
});
