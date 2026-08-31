# Black Dog Store — Mobile

Aplicación iOS y Android de Black Dog Store, construida con Expo SDK 57, React
Native y TypeScript.

Este repositorio es **independiente** de `PapiCuche/BlackDogStore-web`. Mobile
consume contratos de la API de Django; **no modifica el backend ni la web**.
Cuando Mobile necesita algo del backend, se registra como propuesta en
[`docs/BACKEND_REQUIREMENTS.md`](docs/BACKEND_REQUIREMENTS.md).

> **Estado actual: M0 — Mobile Foundation.**
> La app es navegable de principio a fin, pero **no está integrada con el
> backend**. Todas las pantallas de datos corren sobre fixtures y lo indican en
> su propia interfaz. Ver [`docs/INTEGRATION_STATUS.md`](docs/INTEGRATION_STATUS.md).

---

## Requisitos

| | Versión | Nota |
|---|---|---|
| Node | 24.16.0 (probado) | ≥ 20 debería funcionar |
| npm | 11.13.0 (probado) | |
| **Xcode** | 16+ | **Obligatorio para iOS.** Desde la Mac App Store. |
| Android Studio | Ladybug+ | Para el emulador Android |
| JDK | 17 | Lo instala Android Studio |

No hace falta el **Apple Developer Program de pago** para desarrollar contra el
simulador de iOS.

**Solo iPhone.** `ios.supportsTablet` es `false`: M0 se diseñó y validó para
iPhone, y declarar soporte de iPad enviaría a una clase de dispositivo un layout
que nadie ha revisado. iPad será una capacidad explícita en una fase futura.

## Instalación

```bash
npm install
cp .env.example .env.local     # opcional en desarrollo local
```

## Desarrollo

```bash
npm start          # Metro + dev client
npm run start:clear # Metro limpiando la caché
npm run ios        # expo run:ios      — compila y abre el simulador
npm run android    # expo run:android  — compila y abre el emulador
```

Este proyecto usa **development builds** (`expo-dev-client`), no Expo Go. Expo Go
no puede cargar los módulos nativos que la app usa (`expo-secure-store`,
`expo-haptics`, native tabs).

### iOS Simulator

```bash
npm run ios                                   # dispositivo por defecto
npx expo run:ios --device "iPhone 17 Pro Max" # uno concreto
```

La primera compilación genera `ios/` con `expo prebuild` y ejecuta
`pod install`; tarda varios minutos. `ios/` y `android/` están en `.gitignore`:
son artefactos generados y **no se commitean**.

> ⚠️ **Requiere Xcode completo.** Con solo las Command Line Tools no hay
> simuladores instalados y `expo run:ios` falla. Comprobación:
> ```bash
> xcode-select -p       # debe apuntar a /Applications/Xcode.app/...
> xcrun simctl list devices available | grep iPhone
> ```
> Si apunta a `/Library/Developer/CommandLineTools`, instala Xcode y ejecuta:
> ```bash
> sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
> sudo xcodebuild -runFirstLaunch
> ```

### Alternativa: EAS Simulator Build

Si prefieres no compilar en local:

```bash
eas build --platform ios --profile ios-simulator
```

El perfil `ios-simulator` (en `eas.json`) produce un `.app` **sin firmar** para
el simulador — no necesita Apple Developer Program. Aun así, **instalar** ese
`.app` requiere un simulador local, es decir, Xcode.

> **No intentar builds firmadas para iPhone físico en esta fase.** El Apple ID
> actual no pertenece a un equipo del Apple Developer Program. Eso es un
> bloqueo administrativo, no un error de código.

### Android

```bash
npm run android
```

Requiere Android Studio con un AVD creado y `ANDROID_HOME` configurado:

```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator"
```

#### Predictive back: deshabilitado a propósito

`app.json` mantiene `android.predictiveBackGestureEnabled: false` (que es
también el default de Expo). **Es una decisión de compatibilidad, no estética.**

Esa opción escribe `android:enableOnBackInvokedCallback="true"` en el manifiesto
y opta a toda la app a la API de back de Android 13+. Pero quien posee la pila
de navegación aquí es `react-native-screens` (4.26.2), y su código Android usa
`OnBackPressedCallback` / `onBackPressed` — **no implementa `OnBackInvokedCallback`
en absoluto** (cero referencias a `onBackInvoked` o "predictive" en su fuente).

Activarlo daría, en el mejor caso, ningún beneficio visual —la animación
predictiva requiere `OnBackAnimationCallback`, que la librería no implementa— y
en el peor, regresiones en la navegación hacia atrás. Se reevalúa cuando
`react-native-screens` publique soporte.

## Variables de entorno

Copiar `.env.example` a `.env.local`. **Todo `EXPO_PUBLIC_*` se compila dentro
del bundle y es público.** Nunca poner secretos ahí.

| Variable | Default | Para qué |
|---|---|---|
| `EXPO_PUBLIC_API_BASE_URL` | derivada de Metro en dev | Raíz de la API de Django, sin barra final |
| `EXPO_PUBLIC_COMPANY_SLUG` | `blackdog` **solo en dev** | Tenant de este build (ver BR-002) |
| `EXPO_PUBLIC_USE_MOCK_DATA` | ver tabla | `false` apaga los mocks |
| `EXPO_PUBLIC_ENABLE_LEGACY_CATALOG` | `false` | Catálogo legacy **solo desarrollo** — ver abajo |
| `EXPO_PUBLIC_APP_ENV` | — | `staging` marca un build de release como no productivo |

### Regla a prueba de fallos

Una variable **ausente en un release se resuelve al valor estricto**, nunca al
permisivo. Un build de tienda no puede volverse permisivo porque alguien olvidó
una variable.

**Mocks** (`EXPO_PUBLIC_USE_MOCK_DATA`):

| Entorno | Sin definir | `=true` | `=false` |
|---|---|---|---|
| development | **mocks** | mocks | API |
| staging | **API** | mocks (opt-in explícito) | API |
| production | **API** | **API** (se rechaza) | API |

En **production los mocks están prohibidos**: no hay valor de la variable que
los active. Mostrar a un cliente una reparación o un pedido inventados no es un
error de configuración que queramos dejar alcanzable.

Además, las features sin backend (reparaciones, pedidos, marca) **no tienen
repositorio** en un build que no puede servir mocks: la pantalla muestra
"Próximamente", no una lista vacía.

**Tenant** (`EXPO_PUBLIC_COMPANY_SLUG`):

| Entorno | Sin definir |
|---|---|
| development | `blackdog` (piloto) — lo que hace que la app corra tras un `git clone` |
| staging / production | **error de configuración**, nunca el piloto |

Una app SaaS no debe convertirse silenciosamente en Black Dog Store porque falte
configuración. Un release sin tenant lo reporta en Perfil → Estado de
integración, y ninguna marca se renderiza.

**Entorno** (`EXPO_PUBLIC_APP_ENV`): sin definir en un release →
`production` (el más estricto de los dos).

### Catálogo legacy

`EXPO_PUBLIC_ENABLE_LEGACY_CATALOG` habilita los endpoints reales
`/api/products/` y `/api/categories/`. Existen, son públicos y funcionan — y en
el backend estable **no están aislados por empresa**:

```python
# ProductViewSet.get_queryset  @ origin/master 2624d478
Product.objects.select_related('category').prefetch_related('reviews').filter(is_active=True)

# CategoryViewSet
Category.objects.all()
```

Ninguno de los dos modelos tiene campo `company` en `master`. Un cliente SaaS
apuntado ahí recibiría el catálogo de **todas** las empresas: un riesgo
cross-tenant, aunque el endpoint sea público.

Por eso el catálogo real solo se activa cuando **las tres** condiciones se
cumplen a la vez:

```
appEnvironment === 'development'
  AND EXPO_PUBLIC_USE_MOCK_DATA=false
  AND EXPO_PUBLIC_ENABLE_LEGACY_CATALOG=true
```

| Entorno | mocks | flag legacy | Catálogo |
|---|---|---|---|
| development | ON | cualquiera | mocks |
| development | OFF | sin definir | **no disponible** |
| development | OFF | `true` | legacy (con aviso) |
| staging | OFF | `true` | **BLOQUEADO** |
| production | OFF | `true` | **BLOQUEADO** |

En staging y production el flag se **ignora** y se reporta como
`legacy-catalog-forbidden` en Perfil → Estado de integración. No es un
interruptor que un release pueda accionar.

Cuando el backend publique un catálogo tenant-safe estable (BR-002), este gate y
`LegacyApiCatalogRepository` se **eliminan**; no se adaptan.

### `localhost` significa cosas distintas según dónde corra el JS

| Entorno | Host de tu Mac |
|---|---|
| Simulador iOS | `localhost` |
| Emulador Android | `10.0.2.2` |
| Dispositivo físico | La IP LAN de la Mac (p. ej. `192.168.1.42`) |

Por eso `src/config/env.ts` **deriva el host del servidor de Metro** cuando la
variable está vacía **y solo en development**: Metro ya sabe con qué dirección
lo alcanzó el cliente. Un release sin URL configurada falla ruidosamente en la
primera petición en lugar de llamar a un servidor adivinado.

Para un dispositivo físico contra un Django local, el backend necesita esa IP en
`ALLOWED_HOSTS`. **Mobile no modifica el backend**: se solicita al equipo
Backend.

## Comprobaciones

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # expo lint
npm run test        # jest --watch
npm run test:ci     # jest --ci
npm run doctor      # npx expo-doctor@latest
npm run verify      # typecheck + lint + test:ci
```

### CI

`.github/workflows/mobile-ci.yml` corre en cada push a `main` y en cada pull
request hacia `main` (además de `workflow_dispatch` para lanzarlo a mano).

| Job | Qué hace |
|---|---|
| `verify` | `npm ci` → typecheck → lint → tests |
| `doctor` | `npx expo-doctor@latest` (`continue-on-error`: resuelve por red y no debe tumbar un PR sano) |
| `bundle` | `npx expo export` para iOS y Android — compila todo el grafo de rutas por Metro y Hermes |

**Sin Xcode, sin Android SDK, sin secretos y sin construir `.ipa`/`.apk`.** Las
builds nativas son otro workflow, con otras credenciales. Este solo cubre el
repositorio Mobile: Web tiene su propio equipo y su propio CI.

## Mocks

La app se desarrolla en paralelo al backend, así que las pantallas corren sobre
fixtures **en development**. Reglas:

- Los fixtures viven en `src/repositories/mock/fixtures.ts`, **fuera del árbol de
  componentes**. Ninguna pantalla contiene datos.
- `src/repositories/index.ts` es el único sitio que decide mock vs API — y desde
  M0.1 también decide si una feature tiene siquiera repositorio.
- Cada pantalla con datos de ejemplo **lo dice en la interfaz**
  (`MockDataNotice`). Un demo indistinguible de datos reales es cómo alguien
  concluye que una feature está integrada.
- **En release los mocks no se sirven** (ver "Regla a prueba de fallos"), y en
  production están prohibidos.
- **El catálogo real legacy tampoco se sirve en release** — ver "Catálogo
  legacy". Apagar los mocks NO equivale a tener un catálogo seguro.
- El estado real de cada feature está en `src/config/integration-status.ts`, que
  la app lee en tiempo de ejecución, y se ve en Perfil → Estado de integración.

Para probar contra la API real en desarrollo: `EXPO_PUBLIC_USE_MOCK_DATA=false`.

## Backend

Fuente de verdad: PostgreSQL → Django REST API → (Next.js | Mobile).

- Endpoints verificados: [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md)
- Propuestas de Mobile: [`docs/BACKEND_REQUIREMENTS.md`](docs/BACKEND_REQUIREMENTS.md)
- Autenticación: [`docs/MOBILE_AUTH.md`](docs/MOBILE_AUTH.md)

**Mobile nunca modifica el backend ni la web.** Si algo hace falta, se propone;
el equipo Backend decide.

Dos cosas que conviene tener presentes al leer esa documentación:

- **Código sin commitear no es contrato.** M0 documentó parte del backend
  leyendo un working tree local del repo Web que estaba en una rama de feature
  con cambios sin commitear. M0.1 re-verificó todo contra `origin/master` y
  etiquetó cada afirmación como `VERIFIED_STABLE_MASTER`,
  `OBSERVED_IN_PROGRESS` o `PROPOSED`.
- **`/api/v1/` es una propuesta** (BR-007), no algo que exista. El catálogo
  legacy `/api/products/` funciona hoy, pero **no está aislado por empresa** y
  por tanto no es el contrato SaaS de Mobile. Está bloqueado fuera de
  desarrollo.

## Seguridad

- Los tokens irán a `expo-secure-store` (Keychain / Keystore). **Nunca** a
  AsyncStorage. Los dos módulos están separados en `src/storage/` para que
  elegir mal exija importar mal.
- Todo `EXPO_PUBLIC_*` es público: está dentro del bundle.
- Nunca en el repositorio: `.env`, keystores, `.p8`, `.p12`, provisioning
  profiles, certificados, `credentials.json`. Todo cubierto por `.gitignore`.
- La app no guarda ni registra contraseñas.
- **Autenticación real: API_PENDING.** Ver `docs/MOBILE_AUTH.md`.
- **El access token nunca se persiste** — solo memoria. El refresh token sí, en
  Keychain/Keystore, y es la única credencial que se guarda.
- **Auth simulada imposible en production.** `development` usa mock, `staging`
  solo con opt-in explícito, `production` nunca: muestra "acceso no disponible"
  en lugar de un formulario que no puede funcionar.
- Un token nunca llega a un log ni a un mensaje de error (`src/auth/redact.ts`).
- Un `Authorization: Bearer` no puede salir hacia `/api/auth/*`, `/api/admin/*`,
  `/api/me/*` ni `/api/products/*` (`src/api/api-scope.ts`).

## EAS

Perfiles en `eas.json`:

| Perfil | Para qué |
|---|---|
| `development` | Development build con dev client, distribución interna |
| `ios-simulator` | Hereda de `development`, `.app` sin firmar para el simulador |
| `preview` | Build interno de prueba |
| `production` | Release, con `autoIncrement` |

`PENDIENTE IDENTIFICADOR DE DISTRIBUCIÓN`: el `slug` sigue siendo
`BlackDogStore-mobile-temp` porque está asociado al proyecto EAS ya registrado
(`projectId` en `app.json`). Los bundle identifiers **sí** se corrigieron a
`com.blackdogstore.app` — era seguro, porque nunca llegó a registrarse ninguna
credencial de Apple. Cambiar el slug es una decisión a tomar junto con la
creación de las apps en App Store Connect y Google Play.

## Licencia

`PENDIENTE DECISIÓN LEGAL DE LICENCIA`

El repositorio venía con un `LICENSE` heredado de la plantilla de Expo (MIT,
*Copyright 650 Industries*). **Se eliminó en M0.1**: era la licencia de la
plantilla, no la del producto, y dejarla ahí habría equivalido a publicar Black
Dog Store Mobile bajo MIT a nombre de otra empresa.

No se ha puesto una licencia propietaria improvisada en su lugar — eso es una
decisión legal, no técnica. Hasta que exista, el repositorio no declara
licencia (es decir, "todos los derechos reservados" por defecto).

Las dependencias conservan sus propias licencias dentro de sus paquetes en
`node_modules`; nada de esto las afecta.

## Git

- Rama de trabajo: `feat/mobile-foundation`
- Nunca desarrollar directamente en `main`
- `ios/` y `android/` son generados y no se commitean

## Documentación

| | |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Capas, flujo de datos, decisiones |
| [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) | Marca, tokens, componentes, accesibilidad |
| [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md) | Endpoints verificados |
| [`docs/BACKEND_REQUIREMENTS.md`](docs/BACKEND_REQUIREMENTS.md) | Propuestas de Mobile al Backend |
| [`docs/INTEGRATION_STATUS.md`](docs/INTEGRATION_STATUS.md) | Estado real por feature |
| [`docs/MOBILE_AUTH.md`](docs/MOBILE_AUTH.md) | Arquitectura de auth, ciclo de vida de tokens y threat model |

Decisiones de arquitectura registradas: **DEC-MOBILE-001** (navegación por tabs
estable en lugar de la API alpha de native tabs), en `docs/ARCHITECTURE.md`.
