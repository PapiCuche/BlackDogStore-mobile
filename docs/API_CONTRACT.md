# API Contract

## Cómo leer este documento

Durante M0 se inspeccionó un **working tree local** de `BlackDogStore-web`. Ese
árbol estaba en la rama `feat/tenant-aware-commerce` **con cambios sin
commitear encima**, no en `master`. Varias afirmaciones de la versión anterior
de este documento describían por tanto código que **todavía no forma parte del
contrato estable**.

M0.1 corrige eso. Cada afirmación lleva ahora una de estas tres etiquetas:

| Etiqueta | Significado |
|---|---|
| `VERIFIED_STABLE_MASTER` | Existe y está commiteado en `PapiCuche/BlackDogStore-web`, rama `master`. Es contrato. |
| `OBSERVED_IN_PROGRESS` | Visto en el working tree del equipo Web (rama de feature o cambios sin commit). **No es contrato.** Puede cambiar o no llegar nunca. |
| `PROPOSED` | Diseño de Mobile. Ver `BACKEND_REQUIREMENTS.md`. El equipo Backend decide. |

**Referencia de la verificación**

- `origin/master` @ `2624d478af5cd3cc90c4b65d9aa4c81bb2439cfc`
  — *merge: company-aware internal control dashboard* (reauditado en M0.2, sin
  cambios respecto a M0.1).
- Árbol observado: rama `feat/tenant-aware-commerce` @
  `6d8c3e0270c51e24c20e76489ea92829048a39cf`, **no mergeada en `master`**, más
  cambios sin commitear encima y las migraciones `0021`–`0026`.

M1 debe **volver a inspeccionar `master`** cuando el equipo Web cierre su fase;
hasta entonces, lo etiquetado como `OBSERVED_IN_PROGRESS` no debe usarse para
tomar decisiones de arquitectura Mobile.

Base actual: `EXPO_PUBLIC_API_BASE_URL` + `/api`.
Superficie propuesta para Mobile: `/api/v1/` — ver **BR-007**.

---

## Catálogo · `/api/v1/` — **INTEGRADO**

```
VERIFIED_STABLE_MASTER
VERSIONED
PUBLIC
TENANT_SAFE
INTEGRADO POR MOBILE (M2)
```

Verificado en `PapiCuche/BlackDogStore-web` @ `origin/master` **`b301637b`**
(PR #1, *feat(api): add tenant-safe v1 public catalog*), leyendo el código en
`master`, no la descripción del PR.

| Endpoint | Qué |
|---|---|
| `GET /api/v1/storefront/<company_slug>/products/` | Lista, filtrable |
| `GET /api/v1/storefront/<company_slug>/products/<product_slug>/` | Detalle por slug |
| `GET /api/v1/storefront/<company_slug>/categories/` | Categorías del tenant |

Query params de la lista: `category`, `search`, `in_stock=true`, `ordering`
(allowlist: `price`, `-price`, `name`, `-name`, `newest`).

Respuesta: **array plano**, igual que la superficie legacy.

Campos de producto: `id`, `name`, `slug`, `description`, `price`, `inventory`,
`category`, `image_url`, `average_rating`, `review_count`. Nada interno.

`inventory` son **unidades vendibles** — el stock de la sucursal de despacho, no
el total de la empresa. Es lo que el checkout puede entregar de verdad.

### El tenant va en la ruta

El storefront web resuelve su empresa por Host. Mobile llega a un host de API
compartido y no tiene ese Host, así que nombra el storefront que quiere.

Ese slug **selecciona un escaparate público; no autoriza nada**. El servidor
resuelve una empresa **activa** y construye todo el queryset desde ella.

Desconocida, inactiva, malformada y vacía → **el mismo 404**, con el mismo
cuerpo: el endpoint no puede recorrerse para enumerar qué empresas existen.

Ni query param, ni cabecera, ni Host, ni `DEFAULT_STOREFRONT_COMPANY_SLUG`
pueden cambiar el tenant de la ruta. El backend tiene un test por cada vector.

### Anónimo por diseño

`authentication_classes = []`. Mobile llama con `request`, nunca con
`authenticatedRequest`: un Bearer no pinta nada en un escaparate, y merece
decirse en voz alta porque `/api/v1/` es justo el prefijo habilitado para Bearer.

---

## Catálogo legacy · `/api/products/` — **RETIRADO DE MOBILE**

### `GET /api/products/`

```
VERIFIED_STABLE_MASTER
LEGACY
PUBLIC
NOT_TENANT_SAFE
YA NO LO USA MOBILE
```

**M2 lo retiró.** `LegacyApiCatalogRepository`, su wrapper de endpoint, su
guardia de red y `EXPO_PUBLIC_ENABLE_LEGACY_CATALOG` fueron **eliminados**, no
apagados: un segundo camino "temporal" a los mismos datos —y encima el
inseguro— es el que acaba usándose.

Se documenta aquí porque sigue existiendo en el backend para el frontend web,
que lo resuelve por Host y para el cual **sí** es correcto. Lo que sigue describe
ese endpoint tal como está en `master`; Mobile ya no lo llama.

`ProductViewSet` (`ReadOnlyModelViewSet`; permiso global `AllowAny`).

Query params que la vista lee de verdad:

| Param | Efecto |
|---|---|
| `slug` | `filter(slug=...)` |
| `category` | `filter(category__slug=...)` |
| `search` | `filter(name__icontains=...)` — solo nombre, no descripción |
| `in_stock=true` | `filter(inventory__gt=0)` |
| `ordering` | whitelist: `price`, `-price`, `name`, `-name`, `newest` |

Respuesta: **array plano**, sin envelope de paginación (desactivada globalmente
en `REST_FRAMEWORK`, con el comentario "frontend expects raw arrays").

```json
[
  {
    "id": 101,
    "name": "iPhone 15 Pro 256 GB",
    "slug": "iphone-15-pro-256",
    "description": "…",
    "price": "4899.00",
    "inventory": 4,
    "category": { "id": 1, "name": "iPhone", "slug": "iphone" },
    "image_url": "",
    "average_rating": 4.8,
    "review_count": 12
  }
]
```

Notas que el mapeador de la app respeta:

- `price` es **string** (DRF serializa `DecimalField` así). Se parsea solo al
  formatear, nunca antes.
- `category` puede ser `null` (`on_delete=SET_NULL`).
- `image_url` es `""` cuando no hay imagen — nunca `null`.
- `average_rating` es `null` mientras no haya reseñas.

#### Aislamiento por empresa — la corrección importante de M0.1

**En `master`, el catálogo NO está tenantizado.** El queryset es literalmente:

```python
Product.objects.select_related('category').prefetch_related('reviews').filter(is_active=True)
```

Sin filtro por empresa. `CategoryViewSet` es `Category.objects.all()`.

M0 afirmaba que el catálogo se resolvía por Host mediante
`resolve_storefront_company` y que por eso un cliente móvil recibiría una lista
vacía. **Eso describía código en progreso, no `master`.** En `master`,
`resolve_storefront_company`, `storefront_products` y `Product.company` **no
existen**.

`resolve_company_from_host` **sí** existe en `master`, pero no está conectado a
nada. Lo dice el propio backend, en su docstring:

> `Map a request host to a Company via its slug (DESIGNED, not yet wired up).`

y en la cabecera de `tenancy.py`:

> `resolve_company_from_host implements the lookup; no public view calls it yet`

Los tests de `CrossTenantError` de `master` cubren la superficie **admin** y las
membresías, no el catálogo público: los tests de `/api/products/` solo verifican
filtros y slugs, sin ninguna aserción de aislamiento.

Consecuencia real, y es la contraria a la documentada en M0: contra `master`, un
cliente móvil recibiría **todos los productos de la instalación**, sin ninguna
separación entre empresas. Para un piloto de una sola tienda funciona; para un
SaaS multiempresa es un **riesgo cross-tenant**, aunque el endpoint sea público.

#### Consecuencia en Mobile (M0.2)

La app **no puede** consumir este catálogo en staging ni en production, ni
siquiera con `EXPO_PUBLIC_USE_MOCK_DATA=false`. El gate falla cerrado y solo se
abre con las tres condiciones a la vez: entorno `development`, mocks apagados y
`EXPO_PUBLIC_ENABLE_LEGACY_CATALOG=true`. Ver README > "Catálogo legacy".

### `GET /api/categories/`

```
VERIFIED_STABLE_MASTER · LEGACY · PUBLIC · NOT_TENANT_SAFE
NOT_APPROVED_FOR_MOBILE_RELEASE
```

`CategoryViewSet`, `queryset = Category.objects.all()`. Array plano de
`{ id, name, slug }`. Igualmente global.

### Tenantización del catálogo · `OBSERVED_IN_PROGRESS`

En el árbol observado (no en `master`) el equipo Web está introduciendo:

- `Product.company` (FK a `Company`, `PROTECT`) y migraciones `0021`–`0023`.
- `store/tenancy.py::resolve_storefront_company`, que resuelve la empresa
  pública por **Host**, con `resolve_company_from_host` descartando
  explícitamente los subdominios `www`, `api`, `admin` y `app`.
- `storefront_products()` / `storefront_categories()`, que devuelven
  `.none()` cuando la empresa no resuelve.

Si esto llega a `master` tal cual, el efecto para Mobile cambia de "ve todo" a
"ve nada", porque un cliente móvil no tiene host de tenant. **Ninguno de los dos
extremos es un contrato SaaS válido para Mobile**, y por eso BR-002 sigue siendo
necesario en ambos escenarios — con motivos distintos. Ver
`BACKEND_REQUIREMENTS.md`.

Mobile **no** debe diseñar contra este código hasta que esté en `master`.

---

## Compra · `/api/v1/customer/<slug>/checkout/` — **INTEGRADO**

```
VERIFIED_STABLE_MASTER · VERSIONED · PRIVADO · INTEGRADO POR MOBILE (M5)
```

Verificado en `origin/master` **`0b184d3`** (PR #4), leyendo el código en `master`
y con smoke real: checkout 201, replay 200 con el mismo pedido, conflicto 409,
precio falso 400, stock intacto.

```
POST /api/v1/customer/<company_slug>/checkout/   Bearer v1
```

**Envía intención, no dinero.** `items: [{product_slug, quantity}]`, los datos del
comprador y una `idempotency_key`. El servidor **rechaza** —no ignora— `price`,
`total`, `subtotal`, `discount_amount`, `stock`, `company_id`, `branch_id`,
`status`, `paid`, `user_id`, `stripe_session_id` y `session_key`.

Respuesta: `{order_id, checkout_url}`. La URL es una página **alojada por
Stripe**; la app la valida como HTTPS de `stripe.com` antes de abrirla.

**Idempotencia.** Misma clave y misma cesta → el mismo pedido (200). Misma clave,
cesta distinta → **409**. En un replay cuya sesión caducó, `checkout_url` es null
y el cliente lee el estado del pedido.

**Nada se consume antes del pago**: ni carrito ni stock.

---

## Config pública · `/api/v1/storefront/<slug>/config/` — **INTEGRADO**

```
VERIFIED_STABLE_MASTER · VERSIONED · PÚBLICO · BR-006 CERRADO
```

Anónimo. **El mismo payload** que `/api/storefront/config/`, construido por la
misma función — el backend tiene un test que compara ambas respuestas byte a
byte.

Secciones: `company` (name, slug, legal_name, tax_id), `branding` (logo, colores),
`contact` (email, phone, **whatsapp_link**, web, redes, dirección) y `policies`
(garantía, términos, privacidad).

**Nada operativo**: ni `order_notification_email`, ni configuración de sucursal,
ni credenciales, ni capabilities.

Empresa desconocida e inactiva → el mismo 404 del catálogo.

---

## Superficie interna · `/api/v1/internal/` — **INTEGRADA**

```
VERIFIED_STABLE_MASTER · VERSIONED · PRIVADA · INTEGRADA POR MOBILE (M6)
```

Verificada en `origin/master` **`72042b2`** (PR #5), leyendo el código en `master`
y con smoke real.

| Endpoint | Requiere |
|---|---|
| `GET /api/v1/internal/<slug>/context/` | membresía activa |
| `GET /api/v1/internal/<slug>/orders/` | `sales.orders.view` |
| `GET /api/v1/internal/<slug>/orders/<id>/` | `sales.orders.view` |
| `PATCH /api/v1/internal/<slug>/orders/<id>/fulfillment/` | `sales.orders.manage` |

### Dos puertas, dos códigos

| Situación | Respuesta |
|---|---|
| Empresa desconocida · inactiva · **sin membresía** | **404** idéntico |
| Con membresía, **sin capability** | **403** |

Mobile los traduce a dos errores distintos —`InternalAccessDeniedError` y
`InternalCapabilityMissingError`— porque exigen respuestas distintas: uno cierra
el área, el otro cierra un módulo.

**Una relación de cliente no abre nada de esto.** `manage` **no implica** `view`.

### El detalle trae sus transiciones

`available_fulfillment_transitions` viene **del servidor**. No hay tabla de
transiciones en la app: una que calculara la suya derivaría en cuanto cambiara la
regla, y la deriva sería un botón que falla.

### Qué NO viaja

Identificadores de Stripe, `payment_error`, `email_send_error`,
`cart_session_key`, `company_snapshot`. Allowlist, igual que en cliente.

---

## Inventario interno · `/api/v1/internal/<slug>/inventory/` — **INTEGRADO**

```
VERIFIED_STABLE_MASTER · VERSIONED · PRIVADO · INTEGRADO POR MOBILE (M7A)
```

Verificado en `origin/master` **`fd6ea01`** (PR #6), leyendo el código en
`master` y con smoke real sobre los cuatro endpoints. Cada nombre de campo de
`internal-inventory-v1.ts` salió de una respuesta real.

| Endpoint | Requiere |
|---|---|
| `GET .../inventory/summary/` | `inventory.view` |
| `GET .../inventory/stock/` | `inventory.view` |
| `GET .../inventory/movements/` | `inventory.view` |
| `POST .../inventory/adjustments/` | `inventory.adjust` |

### TRES puertas, tres códigos

| Situación | Respuesta |
|---|---|
| Empresa desconocida · inactiva · **sin membresía** | **404** idéntico |
| Con membresía, **sin capability** | **403** |
| Con capability, **sucursal fuera de su acceso** | **404**, no 403 |

El tercero es el que distingue a este módulo. Un 403 confirmaría que la sucursal
existe, y un empleado con acceso a una sola tienda podría barrer ids hasta
levantar el mapa de sucursales de su empresa.

Mobile lo traduce a un tercer error, `BranchOutOfScopeError`, en vez de
reutilizar `InternalAccessDeniedError`: decirle a alguien que perdió toda su
membresía cuando solo tocó una tienda ajena es la alarma equivocada. La
distinción se hace por lo que la app **preguntó** (`hadBranch`), no por lo que el
servidor respondió — el servidor manda el mismo 404 a propósito.

### Sin `branch_id` no es un error

La lectura se agrega sobre las sucursales visibles, y ese conjunto puede ser
vacío (`branch_access_mode=SELECTED` sin filas asignadas). La respuesta es **200
con cero filas** y `available_branches: []`. La app lo dice con un `EmptyState`,
no con un `ErrorState`: no tener sucursales asignadas es un estado legítimo de la
empresa.

`available_branches` viene del servidor en `summary/`. El selector no se dibuja
desde una lista cacheada, porque el acceso a una tienda puede retirarse entre dos
visitas.

### El ajuste manda intención, nunca resultado

`POST adjustments/` acepta `product_slug`, `branch_id`, `movement_type`,
`quantity` (positiva) y `reason`.

**No existe `quantity_after` ni `new_quantity`**, ni en el contrato ni en
`StockAdjustmentInput`. Un total calculado en el teléfono es una afirmación sobre
un número que otra persona puede estar cambiando en ese instante. El signo lo
pone el tipo; la aritmética, el servidor, bajo `select_for_update()`; el
resultado vuelve como `stock_after` en la respuesta.

Los tipos ofrecidos reflejan `StockMovement.MANUAL_TYPES`. `sale_exit` no está
porque lo produce el pipeline de pago, y las transferencias porque una escrita a
mano por un solo lado es stock que se desvanece. Un test lo vigila.

Un **400** es una respuesta de negocio ("no hay stock suficiente"), no un fallo:
`StockAdjustmentRejectedError` conserva las palabras del servidor en vez de
reemplazarlas por «ocurrió un error inesperado».

### Qué NO existe en v1

Transferencias y recuentos. Son flujos de varios pasos en el dominio, y la app no
inventa un POST que los aplane.

---

## Pedidos de cliente · `/api/v1/customer/` — **INTEGRADO**

```
VERIFIED_STABLE_MASTER · VERSIONED · PRIVADO · INTEGRADO POR MOBILE (M4)
```

Verificado en `origin/master` **`b253156`** (PR #3), leyendo el código en
`master` y con smoke real.

| Endpoint | Auth | Qué |
|---|---|---|
| `GET /api/v1/customer/<company_slug>/orders/` | **Bearer v1** | Solo los pedidos del llamante |
| `GET /api/v1/customer/<company_slug>/orders/<id>/` | **Bearer v1** | 404 si no es suyo |

### Tres audiencias — DEC-API-001

| Prefijo | Audiencia | Auth |
|---|---|---|
| `storefront/` | pública | ninguna |
| `customer/` | **cliente, sus propios registros** | Bearer v1 |
| `internal/` | staff bajo capability | Bearer v1 + capability |

Espacios de URL separados, no un endpoint que ensancha su queryset según quién
pregunte.

### Propiedad

`Order.user` **o** `Order.customer.user`. **Nunca el email**: es una instantánea
de lo que se tecleó al pagar, sin unicidad, y una familia comparte dirección.

**Ser empleado no es ser cliente.** Vendedor, almacenero, técnico, admin de
empresa y platform master reciben 404. Un empleado que además compra ahí ve solo
sus propias compras.

Archivar la ficha CRM **no** quita acceso al propio historial.

### Campos

`id` · `status` + `status_label` · **`fulfillment_status`** + label · `total` ·
`discount_amount` · `coupon_code` · `delivery_method` + label · `created_at` ·
`paid_at` · `items[]` (`product_name`, `product_slug`, `image_url`, `quantity`,
`price`).

**BR-003 cerrado para v1.** Las etiquetas las renderiza el servidor: es dueño de
la máquina de estados, así que es dueño de sus palabras.

**No viajan**: identificadores de Stripe, `payment_error`, `email_send_error`,
`cart_session_key`, marcas de correos internos, `company_snapshot`,
`fulfillment_branch`, ni los datos personales que el comprador ya tecleó.

### Fail-safe

Empresa desconocida, inactiva y "no eres cliente" → **el mismo 404**. Mobile lee
un 404 de la **lista** como lista vacía: el contrato se niega a distinguir esos
tres casos a propósito, y el cliente no inventa una distinción que el servidor
rechaza hacer.

---

## Pedidos

### `GET /api/orders/` · `VERIFIED_STABLE_MASTER`, no consumible

`OrderViewSet` (`ReadOnlyModelViewSet`, `IsAuthenticated`). Un cliente ve solo
sus pedidos; staff con rol `admin`/`superadmin`/`sales` ve todos.

Campos serializados (`OrderSerializer.fields`, todos read-only):

```
id, user, customer_name, customer_email, total, discount_amount,
coupon_code, status, paid, paid_at, stripe_session_id, created_at, items[]
```

`status` (`Order.Status` — **pago**):
`pending_payment` · `paid` · `failed` · `cancelled` · `expired` · `refunded`

⚠️ **`fulfillment_status` NO está en el serializer** — verificado en `master`.
Sí existe en el **modelo**, también en `master` (`Order.FulfillmentStatus`:
`pending`, `confirmed`, `preparing`, `ready_for_pickup`, `shipped`, `delivered`,
`cancelled`). Ver **BR-003**.

⚠️ **Bloqueo:** exige sesión autenticada por cookie HttpOnly + CSRF. Ver
**BR-001** y `MOBILE_AUTH.md`.

---

## Autenticación nativa · `/api/v1/auth/` — **INTEGRADA**

```
VERIFIED_STABLE_MASTER
VERSIONED
INTEGRADO POR MOBILE (M3)
```

Verificado en `origin/master` **`7c55ebc`** (PR #2), leyendo el código en
`master` y con un smoke real contra el servidor.

| Endpoint | Auth | Qué |
|---|---|---|
| `POST /api/v1/auth/login/` | ninguna · 5/min | `{email, password}` → tokens en el **cuerpo** |
| `POST /api/v1/auth/refresh/` | ninguna | `{refresh}` → access + refresh **rotado** |
| `POST /api/v1/auth/logout/` | ninguna | best-effort, siempre 200 |
| `GET /api/v1/auth/me/` | **Bearer v1** | identidad + `available_companies` |

Respuesta de login:

```json
{
  "access": "...", "refresh": "...", "expires_in": 1800,
  "user": { "id": 1, "username": "...", "email": "...", "first_name": "...",
            "last_name": "...", "role": "customer", "is_email_verified": true },
  "available_companies": [ { "slug": "...", "name": "...", "relation": "customer" } ]
}
```

**Sin `Set-Cookie`.** Hay test en ambos lados.

### `available_companies` no es autorización

El servidor lo calcula desde `Membership` activa **o** `Customer` activo del
usuario autenticado, con la empresa activa. Nunca desde nada que el cliente
envíe: un `company` en el body o una cabecera `X-Company-Slug` no añaden nada, y
`is_superuser` se ignora.

Mobile usa `EXPO_PUBLIC_COMPANY_SLUG` para **buscar** su empresa en esa lista. Si
está, es `activeCompany`; si no, `activeCompany` es **null** — sin caer al piloto
ni a "la primera de la lista". Toda API privada futura revalidará por su cuenta.

### `is_email_verified` siempre es `true` aquí

El backend no tiene columna de verificación: el registro crea la cuenta
`is_active=False` y verificar la pone en `True`. Un usuario inactivo no obtiene
token, así que quien se autentica está verificado por construcción.

### Fuera de scope — BR-001B

`/api/v1/auth/register|verify-email|resend-verification|password-reset|change-password/`
**no existen** y devuelven 404, con tests en el backend que lo fijan. La app no
muestra esos formularios en modo backend.

---

## Autenticación

### VERIFIED_STABLE_MASTER — el contrato web real

Rutas existentes en `master` (`store/auth_views.py`):

```
POST /api/auth/register/                  POST /api/auth/login/
POST /api/auth/refresh/                   POST /api/auth/logout/
GET  /api/auth/csrf/                      GET  /api/auth/me/
POST /api/auth/verify-email/              POST /api/auth/resend-verification/
POST /api/auth/password-reset/request/    POST /api/auth/password-reset/confirm/
POST /api/auth/change-password/
```

`REST_FRAMEWORK.DEFAULT_AUTHENTICATION_CLASSES` contiene **únicamente**
`store.authentication.CookieJWTAuthentication`.

`POST /api/auth/login/` — verificado:

```json
{ "detail": "Login correcto.", "user": { "id": 1, "username": "...", "email": "...", "first_name": "...", "last_name": "..." } }
```

Los JWT salen **solo** en cookies HttpOnly (`_set_auth_cookies`). El body no los
contiene, y eso es deliberado.

Detalles verificados que corrigen suposiciones de M0:

| Detalle | Realidad en `master` |
|---|---|
| Campo de login | `TokenObtainPairSerializer` sobre `auth.User` → **`username`**, no email |
| `role` en el login | **No aparece.** `UserSerializer` es `[id, username, email, first_name, last_name]` |
| `role` disponible en | `GET /api/auth/me/`, que lo añade junto a `is_staff` |
| Token de verificación | `secrets.token_urlsafe(48)` — **opaco y largo**, no un código de 6 dígitos |
| Rotación | `ROTATE_REFRESH_TOKENS: True`, `BLACKLIST_AFTER_ROTATION: True` |
| Throttle de login | `LoginThrottle` (`AnonRateThrottle`, scope `login`, 5/min) |
| Blacklist | `rest_framework_simplejwt.token_blacklist` instalada |

### PROPOSED_MOBILE_V1 — lo que Mobile pide

**PROPUESTA. No existe. No se llama.** Ver BR-001 y BR-007.

```
POST /api/v1/auth/login/
POST /api/v1/auth/refresh/
POST /api/v1/auth/logout/
```

Respuesta propuesta para login y refresh:

```json
{ "access": "<jwt>", "refresh": "<jwt>", "expires_in": 1800, "user": { "...": "..." } }
```

El mapeador `toTokenPair()` ya existe en `src/auth/tokens/token-types.ts` y
convierte ese snake_case al modelo interno. **Mobile no afirma que Django
devuelva camelCase**: el modelo interno es camelCase, el contrato de cable es
snake_case, y la conversión es explícita.

### API_PENDING — estado Mobile

La app **no llama a ningún endpoint de autenticación**. `authenticatedRequest()`
lanza `AuthUnavailableError` antes de tocar la red mientras no exista contrato,
y `assertBearerAllowed()` impide que un Bearer llegue a `/api/auth/*`,
`/api/admin/*`, `/api/me/*` o `/api/products/*`.

Ver `MOBILE_AUTH.md`.

## Reparaciones · no existe

`MOCK`. No hay modelo, ni serializer, ni ruta — verificado sobre la lista
completa de clases de `store/models.py` **en `master`** y también en el árbol en
progreso. Propuesta completa en **BR-005**.

---

## Seguimiento seguro para el cliente · no existe

`API_PENDING`. No hay endpoint de seguimiento, no hay token de seguimiento y no
hay `RepairOrder` — verificado sobre `store/urls.py`, `store/views.py` y
`store/models.py` **en `master`**. Propuesta completa en **BR-008**.

M1.2 **reconoce** `blackdogstore://track/<token>` únicamente para poder
rechazarlo de forma explícita: la decisión es siempre `feature-unavailable`. El
token no se guarda, no se registra, no se envía a ninguna parte y no se simula
ninguna pantalla de seguimiento. Ver `docs/LINKING_STRATEGY.md`.

---

## Marca / multiempresa · no existe como endpoint público

`MOCK`. `Company` existe en `master` (SaaS Fase 1) pero sin campos de marca, y
`CompanySerializer` solo se expone bajo `admin/*` — incluyendo `tax_id` y
`legal_name`, que no deben salir a un cliente. Propuesta en **BR-006**.

---

## Versionado · `PROPOSED`

Mobile propone que su contrato viva en `/api/v1/`, **aditivo** y sin renombrar
ni modificar `/api/` (contrato legacy del frontend web). Ver **BR-007**.

### Compatibilidad, una vez Mobile consuma `/api/v1/`

Una versión antigua de la app sigue instalada en teléfonos que nadie va a
actualizar. Por eso, a partir del momento en que Mobile consuma `/api/v1/`:

- **no eliminar campos** de una respuesta;
- **no renombrar campos**;
- los cambios deben ser **aditivos**;
- un breaking change exige `/api/v2/`, no una modificación de `/api/v1/`.

### OpenAPI · `PROPUESTA PRIORITARIA`

Cuando `/api/v1/` exista, Backend debería publicar un esquema OpenAPI. Mobile
generaría a partir de él los tipos de cable y, posiblemente, el cliente — lo que
elimina la clase entera de bugs "el mapeador asumía otra cosa".

M1 **no** instala generadores: sin esquema no hay nada que generar.

Hasta que exista, el catálogo legacy `/api/products/` y `/api/categories/`
**no se considera el contrato SaaS definitivo de Mobile**: hoy es global,
mañana puede resolverse por Host, y ninguna de las dos formas sirve para un
cliente móvil multiempresa.

---

## Endpoints existentes que Mobile NO usa en M0

Verificados en `master`, pero fuera de alcance de esta fase — se listan para que
no se "redescubran" más adelante:

- `/api/cart/` — carrito por `session_key` de navegador.
- `/api/payments/create-checkout-session/`, `/webhook/`, `/status/` — Stripe Checkout web.
- `/api/coupons/validate/`
- `/api/reviews/`
- Toda la superficie `/api/admin/*` — inventario, kardex, notas de venta, empresas, roles.
- `/api/me/memberships/`, `/api/me/company-access/`, `/api/me/internal-dashboard/`

---

## Servicio técnico · interno y cliente — **INTEGRADO** (núcleo)

```
VERIFIED_STABLE_MASTER · VERSIONED · INTEGRADO POR MOBILE (M8)
```

Verificado en `origin/master` **`43fffb0`** (PR #7), leyendo el código en
`master` y con smoke real sobre las once rutas. Cada nombre de campo de
`internal-service-v1.ts` y `customer-repairs-v1.ts` salió de una respuesta.

### Interna — `/api/v1/internal/<slug>/service/`

| Endpoint | Requiere |
|---|---|
| `GET context/` | `service.orders.view` |
| `GET customers/?search=` | `service.customers.view` |
| `GET · POST devices/` | `service.devices.view` · `.manage` |
| `GET devices/<id>/` | `service.devices.view` |
| `GET · POST orders/` | `service.orders.view` · `.create` |
| `GET orders/<id>/` | `service.orders.view` |
| `GET orders/<id>/history/` | `service.orders.view` |
| `POST orders/<id>/transition/` | `service.orders.manage` |
| `GET · POST orders/<id>/assignment/` | `service.orders.manage` |

Tres puertas, como en M7A: pertenencia → 404, capability → 403, **sucursal u
orden fuera de alcance → 404**. Mobile lo traduce a `ServiceOutOfScopeError`,
distinto de `InternalAccessDeniedError`: perder el acceso a una tienda no es
perder el área interna.

### Cliente — `/api/v1/customer/<slug>/repairs/`

| Endpoint | Qué |
|---|---|
| `GET repairs/` | Solo las reparaciones del llamante. **Array crudo**, sin envoltorio |
| `GET repairs/<id>/` | 404 si no es suya |

La lista es un ViewSet, así que devuelve un array; la superficie interna es
`APIView` y devuelve `{count, page, page_size, results}`. Es la convención de la
casa, no un descuido.

### Qué NO viaja al cliente

`internal_notes`, `physical_condition`, `received_accessories`, `assignments`,
nombre/correo/teléfono del técnico, `branch`, `available_transitions` y el
`comment` de cualquier evento.

El timeline se filtra **en el servidor**: la app no recibe el evento oculto, que
es una garantía más fuerte que pedirle que no lo dibuje. Y
`is_customer_visible` se congela al escribir el evento, así que cambiar la
política mañana no revela retroactivamente lo que un cliente ya vio.

### El servidor manda la máquina y las palabras

`available_transitions` llega calculado, con `{code, label}`. No hay tabla de
transiciones en esta app y un test estructural falla si aparece. Las etiquetas
son las que **esa empresa** configuró: renombrar «Recibido» a «En mostrador» se
ve en la app sin que la app sepa nada.

### La identidad la fija el servidor

`number`, `status`, `company`, `received_by` y `received_at` no tienen campo en
ningún payload de Mobile. Comprobado con smoke: enviar `status:
'waiting_approval'` y `number: 'HACKEADO-1'` devolvió `received` y `SRV-000001`.

## Diagnóstico, cotización y aprobación — **INTEGRADO** (M9 / BR-005B)

```
VERIFIED_STABLE_MASTER · VERSIONED · INTEGRADO POR MOBILE (M9)
```

Verificado en `origin/master` **`36b8a8c`** (PR #8) con smoke real sobre las diez
rutas nuevas. Cada campo de más abajo salió de una respuesta.

### Interna — `/api/v1/internal/<slug>/service/orders/<id>/`

| Endpoint | Requiere |
|---|---|
| `GET · POST diagnostics/` | `service.orders.view` · `service.diagnostic.manage` |
| `PATCH diagnostics/<id>/` | `service.diagnostic.manage` |
| `GET · POST quotes/` | `service.orders.view` · `service.diagnostic.manage` |
| `PATCH quotes/<id>/` | `service.diagnostic.manage` |
| `POST quotes/<id>/items/` | `service.diagnostic.manage` |
| `DELETE quotes/<id>/items/<item>/` | `service.diagnostic.manage` |
| `POST quotes/<id>/publish/` | `service.diagnostic.manage` |
| `POST quotes/<id>/cancel/` | `service.diagnostic.manage` |

Las dos colecciones devuelven `{count, results}` — **no** el envoltorio de cuatro
campos de órdenes y equipos. Ninguna de las dos pagina: una orden tiene tres
diagnósticos y dos cotizaciones, no trescientas.

`service.diagnostic.manage` es una capability **nueva y separada** de
`service.orders.manage`. Mover una orden de estado y poner precio a un trabajo
son dos autoridades distintas, y el taller que quiera darle la primera a un
mostrador sin darle la segunda ya puede.

### Cliente — `/api/v1/customer/<slug>/repairs/<id>/`

| Endpoint | Qué |
|---|---|
| `GET quote/` | La cotización **vigente**, o `{"quote": null}` |
| `POST quotes/<id>/decision/` | `{decision: "approve"\|"reject", reason?}` |

`{"quote": null}` es la respuesta normal durante casi toda la vida de una
reparación, no un error: tratarla como fallo pondría una tarjeta roja en una
pantalla sana.

### El cuerpo de una decisión tiene dos campos, y uno es opcional

Nada más. No hay `customer_id`, ni `amount`, ni `decided_at`, ni `channel`: el
servidor ya sabe quién llama, cuánto costaba y cuándo es ahora. Un cliente capaz
de decir cualquiera de esas cosas es un cliente capaz de decir una versión mejor
de lo que pasó.

Comprobado con smoke sobre `master`: inyectar `revision: 99`, `currency: 'USD'`,
`total: '1.00'`, `status: 'sent'` y `line_total: '1.00'` no cambió ni un campo.

### Tres respuestas distintas a una decisión

| Código | Qué pasó | Qué hace la app |
|---|---|---|
| `200` | Se registró, o ya estaba registrada **igual** | Refresca y muestra el resultado |
| `409` | Ya estaba registrada **al revés** | `QuoteAlreadyDecidedError` → refresca |
| `400` | Venció, no está enviada, no se puede | Muestra las palabras del servidor |

El `409` es el caso real: el mostrador contestó por teléfono un segundo antes.
La app **refresca en `onSettled`, no en `onSuccess`**, para que quien perdió esa
carrera acabe mirando el estado verdadero en vez de una pantalla obsoleta.

Repetir la **misma** respuesta devuelve el mismo `decided_at` — verificado con
smoke. No hay reintento en ninguna de las dos superficies: reintentar es la app
contestando una segunda vez en nombre de alguien.

### El servidor calcula el dinero, la app lo enseña

`subtotal`, `tax_amount`, `total` y `line_total` son **respuesta**, nunca
petición. Una línea se manda con `item_type`, `description`, `quantity` y
`unit_price`; la multiplicación es del servidor. Todos los importes viajan y se
guardan como **string decimal** y se parsean en el punto de dibujo, nunca antes.

`is_expired` y `can_be_decided` también los calcula el servidor, y la app exige
que sean estrictamente `true`. El reloj de un teléfono no es la autoridad sobre
si una oferta sigue abierta.

### Qué NO viaja al cliente, otra vez

`internal_notes` de la cotización y del diagnóstico, `created_by_name`,
`is_editable`, `revision` de los borradores, el `product` de cada línea, el
`channel` de la decisión — y **el `reason` que escribió el propio cliente**. Lo
escribió, no necesita que se lo lean de vuelta, y no tenerlo significa que ningún
cambio futuro puede empezar a enseñarle a uno las palabras de otro.

### La cotización publicada se congela

Una cotización enviada no se edita: se **cancela** y se hace otra, con `revision`
nueva. El modelo lo impide a nivel de `save()`, no solo la vista. Es la misma
razón por la que un pedido no se edita después de pagarse.

### `waiting_approval` salió de `available_transitions`

Publicar una cotización es lo que mueve la orden ahí, y la respuesta de un
cliente es lo que la mueve de ahí. El endpoint genérico de transición devuelve
**400** para esos saltos — verificado con smoke sobre `approved`. La app no
notó nada porque nunca tuvo la tabla.

## Ejecución y repuestos — **INTEGRADO** (M10 / BR-005C)

```
VERIFIED_STABLE_MASTER · VERSIONED · INTEGRADO POR MOBILE (M10)
```

Verificado en `origin/master` **`82695d3`** (PR #9) con smoke real sobre las diez
rutas. Cada campo salió de una respuesta.

### Interna — `/api/v1/internal/<slug>/service/orders/<id>/`

| Endpoint | Requiere |
|---|---|
| `GET execution/` | `service.orders.view` |
| `PATCH execution/` | `service.repair.manage` |
| `POST execution/start/` | `service.repair.manage` |
| `POST execution/complete/` | `service.repair.manage` |
| `POST execution/pause/` | `service.repair.manage` |
| `POST execution/resume/` | `service.repair.manage` |
| `GET parts/` · `GET parts/candidates/` | `service.orders.view` |
| `POST parts/` | `service.repair.manage` |
| `POST parts/<id>/reverse/` | `service.repair.manage` |

`GET execution/` responde `{"execution": null}` mientras nadie haya empezado.
Es la respuesta normal durante casi toda la vida de una orden, no un error.

### Tres estados nuevos, y ninguno es un desplegable

`in_repair`, `waiting_parts` y `repaired` son **event-only**: el endpoint
genérico de transición los rechaza con 400. Empezar, pausar y terminar son
hechos sobre un banco de trabajo, y cada uno tiene su operación, que escribe la
fila que le da sentido al estado.

`repaired` **no es terminal** y no marca `closed_at`. Significa que el técnico
terminó: ni revisado, ni listo para recoger, ni avisado, ni pagado, ni
entregado. Su etiqueta por defecto es «Reparado» y nada más.

### El cuerpo de un consumo tiene tres campos

`quote_item_id`, `quantity`, `idempotency_key`. No hay sucursal — es la de la
orden, y como no existe transferencia en este flujo, nombrar otra tienda serían
unidades moviéndose en papel que nadie cargó. No hay producto — es el de la
línea cotizada. No hay precio — la cotización lo cerró una vez. No hay tipo de
movimiento ni cifras de stock — los calcula inventario.

Comprobado con smoke: inyectar `branch_id`, `product_id`, `unit_price`,
`stock_after`, `movement_type` y `company_id` no cambió ni un campo.

### Toda pieza traza a una línea aprobada

`quote_item` es obligatorio y tiene que ser una línea `part` de la cotización
**aprobada** de esa orden. No un id de producto: una pieza que alguien cotizó y
que el cliente aceptó. Consumir más de lo aprobado devuelve 400.

Las cantidades son **enteras**. `BranchStock.quantity` es un entero con check
constraint no negativo, y una línea cotizada con cantidad fraccionaria se
rechaza en vez de redondearse hacia el inventario de alguien.

### Dos conflictos distintos bajo un mismo 409

| `code` | Qué pasó | Qué hace la app |
|---|---|---|
| `insufficient_stock` | La sucursal de la orden no tiene la pieza | Lo dice y no cambia nada |
| `idempotency_conflict` | Esa clave ya se usó para otra petición | Lo dice; no reintenta |

La app **ramifica por el `code`, nunca por el castellano**: existen tres
plantillas distintas del mismo mensaje de stock en el backend y ninguna es
contrato. `ApiError` ganó un campo `code` para esto.

Un consumo fallido **no mueve el ciclo de vida**. Pausar por repuestos es una
acción explícita: un taller no debe descubrir su propio estado leyendo logs.

### Idempotencia

Clave acuñada por el cliente + huella de la petición, en columnas con
`UniqueConstraint` parcial — la misma forma que ya usan la venta POS y el
checkout nativo. Misma clave + misma petición devuelve la fila original; misma
clave + otra petición devuelve 409.

Mobile la acuña **una vez por intención** y la guarda en un `ref` a través de
los reintentos. Cambia cuando cambia la petición: otra línea u otra cantidad es
otra intención.

### Deshacer es compensar

`POST parts/<id>/reverse/`, nunca `DELETE`. Un movimiento contrario devuelve las
unidades y la fila queda marcada; el registro original y su movimiento siguen
donde estaban. Es idempotente. Después de finalizar el trabajo la pieza queda
congelada: una batería instalada no vuelve a la estantería porque alguien pulse
deshacer.

### Al cliente no le llega nada de esto

El serializer de cliente no ganó un solo campo. Ve el estado nuevo y la
etiqueta de su empresa; no ve el trabajo realizado, las notas internas, las
piezas, el stock, el coste, la identidad del técnico ni la sucursal. Un smoke
comprueba que el payload son exactamente diez campos.

### Un 500 preexistente corregido

`GET` sobre `/api/v1/customer/<slug>/repairs/<pk>/quotes/<id>/decision/` heredaba
un `get()` cuya firma no acepta `quote_id`: TypeError sin convertir, 500 en vez
de 405. Ahora `http_method_names = ['post']`.

### Pendiente

Control de calidad, listo para recoger, entrega, pago del servicio, garantía.
Reserva de stock al cotizar **no existe y es deliberado**. Devolución de piezas
después de finalizar: pendiente, necesita inspección física. Evidencias
fotográficas siguen `API_PENDING` (DEC-016). BR-008 sigue `API_PENDING`.
