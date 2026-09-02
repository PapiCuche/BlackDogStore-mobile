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
| Reparaciones | **IMPLEMENTADO** | **API_READY** (`/api/v1/customer/<slug>/repairs/`) | **INTEGRATED** | **TESTED** | **INTEGRADO** |
| Detalle de reparación | **IMPLEMENTADO** | **API_READY** | **INTEGRATED** | **TESTED** | **INTEGRADO** |
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
| Enlace de reparación | IMPLEMENTADO | **API_READY** | **INTEGRATED** | **TESTED** | **INTEGRADO** |
| Resume tras autenticarse | IMPLEMENTADO | n/a | n/a | TESTED | IMPLEMENTADO |
| Seguimiento seguro (tracking) | NO IMPLEMENTADO | API_PENDING (BR-008) | n/a | TESTED (rechazo) | **PENDIENTE** |
| Universal Links / App Links | NO IMPLEMENTADO | n/a | n/a | n/a | **INFRA_PENDING** |
| QR | NO IMPLEMENTADO | n/a | n/a | n/a | **PENDIENTE** |
| Push notifications | NO IMPLEMENTADO | n/a | n/a | n/a | **PENDIENTE** |
| Contexto de acceso (`access_contexts`) | IMPLEMENTADO | **API_READY** | **INTEGRATED** (desde M6) | **TESTED** | **INTEGRADO** |
| Gate de acción privada | IMPLEMENTADO | n/a | n/a | **TESTED** | **IMPLEMENTADO** |
| Área interna (shell) | **IMPLEMENTADO** | **API_READY** | **INTEGRATED** | **TESTED** | **INTEGRADO** |
| Pedidos internos de venta | **IMPLEMENTADO** | **API_READY** (`/api/v1/internal/`) | **INTEGRATED** | **TESTED** | **INTEGRADO** |
| Fulfillment interno | **IMPLEMENTADO** | **API_READY** | **INTEGRATED** | **TESTED** | **INTEGRADO** |
| Inventario interno | **IMPLEMENTADO** | **API_READY** (`/api/v1/internal/<slug>/inventory/`) | **INTEGRATED** | **TESTED** | **INTEGRADO** |
| Administración de plataforma | NO IMPLEMENTADO | n/a | n/a | n/a | **PENDIENTE** |
| APIs internas de negocio | **PARCIAL** — ventas e inventario sí; servicio no | **PARCIAL** | **PARCIAL** | **TESTED** | **PARCIAL** |
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

### Reparaciones — `INTEGRADO` (núcleo)

Existe backend desde **M8**: `RepairOrder`, su ciclo de vida y su historial
inmutable, más `GET /api/v1/customer/<empresa>/repairs/`. Verificado en
`origin/master` `43fffb0` con smoke real.

El dominio de Mobile se **reescribió contra el contrato**, no se adaptó: la
propuesta tenía siete etapas y el backend implementó cuatro, porque
`in_repair`, `quality_check`, `ready_for_pickup` y `delivered` necesitan
módulos que M8 no construyó. `Repair.id` pasó de string a número, `code` a
`number`, y la etiqueta del estado la manda el servidor porque cada empresa la
configura.

Sigue **PENDIENTE**: diagnóstico, cotización, aprobación del cliente, ejecución,
repuestos, control de calidad, garantía y evidencias.

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
| Pedidos (interno) | ~~superficie interna~~ **DESBLOQUEADO** | **Hecho en M6.** `V1InternalSalesRepository` sobre `/api/v1/internal/`. Otra superficie, no un ensanche de la de cliente. |
| Inventario (interno) | ~~superficie interna~~ **DESBLOQUEADO** | **Hecho en M7A.** `V1InternalInventoryRepository` sobre `/api/v1/internal/<empresa>/inventory/`. Tercera puerta: la sucursal. |
| Reparaciones | ~~BR-005~~ **DESBLOQUEADO** | **Hecho en M8.** `V1CustomerRepairRepository` sobre `/api/v1/customer/<empresa>/repairs/`. El dominio se reescribió contra el contrato real: siete etapas propuestas eran cuatro. |
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
el que ya tenía. Desde M8 un enlace de reparación llega a datos reales.

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

## Área interna y ventas (M6)

```
Contrato backend               IMPLEMENTADO / VERIFICADO (origin/master 72042b2)
Contexto de acceso en sesión   CORREGIDO / TESTED   <- era un hueco de M4
Cliente /api/v1/internal/      IMPLEMENTADO / TESTED
Contexto interno fresco        INTEGRADO / TESTED
Pedidos internos de venta      INTEGRADO / TESTED
Fulfillment interno            INTEGRADO / TESTED
Shell interno separado         IMPLEMENTADO / TESTED
Cache por audiencia            IMPLEMENTADO / TESTED
Revocación de permiso          IMPLEMENTADO / TESTED
Inventario interno             INTEGRADO / TESTED (M7A)
Servicio técnico               PENDIENTE / BR-005
Administración de plataforma   PENDIENTE
```

### Corrección de un estado declarado en M4

M4 documentó `access_contexts` como **INTEGRADO / TESTED** en Mobile. **No lo
estaba**: el backend lo enviaba y el mapeador móvil lo descartaba en silencio.
Se corrigió en M6 y se registra aquí en vez de dejar que el estado declarado
siguiera sin coincidir con el código.

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

## Inventario interno (M7A)

```
Contrato backend               IMPLEMENTADO / VERIFICADO (origin/master fd6ea01)
Cliente de inventario v1       IMPLEMENTADO / TESTED
Resumen por sucursal           INTEGRADO / TESTED
Stock por sucursal             INTEGRADO / TESTED
Kardex                         INTEGRADO / TESTED
Ajuste manual                  INTEGRADO / TESTED
Alcance por sucursal           IMPLEMENTADO / TESTED
Cache con sucursal en la clave IMPLEMENTADO / TESTED
Transferencias y recuentos     NO EXPUESTOS (a propósito, backend y app)
```

**La sucursal es la tercera puerta.** Membresía → 404. Capability → 403.
Sucursal ajena → **404 otra vez**, y la app lo traduce a `BranchOutOfScopeError`
en lugar de reutilizar el error de membresía: perder el acceso a una tienda no es
perder el área interna.

**La clave de caché lleva la sucursal.** Sin ella, cambiar de tienda mostraría
los números de la anterior bajo el nombre de la nueva — una cifra equivocada con
aspecto de autoridad. `null` («todas las que puedo ver») es su propia ranura, no
la sucursal cero.

**El ajuste no calcula nada.** No hay campo de stock final en el formulario, en
`StockAdjustmentInput` ni en el cuerpo del POST, y un test estructural falla si
alguien lo añade.

**Lo que sigue PENDIENTE**: transferencias, recuentos, reportes de inventario
(`inventory.reports` no tiene superficie v1), clientes internos y servicio
técnico.

## Design system tenant-aware (UI7)

```
Paleta base acromática         IMPLEMENTADO / TESTED
Acento por tenant (BR-006)     INTEGRADO / TESTED
Contraste calculado (WCAG AA)  IMPLEMENTADO / TESTED
Materiales semánticos          IMPLEMENTADO / TESTED
Fallback opaco por material    IMPLEMENTADO / TESTED
Reduce Transparency            IMPLEMENTADO (iOS; Android ya es opaco)
Chrome flotante + shell        IMPLEMENTADO / TESTED
Logo por tenant                PENDIENTE (backend no sirve logo)
secondaryColor                 PENDIENTE (sin rol semántico todavía)
Tipografía por tenant          NO PLANIFICADO
```

**La empresa piloto deja de ser el fallback universal.** El dorado de Black Dog
era el acento de cualquier build; ahora vive en `pilot-brand.ts` y la base es
acromática. Un test comprueba que ese hex no aparece en la paleta.

**La accesibilidad conserva la autoridad.** El color del tenant se aplica exacto
como relleno y se deriva donde tiene que leerse. La rampa de estado, el texto,
los bordes y el fondo del botón primario quedan fuera de su alcance.

**El desenfoque es la mejora.** Cada material lleva fallback opaco, y el texto
principal pasa AA sobre los cuatro en los dos esquemas.

## Servicio técnico (M8 / BR-005A)

```
Contrato backend               IMPLEMENTADO / VERIFICADO (origin/master 43fffb0)
Reparaciones de cliente        INTEGRADO / TESTED
Enlace profundo a reparación   INTEGRADO / TESTED
Servicio interno (recepción)   INTEGRADO / TESTED
Órdenes internas               INTEGRADO / TESTED
Transiciones desde el servidor  INTEGRADO / TESTED
Asignación de técnico          INTEGRADO / TESTED
Búsqueda de clientes (intake)  INTEGRADO / TESTED
Registro de equipos            INTEGRADO / TESTED
Diagnóstico · cotización       INTEGRADO / TESTED (M9)
Repuestos · calidad · garantía PENDIENTE
Evidencias fotográficas        API_PENDING (DEC-016, sin proveedor)
Seguimiento público (BR-008)   API_PENDING
```

**Dos experiencias separadas, y no se mezclan.** `@/domain/repairs` es lo que ve
un CLIENTE; `@/domain/internal/service-types` es lo que ven los que trabajan en
el taller. Tipos distintos, repositorios distintos, namespaces de caché
distintos. Ensanchar el tipo de cliente para que cargara notas internas dejaría
a una pantalla de cliente capaz de renderizarlas, y el sistema de tipos no
protestaría.

**El servidor manda las transiciones.** No hay tabla de transiciones en esta
app, y un test estructural falla si alguien escribe una.

**El servidor manda las etiquetas.** Una empresa que renombró «Recibido» a «En
mostrador» ve su palabra; el mapa local quedó solo como respaldo cuando el
payload no trae ninguna.

**Ninguna mutación reintenta ni se encola offline.** Una orden repetida es una
segunda orden, una transición repetida es una segunda fila de historial.

## Diagnóstico, cotización y aprobación (M9 / BR-005B)

```
Contrato backend               IMPLEMENTADO / VERIFICADO (origin/master 36b8a8c)
Diagnóstico interno            INTEGRADO / TESTED
Cotización versionada          INTEGRADO / TESTED
Líneas de cotización           INTEGRADO / TESTED
Publicar · cancelar            INTEGRADO / TESTED
Cotización del cliente         INTEGRADO / TESTED
Aprobación · rechazo           INTEGRADO / TESTED
Ejecución de la reparación     INTEGRADO / TESTED (M10)
Repuestos · stock              INTEGRADO / TESTED (M10)
Control de calidad · entrega   PENDIENTE
Garantía · pagos de servicio   PENDIENTE
Evidencias fotográficas        API_PENDING (DEC-016, sin proveedor)
Seguimiento público (BR-008)   API_PENDING
```

**Aprobar no es pagar.** El cuerpo de una decisión tiene dos campos y uno es
opcional. No hay importe, ni identidad, ni fecha, ni canal: el servidor ya sabe
las cuatro cosas, y un cliente capaz de decirlas es un cliente capaz de decir una
versión mejor de lo que pasó.

**El `409` es el caso normal, no el raro.** El mostrador contesta por teléfono un
segundo antes. La app refresca en `onSettled` y no en `onSuccess`, para que quien
pierde esa carrera acabe mirando el estado verdadero.

**El servidor hace las cuentas.** `line_total`, `subtotal` y `total` son
respuesta. Los importes viajan como string decimal y se parsean en el punto de
dibujo; un test estructural falla si alguien multiplica un precio en el teléfono.

**La caducidad no la decide el teléfono.** `is_expired` y `can_be_decided` llegan
calculados y la app exige que sean estrictamente `true`.

**`waiting_approval` salió de `available_transitions` y la app no se enteró.**
Publicar una cotización es ahora el camino hacia adelante en la pantalla interna.
No haber tenido nunca una tabla de transiciones es lo que hizo que ese cambio de
servidor no rompiera nada.

**El motivo que escribe el cliente vive solo en el lado interno.** Lo lee el
taller, que es quien lo necesita. La superficie de cliente no tiene ese campo.

## Ejecución y repuestos (M10 / BR-005C)

```
Contrato backend               IMPLEMENTADO / VERIFICADO (origin/master 82695d3)
Ejecución de la reparación     INTEGRADO / TESTED
Pausa por repuestos            INTEGRADO / TESTED
Consumo de repuestos           INTEGRADO / TESTED
Reverso compensatorio          INTEGRADO / TESTED
Idempotencia de consumo        INTEGRADO / TESTED
Estados nuevos en cliente      INTEGRADO / TESTED
Reserva de stock               NO PLANIFICADO (deliberado)
Control de calidad             INTEGRADO / TESTED (M11)
Entrega del equipo             INTEGRADO / TESTED (M12)
Pago del servicio · garantía   PENDIENTE
Devolución tras finalizar      PENDIENTE (necesita inspección física)
Evidencias fotográficas        API_PENDING (DEC-016, sin proveedor)
Seguimiento público (BR-008)   API_PENDING
```

**El bug de M9 está corregido, y era el nuestro.** `toRepairStatus` coaccionaba
cualquier código desconocido a `received`. Cuando el backend desplegó `approved`
antes de que esta app lo conociera, una reparación recién aprobada se dibujaba
como «Recibido». Ahora un código desconocido llega intacto, se dibuja con la
etiqueta del servidor y un tono neutral, y no recibe posición en la escalera.
Solo un estado ausente cae a `received`.

**Empezar, pausar y terminar son hechos.** Los tres estados nuevos son
event-only en el servidor; el endpoint genérico los rechaza. La app no tiene
tabla de transiciones y un test estructural falla si aparece.

**Una pieza sale de la sucursal de SU reparación.** No hay campo de sucursal en
ninguna petición. Toda pieza traza a una línea `part` de la cotización aprobada.

**El servidor mueve el inventario.** La app manda línea, cantidad y clave. No
resta stock en pantalla: sería afirmar un número sobre una estantería que otra
caja puede estar cambiando.

**La clave de idempotencia vive en un `ref`.** Se acuña una vez por intención y
se reenvía idéntica en cada reintento manual. Nada reintenta solo.

**409 tiene dos significados** y se distinguen por el `code` del servidor, nunca
por el castellano.

**Invalidar cruza el módulo; los datos no.** Consumir una pieza marca sucio el
caché de Inventario del mismo tenant sin que Servicio lea un solo tipo suyo.

**`repaired` no es «listo para recoger».** El técnico terminó. La reparación
sigue ABIERTA en la Home del cliente porque el equipo sigue en el taller.

## Control de calidad (M11 / BR-005D)

```
Contrato backend               IMPLEMENTADO / VERIFICADO (origin/master e26e77d)
Apertura del control           INTEGRADO / TESTED
Lista como snapshot            INTEGRADO / TESTED
Registro de puntos             INTEGRADO / TESTED
Aprobar (PASS)                 INTEGRADO / TESTED
Devolver a reparación (FAIL)   INTEGRADO / TESTED
Historial de controles         INTEGRADO / TESTED
Estados nuevos en cliente      INTEGRADO / TESTED
Paridad de permisos Web/Mobile MISMA FUENTE (backend)
UI de servicio en Web          PENDIENTE — no existe ninguna pantalla
Editor de roles en Web         PENDIENTE — API lista, pantalla no
Entrega · pago · garantía      PENDIENTE
Evidencias fotográficas        API_PENDING (DEC-016, sin proveedor)
Seguimiento público (BR-008)   API_PENDING
```

**La lista no está en esta app.** Llega como snapshot del servidor y se dibuja
tal cual. Un test estructural falla si alguien escribe una.

**El veredicto tampoco.** `pass/` y `fail/` mandan una nota interna opcional y
nada más. El resumen que ve el técnico es una vista previa; el servidor lee las
respuestas y devuelve 400 si falta un obligatorio o si algo falló.

**Un fallo abre el retrabajo en el mismo acto**, con la ejecución anterior
finalizada, sus repuestos intactos y **sin mover stock**.

**Inspeccionar es capability aparte de reparar.** Mismo catálogo que Web: no
existe RBAC propio de Mobile, y un test estructural falla si aparece `role ===`,
`isAdmin` o `isTechnician` en el módulo de servicio.

**`ready_for_pickup` no dice que se avisó a nadie.** No hay canal de
notificaciones en esta plataforma.

**Paridad, con honestidad:** misma capability, mismo endpoint, mismas reglas de
tenant y sucursal, mismas transiciones. Lo que **no** existe es la interfaz Web
de servicio técnico — el frontend Next no tiene una sola pantalla de órdenes de
reparación — y eso se declara PENDIENTE, no se disimula.

## Entrega (M12 / BR-005E)

```
Contrato backend               IMPLEMENTADO / VERIFICADO (origin/master 3095167)
Lectura de la entrega          INTEGRADO / TESTED
Registro de la entrega         INTEGRADO / TESTED
Idempotencia (misma clave)     INTEGRADO / TESTED
Conflicto 409 diferenciado     INTEGRADO / TESTED
`delivered` como estado conocido  INTEGRADO / TESTED
Cierre de la reparación        INTEGRADO / TESTED
Capability propia de entrega   INTEGRADO / TESTED
UI de servicio en Web          INTEGRADO (H2 + M12)
COBRO DEL SERVICIO             **PENDIENTE — no existe en el backend**
Garantía / reingreso           PENDIENTE
Evidencias (firma / foto)      API_PENDING (DEC-016, sin proveedor)
Editor de roles en Web         PENDIENTE — API lista, pantalla no
Seguimiento público (BR-008)   API_PENDING
Portal Web de cliente          PENDIENTE
```

**El cobro NO existe, y es un hallazgo verificado leyendo el modelo.**
`PaymentTransaction.order` es una FK **no nula** a la `Order` de e-commerce, sin
columna de empresa y sin relación genérica: una `RepairOrder` no puede pagarse
por ahí. Por eso `delivered` significa que el equipo salió con alguien y nada
más. No se escribió ningún booleano de pago ni aquí ni en el servidor, la
pantalla dice en voz alta que no registra cobro, y dos guards estructurales lo
vigilan: uno prohíbe campos e identificadores de pago en los archivos de M12
—con las cadenas eliminadas antes de mirar, para no leer el descargo como la
infracción— y otro comprueba que el texto visible nunca afirme un pago.

**`delivered` es event-only.** El endpoint genérico lo rechaza; registrar la
entrega es el único camino, y registra a quién se le dio el equipo.

**Entregar es capability propia**, no un añadido de `service.orders.manage`.
Mismo catálogo que Web. Un mostrador puede liberar equipos sin poder cancelar
una orden, y un técnico puede reparar e inspeccionar sin poder entregar.

**No hay editar ni borrar**, porque el servidor no los tiene: la fila rechaza
ambas en su propio `save`. La app no exporta `patch`/`delete` para esta ruta y
un test lo comprueba.

**Un doble toque no entrega dos veces.** Clave acuñada una vez por intención,
guardada en un `ref`, reenviada idéntica. Nada reintenta solo.

**`isRepairOpen` fue el único sitio que aprendió del final** — la promesa que M9
dejó escrita y que M12 paga. `ready_for_pickup` sigue abierta a propósito: el
equipo está listo y sigue en el taller.

**Un código desconocido sigue contando como ABIERTO.** Nunca haber oído hablar
de un estado no es prueba de que algo terminó, y adivinar «cerrado» escondería
una reparación viva.
