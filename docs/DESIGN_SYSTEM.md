# Design System

## Marca — la plataforma no tiene color propio

**UI7 cambió lo que este documento afirma.** Hasta entonces esta sección
empezaba diciendo que todos los valores venían del documento de marca de Black
Dog Store, y `src/theme/colors.ts` lo repetía en su primera línea: *«SOURCE OF
TRUTH: docs/black-dog-store-brand-master.md»*. La paleta de la empresa piloto
—dorado incluido— era la base del design system.

Eso es correcto para una app de una sola tienda y equivocado para un SaaS. La
empresa piloto se había convertido en la identidad por defecto de cualquier
build, y un segundo cliente habría heredado el dorado de un competidor salvo que
alguien se acordara de sobreescribirlo. **Un fallback no es una decisión de
producto; es la decisión que se toma cuando nadie decide.**

### La base es acromática

| Token | Hex | Qué es |
|---|---|---|
| `ink` | `#0A0A0A` | Tinta |
| `paper` | `#FFFFFF` | Papel |
| `graphite` | `#1A1A1D` | Superficie oscura |
| `ash` | `#E5E5E7` | Borde claro |
| `slate` | `#8A8F97` | Texto terciario |

No es «gris porque el gris es seguro». Es gris porque es la única paleta que una
plataforma multiempresa puede sostener sin tomar prestada la identidad de
alguien. Ligeramente fría en vez de neutra pura, para que acentos de cualquier
tono se apoyen encima sin embarrarse.

### El color viene del tenant

Por **BR-006**, cerrado en M5: `/api/v1/storefront/<slug>/config/` →
`CompanyBrand.primaryColor`. `src/theme/tenant-accent.ts` lo aplica sobre los
tokens base al construir el tema.

El dorado del piloto sigue existiendo, pero en
`src/domain/company/pilot-brand.ts`, que es donde vive la identidad de un
tenant.

**Cuatro tokens se mueven y ninguno más:**

| Token | Qué es |
|---|---|
| `accent` | El color del tenant, **exacto**. Es un relleno, nunca texto |
| `accentText` | El mismo color, corregido hasta pasar AA |
| `accentSurface` | Un lavado del acento (8% en claro, 14% en oscuro) |
| `textOnAccent` | Tinta o papel, el que sobreviva **sobre** el relleno |

Un test enumera las claves que cambiaron y falla si aparece una quinta.

### Lo que un tenant NO puede repintar

- **La rampa de ESTADO.** Una tienda cuyo color de marca sea rojo no puede
  acabar con una insignia «entregado» roja. El color de estado es significado, y
  el significado no está en venta.
- **El TEXTO y los BORDES.** Son el suelo de legibilidad. Un tenant puede ser
  ilegible en su publicidad; no puede hacer ilegible esta app.
- **`actionBackground`.** El botón primario sigue siendo tinta en claro y blanco
  en oscuro. Es la superficie más crítica en contraste de toda la app, y un
  relleno de marca a media luz es justo donde «poner nuestro color en el botón»
  le cuesta la lectura a alguien.

### La accesibilidad conserva la autoridad

`src/theme/contrast.ts` es matemática de color pura: parseo, luminancia
relativa, ratio WCAG, composición alfa y una caminata hacia negro o blanco.

- `accentText` se corrige contra **los dos** fondos sobre los que puede caer: la
  página y el lavado de acento que hay detrás de una `Badge`. El lavado está
  teñido hacia el color de marca, así que siempre es el más difícil de los dos.
- `textOnAccent` se elige por contraste medido, no por convención. Un amarillo
  pastel con etiqueta blanca es el botón ilegible clásico.
- El contraste se mide **después** de componer la transparencia. Un negro al 50%
  sobre blanco es gris medio, no negro; medir el color crudo es cómo una paleta
  «revisada» sigue enviando una etiqueta que no se lee.

El dorado del piloto sobre blanco da **2.10:1**, por debajo incluso del 3:1 de
texto grande. Ese número es la razón de que estos archivos existan.

Un color que no se puede parsear devuelve los tokens base sin tocar. Un tenant
que guarde «azul» en un formulario no es un crash ni una pantalla en blanco: es
un build sin acento, que es el aspecto que tiene la plataforma por sí sola.

### El primer frame

La app **abre acromática** y toma el color del tenant cuando la marca resuelve.
Ese orden es deliberado: la alternativa es retener toda la UI esperando una
petición de red, o destellar un color que pertenece a quien compiló el fixture.

### Logo

`assets/brand/blackdog-logo.png` y `blackdog-mark.png` son los archivos reales
del repositorio Web, **sin modificar**, y pertenecen al **piloto**. Solo se
dibujan cuando la marca resuelta viene de `pilot-fixture`; un build de otro
tenant que cayera en ellos estaría mostrando la marca de un cliente dentro de la
app de otro.

Son tinta negra sobre transparente, invisibles sobre fondo oscuro. La solución
es una **colorway**, no un cambio de forma:

- En la app, `BrandLockup` aplica `tintColor` a la imagen en modo oscuro.
- Los iconos se generan con `scripts/generate-brand-assets.py`, que recolorea la
  tinta y **copia el canal alfa intacto**.

### `PENDIENTE BRANDING`

1. **Tipografía de display.** La web usa Inter + Unbounded. La app usa la
   tipografía del sistema (San Francisco / Roboto) — decisión consciente: es la
   única que trae todos los pesos y tamaños ópticos que Dynamic Type necesita.
   Empaquetar una fuente de titulares es una mejora posterior. Nota SaaS: una
   fuente de marca por tenant es un problema distinto y más caro (descarga,
   licencia, fallback), y no se aborda aquí.
2. **Correo de soporte.** El documento de marca del piloto lista WhatsApp y
   redes, pero ningún correo. `pilotCompanyBrand.supportEmail` es `''` y el
   Perfil **oculta la fila** en lugar de inventar una dirección.
3. ~~**Colores de marca por tenant.**~~ **RESUELTO en UI7.**
4. **Logo por tenant.** `CompanyBrand.logoUrl` existe y sigue siendo `null`: el
   backend no sirve todavía un logo, y la app no inventa uno. Un tenant sin logo
   ve su nombre, no la marca de otro.
5. **`secondaryColor` sin uso.** El contrato lo trae; el sistema todavía no
   tiene un rol semántico para un segundo color de marca, y darle uno sin
   necesidad sería inventar diseño. Se anota, no se gasta.

## Tokens

`src/theme/`, un archivo por eje.

| Archivo | Contenido |
|---|---|
| `colors.ts` | Paleta acromática de plataforma + tokens semánticos por esquema |
| `contrast.ts` | Matemática de color: parseo, luminancia, ratio WCAG, composición |
| `tenant-accent.ts` | Aplica el color del tenant, y decide qué **no** puede tocar |
| `materials.ts` | De qué está hecha una superficie (ver abajo) |
| `typography.ts` | Escala de tipo (nombres de iOS: display…caption) |
| `spacing.ts` | `4 8 12 16 20 24 32 40 48` + `screenGutter` |
| `radius.ts` | `6 10 14 18 24 999` |
| `shadows.ts` | Elevación por plataforma y esquema |
| `sizes.ts` | Touch targets, alturas de control, iconos, avatares |
| `index.ts` | `buildTheme(scheme, tenantAccent)` memoizado por los dos |

Los tokens de color son **semánticos** (`surfacePressed`, `statusWarningSurface`),
no descriptivos (`gray200`). Un componente pide lo que significa, no lo que se
ve, y el esquema resuelve.

Un test (`__tests__/theme.test.ts`) verifica que claro y oscuro definan
exactamente las mismas claves: una clave presente solo en uno es invisible hasta
que alguien cambia de tema y recibe `undefined` como color.

`buildTheme` está memoizado por **esquema y acento**: dos tenants no comparten
objeto de tema, y la identidad del objeto es dependencia de cada `useMemo` que
construye un StyleSheet aguas abajo — uno nuevo por render los invalidaría
todos.

## Materiales — de qué está hecha una superficie

El lenguaje visual que adopta UI7 es de capas: paneles de material esmerilado
que flotan sobre el contenido y recogen lo que hay detrás. **Un token de color
no puede expresar eso**, porque la respuesta depende de la plataforma, de los
ajustes de accesibilidad y de si hay algo detrás del panel. Así que el sistema
nombra MATERIALES, y cada uno trae todo lo que hace falta para dibujarlo en
cualquiera de esas situaciones.

| Material | Para qué |
|---|---|
| `chrome` | Barras que flotan sobre contenido con scroll |
| `card` | Panel en reposo |
| `raised` | Panel que debe leerse elevado sobre `card` |
| `overlay` | Fondos de modal y de hoja |

Cada material lleva `blurTint`, `intensity`, `tintColor` (pintado **sobre** el
desenfoque, para que el panel mantenga su tono sobre cualquier fondo),
`fallbackColor`, `borderColor` y `highlightColor`.

### El desenfoque es la mejora, no el diseño

`GlassSurface` está escrito **fallback primero**: la versión esmerilada es la
rama, no la base. Tres situaciones lo apagan, y ninguna es exótica:

1. **Android.** El desenfoque eficiente necesita RenderNode (SDK 31+) y, en
   `expo-blur`, un `BlurTargetView` envolviendo el contenido detrás de **cada**
   panel. Es un cambio arquitectónico en todas las pantallas a cambio de un
   efecto que Material Design no pide.
2. **«Reducir transparencia».** Quien lo activó le está diciendo al sistema que
   la translucidez le cuesta legibilidad. Ignorarlo no es una decisión de
   estilo. `useReducedTransparency()`, hermano de `useReducedMotion()`.
3. **Listas.** Un panel desenfocado por fila es una pasada de composición por
   fila. `Card` es sólida por defecto justo por eso; solo `variant="glass"`
   esmerila.

Un test verifica que el texto principal pasa **AA sobre el fallback** de los
cuatro materiales en los dos esquemas: si el fallback no fuera legible, apagar
el desenfoque sería romper la app en vez de degradarla.

`GlassSurface` es el **único** módulo que importa `expo-blur`, y un test
estructural lo vigila. Así apagar el efecto es una prop, no una auditoría.

### Los materiales no se tiñen con la marca

Los paneles están hechos de la página, no del tenant. Una tarjeta teñida de
marca es un todo teñido de marca, y el acento deja de significar algo. Se
derivan de los mismos `ColorTokens` que todo lo demás, así que no hay una
segunda paleta que mantener sincronizada.

### El filo especular

Una hairline más clara en el borde superior de cada panel. Es lo que hace que
una superficie se lea como una capa física y no como un rectángulo gris: el
cristal real recoge luz en el filo más cercano a la fuente. **Una hairline, no
un gradiente** — un gradiente por panel es una subida de textura por panel.

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

**Primitivas:** `Text` · `Icon` · `GlassSurface`
**Contenedores:** `Screen` · `Card` · `Divider` · `SectionHeader` · `AppHeader`
**Controles:** `Button` · `IconButton` · `Input` · `SearchInput` · `ListRow`
**Indicadores:** `Badge` · `StatusBadge` · `Avatar` · `Skeleton`
**Estados:** `LoadingState` · `EmptyState` · `ErrorState`

Detalles con intención:

- **`Text`** es la única forma de escribir texto. Usar el `Text` de React Native
  es cómo entra un `fontSize: 15` a mano en un proyecto que tiene una escala.
- **`Screen`** posee safe area, fondo, teclado y ancho máximo de línea. Desde
  UI7 las barras **flotan**, así que la escena pasa por debajo de las dos: lee
  `BottomTabBarHeightContext` y `HeaderHeightContext` —los **contextos**, no los
  hooks, que lanzan fuera de su navegador— y acolcha por la altura real. Se
  arregla una vez, para todas las pantallas, en lugar de treinta pantallas
  adivinando 49 o 56 puntos. La altura del header **ya incluye** el inset de la
  barra de estado, así que sustituye a `insets.top` en vez de sumarse: esa suma
  es la forma clásica de que una pantalla empiece un centímetro más abajo.
- **`GlassSurface`** es el único sitio donde la app decide si una superficie es
  esmerilada. Todo componente que quiere el aspecto pide un **material**.
- **`Card`** es un panel con filo. **Sólida por defecto**: las tarjetas son la
  fila de todas las listas de esta app.
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
| Fondo | material `chrome`, vía `tabBarBackground` |
| Borde superior | `colors.border`, con `sizes.hairline` |
| Icono/etiqueta activos | **`colors.accentText`** — el color del tenant, corregido |
| Icono/etiqueta inactivos | `colors.textTertiary` |

La barra es `position: absolute` desde UI7: flota sobre el contenido, que es
exactamente el caso para el que existe el material esmerilado, y el único donde
el coste de composición se paga una vez por pantalla en lugar de una vez por
fila. El tinte activo es la única pieza de chrome primario que lleva el color de
una empresa, y lleva `accentText` y no `accent`: el color de marca crudo es un
relleno, y una etiqueta de pestaña hay que leerla.

**Deuda anotada:** en las pantallas con su propia `FlatList`, el hueco de la
barra se aplica al contenedor, así que el viewport termina encima de la barra en
vez de que las filas viajen por debajo. Un poco menos de efecto, y correcto sin
editar cada lista.

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
- Sombras muy discretas (opacidad 0.05–0.14). La profundidad viene sobre todo
  de la rampa de materiales y del filo especular, no de la sombra.
- Desenfoque nativo vía `expo-blur` (SDK 57) en barras de navegación, barra de
  pestañas y banner de sin conexión. Nada de gradientes por panel.

## Android

Misma marca, misma jerarquía, mismas funciones — con comportamiento del sistema:

- Bottom navigation de Material, con su ripple.
- Botón/gesto de retroceso del sistema, gestionado por el navegador nativo.
- **Predictive back deshabilitado** (`predictiveBackGestureEnabled: false`), por
  compatibilidad y no por estética — ver README > Android.
- Material Symbols en vez de SF Symbols.
- Elevación en vez de sombras iOS.
- **Material opaco en vez de desenfoque**, por decisión: el desenfoque eficiente
  necesita SDK 31+ y `BlurTargetView` detrás de cada panel. El fallback está
  diseñado para verse terminado, no para verse degradado.
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
- **Contraste:** ya no es una variante escrita a mano por esquema, sino un
  cálculo. `accentText` se deriva del color del tenant y se corrige contra la
  página **y** contra el lavado de acento; `textOnAccent` se elige midiendo. Los
  estados siguen usando pares foreground/surface calculados por esquema.
- **Color nunca solo:** todo estado lleva texto además de color.
- **Reduce Motion:** `useReducedMotion()`; el Skeleton lo respeta.
- **Reduce Transparency:** `useReducedTransparency()`; cada `GlassSurface`
  vuelve a su material opaco. iOS solamente — React Native no expone equivalente
  en Android, donde de todos modos ya se dibuja el material opaco.

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
