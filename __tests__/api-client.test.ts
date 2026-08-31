import { request } from '@/api/client';
import { ApiError } from '@/api/errors';

/**
 * The three ways a request can fail before it ever gets a response, and the
 * header the client must NOT send.
 *
 * These matter because each failure calls for a different thing from the user:
 * "sin conexión" sends someone to check their wifi, "el servidor tarda" does
 * not, and a caller cancellation must reach nobody at all.
 */

const realFetch = globalThis.fetch;

/** Never resolves on its own — only the abort signal can end it. */
function hangingFetch(): jest.Mock {
  return jest.fn(
    (_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          // Mirrors what a real fetch does: reject with a DOMException-shaped
          // AbortError. The client must NOT depend on this shape.
          const error = new Error('Aborted');
          error.name = 'AbortError';
          reject(error);
        });
      }),
  );
}

function jsonFetch(body: unknown, status = 200): jest.Mock {
  return jest.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  }));
}

afterEach(() => {
  globalThis.fetch = realFetch;
  jest.restoreAllMocks();
});

describe('request — failure classification', () => {
  it('reports a TIMEOUT when our own timer fires', async () => {
    globalThis.fetch = hangingFetch() as unknown as typeof fetch;

    const error = await request('/api/products/', { timeoutMs: 20 }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe('timeout');
  });

  it('classifies a timeout WITHOUT inspecting the thrown value', async () => {
    // The regression this guards: the client used to decide "was this a
    // timeout?" from `cause.name === 'AbortError'`. Some runtimes reject with
    // the abort REASON instead, and then a timeout was misreported as
    // "sin conexión" while the connection was fine.
    globalThis.fetch = jest.fn(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          // Deliberately NOT an AbortError, and not even an Error.
          init?.signal?.addEventListener('abort', () => reject('aborted-as-a-plain-string'));
        }),
    ) as unknown as typeof fetch;

    const error = await request('/api/products/', { timeoutMs: 20 }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe('timeout');
  });

  it('re-throws a CALLER cancellation untouched', async () => {
    globalThis.fetch = hangingFetch() as unknown as typeof fetch;
    const controller = new AbortController();

    const pending = request('/api/products/', {
      signal: controller.signal,
      timeoutMs: 10_000,
    }).catch((e: unknown) => e);

    controller.abort();
    const error = await pending;

    // Must NOT become an ApiError: TanStack Query recognises its own abort and
    // stays silent, whereas an ApiError would surface as a message to the user.
    expect(error).not.toBeInstanceOf(ApiError);
    expect((error as Error).name).toBe('AbortError');
  });

  it('short-circuits when the caller signal is already aborted', async () => {
    globalThis.fetch = hangingFetch() as unknown as typeof fetch;
    const controller = new AbortController();
    controller.abort();

    const error = await request('/api/products/', { signal: controller.signal }).catch(
      (e: unknown) => e,
    );

    expect(error).not.toBeInstanceOf(ApiError);
  });

  it('reports OFFLINE for a plain network failure', async () => {
    globalThis.fetch = jest.fn(async () => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch;

    const error = await request('/api/products/').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe('offline');
  });

  it('does not leave a live timer behind on success', async () => {
    const clearSpy = jest.spyOn(globalThis, 'clearTimeout');
    globalThis.fetch = jsonFetch([]) as unknown as typeof fetch;

    await request('/api/products/');

    // A pending 15s timer keeps the JS context awake after every request.
    expect(clearSpy).toHaveBeenCalled();
  });

  it('detaches its listener from a reused caller signal', async () => {
    globalThis.fetch = jsonFetch([]) as unknown as typeof fetch;
    const controller = new AbortController();
    const removeSpy = jest.spyOn(controller.signal, 'removeEventListener');

    await request('/api/products/', { signal: controller.signal });

    // Otherwise one listener accumulates per request made with the same signal.
    expect(removeSpy).toHaveBeenCalledWith('abort', expect.any(Function));
  });
});

describe('request — headers', () => {
  it('does NOT send X-Company-Slug', async () => {
    // BR-002 has not been accepted. Sending a tenant header to the current
    // /api/* surface would make the app look integrated with a contract that
    // does not exist, and would be wrong if Backend picks a different
    // mechanism (path segment, query param, dedicated endpoint).
    const fetchMock = jsonFetch([]);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await request('/api/products/');

    const headers = fetchMock.mock.calls[0]![1].headers as Record<string, string>;
    expect(Object.keys(headers)).not.toContain('X-Company-Slug');
    expect(headers.Accept).toBe('application/json');
  });

  it('never sends cookies', async () => {
    const fetchMock = jsonFetch([]);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await request('/api/products/');

    // The web contract is HttpOnly cookie + CSRF, which a native client cannot
    // speak. Sending credentials would half-implement it. See BR-001.
    expect(fetchMock.mock.calls[0]![1].credentials).toBe('omit');
  });
});

describe('request — HTTP errors', () => {
  it('maps a 404 to not_found', async () => {
    globalThis.fetch = jsonFetch({ detail: 'No encontrado.' }, 404) as unknown as typeof fetch;

    const error = await request('/api/products/').catch((e: unknown) => e);

    expect((error as ApiError).kind).toBe('not_found');
    expect((error as ApiError).status).toBe(404);
  });

  it('extracts DRF field errors from a 400', async () => {
    globalThis.fetch = jsonFetch({ email: ['Ya existe.'] }, 400) as unknown as typeof fetch;

    const error = await request('/api/auth/register/', { method: 'POST', body: {} }).catch(
      (e: unknown) => e,
    );

    expect((error as ApiError).kind).toBe('validation');
    expect((error as ApiError).fieldErrors).toEqual({ email: ['Ya existe.'] });
  });
});
