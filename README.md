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

### Catálogo real

Desde M2 el catálogo es una **integración real**. Con
`EXPO_PUBLIC_USE_MOCK_DATA=false` la app llama al contrato tenant-safe de
`PapiCuche/BlackDogStore-web` @ `origin/master` `b301637b`:

```
GET /api/v1/storefront/<EXPO_PUBLIC_COMPANY_SLUG>/products/
GET /api/v1/storefront/<EXPO_PUBLIC_COMPANY_SLUG>/products/<slug>/
GET /api/v1/storefront/<EXPO_PUBLIC_COMPANY_SLUG>/categories/
```

El storefront web resuelve su empresa por Host; esta app llega a un host de API
compartido y no tiene ese Host, así que **nombra el storefront en la ruta**. El
servidor resuelve una empresa **activa** desde ese slug y construye todo el
queryset desde ella.

Ese slug **selecciona un escaparate público. No autoriza nada.** Las pantallas
privadas seguirán derivando su empresa de la membresía del usuario autenticado
(BR-001/BR-002), nunca de la ruta.

| Entorno | mocks | tenant + API url | Catálogo |
|---|---|---|---|
| development | ON | cualquiera | mocks |
| development | OFF | ambos | **real `/api/v1/`** |
| staging | OFF | ambos | **real `/api/v1/`** |
| production | OFF | ambos | **real `/api/v1/`** |
| cualquiera | OFF | falta alguno | **no disponible** |

La última fila es el fail-safe. Sin `EXPO_PUBLIC_COMPANY_SLUG` no hay storefront
que pedir, y caer a la empresa piloto serviría el catálogo de Black Dog Store
dentro de la app de otra empresa. Sin `EXPO_PUBLIC_API_BASE_URL` no hay a quién
preguntar. **Ninguno de los dos cae a mocks**: productos inventados delante de un
cliente real es peor que una pantalla vacía que lo diga.

#### El catálogo legacy se eliminó

`EXPO_PUBLIC_ENABLE_LEGACY_CATALOG`, `LegacyApiCatalogRepository`, su wrapper de
endpoint y su guardia de red **ya no existen**. M0.2 los había encerrado tras un
gate porque `/api/products/` devuelve el catálogo de todas las empresas; M2
resolvió el problema en vez de vigilarlo.

Se borraron en lugar de apagarse: un segundo camino "temporal" a los mismos
datos —y encima el inseguro— es el que acaba usándose por alguien que no sabe
por qué seguía ahí.

Ese endpoint sigue existiendo en el backend para el frontend web, que lo resuelve
por Host y para el cual es correcto.

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

## Comportamiento sin conexión

La app es **offline-aware**, no offline-first: detecta la pérdida de conexión,
la comunica y sobrevive a ella, pero no replica la base de datos ni encola
acciones.

| Situación | Qué verás |
|---|---|
| Sin conexión | Banda discreta arriba, no un modal |
| Sin conexión con datos ya cargados | Los datos siguen, con aviso de que pueden no estar actualizados |
| Vuelve la conexión | La banda desaparece y se revalida lo que esté stale |
| Feature sin backend | "Próximamente" — distinto de estar sin conexión |

Detalles y decisiones en [`docs/OFFLINE_STRATEGY.md`](docs/OFFLINE_STRATEGY.md).

## Enlaces (deep links)

La app abre enlaces entrantes con el scheme `blackdogstore://`. Un enlace es
**una intención de navegación, nunca una autorización** (DEC-MOBILE-004): lleva
a una pantalla, y quién puede ver qué lo siguen decidiendo el gate de sesión y
el backend.

| Enlace | Requiere sesión |
|---|---|
| `blackdogstore://products/<slug>` | No |
| `blackdogstore://orders/<id>` | Sí — si no la hay, va a login y **reanuda** |
| `blackdogstore://repairs/<id>` | Sí — igual |
| `blackdogstore://track/<token>` | Reconocido pero **no disponible** (BR-008) |

Cualquier otra ruta se rechaza: es una allowlist.

### Probarlos en desarrollo

Con la app corriendo en el simulador o el emulador:

```bash
npx uri-scheme open "blackdogstore://products/iphone-15-pro-256" --ios
npx uri-scheme open "blackdogstore://orders/1042" --android
```

`uri-scheme` viene con Expo; no hace falta instalarlo. Equivalentes nativos:

```bash
xcrun simctl openurl booted "blackdogstore://repairs/r-1042"
adb shell am start -a android.intent.action.VIEW -d "blackdogstore://repairs/r-1042"
```

Abrir un enlace privado sin sesión debe llevarte a login y, al autenticarte,
abrir el destino original.

### Lo que un enlace nunca lleva

Ni tokens, ni contraseñas, ni parámetros de redirección (`next`, `redirect`,
`callback`…). Un enlace que los traiga se rechaza entero, y ninguna URL cruda
llega a un log. Los enlaces `https://` todavía se rechazan **a propósito**: no
hay dominio verificado que confiar (DEC-MOBILE-005).

Detalles y decisiones en [`docs/LINKING_STRATEGY.md`](docs/LINKING_STRATEGY.md).

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
- **Apagar los mocks ya sí da un catálogo real y seguro** — desde M2 apunta a
  `/api/v1/`, aislado por empresa en el servidor. Ver "Catálogo real".
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
- **`/api/v1/` ya existe, pero solo el slice de catálogo.** Que el prefijo
  versionado aparezca no significa que exista el contrato entero: no hay
  `/api/v1/auth/*` ni superficie privada v1, y el backend tiene tests que lo
  fijan. BR-001 sigue `API_PENDING` y BR-007 sigue `PARCIAL`.

## Seguridad

- Los tokens irán a `expo-secure-store` (Keychain / Keystore). **Nunca** a
  AsyncStorage. Los dos módulos están separados en `src/storage/` para que
  elegir mal exija importar mal.
- Todo `EXPO_PUBLIC_*` es público: está dentro del bundle.
- Nunca en el repositorio: `.env`, keystores, `.p8`, `.p12`, provisioning
  profiles, certificados, `credentials.json`. Todo cubierto por `.gitignore`.
- La app no guarda ni registra contraseñas.
- **Autenticación real: INTEGRADA** (núcleo de sesión) contra
  `/api/v1/auth/` en `origin/master` `7c55ebc`. Login, refresh con rotación,
  logout y restore en cold start. **Registro, verificación y reset siguen
  pendientes** (BR-001B) y la app no los muestra en modo backend. Ver
  `docs/MOBILE_AUTH.md`.
- **El access token nunca se persiste** — solo memoria. El refresh token sí, en
  Keychain/Keystore, y es la única credencial que se guarda.
- **Auth simulada imposible en production.** `development` usa mock, `staging`
  solo con opt-in explícito, `production` nunca: muestra "acceso no disponible"
  en lugar de un formulario que no puede funcionar.
- **Tener el contrato no es tener servidor.** Una build sin
  `EXPO_PUBLIC_API_BASE_URL` cae a "acceso no disponible", nunca a un login cuyo
  botón solo puede fallar, y **nunca** a mocks.
- **Sin red no es sin sesión.** Un fallo de red al arrancar deja la app en
  `temporarily-unavailable` **conservando** el refresh token; solo un rechazo del
  servidor borra credenciales.
- Un token nunca llega a un log ni a un mensaje de error (`src/auth/redact.ts`).
- Un `Authorization: Bearer` no puede salir hacia `/api/auth/*`, `/api/admin/*`,
  `/api/me/*` ni `/api/products/*` (`src/api/api-scope.ts`).
- **La cache de server-state está particionada por empresa, por usuario y por
  audiencia**, y se vacía al cambiar de identidad. Ningún token entra jamás en
  una query key. El segmento de audiencia (`customer`) existe para que datos
  internos no puedan aterrizar en una vista de cliente compartiendo clave.
  Ver `docs/OFFLINE_STRATEGY.md`.
- **La query cache es solo memoria.** No hay persistencia en disco todavía: eso
  exige cifrado, partición por tenant y política de retención primero.
- **Un deep link no autoriza nada.** Un enlace con parámetros prohibidos
  (`token`, `next`, `redirect`…) se rechaza entero, la URL cruda nunca se
  registra y el destino pendiente vive **solo en memoria**, descartándose al
  cerrar sesión o cambiar de usuario. Ver `docs/LINKING_STRATEGY.md`.

## Autenticación

La app autentica de verdad contra el contrato **nativo** de
`PapiCuche/BlackDogStore-web` @ `origin/master` `7c55ebc`:

```
POST /api/v1/auth/login/     {email, password} → tokens en el cuerpo
POST /api/v1/auth/refresh/   {refresh}         → access + refresh rotado
POST /api/v1/auth/logout/    {refresh}         → best-effort
GET  /api/v1/auth/me/        Bearer            → identidad + empresas
```

El contrato **web** (`/api/auth/*`) no se toca: usa cookie HttpOnly + CSRF,
porque el navegador adjunta cookies a peticiones que el usuario no inició. Esta
app guarda su token y lo envía a propósito. `src/api/api-scope.ts` impide enviar
un Bearer a `/api/auth/`, `/api/admin/` o `/api/me/`.

**Se entra con correo**, no con usuario.

### Qué está integrado y qué no

| | |
|---|---|
| Login · refresh · logout · restore | **INTEGRADO** |
| Contexto de empresa verificado | **INTEGRADO** |
| Registro · verificación · reset | **PENDIENTE** (BR-001B) |

En modo backend esas tres pantallas muestran un estado explícito y remiten a la
web. En development con mocks siguen disponibles como demo.

### Empresa activa

El servidor devuelve las empresas con las que **verificó** que el usuario tiene
relación. `EXPO_PUBLIC_COMPANY_SLUG` **selecciona** la suya de esa lista; si no
está, la empresa activa queda en `null` — sin caer al piloto ni a la primera de
la lista. Sigue sin ser autorización: cada API privada revalida en el servidor.

## Pedidos y audiencias

El backend tiene **tres audiencias**, y la app respeta esa separación:

| Superficie | Quién | Auth |
|---|---|---|
| `/api/v1/storefront/<empresa>/` | cualquiera | ninguna |
| `/api/v1/customer/<empresa>/` | **cliente, sus propios registros** | Bearer |
| `/api/v1/internal/<empresa>/` | staff bajo capability | **no existe todavía** |

### Navegación pública, compra autenticada

**DEC-MOBILE-006.** Abrir la app, buscar, filtrar y ver un producto **nunca**
piden cuenta. La sesión se pide cuando la acción se vuelve privada: tus pedidos,
tus reparaciones, pagar.

Un visitante anónimo en la pestaña Pedidos ve una invitación a entrar, no un
error técnico: no ha hecho nada mal.

### Cliente e interno no son lo mismo

**DEC-MOBILE-007.** Una misma persona puede ser clienta de una empresa y trabajar
en ella. En el contrato son **dos booleanos independientes**, no un rol.

Un empleado que abre Pedidos ve **sus propias compras**, nunca las de la empresa.
Los pedidos de toda la empresa serán el área interna, tras `sales.orders.view`.

### Las capabilities son para dibujar, no para autorizar

**DEC-MOBILE-008.** `access_contexts[].capabilities` decide qué pestaña se
muestra. Todo endpoint interno las revalida en el servidor: quien mienta recibe
un 403, no inventario.

### Qué se ve de un pedido

Estado de pago y **estado de entrega** por separado (BR-003), con las etiquetas
que renderiza el servidor. No llegan identificadores de Stripe, diagnósticos
operativos ni claves de sesión.

## Carrito y compra

**Navegar y armar carrito no piden cuenta. Pagar sí** (DEC-MOBILE-006).

```
producto → agregar → carrito → «Ir a pagar» → login si hace falta
        → Stripe Checkout alojado → vuelta a la app → refetch del pedido
```

### El carrito es intención local

**DEC-MOBILE-009.** Vive en el dispositivo, sin backend. Guarda slug y cantidad,
más nombre, imagen y último precio visto **solo para dibujar**. Todo importe que
muestra es una **estimación**, y la pantalla lo dice: el servidor recalcula todo
al pagar.

Está en AsyncStorage, **no en SecureStore** — no contiene credenciales ni
autorización, y el Keychain es para secretos. Es **por empresa**: dos tiendas son
dos carritos. **Sobrevive al login y al logout**, porque quien entra para pagar y
falla no debe perder lo que eligió.

### El pago

Sin campo de tarjeta en la app, y no debe haberlo: que los datos de tarjeta nunca
toquen el cliente es la razón entera de que exista la página alojada de Stripe.
La app abre una URL HTTPS que el servidor emitió y **valida que sea de Stripe**
antes de abrirla.

**«El navegador volvió» no es un pago.** Al volver a primer plano la app
**pregunta al servidor** por el pedido, que lo sabe por el webhook de Stripe. El
carrito solo se vacía cuando el pago se confirma; cancelar, expirar o quedarse
sin red lo conservan.

### Marca del tenant

Desde M5 la marca, el contacto, las políticas y el enlace de WhatsApp vienen de
`/api/v1/storefront/<empresa>/config/` (**BR-006** cerrado). El botón de WhatsApp
del detalle de producto, inerte desde M0, ahora abre el canal **de esa tienda** —
nunca un número escrito a mano en el código.

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

- El desarrollo ocurre en feature branches creadas desde `main`
- `main` contiene únicamente fases consolidadas mediante PR
- Merge normal (merge commit). Sin `rebase`, sin squash, sin `push --force`
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
| [`docs/MOBILE_AUTH.md`](docs/MOBILE_AUTH.md) | Arquitectura de auth, ciclo de vida de tokens, integración real y threat model |
| [`docs/OFFLINE_STRATEGY.md`](docs/OFFLINE_STRATEGY.md) | Conectividad, reintentos y aislamiento de cache |
| [`docs/LINKING_STRATEGY.md`](docs/LINKING_STRATEGY.md) | Deep links, seguridad de enlaces y camino a Universal Links |

Decisiones de arquitectura registradas en `docs/ARCHITECTURE.md`:

- **DEC-MOBILE-001** — navegación por tabs estable en lugar de la API alpha.
- **DEC-MOBILE-002** — cache de server-state con namespace de tenant y usuario.
- **DEC-MOBILE-003** — offline-aware antes que offline-first.
- **DEC-MOBILE-004** — un deep link es una intención de navegación, nunca una
  autorización.
- **DEC-MOBILE-005** — los puntos de entrada de producción irán por Universal
  Links / App Links verificados por HTTPS (INFRA_PENDING).
