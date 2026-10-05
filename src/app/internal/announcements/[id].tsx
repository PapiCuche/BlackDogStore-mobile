import { Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import {
  AppHeader,
  Card,
  Divider,
  ErrorState,
  KeyValueRow,
  LoadingState,
  Screen,
  Text,
} from '@/design-system';
import { useAddressedAnnouncement } from '@/hooks/use-internal-communications';
import { useTheme } from '@/theme/theme-provider';
import { formatDate } from '@/utils/format';

/**
 * A communiqué that was sent to ME — M12C, recipient side.
 *
 * NO CAPABILITY, and that is the server's rule: reading a message addressed to
 * you is not an authority. What the server requires instead is the notification
 * row that proves it was addressed to you in this company, which is also what
 * froze the audience — somebody who acquired the role last week was never
 * written to, so last month's message does not exist for them.
 *
 * A 404 IS THE NORMAL REFUSAL and reads as "this communiqué is not available":
 * the server will not distinguish "not yours", "not published" and "not at
 * all", because distinguishing them would let somebody enumerate what other
 * companies tell their staff.
 *
 * NO AUDIENCE SECTION. The server omits the targeting for a recipient, and the
 * screen has nowhere to show it even if a future payload carried it.
 */
export default function AddressedAnnouncementScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const parsed = Number(id);
  const announcementId = Number.isFinite(parsed) ? parsed : undefined;

  const query = useAddressedAnnouncement(announcementId);
  const { data: announcement, isPending, isError, error, refetch } = query;

  if (isPending) {
    return (
      <>
        <Stack.Screen options={{ title: 'Comunicado' }} />
        <Screen scrollable>
          <LoadingState label="Cargando comunicado" />
        </Screen>
      </>
    );
  }

  if (isError || !announcement) {
    return (
      <>
        <Stack.Screen options={{ title: 'Comunicado' }} />
        <Screen scrollable contentContainerStyle={{ flexGrow: 1 }}>
          <ErrorState error={error} onRetry={() => void refetch()} />
        </Screen>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Comunicado' }} />
      <Screen scrollable>
        <View style={{ gap: theme.spacing.md }}>
          <AppHeader title={announcement.title} eyebrow="Comunicado interno" />
          <Card>
            <View style={{ gap: theme.spacing.sm }}>
              <Text>{announcement.body}</Text>
              <Divider />
              <KeyValueRow label="Firma" value={announcement.author || '—'} />
              <KeyValueRow
                label="Publicado"
                value={
                  announcement.publishedAt ? formatDate(announcement.publishedAt) : '—'
                }
              />
            </View>
          </Card>
        </View>
      </Screen>
    </>
  );
}
