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
├── api/                    HTTP. client.ts · errors.ts · endpoints/catalog.ts
├── auth/                   Sesión: types · repositorio · mock · provider
├── config/                 env.ts (entorno) · integration-status.ts
├── design-system/          Componentes reutilizables. Barrel en index.ts
├── domain/                 Tipos y REGLAS. company · products · orders · repairs · customers
├── features/               Composiciones por feature (tarjetas, timeline, chips)
├── hooks/                  Hooks de datos (TanStack Query) + accesibilidad
├── providers/              AppProviders + configuración de QueryClient
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
- **`(tabs)`:** `NativeTabs` (`expo-router/unstable-native-tabs`) — `UITabBar`
  real en iOS, bottom navigation de Material en Android. Trae gratis el inset
  del home indicator, `minimizeBehavior` en iOS 26, scroll-to-top al retocar la
  pestaña, y el ripple/back de Android.
- **Detalles:** rutas hermanas de `(tabs)`, con header nativo, para que el gesto
  de retroceso y el título los gestione el sistema.
- **Iconos:** SF Symbols en iOS, Material Symbols en Android, desde una sola
  declaración en `src/design-system/icon.tsx`.

## Multiempresa

`CompanyBrand` (`src/domain/company/types.ts`) separa dos cosas que se confunden
con facilidad:

- **Branding de distribución** — varía por tenant: nombre, logo, colores,
  canales de soporte, `enabledFeatures`.
- **Reglas de negocio SaaS** — no varían: un pedido es un pedido, una reparación
  tiene el mismo ciclo, el dinero es dinero.

`enabledFeatures` gobierna de verdad: `(tabs)/_layout.tsx` construye el tab bar
a partir de él. Un tenant sin taller no compila una pestaña de Reparaciones que
luego se esconde — no la tiene.

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
| `NativeTabs` en vez de tab bar en JS | Safe areas, gestos y comportamiento del sistema correctos sin reimplementarlos. |
| TanStack Query como único estado de servidor | Evita duplicar datos remotos en un store cliente. |
| React Hook Form + Zod | Un solo esquema produce la validación y el tipo TypeScript. |
| Tipografía del sistema | Es la única que trae todos los pesos y tamaños ópticos que Dynamic Type necesita. |
| Repositorios por feature | La única forma de avanzar sin backend sin acabar con arrays dentro de las pantallas. |
| `Animated` en vez de Reanimated para el Skeleton | Una opacidad en bucle no necesita worklets. |
| `noUncheckedIndexedAccess` | Encontró errores reales durante M0: indexar un array es `T \| undefined`. |
| Sin Redux/MobX/Zustand | Nada lo justificaba todavía. |
