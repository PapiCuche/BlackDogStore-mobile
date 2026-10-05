/**
 * WHATSAPP-NOTIFY — the tenant's messaging setup.
 *
 * Contract on `PapiCuche/BlackDogStore-web` @ `origin/master`
 * `aec829c697674efb61f9776a4f796bfc05663ddc` (`store/whatsapp_views.py` >
 * `WhatsAppSettingsView`, `store/whatsapp_services.py`):
 *
 *   GET   internal/<slug>/messaging/whatsapp/   `settings.view`
 *   PATCH internal/<slug>/messaging/whatsapp/   `settings.manage`
 *
 * THE TWO RULES THAT MATTER:
 *
 *  - CREDENTIALS ARE BOOLEANS. `settings_payload` reports whether each one is
 *    present, never its value and never the name of the variable holding it.
 *    This client has nowhere for a token to land, and a payload that tried to
 *    send one must not end up on a screen.
 *  - THE WRITE IS A CLOSED LIST. `enabled`, `default_calling_code`,
 *    `template_language`, `templates`. The phone number id and the provider
 *    credentials belong to whoever operates the deployment and are not read, so
 *    the client does not send them.
 */
import {
  CALLING_CODE_MAX_DIGITS,
  TEMPLATE_LANGUAGE_PATTERN,
  TEMPLATE_NAME_PATTERN,
} from '@/domain/internal/messaging-types';

const BASE = 'https://api.example.test';
const DEPS = { refreshCoordinator: {} as never };

type Loaded = typeof import('@/api/endpoints/internal-messaging-v1');

const PAYLOAD = {
  enabled: false,
  provider: 'cloud_api',
  ready: false,
  missing: ['whatsapp_token'],
  phone_number_configured: true,
  credentials: { whatsapp_token: false, whatsapp_app_secret: true, whatsapp_verify_token: true },
  default_calling_code: '51',
  template_language: 'es',
  templates: { repair_ready: 'repair_ready_v2', quote_published: '' },
  events: [
    { code: 'repair_ready', label: 'Equipo listo' },
    { code: 'quote_published', label: 'Cotización enviada' },
  ],
  template_parameters: ['customer_name', 'order_number'],
  webhook_path: '/api/v1/webhooks/whatsapp/blackdog/',
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
    return options.result ?? PAYLOAD;
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
    module = require('@/api/endpoints/internal-messaging-v1');
  });

  return { module, send };
}

afterEach(() => {
  jest.resetModules();
  jest.dontMock('@/api/authenticated-request');
  jest.dontMock('@/config/env');
});

describe('reading the setup', () => {
  it('reads it on the internal surface of this company', async () => {
    const { module, send } = load();

    await module.fetchMessagingSettings(DEPS);

    expect(send.mock.calls[0]![0]).toBe('/api/v1/internal/blackdog/messaging/whatsapp/');
    expect((send.mock.calls[0]![1] as { method?: string }).method).toBeUndefined();
  });

  it('maps what the server reports', async () => {
    const { module } = load();

    const settings = await module.fetchMessagingSettings(DEPS);

    expect(settings.enabled).toBe(false);
    expect(settings.ready).toBe(false);
    expect(settings.missing).toEqual(['whatsapp_token']);
    expect(settings.phoneNumberConfigured).toBe(true);
    expect(settings.defaultCallingCode).toBe('51');
    expect(settings.templates.repair_ready).toBe('repair_ready_v2');
    expect(settings.events).toHaveLength(2);
    expect(settings.templateParameters).toEqual(['customer_name', 'order_number']);
    expect(settings.webhookPath).toBe('/api/v1/webhooks/whatsapp/blackdog/');
  });

  it('keeps credentials as booleans and never as values', async () => {
    // Even if a payload tried to hand over a token, there is nowhere for it to
    // land: every credential entry is coerced to a boolean.
    const { module } = load({
      result: {
        ...PAYLOAD,
        credentials: {
          whatsapp_token: 'EAAG-super-secret-token',
          whatsapp_app_secret: true,
        },
      },
    });

    const settings = await module.fetchMessagingSettings(DEPS);

    expect(settings.credentials.whatsapp_token).toBe(false);
    expect(settings.credentials.whatsapp_app_secret).toBe(true);
    expect(JSON.stringify(settings)).not.toContain('EAAG');
  });

  it('reads anything but true as not enabled and not ready', async () => {
    const { module } = load({ result: { ...PAYLOAD, enabled: 'yes', ready: 1 } });

    const settings = await module.fetchMessagingSettings(DEPS);

    expect(settings.enabled).toBe(false);
    expect(settings.ready).toBe(false);
  });

  it('survives a payload with nothing in it', async () => {
    const { module } = load({ result: {} });

    const settings = await module.fetchMessagingSettings(DEPS);

    expect(settings.enabled).toBe(false);
    expect(settings.missing).toEqual([]);
    expect(settings.credentials).toEqual({});
    expect(settings.events).toEqual([]);
  });

  it('turns a 403 into a missing capability and a 404 into no access', async () => {
    const capability = load({
      makeError: (ApiError) => new ApiError('unauthorized', 'No permitido.', { status: 403 }),
    });
    await expect(capability.module.fetchMessagingSettings(DEPS)).rejects.toMatchObject({
      name: 'InternalCapabilityMissingError',
    });

    const scope = load({
      makeError: (ApiError) => new ApiError('not_found', 'No encontrado.', { status: 404 }),
    });
    await expect(scope.module.fetchMessagingSettings(DEPS)).rejects.toMatchObject({
      name: 'InternalAccessDeniedError',
    });
  });

  it('refuses to guess a tenant', async () => {
    const { module, send } = load({ slug: null });

    await expect(module.fetchMessagingSettings(DEPS)).rejects.toMatchObject({
      name: 'MissingTenantError',
    });
    expect(send).not.toHaveBeenCalled();
  });
});

describe('writing the part the shop owns', () => {
  it('PATCHes only the keys the caller actually set', async () => {
    // PATCH leaves an omitted key alone, so sending every field on every save
    // would overwrite what a colleague just changed from the console.
    const { module, send } = load();

    await module.patchMessagingSettings({ templateLanguage: 'es_MX' }, DEPS);

    const options = send.mock.calls[0]![1] as { method: string; body: Record<string, unknown> };
    expect(options.method).toBe('PATCH');
    expect(options.body).toEqual({ template_language: 'es_MX' });
  });

  it('sends the four writable keys in the server vocabulary', async () => {
    const { module, send } = load();

    await module.patchMessagingSettings(
      {
        enabled: true,
        defaultCallingCode: '51',
        templateLanguage: 'es',
        templates: { repair_ready: 'repair_ready_v3' },
      },
      DEPS,
    );

    expect((send.mock.calls[0]![1] as { body: unknown }).body).toEqual({
      enabled: true,
      default_calling_code: '51',
      template_language: 'es',
      templates: { repair_ready: 'repair_ready_v3' },
    });
  });

  it('sends a false as a real false, not as an omission', async () => {
    // Turning the notices OFF has to reach the server; dropping a falsy value
    // would silently leave them on.
    const { module, send } = load();

    await module.patchMessagingSettings({ enabled: false }, DEPS);

    expect((send.mock.calls[0]![1] as { body: unknown }).body).toEqual({ enabled: false });
  });

  it('never sends a credential or the phone number id', async () => {
    const { module, send } = load();

    await module.patchMessagingSettings(
      { enabled: true, templates: { repair_ready: 'x' } } as never,
      DEPS,
    );

    const body = (send.mock.calls[0]![1] as { body: Record<string, unknown> }).body;
    for (const owned of [
      'whatsapp_token',
      'whatsapp_app_secret',
      'whatsapp_verify_token',
      'phone_number_id',
      'credentials',
      'provider',
      'ready',
    ]) {
      expect(body).not.toHaveProperty(owned);
    }
  });

  it('returns the new state, which is what the screen must show', async () => {
    const { module } = load({ result: { ...PAYLOAD, template_language: 'es_MX' } });

    expect((await module.patchMessagingSettings({ templateLanguage: 'es_MX' }, DEPS))
      .templateLanguage).toBe('es_MX');
  });

  it('surfaces the refusal to enable before the provider side is complete', async () => {
    // The server's own sentence, shown rather than pre-empted.
    const { module } = load({
      makeError: (ApiError) =>
        new ApiError(
          'validation',
          'No se puede activar todavía: faltan credenciales del proveedor. Las configura quien administra la instalación.',
          { status: 400 },
        ),
    });

    await expect(module.patchMessagingSettings({ enabled: true }, DEPS)).rejects.toMatchObject({
      message: expect.stringContaining('faltan credenciales del proveedor'),
    });
  });
});

describe('the rules the screen validates against', () => {
  it('mirrors the template name rule', () => {
    expect(TEMPLATE_NAME_PATTERN.test('repair_ready_v2')).toBe(true);
    expect(TEMPLATE_NAME_PATTERN.test('Repair Ready')).toBe(false);
    expect(TEMPLATE_NAME_PATTERN.test('repair-ready')).toBe(false);
  });

  it('mirrors the language rule', () => {
    for (const ok of ['es', 'es_MX', 'en_US']) {
      expect(TEMPLATE_LANGUAGE_PATTERN.test(ok)).toBe(true);
    }
    for (const bad of ['spanish', 'es-MX', 'ES']) {
      expect(TEMPLATE_LANGUAGE_PATTERN.test(bad)).toBe(false);
    }
  });

  it('caps the calling code where the server caps it', () => {
    expect(CALLING_CODE_MAX_DIGITS).toBe(4);
  });
});
