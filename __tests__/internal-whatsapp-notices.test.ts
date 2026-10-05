/**
 * WHATSAPP-NOTIFY — what the customer was told about a repair, whether it
 * arrived, and whether the shop may message them at all.
 *
 * Contract on `PapiCuche/BlackDogStore-web` @ `origin/master`
 * `aec829c697674efb61f9776a4f796bfc05663ddc`
 * (`store/whatsapp_views.py`, `store/v1_service_serializers.py`):
 *
 *   order payload `customer_notifications`   per-channel delivery state
 *   POST .../notifications/<id>/whatsapp/retry/   `service.orders.manage`
 *   POST service/customers/<id>/whatsapp-consent/ `service.customers.manage`
 *
 * TWO RULES THIS FILE EXISTS FOR:
 *
 *  - a status is READ from the delivery rows, never inferred. `sent` means a
 *    provider took the message; an unknown word must not become `delivered`,
 *    because that is a claim about the customer having been told.
 *  - a phone number on file is NOT consent. Absent consent reads as `false`,
 *    and recording it is a deliberate act with a date and an author.
 */
import {
  describeDeliveryStatus,
  mayRetryWhatsApp,
  type CustomerNotice,
} from '@/domain/internal/service-types';

const BASE = 'https://api.example.test';
const DEPS = { refreshCoordinator: {} as never };

type Loaded = typeof import('@/api/endpoints/internal-service-v1');

const NOTICE = {
  id: 88,
  title: 'Tu equipo está listo',
  created_at: '2026-10-04T15:00:00Z',
  email_status: 'sent',
  whatsapp_status: 'failed',
  whatsapp_detail: 'El número no tiene WhatsApp.',
  whatsapp_recipient: '+51 9•• ••• 123',
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
    return options.result ?? NOTICE;
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

describe('the notices already in the order payload', () => {
  it('maps each channel state as the server reported it', () => {
    const { module } = load();

    const notice = module.toCustomerNotice(NOTICE);

    expect(notice).toEqual({
      id: 88,
      title: 'Tu equipo está listo',
      createdAt: '2026-10-04T15:00:00Z',
      emailStatus: 'sent',
      whatsappStatus: 'failed',
      whatsappDetail: 'El número no tiene WhatsApp.',
      whatsappRecipient: '+51 9•• ••• 123',
    });
  });

  it('reads an unknown status as NOT APPLICABLE, never as delivered', () => {
    // Telling an operator a message arrived is a claim about the customer
    // having been told. The safe reading is "this channel was not part of it".
    const { module } = load();

    const notice = module.toCustomerNotice({
      ...NOTICE,
      email_status: 'teleported',
      whatsapp_status: 'quantum',
    });

    expect(notice.emailStatus).toBe('not_applicable');
    expect(notice.whatsappStatus).toBe('not_applicable');
  });

  it('keeps an absent recipient and reason as null', () => {
    const { module } = load();

    const notice = module.toCustomerNotice({
      ...NOTICE,
      whatsapp_detail: null,
      whatsapp_recipient: null,
    });

    expect(notice.whatsappDetail).toBeNull();
    expect(notice.whatsappRecipient).toBeNull();
  });

  it('carries no message body, template or credential', () => {
    const { module } = load();

    const notice = module.toCustomerNotice({
      ...NOTICE,
      body: 'Hola, tu equipo…',
      template: 'repair_ready',
      provider_token: 'secret',
    });

    expect(JSON.stringify(notice)).not.toContain('Hola');
    expect(notice).not.toHaveProperty('template');
    expect(notice).not.toHaveProperty('providerToken');
  });

  it('reads the notices out of the order detail', async () => {
    const { module } = load({
      result: {
        id: 77,
        number: 'SRV-77',
        status: 'ready',
        status_label: 'Listo',
        customer: 4,
        customer_notifications: [NOTICE],
      },
    });

    const order = await module.fetchServiceOrder(77, DEPS);

    expect(order.customerNotices).toHaveLength(1);
    expect(order.customerNotices[0]!.whatsappStatus).toBe('failed');
  });

  it('reads an order with no notices as an empty list', async () => {
    const { module } = load({ result: { id: 77, number: 'SRV-77', customer: 4 } });

    expect((await module.fetchServiceOrder(77, DEPS)).customerNotices).toEqual([]);
  });
});

describe('only a failed message can be sent again', () => {
  function notice(status: CustomerNotice['whatsappStatus']): CustomerNotice {
    return {
      id: 1,
      title: 't',
      createdAt: 'x',
      emailStatus: 'sent',
      whatsappStatus: status,
      whatsappDetail: null,
      whatsappRecipient: null,
    };
  }

  it('offers a retry for a failure and for nothing else', () => {
    expect(mayRetryWhatsApp(notice('failed'))).toBe(true);
    for (const status of ['pending', 'sent', 'delivered', 'read', 'skipped', 'not_applicable'] as const) {
      expect(mayRetryWhatsApp(notice(status))).toBe(false);
    }
  });

  it('posts the retry to the notice of THIS order', async () => {
    const { module, send } = load({ result: { ...NOTICE, whatsapp_status: 'sent' } });

    const updated = await module.retryWhatsAppNotice(77, 88, DEPS);

    expect(send.mock.calls[0]![0]).toBe(
      '/api/v1/internal/blackdog/service/orders/77/notifications/88/whatsapp/retry/',
    );
    const options = send.mock.calls[0]![1] as { method: string; body: unknown };
    expect(options.method).toBe('POST');
    expect(options.body).toEqual({});
    // Answered with the notice as it NOW stands, not with an assumption.
    expect(updated.whatsappStatus).toBe('sent');
  });

  it('turns a 404 into out of scope: that notice is not this order', async () => {
    const { module } = load({
      makeError: (ApiError) => new ApiError('not_found', 'No encontrado.', { status: 404 }),
    });

    await expect(module.retryWhatsAppNotice(77, 88, DEPS)).rejects.toBeInstanceOf(Error);
  });

  it('turns a 403 into a missing capability, not a logout', async () => {
    const { module } = load({
      makeError: (ApiError) => new ApiError('unauthorized', 'No permitido.', { status: 403 }),
    });

    await expect(module.retryWhatsAppNotice(77, 88, DEPS)).rejects.toMatchObject({
      name: 'InternalCapabilityMissingError',
    });
  });

  it('describes each state in words, with a tone per meaning', () => {
    expect(describeDeliveryStatus('read')).toEqual({ label: 'Leída', tone: 'success' });
    expect(describeDeliveryStatus('failed').tone).toBe('danger');
    expect(describeDeliveryStatus('pending').tone).toBe('progress');
    expect(describeDeliveryStatus('not_applicable').label).toBe('No aplica');
  });
});

describe('consent is recorded, never assumed', () => {
  it('posts the answer the customer gave, and nothing about who recorded it', async () => {
    const { module, send } = load({
      result: {
        whatsapp_opt_in: true,
        whatsapp_opt_in_at: '2026-10-04T15:10:00Z',
        whatsapp_opt_in_source: 'counter',
        whatsapp_opt_out_at: null,
      },
    });

    const consent = await module.postWhatsAppConsent(4, true, DEPS);

    expect(send.mock.calls[0]![0]).toBe(
      '/api/v1/internal/blackdog/service/customers/4/whatsapp-consent/',
    );
    const body = (send.mock.calls[0]![1] as { body: Record<string, unknown> }).body;
    expect(body).toEqual({ opt_in: true });
    expect(consent).toEqual({
      optIn: true,
      optInAt: '2026-10-04T15:10:00Z',
      optInSource: 'counter',
      optOutAt: null,
    });
  });

  it('sends a real boolean for a withdrawal too', async () => {
    const { module, send } = load({
      result: { whatsapp_opt_in: false, whatsapp_opt_out_at: '2026-10-05T09:00:00Z' },
    });

    const consent = await module.postWhatsAppConsent(4, false, DEPS);

    expect((send.mock.calls[0]![1] as { body: Record<string, unknown> }).body).toEqual({
      opt_in: false,
    });
    expect(consent.optIn).toBe(false);
    expect(consent.optOutAt).toBe('2026-10-05T09:00:00Z');
  });

  it('reads ABSENT consent as no consent', async () => {
    // A phone number on file is not permission. Defaulting the other way would
    // message somebody who never agreed.
    const { module } = load({ result: {} });

    expect((await module.postWhatsAppConsent(4, true, DEPS)).optIn).toBe(false);
  });

  it('reads anything but true as no consent', async () => {
    const { module } = load({ result: { whatsapp_opt_in: 'yes' } });

    expect((await module.postWhatsAppConsent(4, true, DEPS)).optIn).toBe(false);
  });

  it('refuses to guess a tenant', async () => {
    const { module, send } = load({ slug: null });

    await expect(module.postWhatsAppConsent(4, true, DEPS)).rejects.toMatchObject({
      name: 'MissingTenantError',
    });
    expect(send).not.toHaveBeenCalled();
  });
});
