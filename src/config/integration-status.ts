/**
 * How far each feature actually is from the real backend.
 *
 * This is not documentation — the app reads it at runtime to decide whether to
 * show the "datos de ejemplo" marker. Keeping the flag next to the UI that
 * depends on it is what stops a mock screen from quietly being presented as
 * live data. docs/INTEGRATION_STATUS.md is generated FROM this shape by hand;
 * if the two disagree, this file is right.
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

export type FeatureKey = 'catalog' | 'orders' | 'repairs' | 'auth' | 'companyBrand';

export type FeatureIntegration = {
  label: string;
  status: IntegrationStatus;
  /** Why it is at this status. Shown in Profile > Estado de integración. */
  note: string;
};

export const featureIntegration: Record<FeatureKey, FeatureIntegration> = {
  catalog: {
    label: 'Catálogo',
    // M2 — the first feature to earn this. The app calls
    // /api/v1/storefront/<company_slug>/ on origin/master b301637b, where the
    // server resolves an active company from the path and scopes every
    // queryset to it. Covered by tests on both sides.
    status: 'TESTED',
    note: 'Integrado con /api/v1/storefront/<empresa>/ — aislado por empresa en el servidor. Cubierto por tests. En development sigue disponible el modo mock.',
  },
  orders: {
    label: 'Pedidos',
    status: 'API_PENDING',
    note: 'GET /api/orders/ existe pero exige autenticación por cookie + CSRF. Bloqueado por BR-001. Además no expone fulfillment_status (BR-003).',
  },
  repairs: {
    label: 'Reparaciones',
    status: 'MOCK',
    note: 'No existe ningún modelo de reparación en Django. Propuesta completa en BR-005.',
  },
  auth: {
    label: 'Autenticación',
    status: 'MOCK',
    note: 'El backend usa JWT en cookies HttpOnly + CSRF, un contrato pensado para navegador. Mobile necesita un contrato nativo acotado a /api/v1/: BR-001 y BR-007.',
  },
  companyBrand: {
    label: 'Marca / multiempresa',
    status: 'MOCK',
    note: 'Company existe en Django pero no expone campos de marca ni un endpoint público. Un build que no sea el piloto no recibe branding. Propuesta en BR-006.',
  },
};

/** Whether a feature is currently reading fixtures rather than the backend. */
export function isMockBacked(feature: FeatureKey): boolean {
  const status = featureIntegration[feature].status;
  return status === 'MOCK' || status === 'API_PENDING' || status === 'API_READY';
}
