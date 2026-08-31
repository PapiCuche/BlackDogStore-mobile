/**
 * One error type for every failure the API layer can produce.
 *
 * The point is that a screen can branch on `kind` and show the right thing —
 * "sin conexión" is a different message and a different recovery action from
 * "no encontrado", and both are different from "tu sesión expiró". A bare
 * `Error` forces every caller to string-match, which is how "Network request
 * failed" ends up in front of a customer.
 */
export type ApiErrorKind =
  /** No usable network, DNS failure, connection refused. */
  | 'offline'
  /** The request exceeded `apiTimeoutMs`. */
  | 'timeout'
  /** 401/403 — not authenticated, or not allowed. */
  | 'unauthorized'
  /** 404. */
  | 'not_found'
  /** 400/422 — the server rejected the payload. `fieldErrors` is populated. */
  | 'validation'
  /** 429 — throttled. Django declares per-view rates for most endpoints. */
  | 'rate_limited'
  /** 5xx. */
  | 'server'
  /** EXPO_PUBLIC_API_BASE_URL was never set. */
  | 'not_configured'
  /** Anything we could not classify, including a non-JSON body. */
  | 'unknown';

/** DRF returns `{ field: ["msg", ...] }` for a serializer failure. */
export type FieldErrors = Record<string, readonly string[]>;

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | null;
  readonly fieldErrors: FieldErrors | null;

  constructor(
    kind: ApiErrorKind,
    message: string,
    options: { status?: number | null; fieldErrors?: FieldErrors | null; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'ApiError';
    this.kind = kind;
    this.status = options.status ?? null;
    this.fieldErrors = options.fieldErrors ?? null;
  }

  /** Whether retrying the same request could plausibly succeed. */
  get isRetryable(): boolean {
    return this.kind === 'offline' || this.kind === 'timeout' || this.kind === 'server';
  }
}

/**
 * A message safe to put in front of a customer.
 *
 * Deliberately does NOT surface `error.message` for server failures: a Django
 * traceback or an internal field name leaking into a toast is both confusing
 * and a small information disclosure.
 */
export function userFacingMessage(error: unknown): string {
  // A feature with no data source carries its own explanation, and it is
  // written for the customer. Retrying would not change it.
  if (error instanceof Error && error.name === 'FeatureUnavailableError') {
    return error.message;
  }
  if (!(error instanceof ApiError)) {
    return 'Ocurrió un error inesperado. Vuelve a intentarlo.';
  }
  switch (error.kind) {
    case 'offline':
      return 'Sin conexión. Revisa tu red e inténtalo de nuevo.';
    case 'timeout':
      return 'El servidor está tardando demasiado. Inténtalo de nuevo.';
    case 'unauthorized':
      return 'Tu sesión no es válida. Inicia sesión nuevamente.';
    case 'not_found':
      return 'No encontramos lo que buscabas.';
    case 'validation':
      return error.message || 'Revisa los datos ingresados.';
    case 'rate_limited':
      return 'Demasiados intentos. Espera un momento antes de reintentar.';
    case 'server':
      return 'El servidor no está disponible en este momento.';
    case 'not_configured':
      return 'La aplicación no tiene configurada la dirección del servidor.';
    default:
      return 'Ocurrió un error inesperado. Vuelve a intentarlo.';
  }
}

/** Map an HTTP status onto the kind that best describes it. */
export function kindFromStatus(status: number): ApiErrorKind {
  if (status === 401 || status === 403) return 'unauthorized';
  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limited';
  if (status === 400 || status === 422) return 'validation';
  if (status >= 500) return 'server';
  return 'unknown';
}

/**
 * Pull `{ field: [...] }` out of a DRF error body.
 *
 * DRF mixes two shapes: `{"detail": "..."}` for a view-level rejection and
 * `{"email": ["..."]}` for a serializer one. Only the second is a field error,
 * so `detail` is filtered out rather than presented as a field named "detail".
 */
export function parseFieldErrors(body: unknown): FieldErrors | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;

  const result: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(body)) {
    if (key === 'detail') continue;
    if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
      result[key] = value;
    } else if (typeof value === 'string') {
      result[key] = [value];
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}
