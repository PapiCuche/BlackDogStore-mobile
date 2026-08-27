import { apiBaseUrl, apiTimeoutMs, isApiConfigured } from '@/config/env';

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
 *
 * M0.1 CHANGE — the client no longer sends `X-Company-Slug`.
 *
 * It used to attach that header to every request. BR-002 has not been accepted
 * by the Backend team, so the header is a contract that DOES NOT EXIST: sending
 * it to the current `/api/*` surface makes the app look like it is already
 * integrated with a tenant selector, and would silently become meaningless (or
 * wrong) if Backend chooses a different mechanism — a path segment, a query
 * parameter, a dedicated endpoint. Tenant selection will be added explicitly,
 * on the endpoints that accept it, once the contract is agreed.
 */

export type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** Serialised as JSON. Omit for GET. */
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  /** Caller-supplied cancellation, composed with the internal timeout. */
  signal?: AbortSignal;
  headers?: Record<string, string>;
  /** Overrides `apiTimeoutMs`. Mainly so tests need not wait 15 seconds. */
  timeoutMs?: number;
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

type RequestSignal = {
  signal: AbortSignal;
  /** True only when OUR timer fired. Never inferred from the exception. */
  didTimeout: () => boolean;
  /** Clears the timer and detaches the caller listener. Always call it. */
  dispose: () => void;
};

/**
 * Compose the caller's cancellation with our timeout.
 *
 * M0.1 CHANGE — classification no longer depends on the shape of the thrown
 * value.
 *
 * The previous version called `abort('timeout')` and then decided what had
 * happened by inspecting `cause.name === 'AbortError'`. That is not portable:
 * depending on the runtime, aborting with a reason can reject with the reason
 * itself rather than with a DOMException, and then a timeout is
 * indistinguishable from a network failure — the user gets "sin conexión"
 * while their connection is fine.
 *
 * So we keep an explicit `didTimeout` flag, abort WITHOUT a custom reason, and
 * read the flag afterwards. Whatever `fetch` decides to throw is irrelevant.
 *
 * `AbortSignal.any` is deliberately not used: it composes the signals but
 * throws away which one fired, which is exactly the information we need.
 */
function createRequestSignal(
  callerSignal: AbortSignal | undefined,
  timeoutMs: number,
): RequestSignal {
  const controller = new AbortController();
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const onCallerAbort = () => controller.abort();
  callerSignal?.addEventListener('abort', onCallerAbort, { once: true });

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    dispose: () => {
      // Both halves matter: a live timer keeps the JS context awake, and a
      // listener left on a long-lived caller signal accumulates one entry per
      // request made with it.
      clearTimeout(timer);
      callerSignal?.removeEventListener('abort', onCallerAbort);
    },
  };
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
 *
 * Three failure modes are told apart, because each calls for a different thing
 * from the user:
 *   - CALLER CANCELLATION → the original error is re-thrown untouched, so
 *     TanStack Query can recognise its own abort and stay silent.
 *   - TIMEOUT → `ApiError('timeout')`. The server is reachable but slow.
 *   - NETWORK / OFFLINE → `ApiError('offline')`. Nothing was reachable.
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (!isApiConfigured) {
    throw new ApiError(
      'not_configured',
      'EXPO_PUBLIC_API_BASE_URL no está configurado. Consulta README.md.',
    );
  }

  const { method = 'GET', body, query, headers, signal: callerSignal } = options;

  // Already cancelled before we started: don't open a socket, don't arm a
  // timer. Relying on `fetch` to notice the aborted signal works, but issuing a
  // request the caller has already abandoned is wasted radio time on a phone.
  if (callerSignal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  const attempt = createRequestSignal(callerSignal, options.timeoutMs ?? apiTimeoutMs);

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      signal: attempt.signal,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
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
    const timedOut = attempt.didTimeout();
    attempt.dispose();

    if (timedOut) {
      throw new ApiError('timeout', 'La solicitud excedió el tiempo de espera.', { cause });
    }
    // The caller cancelled — propagate verbatim so the caller's own abort
    // handling recognises it. Wrapping it would turn a deliberate cancellation
    // into an error message shown to the user.
    if (callerSignal?.aborted) throw cause;

    throw new ApiError('offline', 'No se pudo conectar con el servidor.', { cause });
  }
  attempt.dispose();

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
