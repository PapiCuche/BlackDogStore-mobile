import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { icons } from '@/design-system';
import { hasFeature } from '@/domain/company/types';
import { useCompanyBrand } from '@/hooks/use-company-brand';
import { useAppTheme } from '@/theme/theme-provider';

/**
 * The main tab bar.
 *
 * DECISION: `NativeTabs`, not a JavaScript tab bar.
 *
 * It renders a real `UITabBar` on iOS and a Material bottom navigation bar on
 * Android. That buys, for free and correctly: the home-indicator inset on
 * notched iPhones, the iOS 26 minimize-on-scroll behaviour, scroll-to-top on
 * re-tap, Android's ripple and back behaviour, and Dynamic Type on the labels.
 * A hand-rolled tab bar has to reimplement each of those and usually gets the
 * safe-area maths wrong.
 *
 * Icons are SF Symbols on iOS and Material Symbols on Android — the same
 * concept drawn the way each platform draws it, which is the "no hacer que
 * Android parezca un iPhone" rule made literal.
 *
 * MULTI-TENANCY: which tabs exist comes from the tenant's `enabledFeatures`,
 * not from a hardcoded list. The pilot enables all of them, so this is
 * currently a no-op — but it is the seam that lets a tenant without a workshop
 * ship without a Repairs tab.
 */
export default function TabsLayout() {
  const { theme } = useAppTheme();
  const brand = useCompanyBrand();

  return (
    <NativeTabs
      backgroundColor={theme.colors.background}
      iconColor={{ default: theme.colors.textTertiary, selected: theme.colors.textPrimary }}
      labelStyle={{
        default: { color: theme.colors.textTertiary },
        selected: { color: theme.colors.textPrimary },
      }}
      // The tab bar gets out of the way as the customer reads down a list, and
      // comes back the moment they scroll up.
      minimizeBehavior="onScrollDown"
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Inicio</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: icons.home.ios, selected: icons.homeSelected.ios }}
          md={icons.home.android}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="repairs" hidden={!hasFeature(brand, 'repairs')}>
        <NativeTabs.Trigger.Label>Reparaciones</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: icons.repairs.ios, selected: icons.repairsSelected.ios }}
          md={icons.repairs.android}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="shop" hidden={!hasFeature(brand, 'shop')}>
        <NativeTabs.Trigger.Label>Tienda</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: icons.shop.ios, selected: icons.shopSelected.ios }}
          md={icons.shop.android}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="orders" hidden={!hasFeature(brand, 'orders')}>
        <NativeTabs.Trigger.Label>Pedidos</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: icons.orders.ios, selected: icons.ordersSelected.ios }}
          md={icons.orders.android}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>Perfil</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: icons.profile.ios, selected: icons.profileSelected.ios }}
          md={icons.profile.android}
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
