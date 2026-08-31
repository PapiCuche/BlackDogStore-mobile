import type { AndroidSymbol, SFSymbol } from 'expo-symbols';
import { SymbolView } from 'expo-symbols';
import { View, type ColorValue } from 'react-native';

import { sizes } from '@/theme';

export type IconName = {
  /** SF Symbol. iOS renders this. */
  ios: SFSymbol;
  /** Material Symbol. Android and web render this. */
  android: AndroidSymbol;
};

export type IconProps = {
  name: IconName;
  size?: number;
  color: ColorValue;
  /**
   * Icons are decorative by default. When an icon is the ONLY content of a
   * control, the control carries the label — see `IconButton`.
   */
  accessibilityLabel?: string;
};

/**
 * Platform-native iconography.
 *
 * SF Symbols on iOS and Material Symbols on Android, from one call site. This
 * is the "misma jerarquía, distinto sistema" rule made concrete: the same
 * concept, drawn the way each platform draws it, instead of one icon font
 * imposed on both.
 *
 * The fallback is an empty spacer of the right size rather than nothing, so a
 * platform without symbol support (and the Jest environment) keeps the layout
 * it would otherwise have.
 */
export function Icon({ name, size = sizes.iconMd, color, accessibilityLabel }: IconProps) {
  return (
    <SymbolView
      name={{ ios: name.ios, android: name.android, web: name.android }}
      size={size}
      tintColor={color}
      accessible={accessibilityLabel !== undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityLabel !== undefined ? 'image' : 'none'}
      fallback={<View style={{ width: size, height: size }} />}
      style={{ width: size, height: size }}
    />
  );
}

/**
 * The app's icon vocabulary.
 *
 * Named by MEANING, not by glyph. A screen asks for `icons.repairs`, so
 * changing which symbol represents a repair is one edit here rather than a
 * search for `"wrench.and.screwdriver"` across the codebase.
 */
export const icons = {
  home: { ios: 'house', android: 'home' },
  homeSelected: { ios: 'house.fill', android: 'home' },
  repairs: { ios: 'wrench.and.screwdriver', android: 'build' },
  repairsSelected: { ios: 'wrench.and.screwdriver.fill', android: 'build' },
  shop: { ios: 'bag', android: 'shopping_bag' },
  shopSelected: { ios: 'bag.fill', android: 'shopping_bag' },
  orders: { ios: 'shippingbox', android: 'inventory_2' },
  ordersSelected: { ios: 'shippingbox.fill', android: 'inventory_2' },
  profile: { ios: 'person.crop.circle', android: 'account_circle' },
  profileSelected: { ios: 'person.crop.circle.fill', android: 'account_circle' },

  chevronRight: { ios: 'chevron.right', android: 'chevron_right' },
  search: { ios: 'magnifyingglass', android: 'search' },
  clear: { ios: 'xmark.circle.fill', android: 'cancel' },
  close: { ios: 'xmark', android: 'close' },
  check: { ios: 'checkmark', android: 'check' },
  eye: { ios: 'eye', android: 'visibility' },
  eyeOff: { ios: 'eye.slash', android: 'visibility_off' },
  warning: { ios: 'exclamationmark.triangle', android: 'warning' },
  offline: { ios: 'wifi.slash', android: 'wifi_off' },
  empty: { ios: 'tray', android: 'inbox' },
  phone: { ios: 'phone', android: 'call' },
  mail: { ios: 'envelope', android: 'mail' },
  globe: { ios: 'globe', android: 'language' },
  pin: { ios: 'mappin.and.ellipse', android: 'location_on' },
  theme: { ios: 'circle.lefthalf.filled', android: 'contrast' },
  signOut: { ios: 'rectangle.portrait.and.arrow.right', android: 'logout' },
  info: { ios: 'info.circle', android: 'info' },
} as const satisfies Record<string, IconName>;

export type IconKey = keyof typeof icons;
