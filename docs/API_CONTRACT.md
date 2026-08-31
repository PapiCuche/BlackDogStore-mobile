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
