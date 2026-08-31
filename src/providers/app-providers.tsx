import { QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from '@/auth/auth-provider';
import { ConnectivityProvider } from '@/connectivity/connectivity-provider';
import { AppThemeProvider } from '@/theme/theme-provider';

import { createQueryClient } from './query-client';
import { QueryLifecycleBridges } from './query-lifecycle';

/**
 * Every app-wide provider, in one place and in a deliberate order.
 *
 *   SafeArea → Connectivity → Query → Theme → Auth → lifecycle bridges
 *
 * Why this order:
 *
 *  - **SafeArea** outermost: layout must be resolvable before anything renders.
 *  - **Connectivity** next: it depends on nothing and everything below may read
 *    it. Putting it above Query is what lets the online bridge exist at all.
 *  - **Query** before Theme and Auth: both may eventually read or invalidate
 *    server state, and neither is needed to fetch.
 *  - **Auth** innermost of the providers: it is the only one that needs the
 *    QueryClient (to evict private cache) and the theme (to render).
 *  - **Lifecycle bridges** last, inside all four, because each one reads from a
 *    different provider — connectivity, query client and auth.
 *
 * The QueryClient is created inside `useState` rather than at module scope so a
 * Fast Refresh — or a test mounting the tree twice — gets a clean cache instead
 * of inheriting the previous run's.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);

  return (
    <SafeAreaProvider>
      <ConnectivityProvider>
        <QueryClientProvider client={queryClient}>
          <AppThemeProvider>
            <AuthProvider>
              <QueryLifecycleBridges />
              {children}
            </AuthProvider>
          </AppThemeProvider>
        </QueryClientProvider>
      </ConnectivityProvider>
    </SafeAreaProvider>
  );
}
