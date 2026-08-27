# Autenticación Mobile

## AUTENTICACIÓN MOBILE REAL: API_PENDING

M1 **no** implementa autenticación contra Django. Construye toda la arquitectura
segura para que, cuando Backend publique el contrato, la integración sea
*conectar un transporte*, no rediseñar la aplicación.

Verificado en `PapiCuche/BlackDogStore-web` @ `origin/master`
`2624d478af5cd3cc90c4b65d9aa4c81bb2439cfc`.

---

## 1. El contrato web actual, y por qué no se toca

```python
# store/authentication.py
raw_token = request.COOKIES.get(settings.JWT_COOKIE_ACCESS_NAME)  # 'blackdog_access'
enforce_csrf(request)

# store/auth_views.py — LoginView
response = Response({'detail': 'Login correcto.', 'user': UserSerializer(...).data})
_set_auth_cookies(response, data['access'], data['refresh'])   # tokens SOLO en cookies

# backend/settings.py
DEFAULT_AUTHENTICATION_CLASSES = ('store.authentication.CookieJWTAuthentication',)
CSRF_COOKIE_HTTPONLY = False   # para que el JS de una PÁGINA lea csrftoken
```

Para un navegador este diseño es el correcto: un token HttpOnly no es robable
por XSS y CSRF cubre el envío automático de cookies entre orígenes.

Para una app nativa no sirve:

- no hay frasco de cookies inspeccionable de forma fiable desde JS;
- no hay página desde la que leer `csrftoken`;
- el vector que CSRF mitiga —el navegador adjuntando cookies solo— **no existe**.

**Mobile no modifica nada de esto.** Ni una línea.

### Hallazgos de M1 sobre el contrato real

| Hallazgo | Consecuencia |
|---|---|
| `LoginView` usa `TokenObtainPairSerializer` sobre el `auth.User` estándar → `USERNAME_FIELD = 'username'` | El login real espera **username**, no email. El formulario Mobile pide email. BR-001 debe decidirlo. |
| `UserSerializer` = `[id, username, email, first_name, last_name]` — **sin `role`** | `role` solo llega desde `GET /api/auth/me/`. El login no lo devuelve. |
| `AccountToken.make()` = `secrets.token_urlsafe(48)` | La verificación de correo usa un **token opaco largo**, no un código de 6 dígitos. El validador Mobile se corrigió en M1. |
| `ROTATE_REFRESH_TOKENS` + `BLACKLIST_AFTER_ROTATION` | Todo refresh exitoso **invalida** el token enviado. El diseño Mobile lo asume. |
| No existe `/api/v1/` de ningún tipo | El pipeline autenticado queda **inerte** por diseño. |

---

## 2. Arquitectura

```
AuthProvider            estado de sesión + epoch anti-carrera
   │
   ├── resolveAuthRepository()      ← composition root, decide desde la policy
   │        ├── MockAuthRepository        development / staging opt-in
   │        ├── ApiAuthRepository         NO EXISTE (BR-001)
   │        └── null                      → status 'unavailable'
   │
   └── (futuro) AuthTransport
            ├── FakeAuthTransport         solo tests
            └── DjangoAuthTransport       NO EXISTE

RefreshCoordinator   single-flight + rotación + epoch
   ├── AccessTokenStore    memoria, nunca disco, nunca React
   └── CredentialVault     SecureStore, solo el refresh token
```

### Session ≠ Tokens ≠ Profile

| | Qué es | Dónde vive |
|---|---|---|
| `AuthSession` | Estado de producto. Lo que la UI pinta. | React state |
| `UserProfile` | Quién es la persona. | Dentro de la sesión |
| `TokenPair` | Credenciales de transporte. | **Nunca** en React |

No es orden por gusto: el estado de React acaba en volcados de devtools,
snapshots de Fast Refresh y reportes de crash. Eso es aceptable para un nombre y
fatal para un token.

---

## 3. Política de autenticación

`src/auth/auth-policy.ts` — la misma filosofía fail-safe de M0.1 y M0.2.

| Entorno | contrato backend | mocks | Resultado |
|---|---|---|---|
| cualquiera | sí | — | `backend` |
| **production** | no | cualquiera | **`unavailable`** — nunca mock |
| staging | no | opt-in explícito | `mock` |
| staging | no | off | `unavailable` |
| development | no | on | `mock` |
| development | no | off | `unavailable` |

`isBackendAuthAvailable` es una **constante de código**, no una variable de
entorno: una variable permitiría afirmar que el contrato está listo sin que
exista código capaz de hablarlo. Solo cambia en el mismo commit que añada el
transporte.

**Riesgo corregido en M1:** `AuthProvider` hacía
`new MockAuthRepository()` como parámetro por defecto. En un release eso
significaba *escribe cualquier cosa y entras*. Nada detrás filtraba datos —
M0.1/M0.2 ya lo retenían— pero una app distribuible no debe aceptar credenciales
que no puede verificar.

---

## 4. Access token — SOLO MEMORIA

`src/auth/tokens/access-token-store.ts`

**Nunca** se persiste. Ni SecureStore, ni AsyncStorage, ni React state.

- Vive 30 minutos (`ACCESS_TOKEN_LIFETIME` en `origin/master`): persistirlo casi
  no ahorra nada.
- Lo que se escribe en el Keychain sobrevive a la muerte del proceso y a las
  ventanas de backup. Una credencial que no necesita sobrevivir, no debe.
- Matar la app debe terminar la capacidad de hacer llamadas autenticadas. El
  refresh token, que **sí** se persiste, es lo que reabre la sesión.

Un token dentro del margen de 30 s antes de expirar se trata como **ausente**:
adjuntarlo convertiría un refresh predecible en un 401.

---

## 5. Refresh token — SecureStore

`src/auth/tokens/credential-vault.ts` → Keychain (iOS) / Keystore (Android), con
`WHEN_UNLOCKED_THIS_DEVICE_ONLY`: no migra a otro dispositivo en un restore.

Es la **única** credencial persistida. La clave `bds.auth.access_token` que M0
había reservado quedó **retirada**; solo se conserva su nombre para que
`clearSecureStorage()` borre cualquier resto de una build anterior.

### Rotación, y por qué el orden importa

```
refresh antiguo → servidor rota → persistir NUEVO → instalar access
```

Persistir **primero**. El servidor ya invalidó el token enviado
(`BLACKLIST_AFTER_ROTATION`), así que si la escritura falla *después* de haber
instalado el access, la app parecería autenticada sosteniendo un refresh que el
servidor rechaza: funcionaría hasta que el access expirase y luego fallaría de
una forma que nadie puede reproducir.

**Fallo de persistencia durante la rotación → se cierra sesión.** No se oculta.

---

## 6. Single-flight refresh

`src/auth/refresh-coordinator.ts`

```
10 requests → 401 → una sola petición de refresh → todas continúan
```

No es una optimización. Con rotación + blacklist, diez refresh concurrentes
rotarían diez veces y nueve presentarían un token ya invalidado: la sesión
moriría.

---

## 7. Reintentos

| Situación | Acción | Por qué |
|---|---|---|
| **401** | refresh **una vez** → reintento **una vez** | Es lo único que un refresh arregla. |
| **Segundo 401** | se propaga | El token es nuevo: el problema no es la antigüedad. Reintentar es un bucle. |
| **403** | **nunca** refresh | Autenticado pero sin permiso. Rotar no concede permisos y quema la cadena. |
| **Fallo de red** | **nunca** refresh | Nada fue rechazado. |
| **Abort del caller** | **nunca** refresh | Una pantalla que se fue no debe rotar la sesión al salir. |

---

## 8. Refresh fallido

| Resultado | Credenciales | Estado |
|---|---|---|
| `rejected` (inválido / expirado / blacklisted) | **borradas** | `unauthenticated` |
| `network` | **conservadas** | `temporarily-unavailable` |
| `superseded` (hubo logout) | borradas | `unauthenticated` |
| `no-credentials` | — | `unauthenticated` |

Un fallo de red **no** es un refresh inválido. Cerrar la sesión de alguien por
entrar en un ascensor no es aceptable; fingir acceso válido indefinidamente,
tampoco. De ahí el estado intermedio.

---

## 9. Logout

```
1. bump del epoch          ← invalida todo lo que esté en vuelo
2. limpiar UI              ← el dispositivo deja de mostrar datos de cuenta
3. limpiar access + vault
4. best-effort revoke
```

Local primero, red al final. Un logout que no hace nada porque la petición falló
es un problema de seguridad real. La revocación server-side usa una copia en
memoria del refresh capturada antes de borrarlo.

---

## 10. Carreras

| Carrera | Mitigación |
|---|---|
| logout mientras hay un refresh en vuelo | epoch en el coordinator: el resultado tardío devuelve `superseded` y **no instala nada**; además limpia el token ya rotado |
| logout mientras hay un login en vuelo | epoch en el provider: el login tardío se descarta |
| dos logins fuera de orden | el más lento no puede sobrescribir al más nuevo |
| 10 requests con 401 simultáneo | single-flight |

---

## 11. Bootstrap de sesión

```
inicio → ¿hay refresh token?
           ├─ no → unauthenticated
           └─ sí → refresh → sesión + access nuevo
```

En M1 **no se ejecuta ningún refresh real** (no hay transporte). Los estados sí
existen:

```
loading · authenticated · unauthenticated · unavailable · temporarily-unavailable
```

`unavailable` y `temporarily-unavailable` se parecen y son opuestos: el primero
es permanente para esta build y el formulario sería mentira; el segundo es un
corte de red y las credenciales siguen siendo buenas.

### Transiciones

```
unauthenticated ──login──> authenticated
authenticated ──logout──> unauthenticated
authenticated ──refresh rejected──> unauthenticated
authenticated ──refresh network error──> temporarily-unavailable
(sin repositorio) ──> unavailable
```

---

## 12. Tenant y autorización

**`EXPO_PUBLIC_COMPANY_SLUG` no otorga acceso.** Es la *elección de escaparate*
de una build, no una credencial.

`AuthSession.tenant` es `null` hasta que un contrato lo entregue **validado por
el servidor** — exactamente lo que `store/tenancy.py` ya hace para staff con
`resolve_company_for_user`. El slug puede *elegir entre* lo que el usuario ya
puede ver; nunca ampliarlo.

### Multiempresa

Un usuario SaaS puede pertenecer a varias empresas, así que la forma lo admite
desde el principio:

```ts
type AuthTenantContext = {
  activeCompany: AuthCompanyRef | null;
  availableCompanies: readonly AuthCompanyRef[];
};
```

No hay selector de empresa todavía, y no lo habrá hasta que exista contrato.
Modelarlo como *un usuario → una empresa* habría que deshacerlo después.

---

## 13. Bearer y su alcance

`src/api/api-scope.ts`

| Scope | Dónde | Credencial |
|---|---|---|
| `public` | catálogo, marca | ninguna |
| `authenticated-v1` | `/api/v1/` — **propuesta** | Bearer |
| `legacy-web` | `/api/auth/*`, `/api/admin/*`, `/api/me/*` | cookie + CSRF (no Mobile) |

`assertBearerAllowed()` exige **dos** condiciones: que el caller declare el scope
autenticado **y** que la ruta esté bajo `/api/v1/`. Cualquiera de las dos sola ha
bastado, en otros proyectos, para filtrar una credencial.

Hoy nada de esto se ejecuta: `authenticatedRequest()` lanza
`AuthUnavailableError` antes de tocar la red mientras `policy.mode !== 'backend'`.

---

## 14. Contraseñas

Nunca se persisten, nunca se registran, nunca viajan en un error, nunca se
copian a AsyncStorage. `MockAuthRepository` ni siquiera lee el campo. Hay un test
que serializa la sesión y comprueba que la contraseña no aparece.

---

## 15. Threat model

| Amenaza | Mitigación |
|---|---|
| **Token robado del almacenamiento** | Solo el refresh se persiste, en Keychain/Keystore con `WHEN_UNLOCKED_THIS_DEVICE_ONLY`. El access nunca toca disco. |
| **Token en logs** | `redact.ts`: `redactSecret` no muestra prefijo ni sufijo (en un JWT ambos son estructura conocida). `describeAuthError` no recorre `cause`, que es donde se esconde un request con `Authorization`. |
| **Replay del refresh** | El backend rota y hace blacklist. Mobile nunca reutiliza un refresh ya presentado. |
| **Carrera de refresh** | Single-flight: una sola petición para N callers. |
| **Sesión zombi** | Un refresh rechazado borra credenciales y sesión. Un `superseded` limpia el token ya rotado. |
| **Mock auth en producción** | Dos barreras independientes: `mockDataPolicy` prohíbe mocks en production (M0.1) y `resolveAuthRuntimePolicy` comprueba production **antes** de la rama mock. |
| **Bearer al endpoint equivocado** | `assertBearerAllowed` con doble condición + lista explícita de prefijos legacy. |
| **Manipulación de tenant** | El slug no autoriza. El tenant de la sesión es `null` hasta que el servidor lo valide. |
| **Reintento infinito** | Exactamente un refresh y un reintento. El segundo 401 se propaga. |
| **Contraseña persistida** | No se guarda en ningún sitio; test de serialización lo verifica. |
| **Logout que no cierra** | Local primero: la UI se limpia antes de la red y el fallo de revocación no la revierte. |

---

## 16. Qué falta para integrar

1. Backend acepta **BR-007** (`/api/v1/`) y **BR-001** (auth acotada).
2. Se escribe `DjangoAuthTransport` implementando `AuthTransport`.
3. Se escribe `ApiAuthRepository` sobre el coordinator ya existente.
4. `isBackendAuthAvailable` pasa a `true` **en ese mismo commit**.
5. Se ejercita el pipeline contra el servidor real.

Nada de esto empieza antes de que Backend se pronuncie.
