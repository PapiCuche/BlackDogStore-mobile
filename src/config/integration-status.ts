/**
 * How far each feature actually is from the real backend.
 *
 * THIS IS NOT DOCUMENTATION. The app reads it at runtime and renders it in
 * Profile > Estado de integración, so a wrong row is visible behaviour, not
 * editorial debt. `docs/INTEGRATION_STATUS.md` is written from this shape by
 * hand; if the two disagree, this file is right.
 *
 * IT WENT STALE ONCE, AND THAT IS WHY `source` EXISTS. Between M8 and IP2A this
 * table kept saying Auth was `MOCK`, Pedidos was `API_PENDING` "bloqueado por
 * BR-001", and Reparaciones was missing diagnosis and quoting — while the app
 * was calling `/api/v1/auth/`, `/api/v1/customer/<slug>/orders/` and forty-two
 * real service endpoints. Anybody who opened Profile was told the app was three
 * quarters mocked. It was not; the table simply never moved.
 *
 * A row now names the endpoint module it is integrated through, and a test
 * checks the pair: a feature that names a module which EXISTS may not claim to
 * be mock-backed. Forgetting to update this file after wiring a surface fails
 * the suite instead of quietly misinforming whoever reads the screen.
 */
export type IntegrationStatus =
  /** UI runs entirely on bundled fixtures. No endpoint exists. */
  | 'MOCK'
  /** UI is ready; the endpoint is specified but not built yet. */
  | 'API_PENDING'
  /** The endpoint exists and is verified, but the app is not wired to it. */
  | 'API_READY'
  /** The app calls the real endpoint. */
  | 'INTEGRATED'
  /** Integrated and covered by tests. */
  | 'TESTED';

export type FeatureKey =
  // ── Customer audience ────────────────────────────────────────────────────
  | 'catalog'
  | 'checkout'
  | 'orders'
  | 'repairs'
  | 'auth'
  | 'accountLifecycle'
  | 'companyBrand'
  // ── Internal audience ────────────────────────────────────────────────────
  | 'internalSales'
  | 'internalPos'
  | 'internalInventory'
  | 'inventoryCounts'
  | 'internalService';

export type FeatureIntegration = {
  label: string;
  status: IntegrationStatus;
  /** Why it is at this status. Shown in Profile > Estado de integración. */
  note: string;
  /**
   * The endpoint module this feature is integrated THROUGH, relative to `src/`,
   * or null when nothing is wired yet.
   *
   * Load-bearing, not a comment: a guard reads it. A row that names a module
   * which exists on disk cannot also claim to be mock-backed, which is exactly
   * the drift this table suffered before IP2B-G0.
   */
  source: string | null;
};

export const featureIntegration: Record<FeatureKey, FeatureIntegration> = {
  // ── Customer audience ─────────────────────────────────────────────────────
  catalog: {
    label: 'Catálogo',
    status: 'TESTED',
    note: 'Integrado con /api/v1/storefront/<empresa>/ — el servidor resuelve la empresa desde la ruta y acota cada queryset. En development sigue disponible el modo mock.',
    source: 'api/endpoints/catalog-v1.ts',
  },
  checkout: {
    label: 'Checkout',
    status: 'TESTED',
    note: 'Integrado con /api/v1/customer/<empresa>/checkout/. El servidor calcula el total y reserva el stock; la app no compone ningún importe.',
    source: 'api/endpoints/customer-checkout-v1.ts',
  },
  orders: {
    label: 'Pedidos',
    status: 'TESTED',
    // Was API_PENDING with a note blaming cookie+CSRF and BR-001. Both were
    // resolved in M4: the customer surface is Bearer-only under /api/v1/, and
    // BR-003 shipped, so `fulfillment_status` arrives with the order.
    note: 'Integrado con /api/v1/customer/<empresa>/orders/ — sesión nativa Bearer, sin cookies. Incluye fulfillment_status (BR-003).',
    source: 'api/endpoints/customer-orders-v1.ts',
  },
  repairs: {
    label: 'Reparaciones',
    status: 'TESTED',
    // The note used to say diagnosis, quoting and approval were pending. They
    // shipped in M9 and M10; the customer side reads the whole lifecycle.
    note: 'Integrado con /api/v1/customer/<empresa>/repairs/ — estado, cotización, decisión del cliente y resumen de pagos.',
    source: 'api/endpoints/customer-repairs-v1.ts',
  },
  auth: {
    label: 'Autenticación',
    status: 'TESTED',
    // Was MOCK, describing a browser-shaped cookie+CSRF contract as the only
    // option. BR-001A landed the native one and the app has used it since M3.
    note: 'Integrado con /api/v1/auth/ — login, refresh con rotación, logout y restore en arranque frío. El access token vive solo en memoria; el refresh en Keychain/Keystore.',
    source: 'api/endpoints/auth-v1.ts',
  },
  accountLifecycle: {
    label: 'Registro · verificación · reset',
    status: 'API_PENDING',
    // The one auth row that legitimately keeps this status. The screens exist
    // and are covered by tests, and login HIDES their links in backend mode
    // rather than offering a flow the native contract cannot complete.
    note: 'BR-001B. Las pantallas existen y funcionan en modo mock; en modo backend la app no ofrece los enlaces porque el contrato nativo todavía no implementa el ciclo de cuenta.',
    source: null,
  },
  companyBrand: {
    label: 'Marca / multiempresa',
    status: 'TESTED',
    note: 'Integrado con /api/v1/storefront/<empresa>/config/ — mismo payload que la web, resuelto por slug.',
    source: 'api/endpoints/storefront-config-v1.ts',
  },

  // ── Internal audience ─────────────────────────────────────────────────────
  //
  // Absent from this table entirely until IP2B-G0, which is its own kind of
  // wrong answer: the screen listed five features and the app had eleven, so a
  // reader was told the internal console did not exist.
  internalSales: {
    label: 'Interno · Pedidos',
    status: 'TESTED',
    note: 'Integrado con /api/v1/internal/<empresa>/sales/orders/ — listado, detalle y fulfillment. Capabilities resueltas por el servidor en cada petición.',
    source: 'api/endpoints/internal-v1.ts',
  },
  internalPos: {
    label: 'Interno · Punto de venta',
    status: 'TESTED',
    note: 'Integrado con /api/v1/internal/<empresa>/sales/pos/ — contexto, búsqueda, lectura de código, previsualización y venta. El total lo calcula siempre el servidor.',
    source: 'api/endpoints/internal-pos-v1.ts',
  },
  internalInventory: {
    label: 'Interno · Inventario',
    status: 'TESTED',
    note: 'Integrado con /api/v1/internal/<empresa>/inventory/ — resumen, stock por sucursal, kardex, movimientos manuales y transferencias entre sucursales.',
    source: 'api/endpoints/internal-inventory-v1.ts',
  },
  inventoryCounts: {
    label: 'Interno · Recuentos físicos',
    status: 'API_PENDING',
    // IP2B. The domain exists in the backend and the Web console drives it, but
    // there is no /api/v1/ adapter, so Mobile has nothing to call. Stated here
    // rather than left off the list: a missing row reads as "not a feature",
    // and this one is blocked, which is a different and useful thing to know.
    note: 'El dominio existe en el backend y la consola Web lo usa, pero no hay superficie /api/v1/ para recuentos. Mobile no puede integrarlo hasta que ese adapter se mergee. Ver docs/BACKEND_REQUIREMENTS.md > BR-009.',
    source: null,
  },
  internalService: {
    label: 'Interno · Servicio técnico',
    status: 'TESTED',
    note: 'Integrado con /api/v1/internal/<empresa>/service/ — recepción, diagnóstico, cotización, ejecución, repuestos, control de calidad, entrega y cobro.',
    source: 'api/endpoints/internal-service-v1.ts',
  },
};

/** Whether a feature is currently reading fixtures rather than the backend. */
export function isMockBacked(feature: FeatureKey): boolean {
  const status = featureIntegration[feature].status;
  return status === 'MOCK' || status === 'API_PENDING' || status === 'API_READY';
}
