import { CredentialStorageError } from '@/auth/auth-errors';
import { redactHeaders, redactPayload, redactSecret, describeAuthError } from '@/auth/redact';
import { createMemoryAccessTokenStore } from '@/auth/tokens/access-token-store';
import { createSecureCredentialVault } from '@/auth/tokens/credential-vault';
import { toTokenPair } from '@/auth/tokens/token-types';

/**
 * M1 — where each credential lives, and what never leaks.
 *
 * Two rules under test:
 *   ACCESS  → memory only. Dies with the process.
 *   REFRESH → SecureStore (Keychain / Keystore). Nothing else is persisted.
 */

const secureStore = jest.requireMock('expo-secure-store') as {
  setItemAsync: jest.Mock;
  getItemAsync: jest.Mock;
  deleteItemAsync: jest.Mock;
};

beforeEach(() => {
  jest.clearAllMocks();
  secureStore.getItemAsync.mockResolvedValue(null);
  secureStore.setItemAsync.mockResolvedValue(undefined);
  secureStore.deleteItemAsync.mockResolvedValue(undefined);
});

describe('AccessTokenStore — memory only', () => {
  it('holds a token and returns it', () => {
    const store = createMemoryAccessTokenStore();
    store.set({ value: 'access-1', expiresAtMs: Date.now() + 600_000 });
    expect(store.get()).toBe('access-1');
  });

  it('never touches SecureStore', async () => {
    const store = createMemoryAccessTokenStore();
    store.set({ value: 'access-1', expiresAtMs: Date.now() + 600_000 });
    // The whole point of the memory-only decision.
    expect(secureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it('disappears when the store is recreated, as it would on relaunch', () => {
    const first = createMemoryAccessTokenStore();
    first.set({ value: 'access-1', expiresAtMs: Date.now() + 600_000 });

    const afterRelaunch = createMemoryAccessTokenStore();
    expect(afterRelaunch.get()).toBeNull();
  });

  it('treats a near-expired token as absent', () => {
    const store = createMemoryAccessTokenStore();
    const now = 1_000_000;
    // Inside the 30s skew: attaching it would earn a predictable 401.
    store.set({ value: 'access-1', expiresAtMs: now + 5_000 });
    expect(store.get(now)).toBeNull();
    expect(store.isExpired(now)).toBe(true);
  });

  it('clears on demand', () => {
    const store = createMemoryAccessTokenStore();
    store.set({ value: 'access-1', expiresAtMs: Date.now() + 600_000 });
    store.clear();
    expect(store.get()).toBeNull();
  });
});

describe('CredentialVault — refresh token only', () => {
  it('stores the refresh token in SecureStore', async () => {
    await createSecureCredentialVault().setRefreshToken('refresh-1');

    expect(secureStore.setItemAsync).toHaveBeenCalledTimes(1);
    const [key, value] = secureStore.setItemAsync.mock.calls[0]!;
    expect(key).toBe('bds.auth.refresh_token');
    expect(value).toBe('refresh-1');
  });

  it('reads it back', async () => {
    secureStore.getItemAsync.mockResolvedValue('refresh-1');
    await expect(createSecureCredentialVault().getRefreshToken()).resolves.toBe('refresh-1');
  });

  it('returns null when nothing is stored', async () => {
    await expect(createSecureCredentialVault().getRefreshToken()).resolves.toBeNull();
  });

  it('deletes it', async () => {
    await createSecureCredentialVault().clearRefreshToken();
    expect(secureStore.deleteItemAsync).toHaveBeenCalledWith(
      'bds.auth.refresh_token',
      expect.anything(),
    );
  });

  it('NEVER writes an access token key', async () => {
    // The access-token key was retired in M1; nothing may write it.
    await createSecureCredentialVault().setRefreshToken('refresh-1');
    const writtenKeys = secureStore.setItemAsync.mock.calls.map((call) => call[0]);
    expect(writtenKeys).not.toContain('bds.auth.access_token');
  });

  it('raises a typed error when the Keychain write fails', async () => {
    secureStore.setItemAsync.mockRejectedValue(new Error('keychain unavailable'));

    const error = await createSecureCredentialVault()
      .setRefreshToken('refresh-1')
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CredentialStorageError);
    expect((error as CredentialStorageError).operation).toBe('write');
  });

  it('raises a typed error when the Keychain read fails', async () => {
    secureStore.getItemAsync.mockRejectedValue(new Error('keychain unavailable'));

    const error = await createSecureCredentialVault()
      .getRefreshToken()
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CredentialStorageError);
    expect((error as CredentialStorageError).operation).toBe('read');
  });

  it('never carries the token in the error message', async () => {
    secureStore.setItemAsync.mockRejectedValue(new Error('boom'));

    const error = await createSecureCredentialVault()
      .setRefreshToken('super-secret-refresh')
      .catch((e: unknown) => e);

    expect((error as Error).message).not.toContain('super-secret-refresh');
  });
});

describe('redaction', () => {
  it('never echoes a secret back', () => {
    expect(redactSecret('eyJhbGciOiJIUzI1NiJ9.payload.signature')).not.toContain('eyJ');
    expect(redactSecret('short')).toBe('[redacted:5]');
  });

  it('redacts the Authorization header', () => {
    const safe = redactHeaders({ Authorization: 'Bearer abc.def.ghi', Accept: 'application/json' });
    expect(safe.Authorization).not.toContain('abc.def.ghi');
    expect(safe.Accept).toBe('application/json');
  });

  it('redacts tokens and passwords anywhere in a payload', () => {
    const safe = redactPayload({
      user: { email: 'carlos@example.com' },
      access: 'access-secret',
      refresh_token: 'refresh-secret',
      password: 'clave',
    }) as Record<string, unknown>;

    const serialized = JSON.stringify(safe);
    expect(serialized).not.toContain('access-secret');
    expect(serialized).not.toContain('refresh-secret');
    expect(serialized).not.toContain('clave');
    // Non-secret fields survive, or the helper would be useless for debugging.
    expect(serialized).toContain('carlos@example.com');
  });

  it('describes an error without leaking anything', () => {
    const error = new CredentialStorageError('write', new Error('Bearer abc.def.ghi'));
    const described = describeAuthError(error);
    // `cause` is deliberately not walked: it is where a raw request object
    // carrying an Authorization header would be hiding.
    expect(described).not.toContain('abc.def.ghi');
    expect(described).toContain('CredentialStorageError');
  });
});

describe('wire → domain mapping', () => {
  it('resolves the relative lifetime against the receiving clock', () => {
    // `expires_in` is worthless once it has sat in a variable, so it is turned
    // into an absolute instant at the moment of receipt.
    const pair = toTokenPair({ access: 'a', refresh: 'r', expires_in: 1800 }, 1_000_000);
    expect(pair.access.expiresAtMs).toBe(1_000_000 + 1_800_000);
    expect(pair.refreshToken).toBe('r');
  });
});
