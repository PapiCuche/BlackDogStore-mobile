/**
 * Which contract an endpoint belongs to.
 *
 * The whole reason this type exists is to make it HARD to attach a Bearer token
 * to the wrong endpoint. Django's current surface authenticates with an HttpOnly
 * cookie plus CSRF; sending `Authorization: Bearer` there is at best ignored and
 * at worst a credential handed to a contract that never agreed to receive it.
 *
 * So the scope is a required, explicit argument rather than something inferred
 * from the path — an inference is one refactor away from being wrong, and the
 * failure mode is silent.
 */
export type ApiScope =
  /** No credentials. Catalogue, brand, anything anonymous. */
  | 'public'
  /** The PROPOSED mobile contract under `/api/v1/`. Bearer goes here, and only here. */
  | 'authenticated-v1'
  /** The existing web surface: `/api/auth/*`, `/api/admin/*`, `/api/me/*`. Cookie + CSRF. */
  | 'legacy-web';

/** The only prefix a Bearer token may ever be sent to. */
export const AUTHENTICATED_V1_PREFIX = '/api/v1/';

/**
 * Path prefixes that must NEVER receive a Bearer token.
 *
 * Listed explicitly rather than derived, so that adding a route to the web
 * surface does not quietly opt it into mobile credentials.
 */
const LEGACY_PREFIXES = ['/api/auth/', '/api/admin/', '/api/me/'] as const;

export class BearerScopeViolationError extends Error {
  constructor(path: string, scope: ApiScope) {
    // The path is safe to include; the token never is.
    super(`Se intentó enviar un token Bearer a "${path}" con scope "${scope}".`);
    this.name = 'BearerScopeViolationError';
  }
}

/** Whether `path` is inside the proposed authenticated mobile surface. */
export function isAuthenticatedV1Path(path: string): boolean {
  return path.startsWith(AUTHENTICATED_V1_PREFIX);
}

/**
 * Throw unless `path` may legitimately carry a Bearer token.
 *
 * Two independent conditions, both required: the caller must have DECLARED the
 * authenticated scope, and the path must actually be under `/api/v1/`. Either
 * one alone has been enough to leak a credential in other codebases — a
 * mislabelled call, or a correctly labelled call whose path later changed.
 */
export function assertBearerAllowed(path: string, scope: ApiScope): void {
  if (scope !== 'authenticated-v1') {
    throw new BearerScopeViolationError(path, scope);
  }
  if (!isAuthenticatedV1Path(path)) {
    throw new BearerScopeViolationError(path, scope);
  }
  if (LEGACY_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    throw new BearerScopeViolationError(path, scope);
  }
}
