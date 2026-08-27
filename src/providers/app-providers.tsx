import { QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from '@/auth/auth-provider';
import { AppThemeProvider } from '@/theme/theme-provider';

import { createQueryClient } from './query-client';

/**
 * Every app-wide provider, in one place and in a deliberate order.
 *
 *   SafeArea → Query → Theme → Auth
 *
 * SafeArea is outermost because layout must be resolvable before anything
 * renders. Auth is innermost because it is the only one that may eventually
 * want to invalidate queries and read themed UI on sign-out.
 *
 * The QueryClient is created inside `useState` rather than at module scope so a
 * Fast Refresh — or a test mounting the tree twice — gets a clean cache instead
 * of inheriting the previous run's.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AppThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </AppThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
