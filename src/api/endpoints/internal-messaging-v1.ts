import { companySlug } from '@/config/env';
import type { RefreshCoordinator } from '@/auth/refresh-coordinator';
import type {
  MessagingSettings,
  MessagingSettingsInput,
} from '@/domain/internal/messaging-types';

import { authenticatedRequest } from '../authenticated-request';
import { ApiError } from '../errors';
import {
  InternalAccessDeniedError,
  InternalCapabilityMissingError,
} from './internal-v1';

/**
 * The tenant's WhatsApp messaging setup — WHATSAPP-NOTIFY.
 *
 * Verified on `PapiCuche/BlackDogStore-web` @ `origin/master`
 * `aec829c697674efb61f9776a4f796bfc05663ddc` (`store/whatsapp_views.py` >
 * `WhatsAppSettingsView`, `store/whatsapp_services.py` > `settings_payload` /
 * `update_settings`):
 *
 *   GET   internal/<slug>/messaging/whatsapp/   `settings.view`
 *   PATCH internal/<slug>/messaging/whatsapp/   `settings.manage`
 *
 * CREDENTIALS ARE BOOLEANS. `settings_payload` reports whether each one is
 * present and never its value, nor the name of the variable holding it. This
 * module has no field for a token, so there is nowhere for one to arrive even
 * if the server changed its mind.
 *
 * THE WRITE IS A CLOSED LIST: `enabled`, `default_calling_code`,
 * `template_language` and `templates`. The phone number id and the provider
 * credentials belong to whoever operates the deployment — a body naming them is
 * not read, so this client does not send them.
 *
 * `enabled: true` IS REFUSED UNTIL THE PROVIDER SIDE IS COMPLETE, with the
 * server's own sentence. That refusal is shown rather than pre-empted: the app
 * reads `ready` to decide what to OFFER, and the server decides what happens.
 */

export class MissingTenantError extends Error {
  constructor() {
    super(
      'Esta build no tiene empresa configurada (EXPO_PUBLIC_COMPANY_SLUG). ' +
        'No se puede leer la configuración sin saber de qué empresa.',
    );
    this.name = 'MissingTenantError';
  }
}

type Row = Record<string, unknown>;
type Deps = { refreshCoordinator: RefreshCoordinator };

function requireTenant(): string {
  if (!companySlug) throw new MissingTenantError();
  return companySlug;
}

function messagingPath(slug: string): string {
  return `/api/v1/internal/${encodeURIComponent(slug)}/messaging/whatsapp/`;
}

function str(raw: unknown): string {
  return raw === null || raw === undefined ? '' : String(raw);
}

function toStringRecord(raw: unknown): Record<string, string> {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Row)) out[key] = str(value);
  return out;
}

function toBooleanRecord(raw: unknown): Record<string, boolean> {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, boolean> = {};
  // Anything but an explicit `true` reads as MISSING: reporting a credential as
  // present when the server did not say so would make a screen claim the shop
  // can message people.
  for (const [key, value] of Object.entries(raw as Row)) out[key] = value === true;
  return out;
}

export function toMessagingSettings(raw: unknown): MessagingSettings {
  const row = (raw ?? {}) as Row;
  const events = Array.isArray(row.events) ? row.events : [];
  return {
    enabled: row.enabled === true,
    provider: str(row.provider),
    ready: row.ready === true,
    missing: Array.isArray(row.missing) ? row.missing.map(str) : [],
    phoneNumberConfigured: row.phone_number_configured === true,
    credentials: toBooleanRecord(row.credentials),
    defaultCallingCode: str(row.default_calling_code),
    templateLanguage: str(row.template_language),
    templates: toStringRecord(row.templates),
    events: events.map((entry) => {
      const event = (entry ?? {}) as Row;
      return { code: str(event.code), label: str(event.label) };
    }),
    templateParameters: Array.isArray(row.template_parameters)
      ? row.template_parameters.map(str)
      : [],
    webhookPath: str(row.webhook_path),
  };
}

function translate(error: unknown): never {
  if (error instanceof ApiError) {
    if (error.status === 403) throw new InternalCapabilityMissingError(error.message);
    if (error.status === 404) throw new InternalAccessDeniedError();
  }
  throw error;
}

/** What is configured and what is missing. `settings.view`. */
export async function fetchMessagingSettings(
  deps: Deps,
  signal?: AbortSignal,
): Promise<MessagingSettings> {
  try {
    return toMessagingSettings(
      await authenticatedRequest<unknown>(
        messagingPath(requireTenant()),
        { scope: 'authenticated-v1', signal },
        deps,
      ),
    );
  } catch (error) {
    return translate(error);
  }
}

/**
 * Change the tenant's part of it. `settings.manage`.
 *
 * Only the four keys the server reads are sent, and only the ones the caller
 * actually set: `PATCH` semantics mean an omitted key is left alone, so sending
 * every field on every save would overwrite what another person just changed.
 */
export async function patchMessagingSettings(
  input: MessagingSettingsInput,
  deps: Deps,
  signal?: AbortSignal,
): Promise<MessagingSettings> {
  const body: Record<string, unknown> = {};
  if (input.enabled !== undefined) body.enabled = input.enabled;
  if (input.defaultCallingCode !== undefined) {
    body.default_calling_code = input.defaultCallingCode;
  }
  if (input.templateLanguage !== undefined) body.template_language = input.templateLanguage;
  if (input.templates !== undefined) body.templates = input.templates;

  try {
    return toMessagingSettings(
      await authenticatedRequest<unknown>(
        messagingPath(requireTenant()),
        { method: 'PATCH', body, scope: 'authenticated-v1', signal },
        deps,
      ),
    );
  } catch (error) {
    return translate(error);
  }
}
