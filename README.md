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
| `/api/v1/internal/<empresa>/` | staff bajo capability | Bearer v1 + capability |

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

Desde **UI7** también viene de ahí el **color**.

La paleta base del design system era la de la empresa piloto: su dorado era el
acento de cualquier build, y un segundo cliente lo habría heredado salvo que
alguien se acordara de sobreescribirlo. Ahora la base es **acromática** —tinta,
papel y grafito— y `CompanyBrand.primaryColor` se aplica encima. La plataforma
no tiene color propio que prestar.

**Cuatro tokens se mueven con la marca y ninguno más.** Fuera de su alcance
quedan la rampa de estado, el texto, los bordes y el fondo del botón primario:

- Una tienda cuyo color de marca sea rojo no puede acabar con una insignia
  «entregado» roja. El color de estado es significado.
- El botón primario sigue siendo tinta o blanco. Es la superficie más crítica en
  contraste de toda la app.

**El contraste se calcula, no se supone.** El color se aplica exacto como
relleno; donde tiene que leerse, se deriva y se corrige contra WCAG AA. El
dorado del piloto sobre blanco da 2.10:1 — por debajo incluso del 3:1 de texto
grande. Un color que la app no puede parsear deja los tokens base intactos: es
un build sin acento, no un crash.

La app **abre acromática** y toma el color del tenant cuando la marca resuelve.

### Materiales

Barras de navegación, barra de pestañas y banner de sin conexión son paneles de
material esmerilado; las tarjetas son paneles con filo y una hairline especular.

**El desenfoque es la mejora, no el diseño.** Tres situaciones lo apagan —
Android, «Reducir transparencia» y cualquier superficie que se repita en una
lista — así que cada material lleva un fallback **opaco**, y un test verifica que
el texto principal pasa AA sobre él en los dos esquemas. Si el fallback no fuera
legible, apagar el efecto sería romper la app en lugar de degradarla.

Detalle en [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md).

## Área interna

Cuatro audiencias, y la app respeta la separación del backend:

| Superficie | Quién |
|---|---|
| `storefront/` | cualquiera |
| `customer/` | cliente, sus propios registros |
| **`internal/`** | **staff, registros de la empresa** |
| `/api/admin/` | web — **nunca desde Mobile** |

### Cuándo aparece la entrada

Solo cuando el servidor verificó una **membresía activa** en esta empresa, o
cuando la cuenta es platform master. **Nunca por un rol**: `role === 'admin'`
dice cómo se llama alguien, no a qué empresa pertenece.

Un empleado conserva **todas** sus pestañas de cliente. Nadie es redirigido a un
panel al iniciar sesión, y quien también compra aquí sigue comprando.

### Dos preguntas, dos fuentes

| | |
|---|---|
| ¿Ofrezco la entrada? | El contexto de la sesión — instantánea del login |
| ¿Sigue abriéndose? | `GET /internal/<slug>/context/`, al entrar |

La segunda existe porque los roles cambian mientras una sesión sigue viva.

### Las capabilities dibujan; el servidor autoriza

`hasUxCapability` decide qué pestaña se ve. Todo endpoint interno las revalida en
el servidor, en cada petición: quien mienta recibe un 403, no los datos.

Un módulo que la persona no tiene **no se dibuja**. Uno que sí tiene pero que la
app aún no implementa **se dice** — callarlo haría concluir que la app está rota
en vez de incompleta.

### Servicio técnico (M8)

**Dos experiencias, y no se mezclan.** Un cliente ve SUS reparaciones en la
pestaña de Reparaciones; el personal ve las órdenes de la empresa en el área
interna. Tipos distintos, repositorios distintos, cachés distintas. La misma
persona puede ser ambas cosas y cada superficie le responde lo suyo.

**El cliente no ve nada interno**: ni notas del taller, ni la condición física
anotada en recepción, ni los accesorios, ni quién es el técnico, ni los
comentarios de ningún evento. Y el filtrado es del servidor: la app no recibe el
evento oculto, que es más fuerte que pedirle que no lo dibuje.

**El ciclo de vida es el del servidor, incluidas sus palabras.** Esta app no
tiene tabla de transiciones: dibuja lo que el servidor ofrece y el servidor
vuelve a validar. Una empresa que renombró «Recibido» a «En mostrador» ve su
palabra en la app sin que la app sepa nada.

**Cuatro estados, no siete.** Mobile había propuesto siete; el backend
implementó cuatro porque los otros tres necesitan módulos que aún no existen.
El dominio se reescribió contra el contrato, no al revés.

**La recepción manda una intención.** No hay campo para el número de orden, el
estado, la empresa ni quién recibió el equipo — tener un campo es poder
rellenarlo. Y no se piden contraseñas ni códigos de desbloqueo del equipo.

**Ninguna operación de servicio se encola offline ni reintenta.** Una orden
repetida es una segunda orden; una transición repetida, una segunda fila de
historial para un solo hecho.

### Diagnóstico, cotización y aprobación (M9)

**El taller diagnostica y cotiza; el servidor hace las cuentas.** Una línea se
manda con tipo, descripción, cantidad y precio unitario. El total de la línea, el
subtotal y el total los calcula el servidor, y los importes viajan como string
decimal hasta el punto de dibujo — el céntimo que pierde un float lo ve un
cliente en una pantalla y un contable en un informe.

**Poner precio es un permiso aparte de mover una orden.**
`service.diagnostic.manage` es una capability propia: un taller puede querer que
el mostrador cambie estados sin poder cotizar.

**Una cotización enviada no se edita.** Se cancela y se hace otra, con revisión
nueva. Es la misma razón por la que un pedido no se edita después de pagarse.

**Aprobar no es pagar.** El cliente responde con una decisión y, si quiere, un
motivo. Nada más: ni importe, ni identidad, ni fecha. Tener un campo es poder
rellenarlo, y la garantía de que nadie aprueba a un precio que no era es que no
existe dónde escribir un precio.

**El mostrador contesta por teléfono.** Si alguien responde la cotización desde
el taller un segundo antes, el servidor devuelve 409 y la app **refresca igual**
— la invalidación va en `onSettled`, no en `onSuccess`, para que quien pierde esa
carrera acabe mirando el estado verdadero en vez de una pantalla obsoleta.

**La caducidad la decide el servidor.** El reloj de un teléfono no dice si una
oferta sigue abierta.

**El motivo que escribe el cliente no vuelve a su pantalla.** Lo lee el taller,
que es quien lo necesita.

### Ejecución y repuestos (M10)

**Un estado que esta app no conoce se muestra igual.** `toRepairStatus`
coaccionaba cualquier código desconocido a `received`, y eso dibujó «Recibido»
sobre una reparación que el cliente acababa de aprobar. Ahora el código llega
intacto, se dibuja con la etiqueta que manda el taller y un tono neutral, y no
recibe posición en la escalera de progreso. Solo un estado **ausente** cae a
`received`.

**Empezar, pausar y terminar son hechos, no opciones.** `in_repair`,
`waiting_parts` y `repaired` son event-only en el servidor: el endpoint genérico
los rechaza. Cada uno tiene su operación, que escribe la fila que le da sentido
al estado.

**Una pieza sale de la sucursal de SU reparación**, y traza a una línea de la
cotización que el cliente aprobó. No hay campo de sucursal ni de producto en
ninguna petición: la app manda la línea, la cantidad y una clave.

**La app no resta stock en pantalla.** Mostrar «disponible menos cantidad» sería
afirmar un número sobre una estantería que otra caja puede estar cambiando en
ese mismo momento. Después de escribir se vuelve a preguntar.

**Un timeout no descuenta dos veces.** La clave de idempotencia se acuña una vez
por intención, vive en un `ref` y se reenvía idéntica si la persona reintenta.
Nada reintenta solo: la idempotencia del servidor protege al servidor, no la
intención de quien pulsó.

**Deshacer devuelve las unidades; no borra nada.** Y después de finalizar el
trabajo la pieza queda congelada: una batería instalada no vuelve a la
estantería porque alguien pulse deshacer.

**`repaired` significa que el técnico terminó.** No revisado, no listo para
recoger, no avisado, no pagado. La reparación sigue apareciendo como activa en
la Home del cliente, porque el equipo sigue en el taller.

### Control de calidad (M11)

**La lista de control no está en esta app.** Cada taller configura la suya y el
servidor la manda como un snapshot al abrir la inspección; la app dibuja lo que
llegó. Editar la plantilla mañana no cambia lo que se probó hoy — y por eso el
contrato ni siquiera envía el id de la plantilla.

**El veredicto lo calcula el servidor.** «Aprobar» manda una nota interna
opcional y nada más. Si falta un punto obligatorio o algo falló, responde 400,
diga lo que diga la pantalla. El resumen que ve el técnico es una vista previa.

**«No aplica» es una respuesta.** Una lista que pregunta por la cámara le está
preguntando a una laptop algo que no tiene.

**Un fallo devuelve el equipo al banco con un trabajo nuevo.** El anterior queda
finalizado con sus repuestos intactos, y **no se devuelve nada al stock**: una
pieza que falló una prueba sigue instalada.

**Inspeccionar es un permiso distinto de reparar.** Un taller que quiere un
segundo par de ojos concede uno a cada rol. La plataforma no lo obliga —un
taller de una persona quedaría fuera— pero guarda quién revisó aparte de quién
reparó.

**«Listo para recoger» no significa que se avisó a nadie.** El equipo pasó sus
pruebas. Esta plataforma no tiene canal de notificaciones.

### Entrega (M12)

**Se registra quién se llevó el equipo y cuándo. Nada más.** `delivered` es el
duodécimo estado y el segundo terminal — llega con su módulo, como todos desde
M8. `warranty` sigue sin existir, y cuando llegue será un **reingreso** que cita
a la orden anterior, nunca un estado pegado a una orden cerrada.

**No registra cobro, y la pantalla lo dice en voz alta.** Esta plataforma no
puede cobrar una reparación: `PaymentTransaction` cuelga de una `Order` de
e-commerce por una FK no nula. Un interruptor de «cobrado» aquí sería una
mentira que el taller se cree. Un guard estructural prohíbe cualquier campo o
identificador de pago en los archivos de M12, y otro comprueba que el texto
visible nunca afirme un pago.

**Solo se entrega un equipo que aprobó control de calidad.** `delivered` es
event-only en el servidor: el endpoint genérico lo rechaza, porque mover la
orden sin registrar a quién se le dio el equipo sería una entrega sin nadie del
otro lado.

**Quien recibe es texto libre.** Suele ser un familiar o un mensajero. Exigir un
`Customer` obligaría al mostrador a inventar clientes para poder entregar.

**Entregar es un permiso distinto de gestionar la orden.**
`service.orders.manage` es mucho más ancho y **puede cancelar la orden**; un
taller que quiere que el mostrador libere equipos no tiene por qué entregarle
también la máquina técnica. Y al revés: se puede pedir que quien reparó no sea
quien entrega.

**No hay editar ni borrar, porque el servidor no los tiene.** La fila rechaza
actualizaciones y borrados en su propio `save`. Una entrega es un hecho con
fecha.

**Sin firma y sin foto** (DEC-016): el proveedor de almacenamiento sigue sin
decidirse, y un campo de evidencia que no guarda nada es peor que un hueco
honesto.

**Un doble toque no entrega dos veces.** La clave de idempotencia se acuña una
vez por intención, vive en un `ref` y se reenvía idéntica. La misma clave con
otro destinatario responde 409 y llega como su propio error: no es «falló la
entrega», es una clave gastada en otra cosa.

**Para el cliente, `delivered` cierra la reparación** y sale de la Home. No ve
quién la recogió, ni las notas del mostrador, ni quién se la dio.

### Cobro del servicio (M12B)

**Un libro mayor, no una bandera.** `RepairOrder` no tiene `paid` y no lo
tendrá: un booleano no sabe decir «doscientos de quinientos». Cada pago es una
fila y el saldo es aritmética sobre las filas — **que hace el servidor**.

**Esta app no hace aritmética con dinero.** Cada importe es una cadena decimal
desde el cable hasta el píxel. Un número calculado aquí podría discrepar del del
taller, y el que discrepa siempre es el que alguien está leyendo al otro lado
del mostrador. Un guard estructural falla si aparece `Number(...)`,
`parseFloat`, `toFixed` o una suma sobre un identificador de dinero — y se
verificó plantando la violación exacta.

**`null` no es cero.** Un total sin cotizar se dibuja como «todavía sin
presupuesto», nunca como «S/ 0.00»: eso último diría que la reparación es
gratis.

**`online` no se ofrece.** Nombra un flujo de pasarela que nadie construyó. El
servidor lo rechaza en la capa de servicio **y** en una constraint de base de
datos, así que mostrarlo solo prometería un 400.

**Cobrar es un permiso distinto de reparar.** `service.payments.manage` es
propia: `service.orders.manage` no la implica, ni `inventory.adjust`, ni la
entrega. El preset `Servicio Técnico` **no** la trae por defecto — los técnicos
autorizados gestionan los estados de una reparación, y de ahí no se sigue que
todo técnico maneje efectivo.

**Un pago no se edita ni se borra: se reversa.** Y **reversar NO devuelve
dinero** — la confirmación lo dice antes de que el botón haga nada. Esta
plataforma no puede reembolsar.

**Un doble toque no cobra dos veces.** Clave acuñada una vez por intención,
guardada en un `ref`, reenviada idéntica. `retry: false`, sin cola offline.

**Un 409 tiene ahora tres significados**, y se distinguen por el `code` del
servidor, nunca por el castellano: `insufficient_stock`,
`idempotency_conflict` y **`payment_required`**. Este último no es «falló la
entrega»: es la política del taller. La pantalla refresca el saldo y dice cuánto
falta, en lugar de mandar a alguien a buscar un problema en el equipo.

### El saldo, para el cliente (M12B)

Tres números y una palabra, todos del servidor: total aprobado, pagado, saldo,
estado.

**No ve** quién cobró, con qué medio, contra qué voucher, ni que un pago fue
reversado — eso es el taller corrigiendo sus libros, y su saldo ya lo refleja.
`overpaid` se reporta como `paid`.

**No hay botón de pagar**, y no debe haberlo hasta que exista el pago en línea.
Enseñar un saldo junto a algo que parezca una forma de liquidarlo sería la
mentira que toda esta fase evitó. La tarjeta dice dónde se paga de verdad: **en
el taller**.

### Inventario: una tercera puerta

El stock solo existe en un lugar, así que el módulo de inventario pregunta
**dónde** además de **qué**:

| Situación | Respuesta del servidor | Qué muestra la app |
|---|---|---|
| Sin membresía activa | 404 | El área interna no está disponible |
| Sin `inventory.view` | 403 | Ya no tienes acceso a este módulo |
| Sucursal fuera de tu acceso | **404**, no 403 | Esa sucursal no está disponible |

El tercer caso responde 404 a propósito: un 403 confirmaría que la sucursal
existe, y bastaría con probar ids para levantar el mapa de tiendas de la empresa.

**Ver stock y moverlo son dos permisos.** `inventory.view` dibuja las pantallas
de lectura; el botón de registrar movimiento solo aparece con `inventory.adjust`.

**El ajuste manda lo que se movió, nunca el total resultante.** No hay campo de
stock final en el formulario ni en el contrato: el servidor toma el lock, aplica
el signo según el tipo de movimiento y devuelve el resultado.

Sin sucursales asignadas la app lo dice y no simula un error: es un estado
legítimo de la empresa.

**Transferencias y recuentos no están**, ni aquí ni en la API v1. Son flujos de
varios pasos y aplanarlos en un botón inventaría una semántica que el negocio no
tiene.

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
