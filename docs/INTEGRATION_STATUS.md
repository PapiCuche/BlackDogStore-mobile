# Integration Status

Estado real, no aspiracional. La fuente de verdad ejecutable es
`src/config/integration-status.ts` — la app la lee en tiempo de ejecución para
decidir si muestra el aviso de "datos de ejemplo". Si este documento y ese
archivo discrepan, **el archivo tiene razón**.

> **Ninguna API privada está integrada.** En la configuración por defecto
> (development), toda pantalla con datos corre sobre fixtures.

## Resumen

| Feature | Mobile UI | Backend | Integration | Tests | Estado |
|---|---|---|---|---|---|
| Catálogo (tienda) | IMPLEMENTADO | **API_READY** (`/api/v1/`, tenant-safe) | **INTEGRATED** | **TESTED** | **INTEGRADO** |
| Detalle de producto | IMPLEMENTADO | **API_READY** (`/api/v1/`, tenant-safe) | **INTEGRATED** | **TESTED** | **INTEGRADO** |
| Pedidos (cliente) | IMPLEMENTADO | **API_READY** (`/api/v1/customer/`) | **INTEGRATED** | **TESTED** | **INTEGRADO** |
| Detalle de pedido | IMPLEMENTADO | **API_READY** | **INTEGRATED** | **TESTED** | **INTEGRADO** |
| Reparaciones | IMPLEMENTADO | MOCK | MOCK | TESTED UI | PARCIAL |
| Detalle de reparación | IMPLEMENTADO | MOCK | MOCK | TESTED UI | PARCIAL |
| Autenticación (login) | IMPLEMENTADO | **API_READY** (`/api/v1/auth/`) | **INTEGRATED** | **TESTED** | **INTEGRADO** |
| Refresh con rotación | IMPLEMENTADO | **API_READY** | **INTEGRATED** | **TESTED** | **INTEGRADO** |
| Logout | IMPLEMENTADO | **API_READY** | **INTEGRATED** | **TESTED** | **INTEGRADO** |
| Restore en cold start | IMPLEMENTADO | **API_READY** | **INTEGRATED** | **TESTED** | **INTEGRADO** |
| Contexto de empresa verificado | IMPLEMENTADO | **API_READY** | **INTEGRATED** | **TESTED** | **INTEGRADO** |
| Registro nativo | UI solo en mock | API_PENDING (BR-001B) | n/a | TESTED (oculto) | **PENDIENTE** |
| Verificación de correo nativa | UI solo en mock | API_PENDING (BR-001B) | n/a | TESTED (oculto) | **PENDIENTE** |
| Reset de contraseña nativo | UI solo en mock | API_PENDING (BR-001B) | n/a | TESTED (oculto) | **PENDIENTE** |
| Auth mock (development) | IMPLEMENTADO | n/a | MOCK | TESTED | IMPLEMENTADO |
| Auth mock (production) | **BLOQUEADO** | n/a | n/a | TESTED | IMPLEMENTADO |
| Token lifecycle | IMPLEMENTADO | **API_READY** | **INTEGRATED** | TESTED | **INTEGRADO** |
| Access token memory-only | IMPLEMENTADO | n/a | n/a | TESTED | IMPLEMENTADO |
| Refresh en SecureStore | IMPLEMENTADO | n/a | n/a | TESTED | IMPLEMENTADO |
| Refresh coordinator | IMPLEMENTADO | n/a | n/a | TESTED | IMPLEMENTADO |
| Conectividad (offline-aware) | IMPLEMENTADO | n/a | n/a | TESTED | IMPLEMENTADO |
| Aislamiento de cache por tenant | IMPLEMENTADO | n/a | n/a | TESTED | IMPLEMENTADO |
| Aislamiento de cache por usuario | IMPLEMENTADO | n/a | n/a | TESTED | IMPLEMENTADO |
| Política de reintentos | IMPLEMENTADO | n/a | n/a | TESTED | IMPLEMENTADO |
| Cache persistente offline | NO IMPLEMENTADO | n/a | n/a | n/a | **PENDIENTE** |
| Cola de mutaciones offline | NO IMPLEMENTADO | n/a | n/a | n/a | **PENDIENTE** |
| Marca / multiempresa | IMPLEMENTADO | **API_READY** (`/api/v1/.../config/`) | **INTEGRATED** | **TESTED** | **INTEGRADO** |
| Design system | IMPLEMENTADO | n/a | n/a | TESTED | IMPLEMENTADO |
| Tema claro/oscuro/sistema | IMPLEMENTADO | n/a | n/a | TESTED | IMPLEMENTADO |
| Navegación (tabs estables) | IMPLEMENTADO | n/a | n/a | TESTED | IMPLEMENTADO |
| Cliente API | IMPLEMENTADO | n/a | n/a | TESTED | IMPLEMENTADO |
| Config a prueba de fallos | IMPLEMENTADO | n/a | n/a | TESTED | IMPLEMENTADO |
| Almacenamiento seguro | IMPLEMENTADO | n/a | n/a | NO TESTED | PARCIAL |
| Deep links (parser + gate) | IMPLEMENTADO | n/a | n/a | TESTED | IMPLEMENTADO |
| Enlace de producto | IMPLEMENTADO | **API_READY** | **INTEGRATED** | **TESTED** | **INTEGRADO** |
| Enlace de pedido | IMPLEMENTADO | **API_READY** | **INTEGRATED** | **TESTED** | **INTEGRADO** |
| Enlace de reparación | IMPLEMENTADO | MOCK | MOCK | TESTED | PARCIAL |
| Resume tras autenticarse | IMPLEMENTADO | n/a | n/a | TESTED | IMPLEMENTADO |
| Seguimiento seguro (tracking) | NO IMPLEMENTADO | API_PENDING (BR-008) | n/a | TESTED (rechazo) | **PENDIENTE** |
| Universal Links / App Links | NO IMPLEMENTADO | n/a | n/a | n/a | **INFRA_PENDING** |
| QR | NO IMPLEMENTADO | n/a | n/a | n/a | **PENDIENTE** |
| Push notifications | NO IMPLEMENTADO | n/a | n/a | n/a | **PENDIENTE** |
| Contexto de acceso (`access_contexts`) | IMPLEMENTADO | **API_READY** | **INTEGRATED** | **TESTED** | **INTEGRADO** |
| Gate de acción privada | IMPLEMENTADO | n/a | n/a | **TESTED** | **IMPLEMENTADO** |
| Área interna (shell) | NO IMPLEMENTADO | n/a | n/a | n/a | **PENDIENTE** |
| APIs internas de negocio | NO IMPLEMENTADO | PENDIENTE | n/a | n/a | **PENDIENTE** |
| Carrito móvil (público) | **IMPLEMENTADO** | n/a | n/a | **TESTED** | **IMPLEMENTADO** |
| Checkout autenticado móvil | **IMPLEMENTADO** | **API_READY** | **INTEGRATED** | **TESTED** | **INTEGRADO** |
| Stripe Checkout alojado | **IMPLEMENTADO** | n/a | n/a | **TESTED** | **IMPLEMENTADO** |
| Confirmación de pago | **IMPLEMENTADO** | **API_READY** (webhook + refetch) | **INTEGRATED** | **TESTED** | **INTEGRADO** |
| Compra / pagos | **IMPLEMENTADO** | **API_READY** | **INTEGRATED** | **TESTED** | **INTEGRADO** |

## Qué sirve cada build (M0.1)

Con la configuración a prueba de fallos, **el entorno decide qué datos existen**:

| Feature | development | staging | production |
|---|---|---|---|
| Catálogo | mock · o **real `/api/v1/`** con mocks off | **real `/api/v1/`** | **real `/api/v1/`** |
| Pedidos | mock · o **real `/api/v1/customer/`** con mocks off | **real** | **real** |
| Reparaciones | mock | *no disponible* | *no disponible* |
| Marca | fixture del piloto · o **real** con mocks off | **real `/api/v1/`** | **real `/api/v1/`** |

*"No disponible"* significa que `repositories.<feature>` es `null` y la pantalla
muestra un estado **"Próximamente"** explícito. No una lista vacía: "todavía no
tenemos esta función" y "no tienes pedidos" son cosas distintas, y mostrar la
segunda cuando es cierta la primera le dice al cliente algo falso sobre su
propia cuenta.

## Detalle

### Catálogo — **INTEGRADO** (M2)

Estado detallado:

```
Mobile UI:                 IMPLEMENTADO
Backend tenant-safe:       IMPLEMENTADO   (origin/master b301637b)
Integration:               INTEGRATED
Tests:                     TESTED         (ambos lados)
Release-safe:              SÍ
```

**Primera integración real del proyecto.**

```
GET /api/v1/storefront/<company_slug>/products/
GET /api/v1/storefront/<company_slug>/products/<product_slug>/
GET /api/v1/storefront/<company_slug>/categories/
```

Verificado leyendo el código en `master`, no la descripción del PR. El servidor
resuelve una empresa **activa** desde el slug de la ruta y construye cada
queryset desde ella; el cliente no filtra nada, porque un cliente que recorta
filas de otra empresa ya las ha recibido.

Empresa desconocida, inactiva o malformada devuelven **el mismo 404**, así que el
endpoint no puede recorrerse para enumerar empresas.

#### Fail-safe

| Situación | Catálogo |
|---|---|
| mocks activos | fixtures |
| tenant + API url resueltos | **real `/api/v1/`** |
| falta `EXPO_PUBLIC_COMPANY_SLUG` | **ninguno** |
| falta `EXPO_PUBLIC_API_BASE_URL` | **ninguno** |

Sin tenant no hay storefront que pedir, y caer al piloto serviría el catálogo de
Black Dog Store dentro de la app de otra empresa. Ninguno de los dos fallos cae a
mocks.

#### El gate legacy se retiró

M0.2 encerraba `/api/products/` tras `EXPO_PUBLIC_ENABLE_LEGACY_CATALOG` porque
devolvía los productos de todas las empresas. Con el contrato tenant-safe
publicado, **`LegacyApiCatalogRepository`, su wrapper, `assertLegacyCatalogAllowed`
y la variable fueron eliminados**, no apagados.

Ese endpoint sigue existiendo en el backend para el frontend web, que lo resuelve
por Host y para el cual es correcto. Mobile ya no lo llama, y hay un test que
comprueba que los módulos ya no se pueden importar.

### Pedidos — `API_PENDING`

`GET /api/orders/` existe pero exige cookie + CSRF (**BR-001**), y no serializa
`fulfillment_status` (**BR-003**). La UI ya separa pago y entrega, y muestra
"Sin información" cuando el backend no envía el estado operativo — en lugar de
suponer `pending`.

### Reparaciones — `MOCK`

No existe backend. Ni modelo, ni endpoint — verificado en `master`. Propuesta
completa en **BR-005**.

### Autenticación — `API_PENDING`

Cinco pantallas terminadas, validación real con Zod, estados de envío y error
reales. **Ningún endpoint llamado.**

Estado detallado tras M1:

```
Auth UI                       IMPLEMENTADO
Mock Auth development         IMPLEMENTADO
Mock Auth production          BLOQUEADO
Real Mobile Auth              API_PENDING
Token lifecycle foundation    IMPLEMENTADO
Access memory-only            IMPLEMENTADO
Refresh secure storage        IMPLEMENTADO
Refresh coordinator           IMPLEMENTADO
Single-flight refresh         TESTED
Rotation handling             TESTED
401 retry once                TESTED
403 no refresh                TESTED
Logout race safety            TESTED
Tenant authorization          PENDIENTE BACKEND
/api/v1/auth                  PROPUESTA / API_PENDING
Web auth                      SIN CAMBIOS
```

**Qué sirve cada build:**

| Entorno | Autenticación |
|---|---|
| development | mock (o `unavailable` si se apagan los mocks) |
| staging | `unavailable`, salvo opt-in explícito de mocks |
| production | **`unavailable` siempre** — nunca mock |

Con `unavailable` la app **no muestra formulario**: una pantalla de acceso que
no puede funcionar le enseña al usuario que sus credenciales son incorrectas.

Ver `MOBILE_AUTH.md` y **BR-001** (autenticación Bearer **acotada a `/api/v1/`**,
nunca global).

### Marca / multiempresa — `MOCK`

`CompanyBrand` gobierna el nombre del comercio, los canales de soporte y **qué
pestañas existen**. Desde M0.1 el fixture del piloto se siembra **solo** para un
build del tenant piloto en modo mock; cualquier otro build recibe `unavailable`
y renderiza neutral. **BR-006.**

## Qué haría falta para llegar a INTEGRATED

| Feature | Bloqueo | Trabajo Mobile una vez desbloqueado |
|---|---|---|
| Catálogo | ~~BR-002 (+ BR-007)~~ **DESBLOQUEADO** | **Hecho en M2.** `V1ApiCatalogRepository` escrito; `LegacyApiCatalogRepository`, su wrapper, su gate y `EXPO_PUBLIC_ENABLE_LEGACY_CATALOG` **eliminados**. Se reemplazó, no se adaptó. |
| Pedidos (cliente) | ~~BR-001, BR-003~~ **DESBLOQUEADO** | **Hecho en M4.** `V1CustomerOrderRepository` sobre `/api/v1/customer/`. BR-003 cerrado en el serializer v1. |
| Pedidos (interno) | **PENDIENTE** | Necesita `/api/v1/internal/<empresa>/orders/` con `sales.orders.view`. Es otra superficie, no un ensanche de esta. |
| Reparaciones | BR-005 | Escribir `ApiRepairRepository`; el dominio ya está modelado. |
| Auth (sesión) | ~~BR-001, BR-007~~ **DESBLOQUEADO** | **Hecho en M3.** `DjangoAuthTransport` + `ApiAuthRepository` escritos, `isBackendAuthAvailable = true` en el mismo commit. El coordinator, el vault y el pipeline no se tocaron: la apuesta de M1 se sostuvo. |
| Auth (cuenta) | **BR-001B** | Escribir los flujos de registro/verificación/reset cuando existan endpoints nativos. Hoy la app los oculta en modo backend. |
| Marca | ~~BR-006~~ **DESBLOQUEADO** | **Hecho en M5.** `V1CompanyRepository` sobre `/api/v1/storefront/<empresa>/config/`; el fixture del piloto queda solo para desarrollo con mocks. |

El patrón es el mismo en los cinco casos: **una clase nueva y una línea en el
composition root**. Ninguna pantalla cambia. Esa es la razón de la capa de
repositorios.

## Resiliencia del cliente (M1.1)

```
Connectivity foundation       IMPLEMENTADO
Offline banner                IMPLEMENTADO
Stale data notice             IMPLEMENTADO
onlineManager                 IMPLEMENTADO / TESTED
focusManager (AppState)       IMPLEMENTADO / TESTED
Retry policy                  IMPLEMENTADO / TESTED
Tenant cache isolation        IMPLEMENTADO / TESTED
User cache isolation          IMPLEMENTADO / TESTED
Logout cache eviction         IMPLEMENTADO / TESTED
Tenant switch readiness       IMPLEMENTADO / TESTED
Home partial resilience       IMPLEMENTADO / TESTED
Persistent offline cache      PENDIENTE
Offline mutation queue        PENDIENTE / PROPUESTA
```

Ver `docs/OFFLINE_STRATEGY.md` y las decisiones DEC-MOBILE-002 / DEC-MOBILE-003.

## Enlaces entrantes (M1.2)

```
Deep link parser (allowlist)  IMPLEMENTADO / TESTED
Security limits + decoding    IMPLEMENTADO / TESTED
Typed link builders           IMPLEMENTADO / TESTED
Coordinator (tenant + auth)   IMPLEMENTADO / TESTED
Pending intent (memoria)      IMPLEMENTADO / TESTED
Cold start / warm start       IMPLEMENTADO / TESTED
Resume tras login             IMPLEMENTADO / TESTED
Limpieza en logout / switch   IMPLEMENTADO / TESTED
Custom scheme                 IMPLEMENTADO (desarrollo / piloto)
Universal Links / App Links   INFRA_PENDING (DEC-MOBILE-005)
Secure tracking               API_PENDING (BR-008)
QR                            PENDIENTE
Push                          PENDIENTE
```

Ver `docs/LINKING_STRATEGY.md` y las decisiones DEC-MOBILE-004 / DEC-MOBILE-005.

Un enlace **no integra nada**: lleva a una pantalla cuyo estado de integración es
el que ya tenía. Un enlace de reparación sigue llegando a datos `MOCK`.

## Catálogo real (M2)

```
Contrato backend v1            IMPLEMENTADO / VERIFICADO (origin/master b301637b)
V1ApiCatalogRepository         IMPLEMENTADO / TESTED
Cliente /api/v1/ (catalog-v1)  IMPLEMENTADO / TESTED
Tenant en la ruta              IMPLEMENTADO / TESTED
Política de catálogo fail-safe IMPLEMENTADO / TESTED
Query keys tenant-scoped       PRESERVADO (M1.1) / TESTED
Deep link de producto → real   INTEGRADO / TESTED
Catálogo legacy                ELIMINADO
EXPO_PUBLIC_ENABLE_LEGACY_CATALOG  ELIMINADO
```

**Primera integración real del proyecto.** Deja de ser mock: la app llama a
`/api/v1/storefront/<empresa>/`, donde el servidor resuelve una empresa activa
desde la ruta y scopea todo el queryset.

Lo que **no** cambió de estado: pedidos, reparaciones, autenticación, marca y
seguimiento siguen exactamente donde estaban. Un catálogo integrado no integra
nada más.

Ver `docs/API_CONTRACT.md` y BR-002 / BR-007 en `docs/BACKEND_REQUIREMENTS.md`.

## Autenticación nativa (M3)

```
Contrato backend BR-001A       IMPLEMENTADO / VERIFICADO (origin/master 7c55ebc)
DjangoAuthTransport            IMPLEMENTADO / TESTED
ApiAuthRepository              IMPLEMENTADO / TESTED
Login                          INTEGRADO / TESTED
Refresh con rotación           INTEGRADO / TESTED
Logout local-first             INTEGRADO / TESTED
Restore en cold start          INTEGRADO / TESTED
Red caída != logout            INTEGRADO / TESTED
Contexto de empresa verificado INTEGRADO / TESTED
Bearer solo en /api/v1/        TESTED
Sin logging de credenciales    TESTED (escaneo estructural)
Registro nativo                PENDIENTE (BR-001B)
Verificación de correo nativa  PENDIENTE (BR-001B)
Reset de contraseña nativo     PENDIENTE (BR-001B)
Superficie privada de negocio  PENDIENTE (BR-003 / BR-005)
```

**BR-001 no está cerrado.** El núcleo de sesión sí; el ciclo de vida de cuenta
no. En modo backend la app **no muestra** esos formularios.

Lo que **no** cambió de estado: pedidos, reparaciones, marca y seguimiento. Una
puerta abierta no es lo que hay detrás.

## Pedidos privados de cliente (M4)

```
Contrato backend               IMPLEMENTADO / VERIFICADO (origin/master b253156)
V1CustomerOrderRepository      IMPLEMENTADO / TESTED
Cliente /api/v1/customer/      IMPLEMENTADO / TESTED
BR-003 fulfillment_status      IMPLEMENTADO para v1 / TESTED
Gate de acción privada         IMPLEMENTADO / TESTED
Claves de cache por audiencia  IMPLEMENTADO / TESTED
access_contexts                INTEGRADO / TESTED
Área interna (shell)           PENDIENTE
APIs internas de negocio       PENDIENTE
Carrito + checkout móvil       PENDIENTE → M5
Reparaciones                   PENDIENTE / BR-005
```

**Primera integración privada.** El catálogo es anónimo; esto necesita un token,
así que solo pudo existir después de M3.

Lo que **no** cambió: reparaciones, marca, seguimiento y todo lo interno. Que un
empleado pueda entrar a la app no le da acceso a nada de la empresa desde aquí.

## Carrito y compra (M5)

```
Contrato backend               IMPLEMENTADO / VERIFICADO (origin/master 0b184d3)
Carrito local tenant-scoped    IMPLEMENTADO / TESTED
Persistencia no sensible       IMPLEMENTADO / TESTED
Agregar sin sesión             IMPLEMENTADO / TESTED
Gate de sesión en el pago      IMPLEMENTADO / TESTED
Checkout v1 idempotente        INTEGRADO / TESTED
Stripe Checkout alojado        IMPLEMENTADO / TESTED
Validación de la URL de pago   IMPLEMENTADO / TESTED
Refetch del pedido al volver   IMPLEMENTADO / TESTED
Vaciar solo tras pago pagado   IMPLEMENTADO / TESTED
Config pública por slug        INTEGRADO / TESTED   (BR-006 cerrado)
Enlace de WhatsApp del tenant  INTEGRADO / TESTED
Reserva de stock               NO IMPLEMENTADO — deuda
Área interna                   PENDIENTE
Reparaciones                   PENDIENTE / BR-005
```

**El cliente no fija precios.** El servidor rechaza cualquier campo comercial;
el carrito local solo expresa intención (DEC-MOBILE-009).

**«El navegador volvió» no es un pago.** El estado real lo da el servidor, que lo
aprende del webhook. El carrito sobrevive a todo lo que no sea un pago confirmado.

## Nota de verificación

**Base actual: `origin/master` @ `b301637b`** (`Merge pull request #1 — feat(api):
add tenant-safe v1 public catalog`), verificada leyendo el código en `master`.

`master` avanzó mucho desde la base de M0.2 (`2624d478`):

| Commit | Qué trajo |
|---|---|
| `67d677b` · `6d8c3e0` | Catálogo tenant-aware — `Category.company`, `Product.company`, migraciones 0018–0020 |
| `59d6daf` | Comercio tenant-aware — `Order.company`, `Coupon.company`, cart/checkout/Stripe, migraciones 0021–0023 |
| `ab92fe9` · `58188d1` · `1ddd547` | Fundación SaaS completa: inventario multisucursal, configuración por empresa, series internas, CRM de clientes, migraciones 0024–0033 |
| `2907208` · `b301637b` | `/api/v1/storefront/<company_slug>/…` — el contrato que M2 integra |

La rama `feat/tenant-aware-commerce`, que M0.2 clasificó como
`OBSERVED_IN_PROGRESS` y contra la que Mobile **no** se integró, **ya está
mergeada en `master`**. Esperar a que lo estuviera fue lo correcto: la existencia
de código en una rama no es una API estable, y entre aquella rama y `master` de
hoy hay diez migraciones más y una reescritura de `tenancy.py`.

El orden se respetó: rama Web → tests → merge a `master` → Mobile reaudita
`master` → recién entonces integra.

### Qué se verificó antes de integrar

- `feat/tenant-aware-commerce` es ancestro de `origin/master` (`git merge-base`)
- `backend/store/v1_views.py` existe en `master`
- `backend/urls.py` monta `path('api/v1/', include('store.v1_urls'))`
- Suite backend en `master`: **1504 tests, OK**
- `makemigrations --check --dry-run`: sin cambios pendientes

Nada de esto se dio por bueno leyendo la descripción de un PR.
