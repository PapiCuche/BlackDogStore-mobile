/**
 * The tenant's part of its WhatsApp messaging setup — WHATSAPP-NOTIFY.
 *
 * CREDENTIALS ARRIVE AS BOOLEANS, never as values and never as the names of
 * the variables that hold them. The server decided that, and this type cannot
 * widen it: there is nowhere for a token to land.
 *
 * WHO SETS WHAT. The phone number id and the three provider credentials belong
 * to whoever operates the deployment, not to the shop — a body naming them is
 * simply not read. What a tenant administrator changes is the closed list in
 * `MessagingSettingsInput`.
 */
export const CAP_SETTINGS_VIEW = 'settings.view';
export const CAP_SETTINGS_MANAGE = 'settings.manage';

export type MessagingSettings = {
  enabled: boolean;
  provider: string;
  /** Whether the provider side is complete. Only then may `enabled` be set. */
  ready: boolean;
  /** What is still missing, in the server's words. */
  missing: readonly string[];
  phoneNumberConfigured: boolean;
  /** One boolean per credential the deployment holds. Never a value. */
  credentials: Readonly<Record<string, boolean>>;
  /** Digits only, up to four. Empty when the shop has not set one. */
  defaultCallingCode: string;
  templateLanguage: string;
  /** Template name per notice code. Empty string = no template chosen. */
  templates: Readonly<Record<string, string>>;
  /** The notices that can carry a template, with their labels. */
  events: readonly { code: string; label: string }[];
  /** The placeholders a template may use, as the server names them. */
  templateParameters: readonly string[];
  /** Where the provider posts. Shown so somebody can copy it, never called. */
  webhookPath: string;
};

/** The closed list a tenant administrator may change. */
export type MessagingSettingsInput = {
  enabled?: boolean;
  defaultCallingCode?: string;
  templateLanguage?: string;
  templates?: Record<string, string>;
};

/** Lowercase, digits and underscore — the server's own rule for a name. */
export const TEMPLATE_NAME_PATTERN = /^[a-z0-9_]+$/;

/** `es`, `es_MX`, `en_US`. */
export const TEMPLATE_LANGUAGE_PATTERN = /^[a-z]{2}(_[A-Z]{2})?$/;

export const CALLING_CODE_MAX_DIGITS = 4;
