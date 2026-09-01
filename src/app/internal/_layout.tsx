import { Stack } from 'expo-router';

import { glassStackScreenOptions } from '@/design-system';
import { useTheme } from '@/theme/theme-provider';

/**
 * The internal area's own stack.
 *
 * SEPARATE from the customer tabs on purpose (DEC-MOBILE-007). An employee who
 * also shops here keeps Home, Shop and their own Orders exactly as before; the
 * company's data lives behind its own entrance, and nothing about being staff
 * changes the customer experience.
 *
 * Not a second app either — same session, same theme, same navigation stack —
 * just a clearly marked room inside it.
 */
export default function InternalLayout() {
  const theme = useTheme();

  return (
    <Stack screenOptions={{ headerBackTitle: 'Atrás', ...glassStackScreenOptions(theme) }} />
  );
}
