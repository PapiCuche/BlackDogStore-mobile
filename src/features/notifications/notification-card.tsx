import { Pressable, View } from 'react-native';

import { Card, StatusBadge, Text } from '@/design-system';
import type { AppNotification } from '@/domain/notifications/types';
import { describeNotificationPriority } from '@/domain/notifications/types';
import { useTheme } from '@/theme/theme-provider';

/**
 * One notice in the inbox.
 *
 * Unread is marked by a DOT **and** by the word «No leído», never by colour
 * alone: somebody who cannot separate the two tones still has to be able to
 * tell which notices are new.
 *
 * The priority badge comes from the domain, and `info` shows none — a badge on
 * every row is a badge that says nothing. The card never promotes a notice to
 * urgent because of what its text says; that is the server's call.
 */
export type NotificationCardProps = {
  notification: AppNotification;
  onPress?: () => void;
};

function formatMoment(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  return at.toLocaleDateString('es-PE', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function NotificationCard({ notification, onPress }: NotificationCardProps) {
  const theme = useTheme();
  const unread = notification.readAt === null;
  const priority = describeNotificationPriority(notification.priority);
  const moment = formatMoment(notification.createdAt);

  const body = (
    <Card>
      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        <View
          accessibilityElementsHidden
          importantForAccessibility="no"
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            marginTop: theme.spacing.sm,
            backgroundColor: unread ? theme.colors.accent : 'transparent',
          }}
        />
        <View style={{ flex: 1, gap: theme.spacing.xs }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: theme.spacing.sm,
            }}
          >
            <Text variant="headline" style={{ flex: 1 }}>
              {notification.title}
            </Text>
            {priority.label === null ? null : (
              <StatusBadge
                label={priority.label}
                tone={priority.tone}
                size="small"
                accessibilityPrefix="Prioridad del aviso"
              />
            )}
          </View>
          {notification.body ? (
            <Text variant="subhead" color="textSecondary">
              {notification.body}
            </Text>
          ) : null}
          <Text variant="caption" color="textTertiary">
            {unread ? `${moment} · No leído` : moment}
          </Text>
        </View>
      </View>
    </Card>
  );

  if (!onPress) return body;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${notification.title}${unread ? ', no leído' : ''}`}
      accessibilityHint={unread ? 'Marca el aviso como leído' : undefined}
    >
      {body}
    </Pressable>
  );
}
