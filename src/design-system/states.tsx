import { ActivityIndicator, View } from 'react-native';

import { ApiError, userFacingMessage } from '@/api/errors';
import { useTheme } from '@/theme/theme-provider';

import { Button } from './button';
import { Icon, icons, type IconName } from './icon';
import { SkeletonCard } from './skeleton';
import { Text } from './text';

/**
 * The non-happy paths.
 *
 * Every data screen has five states — LOADING, SUCCESS, EMPTY, ERROR and
 * OFFLINE — and four of them are here. They live in one file because they share
 * a layout and because keeping them together makes it obvious when a screen has
 * only handled some of them.
 */

type CenteredProps = {
  icon: IconName;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: 'neutral' | 'danger';
};

function CenteredState({ icon, title, message, actionLabel, onAction, tone = 'neutral' }: CenteredProps) {
  const theme = useTheme();

  return (
    <View
      // One accessibility node, so a screen reader reads the whole state as a
      // sentence rather than as three disconnected fragments.
      accessible
      accessibilityLabel={message ? `${title}. ${message}` : title}
      accessibilityLiveRegion="polite"
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: theme.spacing.section,
        paddingHorizontal: theme.spacing.lg,
        gap: theme.spacing.sm,
      }}
    >
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor:
            tone === 'danger' ? theme.colors.statusDangerSurface : theme.colors.surfaceSubtle,
          marginBottom: theme.spacing.xxs,
        }}
      >
        <Icon
          name={icon}
          size={theme.sizes.iconXl}
          color={tone === 'danger' ? theme.colors.statusDanger : theme.colors.textTertiary}
        />
      </View>

      <Text variant="title3" center>
        {title}
      </Text>

      {message ? (
        <Text variant="subhead" color="textSecondary" center style={{ maxWidth: 320 }}>
          {message}
        </Text>
      ) : null}

      {actionLabel && onAction ? (
        <Button
          label={actionLabel}
          onPress={onAction}
          variant="secondary"
          size="compact"
          style={{ marginTop: theme.spacing.xs }}
        />
      ) : null}
    </View>
  );
}

export type EmptyStateProps = {
  title: string;
  message?: string;
  icon?: IconName;
  actionLabel?: string;
  onAction?: () => void;
};

/** Nothing to show, and that is not a failure. */
export function EmptyState({ title, message, icon = icons.empty, actionLabel, onAction }: EmptyStateProps) {
  return (
    <CenteredState
      icon={icon}
      title={title}
      message={message}
      actionLabel={actionLabel}
      onAction={onAction}
    />
  );
}

export type ErrorStateProps = {
  error: unknown;
  onRetry?: () => void;
  /** Overrides the message derived from `error`. */
  title?: string;
};

/**
 * Something failed.
 *
 * An `offline` error gets its own icon and wording, because "sin conexión" and
 * "el servidor falló" call for different actions from the user and lumping them
 * together sends people to reboot their router over a 500.
 */
export function ErrorState({ error, onRetry, title }: ErrorStateProps) {
  const isOffline = error instanceof ApiError && error.kind === 'offline';
  // A feature with no backend is not a failure the user caused or can retry —
  // it reads as "todavía no", not as "algo salió mal".
  const isUnavailable = error instanceof Error && error.name === 'FeatureUnavailableError';
  const canRetry = !isUnavailable && (!(error instanceof ApiError) || error.isRetryable);

  return (
    <CenteredState
      icon={isUnavailable ? icons.info : isOffline ? icons.offline : icons.warning}
      tone={isUnavailable || isOffline ? 'neutral' : 'danger'}
      title={
        title ??
        (isUnavailable ? 'Próximamente' : isOffline ? 'Sin conexión' : 'Algo salió mal')
      }
      message={userFacingMessage(error)}
      actionLabel={onRetry && canRetry ? 'Reintentar' : undefined}
      onAction={onRetry}
    />
  );
}

export type LoadingStateProps = {
  /** Announced to assistive tech and shown under the spinner. */
  label?: string;
  /** Renders N card skeletons instead of a spinner. Preferred for lists. */
  skeletonCount?: number;
};

/**
 * Waiting.
 *
 * Skeletons are the default for lists because they preserve layout and make the
 * wait feel shorter; a bare spinner is reserved for cases where the shape of
 * the incoming content is genuinely unknown.
 */
export function LoadingState({ label = 'Cargando', skeletonCount }: LoadingStateProps) {
  const theme = useTheme();

  if (skeletonCount && skeletonCount > 0) {
    return (
      <View
        accessible
        accessibilityLabel={label}
        accessibilityLiveRegion="polite"
        style={{ gap: theme.spacing.sm }}
      >
        {Array.from({ length: skeletonCount }, (_, index) => (
          <SkeletonCard key={index} />
        ))}
      </View>
    );
  }

  return (
    <View
      accessible
      accessibilityLabel={label}
      accessibilityLiveRegion="polite"
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.sm,
        paddingVertical: theme.spacing.section,
      }}
    >
      <ActivityIndicator color={theme.colors.textSecondary} />
      <Text variant="footnote" color="textTertiary">
        {label}
      </Text>
    </View>
  );
}
