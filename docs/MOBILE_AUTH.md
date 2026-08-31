# Autenticación Mobile

## AUTENTICACIÓN MOBILE REAL: PENDIENTE

En M0/M0.1 **no existe** autenticación contra Django. La app entra en modo mock,
y cada pantalla de sesión lo dice en su propia interfaz.

---

## Por qué no se conectó

No es una tarea que faltó hacer. El contrato actual del backend no puede ser
consumido por un cliente nativo, y **cambiarlo no es decisión de Mobile**.

Verificado en `origin/master` @ `2624d47`:

**`store/authentication.py::CookieJWTAuthentication`**

```python
raw_token = request.COOKIES.get(settings.JWT_COOKIE_ACCESS_NAME)  # 'blackdog_access'
...
enforce_csrf(request)
```

**`store/auth_views.py::LoginView`**

```python
response = Response({'detail': 'Login correcto.', 'user': ...})
_set_auth_cookies(response, data['access'], data['refresh'])
```

Los tokens salen **solo** en cookies. El body no los contiene — comentado en el
propio código como decisión intencional.

**`backend/settings.py`**

```python
DEFAULT_AUTHENTICATION_CLASSES = ('store.authentication.CookieJWTAuthentication',)
JWT_COOKIE_HTTPONLY = True
CSRF_COOKIE_HTTPONLY = False   # para que fetchWithAuth pueda leer csrftoken
```

`CSRF_COOKIE_HTTPONLY = False` existe para que el **JavaScript de una página
web** lea el token. Una app nativa no tiene esa página.

### Por qué es correcto para web y no sirve para móvil

Para un navegador este diseño es el bueno: un token HttpOnly no es robable por
XSS, y CSRF cubre el envío automático de cookies entre orígenes.

Para una app nativa:

- No hay un frasco de cookies inspeccionable de forma fiable desde JS.
- No hay página desde la que leer `csrftoken`.
- El vector que CSRF mitiga —el navegador adjuntando cookies solo— **no existe**.

---

## Diseño propuesto para M1 (BR-001, revisado en M0.1)

### Lo que Mobile ya NO propone

M0 proponía añadir una clase Bearer a
`REST_FRAMEWORK.DEFAULT_AUTHENTICATION_CLASSES`, "junto a"
`CookieJWTAuthentication`. **Esa propuesta fue retirada en M0.1.**

`DEFAULT_AUTHENTICATION_CLASSES` aplica a **todas** las vistas del proyecto,
incluidas las ~30 rutas `/api/admin/*` y las `/api/me/*`. Añadir ahí un
mecanismo Bearer sin CSRF habría ampliado la superficie de autenticación de toda
la administración para resolver un problema del catálogo y los pedidos de un
cliente. El radio de impacto de cualquier fallo en esa clase habría incluido la
gestión de usuarios, roles, inventario y notas de venta.

### Lo que Mobile propone ahora

Una superficie **nueva y acotada**, sin tocar nada de lo existente:

```
POST /api/v1/auth/login/      → { access, refresh, expires_in, user }
POST /api/v1/auth/refresh/    → refresh en el body
POST /api/v1/auth/logout/     → blacklist del refresh
```

Y una clase `MobileTokenAuthentication` que lea `Authorization: Bearer`,
declarada **por vista** en `authentication_classes`, **solo** en las vistas de
`/api/v1/`. Nunca en `settings`.

**Se mantienen intactos**, y esto es la mitad del punto:

- `/api/auth/login/`, `/api/auth/refresh/`, `/api/auth/logout/`
- `CookieJWTAuthentication` como única clase por defecto
- CSRF en todo el contrato existente
- `/api/admin/*` completo
- El frontend Next.js

La prueba que demuestra el acotamiento: *un Bearer válido NO autentica en
`/api/admin/*` ni en `/api/auth/me/`.*

---

## Lo que Mobile NO hizo, deliberadamente

- ❌ No modificó `BlackDogStore-web`. Ni una línea.
- ❌ No pidió que el login web devuelva los JWT en el body.
- ❌ No propuso mover tokens web a `localStorage`.
- ❌ No desactivó CSRF en ninguna ruta.
- ❌ No implementó un refresh token real ni guardó ningún token.
- ❌ **(M0.1)** No envía ninguna cabecera de un contrato no aprobado. El cliente
  HTTP ya no manda `X-Company-Slug` — ver BR-002.

`src/api/client.ts` envía `credentials: 'omit'` de forma explícita, con el
motivo comentado en el propio archivo.

---

## Lo que sí existe (arquitectura preparatoria)

| Pieza | Archivo | Qué hace |
|---|---|---|
| `AuthSession` | `src/auth/types.ts` | Forma de la sesión. **No contiene el token**: ese va a Keychain, no a estado de React. |
| `AuthRepository` | `src/auth/auth-repository.ts` | La costura. Cuatro operaciones, sin token en las firmas. |
| `MockAuthRepository` | `src/auth/mock-auth-repository.ts` | Acepta cualquier credencial válida. No persiste nada. |
| `AuthProvider` | `src/auth/auth-provider.tsx` | Estado de sesión. Repositorio inyectable. |
| `SecureStorage` | `src/storage/secure-storage.ts` | Envoltorio sobre `expo-secure-store`. **Sin usar todavía.** |

Detalles con intención:

- **`AuthSession` no lleva el token.** Un token en estado de React acaba en un
  reporte de crash o en un log de devtools.
- **`MockAuthRepository.restoreSession()` devuelve `null` siempre.** Una sesión
  falsa no debe sobrevivir a un relanzamiento y confundirse con una real.
- **`signOut()` limpia el estado antes de la llamada de red.** Si la petición
  falla, el dispositivo ya dejó de mostrar datos de cuenta.
- **`AuthMode` es `'mock' | 'backend'`**, no un booleano oculto: el Perfil
  muestra el badge correspondiente.

---

## Almacenamiento de secretos

**Tokens → `expo-secure-store`** (Keychain en iOS, Keystore en Android), con
`WHEN_UNLOCKED_THIS_DEVICE_ONLY`: no migran a un dispositivo nuevo en una
restauración de backup.

**Preferencias → AsyncStorage** (`src/storage/preferences-storage.ts`), sin
cifrar, y **solo** para cosas no sensibles como el tema.

Los dos módulos están separados a propósito: usar el equivocado exige importar
el equivocado.

`SecureStore` no tiene implementación web. El envoltorio **lanza** en lugar de
caer a `localStorage`, donde cualquier script podría leer el token.

Nunca se guarda: contraseñas, secretos de Django, claves de Stripe, credenciales
de firma.

---

## Ruta para M1

1. El equipo Backend evalúa **BR-007** (superficie `/api/v1/`) y **BR-001**.
2. Si se aceptan: `ApiAuthRepository` implementa `AuthRepository`, guarda tokens
   con `SecureStorage`, y `src/api/client.ts` añade `Authorization: Bearer`
   **solo** para rutas `/api/v1/`.
3. Refresh transparente ante un 401, con una sola renovación en vuelo.
4. Cierre de sesión que hace blacklist del refresh y llama a `clearSecureStorage()`.
5. Biometría (`expo-local-authentication`) como reapertura, **nunca** como
   sustituto de la autenticación.

Nada de esto empieza antes de que Backend se pronuncie.
