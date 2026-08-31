import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import type { AuthRepository } from './auth-repository';
import { MockAuthRepository } from './mock-auth-repository';
import type { AuthSession, AuthStatus, RegistrationDetails, SignInCredentials } from './types';

type AuthContextValue = {
  status: AuthStatus;
  session: AuthSession | null;
  /** True while a sign-in or registration request is in flight. */
  isSubmitting: boolean;
  signIn: (credentials: SignInCredentials) => Promise<void>;
  register: (details: RegistrationDetails) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Session state for the whole app.
 *
 * The repository is injectable so tests — and, later, the real implementation —
 * can be swapped in without touching this component. Default is the mock, which
 * is the only implementation that exists in M0.
 */
export function AuthProvider({
  children,
  repository = defaultRepository,
}: {
  children: ReactNode;
  repository?: AuthRepository;
}) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    repository
      .restoreSession()
      .then((restored) => {
        if (cancelled) return;
        setSession(restored);
        setStatus(restored ? 'authenticated' : 'unauthenticated');
      })
      .catch(() => {
        // A failed restore is not an error the user can act on — it means "you
        // are signed out", which is exactly what we render.
        if (cancelled) return;
        setSession(null);
        setStatus('unauthenticated');
      });
    return () => {
      cancelled = true;
    };
  }, [repository]);

  const signIn = useCallback(
    async (credentials: SignInCredentials) => {
      setIsSubmitting(true);
      try {
        const next = await repository.signIn(credentials);
        setSession(next);
        setStatus('authenticated');
      } finally {
        setIsSubmitting(false);
      }
    },
    [repository],
  );

  const register = useCallback(
    async (details: RegistrationDetails) => {
      setIsSubmitting(true);
      try {
        const next = await repository.register(details);
        setSession(next);
        setStatus('authenticated');
      } finally {
        setIsSubmitting(false);
      }
    },
    [repository],
  );

  const signOut = useCallback(async () => {
    // State is cleared FIRST. If the network call fails we still want the
    // device to stop showing account data — a sign-out that silently does
    // nothing because the request errored is a real security problem.
    setSession(null);
    setStatus('unauthenticated');
    await repository.signOut().catch(() => undefined);
  }, [repository]);

  const value = useMemo<AuthContextValue>(
    () => ({ status, session, isSubmitting, signIn, register, signOut }),
    [status, session, isSubmitting, signIn, register, signOut],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

const defaultRepository: AuthRepository = new MockAuthRepository();

export function useAuth(): AuthContextValue {
  const context = use(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside <AuthProvider>.');
  }
  return context;
}
