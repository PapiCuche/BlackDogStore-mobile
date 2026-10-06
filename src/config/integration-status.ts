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
  /**
   * The backend side exists and the app deliberately refuses the flow until a
   * verified dependency lands. The note names that dependency.
   */
  | 'BLOCKED'
  /** The app calls the real endpoint. */
  | 'INTEGRATED'
  /** Integrated and covered by tests. */
  | 'TESTED';

export type FeatureKey =
  // ── Customer audience ────────────────────────────────────────────────────
  | 'catalog'
  | 'checkout'
  | 'customerPayment'
  | 'orders'
  | 'customerNotifications'
  | 'repairs'
  | 'repairEvidence'
  | 'auth'
  | 'accountLifecycle'
  | 'companyBrand'
  // ── Internal audience ────────────────────────────────────────────────────
  | 'internalSales'
  | 'internalNotifications'

  | 'internalCommunications'
  | 'internalMessaging'
  | 'platformAnnouncements'
  | 'internalServiceEvidence'
  | 'internalQuoteTicket'
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
    // Was TESTED. The request still is, but since the backend moved to Izipay the
    // app could create an order and never open its payment. BLOCKED says what
    // the app actually does now: it does not send it. The coupon rides along in
    // code (intent, idempotency, request) and waits behind the same block.
    status: 'BLOCKED',
    note: 'El backend acepta el pedido en /api/v1/customer/<empresa>/checkout/, pero la app no lo envía mientras pagar desde Mobile esté bloqueado (BR-010 / H-PAY-01): así no se crean pedidos que no se pueden pagar. El carrito se conserva. El cupón ya viaja en el código como intención (coupon_code), inalcanzable hasta que el pago se abra; validarlo antes de pagar sigue pendiente de Backend (H-02).',
    source: 'api/endpoints/customer-checkout-v1.ts',
  },
  customerPayment: {
    label: 'Pago desde la app',
    status: 'BLOCKED',
    note: 'Iniciar y completar un pago desde la app está bloqueado. El backend emite una sesión Izipay pensada para el SDK web; falta el contrato nativo (BR-010 / H-PAY-01) y una integración Mobile soportada y probada en sandbox.',
    source: null,
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
  customerNotifications: {
    label: 'Avisos',
    status: 'TESTED',
    note: 'Integrado con /api/v1/customer/<empresa>/notifications/ — bandeja propia, contador de no leídos y marcado como leído. El servidor acota la bandeja al cliente que pregunta; un aviso de otra persona responde 404, no 403.',
    source: 'api/endpoints/customer-notifications-v1.ts',
  },
  repairs: {
    label: 'Reparaciones',
    status: 'TESTED',
    // The note used to say diagnosis, quoting and approval were pending. They
    // shipped in M9 and M10; the customer side reads the whole lifecycle.
    note: 'Integrado con /api/v1/customer/<empresa>/repairs/ — estado, cotización, decisión del cliente y resumen de pagos.',
    source: 'api/endpoints/customer-repairs-v1.ts',
  },
  repairEvidence: {
    label: 'Fotos de la reparación',
    status: 'TESTED',
    note: 'Integrado con /api/v1/customer/<empresa>/repairs/<id>/evidence/ — solo lectura, solo las fotos que el taller compartió. Los bytes llegan por una ruta de contenido que vuelve a comprobar empresa, propiedad, visibilidad y anulación; la app nunca recibe una clave de almacenamiento ni un enlace firmado.',
    source: 'api/endpoints/customer-repair-evidence-v1.ts',
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
  internalNotifications: {
    label: 'Interno · Avisos',
    status: 'TESTED',
    note: 'Integrado con /api/v1/internal/<empresa>/notifications/ — bandeja del personal, contador de no leídos y marcado como leído. Sin capability: el servidor sólo exige ser miembro activo, porque los avisos propios no son datos administrativos sobre terceros.',
    source: 'api/endpoints/internal-notifications-v1.ts',
  },
  internalMessaging: {
    label: 'Interno · Avisos por WhatsApp',
    status: 'TESTED',
    note: 'Integrado con /api/v1/internal/<empresa>/messaging/whatsapp/ — lectura con settings.view y cambios con settings.manage sobre la lista cerrada que el servidor acepta (activación, código de país, idioma y plantillas). Las credenciales del proveedor llegan como booleanos y las fija quien administra la instalación.',
    source: 'api/endpoints/internal-messaging-v1.ts',
  },
  platformAnnouncements: {
    label: 'Plataforma · Comunicados',
    status: 'TESTED',
    note: 'Integrado con /api/v1/platform/announcements/ — listado, detalle y cifras de los comunicados que cruzan empresas. La autoridad es la CUENTA (is_superuser), nunca un rol de empresa, y quien no lo es recibe 404. Redactar y publicar sigue en la consola web: publicar escribe un aviso por destinatario en cada empresa alcanzada.',
    source: 'api/endpoints/platform-announcements-v1.ts',
  },
  internalCommunications: {
    label: 'Interno · Comunicados',
    status: 'TESTED',
    note: 'Integrado con /api/v1/internal/<empresa>/communications/ y /announcements/<id>/ — lectura del comunicado propio (sin capability, el servidor prueba el envío) y, con communications.manage, el listado de lo enviado, sus cifras agregadas, redactar un borrador, dirigirlo a toda la empresa, estimar el alcance, publicarlo y descartarlo. Dirigirlo a una sucursal, un rol, una capacidad o personas concretas sigue en la consola web: esos cuatro tipos de regla piden identificadores que ninguna ruta v1 publica (BR-012).',
    source: 'api/endpoints/internal-communications-v1.ts',
  },
  internalServiceEvidence: {
    label: 'Interno · Fotos de reparación',
    status: 'TESTED',
    note: 'Integrado con /api/v1/internal/<empresa>/service/orders/<id>/evidence/ — listado, bytes por ruta de contenido, compartir con el cliente, dejar de compartir y anular. Cada acto exige la capability de la ETAPA de la foto más acceso a la sucursal. Subir una foto es un POST multipart con la etapa, la nota opcional y una clave de idempotencia; el catálogo de etapas lo envía el servidor con la galería, y el servidor decodifica y recomprime la imagen.',
    source: 'api/endpoints/internal-service-evidence-v1.ts',
  },
  internalQuoteTicket: {
    label: 'Interno · Ticket de la cotización',
    status: 'TESTED',
    note: 'Integrado con /api/v1/internal/<empresa>/service/orders/<id>/quotes/<id>/ticket/?formato=ticket80 — el servidor dibuja el PDF de 80 mm y la app solo lo descarga autenticado y lo abre con el diálogo de compartir del sistema. Exige service.orders.view más acceso a la sucursal, y el servidor solo lo emite cuando la cotización está aprobada.',
    source: 'api/endpoints/internal-quote-ticket-v1.ts',
  },
  internalPos: {
    label: 'Interno · Punto de venta',
    status: 'TESTED',
    note: 'Integrado con /api/v1/internal/<empresa>/sales/pos/ — contexto, búsqueda, lectura de código (escáner tipo teclado o código + Enter; sin cámara), previsualización y venta. El total lo calcula siempre el servidor.',
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
