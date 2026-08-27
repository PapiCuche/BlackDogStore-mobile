# API Contract

Solo se documentan endpoints **verificados leyendo el código real** de
`PapiCuche/BlackDogStore-web` (`store/urls.py`, `store/views.py`,
`store/serializers.py`). Nada aquí es inventado ni asumido.

Base: `EXPO_PUBLIC_API_BASE_URL` + `/api`.

Leyenda de estado de integración:

- `API_READY` — el endpoint existe y está verificado; la app aún no lo consume.
- `API_PENDING` — el endpoint existe pero un bloqueo impide consumirlo.
- `MOCK` — no existe endpoint.

---

## Catálogo — VERIFICADO

### `GET /api/products/` · `API_READY`

`ProductViewSet` (`ReadOnlyModelViewSet`, permiso global `AllowAny`).

Query params que la vista lee de verdad:

| Param | Efecto |
|---|---|
| `slug` | `filter(slug=...)` |
| `category` | `filter(category__slug=...)` |
| `search` | `filter(name__icontains=...)` — solo nombre, no descripción |
| `in_stock=true` | `filter(inventory__gt=0)` |
| `ordering` | whitelist: `price`, `-price`, `name`, `-name`, `newest` |

Respuesta: **array plano**, sin envelope de paginación (desactivada globalmente).

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
- `image_url` es `""` cuando no hay imagen — nunca `null` (`blank=True, default=''`).
- `average_rating` es `null` mientras no haya reseñas.

⚠️ **Bloqueo real:** el queryset nace filtrado por tenant vía
`storefront_products(request)`, que resuelve la empresa por **Host**. Un cliente
móvil no tiene host de tenant, por lo que en producción esta llamada devuelve
`[]`. Ver **BR-002**.

### `GET /api/categories/` · `API_READY`

`CategoryViewSet`, mismo esquema de tenant. Array plano de
`{ id, name, slug }`.

---

## Pedidos — VERIFICADO, NO CONSUMIBLE

### `GET /api/orders/` · `API_PENDING`

`OrderViewSet` (`ReadOnlyModelViewSet`, `IsAuthenticated`). Un cliente ve solo
sus pedidos; staff con rol `admin`/`superadmin`/`sales` ve todos.

Campos serializados (`OrderSerializer.fields`, todos read-only):

```
id, user, customer_name, customer_email, total, discount_amount,
coupon_code, status, paid, paid_at, stripe_session_id, created_at, items[]
```

`status` (`Order.Status` — **pago**):
`pending_payment` · `paid` · `failed` · `cancelled` · `expired` · `refunded`

⚠️ **`fulfillment_status` NO está en el serializer**, aunque sí existe en el
modelo (`Order.FulfillmentStatus`: `pending`, `confirmed`, `preparing`,
`ready_for_pickup`, `shipped`, `delivered`, `cancelled`). Ver **BR-003**.

⚠️ **Bloqueo real:** exige sesión autenticada por cookie HttpOnly + CSRF. Ver
**BR-001** y `MOBILE_AUTH.md`.

---

## Autenticación — VERIFICADA, INCOMPATIBLE CON MOBILE

Endpoints existentes (`store/auth_views.py`):

```
POST /api/auth/register/                  POST /api/auth/login/
POST /api/auth/refresh/                   POST /api/auth/logout/
GET  /api/auth/csrf/                      GET  /api/auth/me/
POST /api/auth/verify-email/              POST /api/auth/resend-verification/
POST /api/auth/password-reset/request/    POST /api/auth/password-reset/confirm/
POST /api/auth/change-password/
```

Todos existen y funcionan — **para un navegador**. `LoginView` escribe los JWT
en cookies HttpOnly y deliberadamente **no** los devuelve en el body;
`CookieJWTAuthentication` exige CSRF en toda petición autenticada.

La app **no llama a ninguno**. Ver `MOBILE_AUTH.md`.

---

## Reparaciones — NO EXISTE

`MOCK`. No hay modelo, ni serializer, ni ruta. Verificado sobre la lista completa
de clases de `store/models.py`. Propuesta completa en **BR-005**.

---

## Marca / multiempresa — NO EXISTE COMO ENDPOINT PÚBLICO

`MOCK`. `Company` existe pero sin campos de marca, y `CompanySerializer` solo se
expone bajo `admin/*` (que además incluye `tax_id` y `legal_name`, datos que no
deben salir a un cliente). Propuesta en **BR-006**.

---

## Endpoints existentes que Mobile NO usa en M0

Verificados, pero fuera de alcance de esta fase — se listan para que no se
"redescubran" más adelante:

- `/api/cart/` — carrito por `session_key` de navegador.
- `/api/payments/create-checkout-session/`, `/webhook/`, `/status/` — Stripe Checkout web.
- `/api/coupons/validate/`
- `/api/reviews/`
- Toda la superficie `/api/admin/*` — inventario, kardex, notas de venta, empresas, roles.
- `/api/me/memberships/`, `/api/me/company-access/`, `/api/me/internal-dashboard/`
