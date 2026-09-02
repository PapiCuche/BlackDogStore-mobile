# Arquitectura

## Principio

La app se construye **en paralelo** a un backend que todavía no tiene todo lo
que la app necesita. Toda la arquitectura sale de ahí: hay una costura entre las
pantallas y los datos, y esa costura es lo único que hay que mover cuando un
endpoint aparece.

No hay contenedor de inyección de dependencias, ni `Repository<T>` genérico, ni
capa de casos de uso. Cada abstracción presente se gana su sitio.

## Flujo de datos

```
Pantalla (src/app/…)
   └─ hook (src/hooks/use-*.ts)          ← TanStack Query: caché, reintentos, cancelación
        └─ repositories.<feature>         ← src/repositories/index.ts: composition root
             ├─ Mock*Repository           ← fixtures, fuera del árbol de componentes
             └─ Api*Repository            ← src/api/client.ts → Django
```

Reglas que sostienen esto:

- Una pantalla **nunca** importa `src/api` ni un repositorio concreto.
- Un componente **nunca** contiene un array de datos.
- `src/repositories/index.ts` es el **único** sitio que decide mock vs API.
- El estado de servidor vive en TanStack Query y en ningún otro sitio. No hay
  Redux/Zustand duplicando productos, pedidos ni reparaciones: una segunda copia
  es una segunda cosa que invalidar, y siempre se desincroniza.

## Estructura

```
src/
├── app/                    Rutas de Expo Router (file-based). Solo composición.
│   ├── _layout.tsx         Providers + Stack raíz + tema nativo + splash
│   ├── index.tsx           Gate de arranque → (auth) o (tabs)
│   ├── (auth)/             login · register · forgot-password · verify-email
│   ├── (tabs)/             index(Home) · repairs · shop · orders · profile
│   ├── products/[slug].tsx · repairs/[id].tsx · orders/[id].tsx
│   └── +not-found.tsx
│
├── connectivity/           Estado de red: modelo + provider (una suscripción)
├── api/                    HTTP. client.ts · errors.ts · api-scope.ts
│                           authenticated-request.ts
│                           endpoints/catalog-v1.ts      (público)
│                           endpoints/auth-v1.ts         (sesión)
│                           endpoints/customer-orders-v1.ts (cliente)
│                           endpoints/customer-checkout-v1.ts (compra)
│                           endpoints/storefront-config-v1.ts (marca)
│                           endpoints/internal-v1.ts     (interna)
├── cart/                   Carrito: provider + persistencia (una sola verdad)
├── auth/                   Sesión, política y ciclo de vida de tokens
│   ├── auth-policy.ts      Qué mecanismo permite esta build (fail-safe)
│   ├── auth-repository-factory.ts   Composition root de auth
│   ├── refresh-coordinator.ts       Single-flight + rotación + epoch
│   ├── redact.ts           Nada de esto llega a un log
│   ├── tokens/             access (memoria) · vault (SecureStore) · tipos
│   └── transport/          Interfaz + FakeAuthTransport (solo tests)
├── config/                 env.ts (entorno) · integration-status.ts
├── design-system/          Componentes reutilizables. Barrel en index.ts
├── domain/                 Tipos y REGLAS. company · products · orders · repairs · customers
├── features/               Composiciones por feature (tarjetas, timeline, chips)
├── hooks/                  Hooks de datos (TanStack Query) + accesibilidad
├── linking/                Enlaces entrantes. parser · security · builders
│                           coordinator (puro) · pending-intent (memoria)
│                           deep-link-provider (único ciclo de vida)
├── providers/              AppProviders · QueryClient · retry-policy
│                           query-scope.ts · query-lifecycle.tsx
├── repositories/           Interfaces + mock/ + api/ + composition root
├── storage/                secure-storage (secretos) · preferences-storage (no secretos)
├── theme/                  Tokens + AppThemeProvider
├── utils/                  format · haptics
└── validation/             Esquemas Zod
```

### Por qué `domain/` está separado de `features/`

`domain/` contiene **reglas**, no presentación:

- `findActiveRepair()` decide qué reparación merece el Home.
- `describePaymentStatus()` / `describeFulfillmentStatus()` deciden el color y
  el texto de un estado.
- `productAvailability()` decide qué significa "últimas unidades".

Están fuera de React a propósito: se prueban sin renderizar nada, y garantizan
que "En reparación" sea del mismo color en las cuatro pantallas donde aparece.

`features/` es la presentación de esas reglas: `RepairCard`, `OrderCard`,
`RepairTimeline`, `ProductCard`, `CategoryChips`.

### Por qué `design-system/` está separado de `features/`

`design-system/` no sabe nada del negocio. `Button` no conoce las reparaciones;
`StatusBadge` recibe un `tone`, no un `RepairStatus`. Ese tono lo calcula el
dominio. Así una pantalla no puede pintar un estado del color equivocado.

### Por qué `theme/` está separado de `design-system/`

Los tokens son datos; los componentes son React. Separarlos permite probar el
sistema de color sin montar un árbol de componentes — que es exactamente lo que
hace `__tests__/theme.test.ts`.

## Navegación

Expo Router, file-based, con la raíz en `src/app`.

- **Raíz:** `Stack` sin header. Reparte el tema resuelto al nivel **nativo**
  (header, fondo del contenedor, barra de estado). Sin eso, un push en modo
  oscuro muestra un destello blanco: JS pinta oscuro mientras UIKit sigue claro.
- **`(tabs)`:** navegador de tabs **estable** de Expo Router
  (`expo-router/js-tabs`). Ver DEC-MOBILE-001 más abajo.
- **Detalles:** rutas hermanas de `(tabs)`, con header nativo, para que el gesto
  de retroceso y el título los gestione el sistema.
- **Iconos:** SF Symbols en iOS, Material Symbols en Android, desde una sola
  declaración en `src/design-system/icon.tsx`.

### DEC-MOBILE-001 — Stable tab navigation over alpha native tabs

**Fecha:** 2026-08-27 (M0.1) · **Estado:** ACEPTADA · **Reemplaza:** la elección de M0

**Contexto**

M0 construyó el tab bar principal sobre
`expo-router/unstable-native-tabs`, que renderiza un `UITabBar` real en iOS y un
bottom navigation de Material en Android.

**Problema**

1. La API sigue bajo el namespace `unstable` y la guía oficial de Expo la
   clasifica como **alpha**. Su forma puede cambiar entre versiones menores del
   SDK.
2. Su prop `hidden` **remonta el navigator y reinicia el estado de navegación**
   (documentado en los propios tipos del paquete).

El segundo punto choca de frente con el modelo SaaS: las pestañas se derivan de
`enabledFeatures` del tenant, un valor que puede resolverse un instante después
del arranque. Con `hidden`, ese cambio reiniciaría toda la pila de navegación
del usuario.

Una API alpha combinada con pestañas dinámicas por tenant no es una fundación.

**Decisión**

Migrar la navegación principal al navegador de tabs **estable y público** de
Expo Router: `import { Tabs } from 'expo-router/js-tabs'`.

- Es un entry point de **Expo Router**, no un import directo de
  `@react-navigation/*` — SDK 56+ prohíbe lo segundo en código de aplicación.
- El mismo `Tabs` se re-exporta desde la raíz `expo-router`, pero marcado
  `@deprecated` en favor de esta ruta; usamos la no deprecada.
- El feature-gating por tenant usa **`href: null`**, que oculta la pestaña de la
  barra y bloquea la navegación hacia ella **sin** tocar la lista de screens del
  navigator. Alternar una pestaña ya no cuesta estado.

**Consecuencias**

Se pierde: el `UITabBar` nativo, el minimize-on-scroll de iOS 26, y el
scroll-to-top nativo al retocar la pestaña.

Se gana: una API que seguirá existiendo en el próximo SDK, y visibilidad de
pestañas que no reinicia la app.

El diseño sigue siendo limpio y con tokens: colores, tipografía y hairline del
tab bar salen del theme, y los iconos siguen siendo SF Symbols en iOS y Material
Symbols en Android.

**Reevaluación**

Native Tabs merece volver a mirarse **en cuanto Expo retire el prefijo
`unstable`**. El coste del cambio es bajo por diseño: el tab bar es un archivo
(`src/app/(tabs)/_layout.tsx`) y ninguna pantalla depende de él.

**Alcance**

Esta decisión aplica a la navegación principal. No prohíbe usar APIs `unstable`
en piezas aisladas y fácilmente reemplazables; prohíbe construir **la
navegación de largo plazo** sobre una de ellas.

## Multiempresa

`CompanyBrand` (`src/domain/company/types.ts`) separa dos cosas que se confunden
con facilidad:

- **Branding de distribución** — varía por tenant: nombre, logo, colores,
  canales de soporte, `enabledFeatures`.
- **Reglas de negocio SaaS** — no varían: un pedido es un pedido, una reparación
  tiene el mismo ciclo, el dinero es dinero.

`enabledFeatures` gobierna de verdad: `(tabs)/_layout.tsx` construye el tab bar
a partir de él, vía `href: null` (ver DEC-MOBILE-001).

### Aislamiento entre tenants (M0.1)

`useCompanyBrand()` devuelve un `CompanyBrandState`
(`loading` | `ready` | `unavailable`), no un `CompanyBrand` incondicional.

M0 usaba `pilotCompanyBrand` como `initialData` universal, de modo que el primer
frame siempre tenía nombre de empresa. Eso es correcto para el piloto y **falso
para cualquier otro tenant**: un build para otra compañía habría mostrado "Black
Dog Store" antes de cargar su propia marca.

Las reglas ahora:

- El fixture del piloto se siembra **solo** cuando el build es del tenant piloto
  **y** está en modo mock (`isPilotTenant && useMockData`).
- El logo empaquetado se dibuja **solo** cuando `source === 'pilot-fixture'`.
  `BrandLockup` lo comprueba explícitamente.
- Mientras la marca no resuelve, la UI es **neutral** (placeholder), no la de
  otro cliente.
- Las features disponibles caen a `DEFAULT_ENABLED_FEATURES`, una constante
  tenant-neutral — **no** a `pilotCompanyBrand.enabledFeatures`.

## Configuración a prueba de fallos (M0.1)

`src/config/env.ts` resuelve el entorno con una regla única: **una variable
ausente en un release se resuelve al valor estricto, nunca al permisivo.**

| | Variable sin definir | Resultado |
|---|---|---|
| `EXPO_PUBLIC_APP_ENV` | release | `production` (el más estricto de los dos) |
| `EXPO_PUBLIC_USE_MOCK_DATA` | development | mocks ON |
| | staging | mocks **OFF** |
| | production | mocks **OFF**, y no hay valor que los active |
| `EXPO_PUBLIC_COMPANY_SLUG` | development | `blackdog` (piloto) |
| | staging / production | `{ status: 'missing' }` — **nunca** el piloto |

Dos consecuencias en el código, no solo en la documentación:

1. **`repositories.repairs`, `.orders`, `.company` — y desde M0.2 también
   `.catalog` — son nulables.** Antes se instanciaban incondicionalmente, lo que
   anulaba el interruptor: un build de producción habría mostrado reparaciones y
   pedidos inventados. Hoy un repositorio existe solo si el build puede
   servirlo; si no, la query rechaza con `FeatureUnavailableError` y la pantalla
   lo dice.
2. **`configurationIssues`** recoge los problemas (tenant ausente, API sin
   configurar, mocks en release) y el Perfil los muestra. Se **reporta**, no se
   lanza: tirar abajo un build de tienda por una variable es peor que
   diagnosticarlo con claridad.

Las reglas son funciones puras (`resolveMockDataPolicy`, `resolveTenant`,
`collectConfigurationIssues`) precisamente para poder probarlas —
`__tests__/env-config.test.ts`.

### Del gate legacy al catálogo real (M0.2 → M2)

El catálogo era el caso peligroso porque **sí** tenía implementación real:

```ts
catalog: useMockData ? new MockCatalogRepository() : new ApiCatalogRepository()
```

Un solo `EXPO_PUBLIC_USE_MOCK_DATA=false` bastaba para apuntar un release al
catálogo legacy de Django — público, funcional, y devolviendo **los productos de
todas las empresas**. Se estaba tratando *"no es mock"* como *"es seguro"*, y no
son lo mismo.

**M0.2** encerró eso tras un gate que fallaba cerrado: fuera de desarrollo, un
release no recibía repositorio de catálogo en absoluto.

**M2 resolvió el problema en vez de seguir vigilándolo.** `origin/master`
`b301637b` publica `/api/v1/storefront/<company_slug>/…`, donde el servidor
resuelve una empresa activa desde la ruta y construye cada queryset desde ella.

```
                    mocks ON ──────────────► MockCatalogRepository
                        │
catalogPolicy ──────────┤ tenant + API url ─► V1ApiCatalogRepository
                        │
                    falta alguno ──────────► null  (fail-safe)
```

El slug de la ruta **selecciona un escaparate público; no autoriza nada**. Toda
superficie privada seguirá derivando su empresa de la membresía del usuario
autenticado (BR-001/BR-002). Son dos preguntas distintas y no comparten camino.

El fail-safe importa más que el camino feliz. Sin `EXPO_PUBLIC_COMPANY_SLUG` no
hay storefront que pedir, y caer a la empresa piloto serviría el catálogo de
Black Dog Store dentro de la app de otra empresa. Sin API url no hay a quién
preguntar. **Ninguno de los dos cae a mocks**: productos inventados delante de un
cliente real es peor que una pantalla vacía que lo diga.

#### Por qué el legacy se borró en vez de apagarse

`LegacyApiCatalogRepository`, su wrapper de endpoint, `assertLegacyCatalogAllowed`
y `EXPO_PUBLIC_ENABLE_LEGACY_CATALOG` fueron **eliminados**.

Un segundo camino "temporal" a los mismos datos —y encima el inseguro— es el que
acaba usándose, meses después, por alguien que no sabe por qué seguía ahí. El
gate de M0.2 era la respuesta correcta mientras no existía alternativa; con la
alternativa publicada, mantenerlo habría sido conservar la superficie de riesgo
sin ninguna de sus ventajas.

## Autenticación (M1)

La fundación completa del ciclo de vida de tokens, **sin backend**. El detalle
está en `docs/MOBILE_AUTH.md`; lo estructural es esto:

```
AuthProvider  ← estado de sesión + epoch anti-carrera
   └── resolveAuthRepository()   ← composition root
          ├── MockAuthRepository   development / staging opt-in
          ├── ApiAuthRepository    NO EXISTE (BR-001)
          └── null                 → status 'unavailable'

RefreshCoordinator   single-flight · rotación · epoch
   ├── AccessTokenStore    memoria. Nunca disco, nunca React.
   └── CredentialVault     SecureStore. Solo el refresh token.
```

Cuatro decisiones que gobiernan el resto:

1. **La política decide, no el componente.** `AuthProvider` construía
   `new MockAuthRepository()` como parámetro por defecto, así que un release
   aceptaba cualquier contraseña. Ahora `resolveAuthRuntimePolicy` decide y en
   production la respuesta es siempre `unavailable`.
2. **El access token vive en memoria.** Dura 30 minutos; persistirlo casi no
   ahorra nada y lo que entra al Keychain sobrevive al proceso y a los backups.
3. **Sesión ≠ tokens ≠ perfil.** El estado de React acaba en volcados de
   devtools y reportes de crash: aceptable para un nombre, fatal para un token.
4. **Un epoch por sesión.** Las carreras de auth solo aparecen con red lenta y
   todas terminan igual: una sesión que el usuario no pidió. Cada mutación sube
   el epoch; cada finalización lo comprueba.

### Autenticación real (M3)

M1 construyó la máquina completa —vault, access store, refresh coordinator,
pipeline de reintentos— contra `FakeAuthTransport`, apostando a que cuando el
endpoint existiera el trabajo sería **una clase, no un rediseño**. M3 cobró esa
apuesta: el coordinator, el vault y la rotación no se tocaron.

```
LoginScreen ──► AuthProvider ──► ApiAuthRepository
                                       │
                     ┌─────────────────┼─────────────────┐
                     ▼                 ▼                 ▼
              CredentialVault   AccessTokenStore   DjangoAuthTransport
              (SecureStore)      (solo memoria)     (/api/v1/auth/)
                     └──────► RefreshCoordinator ◄──────┘
                              single-flight · epoch
```

**El orden importa más que las piezas.** `signIn` persiste el refresh **antes**
de instalar el access, porque el servidor rota y mete en blacklist: al llegar la
respuesta el token anterior ya está muerto. Un crash entre medias dejaría la app
autenticada media hora y luego desconectada para siempre.

**Cold start distingue tres cosas que antes eran una.** Rechazo del servidor →
`unauthenticated` con credenciales borradas. Sin refresh guardado →
`unauthenticated`. Red caída → **`temporarily-unavailable` conservando el
refresh**. Antes todo terminaba en logout, algo inofensivo con un mock que nunca
fallaba y desastroso contra un servidor real.

**Contrato ≠ servidor.** `isBackendAuthAvailable` dice que la build sabe hablar
el contrato, no dónde está el servidor. Sin `EXPO_PUBLIC_API_BASE_URL` la
política cae a `unavailable`, nunca a un login que solo puede fallar ni a mocks.

**Empresa activa.** El servidor devuelve las relaciones que verificó
(`Membership` o `Customer`). El slug de la build **busca** la suya en esa lista;
si no está, `activeCompany` es null. Sin caer al piloto, sin "la primera", sin
inventar una membresía desde una constante de build.

## Resiliencia del cliente (M1.1)

Detalle completo en `docs/OFFLINE_STRATEGY.md`. Lo estructural:

```
ConnectivityProvider   una sola suscripción nativa (expo-network)
        │
        ├── onlineManager   ← TanStack sabe pausar; no puede ver la radio
        ├── focusManager    ← AppState, porque no hay window.focus
        └── OfflineBanner   ← banda discreta, no modal
```

### DEC-MOBILE-002 — Tenant and user scoped server-state cache

**Fecha:** 2026-08-27 (M1.1) · **Estado:** ACEPTADA

**Contexto.** M0 usaba claves globales: `['products']`, `['orders']`. En un
piloto de una tienda funciona.

**Problema.** En un SaaS es una fuga de cache, y no hace falta ningún bug de
backend: el catálogo de la Empresa A puede responder a la build de B, y los
pedidos del Usuario A pueden seguir en memoria cuando entra el Usuario B.

**Decisión.** Toda query específica de empresa lleva namespace de tenant; toda
query con datos privados lleva además el id estable del usuario.

```
['tenant', 'blackdog', 'public', 'products', …]     catálogo, marca
['tenant', 'blackdog', 'user', '42', 'orders']      pedidos, reparaciones
```

Y al cambiar la identidad (`tenant::user`) se **cancelan y eliminan** las
queries privadas. Ambas cosas: defensa en profundidad.

**Alcance.** Es un namespace de cache, **no autorización**. El slug viene de la
build y nunca ha sido una credencial; la autoridad es del servidor (BR-002).

### DEC-MOBILE-003 — Offline-aware before offline-first

**Fecha:** 2026-08-27 (M1.1) · **Estado:** ACEPTADA

**Decisión.** M1.1 implementa conectividad, cache en memoria, reintentos y
revalidación al reconectar. **No** implementa persistencia de cache ni cola de
mutaciones offline.

**Motivo.** Persistir exige antes resolver partición por tenant en disco,
partición por sesión, borrado en logout, cifrado de datos personales, versión de
esquema y retención. Y una cola de mutaciones chocaría con la **autoridad del
servidor**: aprobar una cotización o cancelar un pedido son decisiones que solo
el backend puede tomar.

## Enlaces entrantes (M1.2)

Detalle completo en `docs/LINKING_STRATEGY.md`. Lo estructural:

```
URL (email · QR · otra app)   ← no confiable
        │
   parser.ts        allowlist: scheme, host, ruta, identificador, límites
        │           security.ts: parámetros prohibidos, decoding, traversal
        ▼
   DeepLinkIntent   dato tipado, sin URL cruda, sin token
        │
   deep-link-coordinator.ts    tenant gate → auth gate → decisión (puro)
        │
        ├── navigate              destino público, o privado con sesión
        ├── authenticate          guarda intent EN MEMORIA → login → resume
        ├── auth-unavailable      no se muestra un login que no puede funcionar
        ├── feature-unavailable   tracking: sin contrato (BR-008)
        ├── wait                  la sesión todavía se está restaurando
        └── reject                enlace hostil o desconocido
        │
   deep-link-provider.tsx   único punto de ciclo de vida: cold start,
                            warm start, resume, fronteras de sesión
```

El parser, el coordinator y los builders son **funciones puras**: no navegan, no
hacen fetch y no tocan almacenamiento. Todo el efecto vive en el provider, que
es también el único sitio donde hay que mirar cuando un enlace se comporta mal.

### DEC-MOBILE-004 — Deep links are navigation intents, never authorization

**Fecha:** 2026-08-31 (M1.2) · **Estado:** ACEPTADA

**Contexto.** Un enlace llega desde fuera de la app: un correo, un QR, un
mensaje reenviado, otra aplicación. Nada de eso está bajo nuestro control.

**Problema.** Es tentador tratar la URL como si dijera algo sobre quien la abre.
No lo dice. Un enlace que nombra `orders/1042` significa "alguien quería llegar
a esta pantalla", jamás "esta persona puede ver ese pedido". Un enlace se
reenvía, se guarda en el historial, aparece en una captura y sobrevive al cambio
de dueño del teléfono.

**Decisión.** Un enlace produce como mucho un `DeepLinkIntent`: un destino. La
autorización la deciden, en este orden, el gate de sesión de la app y —de forma
definitiva— el backend. Ninguna pantalla muestra datos privados porque se haya
llegado a ella por enlace.

**Consecuencias.**
- El destino pendiente vive **solo en memoria**; persistirlo se lo entregaría a
  la siguiente persona que encienda el dispositivo.
- Se descarta en logout y en cambio de usuario.
- Ningún token viaja en una URL, y ninguna URL cruda llega a un log.
- El fallo de un enlace da **un solo mensaje**, igual para todas las causas: un
  mensaje distinto para "no existe" y para "no es tuyo" es un oráculo de
  existencia.

### DEC-MOBILE-005 — Verified HTTPS links for production entry points

**Fecha:** 2026-08-31 (M1.2) · **Estado:** ACEPTADA · **INFRA_PENDING**

**Contexto.** `blackdogstore://` funciona hoy y es suficiente para desarrollo.

**Problema.** Un custom scheme puede reclamarlo cualquier app instalada, así que
no prueba nada sobre el origen del enlace. Además el nombre pertenece a la app
piloto, no al producto SaaS.

**Decisión.** Los puntos de entrada de cara al cliente —correo, QR, push, web—
usarán **Universal Links (iOS) y App Links (Android) verificados por HTTPS**. El
custom scheme queda como compatibilidad y herramienta de desarrollo.

**Estado.** No hay dominio oficial y no se inventa uno: `TRUSTED_HTTPS_HOSTS`
está **vacío a propósito** y hoy todo enlace `https://` se rechaza. Confiar en
un host que nadie controla sería peor que no aceptar ninguno. El checklist de
activación (AASA, assetlinks, entitlements) está en `LINKING_STRATEGY.md`.

## Audiencias (M4)

El backend tiene ahora **tres audiencias**, y la app respeta esa separación en
vez de decidir por rol.

```
/api/v1/storefront/<slug>/   PÚBLICA    anónima          catalog-v1.ts
/api/v1/customer/<slug>/     CLIENTE    sus propios      customer-orders-v1.ts
/api/v1/internal/<slug>/     INTERNA    de la empresa    NO EXISTE TODAVÍA
```

### DEC-MOBILE-006 — Navegación pública, compra autenticada

**Fecha:** 2026-08-31 (M4) · **Estado:** ACEPTADA

**Decisión.** El catálogo es público y se queda público: abrir la app, buscar,
filtrar y ver un producto nunca piden cuenta. La sesión se pide en el momento en
que la **acción** se vuelve privada — leer tus pedidos, tus reparaciones,
pagar.

**Motivo.** Una app que exige una cuenta antes de enseñar lo que vende ha
perdido al cliente antes de abrir la tienda. Y pedirla justo cuando hace falta
es también cuando la persona **entiende por qué**.

`features/auth/private-action-gate` es la abstracción. Decide qué **dibujar**,
nunca qué puede leerse: el servidor revalida sesión y propiedad en cada llamada.

El checkout web legacy **conserva** su comportamiento anónimo. Esa regla se
aplica a la superficie móvil v1; cambiar el e-commerce existente es una decisión
aparte.

### DEC-MOBILE-007 — Cliente e interno son audiencias distintas

**Fecha:** 2026-08-31 (M4) · **Estado:** ACEPTADA

**Contexto.** Lo obvio sería `role === 'customer' ? CustomerApp : StaffApp`.

**Problema.** Es demasiado simple para un SaaS. Una misma identidad puede ser
clienta de la empresa A, trabajar en la A y trabajar también en la B. Y el
backend ya distingue las dos relaciones: `Customer` es quien compra, `Membership`
es quien trabaja — la migración 0015 deliberadamente **no** dio membresía a los
clientes.

**Decisión.** `customer` y `member` son booleanos **independientes** en el
contrato, no un rol. La app de cliente conserva sus pestañas; un empleado ve
además una entrada separada al área interna. Un trabajador puede seguir usando
la tienda como cliente.

**Consecuencia en cache.** Las claves privadas llevan segmento de audiencia:
`['tenant', slug, 'user', id, 'customer', …]`. Dos audiencias compartiendo clave
harían que la primera pantalla en cargar decidiera lo que muestra la segunda, y
la dirección peligrosa es que datos internos acaben en una vista de cliente.

### DEC-MOBILE-008 — Las capabilities guían la UX, jamás la autorización

**Fecha:** 2026-08-31 (M4) · **Estado:** ACEPTADA

**Decisión.** `access_contexts[].capabilities` viaja para decidir **qué pestaña
dibujar**. Nunca para decidir si una operación está permitida.

**Motivo.** Un cliente puede mentir. Si la app dijera "tengo `inventory.view`" y
el servidor lo creyera, la autorización viviría en el dispositivo del atacante.
Todo endpoint interno vuelve a resolver capabilities en el servidor: quien mienta
recibe un 403, no inventario.

**Consecuencia.** La app **no** mantiene una segunda matriz de permisos. Las
capabilities son datos que llegan y se usan para presentar.

## Carrito y compra (M5)

### DEC-MOBILE-009 — El carrito anónimo es intención local; el servidor es la verdad comercial

**Fecha:** 2026-08-31 (M5) · **Estado:** ACEPTADA

**Decisión.** El carrito vive en el dispositivo, sin backend. Guarda
`{productSlug, quantity}` más un snapshot de nombre, imagen y último precio
visto **solo para dibujar**. Todas las cifras que muestra son **estimaciones**, y
la pantalla lo dice.

**Motivo.** Un carrito no necesita servidor para existir, y pedir cuenta antes de
poder elegir cosas pierde al cliente antes de abrir la tienda. Pero un número
guardado en un teléfono no es un precio que la tienda haya aceptado: el checkout
recalcula todo desde `Product.price` en el momento de comprar.

**Consecuencias.**
- El tipo `Cart` **no** se reutiliza de `Order`. Un `Order` es historia con
  precios congelados; un `Cart` es una intención mutable que puede estar
  desactualizada. Compartir el tipo invitaría a tratar un número local viejo como
  un precio pactado.
- La aritmética es en **céntimos enteros**, nunca en flotantes: `4500.00 × 3` en
  números de JavaScript es cómo una cesta acaba mostrando `13499.999999999998`.
- Persiste en **AsyncStorage, no en SecureStore**. No contiene credenciales ni
  autorización; meterlo en el Keychain diluiría lo que «seguro» significa aquí.
- Es **tenant-scoped**: dos tiendas son dos carritos, y no hay uno global ni
  caída al piloto.
- **Sobrevive al login y al logout.** Alguien que entra para pagar, falla y sale,
  no pierde lo que eligió; lo privado —consultas de cliente— sí se limpia.

### El flujo de compra

```
producto → agregar (público) → carrito (público) → «Ir a pagar»
                                                        │
                                              gate de sesión (DEC-MOBILE-006)
                                                        │
                                    POST /api/v1/customer/<empresa>/checkout/
                                                        │
                                    Stripe Checkout ALOJADO (expo-web-browser)
                                                        │
                            vuelta a foreground → REFETCH del pedido al servidor
                                                        │
                                      ¿pagado? → vaciar esas líneas
                                      ¿no?     → conservar el carrito
```

**«El navegador volvió» no es un pago.** Volver a primer plano solo demuestra que
alguien cerró una pestaña. El estado real del pedido lo sabe el servidor, que lo
aprende del webhook de Stripe. Por eso al volver se **refetchea** y se cree eso.

**El carrito no se vacía hasta que el pago se confirma.** Cancelar, expirar,
fallar o quedarse sin red conservan la cesta: perderla por un pago abandonado
sería castigar al cliente por dudar.

**No hay campo de tarjeta en la app**, y no debe haberlo: que los datos de tarjeta
nunca toquen el cliente es la razón entera de que exista la página alojada. La
app abre una URL HTTPS que el servidor emitió, y **valida** que sea de Stripe
antes de abrirla — una URL es el único campo de una respuesta que se convierte en
una acción.

**La clave de idempotencia** se genera una vez por intento y se reutiliza en cada
reintento de ese intento; se regenera cuando la cesta cambia, porque una cesta
distinta es una compra distinta.

## Área interna (M6)

Cuatro audiencias. La app respeta la separación que el backend impone.

```
/api/v1/storefront/<slug>/   PÚBLICA    catalog-v1.ts
/api/v1/customer/<slug>/     CLIENTE    customer-orders-v1.ts, checkout
/api/v1/internal/<slug>/     INTERNA    internal-v1.ts, internal-inventory-v1.ts
/api/admin/                  WEB        nunca desde Mobile
```

### Una corrección de M4 que hay que decir

El backend devuelve `access_contexts` y `platform` desde M4. **Mobile los
descartaba en silencio**: `IdentityWire` no los declaraba, `SessionSnapshot` no
los llevaba y `AuthSession` no tenía dónde ponerlos. La documentación de M4
afirmaba que estaba integrado. No lo estaba.

La consecuencia era que la app no sabía **para qué empresas trabaja** una
persona, solo con cuáles se relaciona. El área interna es imposible sin eso, que
es como salió el hueco a la luz.

Corregido en M6, con tests que impiden que vuelva a pasar en silencio.

### Dos preguntas, dos fuentes

| Pregunta | Fuente |
|---|---|
| ¿Ofrezco la entrada al área interna? | `AuthSession.accessContexts` — la instantánea del login |
| ¿Sigue abriéndose ahora? | `GET /internal/<slug>/context/` — el servidor, al entrar |

La segunda existe porque los roles cambian mientras una sesión sigue viva. A
quien le revocaron un permiso hace una hora no debe seguir viendo un módulo
porque su token aún vale treinta minutos.

### Las capabilities dibujan; el servidor autoriza

`hasUxCapability` se llama así a propósito. No hay `can()` ni `isAllowed()` en
este código: esos nombres invitan a leer la respuesta como permiso. Todo endpoint
interno vuelve a resolver capabilities en el servidor, en cada petición.

`role` **nunca** decide nada. `role === 'admin'` dice cómo se llama alguien, no a
qué empresa pertenece.

### El shell interno

Stack propio en `/internal`. Un empleado conserva **todas** sus pestañas de
cliente: nadie es redirigido a un panel tras iniciar sesión, la tienda sigue
funcionando, y quien también compra ahí sigue comprando.

El home se construye desde las capabilities **frescas**. Un módulo que la persona
no tiene **no se dibuja** — ni siquiera atenuado: enumerar lo que a alguien le
falta le describe la estructura de la empresa, y no lo preguntó.

Los módulos que sí tiene pero que la app aún no implementa se dicen en voz alta.
Alguien con solo `inventory.view` tiene acceso real a algo sin pantalla móvil, y
callarlo le haría concluir que la app está rota en vez de incompleta.

### Tipos separados por audiencia

`InternalSalesOrder` **no** es `Order`. El contrato de cliente omite teléfono,
documento y dirección a propósito; el interno los necesita porque alguien tiene
que llamar y alguien tiene que enviar. Ensanchar el tipo compartido significaría
que un día una pantalla de cliente renderiza un campo que nunca debió tener, y
nada en el sistema de tipos objetaría.

### Cache por audiencia

`['tenant', slug, 'user', id, 'internal', …]`. El segmento se declaró en M4 sin
usuario; M6 es su primer consumidor. Un pedido interno y uno de cliente con el
**mismo id** producen claves distintas, que es justo la colisión peligrosa.

Se reconocen como privadas **por su forma**, así que el logout las desaloja sin
que nadie tuviera que registrarlas.

## Inventario interno (M7A)

### DEC-MOBILE-010 — La sucursal es una tercera puerta, y su negativa es un 404

**Fecha:** 2026-09-01 (M7A) · **Estado:** ACEPTADA

**Decisión.** El módulo de inventario trata la sucursal como una dimensión de
acceso propia, al mismo nivel que la pertenencia y la capability. Un `branch_id`
en la URL o en el cuerpo es un **selector**, nunca una autoridad, y el rechazo
del servidor —**404**, no 403— se traduce a su propio error,
`BranchOutOfScopeError`.

**Motivo.** El stock solo existe en un lugar. Tener `inventory.view` en una
empresa responde *qué* puedes hacer; `MembershipBranchAccess` responde *dónde*, y
son dos preguntas con dos respuestas. El backend contesta 404 a una sucursal
ajena para que nadie pueda barrer ids y levantar el mapa de tiendas de su
empresa; si la app tradujera ese 404 al mismo error que usa para «no perteneces
a esta empresa», le diría a alguien que perdió toda su membresía cuando solo tocó
una tienda que no es suya.

**Consecuencias.**
- La distinción se hace por lo que la app **preguntó** (`hadBranch`), no por lo
  que el servidor respondió: el servidor manda el mismo 404 a propósito.
- `parseBranchParam` acepta enteros positivos y nada más. No valida acceso —
  no puede— y su docstring lo dice para que nadie lo confunda con una comprobación.
- Un miembro con `SELECTED` y cero sucursales asignadas ve un `EmptyState`, no un
  error: es un estado legítimo de la empresa.
- El selector se dibuja desde `available_branches` del servidor, nunca desde una
  lista cacheada.

### DEC-MOBILE-011 — La sucursal forma parte de la clave de cache

**Fecha:** 2026-09-01 (M7A) · **Estado:** ACEPTADA

**Decisión.** Las claves de inventario llevan la sucursal como elemento propio, y
«todas las que puedo ver» (`null`) es una ranura distinta de la sucursal cero.

**Motivo.** La misma persona preguntando por dos tiendas está haciendo dos
preguntas distintas. Sin la sucursal en la clave, cambiar de tienda leería los
números de la anterior y los pintaría bajo el nombre de la nueva — una cifra
equivocada con aspecto de autoridad, que es peor que no tener cifra.

**Consecuencias.**
- Todo el módulo cuelga de un prefijo común (`internalInventoryRoot`), de modo que
  un movimiento invalida resumen, stock y Kardex de una vez. Parchear tres formas
  a mano para ahorrar un refetch es como una pantalla acaba mostrando un total que
  no cuadra con las filas de debajo.
- Las claves siguen siendo privadas por forma, así que el logout las desaloja sin
  registrarlas en ningún sitio.

### DEC-MOBILE-012 — Un ajuste manda intención, nunca un resultado

**Fecha:** 2026-09-01 (M7A) · **Estado:** ACEPTADA

**Decisión.** El formulario y el tipo `StockAdjustmentInput` describen lo que
**se movió**: producto, sucursal, tipo, cantidad positiva y motivo. No existe
campo para el stock final, ni en la UI, ni en el tipo, ni en el cuerpo del POST.

**Motivo.** Un total calculado en un teléfono es una afirmación sobre un número
que otra persona puede estar cambiando en el mismo instante. El servidor toma el
lock, aplica el signo según el tipo, escribe la línea de Kardex y devuelve el
resultado; la app lo lee de la respuesta.

**Consecuencias.**
- Los tipos ofrecidos reflejan `StockMovement.MANUAL_TYPES`. `sale_exit` y las
  transferencias no aparecen: los produce el servidor, y una transferencia
  escrita a mano por un solo lado es stock que se desvanece.
- Un **400** es una respuesta de negocio, no un fallo. `StockAdjustmentRejectedError`
  conserva las palabras del servidor en lugar de sustituirlas por un mensaje
  genérico.
- La mutación no reintenta: un POST repetido es un segundo movimiento, y el
  Kardex tendría dos líneas para un solo hecho físico.
- Un test estructural lee el código sin comentarios y falla si aparece
  `quantityAfter` o `new_quantity` en cualquier archivo del módulo.

### DEC-MOBILE-013 — El producto se elige del stock que el servidor ya devolvió

**Fecha:** 2026-09-01 (M7A) · **Estado:** ACEPTADA

**Decisión.** El formulario de ajuste no tiene un campo de texto para el slug del
producto. Se elige de la lista de stock, y esa elección trae producto y sucursal
juntos.

**Motivo.** Un campo libre invita a adivinar: slugs de otras empresas, sucursales
que no son suyas. El servidor los rechazaría —404 en ambos casos— pero la app
estaría animando a probar. Elegir de lo que ya se devolvió garantiza que las dos
mitades existen, van juntas y pertenecen a quien pregunta.

**Consecuencias.**
- El flujo tiene dos pasos: elegir qué y dónde, luego decir qué pasó.
- Un producto sin fila de stock en ninguna sucursal visible no es alcanzable
  desde la app. Es una limitación real y está anotada como deuda.

## Design system tenant-aware (UI7)

### DEC-MOBILE-014 — La plataforma no tiene color propio; el tenant sí

**Fecha:** 2026-09-01 (UI7) · **Estado:** ACEPTADA

**Decisión.** La paleta base del design system es **acromática**. El color viene
del tenant, por BR-006, y se aplica a exactamente cuatro tokens: `accent`,
`accentText`, `accentSurface` y `textOnAccent`.

**Motivo.** `src/theme/colors.ts` declaraba como fuente de verdad el documento
de marca de la empresa piloto y cargaba su paleta —dorado incluido— como base
del sistema. Correcto para una app de una sola tienda; en un SaaS significa que
la empresa piloto es la identidad por defecto de cualquier build, y que un
segundo cliente hereda el dorado de un competidor salvo que alguien se acuerde
de sobreescribirlo. Un fallback no es una decisión de producto: es la decisión
que se toma cuando nadie decide.

**Consecuencias.**
- El dorado del piloto vive en `domain/company/pilot-brand.ts`, junto al resto
  de su identidad. Un test comprueba que ese hex no aparece en la paleta base.
- La app **abre acromática** y toma el color del tenant cuando la marca
  resuelve. La alternativa es retener la UI esperando la red, o destellar un
  color que pertenece a quien compiló el fixture.
- `useCompanyBrand` pasa a un scope de cache **público**, sin sesión, para que
  el tema pueda leerlo: `AppThemeProvider` vive por encima de `AuthProvider`,
  porque auth se dibuja con el tema.
- Un color de marca imposible de parsear devuelve los tokens base sin tocar. No
  es un crash y no es una pantalla en blanco.

### DEC-MOBILE-015 — La accesibilidad conserva la autoridad sobre la marca

**Fecha:** 2026-09-01 (UI7) · **Estado:** ACEPTADA

**Decisión.** El color de un tenant se aplica **exacto** como relleno, y se
**deriva** allí donde tiene que leerse. La rampa de estado, el texto, los bordes
y el fondo del botón primario quedan fuera de su alcance.

**Motivo.** Un color de marca lo elige quien elige una identidad, no quien audita
contrastes. El dorado del piloto sobre blanco da 2.10:1 — por debajo incluso del
3:1 de texto grande. La respuesta del sistema no es rechazar el color, sino
mantener la identidad donde la identidad pertenece —rellenos, marcas, énfasis—
y calcular la variante legible en vez de suponerla.

**Consecuencias.**
- `src/theme/contrast.ts`: luminancia relativa, ratio WCAG, composición alfa y
  una caminata hacia negro o blanco que preserva el tono todo lo posible.
- `accentText` se corrige contra los **dos** fondos sobre los que puede caer: la
  página y el lavado de acento detrás de una `Badge`. El lavado está teñido hacia
  la marca, así que siempre es el más difícil de los dos.
- `textOnAccent` se elige midiendo, no por convención: un amarillo pastel con
  etiqueta blanca es el botón ilegible clásico.
- El contraste se mide **después** de componer la transparencia. Medir el color
  crudo es cómo una paleta «revisada» sigue enviando una etiqueta que no se lee.
- **El color de estado no está en venta.** Una tienda cuya marca sea roja no
  puede acabar con una insignia «entregado» roja.
- **El botón primario sigue siendo tinta o blanco.** Es la superficie más crítica
  en contraste de la app.
- El tema expone un `TenantAccentReport` con los ratios resultantes, para que un
  test —y un futuro panel de desarrollo— pueda comprobarlo en vez de confiar.

### DEC-MOBILE-016 — El material se nombra; el desenfoque es la mejora

**Fecha:** 2026-09-01 (UI7) · **Estado:** ACEPTADA

**Decisión.** El sistema nombra cuatro **materiales** —`chrome`, `card`,
`raised`, `overlay`— y cada uno trae un `fallbackColor` opaco. `GlassSurface`
está escrito fallback primero: la versión esmerilada es la rama, no la base.

**Motivo.** Un token de color no puede describir una capa translúcida, porque el
resultado depende de la plataforma, de los ajustes de accesibilidad y de si hay
algo detrás del panel. Y tres situaciones ordinarias apagan el efecto: Android
—donde el desenfoque eficiente exige SDK 31+ y un `BlurTargetView` detrás de cada
panel—, «Reducir transparencia», y cualquier superficie que se repita en una
lista. Un diseño que solo funciona con el desenfoque encendido es un diseño roto
en tres situaciones normales.

**Consecuencias.**
- Un test verifica que el texto principal pasa AA sobre el fallback de los cuatro
  materiales en los dos esquemas.
- `GlassSurface` es el único módulo que importa `expo-blur`; un test estructural
  lo vigila, así que apagar el efecto es una prop y no una auditoría.
- `Card` es sólida por defecto. Un panel desenfocado por fila es una pasada de
  composición por fila.
- Los materiales **no se tiñen con la marca**: están hechos de la página. Una
  tarjeta teñida de marca es un todo teñido de marca, y el acento deja de
  significar algo.
- El filo especular es **una hairline, no un gradiente**: un gradiente por panel
  es una subida de textura por panel.

### DEC-MOBILE-017 — Si el chrome flota, el shell paga el hueco

**Fecha:** 2026-09-01 (UI7) · **Estado:** ACEPTADA

**Decisión.** La barra de pestañas y las barras de navegación son transparentes
y el contenido pasa por debajo. `Screen` lee `BottomTabBarHeightContext` y
`HeaderHeightContext` y acolcha por la altura real de cada una.

**Motivo.** Un material esmerilado sobre nada es un rectángulo gris: sin
contenido debajo, no hay nada que desenfocar. Pero en cuanto la barra flota,
cada pantalla esconde su última fila detrás de ella. Resolverlo en el shell lo
resuelve una vez; resolverlo en las pantallas son treinta sitios adivinando 49 o
56 puntos, y el primero que se olvide es un bug que nadie relaciona con esto.

**Consecuencias.**
- Se leen los **contextos**, no `useBottomTabBarHeight()` / `useHeaderHeight()`:
  esos hooks lanzan fuera de su navegador, y `Screen` también se usa en la pila
  de auth y en cada pantalla empujada. `undefined` es una respuesta válida que
  significa «aquí no hay barra».
- La altura del header **ya incluye** el inset de la barra de estado, así que
  sustituye a `insets.top` en vez de sumarse.
- Las tres pilas comparten `glassStackScreenOptions`. Antes cada una deletreaba
  sus propios colores de header, que es como dos acabaron distintas de la
  tercera.
- **Deuda:** en pantallas con su propia `FlatList` el hueco se aplica al
  contenedor, así que el viewport termina encima de la barra en lugar de que las
  filas viajen por debajo. Menos efecto, correcto sin editar cada lista.

## Servicio técnico (M8)

### DEC-MOBILE-018 — Una reparación de cliente y una orden de taller son dos tipos

**Fecha:** 2026-09-01 (M8) · **Estado:** ACEPTADA

**Decisión.** `@/domain/repairs` describe lo que ve un CLIENTE.
`@/domain/internal/service-types` describe lo que ven las personas que trabajan
en el taller. Son tipos distintos, con repositorios distintos y namespaces de
caché distintos, sobre el mismo `RepairOrder` del servidor.

**Motivo.** El contrato de cliente omite las notas internas, la condición física
anotada en recepción, los accesorios, el historial de asignaciones, la identidad
del técnico y los comentarios de cada evento. La tentación es siempre escribir
`if (isStaff)` dentro de un serializer o de un tipo compartido; eso está a un
refactor de devolverle a un cliente la nota privada de un técnico, y el fallo es
silencioso. Es la misma llamada que hizo M6 para pedidos.

**Consecuencias.**
- La duplicación es la propiedad de seguridad, no un defecto a refactorizar.
- Un test estructural comprueba que el mapeador de cliente no puede exponer un
  campo interno aunque un payload futuro lo traiga.
- Las claves de caché están separadas: la misma reparación tiene dos ranuras,
  una por audiencia.

### DEC-MOBILE-019 — El ciclo de vida es el del servidor, incluidas sus palabras

**Fecha:** 2026-09-01 (M8) · **Estado:** ACEPTADA

**Decisión.** Mobile no tiene tabla de transiciones. El detalle interno dibuja
`availableTransitions` tal cual llega, y la etiqueta de cada estado es la que
manda el servidor para ese tenant. El mapa local de etiquetas queda como
respaldo para un payload que no traiga ninguna, nunca como preferencia.

**Motivo.** Este módulo llegó con una propuesta de Mobile de **siete** etapas y
el backend implementó **cuatro**, porque las otras tres necesitan módulos que no
existen. Si la app hubiera conservado su tabla, habría ofrecido botones para
estados que el servidor rechaza, y la deriva se lee como app rota en vez de como
política. Lo mismo con las etiquetas: una empresa que renombró «Recibido» a «En
mostrador» tomó una decisión, y una tabla local la contradiría en silencio.

**Consecuencias.**
- `REPAIR_STAGES` bajó de siete entradas a tres más `cancelled`.
- `Repair.id` pasó de string a número: Django reparte claves primarias enteras,
  y el id era string solo mientras el dato era un fixture que elegía el suyo.
- `quotedTotal` desapareció. No hay cotización hasta M9, y un campo que siempre
  vale null es una promesa que el producto no ha hecho.
- La línea de tiempo dejó de ser una escalera fija con el futuro pre-dibujado:
  ahora son los eventos que ocurrieron. Dibujar «Entregado — pendiente» sería
  prometer un paso que esta versión no puede dar.
- Un test estructural falla si aparece `TRANSITIONS` en el módulo.

### DEC-MOBILE-020 — La recepción manda una intención, y el servidor la identidad

**Fecha:** 2026-09-01 (M8) · **Estado:** ACEPTADA

**Decisión.** El formulario de recepción no tiene campo para el número de orden,
el estado, la empresa, quién recibió el equipo ni cuándo. El cliente se busca, no
se lista; el equipo se elige de lo que el servidor devolvió, o se registra.

**Motivo.** Tener un campo es poder rellenarlo. La única garantía de que un
cliente no fija su propio número de orden es que no exista dónde escribirlo — la
misma razón por la que el ajuste de inventario de M7A no tiene «stock final».

Y «descárgame todos los clientes de esta empresa» no es una petición que una
recepción necesite hacer nunca: el endpoint está construido para devolver los
últimos cuando no hay término de búsqueda.

**Consecuencias.**
- No hay campo de texto para un id de equipo: escribirlo a mano sería invitar a
  adivinar la propiedad de otra persona, con el servidor respondiendo 404
  mientras la app anima a intentarlo.
- Los candidatos a técnico los da el servidor. Esta app no puede averiguar quién
  es personal de una empresa, y no tiene por qué sostener una lista de usuarios
  para intentarlo.
- Ninguna mutación reintenta ni se encola offline: una orden repetida es una
  segunda orden, una transición repetida una segunda fila de historial.
- Un test estructural comprueba que el payload de equipo no declara ningún campo
  de credencial — ni PIN, ni patrón, ni Apple ID.

### DEC-MOBILE-021 — Aprobar no es pagar, y la app no finge que sí

**Fecha:** 2026-09-01 (M9) · **Estado:** ACEPTADA

**Decisión.** Responder una cotización manda `{decision, reason?}` y nada más. No
hay importe, ni identidad, ni fecha, ni canal en el cuerpo. La pantalla no
muestra ningún paso de pago, y la tarjeta no reutiliza un solo componente del
checkout.

**Motivo.** Una cotización aprobada autoriza un trabajo; no cobra nada, no
reserva stock y no crea un pedido. Un `Order` de e-commerce y un `RepairOrder`
son objetos distintos con vidas distintas, y la manera de acabar mezclándolos es
empezar por un botón que se parece.

Y tener un campo es poder rellenarlo — la regla de DEC-MOBILE-020, aplicada al
único write que hace un cliente en toda esta app. La garantía de que nadie
aprueba a un precio que no era es que no existe dónde escribir un precio.

**Consecuencias.**
- El error `409` es de primera clase: `QuoteAlreadyDecidedError`, con su propio
  mensaje. Es el caso real, no el raro — el mostrador contesta por teléfono.
- La invalidación va en `onSettled`, no en `onSuccess`. Quien pierde la carrera
  tiene que acabar mirando el estado verdadero, y eso solo pasa si el fallo
  también refresca.
- Nada reintenta. Un reintento es la app contestando por segunda vez en nombre de
  alguien que contestó una.
- El `reason` que escribe el cliente no vuelve nunca en la respuesta que él lee.

### DEC-MOBILE-022 — El taller pone precios; el servidor hace las cuentas

**Fecha:** 2026-09-01 (M9) · **Estado:** ACEPTADA

**Decisión.** Una línea de cotización se manda con tipo, descripción, cantidad y
precio unitario. `line_total`, `subtotal`, `tax_amount` y `total` son respuesta.
Los importes viajan como string decimal y se parsean en el punto de dibujo.

**Motivo.** Es DEC-MOBILE-012 otra vez: un total calculado en el teléfono es una
afirmación sobre un número que otro está cambiando. Con dinero además hay una
segunda razón — la aritmética en coma flotante sobre `'4899.00'` acaba en un
céntimo de diferencia, y ese céntimo lo ve un cliente en una pantalla y un
contable en un informe.

`is_expired` y `can_be_decided` siguen la misma regla, y por eso la app exige que
sean estrictamente `true`. El reloj de un teléfono no decide si una oferta sigue
abierta.

**Consecuencias.**
- `service.diagnostic.manage` es una capability nueva, separada de
  `service.orders.manage`: mover una orden y ponerle precio a un trabajo son dos
  autoridades, y un taller puede querer dar una sin la otra.
- Una cotización enviada no se edita: se cancela y se hace otra con revisión
  nueva. La app dibuja `is_editable`, no lo deduce.
- `waiting_approval` desapareció de `available_transitions`, y la app no se
  enteró — precisamente porque DEC-MOBILE-019 le quitó la tabla. Publicar es
  ahora el camino hacia adelante en esa pantalla.
- Un test estructural falla si aparece aritmética sobre un importe en cualquier
  archivo de M9.

### DEC-MOBILE-023 — Un estado que esta app no conoce se muestra igual

**Fecha:** 2026-09-02 (M10) · **Estado:** ACEPTADA

**Decisión.** `toRepairStatus` deja de coaccionar. Un código desconocido llega
intacto, se dibuja con la **etiqueta del servidor** y un tono neutral, y no
recibe posición en la escalera de progreso. Solo un estado **ausente** cae a
`received`.

**Motivo.** La versión anterior convertía cualquier código no reconocido en
`received`, con un comentario que lo llamaba la dirección segura del error. No
lo era, y se demostró: cuando M9 desplegó `approved` antes de que esta app lo
conociera, una reparación recién aprobada se dibujaba como «Recibido». A alguien
le dijimos que su equipo había retrocedido.

La lección real no era «no adivines hacia adelante» sino **no adivines**. El
servidor manda la etiqueta por empresa desde M8, así que para un estado
desconocido ya existe la respuesta honesta: la palabra del taller, sin opinión
nuestra encima.

**Consecuencias.**
- `RepairStatus` es `KnownRepairStatus | (string & {})`: autocompletado para lo
  conocido, sin cerrar la puerta a lo que viene.
- `repairStageIndex` devuelve -1 para lo desconocido, así que ninguna barra de
  progreso lo coloca en ninguna parte.
- `isRepairOpen` lo cuenta como ABIERTO: un estado que esta app nunca ha oído no
  es evidencia de que algo terminó.
- Sin etiqueta del servidor se muestra el código crudo. Es feo a propósito: una
  laguna de contrato debería verse, no taparse con una palabra inventada.
- El backend puede desplegar un estado sin que esta app lo contradiga hasta la
  siguiente release.
- Cuatro tests que fijaban el comportamiento viejo se actualizaron conservando
  la lección; ninguno se borró.

### DEC-MOBILE-024 — Una pieza sale de una estantería una sola vez

**Fecha:** 2026-09-02 (M10) · **Estado:** ACEPTADA

**Decisión.** Consumir un repuesto manda `{quote_item_id, quantity,
idempotency_key}` y nada más. La clave se acuña **una vez por intención**, se
guarda en un `ref` y se reenvía idéntica en cada reintento manual. Ninguna
mutación de M10 reintenta sola y no hay cola offline.

**Motivo.** Es la primera escritura de esta app que cambia un objeto físico. Un
timeout seguido de un toque no puede producir dos baterías fuera del almacén, y
la clave es lo único que separa esos dos mundos — pero solo si es la MISMA
clave. Una guardada en `useState` se regenera en un re-render, que es
exactamente el momento en que hace falta que no cambie.

El reintento automático se descarta por separado: la idempotencia del servidor
protege al servidor, no la intención de la persona. Repetir sin que nadie lo
pida es la app actuando en nombre de alguien.

**Consecuencias.**
- El generador salió de `use-checkout` a `@/domain/idempotency`. Un mecanismo
  cuyo trabajo es impedir una doble escritura es lo último que debería existir
  dos veces en dos versiones sutilmente distintas; un test estructural
  comprueba que solo hay una definición.
- La app **no resta stock en pantalla**. Mostrar `disponible - cantidad` sería
  afirmar un número sobre una estantería que otra caja puede estar cambiando.
  Después de escribir se vuelve a preguntar.
- 409 tiene dos significados y se distinguen por el `code` que manda el
  servidor, no por el castellano: ya existen tres plantillas del mismo mensaje
  de stock. `ApiError` ganó un campo `code`.
- Un consumo fallido no cambia el estado de la orden. Pausar por repuestos es
  una acción que alguien toma habiendo visto el error.
- Consumir invalida el caché de **Inventario** además del de Servicio. La
  invalidación cruza el módulo; los datos no.

## Estados de pantalla

Cada pantalla con datos contempla los cinco: **LOADING · SUCCESS · EMPTY ·
ERROR · OFFLINE**. `LoadingState`, `EmptyState` y `ErrorState` viven juntos en
`src/design-system/states.tsx` precisamente para que se note cuando una pantalla
solo ha resuelto algunos.

`ErrorState` distingue "sin conexión" de "el servidor falló": son acciones
distintas para el usuario, y juntarlas manda a alguien a reiniciar su router por
un error 500.

## Decisiones técnicas

| Decisión | Motivo |
|---|---|
| Expo Router file-based | Es el router de SDK 57. Las rutas tipadas (`typedRoutes`) detectan un enlace roto en compilación. |
| Tabs estables de Expo Router (`js-tabs`) | DEC-MOBILE-001: la API `unstable` es alpha y su `hidden` remonta el navigator. |
| Feature-gating con `href: null` | Oculta la pestaña sin reiniciar el estado de navegación. |
| TanStack Query como único estado de servidor | Evita duplicar datos remotos en un store cliente. |
| React Hook Form + Zod | Un solo esquema produce la validación y el tipo TypeScript. |
| Tipografía del sistema | Es la única que trae todos los pesos y tamaños ópticos que Dynamic Type necesita. |
| Repositorios por feature | La única forma de avanzar sin backend sin acabar con arrays dentro de las pantallas. |
| Repositorios **nulables** | Un build que no puede servir mocks no debe tener de dónde sacarlos. |
| Config estricta por defecto en release | Una variable olvidada no puede volver permisivo un build de tienda. |
| Sin `X-Company-Slug` en el cliente | BR-002 no está aprobado; no se finge un contrato inexistente. |
| Auth mock imposible en production | Una app distribuible no acepta credenciales que no puede verificar. |
| Access token solo en memoria | Corta vida; el Keychain es para lo que debe sobrevivir al proceso. |
| `isBackendAuthAvailable` como constante | Una variable de entorno permitiría afirmar que hay contrato sin código que lo hable. |
| Persistir el refresh **antes** de instalar el access | Tras la rotación el token viejo ya está en blacklist; un fallo de escritura después sería invisible hasta la expiración. |
| Epoch en provider y coordinator | Es lo que impide que un resultado tardío resucite una sesión cerrada. |
| Conectividad con tres estados | `unknown` es real: avisar de "sin conexión" antes de preguntar al sistema es una falsa alarma. |
| Una sola suscripción de red | Una por pantalla serían N listeners nativos y N cleanups que olvidar. |
| Cache con namespace de tenant y usuario | DEC-MOBILE-002: una fuga de cache no necesita un bug de backend. |
| Sin persistencia de query cache | DEC-MOBILE-003: falta cifrado, partición en disco y retención. |
| Sin cola de mutaciones offline | Aprobar o cancelar son decisiones del servidor, no promesas del cliente. |
| Retry solo de lo transitorio | Reintentar un 403 o un 429 no lo arregla y empeora el throttle. |
| Catálogo real vía `/api/v1/` con tenant en la ruta | Mobile llega a un host de API compartido: sin selector explícito, o no hay catálogo o es el de otra empresa. |
| Catálogo legacy eliminado, no apagado | Un segundo camino "temporal" a los mismos datos es el que acaba usándose. |
| Sin catálogo cuando falta tenant o API url | Caer a la empresa piloto serviría el catálogo del piloto dentro de la app de otra empresa. |
| Ese fallo no cae a mocks | Productos inventados delante de un cliente real es peor que una pantalla vacía que lo diga. |
| Guardia repetida antes de la llamada de red | El composition root es un solo punto de decisión, y por tanto un solo punto de fallo. |
| Clasificación de timeout por flag, no por excepción | La forma del error de un abort no es portable entre runtimes. |
| `Animated` en vez de Reanimated para el Skeleton | Una opacidad en bucle no necesita worklets. |
| `noUncheckedIndexedAccess` | Encontró errores reales durante M0: indexar un array es `T \| undefined`. |
| Un enlace es intención, no autorización | DEC-MOBILE-004: una URL se reenvía; una sesión no. |
| Destino pendiente solo en memoria | Persistirlo se lo entregaría a la siguiente persona que use el dispositivo. |
| Allowlist de rutas, no denylist | La ruta hostil que nadie anticipó es justo la que se usa. |
| Rechazar el enlace con parámetros prohibidos, no limpiarlo | Limpiar enseña al emisor que el patrón funciona. |
| `TRUSTED_HTTPS_HOSTS` vacío | DEC-MOBILE-005: no hay dominio verificado; confiar en uno inventado sería peor. |
| Un solo mensaje de enlace no disponible | Distinguir "no existe" de "no es tuyo" es un oráculo de existencia. |
| Auth nativa por email, no por username | El contrato web pide un username que el formulario le generó al usuario; el nativo pide lo que la persona sabe. |
| Persistir el refresh antes de instalar el access | El servidor ya invalidó el anterior: un crash entre medias sería invisible hasta la expiración. |
| Red caída ≠ sesión cerrada | Firmar la salida de quien entra en un ascensor es peor que pedirle que reintente. |
| Contrato implementado ≠ API configurada | Una release sin URL mostraría un login cuyo botón solo puede fallar. |
| Perfil no persistido | Un perfil cacheado es una segunda verdad que caduca en silencio. |
| Registro y reset ocultos en modo backend | BR-001B no existe; un formulario que solo puede fallar enseña que la contraseña está mal. |
| Catálogo público, compra autenticada | DEC-MOBILE-006: exigir cuenta antes de enseñar lo que se vende pierde al cliente antes de abrir. |
| Cliente e interno como audiencias separadas | DEC-MOBILE-007: `Customer` y `Membership` son relaciones distintas en el backend, y una persona puede tener ambas. |
| Segmento de audiencia en las claves de cache | Dos audiencias compartiendo clave harían que datos internos acabaran en una vista de cliente. |
| Capabilities solo para presentación | DEC-MOBILE-008: si el servidor creyera al cliente, la autorización viviría en el dispositivo del atacante. |
| Un único grafo de tokens (`auth-runtime`) | Dos coordinators sobre la misma entrada del Keychain rotan el refresh uno contra otro y matan la sesión. |
| Sin filtrado de respuestas en el cliente | Recortar filas ajenas de una respuesta significa que ya se recibieron. |
| Carrito local, servidor como autoridad | DEC-MOBILE-009: un número guardado en un teléfono no es un precio que la tienda haya aceptado. |
| `Cart` separado de `Order` | Uno es intención mutable; el otro, historia con precios congelados. |
| Dinero en céntimos enteros | `4500.00 × 3` en flotantes muestra 13499.999999999998. |
| Carrito en AsyncStorage, no en SecureStore | No hay credencial ni autorización dentro; el Keychain es para secretos. |
| El carrito sobrevive al login y al logout | Quien entra para pagar y falla no debe perder lo que eligió. |
| No vaciar hasta el pago confirmado | Volver del navegador solo prueba que se cerró una pestaña. |
| Stripe Checkout alojado, sin campo de tarjeta | Que los datos de tarjeta no toquen el cliente es la razón de que exista. |
| Validar la URL de pago aunque venga del servidor | Es el único campo de una respuesta que se convierte en una acción. |
| Contextos de acceso conservados, no descartados | El backend los enviaba desde M4 y Mobile los tiraba; el área interna es imposible sin ellos. |
| Dos fuentes: sesión para ofrecer, servidor para abrir | Los roles cambian mientras una sesión sigue viva. |
| `hasUxCapability`, sin `can()` ni `isAllowed()` | Esos nombres invitan a leer la respuesta como permiso. |
| Tipos internos separados de los de cliente | Ensanchar el tipo compartido acabaría con datos internos en una pantalla de cliente. |
| Módulos sin permiso no se dibujan, ni atenuados | Enumerar lo que a alguien le falta describe la estructura de la empresa. |
| Módulos con permiso y sin pantalla se dicen | Un tile que no lleva a nada se lee como app rota, no como incompleta. |
| La sucursal es la tercera puerta | DEC-MOBILE-010: el stock existe en un lugar; un permiso de empresa no dice en cuál. |
| `BranchOutOfScopeError` aparte del de membresía | Decir "perdiste el área interna" cuando solo se tocó una tienda ajena es la alarma equivocada. |
| Sucursal dentro de la clave de cache | DEC-MOBILE-011: sin ella, cambiar de tienda muestra los números de la anterior bajo el nombre de la nueva. |
| El ajuste manda intención, no resultado | DEC-MOBILE-012: un total calculado en el teléfono es una afirmación sobre un número que otro está cambiando. |
| Cero sucursales asignadas es `EmptyState`, no `ErrorState` | Es un estado legítimo de la empresa, no una petición fallida. |
| Transferencias y recuentos fuera de la app | El backend no los expone en v1 porque son flujos de varios pasos; aplanarlos sería inventar semántica. |
| La plataforma no presta color; el tenant lo pone | DEC-MOBILE-014: un fallback no es una decisión de producto, es la que se toma cuando nadie decide. |
| Cuatro tokens se mueven con la marca, y ni uno más | El color de estado es significado; el significado no está en venta. |
| El contraste se calcula, no se supone | DEC-MOBILE-015: el dorado del piloto sobre blanco da 2.10:1. |
| El botón primario nunca toma el color de marca | Es la superficie más crítica en contraste de toda la app. |
| Materiales con fallback opaco | DEC-MOBILE-016: Android, «reducir transparencia» y las listas apagan el desenfoque. |
| Un solo módulo importa `expo-blur` | Apagar el efecto tiene que ser una prop, no una auditoría de treinta archivos. |
| `Card` sólida por defecto | Un panel desenfocado por fila es una pasada de composición por fila. |
| El shell paga el hueco del chrome flotante | DEC-MOBILE-017: treinta pantallas adivinando 49 o 56 puntos es un bug esperando. |
| Reparación de cliente y orden de taller son dos tipos | DEC-MOBILE-018: un `if (isStaff)` dentro de un tipo compartido acaba enseñando una nota privada. |
| Sin tabla de transiciones en el cliente | DEC-MOBILE-019: la propuesta tenía siete etapas y el servidor implementó cuatro. |
| La etiqueta del estado la manda el tenant | Una tabla local contradiría en silencio una decisión que la empresa tomó. |
| La recepción no tiene campo para el número ni el estado | DEC-MOBILE-020: tener un campo es poder rellenarlo. |
| Los candidatos a técnico los da el servidor | La app no puede saber quién es personal de una empresa, ni debe sostener una lista de usuarios. |
| Ninguna mutación de servicio reintenta | Una transición repetida es una segunda fila de historial para un solo hecho. |
| Aprobar no es pagar | DEC-MOBILE-021: un `Order` y un `RepairOrder` se mezclan empezando por un botón que se parece. |
| El cuerpo de una decisión tiene dos campos | Tener un campo para el importe es poder aprobar a un precio que no era. |
| Refrescar en `onSettled`, no en `onSuccess` | El mostrador contesta por teléfono; quien pierde esa carrera tiene que ver el estado verdadero. |
| El motivo del cliente no vuelve al cliente | Lo escribió; no tenerlo impide que un cambio futuro le enseñe a uno las palabras de otro. |
| Los importes son strings hasta el punto de dibujo | DEC-MOBILE-022: el céntimo que pierde un float lo ve un cliente y un contable. |
| `service.diagnostic.manage` aparte de `.manage` | Mover una orden y ponerle precio son dos autoridades distintas. |
| La caducidad la decide el servidor | El reloj de un teléfono no dice si una oferta sigue abierta. |
| Un estado desconocido se muestra tal cual | DEC-MOBILE-023: coaccionarlo dibujó «Recibido» sobre una reparación aprobada. |
| Solo un estado AUSENTE cae a `received` | Nada llegó, y una reparación empieza en algún sitio. |
| `repaired` sigue abierto | El técnico terminó; control de calidad y entrega no existen todavía. |
| La clave de idempotencia vive en un `ref` | DEC-MOBILE-024: en `useState` se regenera en el re-render en que hace falta que no cambie. |
| Un generador de claves, no dos | Un mecanismo contra la doble escritura no debe existir en dos versiones. |
| La app no resta stock en pantalla | Sería afirmar un número sobre una estantería que otra caja está cambiando. |
| 409 se distingue por `code`, no por el mensaje | Existen tres plantillas del mismo error de stock y ninguna es contrato. |
| Un consumo fallido no mueve el ciclo de vida | Un taller no debe descubrir su propio estado leyendo logs de error. |
| Invalidar cruza el módulo; los datos no | Servicio marca sucio el caché de Inventario y no lee ni un tipo suyo. |
| Sin Redux/MobX/Zustand | Nada lo justificaba todavía. |
