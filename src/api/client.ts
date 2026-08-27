import { apiBaseUrl, apiTimeoutMs, companySlug, isApiConfigured } from '@/config/env';

import { ApiError, kindFromStatus, parseFieldErrors } from './errors';

/**
 * The single HTTP entry point.
 *
 * Scope in M0 is deliberately narrow. It knows how to reach Django, how to time
 * out, and how to turn a failure into an `ApiError`. It does NOT know how to
 * authenticate, because the backend's current contract cannot be satisfied from
 * a native client — see docs/MOBILE_AUTH.md and BR-001. No endpoint is invented
 * here; the only paths this file will ever see are the ones a caller passes in,
 * and the only callers in M0 are the verified catalogue endpoints.
 */

export type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** Serialised as JSON. Omit for GET. */
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  /** Caller-supplied cancellation, composed with the internal timeout. */
  signal?: AbortSignal;
  headers?: Record<string, string>;
};

function buildUrl(path: string, query: RequestOptions['query']): string {
  const normalised = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${apiBaseUrl}${normalised}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

/**
 * Compose the caller's signal with a timeout.
 *
 * `AbortSignal.any` is available in Hermes on SDK 57; the fallback keeps the
 * client usable under a JS runtime that lacks it (notably older jsdom in tests)
 * without dropping the timeout.
 */
function withTimeout(signal: AbortSignal | undefined): {
  signal: AbortSignal;
  cancel: () => void;
} {
  const timeoutController = new AbortController();
  const timer = setTimeout(() => timeoutController.abort('timeout'), apiTimeoutMs);
  const cancel = () => clearTimeout(timer);

  if (!signal) return { signal: timeoutController.signal, cancel };
  if (typeof AbortSignal.any === 'function') {
    return { signal: AbortSignal.any([signal, timeoutController.signal]), cancel };
  }
  signal.addEventListener('abort', () => timeoutController.abort(), { once: true });
  return { signal: timeoutController.signal, cancel };
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    // A Django debug page or an HTML 502 from a proxy lands here. Returning the
    // raw text lets the caller classify it without the parse throwing first.
    return text;
  }
}

function detailFrom(body: unknown, fallback: string): string {
  if (typeof body === 'object' && body !== null && 'detail' in body) {
    const detail = (body as { detail?: unknown }).detail;
    if (typeof detail === 'string') return detail;
  }
  return fallback;
}

/**
 * Perform a request and return the parsed JSON body.
 *
 * `T` is the caller's assertion about the response shape. The client does not
 * validate it — the endpoint modules do, at the boundary, so that a backend
 * change surfaces as a clear mapping failure rather than as `undefined` deep
 * inside a component.
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (!isApiConfigured) {
    throw new ApiError(
      'not_configured',
      'EXPO_PUBLIC_API_BASE_URL no está configurado. Consulta README.md.',
    );
  }

  const { method = 'GET', body, query, headers } = options;
  const { signal, cancel } = withTimeout(options.signal);

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      signal,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        // Carried so the backend can adopt it without a client release. Django
        // ignores it today and resolves the tenant from Host instead (BR-002).
        'X-Company-Slug': companySlug,
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      // Explicitly NOT 'include'. The web app authenticates with HttpOnly
      // cookies plus a CSRF header; replaying that from a native client would
      // mean managing a cookie jar we cannot inspect and a CSRF token we cannot
      // read. M1 designs a native contract instead — see docs/MOBILE_AUTH.md.
      credentials: 'omit',
    });
  } catch (cause) {
    cancel();
    const aborted = cause instanceof Error && cause.name === 'AbortError';
    if (aborted && options.signal?.aborted) throw cause;
    if (aborted) {
      throw new ApiError('timeout', 'La solicitud excedió el tiempo de espera.', { cause });
    }
    throw new ApiError('offline', 'No se pudo conectar con el servidor.', { cause });
  }
  cancel();

  const payload = await readBody(response);

  if (!response.ok) {
    const kind = kindFromStatus(response.status);
    throw new ApiError(kind, detailFrom(payload, `HTTP ${response.status}`), {
      status: response.status,
      fieldErrors: kind === 'validation' ? parseFieldErrors(payload) : null,
    });
  }

  return payload as T;
}
