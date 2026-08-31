# Estrategia offline

## Principio: offline-AWARE, no offline-FIRST

`DEC-MOBILE-003`

La app **detecta, comunica y sobrevive** a la pérdida de conexión. **No**
replica la base de datos, no encola mutaciones y no persiste la cache.

| Sí hace | No hace |
|---|---|
| Detectar conectividad | Replicar PostgreSQL |
| Comunicarla sin alarmismo | Persistir pedidos localmente |
| Evitar peticiones inútiles | Permitir mutaciones críticas offline |
| Conservar en memoria lo ya cargado | Inventar sincronización |
| Reintentar lo transitorio | Cola de mutaciones |
| Revalidar al reconectar | Cache en disco |

El motivo no es esfuerzo: es **autoridad del servidor**. Aprobar una cotización,
cancelar un pedido o cambiar el estado de una reparación son decisiones que solo
el backend puede tomar. Una cola offline las convertiría en promesas que la app
no puede cumplir.

---

## Conectividad

**Dependencia:** `expo-network` (57.0.1), Expo-managed, una sola.

Se descartó `@react-native-community/netinfo`: es más pesada y su ventaja real
—distinguir "conectado sin internet"— no es fiable en iOS, donde la propia
documentación de Expo dice que `isInternetReachable` *"will always be the same
as `isConnected`"*.

### Modelo — tres estados y ni uno más

```ts
type ConnectivityState = 'unknown' | 'online' | 'offline';
```

- **`unknown` es un estado real**, no un hueco. En el primer frame todavía no
  hemos preguntado al sistema, y decirle a alguien que está sin conexión antes
  de saberlo es una falsa alarma que recordará.
- No se modela "conectado sin internet" como estado propio: en iOS sería mentira
  en la mitad de los dispositivos.
- Sí se honra un `isInternetReachable === false` **explícito**, porque en Android
  significa de verdad "red sin internet" — el portal cautivo del hotel. Un
  `undefined` significa "no reportado", no "no".

### Provider

`ConnectivityProvider` mantiene **una sola suscripción** para toda la app. Una
por pantalla serían N listeners nativos, N despertares en cada transición de
radio y N oportunidades de olvidar un cleanup.

Pregunta al sistema una vez al montar, porque el listener solo dispara ante
**cambios**: sin esa consulta inicial la app se quedaría en `unknown` hasta que
el usuario entrase en un ascensor.

---

## TanStack Query

### `onlineManager`

Alimentado con conectividad real. TanStack ya sabe pausar y reanudar alrededor
de un periodo offline; lo único que no puede es ver la radio.

`unknown` cuenta como online: negarse a pedir porque aún no terminamos de
preguntar al sistema bloquearía la primera pantalla.

### `focusManager`

React Native no tiene `window.focus`, así que sin este puente
`refetchOnWindowFocus` es configuración muerta. Se alimenta de `AppState`:

```
active            → focused
background        → blurred
inactive (iOS)    → blurred
```

`inactive` es el estado transitorio de iOS —el app switcher, una llamada
entrante—. Tratarlo como foco produciría un parpadeo focus/blur cada vez que el
usuario desliza hacia arriba.

Al volver a primer plano se revalida **lo que está stale**, no todo: `staleTime`
sigue aplicando, y esa distinción es lo que impide que un foreground se
convierta en una tormenta de peticiones.

---

## Política de reintentos

`src/providers/retry-policy.ts` — funciones puras, testeadas directamente.

Regla: reintentar **solo** fallos que un intento posterior podría plausiblemente
arreglar.

| Fallo | Reintenta | Motivo |
|---|---|---|
| 400 / validación | no | El payload no se vuelve válido solo |
| 401 | no | Refrescar el token es trabajo del pipeline de auth, no del retry |
| 403 | no | El permiso no aparece por preguntar dos veces |
| 404 | no | Sigue sin estar |
| **429** | **no** | Reintentar un throttle lo empeora |
| timeout | sí | El servidor pudo ir lento |
| offline / red | sí | La radio puede volver |
| 5xx | sí | Transitorio del servidor |
| `not_configured` | no | Falta la URL base: es un problema de build |
| feature/auth unavailable | no | No hay backend; no aparecerá entre intentos |
| abort del caller | no | El usuario se fue de la pantalla |
| desconocido | no | Si no sabemos clasificarlo, no podemos afirmar que sea transitorio |

**Máximo 2 reintentos** (3 intentos). Backoff **1 s → 2 s → tope 8 s**, sin
jitter: con dos reintentos en un dispositivo el jitter no aporta y volvería
frágil cada aserción de tiempo.

**Mutations: `retry: false`.** Una query es una pregunta y repetirla es inocuo.
Una mutación es una acción, y reintentarla tras un fallo ambiguo puede
ejecutarla dos veces — un pedido duplicado, una reparación aprobada dos veces.
Reintentar mutaciones exige claves de idempotencia del backend primero.

> **Deuda:** `429` podría respetarse con `Retry-After`, pero eso requiere
> propagar la cabecera dentro de `ApiError` primero.

---

## Aislamiento de cache

`DEC-MOBILE-002` — ver `docs/ARCHITECTURE.md`.

### El problema

M0 usaba claves globales: `['products']`, `['orders']`, `['company-brand']`. En
un piloto de una tienda funciona. En un SaaS es una fuga esperando a ocurrir, y
**no hace falta ningún bug de backend**:

- el catálogo de la Empresa A respondiendo a una petición de la build de B;
- los pedidos del Usuario A todavía en memoria cuando entra el Usuario B.

### La regla

| Visibilidad | Prefijo | Ejemplo |
|---|---|---|
| tenant-público | `['tenant', slug, 'public', …]` | catálogo, marca |
| tenant + usuario | `['tenant', slug, 'user', id, …]` | pedidos, reparaciones |
| global | `['global', …]` | (nada todavía) |

⚠️ **Esto es un NAMESPACE DE CACHE, no autorización.** El slug viene de la
configuración de build y un slug nunca ha sido una credencial. La autoridad es
del servidor, que debe acotar su propio queryset — BR-002. Particionar la cache
evita que los datos de un tenant aparezcan en la pantalla de otro; no decide
quién puede pedirlos.

El **id estable** del usuario, nunca el email: un email cambia, y metería un
identificador personal en cada clave de cache y en cada volcado de devtools.

Los datos públicos del tenant **no** se acotan por usuario: el catálogo es el
mismo para todos en una empresa, y acotarlo multiplicaría la cache y volvería a
descargar la tienda en cada login.

### Limpieza

`SessionCacheCoordinator` observa la **identidad** (`tenant::user`) y cubre tres
transiciones con una sola regla, porque las tres son el mismo problema — la
cache sobreviviendo a la persona a la que pertenecía:

```
cierre de sesión   usuario 42 → anónimo
cambio de usuario  usuario 42 → usuario 77
cambio de empresa  blackdog → otra-empresa   (futuro)
```

`clearPrivateQueries()` **cancela antes de borrar**: una petición en vuelo de la
identidad anterior aterrizaría después y repoblaría justo lo que se acaba de
limpiar.

Los datos públicos del tenant se conservan a propósito: no contienen nada
personal, y tirarlos haría que cada cierre de sesión volviese a descargar la
tienda sin ningún beneficio de seguridad.

---

## UX offline

| Situación | Qué se muestra |
|---|---|
| Offline | Banda discreta: *"Sin conexión / Mostrando la información disponible."* |
| Offline **con** datos en cache | Los datos, más *"Sin conexión. Esta información puede no estar actualizada."* |
| Offline **sin** datos | El estado vacío o de error propio de la pantalla |
| Feature sin backend | *"Próximamente"* — **no** es lo mismo que offline |
| Catálogo vacío | *"Catálogo vacío"* — **no** es lo mismo que offline |
| Error reintentable | Mensaje + botón **Reintentar** |
| Error no reintentable | Copia adecuada, sin bucle |

Cuatro desenlaces que se confunden constantemente, y cada confusión le dice al
cliente algo falso sobre su cuenta o sobre el negocio.

**El banner no es un modal ni un toast.** Perder cobertura es una condición, no
un evento que merezca interrumpir lo que alguien está haciendo. No tapa
contenido, y desaparece solo al reconectar: que se vaya **es** la confirmación.

**Pull-to-refresh** se retira cuando no podría funcionar — offline o feature sin
backend. Con `onlineManager` conectado, un refetch offline queda *pausado*, no
rechazado, así que el control giraría hasta que volviese la radio.

**Home es parcialmente resiliente.** Lee tres fuentes independientes y ninguna
puede llevarse la pantalla por delante. Una sección cuya feature no tiene
backend se **oculta** en lugar de renderizarse vacía: *"no tienes reparaciones
activas"* es una afirmación sobre la cuenta del cliente, y sería falsa.

---

## Lo que NO se hizo, y por qué

### Persistencia de la query cache — `PENDIENTE`

No se instaló ningún persister (`AsyncStorage`, SQLite, MMKV). Antes hace falta
resolver:

- partición por tenant **en disco**;
- partición por sesión;
- borrado en logout;
- cifrado: los pedidos y las reparaciones son datos personales;
- versión de esquema y migración;
- política de retención.

Persistir primero y resolver eso después significa datos de un cliente
sobreviviendo en el disco de un dispositivo compartido.

### Cola de mutaciones offline — `PROPUESTA / PENDIENTE`

No se encolan, explícitamente: aprobación de cotización, cancelación de pedido,
cambios de reparación, pagos, cambios de estado, entrega, acciones de
inventario. Todas requieren **autoridad del servidor**.

### Auth offline

Sin cambios respecto a M1. Si en el futuro existe un refresh token y la app
arranca sin red:

- **no** se borra el token solo por no haber red (`RefreshNetworkError` ≠
  `RefreshRejectedError`);
- **tampoco** se declara la sesión autenticada sin validación.

El estado intermedio es `temporarily-unavailable`. Ver `docs/MOBILE_AUTH.md`.

---

## Seguridad de la cache

- Nunca se guarda en la query cache: contraseñas, access token, refresh token,
  cabeceras `Authorization`.
- **Ningún token aparece jamás en una query key.** Las keys se imprimen en
  devtools, se registran y se serializan. Hay un test que lo verifica sobre las
  ocho keys del sistema.
- Las keys solo contienen namespaces y parámetros de consulta, y solo primitivos
  — un objeto podría llevar dentro una sesión entera o un bolso de cabeceras.
