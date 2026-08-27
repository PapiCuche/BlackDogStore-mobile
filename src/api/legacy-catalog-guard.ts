import { legacyCatalogPolicy, type LegacyCatalogPolicy } from '@/config/env';

/**
 * Raised when something tries to reach the legacy catalogue from a build that
 * is not allowed to.
 *
 * Distinct from `ApiError` on purpose: this is not a failed request, it is a
 * request that was never permitted to leave the device.
 */
export class LegacyCatalogForbiddenError extends Error {
  readonly decision: LegacyCatalogPolicy['decision'];

  constructor(policy: LegacyCatalogPolicy) {
    super(
      `El catálogo legacy no está permitido en esta configuración (${policy.decision}). ${policy.reason}`,
    );
    this.name = 'LegacyCatalogForbiddenError';
    this.decision = policy.decision;
  }
}

/**
 * Second line of defence for the legacy catalogue.
 *
 * The composition root already decides that a release build gets no catalogue
 * repository at all. This exists because that decision lives in ONE place, and
 * one place is one edit away from being wrong: a future refactor, a merge, or
 * somebody calling `new LegacyApiCatalogRepository()` directly from a screen
 * would all bypass it silently.
 *
 * So the check is repeated at the boundary that actually matters — immediately
 * before the network call. A release build cannot issue a legacy catalogue
 * request even if it somehow holds a repository instance.
 *
 * `policy` is injectable so the rule can be exercised for every environment
 * without re-importing the module under a mocked `process.env`.
 */
export function assertLegacyCatalogAllowed(
  policy: LegacyCatalogPolicy = legacyCatalogPolicy,
): void {
  if (policy.source !== 'legacy-api') {
    throw new LegacyCatalogForbiddenError(policy);
  }
}
