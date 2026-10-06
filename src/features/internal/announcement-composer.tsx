import { useState } from 'react';
import { View } from 'react-native';

import { Button, Input, Text } from '@/design-system';
import {
  ANNOUNCEMENT_BODY_MAX_LENGTH,
  ANNOUNCEMENT_TITLE_MAX_LENGTH,
} from '@/domain/internal/announcement-types';
import type { AnnouncementDraftInput } from '@/domain/internal/announcement-types';
import type { NotificationPriority } from '@/domain/notifications/types';
import { describeNotificationPriority } from '@/domain/notifications/types';
import { useTheme } from '@/theme/theme-provider';

/**
 * Write a communiqué — M12C, the part a phone can do.
 *
 * IT ONLY WRITES A DRAFT. Nothing here addresses the message or sends it: the
 * server creates it with no audience and refuses to publish one that has none,
 * so deciding who reads it is a separate, deliberate step on the next screen.
 *
 * THE PRIORITY IS THE RECIPIENT'S PROBLEM, not a decoration. `critical` lands
 * in somebody's inbox marked as such, so the four are spelled out with the same
 * words the inbox uses rather than offered as a colour.
 *
 * The lengths match `announcement_services.TITLE_MAX` and `BODY_MAX`. Stopping
 * the keyboard at the limit is a courtesy; the server validates again, and its
 * refusal is what gets shown.
 */
const PRIORITIES: readonly NotificationPriority[] = ['info', 'action', 'warning', 'critical'];

export type AnnouncementComposerProps = {
  isBusy: boolean;
  error: unknown;
  onCreate: (input: AnnouncementDraftInput) => void;
};

export function AnnouncementComposer({ isBusy, error, onCreate }: AnnouncementComposerProps) {
  const theme = useTheme();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState<NotificationPriority>('info');

  const ready = title.trim().length > 0 && body.trim().length > 0;

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <Input
        label="Título"
        value={title}
        onChangeText={setTitle}
        maxLength={ANNOUNCEMENT_TITLE_MAX_LENGTH}
        hint={`Hasta ${ANNOUNCEMENT_TITLE_MAX_LENGTH} caracteres.`}
      />
      <Input
        label="Mensaje"
        value={body}
        onChangeText={setBody}
        multiline
        numberOfLines={6}
        maxLength={ANNOUNCEMENT_BODY_MAX_LENGTH}
        hint="Lo que el personal va a leer en sus avisos."
      />

      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="subhead">Prioridad</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
          {PRIORITIES.map((option) => (
            <Button
              key={option}
              // The same words the inbox shows. `info` carries no label there,
              // so it is named here as what it is: an ordinary notice.
              label={describeNotificationPriority(option).label ?? 'Informativo'}
              size="compact"
              variant={priority === option ? 'primary' : 'secondary'}
              onPress={() => setPriority(option)}
            />
          ))}
        </View>
      </View>

      <Text variant="caption" color="textTertiary">
        Se guarda como borrador. Nadie lo recibe hasta que lo dirijas y lo publiques.
      </Text>

      <Button
        label="Guardar el borrador"
        loading={isBusy}
        disabled={!ready}
        onPress={() => onCreate({ title: title.trim(), body: body.trim(), priority })}
      />

      {error ? (
        <Text variant="caption" color="danger">
          {announcementErrorMessage(error)}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * The server's own sentence, whenever it sent one.
 *
 * «El comunicado necesita un título.» and «El título no puede pasar de 140
 * caracteres.» are the shop's language for its own rules, and replacing them
 * with a generic message would hide which rule was broken.
 */
export function announcementErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'No se pudo guardar el comunicado.';
}
