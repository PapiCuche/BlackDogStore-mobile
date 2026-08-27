# Backend Requirements — propuestas de Mobile

**Estado del documento:** PROPUESTA
**Autor:** equipo Mobile
**Autoridad final:** equipo Backend

Todo lo que sigue es una **propuesta**. El equipo Mobile no ha modificado —
ni modificará— nada en `PapiCuche/BlackDogStore-web`. Cada requerimiento nació
de leer el código real del backend (`store/models.py`, `store/urls.py`,
`store/views.py`, `store/tenancy.py`, `store/authentication.py`,
`backend/settings.py`) en modo lectura, no de suposiciones.

El equipo Backend decide si acepta, modifica o rechaza cada punto. Si un
requerimiento se rechaza, Mobile ajusta su diseño, no el backend.

Prioridad: **BR-001** y **BR-002** bloquean toda integración real. Sin ellos la
app no puede autenticarse ni ver un solo producto.

---

## BR-001 — Contrato de autenticación nativo para Mobile

**Estado:** PROPUESTA · **Prioridad:** CRÍTICA · **Bloquea:** auth, pedidos, perfil

**Motivo**

`store/authentication.py::CookieJWTAuthentication` lee el JWT desde la cookie
HttpOnly `blackdog_access` y ejecuta `enforce_csrf(request)` en toda petición
autenticada. `store/auth_views.py::LoginView` escribe los tokens con
`_set_auth_cookies()` y **no** los devuelve en el body — algo deliberado y
correcto para un navegador.

Un cliente React Native no puede consumir ese contrato:

- No tiene acceso programático fiable al frasco de cookies del sistema.
- `CSRF_COOKIE_HTTPONLY = False` permite que **JavaScript de una página** lea
  `csrftoken`; una app nativa no tiene esa página.
- La protección CSRF existe contra un vector — envío automático de cookies por
  el navegador entre orígenes — que en una app nativa no existe.

**Lo que Mobile NO pide**

- No pedimos que `/api/auth/login/` devuelva los JWT en el body. Eso debilitaría
  el contrato web existente.
- No pedimos mover tokens web a `localStorage`.
- No pedimos desactivar CSRF en ninguna ruta existente.

**Propuesta: un endpoint paralelo, separado del web**

| | |
|---|---|
| Endpoint | `POST /api/auth/mobile/login/` |
| Permisos | `AllowAny` |
| Throttle | reutilizar `LoginThrottle` (5/min) |

Request:

```json
{ "email": "cliente@example.com", "password": "..." }
```

Response `200`:

```json
{
  "access": "<jwt>",
  "refresh": "<jwt>",
  "expires_in": 1800,
  "user": { "id": 1, "username": "...", "email": "...", "first_name": "...", "role": "customer" }
}
```

Endpoints hermanos: `POST /api/auth/mobile/refresh/` (refresh en el body,
respeta `ROTATE_REFRESH_TOKENS`) y `POST /api/auth/mobile/logout/` (blacklist).

**Autenticación de las peticiones**

Una clase DRF adicional que lea `Authorization: Bearer <token>` **sin CSRF**,
añadida a `DEFAULT_AUTHENTICATION_CLASSES` **junto a** `CookieJWTAuthentication`,
no en su lugar. Las dos conviven: web sigue por cookie, Mobile por header.

**Seguridad**

- Es imprescindible que la clase Bearer **no** se aplique a las vistas de
  administración por accidente: si se añade globalmente, revisar que
  `store/admin_views.py` y `store/access_views.py` sigan exigiendo lo mismo.
- `SIMPLE_JWT.ACCESS_TOKEN_LIFETIME` de 30 min es corto para móvil; Mobile
  almacenará el refresh en Keychain/Keystore (`expo-secure-store`) y renovará.
- Mobile **nunca** guardará la contraseña, ni la registrará en logs.

**Tests backend sugeridos**

- Login móvil devuelve tokens en el body y **no** setea cookies.
- Un Bearer válido autentica sin cabecera CSRF.
- Un Bearer inválido/expirado devuelve 401.
- El login **web** sigue devolviendo cookies y **sigue sin** exponer tokens en el body.
- Refresh rotado invalida el refresh anterior (blacklist).

---

## BR-002 — Selector de tenant para clientes sin dominio propio

**Estado:** PROPUESTA · **Prioridad:** CRÍTICA · **Bloquea:** catálogo

**Motivo**

`store/tenancy.py::resolve_storefront_company` resuelve la empresa pública así:

1. `resolve_company_from_host(request.get_host())` — subdominio → `Company.slug`.
2. `settings.DEFAULT_STOREFRONT_COMPANY_SLUG`.
3. Solo en `DEBUG`, si existe exactamente **una** empresa activa.

`resolve_company_from_host` **descarta explícitamente** los subdominios
`www`, `api`, `admin` y `app`. Una app móvil que llame a `api.blackdogstore.pe`
cae en ese descarte, ninguna regla posterior aplica en producción, y
`storefront_products()` devuelve `Product.objects.none()`.

Consecuencia concreta: **el catálogo se ve vacío en la app**, y el backend está
comportándose correctamente según su propio diseño. Esto no es un bug del
backend; es que el contrato asume un navegador con dominio de tenant.

**Propuesta**

Aceptar una cabecera `X-Company-Slug` **únicamente en el flujo público de
storefront**, después del host y antes del `DEFAULT_STOREFRONT_COMPANY_SLUG`:

```
X-Company-Slug: blackdog
```

Reglas que Mobile propone respetar sin excepción:

- El valor se **valida** contra `Company.objects.filter(slug=..., is_active=True)`;
  si no resuelve, se devuelve catálogo vacío, nunca el de otra empresa.
- Se usa **solo** para el storefront público (`ProductViewSet`, `CategoryViewSet`).
  **Jamás** para resolver el tenant de una petición autenticada de staff:
  ahí sigue mandando `resolve_company_for_user`, que parte de las `Membership`
  del propio usuario.
- No amplía permisos. Es un selector de *qué catálogo público mostrar*, no una
  credencial.

Esto es consistente con la regla que el propio `tenancy.py` documenta: el input
del cliente se trata como *dato a validar*, nunca como la respuesta a "¿qué
empresa es esta?".

**Alternativa aceptable para Mobile:** exponer un endpoint público
`GET /api/storefront/?slug=<slug>` que devuelva el catálogo de un tenant
explícito. Cualquiera de las dos sirve.

**Tests backend sugeridos**

- `X-Company-Slug` de una empresa activa devuelve su catálogo.
- Un slug inexistente o de empresa inactiva devuelve lista vacía, no 500.
- La cabecera **no** cambia el tenant en ningún endpoint `admin/*` ni `me/*`.
- Un host con subdominio de tenant sigue teniendo prioridad sobre la cabecera.

---

## BR-003 — Exponer `fulfillment_status` en `OrderSerializer`

**Estado:** PROPUESTA · **Prioridad:** ALTA · **Bloquea:** pedidos

**Motivo**

`Order` tiene dos campos independientes: `status` (pago) y `fulfillment_status`
(operativo). `OrderSerializer.fields` incluye `status` pero **no**
`fulfillment_status`, así que `GET /api/orders/` no permite saber si un pedido
pagado está `preparing`, `shipped` o `delivered`.

La app muestra ambos estados por separado (nunca fusionados). Hoy, sin el campo,
renderiza "Sin información" en lugar de adivinar `pending`.

**Propuesta**

Añadir `fulfillment_status` a `OrderSerializer.fields` y a `read_only_fields`.
Es un campo que el cliente ya puede ver en el correo de confirmación; no expone
nada nuevo.

Opcionalmente, `delivery_method` y `receipt_type`, que ya existen en el modelo y
son datos del propio pedido del cliente.

**Tests backend sugeridos**

- `GET /api/orders/` incluye `fulfillment_status` para el dueño del pedido.
- El campo es de solo lectura: un PATCH no lo modifica.
- Un usuario no puede ver pedidos de otro (regresión de `OrderViewSet.get_queryset`).

---

## BR-004 — Paginación en el catálogo público

**Estado:** PROPUESTA · **Prioridad:** MEDIA

**Motivo**

`REST_FRAMEWORK` desactiva la paginación global con el comentario
"frontend expects raw arrays". Con seis productos no pasa nada; con un catálogo
real, la app descarga todo el inventario en cada apertura de la pestaña Tienda —
en datos móviles y sin scroll infinito posible.

**Propuesta**

Paginación **opcional y opt-in**, para no romper el frontend Next.js actual:
`?page=1&page_size=20` devuelve `{count, next, previous, results}`; sin el
parámetro, se sigue devolviendo el array plano de siempre.

Mobile adaptará su mapeador para aceptar ambas formas.

**Tests backend sugeridos**

- Sin `?page`, la respuesta sigue siendo un array (regresión del frontend web).
- Con `?page`, la respuesta trae el envelope y `count` es correcto.
- `page_size` tiene un máximo, para que no sea un vector de carga.

---

## BR-005 — Dominio de reparaciones (servicio técnico)

**Estado:** PROPUESTA · **Prioridad:** ALTA · **Bloquea:** reparaciones

**Motivo**

**No existe ningún modelo de reparación en el backend.** Verificado leyendo
todas las clases de `store/models.py`: `Category`, `Product`, `Coupon`, `Order`,
`OrderItem`, `CartItem`, `Review`, `UserProfile`, `AdminAuditLog`,
`AccountToken`, `StockMovement`, `SalesNote`, `Company`, `Branch`, `Membership`,
`CompanyArea`, `CompanyRole`, `MembershipRoleAssignment`. Ninguna es una
reparación.

Sí existen los permisos: `UserProfile.ROLE_TECHNICIAN` y la capacidad
`service.manage` en `store/capabilities.py`. Es decir, hay autorización para una
funcionalidad que aún no está construida.

Mientras tanto, toda la pestaña Reparaciones de la app corre sobre fixtures y lo
declara en pantalla.

**Propuesta de modelo** (Mobile propone, Backend decide)

`RepairOrder`, propiedad de una `Company` (como `Product` desde la Fase 2B):

| Campo | Tipo | Nota |
|---|---|---|
| `company` | FK Company, PROTECT | tenant, obligatorio |
| `branch` | FK Branch, null | sucursal que recibe |
| `customer` | FK User, null | null para cliente sin cuenta |
| `code` | CharField unique per company | "REP-1042" |
| `device_name` | CharField | 'MacBook Pro 14"' |
| `device_kind` | CharField | "Mac", "iPhone"… no enum: se atiende lo que llegue |
| `serial_or_imei` | CharField blank | **dato sensible**, ver seguridad |
| `reported_issue` | TextField | motivo del ingreso |
| `status` | TextChoices | ver abajo |
| `quoted_total` | Decimal, null | null antes del diagnóstico |
| `technician` | FK User, null | responsable |
| `created_at` / `updated_at` | DateTime | `updated_at` alimenta "hace 25 min" |

`status` (`TextChoices`), la secuencia que la app ya dibuja:

```
received → diagnosis → awaiting_approval → in_repair
        → quality_check → ready_for_pickup → delivered
cancelled  (desde cualquier etapa; no es un paso de la secuencia)
```

`RepairEvent` para el historial: `repair` (FK), `status`, `note`, `created_by`,
`created_at`. La app construye el timeline con estos eventos y **muestra también
las etapas futuras**, porque el cliente quiere saber cuánto falta.

**Endpoints propuestos**

| Method | Endpoint | Permisos |
|---|---|---|
| GET | `/api/repairs/` | `IsAuthenticated`; devuelve solo las del propio usuario |
| GET | `/api/repairs/{id}/` | `IsAuthenticated` + dueño, o staff con `service.manage` |
| GET | `/api/admin/repairs/` | capacidad `service.manage` en la empresa |
| PATCH | `/api/admin/repairs/{id}/status/` | capacidad `service.manage`; crea un `RepairEvent` |

**Seguridad**

- Un cliente solo ve **sus** reparaciones. El `queryset` debe nacer filtrado por
  `customer=request.user`, no filtrarse después — el mismo criterio que
  `tenancy.py` ya aplica al catálogo.
- `serial_or_imei` identifica un equipo de forma única y es útil para un robo:
  **no** debería serializarse completo hacia el cliente. Mobile propone
  devolverlo enmascarado (`****1234`) o no devolverlo.
- El endpoint de cambio de estado debe quedar en `AdminAuditLog`.

**Tests backend sugeridos**

- Un cliente no ve reparaciones de otro cliente.
- Un técnico solo ve las de su empresa (aislamiento entre tenants).
- Un cambio de estado crea exactamente un `RepairEvent`.
- Una transición inválida se rechaza (si se decide validar transiciones).
- `code` es único **por empresa**, no globalmente.

---

## BR-006 — Endpoint público de marca por empresa

**Estado:** PROPUESTA · **Prioridad:** MEDIA

**Motivo**

`Company` existe (`id`, `name`, `legal_name`, `tax_id`, `slug`, `is_active`) pero
no tiene campos de marca, y `CompanySerializer` solo se expone en rutas
`admin/*`. La app ya está construida sobre una abstracción `CompanyBrand`, con
los datos del piloto como fixture; sin backend, cada tenant necesitaría un
build distinto con sus datos incrustados.

**Propuesta**

| | |
|---|---|
| Endpoint | `GET /api/storefront/brand/` |
| Permisos | `AllowAny` |
| Tenant | por host, o por el selector de BR-002 |

Response `200`:

```json
{
  "slug": "blackdog",
  "name": "Black Dog Store",
  "tagline": "Tu Apple, con respaldo especializado.",
  "logo_url": "https://.../logo.png",
  "primary_color": "#D4AF37",
  "secondary_color": "#C0C0C0",
  "support_phone": "+51 936 449 536",
  "support_email": "",
  "website": "https://...",
  "address": "Calle Octavio Muñoz Najar 238, Tienda 104, Arequipa, Perú",
  "enabled_features": ["shop", "repairs", "orders", "support"]
}
```

**Seguridad**

Solo datos **comerciales públicos**. Nunca `tax_id`, `legal_name`, ni ningún
dato de facturación: eso ya está — correctamente — detrás de `admin/*`.

**Tests backend sugeridos**

- Devuelve la empresa correcta según el tenant resuelto.
- **No** incluye `tax_id` ni `legal_name`.
- Una empresa inactiva devuelve 404, no los datos.

---

## Notas de entorno (no requieren cambio de código)

Estas no son propuestas de código, solo cosas que el equipo Backend debe saber
para el desarrollo local:

- **`ALLOWED_HOSTS`**: para probar contra un Django local desde el simulador o
  un dispositivo, el host de la Mac debe estar permitido. En `DEBUG` el default
  ya incluye `localhost`, `127.0.0.1` y `0.0.0.0`; para un dispositivo físico
  hace falta añadir la IP LAN. **Mobile no lo modifica**, lo pide.
- **CORS**: una app nativa no envía `Origin`, así que `CORS_ALLOWED_ORIGINS`
  normalmente no interviene. No pedimos ningún cambio ahí.
