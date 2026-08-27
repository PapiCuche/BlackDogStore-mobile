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

## Variables de entorno

Copiar `.env.example` a `.env.local`. **Todo `EXPO_PUBLIC_*` se compila dentro
del bundle y es público.** Nunca poner secretos ahí.

| Variable | Default | Para qué |
|---|---|---|
| `EXPO_PUBLIC_API_BASE_URL` | derivada de Metro en dev | Raíz de la API de Django, sin barra final |
| `EXPO_PUBLIC_COMPANY_SLUG` | `blackdog` | Tenant de este build (ver BR-002) |
| `EXPO_PUBLIC_USE_MOCK_DATA` | `true` | `false` apunta la app a la API real |
| `EXPO_PUBLIC_APP_ENV` | — | `staging` marca un build de release como no productivo |

### `localhost` significa cosas distintas según dónde corra el JS

| Entorno | Host de tu Mac |
|---|---|
| Simulador iOS | `localhost` |
| Emulador Android | `10.0.2.2` |
| Dispositivo físico | La IP LAN de la Mac (p. ej. `192.168.1.42`) |

Por eso `src/config/env.ts` **deriva el host del servidor de Metro** cuando la
variable está vacía: Metro ya sabe con qué dirección lo alcanzó el cliente. En
desarrollo, lo normal es dejar `EXPO_PUBLIC_API_BASE_URL` en blanco.

Para un dispositivo físico contra un Django local, el backend necesita esa IP en
`ALLOWED_HOSTS`. **Mobile no modifica el backend**: se solicita al equipo
Backend (ver notas de entorno en `docs/BACKEND_REQUIREMENTS.md`).

## Comprobaciones

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # expo lint
npm run test        # jest --watch
npm run test:ci     # jest --ci
npm run doctor      # npx expo-doctor@latest
npm run verify      # typecheck + lint + test:ci
```

## Mocks

La app se desarrolla en paralelo al backend, así que las pantallas corren sobre
fixtures. Reglas:

- Los fixtures viven en `src/repositories/mock/fixtures.ts`, **fuera del árbol de
  componentes**. Ninguna pantalla contiene datos.
- `src/repositories/index.ts` es el único sitio que decide mock vs API.
- Cada pantalla con datos de ejemplo **lo dice en la interfaz**
  (`MockDataNotice`). Un demo indistinguible de datos reales es cómo alguien
  concluye que una feature está integrada.
- El estado real de cada feature está en `src/config/integration-status.ts`, que
  la app lee en tiempo de ejecución, y se ve en Perfil → Estado de integración.

Para probar contra la API real: `EXPO_PUBLIC_USE_MOCK_DATA=false`.

## Backend

Fuente de verdad: PostgreSQL → Django REST API → (Next.js | Mobile).

- Endpoints verificados: [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md)
- Propuestas de Mobile: [`docs/BACKEND_REQUIREMENTS.md`](docs/BACKEND_REQUIREMENTS.md)
- Autenticación: [`docs/MOBILE_AUTH.md`](docs/MOBILE_AUTH.md)

**Mobile nunca modifica el backend ni la web.** Si algo hace falta, se propone;
el equipo Backend decide.

## Seguridad

- Los tokens irán a `expo-secure-store` (Keychain / Keystore). **Nunca** a
  AsyncStorage. Los dos módulos están separados en `src/storage/` para que
  elegir mal exija importar mal.
- Todo `EXPO_PUBLIC_*` es público: está dentro del bundle.
- Nunca en el repositorio: `.env`, keystores, `.p8`, `.p12`, provisioning
  profiles, certificados, `credentials.json`. Todo cubierto por `.gitignore`.
- La app no guarda ni registra contraseñas.
- **Autenticación real: PENDIENTE.** Ver `docs/MOBILE_AUTH.md`.

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
| [`docs/MOBILE_AUTH.md`](docs/MOBILE_AUTH.md) | Por qué la auth está pendiente |
