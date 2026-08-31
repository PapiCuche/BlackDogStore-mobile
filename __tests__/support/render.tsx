import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';

import { AuthProvider } from '@/auth/auth-provider';
import type { AuthRepository } from '@/auth/auth-repository';
import { ConnectivityProvider } from '@/connectivity/connectivity-provider';
import type { ConnectivityState } from '@/connectivity/connectivity-state';
import { AppThemeProvider } from '@/theme/theme-provider';

/**
 * Render a component inside the providers it actually runs under.
 *
 * ASYNC because React Native Testing Library v14's `render` is async — it flushes
 * effects and microtasks before returning, so every test must await it.
 *
 * Every test gets a FRESH QueryClient with retries disabled. A shared client
 * would leak cached data between tests, and retries would turn a deliberate
 * error-path test into a multi-second timeout.
 */
export async function renderWithProviders(
  ui: ReactElement,
  options: RenderOptions & {
    authRepository?: AuthRepository;
    /** Starting connectivity. Defaults to online, as most screens assume. */
    connectivity?: ConnectivityState;
  } = {},
) {
  const { authRepository, connectivity = 'online', ...renderOptions } = options;

  // Drive the NATIVE boundary, not just the provider's initial state: the
  // provider asks the OS on mount, and that answer would otherwise overwrite
  // whatever the test asked for.
  const network = jest.requireMock('expo-network') as {
    getNetworkStateAsync: jest.Mock;
  };
  network.getNetworkStateAsync.mockResolvedValue(
    connectivity === 'offline'
      ? { isConnected: false, isInternetReachable: false }
      : connectivity === 'unknown'
        ? {}
        : { isConnected: true, isInternetReachable: true },
  );

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });

  function Wrapper({ children }: { children: ReactNode }) {
    // Mirrors the real provider order from AppProviders, minus SafeArea (which
    // jest.setup stubs) — so a test exercises the same context graph the app has.
    return (
      <ConnectivityProvider initialState={connectivity}>
        <QueryClientProvider client={queryClient}>
          <AppThemeProvider>
            <AuthProvider repository={authRepository}>{children}</AuthProvider>
          </AppThemeProvider>
        </QueryClientProvider>
      </ConnectivityProvider>
    );
  }

  const result = await render(ui, { wrapper: Wrapper, ...renderOptions });
  return { queryClient, ...result };
}
