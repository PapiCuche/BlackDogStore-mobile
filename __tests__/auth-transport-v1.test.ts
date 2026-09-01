import { ApiError } from '@/api/errors';
import { RefreshNetworkError, RefreshRejectedError } from '@/auth/auth-errors';
import { createDjangoAuthTransport } from '@/auth/transport/django-auth-transport';

/**
 * M3 — the wire, and the one distinction that must never blur.
 *
 * A rejected token and an unreachable server look identical in a log and demand
 * opposite behaviour: wipe the credentials, or keep them and try later.
 */

jest.mock('@/api/endpoints/auth-v1', () => ({
  postLogin: jest.fn(),
  postRefresh: jest.fn(),
  postLogout: jest.fn(),
  getIdentity: jest.fn(),
  toCustomer: jest.requireActual('@/api/endpoints/auth-v1').toCustomer,
  toCompanies: jest.requireActual('@/api/endpoints/auth-v1').toCompanies,
  toAccessContexts: jest.requireActual('@/api/endpoints/auth-v1').toAccessContexts,
  toPlatformContext: jest.requireActual('@/api/endpoints/auth-v1').toPlatformContext,
}));

const api = jest.requireMock('@/api/endpoints/auth-v1') as {
  postLogin: jest.Mock;
  postRefresh: jest.Mock;
  postLogout: jest.Mock;
  getIdentity: jest.Mock;
};

const USER_WIRE = {
  id: 42,
  username: 'carlos',
  email: 'carlos@example.com',
  first_name: 'Carlos',
  last_name: 'Mau',
  role: 'customer',
  is_email_verified: true,
};

const TOKENS = { access: 'access.jwt', refresh: 'refresh.jwt', expires_in: 1800 };

const transport = createDjangoAuthTransport();

beforeEach(() => {
  jest.clearAllMocks();
  api.postLogin.mockResolvedValue({ ...TOKENS, user: USER_WIRE, available_companies: [] });
  api.postRefresh.mockResolvedValue(TOKENS);
  api.postLogout.mockResolvedValue(undefined);
  api.getIdentity.mockResolvedValue({ user: USER_WIRE, available_companies: [] });
});

describe('signIn', () => {
  it('sends the identifier as an EMAIL', async () => {
    // BR-001A settled this: /api/v1/auth/login/ takes {email, password}, unlike
    // the web contract's username.
    await transport.signIn({ identifier: 'carlos@example.com', password: 'Pass123!' });

    expect(api.postLogin).toHaveBeenCalledWith({
      email: 'carlos@example.com',
      password: 'Pass123!',
    });
  });

  it('maps the wire user onto the domain shape', async () => {
    const result = await transport.signIn({ identifier: 'x@y.z', password: 'p' });

    expect(result.user).toEqual({
      id: 42,
      username: 'carlos',
      email: 'carlos@example.com',
      firstName: 'Carlos',
      lastName: 'Mau',
      role: 'customer',
      isEmailVerified: true,
    });
  });

  it('resolves the relative lifetime against the receiving clock', async () => {
    // `expires_in` is worthless once it has sat in a variable, so it becomes an
    // absolute instant immediately.
    const before = Date.now();
    const result = await transport.signIn({ identifier: 'x@y.z', password: 'p' });

    expect(result.tokens.access.expiresAtMs).toBeGreaterThanOrEqual(before + 1800 * 1000);
  });

  it('degrades an unrecognised role to the least privileged one', async () => {
    api.postLogin.mockResolvedValue({
      ...TOKENS,
      user: { ...USER_WIRE, role: 'god-mode' },
      available_companies: [],
    });

    const result = await transport.signIn({ identifier: 'x@y.z', password: 'p' });

    expect(result.user.role).toBe('customer');
  });
});

describe('refresh — rejection versus network', () => {
  it('treats a 401 as a REJECTION, which is terminal', async () => {
    api.postRefresh.mockRejectedValue(new ApiError('unauthorized', 'no', { status: 401 }));

    await expect(transport.refresh('r')).rejects.toBeInstanceOf(RefreshRejectedError);
  });

  it('treats a 403 as a rejection too', async () => {
    api.postRefresh.mockRejectedValue(new ApiError('unauthorized', 'no', { status: 403 }));

    await expect(transport.refresh('r')).rejects.toBeInstanceOf(RefreshRejectedError);
  });

  it('treats an unreachable server as a NETWORK failure, which is not', async () => {
    // The lift test: wiping a valid refresh token here signs out a user who did
    // nothing but lose signal.
    api.postRefresh.mockRejectedValue(new ApiError('offline', 'sin conexión', { status: null }));

    await expect(transport.refresh('r')).rejects.toBeInstanceOf(RefreshNetworkError);
  });

  it('treats a 500 as a network failure, not a rejection', async () => {
    // The server did not refuse the token — it never looked at it.
    api.postRefresh.mockRejectedValue(new ApiError('server', 'boom', { status: 500 }));

    await expect(transport.refresh('r')).rejects.toBeInstanceOf(RefreshNetworkError);
  });

  it('treats a timeout as a network failure', async () => {
    api.postRefresh.mockRejectedValue(new ApiError('timeout', 'lento', { status: null }));

    await expect(transport.refresh('r')).rejects.toBeInstanceOf(RefreshNetworkError);
  });

  it('returns the ROTATED pair on success', async () => {
    api.postRefresh.mockResolvedValue({ ...TOKENS, refresh: 'refresh.rotado' });

    const pair = await transport.refresh('refresh.viejo');

    expect(pair.refreshToken).toBe('refresh.rotado');
    expect(pair.access.value).toBe('access.jwt');
  });
});

describe('getCurrentSession', () => {
  it('reads the identity with the token it was GIVEN', async () => {
    // Takes the token as an argument because cold start calls this right after
    // a refresh, holding a token the store may not have installed yet.
    await transport.getCurrentSession('access.recien.emitido');

    expect(api.getIdentity).toHaveBeenCalledWith('access.recien.emitido');
  });

  it('maps verified company relations', async () => {
    api.getIdentity.mockResolvedValue({
      user: USER_WIRE,
      available_companies: [
        { slug: 'blackdog', name: 'Black Dog Store', relation: 'customer' },
        { slug: 'otra', name: 'Otra', relation: 'member' },
      ],
    });

    const snapshot = await transport.getCurrentSession('t');

    expect(snapshot.companies).toEqual([
      { slug: 'blackdog', name: 'Black Dog Store', relation: 'customer' },
      { slug: 'otra', name: 'Otra', relation: 'member' },
    ]);
  });

  it('treats an unrecognised relation as the WEAKER one', async () => {
    api.getIdentity.mockResolvedValue({
      user: USER_WIRE,
      available_companies: [{ slug: 'x', name: 'X', relation: 'owner-supremo' }],
    });

    const snapshot = await transport.getCurrentSession('t');

    expect(snapshot.companies[0]!.relation).toBe('customer');
  });

  it('survives a malformed company list', async () => {
    api.getIdentity.mockResolvedValue({ user: USER_WIRE, available_companies: null });

    await expect(transport.getCurrentSession('t')).resolves.toMatchObject({ companies: [] });
  });

  it('maps a 401 to a rejection and a network error to a network failure', async () => {
    api.getIdentity.mockRejectedValue(new ApiError('unauthorized', 'no', { status: 401 }));
    await expect(transport.getCurrentSession('t')).rejects.toBeInstanceOf(RefreshRejectedError);

    api.getIdentity.mockRejectedValue(new ApiError('offline', 'no', { status: null }));
    await expect(transport.getCurrentSession('t')).rejects.toBeInstanceOf(RefreshNetworkError);
  });
});

describe('signOut', () => {
  it('revokes the refresh token server-side', async () => {
    await transport.signOut('refresh.jwt');

    expect(api.postLogout).toHaveBeenCalledWith('refresh.jwt');
  });
});
