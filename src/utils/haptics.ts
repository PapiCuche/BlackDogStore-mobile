import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Haptic feedback.
 *
 * Used sparingly and only where the brief calls for it: a selection change, a
 * successful action, a rejected one. Nothing vibrates on scroll, on navigation
 * or on every tap — constant buzzing is the fastest way to get a user to turn
 * feedback off system-wide.
 *
 * Every call is fire-and-forget and swallows its error: a device with the Taptic
 * Engine disabled must not take a screen down with it.
 */

const isSupported = Platform.OS === 'ios' || Platform.OS === 'android';

/** A discrete choice changed — segmented control, chip, theme picker. */
export function hapticSelection(): void {
  if (!isSupported) return;
  void Haptics.selectionAsync().catch(() => undefined);
}

/** An action completed. Reserved for genuine completions, not for navigation. */
export function hapticSuccess(): void {
  if (!isSupported) return;
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
}

/** An action was rejected — failed validation, failed request. */
export function hapticError(): void {
  if (!isSupported) return;
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
}
