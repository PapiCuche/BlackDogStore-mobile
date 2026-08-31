import { Redirect } from 'expo-router';
import { View } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { LoadingState } from '@/design-system';
import { useTheme } from '@/theme/theme-provider';

/**
 * The bootstrap gate.
 *
 * Renders nothing of its own: it decides where the app opens, then gets out of
 * the way. Keeping this decision in a route (rather than in a conditional
 * inside the root layout) means Expo Router owns the navigation state, and the
 * back stack after the redirect is correct.
 */
export default function BootstrapScreen() {
  const { status } = useAuth();
  const theme = useTheme();

  if (status === 'loading') {
    // The native splash is usually still up here. This is the safety net for
    // the case where restoring a session outlives it.
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <LoadingState label="Preparando tu cuenta" />
      </View>
    );
  }

  return <Redirect href={status === 'authenticated' ? '/(tabs)' : '/(auth)/login'} />;
}
