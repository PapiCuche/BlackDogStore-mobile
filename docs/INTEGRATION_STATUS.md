# Integration Status

Estado real, no aspiracional. La fuente de verdad ejecutable es
`src/config/integration-status.ts` — la app la lee en tiempo de ejecución para
decidir si muestra el aviso de "datos de ejemplo". Si este documento y ese
archivo discrepan, **el archivo tiene razón**.

> **Ninguna API privada está integrada.** En la configuración por defecto
> (development), toda pantalla con datos corre sobre fixtures.

## Resumen

| Feature | Mobile UI | Backend | Integration | Tests | Estado |
|---|---|---|---|---|---|
| Catálogo (tienda) | IMPLEMENTADO | API_PENDING (legacy no tenant-safe) | MOCK | TESTED UI | PARCIAL |
| Detalle de producto | IMPLEMENTADO | API_PENDING (legacy no tenant-safe) | MOCK | TESTED UI | PARCIAL |
| Pedidos | IMPLEMENTADO | API_PENDING | MOCK | TESTED UI | PARCIAL |
| Detalle de pedido | IMPLEMENTADO | API_PENDING | MOCK | TESTED UI | PARCIAL |
| Reparaciones | IMPLEMENTADO | MOCK | MOCK | TESTED UI | PARCIAL |
| Detalle de reparación | IMPLEMENTADO | MOCK | MOCK | TESTED UI | PARCIAL |
| Autenticación | IMPLEMENTADO (UI) | API_PENDING | MOCK | TESTED (validación) | PARCIAL |
| Marca / multiempresa | IMPLEMENTADO | MOCK | MOCK | TESTED | PARCIAL |
| Design system | IMPLEMENTADO | n/a | n/a | TESTED | IMPLEMENTADO |
| Tema claro/oscuro/sistema | IMPLEMENTADO | n/a | n/a | TESTED | IMPLEMENTADO |
| Navegación (tabs estables) | IMPLEMENTADO | n/a | n/a | TESTED | IMPLEMENTADO |
| Cliente API | IMPLEMENTADO | n/a | n/a | TESTED | IMPLEMENTADO |
| Config a prueba de fallos | IMPLEMENTADO | n/a | n/a | TESTED | IMPLEMENTADO |
| Almacenamiento seguro | IMPLEMENTADO | n/a | n/a | NO TESTED | PARCIAL |
| Compra / pagos | NO IMPLEMENTADO | existe (web) | — | — | PENDIENTE |

## Qué sirve cada build (M0.1)

Con la configuración a prueba de fallos, **el entorno decide qué datos existen**:

| Feature | development | staging | production |
|---|---|---|---|
| Catálogo | mock · o legacy **con opt-in explícito** | *no disponible* | *no disponible* |
| Pedidos | mock | *no disponible* | *no disponible* |
| Reparaciones | mock | *no disponible* | *no disponible* |
| Marca | fixture del piloto | *no disponible* (BR-006) | *no disponible* (BR-006) |

*"No disponible"* significa que `repositories.<feature>` es `null` y la pantalla
muestra un estado **"Próximamente"** explícito. No una lista vacía: "todavía no
tenemos esta función" y "no tienes pedidos" son cosas distintas, y mostrar la
segunda cuando es cierta la primera le dice al cliente algo falso sobre su
propia cuenta.

## Detalle

### Catálogo — legacy existente, **no apto para release**

Estado detallado:

```
Mobile UI:                 IMPLEMENTADO
Backend legacy:            IMPLEMENTADO   (existe y funciona en master)
Backend tenant-safe:       PENDIENTE      (OBSERVED_IN_PROGRESS en una rama Web)
Integration:               MOCK
Release-safe integration:  PENDIENTE
```

**No está `INTEGRATED` y no puede estarlo todavía.**

`GET /api/products/` y `/api/categories/` existen en `master`, son públicos y
están verificados. Pero **no están aislados por empresa**:

```python
# ProductViewSet.get_queryset  @ origin/master 2624d478
Product.objects.select_related('category').prefetch_related('reviews').filter(is_active=True)

# CategoryViewSet
Category.objects.all()
```

Ni `Product` ni `Category` tienen campo `company` en `master`, y el resolvedor
por host que sí existe está documentado por el propio backend como *"DESIGNED,
not yet wired up … no public view calls it yet"*.

Un cliente SaaS apuntado ahí recibe el catálogo de **todas** las empresas. Eso es
un **riesgo cross-tenant**, aunque el endpoint sea público. **Bloqueado por
BR-002.**

#### El gate (M0.2)

`LegacyApiCatalogRepository` (antes `ApiCatalogRepository`) solo se construye
cuando **las tres** condiciones se cumplen:

```
appEnvironment === 'development'
  AND mocks apagados
  AND EXPO_PUBLIC_ENABLE_LEGACY_CATALOG === 'true'
```

En cualquier otro caso `repositories.catalog` es `null` y la pantalla muestra
*"Catálogo no disponible todavía"*. En staging y production el flag se **ignora**
y se reporta como `legacy-catalog-forbidden` en el diagnóstico de configuración.

Hay además una segunda defensa: `assertLegacyCatalogAllowed()` se ejecuta dentro
del repositorio y de cada función de endpoint, así que una build bloqueada no
puede emitir la petición ni construyendo la clase a mano.

### Pedidos — `API_PENDING`

`GET /api/orders/` existe pero exige cookie + CSRF (**BR-001**), y no serializa
`fulfillment_status` (**BR-003**). La UI ya separa pago y entrega, y muestra
"Sin información" cuando el backend no envía el estado operativo — en lugar de
suponer `pending`.

### Reparaciones — `MOCK`

No existe backend. Ni modelo, ni endpoint — verificado en `master`. Propuesta
completa en **BR-005**.

### Autenticación — `API_PENDING`

Cinco pantallas terminadas, validación real con Zod, estados de envío y error
reales. Ningún endpoint llamado. Ver `MOBILE_AUTH.md` y **BR-001** (revisado en
M0.1: autenticación Bearer **acotada a `/api/v1/`**, nunca global).

### Marca / multiempresa — `MOCK`

`CompanyBrand` gobierna el nombre del comercio, los canales de soporte y **qué
pestañas existen**. Desde M0.1 el fixture del piloto se siembra **solo** para un
build del tenant piloto en modo mock; cualquier otro build recibe `unavailable`
y renderiza neutral. **BR-006.**

## Qué haría falta para llegar a INTEGRATED

| Feature | Bloqueo | Trabajo Mobile una vez desbloqueado |
|---|---|---|
| Catálogo | BR-002 (+ BR-007) | Escribir el repositorio tenant-safe y **borrar** `LegacyApiCatalogRepository` junto con su gate. No se adapta: se reemplaza. |
| Pedidos | BR-001, BR-003 | Escribir `ApiOrderRepository` (el mapeador es directo). |
| Reparaciones | BR-005 | Escribir `ApiRepairRepository`; el dominio ya está modelado. |
| Auth | BR-001, BR-007 | Escribir `ApiAuthRepository` + Bearer para `/api/v1/` + refresh. |
| Marca | BR-006 | Escribir `ApiCompanyRepository`; el fixture queda como fallback del piloto. |

El patrón es el mismo en los cinco casos: **una clase nueva y una línea en el
composition root**. Ninguna pantalla cambia. Esa es la razón de la capa de
repositorios.

## Nota de verificación

Lo documentado en `API_CONTRACT.md` se re-verificó en M0.2 contra
`origin/master` @ `2624d478af5cd3cc90c4b65d9aa4c81bb2439cfc` — sin cambios
respecto a la auditoría de M0.1.

M0 había leído un working tree en la rama `feat/tenant-aware-commerce` con
cambios sin commitear, y algunas afirmaciones describían código que **no es
contrato estable**.

La rama `feat/tenant-aware-commerce` @ `6d8c3e0` **sigue sin mergearse en
`master`**. Aparentemente contiene `Product.company`, `Category.company` y los
helpers de storefront tenant-aware, pero eso es `OBSERVED_IN_PROGRESS`: la
existencia de código en una rama no es una API estable. Mobile **no** se integra
contra ella.

El orden es: rama Web → tests → merge a `master` → Mobile reaudita `master` →
recién entonces integra.
