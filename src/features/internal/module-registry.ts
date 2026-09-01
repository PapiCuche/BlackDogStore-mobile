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
 * WHY `integration` EXISTS. A company can grant `inventory.view` today — the
 * capability has been ACTIVE since the backend's Phase 2D — and there is no
 * inventory screen in this app. Drawing a tile that leads nowhere would be
 * worse than saying so: the person would conclude the app is broken rather than
 * unfinished.
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
  /** The capability the SERVER will demand. Used to decide what to draw. */
  requires: string;
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
    key: 'inventory',
    title: 'Inventario',
    description: 'Stock, movimientos y reportes por sucursal.',
    requires: 'inventory.view',
    // The backend enforces this capability already; the app has no screen.
    integration: 'pending-mobile',
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
    description: 'Órdenes de reparación y diagnóstico.',
    requires: 'service.orders.view',
    // Neither side exists: there is no repair model in the backend at all.
    integration: 'pending-domain',
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
  return INTERNAL_MODULES.filter((module) => hasUxCapability(context, module.requires));
}
