import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { RefreshNetworkError } from './auth-errors';
import { authRuntimePolicy, type AuthRuntimePolicy } from './auth-policy';
import type { AuthRepository } from './auth-repository';
import { resolveAuthRepository } from './auth-repository-factory';
import type { AuthSession, AuthStatus, RegistrationDetails, SignInCredentials } from './types';

type AuthContextValue = {
  status: AuthStatus;
  session: AuthSession | null;
  /** True while a sign-in or registration request is in flight. */
  isSubmitting: boolean;
  /** How this build authenticates. Drives the login UI. */
  policy: AuthRuntimePolicy;
  signIn: (credentials: SignInCredentials) => Promise<void>;
  register: (details: RegistrationDetails) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Session state for the whole app.
 *
 * M1 adds two things beyond M0's version:
 *
 *  1. THE REPOSITORY COMES FROM THE POLICY, not from a default parameter. When
 *     the policy says `unavailable` there is no repository and the status is
 *     `unavailable` — a release build cannot fake a login.
 *
 *  2. A SESSION EPOCH guards every async completion. Auth is full of races that
 *     only appear under a slow network, and each one resurrects a session the
 *     user did not ask for:
 *       - sign-out lands while a sign-in is in flight;
 *       - two sign-ins race and the SLOWER one wins;
 *       - a refresh resolves after sign-out.
 *     Every mutation bumps the epoch and every completion checks it. A stale
 *     result is dropped instead of applied.
 */
export function AuthProvider({
  children,
  repository,
  policy = authRuntimePolicy,
}: {
  children: ReactNode;
  /** Injected by tests. Omit to let the policy decide. */
  repository?: AuthRepository | null;
  policy?: AuthRuntimePolicy;
}) {
  const resolvedRepository = useMemo(
    () => (repository !== undefined ? repository : resolveAuthRepository(policy)),
    [repository, policy],
  );

  const [status, setStatus] = useState<AuthStatus>('loading');
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  /**
   * Monotonic session generation.
   *
   * Read only inside callbacks and effects, never during render.
   */
  const epochRef = useRef(0);

  /**
   * The status the app acts on.
   *
   * DERIVED, not synced. With no repository the answer is `unavailable` by
   * definition, so mirroring it into state through an effect would be a second
   * source of truth that can lag by a render — and an extra render for a value
   * that was already knowable.
   */
  const effectiveStatus: AuthStatus = resolvedRepository ? status : 'unavailable';

  useEffect(() => {
    // Nothing to restore, and nothing to set: `effectiveStatus` already answers.
    if (!resolvedRepository) return;

    const startedAtEpoch = epochRef.current;
    let cancelled = false;

    resolvedRepository
      .restoreSession()
      .then((restored) => {
        if (cancelled || startedAtEpoch !== epochRef.current) return;
        setSession(restored);
        setStatus(restored ? 'authenticated' : 'unauthenticated');
      })
      .catch((error: unknown) => {
        if (cancelled || startedAtEpoch !== epochRef.current) return;
        setSession(null);
        // M3 — A FAILED RESTORE IS NOT ALWAYS A LOGOUT.
        //
        // Until the backend was real this collapsed everything into
        // `unauthenticated`, which was harmless because the mock never failed.
        // Against a real server it would sign out anyone who launched the app
        // on a train: the refresh token in the Keychain is still perfectly
        // good, and the only thing that happened is that we could not ask.
        //
        // `RefreshNetworkError` therefore means "credentials kept, try again",
        // and the repository is careful to throw it rather than resolve null.
        // A rejected refresh has already had its credentials cleared by the
        // coordinator and resolves null instead of reaching here at all.
        setStatus(
          error instanceof RefreshNetworkError ? 'temporarily-unavailable' : 'unauthenticated',
        );
      });

    return () => {
      cancelled = true;
    };
  }, [resolvedRepository]);

  /** Start a new generation and return its id. Any older result is now stale. */
  const beginTransition = useCallback(() => {
    epochRef.current += 1;
    return epochRef.current;
  }, []);

  const runAuthentication = useCallback(
    async (operation: (repo: AuthRepository) => Promise<AuthSession>) => {
      // Defensive: the UI hides the form when auth is unavailable, but a
      // programmatic caller must not be able to talk itself into a session.
      // `effectiveStatus` is already `unavailable`, so there is nothing to set.
      if (!resolvedRepository) return;

      const startedAtEpoch = beginTransition();
      setIsSubmitting(true);
      try {
        const next = await operation(resolvedRepository);
        // A newer sign-in — or a sign-out — happened while this was running.
        // Applying this result would let the SLOWER request win.
        if (startedAtEpoch !== epochRef.current) return;
        setSession(next);
        setStatus('authenticated');
      } finally {
        if (startedAtEpoch === epochRef.current) setIsSubmitting(false);
      }
    },
    [resolvedRepository, beginTransition],
  );

  const signIn = useCallback(
    (credentials: SignInCredentials) => runAuthentication((repo) => repo.signIn(credentials)),
    [runAuthentication],
  );

  const register = useCallback(
    (details: RegistrationDetails) => runAuthentication((repo) => repo.register(details)),
    [runAuthentication],
  );

  const signOut = useCallback(async () => {
    // ORDER IS DELIBERATE.
    //
    // The epoch is bumped and the UI is cleared BEFORE any network call. A
    // sign-out that leaves the device showing account data because a request
    // failed is a security problem, and the bump is what stops an in-flight
    // sign-in or refresh from resurrecting the session afterwards.
    beginTransition();
    setSession(null);
    setStatus('unauthenticated');
    setIsSubmitting(false);

    // Best-effort revocation. Its failure changes nothing locally.
    await resolvedRepository?.signOut().catch(() => undefined);
  }, [resolvedRepository, beginTransition]);

  const value = useMemo<AuthContextValue>(
    () => ({ status: effectiveStatus, session, isSubmitting, policy, signIn, register, signOut }),
    [effectiveStatus, session, isSubmitting, policy, signIn, register, signOut],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
  const context = use(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside <AuthProvider>.');
  }
  return context;
}
