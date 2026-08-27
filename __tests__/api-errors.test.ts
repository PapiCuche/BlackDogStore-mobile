import { ApiError, kindFromStatus, parseFieldErrors, userFacingMessage } from '@/api/errors';

describe('kindFromStatus', () => {
  it.each([
    [401, 'unauthorized'],
    [403, 'unauthorized'],
    [404, 'not_found'],
    [400, 'validation'],
    [422, 'validation'],
    [429, 'rate_limited'],
    [500, 'server'],
    [503, 'server'],
  ])('maps %i to %s', (status, expected) => {
    expect(kindFromStatus(status)).toBe(expected);
  });
});

describe('ApiError.isRetryable', () => {
  it('retries transient failures', () => {
    expect(new ApiError('offline', '').isRetryable).toBe(true);
    expect(new ApiError('timeout', '').isRetryable).toBe(true);
    expect(new ApiError('server', '').isRetryable).toBe(true);
  });

  it('does not retry a rejection the same request would earn again', () => {
    expect(new ApiError('unauthorized', '').isRetryable).toBe(false);
    expect(new ApiError('not_found', '').isRetryable).toBe(false);
    expect(new ApiError('validation', '').isRetryable).toBe(false);
  });
});

describe('parseFieldErrors', () => {
  it('extracts DRF serializer errors', () => {
    expect(parseFieldErrors({ email: ['Ya existe.'], password: ['Muy corta.'] })).toEqual({
      email: ['Ya existe.'],
      password: ['Muy corta.'],
    });
  });

  it('ignores the view-level `detail` key', () => {
    // `detail` is a whole-request message, not a field. Treating it as one
    // would render an error next to a field called "detail".
    expect(parseFieldErrors({ detail: 'No autorizado.' })).toBeNull();
  });

  it('normalises a bare string into a single-element list', () => {
    expect(parseFieldErrors({ email: 'Requerido.' })).toEqual({ email: ['Requerido.'] });
  });

  it('returns null for a non-object body', () => {
    expect(parseFieldErrors('<html>502</html>')).toBeNull();
    expect(parseFieldErrors(null)).toBeNull();
    expect(parseFieldErrors([1, 2])).toBeNull();
  });
});

describe('userFacingMessage', () => {
  it('distinguishes offline from a server failure', () => {
    expect(userFacingMessage(new ApiError('offline', 'x'))).toMatch(/conexión/i);
    expect(userFacingMessage(new ApiError('server', 'x'))).toMatch(/servidor/i);
  });

  it('never leaks an internal server message to the user', () => {
    const leaky = new ApiError('server', 'IntegrityError: duplicate key store_product_slug');
    expect(userFacingMessage(leaky)).not.toContain('IntegrityError');
  });

  it('does surface a validation message, which is meant for the user', () => {
    expect(userFacingMessage(new ApiError('validation', 'Revisa el correo.'))).toBe(
      'Revisa el correo.',
    );
  });

  it('handles a non-ApiError without throwing', () => {
    expect(userFacingMessage(new Error('boom'))).toBeTruthy();
    expect(userFacingMessage(undefined)).toBeTruthy();
  });
});
