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

- `origin/master` @ `2624d47` — *merge: company-aware internal control dashboard*
- Árbol observado: rama `feat/tenant-aware-commerce` @ `6d8c3e0`, más ~20
  archivos modificados sin commitear y las migraciones `0021`–`0026`.

M1 debe **volver a inspeccionar `master`** cuando el equipo Web cierre su fase;
hasta entonces, lo etiquetado como `OBSERVED_IN_PROGRESS` no debe usarse para
tomar decisiones de arquitectura Mobile.

Base actual: `EXPO_PUBLIC_API_BASE_URL` + `/api`.
Superficie propuesta para Mobile: `/api/v1/` — ver **BR-007**.

---

## Catálogo

### `GET /api/products/` · `VERIFIED_STABLE_MASTER`

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

Consecuencia real, y es la contraria a la documentada en M0: contra `master`, un
cliente móvil recibiría **todos los productos de la instalación**, sin ninguna
separación entre empresas. Para un piloto de una sola tienda funciona; para un
SaaS multiempresa no es un contrato utilizable.

### `GET /api/categories/` · `VERIFIED_STABLE_MASTER`

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

## Autenticación · `VERIFIED_STABLE_MASTER`, incompatible con Mobile

Rutas existentes en `master` (`store/auth_views.py`):

```
POST /api/auth/register/                  POST /api/auth/login/
POST /api/auth/refresh/                   POST /api/auth/logout/
GET  /api/auth/csrf/                      GET  /api/auth/me/
POST /api/auth/verify-email/              POST /api/auth/resend-verification/
POST /api/auth/password-reset/request/    POST /api/auth/password-reset/confirm/
POST /api/auth/change-password/
```

En `master`, `REST_FRAMEWORK.DEFAULT_AUTHENTICATION_CLASSES` contiene
**únicamente** `store.authentication.CookieJWTAuthentication`. `LoginView`
escribe los JWT en cookies HttpOnly y deliberadamente **no** los devuelve en el
body; `CookieJWTAuthentication` ejecuta `enforce_csrf` en toda petición
autenticada.

Todo esto funciona — **para un navegador**. La app **no llama a ninguno de estos
endpoints**. Ver `MOBILE_AUTH.md`.

---

## Reparaciones · no existe

`MOCK`. No hay modelo, ni serializer, ni ruta — verificado sobre la lista
completa de clases de `store/models.py` **en `master`** y también en el árbol en
progreso. Propuesta completa en **BR-005**.

---

## Marca / multiempresa · no existe como endpoint público

`MOCK`. `Company` existe en `master` (SaaS Fase 1) pero sin campos de marca, y
`CompanySerializer` solo se expone bajo `admin/*` — incluyendo `tax_id` y
`legal_name`, que no deben salir a un cliente. Propuesta en **BR-006**.

---

## Versionado · `PROPOSED`

Mobile propone que su contrato viva en `/api/v1/`, **aditivo** y sin renombrar
ni modificar `/api/` (contrato legacy del frontend web). Ver **BR-007**.

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
