import { QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from '@/auth/auth-provider';
import { CartProvider } from '@/cart/cart-provider';
import { ConnectivityProvider } from '@/connectivity/connectivity-provider';
import { DeepLinkProvider } from '@/linking/deep-link-provider';
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
 *  - **DeepLinkProvider** innermost of all: it reads auth to decide whether a
 *    private destination may open, and it navigates — so everything it depends
 *    on must already exist above it.
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
              {/* The basket sits INSIDE auth but is not owned by it: browsing
                  and adding to a cart never require a session (DEC-MOBILE-006),
                  and signing in must not empty what someone already chose. It is
                  inside only so a screen can read both from one tree. */}
              <CartProvider>
                <DeepLinkProvider>{children}</DeepLinkProvider>
              </CartProvider>
            </AuthProvider>
          </AppThemeProvider>
        </QueryClientProvider>
      </ConnectivityProvider>
    </SafeAreaProvider>
  );
}
