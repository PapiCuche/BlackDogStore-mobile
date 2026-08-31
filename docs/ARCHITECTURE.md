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
│                           authenticated-request.ts · endpoints/
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

### El gate del catálogo legacy (M0.2)

El catálogo era el caso peligroso porque **sí** tenía implementación real:

```ts
catalog: useMockData ? new MockCatalogRepository() : new ApiCatalogRepository()
```

Un solo `EXPO_PUBLIC_USE_MOCK_DATA=false` bastaba para apuntar un release al
catálogo legacy de Django — que es público, funciona, y devuelve **los productos
de todas las empresas** (verificado en `origin/master` `2624d478`). Se estaba
tratando *"no es mock"* como *"es seguro"*, y no son lo mismo.

`resolveLegacyCatalogPolicy` decide ahora la fuente, y **falla cerrado**:

| Fuente | Cuándo |
|---|---|
| `mock` | mocks activos |
| `legacy-api` | `development` + mocks off + `ENABLE_LEGACY_CATALOG=true` |
| `none` | todo lo demás — incluido cualquier release |

Dos capas, a propósito:

1. **Composition root** — un release no recibe repositorio de catálogo.
2. **`assertLegacyCatalogAllowed()`** — se ejecuta dentro del repositorio y de
   cada función de endpoint, justo antes de la red. Un sitio que decide es un
   sitio a un `refactor` de equivocarse; la segunda comprobación hace que una
   build bloqueada no pueda emitir la petición ni construyendo la clase a mano.

`ApiCatalogRepository` se renombró a **`LegacyApiCatalogRepository`**: el nombre
anterior parecía "el contrato API oficial del producto", y así es como algo así
acaba encendido en un release.

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
| Catálogo legacy bloqueado fuera de desarrollo | El endpoint estable no aísla por empresa: sería una fuga cross-tenant. |
| Guardia repetida antes de la llamada de red | El composition root es un solo punto de decisión, y por tanto un solo punto de fallo. |
| Clasificación de timeout por flag, no por excepción | La forma del error de un abort no es portable entre runtimes. |
| `Animated` en vez de Reanimated para el Skeleton | Una opacidad en bucle no necesita worklets. |
| `noUncheckedIndexedAccess` | Encontró errores reales durante M0: indexar un array es `T \| undefined`. |
| Sin Redux/MobX/Zustand | Nada lo justificaba todavía. |
