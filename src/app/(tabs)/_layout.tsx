import { Tabs } from 'expo-router/js-tabs';
import { Platform, type ColorValue } from 'react-native';

import { Icon, icons, type IconName } from '@/design-system';
import type { CompanyFeature } from '@/domain/company/types';
import { useCompanyFeatures } from '@/hooks/use-company-brand';
import { useAppTheme } from '@/theme/theme-provider';

/**
 * The main tab bar.
 *
 * DECISION: DEC-MOBILE-001 — stable tab navigation over alpha native tabs.
 * See docs/ARCHITECTURE.md for the full record.
 *
 * M0 shipped this on `expo-router/unstable-native-tabs`. Architecture review
 * rejected that for the long-term foundation, and correctly:
 *
 *  1. The API is still under an `unstable` namespace and documented as alpha —
 *     it can change shape between SDK minors.
 *  2. Its `hidden` prop REMOUNTS the navigator and resets navigation state.
 *     Combined with per-tenant feature flags, that means a tenant whose brand
 *     resolves a moment after launch would see the whole tab stack reset.
 *
 * Alpha API + tenant-driven dynamic tabs is not a foundation. So the primary
 * navigation now uses the stable, publicly documented JS tabs navigator.
 *
 * `expo-router/js-tabs` is an Expo Router entry point, not a `@react-navigation/*`
 * import — SDK 56+ forbids importing those packages directly in app code, and
 * this respects that. (The same `Tabs` is re-exported from the `expo-router`
 * root but marked `@deprecated` in favour of this path.)
 *
 * What we give up: the real `UITabBar`, iOS 26 scroll-to-minimize, and the
 * native scroll-to-top on re-tap. What we get: an API that will still exist
 * next SDK, and tab visibility that does not reset the app. Native Tabs is
 * worth revisiting the moment Expo drops the `unstable` prefix — the tab bar is
 * one file, and every screen underneath it is untouched by the swap.
 *
 * MULTI-TENANCY: which tabs are reachable comes from the tenant's
 * `enabledFeatures`, via `href: null` rather than a remounting `hidden` prop.
 * `href: null` hides the tab from the bar and blocks navigation to it while
 * leaving the navigator's screen list intact — so toggling it costs no state.
 */
export default function TabsLayout() {
  const { theme } = useAppTheme();
  const features = useCompanyFeatures();

  /** `href: null` removes a tab from the bar without remounting the navigator. */
  const gate = (feature: CompanyFeature) => (features.includes(feature) ? undefined : null);

  /**
   * Build the `tabBarIcon` render prop for one tab.
   *
   * Returns an element, not a component: React Navigation calls this on every
   * focus change, and a component defined inside render would be a new type
   * each time, remounting the icon on every tab switch.
   */
  const tabIcon =
    (inactive: IconName, active: IconName) =>
    ({ focused, color, size }: { focused: boolean; color: ColorValue; size: number }) =>
      renderTabIcon(focused ? active : inactive, color, size);

  return (
    <Tabs
      screenOptions={{
        // Tab screens draw their own large in-page title so it can scroll away
        // with the content, the way an iOS list screen does.
        headerShown: false,
        sceneStyle: { backgroundColor: theme.colors.background },

        tabBarActiveTintColor: theme.colors.textPrimary,
        tabBarInactiveTintColor: theme.colors.textTertiary,
        tabBarStyle: {
          backgroundColor: theme.colors.background,
          borderTopColor: theme.colors.border,
          // Hairline, not 1pt: on a 3x display a 1pt rule is three device
          // pixels and reads as a heavy line under the content.
          borderTopWidth: theme.sizes.hairline,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          letterSpacing: -0.08,
        },
        tabBarItemStyle: { paddingTop: 4 },

        // Android's keyboard overlays the tab bar; iOS moves it out of the way
        // itself, and enabling this there causes a visible jump.
        tabBarHideOnKeyboard: Platform.OS === 'android',
        // Keeps a backgrounded tab from re-rendering on every parent update.
        freezeOnBlur: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Inicio',
          tabBarAccessibilityLabel: 'Inicio',
          tabBarIcon: tabIcon(icons.home, icons.homeSelected),
        }}
      />

      <Tabs.Screen
        name="repairs"
        options={{
          title: 'Reparaciones',
          tabBarAccessibilityLabel: 'Reparaciones',
          tabBarIcon: tabIcon(icons.repairs, icons.repairsSelected),
          href: gate('repairs'),
        }}
      />

      <Tabs.Screen
        name="shop"
        options={{
          title: 'Tienda',
          tabBarAccessibilityLabel: 'Tienda',
          tabBarIcon: tabIcon(icons.shop, icons.shopSelected),
          href: gate('shop'),
        }}
      />

      <Tabs.Screen
        name="orders"
        options={{
          title: 'Pedidos',
          tabBarAccessibilityLabel: 'Pedidos',
          tabBarIcon: tabIcon(icons.orders, icons.ordersSelected),
          href: gate('orders'),
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: 'Perfil',
          tabBarAccessibilityLabel: 'Perfil',
          tabBarIcon: tabIcon(icons.profile, icons.profileSelected),
        }}
      />
    </Tabs>
  );
}

function renderTabIcon(name: IconName, color: ColorValue, size: number) {
  return <Icon name={name} color={color} size={size} />;
}
