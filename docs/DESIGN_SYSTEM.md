# Design System

## Marca

Todos los valores provienen del repositorio Web
(`docs/black-dog-store-brand-master.md`, secciones 3 y 19), leído en modo
lectura. **Nada de branding fue inventado.**

### Paleta base — verbatim del documento de marca

| Token | Hex |
|---|---|
| Negro | `#0A0A0A` |
| Blanco | `#FFFFFF` |
| Gris oscuro | `#1A1A1A` |
| Gris claro | `#E5E5E5` |
| Plata | `#C0C0C0` |
| Dorado de acento | `#D4AF37` |

### La regla que define el sistema

> "Usar negro, blanco y gris como sistema principal. Reservar el dorado para
> detalles, sellos o llamadas puntuales."

Por eso **la acción primaria es tinta (claro) o blanco (oscuro), no dorada**.
Además, `#D4AF37` sobre blanco da ~1.9:1 de contraste: sería ilegible como
texto. El dorado aparece en `accentSurface`, en enlaces y en detalles.

`accentText` es un dorado **oscurecido por esquema** (`#7A5F12` en claro,
`#E3C766` en oscuro) para que el acento pueda usarse como texto sin romper
contraste.

### Logo

`assets/brand/blackdog-logo.png` y `blackdog-mark.png` son los archivos reales
del repositorio Web, **sin modificar**.

Son tinta negra sobre transparente, invisibles sobre fondo oscuro. La solución
es una **colorway**, no un cambio de forma:

- En la app, `BrandLockup` aplica `tintColor` a la imagen en modo oscuro.
- Los iconos se generan con `scripts/generate-brand-assets.py`, que recolorea la
  tinta y **copia el canal alfa intacto**.

Esto cumple las dos reglas del documento a la vez: "No modificar la forma del
logo" y "Crear versiones cromáticas aprobadas del logo para fondo claro y
oscuro".

### `PENDIENTE BRANDING`

1. **Tipografía de display.** La web usa Inter + Unbounded. La app usa la
   tipografía del sistema (San Francisco / Roboto) — decisión consciente: es la
   única que trae todos los pesos y tamaños ópticos que Dynamic Type necesita, y
   es lo que hace que una app de iPhone se sienta como tal. Empaquetar Unbounded
   para titulares es una mejora posterior, no un hueco de fundación.
2. **Correo de soporte.** El documento de marca lista WhatsApp y redes, pero
   ningún correo. `pilotCompanyBrand.supportEmail` es `''` y el Perfil **oculta
   la fila** en lugar de inventar una dirección.
3. **Colores de marca por tenant.** `CompanyBrand.primaryColor` existe pero
   todavía no sobreescribe el token `accent`. Se resolverá con BR-006.

## Tokens

`src/theme/`, un archivo por eje.

| Archivo | Contenido |
|---|---|
| `colors.ts` | Paleta cruda + tokens semánticos por esquema |
| `typography.ts` | Escala de tipo (nombres de iOS: display…caption) |
| `spacing.ts` | `4 8 12 16 20 24 32 40 48` + `screenGutter` |
| `radius.ts` | `6 10 14 18 24 999` |
| `shadows.ts` | Elevación por plataforma y esquema |
| `sizes.ts` | Touch targets, alturas de control, iconos, avatares |
| `index.ts` | `buildTheme(scheme)` memoizado |

Los tokens de color son **semánticos** (`surfacePressed`, `statusWarningSurface`),
no descriptivos (`gray200`). Un componente pide lo que significa, no lo que se
ve, y el esquema resuelve.

Un test (`__tests__/theme.test.ts`) verifica que claro y oscuro definan
exactamente las mismas claves: una clave presente solo en uno es invisible hasta
que alguien cambia de tema y recibe `undefined` como color.

## Claro / Oscuro / Sistema

`AppThemeProvider` (`src/theme/theme-provider.tsx`):

- `ThemePreference = 'light' | 'dark' | 'system'`; `system` es el default.
- La preferencia se persiste en AsyncStorage (**no** en SecureStore: no es un
  secreto).
- El splash nativo se mantiene hasta que la preferencia se lee de disco — no un
  número fijo de segundos, sino exactamente el trabajo asíncrono que hay que
  esperar para no pintar el esquema equivocado.
- El tema resuelto se entrega también al nivel **nativo** (header del stack,
  fondo del contenedor, barra de estado).

No hay estilos duplicados por tema. Los tokens resuelven; los componentes no
ramifican por esquema salvo donde la plataforma lo exige (las sombras
desaparecen en oscuro, donde una sombra negra no se ve y la profundidad viene de
la rampa de superficies).

## Componentes

`src/design-system/` — todo se importa desde el barrel `@/design-system`.

**Primitivas:** `Text` · `Icon`
**Contenedores:** `Screen` · `Card` · `Divider` · `SectionHeader` · `AppHeader`
**Controles:** `Button` · `IconButton` · `Input` · `SearchInput` · `ListRow`
**Indicadores:** `Badge` · `StatusBadge` · `Avatar` · `Skeleton`
**Estados:** `LoadingState` · `EmptyState` · `ErrorState`

Detalles con intención:

- **`Text`** es la única forma de escribir texto. Usar el `Text` de React Native
  es cómo entra un `fontSize: 15` a mano en un proyecto que tiene una escala.
- **`Screen`** posee safe area, fondo, teclado y ancho máximo de línea. Consume
  el inset **superior** y los laterales, pero **no el inferior**: el navegador
  de tabs se sitúa bajo la escena y aplica él mismo el inset del home indicator,
  así que la escena ya termina por encima. Sumarlo otra vez deja una banda
  muerta visible en cualquier iPhone con notch.
- **`IconButton`** exige `accessibilityLabel` como prop **obligatoria**. Un
  control solo-icono es invisible para un lector de pantalla sin ella; hacerla
  requerida convierte el olvido en un error de compilación.
- **`StatusBadge`** recibe el `tone` desde el dominio, nunca desde la pantalla.
  Y siempre lleva la palabra: el color no es el único portador de significado.
- **`Skeleton`** deja de pulsar bajo Reduce Motion.

## Tabs

El tab bar usa el navegador estable `expo-router/js-tabs` — ver DEC-MOBILE-001
en `ARCHITECTURE.md`. Está estilado enteramente con tokens:

| Aspecto | Token |
|---|---|
| Fondo | `colors.background` |
| Borde superior | `colors.border`, con `sizes.hairline` |
| Icono/etiqueta activos | `colors.textPrimary` |
| Icono/etiqueta inactivos | `colors.textTertiary` |

Los iconos siguen siendo **SF Symbols en iOS y Material Symbols en Android**,
con variante rellena cuando la pestaña está activa. `tabBarHideOnKeyboard` se
activa solo en Android, donde el teclado se superpone al tab bar; en iOS el
sistema ya lo aparta y activarlo produce un salto visible.

Las pestañas que un tenant no tiene habilitadas se ocultan con `href: null`, que
no reinicia el navigator.

## iOS

- Safe area, notch y Dynamic Island vía `react-native-safe-area-context`.
- Home indicator: gestionado por el navegador de tabs.
- Teclado: `KeyboardAvoidingView` con `padding` en iOS y `height` en Android
  (comportamientos distintos; un solo valor rompe uno de los dos), más
  `keyboardDismissMode="interactive"`.
- Gesto de retroceso del sistema activo en todas las rutas.
- SF Symbols nativos.
- Sombras muy discretas (opacidad 0.05–0.14); nada de gradientes ni
  glassmorphism.

## Android

Misma marca, misma jerarquía, mismas funciones — con comportamiento del sistema:

- Bottom navigation de Material, con su ripple.
- Botón/gesto de retroceso del sistema, gestionado por el navegador nativo.
- **Predictive back deshabilitado** (`predictiveBackGestureEnabled: false`), por
  compatibilidad y no por estética — ver README > Android.
- Material Symbols en vez de SF Symbols.
- Elevación en vez de sombras iOS.
- Icono adaptativo con capa monocroma (iconos temáticos de Android 13+).

## Accesibilidad

- **Dynamic Type / font scaling:** activo. Nada usa
  `allowFontScaling={false}`. Un layout que se rompe con texto grande es un bug
  de layout, no una razón para desactivar un ajuste de accesibilidad.
- **Touch targets:** `sizes.minTouchTarget = 44` (mínimo de las HIG) como suelo
  de todo pulsable; `hitSlop` donde el objetivo visual es menor.
- **VoiceOver / TalkBack:** tarjetas con etiqueta compuesta (una parada por
  elemento de lista, no cuatro); títulos con `accessibilityRole="header"` para
  el rotor; `accessibilityState` con `disabled` y `busy` en `Button`; errores de
  formulario con `accessibilityLiveRegion` y `role="alert"`; filtros de
  categoría como `radiogroup`/`radio`.
- **Contraste:** el acento tiene variante legible por esquema; los estados usan
  pares foreground/surface calculados por esquema.
- **Color nunca solo:** todo estado lleva texto además de color.
- **Reduce Motion:** `useReducedMotion()`; el Skeleton lo respeta.

## Movimiento

Sutil y funcional. Feedback en la pulsación (cambio de relleno, no de opacidad:
bajar la opacidad de una tarjeta apaga también su texto y se lee como
"desactivada") y transiciones nativas del stack.

El tab bar es el navegador **estable** de Expo Router (DEC-MOBILE-001), no el
`UITabBar` nativo: no hay minimize-on-scroll de iOS 26 ni scroll-to-top nativo
al retocar la pestaña. Es el precio consciente de no construir la navegación
principal sobre una API alpha; sus colores, tipografía y hairline salen de los
mismos tokens que el resto.

Haptics con moderación (`src/utils/haptics.ts`): selección, éxito, error. Nada
vibra al desplazarse ni al navegar.
