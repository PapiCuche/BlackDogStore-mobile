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
    status: 'API_READY',
    note: 'GET /api/products/ y /api/categories/ existen y están verificados, pero resuelven el tenant por Host y no devuelven nada a un cliente móvil. Bloqueado por BR-002.',
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
    note: 'El backend usa JWT en cookies HttpOnly + CSRF, un contrato pensado para navegador. Mobile necesita un contrato nativo: BR-001.',
  },
  companyBrand: {
    label: 'Marca / multiempresa',
    status: 'MOCK',
    note: 'Company existe en Django pero no expone campos de marca ni un endpoint público. Propuesta en BR-006.',
  },
};

/** Whether a feature is currently reading fixtures rather than the backend. */
export function isMockBacked(feature: FeatureKey): boolean {
  const status = featureIntegration[feature].status;
  return status === 'MOCK' || status === 'API_PENDING' || status === 'API_READY';
}
