# Backend Requirements — propuestas de Mobile

**Estado del documento:** PROPUESTA
**Autor:** equipo Mobile
**Autoridad final:** equipo Backend

Todo lo que sigue es una **propuesta**. El equipo Mobile no ha modificado —
ni modificará— nada en `PapiCuche/BlackDogStore-web`.

## Base de verificación (corregida en M0.1)

M0 documentó estos requerimientos leyendo un **working tree local** del repo
Web. Ese árbol estaba en `feat/tenant-aware-commerce` con cambios sin commitear,
**no en `master`**. Parte del razonamiento original describía por tanto código
en progreso.

M0.1 re-verificó todo contra `origin/master`; M0.2 volvió a auditar el catálogo
contra el mismo SHA — `2624d478af5cd3cc90c4b65d9aa4c81bb2439cfc`, sin cambios.
Cada requerimiento indica sobre qué se apoya:

- `VERIFIED_STABLE_MASTER` — commiteado en `master`. Es contrato.
- `OBSERVED_IN_PROGRESS` — visto en una rama/árbol del equipo Web. **No** es contrato.

Ver `API_CONTRACT.md` para el detalle de qué es cada cosa.

Prioridad: **BR-001** y **BR-002** bloqueaban toda integración real. Ambos están
ahora **parcialmente resueltos** — catálogo público y núcleo de sesión nativa —
y lo que queda de cada uno bloquea la superficie privada de negocio.

| ID | Requerimiento | Prioridad |
|---|---|---|
| BR-001 | Autenticación nativa **acotada a `/api/v1/`** | **PARCIAL** — BR-001A núcleo de sesión IMPLEMENTADO; BR-001B ciclo de cuenta PENDIENTE |
| BR-002 | Selección de tenant validada server-side | **RESUELTO** — público, cliente e interno |
| BR-003 | Exponer `fulfillment_status` | **IMPLEMENTADO para v1** |
| BR-004 | Paginación opt-in | MEDIA |
| BR-005 | Dominio de reparaciones | **RESUELTO** — cadena completa M8 a M12B: recepción, diagnóstico, cotización, aprobación, ejecución, repuestos, calidad, entrega y cobro |
| BR-006 | Endpoint público de marca | **IMPLEMENTADO** |
| BR-007 | Superficie versionada `/api/v1/` | **PARCIAL** — público, auth, cliente, checkout, interno de ventas, inventario y servicio técnico están; faltan recuentos (BR-009), reportes de inventario y clientes internos |
| BR-008 | Seguimiento seguro para el cliente (deep link) | ALTA |
| BR-009 | Superficie v1 para **recuentos físicos de inventario** | **ALTA** — dominio y Web existen; sin adapter v1 Mobile no puede integrarlo |

---

## BR-007 — Superficie versionada `/api/v1/` para Mobile

**Estado:** **PARCIAL** · **Prioridad:** ALTA

| Porción | Estado |
|---|---|
| `/api/v1/` existe como prefijo versionado | **IMPLEMENTADO** |
| Slice de catálogo público | **IMPLEMENTADO** — integrado por Mobile en M2 |
| `/api/v1/auth/*` (núcleo de sesión) | **IMPLEMENTADO** (BR-001A) |
| `/api/v1/auth/*` (ciclo de cuenta) | **PENDIENTE** (BR-001B) |
| Superficie privada v1 de cliente (pedidos, reparaciones, checkout) | **IMPLEMENTADO** |
| Superficie interna v1 (ventas, POS, inventario, servicio) | **IMPLEMENTADO** |
| Superficie interna v1 — recuentos físicos | **PENDIENTE** (BR-009) |
| Superficie interna v1 — reportes de inventario, clientes | **PENDIENTE** |

Existir el prefijo no es existir el contrato. **Esa lección viene de M0.1**,
cuando el backend tenía tests que fijaban un 404 en `/api/v1/auth/*` y en toda
superficie privada, y esta sección lo decía en presente mucho después de que
dejara de ser cierto. Hoy ambas existen; lo que queda pendiente está en las
filas de arriba, y lo que las hace verdaderas es que cada una se verificó
contra `origin/master` con un smoke real, no leyendo un plan.


**Motivo**

Web y Mobile son dos clientes con necesidades distintas sobre el mismo dominio.
El contrato actual `/api/` fue diseñado para el frontend Next.js: cookies
HttpOnly, CSRF, arrays sin paginar, tenant implícito en el host. Modificarlo
para que sirva también a Mobile significa cambiar un contrato del que ya depende
producción.

**Propuesta**

Una superficie **aditiva**:

```
/api/      → contrato legacy actual. Web. NO SE TOCA.
/api/v1/   → contrato estable para Mobile y futuros clientes.
```

Reglas que Mobile se compromete a respetar:

- **No renombrar, mover ni modificar nada bajo `/api/`.** Ni las rutas, ni los
  serializers, ni los permisos, ni la autenticación.
- `/api/v1/` puede reutilizar los mismos modelos y servicios; lo que cambia es
  la capa de exposición.
- Mobile consume **solo** `/api/v1/` una vez exista. El uso actual del catálogo
  legacy es provisional y así está marcado en `INTEGRATION_STATUS.md`.

**No implementar en Django todavía.** Es una propuesta de forma, para que
BR-001 y BR-002 tengan dónde vivir sin tocar lo existente.

**Tests backend sugeridos**

- Toda la suite actual de `/api/` sigue verde sin cambios (regresión del web).
- `/api/v1/` responde de forma independiente de `/api/`.

---

## BR-001 — Contrato de autenticación nativo, acotado a `/api/v1/`

**Estado:** **PARCIAL** · **Prioridad:** CRÍTICA

| Porción | Estado |
|---|---|
| **BR-001A** — núcleo de sesión (`login`, `refresh`, `logout`, `me`) | **IMPLEMENTADO** — `origin/master` `7c55ebc`, integrado por Mobile en M3 |
| **BR-001B** — ciclo de vida de cuenta | **PENDIENTE** |

**Lo resuelto.** Contrato nativo separado del web: tokens en el cuerpo, `Bearer`
en lugar de cookie, sin CSRF. `V1BearerAuthentication` **no es global** y solo la
declaran las vistas privadas v1, con tests de que un Bearer no abre nada legacy.
Login por email, con la ambigüedad de duplicados resuelta de forma fail-safe
porque `email` **no** es unique en esa base de datos. Refresh con rotación y
blacklist. Logout best-effort sin exigir access vivo.

**Lo pendiente (BR-001B).** Registro, verificación de correo, reenvío, reset y
cambio de contraseña nativos. Siguen siendo solo web, y la app **no los muestra**
en modo backend en vez de ofrecer un formulario que no puede funcionar.

**Este requerimiento NO se cierra** mientras BR-001B falte.

El motivo original, que documenta por qué hacía falta, se conserva abajo.

**Base:** `VERIFIED_STABLE_MASTER`

**Motivo**

En `master`, `store/authentication.py::CookieJWTAuthentication` lee el JWT desde
la cookie HttpOnly `blackdog_access` y ejecuta `enforce_csrf(request)` en toda
petición autenticada. `store/auth_views.py::LoginView` escribe los tokens con
`_set_auth_cookies()` y **no** los devuelve en el body — deliberado y correcto
para un navegador.

Un cliente React Native no puede consumir ese contrato:

- No tiene acceso programático fiable al frasco de cookies del sistema.
- `CSRF_COOKIE_HTTPONLY = False` permite que **JavaScript de una página** lea
  `csrftoken`; una app nativa no tiene esa página.
- El vector que CSRF mitiga —el navegador adjuntando cookies solo entre
  orígenes— no existe en una app nativa.

**Lo que Mobile NO pide**

- ❌ Que `/api/auth/login/` devuelva los JWT en el body.
- ❌ Mover tokens web a `localStorage`.
- ❌ Desactivar CSRF en ninguna ruta existente.
- ❌ **Añadir autenticación Bearer a `DEFAULT_AUTHENTICATION_CLASSES`.**

### Corrección de M0.1: nada de Bearer global

La versión anterior de BR-001 proponía añadir una clase Bearer a
`REST_FRAMEWORK.DEFAULT_AUTHENTICATION_CLASSES`, "junto a"
`CookieJWTAuthentication`. **Mobile retira esa propuesta.**

Motivo: `DEFAULT_AUTHENTICATION_CLASSES` aplica a **todas** las vistas del
proyecto, incluidas las ~30 rutas `/api/admin/*` (usuarios, roles, inventario,
notas de venta, empresas) y las `/api/me/*`. Añadir ahí un mecanismo Bearer
significaría que cada una de esas vistas acepta de golde una vía de
autenticación nueva, **sin CSRF**, que hoy no acepta. Eso es una ampliación de
superficie de ataque que Mobile no necesita y que nadie pidió: un fallo en la
validación del token pasaría a ser explotable contra la administración, no solo
contra el catálogo.

### Propuesta acotada

**Endpoints nuevos, bajo `/api/v1/` (BR-007):**

| Method | Endpoint | Permisos | Throttle |
|---|---|---|---|
| POST | `/api/v1/auth/login/` | `AllowAny` | reutilizar `LoginThrottle` (5/min) |
| POST | `/api/v1/auth/refresh/` | `AllowAny` | — |
| POST | `/api/v1/auth/logout/` | `IsAuthenticated` | — |

Request de login:

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

**Autenticación de las peticiones**

Una clase DRF que lea `Authorization: Bearer <token>` sin CSRF, declarada
**por vista**, y **solo** en las vistas de `/api/v1/`:

```python
class MobileTokenAuthentication(BaseAuthentication):
    ...

# En cada vista de /api/v1/, nunca en settings.DEFAULT_AUTHENTICATION_CLASSES
class V1OrderViewSet(viewsets.ReadOnlyModelViewSet):
    authentication_classes = [MobileTokenAuthentication]
    permission_classes = [permissions.IsAuthenticated]
```

**Se mantienen intactos:**

- `/api/auth/login/`, `/api/auth/refresh/`, `/api/auth/logout/` y el resto de `/api/auth/*`
- `CookieJWTAuthentication` como única clase por defecto
- CSRF en todo el contrato existente
- Todo `/api/admin/*`
- El frontend Next.js

**Por qué esto minimiza el riesgo de regresión**

El alcance del cambio es exactamente el conjunto de vistas nuevas. Ninguna vista
existente cambia de clase de autenticación, de permisos ni de comportamiento, y
por tanto ninguna suite existente puede romperse por este requerimiento. Si la
clase Bearer resultara tener un fallo, su radio de impacto sería `/api/v1/` —
que hoy no existe y no tiene datos administrativos detrás.

**Seguridad**

- `SIMPLE_JWT.ACCESS_TOKEN_LIFETIME` de 30 min es corto para móvil; Mobile
  almacenará el refresh en Keychain/Keystore (`expo-secure-store`) y renovará.
- Rotación + blacklist ya están activadas (`ROTATE_REFRESH_TOKENS`,
  `BLACKLIST_AFTER_ROTATION`); Mobile las respeta.
- Mobile **nunca** guardará la contraseña ni la registrará en logs.

### Lo que Mobile necesita que Backend confirme (M1)

M1 construyó el lifecycle completo contra estos supuestos. Cada uno necesita una
respuesta antes de escribir el transporte:

| # | Pregunta | Supuesto actual de Mobile |
|---|---|---|
| 1 | **Login request** — ¿`email` o `username`? | Verificado: `master` usa `username` (`TokenObtainPairSerializer` sobre `auth.User`). El formulario Mobile pide **email**. Mobile prefiere que `/api/v1/` acepte email. |
| 2 | **Login response** — ¿incluye `user`? ¿incluye `role`? | `master` **no** devuelve `role` en el login; solo `/auth/me/` lo añade. Mobile prefiere recibirlo en el login para evitar un segundo round trip. |
| 3 | **Formato de expiración** | Mobile asume `expires_in` en **segundos**. Se resuelve a instante absoluto al recibirlo. |
| 4 | **Refresh rotation** — ¿la respuesta trae siempre un refresh nuevo? | Mobile **asume que sí** (`ROTATE_REFRESH_TOKENS`) y persiste el nuevo antes de instalar el access. |
| 5 | **Logout / revocación** — ¿el refresh va en el body? ¿respuesta? | Mobile asume `POST` con el refresh en el body y trata el fallo como best-effort. |
| 6 | **Tenant payload** — ¿el contrato entrega empresa(s) validadas? | Mobile tiene `activeCompany` / `availableCompanies` preparados y `null` mientras tanto. Ver BR-002/BR-006. |
| 7 | **Error shapes** — ¿`{detail}` o `{campo: [...]}` ? | Mobile ya distingue ambos (`parseFieldErrors`). Necesita saber cuál usa cada caso de auth. |
| 8 | **Rate limits** | `master` aplica `LoginThrottle` 5/min por IP. ¿Se reutiliza en `/api/v1/`? Mobile no reintenta un login automáticamente. |
| 9 | **Verificación de correo** | Verificado: `AccountToken.make()` emite `secrets.token_urlsafe(48)`. ¿El flujo móvil será deep link? Mobile corrigió su validador, que exigía 6 dígitos. |

**Tests backend sugeridos**

- Login v1 devuelve tokens en el body y **no** setea cookies.
- Un Bearer válido autentica en `/api/v1/` sin cabecera CSRF.
- Un Bearer válido **NO** autentica en `/api/admin/*` ni en `/api/auth/me/`
  (la prueba que demuestra el acotamiento).
- Un Bearer inválido o expirado devuelve 401.
- El login **web** sigue devolviendo cookies y sin tokens en el body.
- Refresh rotado invalida el refresh anterior.
- Un refresh **ya rotado** devuelve 401 y no 500 (Mobile lo trata como terminal).
- El login v1 respeta el throttle y devuelve 429 con una forma de error estable.
- Logout revoca el refresh y un segundo logout con el mismo token no explota.

---

## BR-002 — Selección de tenant validada en el servidor

**Estado:** **PARCIALMENTE RESUELTO** · **Prioridad:** CRÍTICA

| Porción | Estado |
|---|---|
| **Catálogo público** | **IMPLEMENTADO** — `origin/master` `b301637b`, integrado por Mobile en M2 |
| **Autorización de tenant sobre datos privados** | **PENDIENTE** — depende de BR-001 |

Lo resuelto: `/api/v1/storefront/<company_slug>/…`. El servidor resuelve una
empresa **activa** desde la ruta y construye todo el queryset desde ella. El
slug **selecciona** un escaparate público y no autoriza nada; desconocida,
inactiva y malformada devuelven el mismo 404, así que el endpoint no puede
recorrerse para enumerar empresas. Ni query param, ni cabecera, ni Host pueden
cambiar el tenant de la ruta, y hay un test backend por cada vector.

Lo que sigue pendiente: pedidos, reparaciones y cualquier dato privado. Ahí el
selector del cliente **no puede** ser la autoridad — la empresa tiene que
derivarse de la membresía del usuario autenticado, y eso no existe hasta BR-001.
**Este requerimiento NO se cierra** mientras esa mitad falte.

El motivo original, que documenta por qué hacía falta, se conserva abajo.

**Motivo — corregido en M0.1**

Este requerimiento sigue siendo necesario, pero por un motivo **distinto** al
documentado en M0, porque M0 describía código en progreso.

**En `master` (`VERIFIED_STABLE_MASTER`, reauditado en M0.2 @ `2624d478`):** el
catálogo público **no está tenantizado en absoluto**.

```python
# ProductViewSet.get_queryset
Product.objects.select_related('category').prefetch_related('reviews').filter(is_active=True)

# CategoryViewSet
Category.objects.all()
```

Ni `Product` ni `Category` tienen campo `company`. `resolve_company_from_host`
existe pero el propio backend lo documenta como *"DESIGNED, not yet wired up"* y
*"no public view calls it yet"*. No hay tests de aislamiento para el catálogo
público — los de `CrossTenantError` cubren la superficie admin y las membresías.

Un cliente móvil recibiría **todos los productos de la instalación**, mezclando
empresas. Es un **riesgo cross-tenant**, aunque el endpoint sea público. Para el
piloto de una sola tienda funciona; para un SaaS no.

**En el árbol observado (`OBSERVED_IN_PROGRESS`):** el equipo Web está añadiendo
`Product.company` y `resolve_storefront_company`, que resuelve la empresa por
**Host** y descarta los subdominios `www`, `api`, `admin` y `app`. Si eso llega
tal cual, un cliente móvil que llame a `api.<dominio>` pasaría a recibir
**catálogo vacío**.

Los dos extremos son inservibles para Mobile. En ambos casos hace falta lo
mismo: **una forma explícita de decir de qué empresa es este cliente, validada
en el servidor.**

### La regla, y no es negociable

> **Un selector enviado por Mobile NO es autoridad.**

El propio `store/tenancy.py` ya lo documenta para el flujo de staff: el input
del cliente es *dato a validar*, nunca la respuesta a "¿qué empresa es esta?".
Mobile se adhiere a esa regla sin excepción.

El mecanismo concreto es decisión del equipo Backend. Cualquiera sirve:

- una cabecera (`X-Company-Slug`)
- un segmento de ruta (`/api/v1/storefront/<slug>/products/`)
- un query param (`?company=<slug>`)
- un endpoint dedicado

Mobile **no** tiene preferencia y **no** implementará ninguno hasta que Backend
elija. En M0.1 se **retiró** del cliente HTTP la cabecera `X-Company-Slug` que
M0 enviaba en todas las peticiones, precisamente porque anticipaba un contrato
inexistente.

### Mientras tanto: qué hizo Mobile (M0.2)

Mobile no puede arreglar esto desde su lado, así que se protegió de ello:

- El catálogo legacy está **bloqueado en staging y production**, sin excepción.
- En desarrollo requiere un opt-in explícito
  (`EXPO_PUBLIC_ENABLE_LEGACY_CATALOG=true`) que advierte de que el contrato no
  es tenant-safe.
- Hay una segunda defensa antes de la llamada de red, para que una build
  bloqueada no pueda emitir la petición ni saltándose el composition root.

Esto **no sustituye** a BR-002. Solo evita que Mobile publique una app que
filtre catálogo entre empresas mientras el requerimiento se resuelve.

### Cuándo se puede declarar resuelto

**No antes del merge a `master` y de una reauditoría.** Cuando
`feat/tenant-aware-commerce` (o su sucesora) llegue a `master`, Mobile deberá
volver a auditar, como mínimo:

- el **modelo** (`Product.company`, `Category.company` o estrategia equivalente);
- las **migraciones** y su backfill;
- la **resolución del tenant** para el flujo público;
- el **endpoint** y su comportamiento cuando el tenant no resuelve;
- el **aislamiento** real entre empresas;
- los **tests** de aislamiento del catálogo público;
- los **serializers** y las **URLs**.

Hasta entonces BR-002 permanece **CRÍTICA** y abierta.

### Superficie PÚBLICA (catálogo, marca)

Seleccionar una `Company` **activa** es aceptable, con estas garantías:

- El valor se **valida** contra `Company.objects.filter(slug=..., is_active=True)`.
- Si no resuelve → catálogo **vacío**, nunca el de otra empresa. El fallo seguro
  es no mostrar nada.
- No amplía permisos. Es "qué escaparate mostrar", no una credencial.

### Superficie PRIVADA (pedidos, reparaciones, cotizaciones, garantías, perfil)

Aquí el selector del cliente **nunca** basta. El tenant debe validarse siempre
contra **identidad, propiedad y permisos** en el servidor:

- El `queryset` nace filtrado por el usuario autenticado
  (`filter(user=request.user)`), no se filtra después.
- Si el usuario nombra una empresa, se valida contra sus propias `Membership`
  activas — exactamente lo que `resolve_company_for_user` ya hace.
- Un recurso que no pertenece al solicitante devuelve **404**, no 403: distinguir
  "no existe" de "no es tuyo" filtra la existencia de datos ajenos.
- Un cliente sin membresía en la empresa solicitada obtiene un queryset **vacío**,
  nunca el sin filtrar.

Dicho de otro modo: el selector puede elegir **entre** lo que el usuario ya
puede ver. Nunca puede ampliar lo que puede ver.

**Tests backend sugeridos**

- Un slug de empresa activa devuelve su catálogo público.
- Un slug inexistente o de empresa inactiva devuelve lista vacía, no 500.
- El selector **no** cambia el tenant en ningún endpoint `admin/*` ni `me/*`.
- Un usuario que envía el slug de otra empresa **no** ve pedidos ni reparaciones
  de esa empresa.
- Un recurso privado ajeno devuelve 404.
- Un host con subdominio de tenant sigue teniendo prioridad sobre el selector.

---

## BR-003 — Exponer `fulfillment_status` en `OrderSerializer`

**Estado:** **IMPLEMENTADO para v1** · **Prioridad:** ALTA

Resuelto en M4, pero **no como se pidió originalmente**: en lugar de modificar
`OrderSerializer` —que pertenece al frontend web y además lista
`stripe_session_id`— el campo se expone en el serializer propio de la superficie
de cliente, `/api/v1/customer/<empresa>/orders/`, junto a su etiqueta legible.

El serializer legacy **sigue sin exponerlo**. Si el frontend web lo necesita, es
una decisión de ese equipo.

El motivo original se conserva abajo.

**Base:** `VERIFIED_STABLE_MASTER`

**Motivo**

`Order` tiene dos campos independientes: `status` (pago) y `fulfillment_status`
(operativo). Ambos existen en el modelo **en `master`**. Pero
`OrderSerializer.fields` incluye `status` y **no** `fulfillment_status`, así que
`GET /api/orders/` no permite saber si un pedido pagado está `preparing`,
`shipped` o `delivered`.

La app muestra ambos estados por separado y nunca los fusiona. Hoy, sin el
campo, renderiza "Sin información" en lugar de adivinar `pending`.

**Propuesta**

Añadir `fulfillment_status` a `OrderSerializer.fields` y a `read_only_fields`.
El cliente ya lo ve en el correo de confirmación; no expone nada nuevo.

Opcionalmente `delivery_method` y `receipt_type`, que ya existen en el modelo y
son datos del propio pedido del cliente.

**Tests backend sugeridos**

- `GET /api/orders/` incluye `fulfillment_status` para el dueño del pedido.
- El campo es de solo lectura: un PATCH no lo modifica.
- Un usuario no puede ver pedidos de otro.

---

## BR-004 — Paginación opt-in en el catálogo público

**Estado:** PROPUESTA · **Prioridad:** MEDIA · **Base:** `VERIFIED_STABLE_MASTER`

**Motivo**

`REST_FRAMEWORK` desactiva la paginación global con el comentario "frontend
expects raw arrays". Con seis productos no pasa nada; con un catálogo real, la
app descarga todo el inventario en cada apertura de la pestaña Tienda — en datos
móviles y sin scroll infinito posible.

**Propuesta**

Paginación **opcional y opt-in**, para no romper el frontend Next.js:
`?page=1&page_size=20` devuelve `{count, next, previous, results}`; sin el
parámetro, se sigue devolviendo el array plano.

Si BR-007 avanza, `/api/v1/` puede pagina por defecto y `/api/` quedarse como
está — que es más limpio que un flag.

**Tests backend sugeridos**

- Sin `?page`, la respuesta sigue siendo un array (regresión del frontend web).
- Con `?page`, la respuesta trae el envelope y `count` es correcto.
- `page_size` tiene un máximo, para que no sea un vector de carga.

---

## BR-005 — Dominio de reparaciones (servicio técnico)

> **ESTADO: RESUELTO.** La cadena completa está entregada e integrada: 34 rutas
> en `/api/v1/internal/<slug>/service/`, de las cuales Mobile consume 32 — las
> dos restantes son lecturas que el detalle canónico ya incluye, no brechas.
> Ver `docs/INTEGRATION_STATUS.md`.
>
> **Lo que sigue abajo es el registro histórico de M8**, y merece conservarse
> porque la lección lo vale. Se mantuvo en «PARCIAL» varias fases después de
> dejar de serlo, mientras la tabla resumen de este mismo documento ya decía
> RESUELTO — un documento contradiciéndose a sí mismo sin que nadie mintiera.
>
> ---
>
> **Estado EN M8** (`origin/master` `43fffb0`): existían `Device`,
> `RepairOrder`, el ciclo de vida con códigos estables y etiquetas por empresa,
> el historial inmutable y la asignación de técnico.
>
> **El backend NO aceptó la propuesta tal cual, y con razón**: esta sección
> proponía siete etapas y M8 implementó cuatro. `in_repair`, `quality_check`,
> `ready_for_pickup` y `delivered` necesitaban módulos —repuestos, una lista de
> comprobación, un flujo de entrega— que M8 no construyó, y un estado sobre el
> que ningún código puede actuar es un estado que miente.
>
> Esos módulos llegaron después: M10 la ejecución y los repuestos, M11 el
> control de calidad, M12 la entrega y M12B el cobro. La decisión de M8 fue
> correcta *y* temporal, que es lo que hace que valga la pena recordarla.
>
> **M9 cerró la segunda mitad** (`origin/master` `36b8a8c`): diagnóstico,
> cotización versionada con líneas, publicación y la aprobación o rechazo del
> cliente. `approved` y `rejected` son ahora estados reales, y
> `waiting_approval` salió de `available_transitions` — publicar una cotización
> es lo que mueve una orden ahí, y responderla lo que la mueve de ahí.
>
> El backend tampoco aceptó esta parte tal cual, y otra vez con razón:
> `quoted_total` como campo de `RepairOrder` no sobrevivió. Una cotización tiene
> revisiones, líneas, caducidad y una decisión con su fecha; aplanarla a un
> decimal en la orden habría hecho imposible contar qué se ofreció antes.
>
> **M10 entregó la ejecución** (`origin/master` `82695d3`): `RepairExecution`,
> `PartUsage`, los tres estados `in_repair` / `waiting_parts` / `repaired`, el
> consumo transaccional contra `inventory_services` y el reverso compensatorio.
>
> El backend volvió a no aceptar la propuesta tal cual, y otra vez con razón.
> Esta sección proponía `quoted_total` como campo de `RepairOrder` y un
> `serial_or_imei` enmascarado; ninguno sobrevivió como se propuso. Y la
> propuesta no contemplaba lo que resultó ser el riesgo real de la fase: el
> ORDEN DE BLOQUEO entre `RepairOrder` y `BranchStock`. Ambos módulos ya tenían
> disciplina propia y coincidían — documento primero, `BranchStock` al final,
> `Product` nunca — así que M10 concatenó en vez de inventar.
>
> **M11 entregó el control de calidad** (`origin/master` `e26e77d`):
> `QualityCheck`, `QualityCheckItem`, plantillas por empresa y tipo de
> dispositivo, `QUALITY_CONTROL`, `READY_FOR_PICKUP` y el retrabajo con una
> segunda `RepairExecution`. Precedido por **H1B**, que pagó la asimetría del
> preset técnico histórico.
>
> Esta sección proponía checklists «configurables» sin decir cuánto. El backend
> eligió lo mínimo que se adapta —una lista con nombre, por empresa y
> opcionalmente por tipo de dispositivo— y se negó a construir un motor de
> formularios. También añadió algo que la propuesta no contemplaba y resultó
> ser el punto entero: el **snapshot**. Sin él, editar la plantilla reescribía
> lo que se probó el mes pasado.
>
> Sigue **PENDIENTE**: entrega, garantía, pagos de servicio, evidencias
> fotográficas y la devolución de piezas posterior a la finalización. **No hay
> reserva de stock al cotizar y es deliberado.**


**Estado:** PROPUESTA · **Prioridad:** ALTA · **Bloquea:** reparaciones
**Base:** `VERIFIED_STABLE_MASTER` (verificado también en el árbol en progreso)

**Motivo**

**No existe ningún modelo de reparación en el backend.** Verificado leyendo
todas las clases de `store/models.py` en `master`: `Category`, `Product`,
`Coupon`, `Order`, `OrderItem`, `CartItem`, `Review`, `UserProfile`,
`AdminAuditLog`, `AccountToken`, `StockMovement`, `SalesNote`, `Company`,
`Branch`, `Membership`, `CompanyArea`, `CompanyRole`,
`MembershipRoleAssignment`. Ninguna es una reparación.

Sí existen los permisos: `UserProfile.ROLE_TECHNICIAN` y la capacidad
`service.manage` en `store/capabilities.py`. Hay autorización para una
funcionalidad que no está construida.

**Propuesta de modelo** (Mobile propone, Backend decide)

`RepairOrder`, propiedad de una `Company`:

| Campo | Tipo | Nota |
|---|---|---|
| `company` | FK Company, PROTECT | tenant, obligatorio |
| `branch` | FK Branch, null | sucursal que recibe |
| `customer` | FK User, null | null para cliente sin cuenta |
| `code` | CharField, único **por empresa** | "REP-1042" |
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

**Endpoints propuestos** (bajo `/api/v1/`, por BR-007)

| Method | Endpoint | Permisos |
|---|---|---|
| GET | `/api/v1/repairs/` | `IsAuthenticated`; solo las del propio usuario |
| GET | `/api/v1/repairs/{id}/` | dueño, o staff con `service.manage` |
| GET | `/api/v1/admin/repairs/` | capacidad `service.manage` en la empresa |
| PATCH | `/api/v1/admin/repairs/{id}/status/` | `service.manage`; crea un `RepairEvent` |

**Seguridad**

- Un cliente solo ve **sus** reparaciones. El `queryset` debe nacer filtrado por
  `customer=request.user`, no filtrarse después — el mismo criterio que
  `tenancy.py` ya aplica.
- Una reparación ajena devuelve **404**, no 403.
- `serial_or_imei` identifica un equipo de forma única y es útil para un robo:
  **no** debería serializarse completo hacia el cliente. Mobile propone
  devolverlo enmascarado (`****1234`) o no devolverlo.
- El cambio de estado debe quedar en `AdminAuditLog`.

**Tests backend sugeridos**

- Un cliente no ve reparaciones de otro cliente.
- Un técnico solo ve las de su empresa (aislamiento entre tenants).
- Un cambio de estado crea exactamente un `RepairEvent`.
- Una transición inválida se rechaza (si se decide validar transiciones).
- `code` es único **por empresa**, no globalmente.

---

## BR-006 — Endpoint público de marca por empresa

**Estado:** **IMPLEMENTADO** · **Prioridad:** MEDIA

Resuelto en M5, y **no exactamente como se propuso**: en vez de un endpoint nuevo
`GET /api/v1/storefront/brand/`, el backend ya tenía
`GET /api/storefront/config/` resuelto por Host para la web. M5 extrajo su
constructor de payload y añadió la variante por slug —
`GET /api/v1/storefront/<company_slug>/config/` — que devuelve **exactamente lo
mismo**, con un test que compara ambas respuestas byte a byte.

Diferencia con la propuesta original: el payload **sí** incluye `legal_name` y
`tax_id`. Esta propuesta pedía excluirlos por considerarlos internos; en la
práctica ambos aparecen en cada boleta y factura que emite el negocio, y el
equipo Web ya los publicaba. Se respetó su decisión en vez de crear un segundo
payload que dijera otra cosa.

Integrado por Mobile: marca, colores, contacto, políticas y el enlace de WhatsApp
que hasta M5 dejaba el botón del detalle de producto deliberadamente inerte.

El motivo original se conserva abajo.


**Motivo**

`Company` existe en `master` (`id`, `name`, `legal_name`, `tax_id`, `slug`,
`is_active`) pero no tiene campos de marca, y `CompanySerializer` solo se expone
en rutas `admin/*`.

Mobile ya está construida sobre una abstracción `CompanyBrand`. Desde M0.1, un
build que **no** es el piloto **no recibe branding en absoluto** — no hereda el
de Black Dog Store, porque eso sería mostrar la identidad de un cliente dentro
de la app de otro. Sin este endpoint, cada tenant necesitaría un build distinto
con sus datos incrustados.

**Propuesta**

| | |
|---|---|
| Endpoint | `GET /api/v1/storefront/brand/` |
| Permisos | `AllowAny` |
| Tenant | por host, o por el selector de BR-002 |

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

Solo datos **comerciales públicos**. Nunca `tax_id` ni `legal_name`: eso ya está
—correctamente— detrás de `admin/*`.

**Tests backend sugeridos**

- Devuelve la empresa correcta según el tenant resuelto.
- **No** incluye `tax_id` ni `legal_name`.
- Una empresa inactiva devuelve 404, no los datos.

---

## BR-008 — Contrato de seguimiento seguro para el cliente (deep link)

**Estado:** PROPUESTA · **Prioridad:** ALTA · **Bloquea:** seguimiento por enlace
**Base:** `VERIFIED_STABLE_MASTER` — verificado en `2624d478af5cd3cc90c4b65d9aa4c81bb2439cfc`
**Depende de:** BR-005 — `RepairOrder` **ya existe** desde M8; lo que falta es el token opaco, su caducidad, su revocación y su rate limit.

**Motivo**

Un taller necesita mandarle al cliente un enlace: *"revisa tu reparación aquí"*.
El cliente suele no tener cuenta, así que el enlace no puede exigir sesión — y
justo por eso es el punto más fácil de romper de todo el producto.

Hoy **no existe nada de esto** en `master`. No hay endpoint de seguimiento, no
hay token de seguimiento, no hay `RepairOrder`. Verificado leyendo
`store/urls.py`, `store/views.py` y `store/models.py`.

Mobile **reconoce** `blackdogstore://track/<token>` y termina en
`feature-unavailable`: la ruta existe en el parser para poder rechazarla
explícitamente, no para honrarla. El token **no se guarda, no se registra y no
se envía a ninguna parte**. Ver `docs/LINKING_STRATEGY.md`.

**Por qué no lo resolvemos en Mobile**

Un identificador secuencial (`/track/1042`) es enumerable: cualquiera recorre
1041, 1043 y lee las reparaciones de otros clientes. La única defensa real es un
credential opaco emitido y validado por el servidor. Mobile no puede emitirlo
sin volverse la autoridad, y eso rompería DEC-MOBILE-004.

**Propuesta**

| | |
|---|---|
| Endpoint | `GET /api/v1/repairs/track/<token>/` |
| Permisos | `AllowAny` — el token **es** la autorización |
| Tenant | derivado del token, jamás de un parámetro del cliente |
| Rate limit | por IP y por token; obligatorio, no opcional |

Campo nuevo en `RepairOrder` (BR-005):

| Campo | Tipo | Nota |
|---|---|---|
| `tracking_token` | CharField(64), único, indexado | `secrets.token_urlsafe(32)`, mínimo 128 bits de entropía |
| `tracking_expires_at` | DateTimeField, null | caduca; un enlace eterno es una fuga eterna |
| `tracking_revoked_at` | DateTimeField, null | poder cortar un enlace filtrado |

**Respuesta propuesta — mínimo suficiente**

```json
{
  "code": "REP-1042",
  "status": "in_repair",
  "status_label": "En reparación",
  "device_name": "MacBook Pro 14\"",
  "received_at": "2026-08-20T15:04:00Z",
  "estimated_ready_at": "2026-08-27T00:00:00Z",
  "updated_at": "2026-08-25T11:20:00Z",
  "company": { "name": "Black Dog Store", "support_phone": "+51 936 449 536" }
}
```

**Seguridad — lo que esta respuesta NO puede contener**

- Notas internas ni diagnóstico técnico interno.
- Costos internos, márgenes o precios de repuesto.
- Datos de otros clientes, ni ningún identificador que permita inferirlos.
- Datos del técnico asignado más allá de lo que el taller decida publicar.
- `serial_or_imei` completo — dato sensible; a lo sumo enmascarado.
- Email, teléfono o dirección del cliente: quien tiene el enlace no es
  necesariamente el cliente.

Un token de seguimiento **no es una sesión**. No debe emitir cookie, no debe
aceptar `Authorization`, no debe poder escalarse a la cuenta del cliente y no
debe permitir ninguna escritura.

**Tests backend sugeridos**

- Un token válido devuelve solo la reparación de ese token.
- Un token de la empresa A no devuelve nada de la empresa B.
- Token caducado → 404 (no 403: un 403 confirma que existe).
- Token revocado → 404.
- Token inexistente y token caducado son **indistinguibles** en la respuesta.
- La respuesta no contiene notas internas, costos ni datos de contacto.
- El endpoint no acepta métodos de escritura.
- El rate limit corta la enumeración.

**Mientras no exista**

Mobile no inventa el endpoint, no simula datos de seguimiento y no acepta un
token. `INTEGRATION_STATUS.md` lo mantiene en `API_PENDING`.

---

## Notas de entorno (no requieren cambio de código)

- **`ALLOWED_HOSTS`**: para probar contra un Django local desde el simulador o
  un dispositivo, el host de la Mac debe estar permitido. En `DEBUG` el default
  ya incluye `localhost`, `127.0.0.1` y `0.0.0.0`; para un dispositivo físico
  hace falta añadir la IP LAN. **Mobile no lo modifica**, lo pide.
- **CORS**: una app nativa no envía `Origin`, así que `CORS_ALLOWED_ORIGINS`
  normalmente no interviene. No pedimos ningún cambio ahí.


---

# BR-009 — Superficie `/api/v1/` para recuentos físicos de inventario

**Estado:** **PENDIENTE** · **Prioridad:** ALTA · **Bloquea:** IP2B Mobile

Contrato auditado en `PapiCuche/BlackDogStore-web` @ `origin/master`
**`2dca0a3ac89a957e3eecd832e2776c468e63c53a`**, leyendo el código, no un plan.
Cada afirmación de abajo lleva su símbolo.

> **Backend decide la forma final.** Lo que sigue es el adapter mínimo que
> Mobile necesita, expresado en la convención que ya existe. No es un diseño de
> dominio: el dominio ya está hecho y no debe cambiar para acomodar a un cliente.

## Operación bloqueada

Recuentos físicos de inventario (*inventory counts / recounts*).

## Estado actual

| Capa | Estado |
|---|---|
| Dominio | **EXISTE** — `inventory_services`: `create_inventory_count`, `set_count_item`, `approve_inventory_count`, `cancel_inventory_count` |
| Modelos | **EXISTEN** — `InventoryCount`, `InventoryCountItem` |
| Web | **LO USA** — `/api/admin/inventory/counts/…`, cinco vistas en `inventory_views` |
| Tests backend | **EXISTEN** — incluida la concurrencia (`Phase2dConcurrencyTest`) |
| `/api/v1/` | **NO EXISTE** ← el bloqueo |
| Mobile | **PROHIBIDO** hasta que exista. No se inventan endpoints. |

## Estados reales del recuento

```
draft ──(primera línea)──▶ counting ──approve──▶ approved
  │                           │
  └──────────cancel───────────┘
```

`InventoryCount.STATUS_CHOICES` = `draft` · `counting` · `review` · `approved` ·
`cancelled`.

- `EDITABLE_STATUSES` = {`draft`, `counting`, `review`}
- `APPROVABLE_STATUSES` = {`counting`, `review`}

**`review` es real y ninguna transición lo produce.** Ni el dominio ni la consola
Web tienen una ruta que lo fije; se alcanza editando la fila. El adapter **no
debe inventar** una transición que el negocio no construyó.

**Nada fija un estado directamente.** `counting` es consecuencia de anotar un
hallazgo (`set_count_item` lo cambia al guardar la primera línea) y `approved` es
consecuencia de corregir estantes reales. Por eso el adapter no debe exponer
`PATCH status` ni `…/status/`: permitiría afirmar que un recuento se aprobó sin
que se moviera nada.

## Campos de una línea, y por qué son tres números

`InventoryCountItem`:

| Campo | Quién lo pone | Qué significa |
|---|---|---|
| `theoretical_at_start` | servidor, la **primera** vez que el producto entra | lo que el sistema decía cuando esa persona empezó a contar. Evidencia, no aritmética |
| `physical_quantity` | **cliente** | lo que se encontró. `null` = **no contado**, que no es cero |
| `theoretical_at_approval` | servidor, al aprobar, **bajo lock** | lo que el sistema dice en el instante de aplicar |
| `difference` | servidor, al aprobar | `physical − theoretical_at_approval` |
| `note` | cliente | texto libre, ≤250 |

## Cómo se calcula y aplica la corrección

**CONFIRMADO** leyendo `approve_inventory_count`:

```python
with transaction.atomic():
    locked = InventoryCount.objects.select_for_update().get(pk=count.pk)
    ...
    stocks = _locked_branch_stocks(locked.branch, [i.product for i in items])
    for item in items:
        theoretical = stocks[item.product_id].quantity     # releído BAJO LOCK
        difference  = item.physical_quantity - theoretical
```

La observación previa **queda confirmada, no refutada**: la corrección es
`physical − theoretical_at_approval`, releyendo bajo lock, **no** contra el
snapshot inicial. `_locked_branch_stocks` bloquea las filas `BranchStock` en
orden `(branch_id, product_id)` — el único orden que usa el módulo — para evitar
deadlocks.

Y está fijado por un test que ya existe, `Phase2dConcurrencyTest`: cuenta 10,
se venden 4 durante la revisión, y el resultado es `+3` contra el 7 del momento.
Usar el 11 inicial habría aplicado `−1` y **destruido una unidad real**.

Otras reglas del apply:
- `difference == 0` → **no** genera movimiento.
- Signo → `StockMovement.CORRECTION_POSITIVE` / `CORRECTION_NEGATIVE`, cantidad `abs(difference)`.
- Líneas con `physical_quantity IS NULL` se **omiten**. Tratar «nadie lo contó» como «no hay» daría de baja inventario que nadie miró.
- Sin ninguna línea contada → `InventoryCountError` (400).
- `metadata` del movimiento lleva los tres números y el id del recuento.

## Política de concurrencia — comportamiento requerido

El adapter **hereda** esta política y no la reinterpreta:

1. El recuento se bloquea con `select_for_update()`.
2. Las filas de stock se bloquean en orden determinista.
3. La corrección se mide contra el valor releído, nunca contra el snapshot.
4. Todo ocurre en una transacción: o se aplican todas las líneas o ninguna.

## Idempotencia

| Operación | Comportamiento real |
|---|---|
| `approve` sobre un recuento ya aprobado | **IDEMPOTENTE** — devuelve los movimientos existentes, no crea otros |
| `cancel` sobre uno ya anulado | **IDEMPOTENTE** — devuelve el recuento |
| `approve` fuera de `APPROVABLE_STATUSES` | `InventoryCountError` |
| `cancel` sobre un **aprobado** | **RECHAZADO** — «ya generó movimientos y no puede anularse» |
| `set_count_item` fuera de `EDITABLE_STATUSES` | rechazado — «ya no admite cambios» |

Ninguna necesita clave de idempotencia de cliente: el dominio ya es seguro ante
repetición. **Mobile no debe reintentar igualmente** — `retry: false`.

## Rechazos que son parte normal del dominio

No son fallos; el cliente debe mostrarlos tal cual:

- recuento no editable;
- producto de otra empresa;
- cantidad física negativa o no entera;
- aprobar sin nada contado;
- anular un aprobado;
- sucursal inactiva o de otra empresa.

## Endpoints v1 requeridos — propuesta mínima

Convención existente: `/api/v1/internal/<slug>/inventory/…`

| Método | Ruta | Acto |
|---|---|---|
| `GET` | `internal/<slug>/inventory/counts/` | listar los de mis sucursales |
| `POST` | `internal/<slug>/inventory/counts/` | abrir un borrador en **una** sucursal |
| `GET` | `internal/<slug>/inventory/counts/<id>/` | el documento con sus líneas |
| `PUT` | `internal/<slug>/inventory/counts/<id>/items/` | anotar hallazgos |
| `POST` | `internal/<slug>/inventory/counts/<id>/approve/` | aplicar las diferencias |
| `POST` | `internal/<slug>/inventory/counts/<id>/cancel/` | cerrar sin mover stock |

**Una ruta por ACTO real, ninguna que fije un estado.** Es la misma forma que ya
tienen las transferencias en v1, y el motivo es idéntico.

**`PUT items/` debe ser ADITIVO**, como el de Web: enviar un subconjunto
actualiza esos productos y deja el resto en paz. Un recuento se llena a lo largo
de horas por personas que recorren pasillos distintos, y un PUT de lista completa
dejaría que el último guardado borrara el trabajo de los demás.

## Capabilities

Medidas sobre las vistas Web, no supuestas:

| Operación | Capability |
|---|---|
| `GET` lista | `inventory.view` |
| `GET` detalle | `inventory.view` |
| `POST` abrir | `inventory.adjust` |
| `PUT` líneas | `inventory.adjust` |
| `POST` approve | `inventory.adjust` |
| `POST` cancel | `inventory.adjust` |

No hace falta capability nueva. **El nombre de un rol nunca es autoridad**: la
única fuente es `resolve_capabilities()` / `has_capability()`.

## Autoridad de tenant

La empresa se deriva **del slug de la ruta más la membresía del llamante**,
server-side. Nunca de un campo del cuerpo ni de una cabecera. Empresa
desconocida, inactiva o sin membresía → **404 idéntico**, para que no se pueda
enumerar qué empresas existen.

## Autoridad de sucursal

Un recuento vive en **una** sucursal, así que la visibilidad de sucursal es toda
la regla — a diferencia de una transferencia, que tiene dos extremos.

| Situación | Código |
|---|---|
| Recuento en una sucursal fuera de mi alcance | **404**, no 403 |
| Abrir un recuento en una sucursal que no alcanzo | **404** |
| Sucursal de otra empresa | **404** |
| Con capability, sin acceso a ninguna sucursal | 403 (`NoBranchError`) |

El 404 es deliberado: un 403 confirmaría que el documento existe y permitiría
barrer ids hasta dibujar la cadena de tiendas.

## Contrato mínimo

**Request — solo intención.**

```jsonc
// POST counts/
{ "branch": 4, "reason": "Recuento mensual" }

// PUT counts/<id>/items/   ← LISTA, aditiva
[ { "product_slug": "cable-usb-c", "physical_quantity": 8, "note": "" } ]

// POST approve/ · cancel/
{}
```

Mobile **NO** debe enviar, y el servidor **no** debe aceptar como autoridad:
stock final · corrección calculada · `theoretical_at_start` ·
`theoretical_at_approval` · `difference` · `status` · empresa · actor · fechas.

**Response — lo que Mobile necesita para dibujar el estado real:**
`id`, `branch`, `branch_name`, `status`, `status_label`, `reason`,
`counted_items`, `created_by_username`, `created_at`, `approved_at`,
`cancelled_at`, y por línea `product_slug`, `product_name`,
`theoretical_at_start`, `physical_quantity`, `theoretical_at_approval`,
`difference`, `is_counted`, `note`.

`approve` debería devolver además los movimientos generados, para que el cliente
muestre **lo que se movió** en vez de dar a entender que se movió todo.

## Traversabilidad de producto — el punto que hundió a PR #23

`GET /api/v1/internal/<slug>/inventory/stock/` devuelve **`product_slug` y ningún
pk**. `POST …/inventory/adjustments/` ya recibe `product_slug`. Un cliente nativo
que ha recorrido un estante tiene un slug y nada más.

**Por eso `PUT items/` debe aceptar `product_slug`.** Exigir un pk numérico
volvería la ruta inalcanzable desde la única lista con la que se usa, y
alcanzable solo por un cliente que hubiera pasado por `/api/admin/` — que es
justo lo que Mobile no puede hacer. Es literalmente el defecto que PR #23 tuvo
que corregir en transferencias **después** de mergear.

Aceptar además el pk está bien: la consola Web lo habla.

> **Test de navegabilidad obligatorio antes del merge:** recorrer
> `GET stock` → tomar el identificador → `POST counts/` → `PUT items/` →
> `POST approve/` usando **solo** lo que la propia superficie v1 devuelve, sin
> tocar `/api/admin/`.

### Limitación real, sin maquillar

Un cliente v1 **solo descubre productos que ya tienen fila `BranchStock` en esa
sucursal**. Verificado en `branch_stock_queryset`:

- fila con cantidad **0** → **sí** aparece;
- producto **nunca** almacenado en esa sucursal (sin fila) → **no** aparece;
- producto inactivo → **no** aparece (`active_products_only=True`).

No existe búsqueda de catálogo interno: la única ruta de producto en v1 es
`sales/pos/products/search/`, gateada por **`sales.pos.use`**, que un miembro de
inventario no tiene. El catálogo `storefront` es de audiencia cliente y mezclarlo
sería romper la separación de audiencias.

**Consecuencia operativa:** un artículo que está físicamente en el estante pero
nunca tuvo fila en esa sucursal **no se puede contar desde Mobile**. El dominio
sí lo admite si se le nombra (`branch_quantity` devuelve 0 y
`_locked_branch_stocks` crea la fila); lo que falta es la forma de encontrarlo.

Esto es un **bloqueo declarado**, no un detalle. Backend decide si lo resuelve
(por ejemplo permitiendo `?include_unstocked=true` en el stock interno, o una
búsqueda de catálogo gateada por `inventory.view`) o si se acepta la limitación
en la primera versión. Mobile **no** la va a tapar inventando una fuente.

## Tests backend requeridos antes del merge

1. aislamiento de tenant — empresa ajena → 404, y desconocida → el mismo 404;
2. capability — `inventory.view` lee y **no** escribe; `inventory.adjust` escribe;
3. alcance de sucursal — recuento fuera de alcance → **404**, no 403;
4. ciclo válido — abrir → anotar → aprobar, con el stock corregido;
5. ciclo inválido — aprobar un anulado, anular un aprobado, editar un aprobado;
6. **concurrencia real** — stock que cambia entre el snapshot y la aprobación;
7. corrección calculada **server-side** — un cliente que envía `difference` no la impone;
8. atomicidad — una línea mala revierte la petición entera;
9. producto cross-tenant → 404, y **sin** dejar línea creada;
10. producto fuera de sucursal / sin fila — comportamiento explícito y documentado;
11. **traversabilidad** — el flujo completo desde `GET stock`, sin `/api/admin/`;
12. ningún campo server-owned aceptado como autoridad (`status`, `company`, `theoretical_*`, `difference`);
13. ninguna referencia a `/api/admin/` en el adapter;
14. paridad Web/dominio — la misma intención por ambas puertas deja el mismo `InventoryCount`, el mismo `BranchStock`, el mismo `StockMovement` y la misma auditoría;
15. no contado ≠ cero — una línea sin cantidad no baja el stock a cero;
16. contar **cero** sí es un recuento y sí corrige;
17. entrada hostil — `physical_quantity: true` no debe registrarse como 1, y una `note` estructurada no debe producir un 500.

## Smoke requerido antes de tocar Mobile

Una vez mergeado el adapter, contra `origin/master` ya mergeado y con login real:

1. `GET /inventory/stock/?branch_id=N` → confirmar `product_slug` y **ausencia** de pk;
2. abrir un recuento con ese `branch_id` → 201, estado `draft`;
3. anotar por `product_slug` → 200, estado pasa a `counting`, `theoretical_at_start` correcto;
4. comprobar que **antes** de aprobar el stock no se movió;
5. mover stock por fuera (`/inventory/adjustments/`) y **luego** aprobar →
   el estante debe quedar en lo contado, no en `snapshot − diferencia`;
6. `theoretical_at_approval` y `difference` con los valores del momento;
7. aprobar dos veces → una sola corrección, mismos movimientos;
8. una línea no contada → su estante intacto;
9. contar cero → estante a cero;
10. cancelar un borrador → nada se mueve; cancelar un aprobado → rechazo;
11. autoridad: ventas 403, otra empresa 404, otra sucursal 404, anónimo 401;
12. el cuerpo no manda: `status`, `company`, `theoretical_*`, `difference` ignorados;
13. forma: objeto suelto en vez de lista → 400; producto inexistente → 404;
14. **todo el recorrido sin una sola llamada a `/api/admin/`**.

Sólo cuando esto pase en vivo, y con el SHA revalidado, empieza IP2B Mobile.
