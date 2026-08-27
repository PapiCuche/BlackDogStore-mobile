import type { FeatureKey } from '@/config/integration-status';

/**
 * A feature has no data source in this build.
 *
 * Thrown when a repository is `null` — which happens when the feature is
 * mock-only (no backend exists yet) and this build is NOT allowed to serve
 * mocks. That is the normal, correct state of a release build for Repairs,
 * Orders and company branding today.
 *
 * It is an ERROR rather than an empty list on purpose: "no tenemos esta
 * función todavía" and "no tienes reparaciones" are different things, and
 * showing the second when the first is true would be a lie the customer acts
 * on.
 */
export class FeatureUnavailableError extends Error {
  readonly feature: FeatureKey;

  constructor(feature: FeatureKey, message: string) {
    super(message);
    this.name = 'FeatureUnavailableError';
    this.feature = feature;
  }
}

/** Reject with a `FeatureUnavailableError`, for use as a query function. */
export function featureUnavailable(feature: FeatureKey, message: string): Promise<never> {
  return Promise.reject(new FeatureUnavailableError(feature, message));
}
