import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';

import { AuthProvider } from '@/auth/auth-provider';
import type { AuthRepository } from '@/auth/auth-repository';
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
  options: RenderOptions & { authRepository?: AuthRepository } = {},
) {
  const { authRepository, ...renderOptions } = options;

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <AppThemeProvider>
          <AuthProvider repository={authRepository}>{children}</AuthProvider>
        </AppThemeProvider>
      </QueryClientProvider>
    );
  }

  const result = await render(ui, { wrapper: Wrapper, ...renderOptions });
  return { queryClient, ...result };
}
