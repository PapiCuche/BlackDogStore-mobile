/**
 * The design system's public surface.
 *
 * Feature and screen code imports from `@/design-system` and nothing deeper.
 * That is what makes it possible to change a component's internals — or to see
 * at a glance everything the app is allowed to render — without auditing every
 * import in the tree.
 */
export { AppHeader, type AppHeaderProps } from './app-header';
export { Avatar, type AvatarProps } from './avatar';
export { Badge, type BadgeProps, type BadgeTone } from './badge';
export { Button, type ButtonProps, type ButtonSize, type ButtonVariant } from './button';
export { Card, type CardProps } from './card';
export { Divider, type DividerProps } from './divider';
export { GlassSurface, type GlassSurfaceProps } from './glass-surface';
export { Icon, icons, type IconKey, type IconName, type IconProps } from './icon';
export { IconButton, type IconButtonProps } from './icon-button';
export { Input, type InputProps } from './input';
export {
  KeyValueRow,
  type KeyValueEmphasis,
  type KeyValueLayout,
  type KeyValueRowProps,
} from './key-value-row';
export { ListRow, type ListRowProps } from './list-row';
export { glassStackScreenOptions, renderHeaderBackground } from './navigation-chrome';
export { OfflineBanner } from './offline-banner';
export { Screen, type ScreenProps } from './screen';
export { SearchInput, type SearchInputProps } from './search-input';
export { SectionHeader, type SectionHeaderProps } from './section-header';
export { Skeleton, SkeletonCard, type SkeletonProps } from './skeleton';
export {
  EmptyState,
  ErrorState,
  LoadingState,
  type EmptyStateProps,
  type ErrorStateProps,
  type LoadingStateProps,
} from './states';
export { StaleDataNotice } from './stale-data-notice';
export { StatusBadge, statusToneColor, type StatusBadgeProps } from './status-badge';
export { Text, type TextColor, type TextProps, type TextVariant } from './text';
