import { CAP_COMMUNICATIONS_MANAGE } from '@/domain/internal/announcement-types';
import { CAP_SETTINGS_VIEW } from '@/domain/internal/messaging-types';
import { CAP_INVENTORY_VIEW } from '@/domain/internal/inventory-types';
import { CAP_SALES_POS_USE } from '@/domain/internal/pos-types';
import { CAP_SERVICE_ORDERS_VIEW } from '@/domain/internal/service-types';
import {
  CAP_SALES_ORDERS_VIEW,
  hasUxCapability,
  type InternalContext,
} from '@/domain/internal/types';

/**
 * What the internal area can actually SHOW today.
 *
 * ⚠️  THIS IS NOT AUTHORISATION. It answers "does a screen for this exist in
 * the app?", never "may this person do it". The server re-resolves capabilities
 * on every request, and a module listed here still returns 403 to someone who
 * lacks the permission.
 *
 * WHY `integration` EXISTS. A company can grant `service.customers.view` today
 * and there is no customers screen in this app. Drawing a tile that leads
 * nowhere would be worse than saying so: the person would conclude the app is
 * broken rather than unfinished.
 *
 * Inventory was this docstring's example until M7A built it, and technical
 * service was `pending-domain` — neither side existed — until M8 built both.
 * That is the shape of the field: entries move toward `ready` as the code
 * lands, and the capability they name never changes.
 */
export type ModuleIntegration =
  /** Built and usable now. */
  | 'ready'
  /** The backend has it; this app has no screen yet. */
  | 'pending-mobile'
  /** Neither side exists. */
  | 'pending-domain';

export type InternalModule = {
  key: string;
  title: string;
  description: string;
  /**
   * The capability the SERVER will demand. Used to decide what to draw.
   *
   * `null` is not "no check": it means the server gates this on being an
   * active member of the company and nothing more. M12B's inbox is the first
   * of those — your own notices are not administrative data about other
   * people, so requiring a permission would let an admin stop somebody
   * reading their own assignment.
   */
  requires: string | null;
  integration: ModuleIntegration;
  /** Only for `ready` modules. */
  route?: string;
};

export const INTERNAL_MODULES: readonly InternalModule[] = [
  {
    key: 'sales-orders',
    title: 'Pedidos',
    description: 'Consulta y despacho de los pedidos de la empresa.',
    requires: CAP_SALES_ORDERS_VIEW,
    integration: 'ready',
    route: '/internal/orders',
  },
  {
    key: 'pos',
    title: 'Punto de venta',
    description: 'Cobrar en mostrador, con el stock y los precios de la empresa.',
    // IP1A. The SAME capability the backend enforces — `Ventas` holds it and
    // `Inventario` does not, measured against the resolver rather than assumed.
    requires: CAP_SALES_POS_USE,
    integration: 'ready',
    route: '/internal/pos',
  },
  {
    key: 'inventory',
    title: 'Inventario',
    description: 'Stock y movimientos por sucursal.',
    requires: CAP_INVENTORY_VIEW,
    integration: 'ready',
    route: '/internal/inventory',
  },
  {
    key: 'customers',
    title: 'Clientes',
    description: 'Fichas y historial comercial.',
    requires: 'service.customers.view',
    integration: 'pending-mobile',
  },
  {
    key: 'service',
    title: 'Servicio técnico',
    description: 'Recepción de equipos y órdenes de servicio.',
    requires: CAP_SERVICE_ORDERS_VIEW,
    integration: 'ready',
    route: '/internal/service',
  },
  {
    key: 'notifications',
    title: 'Avisos',
    description: 'Asignaciones y comunicados que te tocan.',
    // M12B. No capability: active membership is the whole requirement, which
    // is how `InternalNotificationListView` is written.
    requires: null,
    integration: 'ready',
    route: '/internal/notifications',
  },
  {
    key: 'communications',
    title: 'Comunicados',
    description: 'Lo que la empresa comunicó, y cuántos lo leyeron.',
    // M12C. The SENDER's view: it lists drafts and discarded messages, so it
    // asks for the capability that administers them. Reading a communiqué
    // addressed to you needs none and lives in the inbox.
    requires: CAP_COMMUNICATIONS_MANAGE,
    integration: 'ready',
    route: '/internal/communications',
  },
  {
    key: 'messaging',
    title: 'Avisos por WhatsApp',
    description: 'Plantillas, idioma y si los avisos están activos.',
    // WHATSAPP-NOTIFY. `settings.view` reads it; changing it needs
    // `settings.manage`, and the screen asks for that separately — somebody
    // may be allowed to see the setup without being allowed to alter it.
    requires: CAP_SETTINGS_VIEW,
    integration: 'ready',
    route: '/internal/settings/messaging',
  },
  {
    key: 'settings',
    title: 'Configuración',
    description: 'Datos, sucursales y personal de la empresa.',
    requires: 'company.manage',
    integration: 'pending-mobile',
  },
];

/**
 * The modules to draw for this context.
 *
 * Only what the person actually holds. A module they lack is not shown greyed
 * out — telling someone which permissions they do not have is telling them what
 * the company's structure looks like, and they did not ask.
 */
export function visibleModules(context: InternalContext | null): readonly InternalModule[] {
  if (!context) return [];
  return INTERNAL_MODULES.filter(
    (module) => module.requires === null || hasUxCapability(context, module.requires),
  );
}
