import { Stack, router } from 'expo-router';
import { View } from 'react-native';

import {
  AppHeader,
  Card,
  EmptyState,
  icons,
  LoadingState,
  Screen,
} from '@/design-system';
import { CAP_COMMUNICATIONS_MANAGE } from '@/domain/internal/announcement-types';
import { hasUxCapability } from '@/domain/internal/types';
import { AnnouncementComposer } from '@/features/internal/announcement-composer';
import { useCreateAnnouncementDraft } from '@/hooks/use-internal-communications';
import { useInternalContext } from '@/hooks/use-internal-sales';
import { useTheme } from '@/theme/theme-provider';

/**
 * Write a new communiqué — M12C.
 *
 * `communications.manage` gates it, and the server asks again on the POST. The
 * capability is checked here so somebody who does not administer messages is
 * told so instead of filling a form that would be refused.
 *
 * ON SUCCESS IT GOES TO THE DRAFT, not back to the list: the message still has
 * no audience, and the next decisions — who reads it, and whether to send it —
 * live on that screen.
 */
export default function NewCommunicationScreen() {
  const theme = useTheme();
  const { data: context, isPending } = useInternalContext();
  const mayManage = hasUxCapability(context ?? null, CAP_COMMUNICATIONS_MANAGE);
  const create = useCreateAnnouncementDraft();

  if (isPending) {
    return (
      <>
        <Stack.Screen options={{ title: 'Nuevo comunicado' }} />
        <Screen scrollable>
          <LoadingState label="Cargando" />
        </Screen>
      </>
    );
  }

  if (!mayManage) {
    return (
      <>
        <Stack.Screen options={{ title: 'Nuevo comunicado' }} />
        <Screen scrollable contentContainerStyle={{ flexGrow: 1 }}>
          <EmptyState
            icon={icons.info}
            title="No administras comunicados"
            message="Solo quien redacta los comunicados de la empresa puede crear uno."
          />
        </Screen>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Nuevo comunicado' }} />
      <Screen scrollable>
        <View style={{ gap: theme.spacing.md }}>
          <AppHeader
            title="Nuevo comunicado"
            eyebrow="Área interna"
            subtitle="Redacta el mensaje. Dirigirlo y publicarlo son el paso siguiente."
          />
          <Card>
            <AnnouncementComposer
              isBusy={create.isPending}
              error={create.error}
              onCreate={(input) =>
                create.mutate(input, {
                  // `replace`, not `push`: the form has done its job and going
                  // back to a blank one would invite a second draft of the
                  // same message.
                  onSuccess: (draft) =>
                    router.replace(`/internal/communications/${draft.id}`),
                })
              }
            />
          </Card>
        </View>
      </Screen>
    </>
  );
}
