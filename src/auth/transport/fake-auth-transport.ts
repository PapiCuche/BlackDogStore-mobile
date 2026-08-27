import type { Customer } from '@/domain/customers/types';

import { RefreshNetworkError, RefreshRejectedError } from '../auth-errors';
import type { TokenPair } from '../tokens/token-types';

import type { AuthTransport, AuthTransportResult } from './auth-transport';

/**
 * A scriptable transport, for TESTS ONLY.
 *
 * It exists so the token lifecycle can be verified — single-flight refresh,
 * rotation, rejection, network failure, logout races — without a backend and
 * without pretending an endpoint exists. It performs no I/O whatsoever.
 *
 * Counters are exposed because most of what M1 must prove is about HOW MANY
 * times something happened: one refresh for ten callers, one retry and not two,
 * no refresh at all on a 403.
 */
export type FakeAuthTransportScript = {
  /** Resolve refreshes after a manual trigger instead of immediately. */
  manualRefresh?: boolean;
  /** What the next refresh should do. */
  refreshBehaviour?: 'rotate' | 'reject' | 'network-error';
};

export class FakeAuthTransport implements AuthTransport {
  refreshCallCount = 0;
  signInCallCount = 0;
  signOutCallCount = 0;
  /** Refresh tokens this transport was asked to revoke, in order. */
  revokedTokens: string[] = [];
  /** Refresh tokens this transport was presented with, in order. */
  presentedRefreshTokens: string[] = [];

  private script: FakeAuthTransportScript;
  private tokenSeq = 0;
  private pendingRefresh: (() => void)[] = [];

  constructor(script: FakeAuthTransportScript = {}) {
    this.script = { refreshBehaviour: 'rotate', ...script };
  }

  configure(script: FakeAuthTransportScript): void {
    this.script = { ...this.script, ...script };
  }

  /** Release every refresh awaiting a manual trigger. */
  releaseRefresh(): void {
    const waiting = this.pendingRefresh;
    this.pendingRefresh = [];
    for (const release of waiting) release();
  }

  get pendingRefreshCount(): number {
    return this.pendingRefresh.length;
  }

  async signIn(input: { identifier: string; password: string }): Promise<AuthTransportResult> {
    this.signInCallCount += 1;
    return { tokens: this.mintTokens(), user: fakeUser(input.identifier) };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    this.refreshCallCount += 1;
    this.presentedRefreshTokens.push(refreshToken);

    if (this.script.manualRefresh) {
      await new Promise<void>((resolve) => this.pendingRefresh.push(resolve));
    }

    if (this.script.refreshBehaviour === 'reject') throw new RefreshRejectedError('blacklisted');
    if (this.script.refreshBehaviour === 'network-error') throw new RefreshNetworkError();

    return this.mintTokens();
  }

  async signOut(refreshToken: string): Promise<void> {
    this.signOutCallCount += 1;
    this.revokedTokens.push(refreshToken);
  }

  /** Every mint is unique, so a test can prove the OLD token stopped being used. */
  mintTokens(lifetimeMs = 30 * 60_000): TokenPair {
    this.tokenSeq += 1;
    return {
      access: {
        value: `access-${this.tokenSeq}`,
        expiresAtMs: Date.now() + lifetimeMs,
      },
      refreshToken: `refresh-${this.tokenSeq}`,
    };
  }
}

function fakeUser(identifier: string): Customer {
  const localPart = identifier.split('@')[0] ?? 'invitado';
  return {
    id: 1,
    username: localPart,
    email: identifier.includes('@') ? identifier : `${localPart}@example.com`,
    firstName: localPart.charAt(0).toUpperCase() + localPart.slice(1),
    lastName: '',
    role: 'customer',
    isEmailVerified: true,
  };
}
