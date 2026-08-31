import {
  deleteSecureItem,
  getSecureItem,
  isSecureStorageAvailable,
  secureStorageKeys,
  setSecureItem,
} from '@/storage/secure-storage';

import { CredentialStorageError } from '../auth-errors';

/**
 * The one place that persists a credential.
 *
 * Scope is deliberately three methods over ONE value. A vault that could store
 * arbitrary objects would eventually store a whole session, and the Keychain is
 * not a cache — every extra byte in it is a byte that survives process death
 * and shows up in device backups.
 *
 * What never comes near this file:
 *   - the password. It exists for the duration of one request and is never
 *     written anywhere.
 *   - the access token. Memory only, by decision — see `access-token-store.ts`.
 *   - the user profile, the tenant, the session. Those are product state and
 *     belong in React, not in the Keychain.
 */
export type CredentialVault = {
  getRefreshToken(): Promise<string | null>;
  setRefreshToken(token: string): Promise<void>;
  clearRefreshToken(): Promise<void>;
};

export function createSecureCredentialVault(): CredentialVault {
  return {
    async getRefreshToken() {
      // Unsupported platform is "no stored credential", not a failure: it is a
      // known, permanent state and the caller's answer is the same either way.
      if (!isSecureStorageAvailable()) return null;
      try {
        return await getSecureItem(secureStorageKeys.refreshToken);
      } catch (cause) {
        throw new CredentialStorageError('read', cause);
      }
    },

    async setRefreshToken(token: string) {
      // A write, unlike a read, MUST NOT fail silently on an unsupported
      // platform: the caller is mid-rotation and would otherwise believe a
      // credential was saved when nothing was.
      if (!isSecureStorageAvailable()) {
        throw new CredentialStorageError('write');
      }
      try {
        await setSecureItem(secureStorageKeys.refreshToken, token);
      } catch (cause) {
        throw new CredentialStorageError('write', cause);
      }
    },

    async clearRefreshToken() {
      if (!isSecureStorageAvailable()) return;
      try {
        await deleteSecureItem(secureStorageKeys.refreshToken);
      } catch (cause) {
        throw new CredentialStorageError('delete', cause);
      }
    },
  };
}

/** The app-wide vault. Tests build their own or inject a fake. */
export const credentialVault: CredentialVault = createSecureCredentialVault();
