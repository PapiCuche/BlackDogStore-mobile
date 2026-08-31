import { userFacingMessage } from '@/api/errors';
import { FeatureUnavailableError, featureUnavailable } from '@/repositories/errors';

/**
 * M0.1: a build that may not serve mocks has NO data source for repairs,
 * orders or company branding, because none of them has a backend yet.
 *
 * The distinction this file protects: "todavía no tenemos esta función" is not
 * the same as "no tienes reparaciones". Returning an empty list for the first
 * would tell a customer something false about their own account.
 */

describe('FeatureUnavailableError', () => {
  it('names the feature it belongs to', () => {
    const error = new FeatureUnavailableError('repairs', 'Aún no disponible.');
    expect(error.feature).toBe('repairs');
    expect(error.name).toBe('FeatureUnavailableError');
  });

  it('is an Error, so it travels through TanStack Query unchanged', () => {
    expect(new FeatureUnavailableError('orders', 'x')).toBeInstanceOf(Error);
  });

  it('rejects when used as a query function', async () => {
    await expect(featureUnavailable('orders', 'Aún no.')).rejects.toBeInstanceOf(
      FeatureUnavailableError,
    );
  });
});

describe('userFacingMessage', () => {
  it('surfaces the feature message verbatim, because it is written for the user', () => {
    const message = 'Las reparaciones aún no están disponibles en esta versión.';
    expect(userFacingMessage(new FeatureUnavailableError('repairs', message))).toBe(message);
  });

  it('does not fall through to the generic "error inesperado" text', () => {
    const result = userFacingMessage(new FeatureUnavailableError('orders', 'Aún no.'));
    expect(result).not.toMatch(/inesperado/i);
  });
});
