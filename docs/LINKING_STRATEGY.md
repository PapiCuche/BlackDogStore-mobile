# Estrategia de enlaces

## Principio

`DEC-MOBILE-004` — **Un deep link es una intención de navegación, nunca una autorización.**

Tener una URL que dice `repairId=42` no dice **nada** sobre si quien la tiene
puede ver la reparación 42. Dice solo a dónde intentaba ir.

```
enlace → parser → intent validado → tenant gate → auth gate → pantalla
                                                                  ↓
                              backend valida identidad + empresa + propiedad
```

La autoridad es del servidor. Mobile solo decide **a dónde llevar a alguien**,
nunca **qué puede ver**.

---

## Estado actual

| Capacidad | Estado |
|---|---|
| Parser de deep links | **IMPLEMENTADO / TESTED** |
| Coordinator (auth + tenant gate) | **IMPLEMENTADO / TESTED** |
| Builders tipados | **IMPLEMENTADO / TESTED** |
| Pending intent en memoria | **IMPLEMENTADO / TESTED** |
| Custom scheme `blackdogstore` | **IMPLEMENTADO / COMPATIBILIDAD PILOTO** |
| Enlace de producto | **IMPLEMENTADO** (público) |
| Enlace de pedido | **IMPLEMENTADO** (navegación; datasource según estado real) |
| Enlace de reparación | **IMPLEMENTADO** — resuelve contra la API real desde M8 |
| Secure customer tracking | **API_PENDING** (BR-008) |
| iOS Universal Links | **PROPUESTA / INFRA_PENDING** |
| Android App Links | **PROPUESTA / INFRA_PENDING** |
| QR scanning | **PENDIENTE** |
| Push notifications | **PENDIENTE** |

---

## Custom scheme

`blackdogstore://` — declarado en `app.json`.

**Clasificación: específico de esta distribución / apto para desarrollo.**

Sirve para desarrollo e integraciones controladas. **No es** tenant, ni
credencial, ni prueba de identidad: el nombre pertenece a la app piloto, no al
modelo SaaS. Ningún módulo lo escribe a mano — los builders lo obtienen de la
configuración de Expo vía `Linking.createURL`, así que un build white-label
recibe el suyo sin tocar código.

### Rutas reconocidas

```
blackdogstore://products/<slug>     público
blackdogstore://orders/<id>         privado
blackdogstore://repairs/<id>        privado
blackdogstore://track/<token>       reconocido, NO honrado (BR-008)
```

Es una **allowlist**. Cualquier otra ruta se rechaza. Una denylist tendría que
anticipar cada ruta hostil, y la que nadie anticipó es la que se usa.

---

## Intents y visibilidad

| Intent | Visibilidad | Comportamiento |
|---|---|---|
| `product` | `public` | Abre sin sesión |
| `order` | `authenticated` | Exige sesión. **Order = compra e-commerce**, no reparación |
| `repair` | `authenticated` | Exige sesión. Dominio separado de Order |
| `tracking` | `secure-tracking-future` | Reconocido, siempre `feature-unavailable` |

`Order` y `RepairOrder` son dominios distintos con ciclos e identificadores
distintos. El módulo de enlaces se adapta al dominio; el dominio no se
contamina con el router.

---

## Auth gate

| Estado de sesión | Destino privado |
|---|---|
| `authenticated` | navega |
| `loading` | **espera** — decidir ahora rebotaría a login a alguien ya autenticado |
| `unauthenticated` | guarda destino → login → reanuda |
| `temporarily-unavailable` | igual que sin sesión; la pantalla de auth se explica |
| `unavailable` | `auth-unavailable` — no se muestra un login que no puede funcionar |

### Destino pendiente

**Solo memoria. Una sola ranura.**

- No se persiste: ni AsyncStorage ni SecureStore. Un destino que sobreviviera a
  un cierre de app se abriría para quien tomara el dispositivo después.
- Una ranura porque un segundo enlace **sustituye** al primero: quien toca dos
  enlaces quiere el segundo, y una cola acabaría abriendo una pantalla pedida
  hace minutos.
- Guarda el **intent parseado**, jamás la URL cruda: la URL puede llevar un
  token de verificación, de reset o un futuro credential de tracking.
- Se consume exactamente una vez (`consume()` lee y limpia).

### Fronteras de sesión

El destino se descarta cuando cambia la **persona**:

```
42 → null   (logout)          → limpiar
42 → 77     (otro usuario)    → limpiar
null → 42   (login)           → RESUMIR, no es un cambio de persona
```

Esa distinción es la que hace posible el resume sin que el usuario B herede el
destino privado del usuario A.

---

## Tenant gate

Un `?company=` en el enlace es un **hint**, nunca autoridad.

- Si coincide con el tenant configurado → sigue.
- Si difiere → `tenant-mismatch`, se rechaza.
- Nunca cambia de empresa en silencio ni mezcla cache entre empresas.

Estar autenticado en la empresa A no concede nada en la empresa B. La
autorización real sobre datos privados corresponde al backend y a la relación
usuario-empresa (BR-002).

---

## Seguridad

| Amenaza | Mitigación |
|---|---|
| **Open redirect** | Parámetros como `next`, `redirect`, `returnUrl`, `callback` hacen rechazar el enlace. La navegación jamás sale de un query param. |
| **Credenciales en URL** | `token`, `access_token`, `refresh_token`, `password`, `jwt`… → rechazo. Se rechaza en vez de limpiar: limpiar enseñaría al emisor que el patrón funciona. |
| **Parámetro duplicado** | Se inspecciona el query **crudo**; un parser que conserva solo la primera o última aparición descarta justo la que importa. |
| **Path traversal** | Decodificación repetida (`%252e%252e` → `..`) y allowlist de caracteres `[A-Za-z0-9._-]`. |
| **Encoding inválido** | Se rechaza en lugar de adivinar. |
| **Schemes peligrosos** | `javascript:`, `data:`, `file:`, `intent:`, `blob:` → rechazo explícito. |
| **URL gigante** | Límite de 2 KB antes de convertirse en estado, log o parámetro de ruta. |
| **Identificador gigante** | Límite de 128 caracteres. |
| **Token en logs** | `describeLink()` emite solo `kind` y validez. La URL cruda **nunca** se registra. |
| **Existence oracle** | `LinkUnavailableState` da **un solo mensaje** para todas las causas. |
| **Doble navegación** | La última URL atendida se recuerda; un replay no navega dos veces. |
| **Fuga entre sesiones** | El destino pendiente se limpia en logout y cambio de usuario. |
| **Secretos en query cache** | Un token nunca forma parte de una query key (M1.1). |

### Telemetría

**La URL cruda NO es telemetría.** Si en el futuro se añade observabilidad, solo
puede registrar `kind` y una categoría de éxito/fallo — nunca la URL, nunca un
parámetro, nunca un token.

No hay copia automática de tokens al portapapeles, ni visualización de tokens,
ni diagnóstico con URLs crudas en producción.

---

## Offline

El coordinator **no hace fetch de negocio**: resuelve intención y navegación, y
nada más. La pantalla destino usa su repositorio y sus hooks, con el scoping de
tenant y usuario que estableció M1.1 — que es exactamente lo que impide que un
deep link se convierta en una puerta lateral a los datos.

Enrutar no necesita red. Si el destino tiene datos cacheados del mismo tenant y
usuario, se muestran con el aviso de posible desactualización; si no, aparece el
estado offline de la pantalla.

---

## Producción futura — HTTPS

`DEC-MOBILE-005` — Los puntos de entrada de cara al cliente deben usar
**Universal Links (iOS) / App Links (Android) verificados por HTTPS**.

Un custom scheme lo puede reclamar cualquier app instalada; un enlace HTTPS
verificado está criptográficamente atado al dominio.

**Estado: PROPUESTA / INFRA_PENDING.** No hay dominio oficial, así que
`TRUSTED_HTTPS_HOSTS` está **vacío a propósito** y todo enlace `https://` se
rechaza. Confiar en un host que nadie controla sería peor que rechazar.

### Checklist para habilitarlo

**iOS**
- [ ] Dominio de producción decidido *(no inventar uno)*
- [ ] `apple-app-site-association` servido por HTTPS, sin redirección, `Content-Type: application/json`
- [ ] `ios.associatedDomains: ["applinks:<dominio>"]` en `app.json`
- [ ] Entitlement Associated Domains en el App ID
- [ ] Apple Team ID + Bundle ID en el AASA

**Android**
- [ ] `assetlinks.json` en `/.well-known/` por HTTPS
- [ ] Huella SHA-256 del certificado de firma
- [ ] `android.intentFilters` con `autoVerify: true`
- [ ] Verificación comprobada en un dispositivo real

**Mobile (cuando exista lo anterior)**
- [ ] Añadir el host a `TRUSTED_HTTPS_HOSTS` en `src/linking/parser.ts`
- [ ] Tests de round-trip para enlaces HTTPS
- [ ] Degradación a web cuando la app no esté instalada

---

## QR — PENDIENTE

No hay cámara, ni escáner, ni generación. Cuando llegue, un QR debe llevar
**un enlace HTTPS verificado** o un identificador opaco que el backend valide.

**Nunca** en un QR: datos del cliente, diagnóstico, email, teléfono, número de
serie, notas internas o el JSON de la reparación.

---

## Push — PENDIENTE

Sin `expo-notifications`. La arquitectura ya está preparada: un payload de
notificación futura produce un `DeepLinkIntent` y entra por **el mismo
coordinator**. No habrá un segundo sistema de navegación.

---

## Email — PENDIENTE

Los correos futuros (reparación, cotización, verificación, reset) deben preferir
HTTPS y degradar de forma segura a la web cuando la app no esté instalada.

**Verificación de correo:** el backend legacy emite `secrets.token_urlsafe(48)`
— un token opaco largo, no un código de 6 dígitos (hallazgo de M1). El contrato
móvil sigue `API_PENDING`; M1.2 **no procesa** ningún token real.

**Reset de contraseña:** igual. Sin integrar, sin guardar, sin registrar.

---

## Backend requirements

**BR-008 — Secure Customer Tracking / Deep Link Contract** — `PROPUESTA CRÍTICA`,
`API_PENDING`. Ver `docs/BACKEND_REQUIREMENTS.md`.

Mientras no exista, un enlace `track/<token>` se **reconoce** y termina en
`feature-unavailable`. No se guarda el token, no se envía a ninguna parte y no
se inventan datos.

---

## Probar enlaces en desarrollo

Con la app corriendo en simulador o emulador:

```bash
npx uri-scheme open "blackdogstore://products/iphone-15-pro-256" --ios
npx uri-scheme open "blackdogstore://orders/1042" --android
```

`uri-scheme` viene con Expo; no hace falta instalar nada globalmente.

Alternativas nativas:

```bash
xcrun simctl openurl booted "blackdogstore://repairs/r-1042"
adb shell am start -a android.intent.action.VIEW -d "blackdogstore://repairs/r-1042"
```

Un enlace privado abierto sin sesión debe llevar a login y **reanudar** el
destino tras autenticarse.

---

## Testing

Parser, builders y coordinator son **funciones puras**: se prueban sin
simulador. El ciclo de vida se prueba con `expo-linking` mockeado en el límite
nativo.

| Suite | Cobertura |
|---|---|
| `deep-link-parser.test.ts` | rutas válidas, schemes, hosts, identificadores hostiles, límites |
| `deep-link-security.test.ts` | open redirect, credenciales, encoding, tenant, logging, builders |
| `deep-link-auth-gate.test.ts` | visibilidad, gate por estado de sesión, destino pendiente |
| `deep-link-lifecycle.test.tsx` | cold start, warm start, listeners, resume, fronteras de sesión |
