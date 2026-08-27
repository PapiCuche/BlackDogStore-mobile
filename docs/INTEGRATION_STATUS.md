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
| Catálogo (tienda) | IMPLEMENTADO | API_READY (legacy) | MOCK | TESTED UI | PARCIAL |
| Detalle de producto | IMPLEMENTADO | API_READY (legacy) | MOCK | TESTED UI | PARCIAL |
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
| Catálogo | mock (o API con `USE_MOCK_DATA=false`) | API legacy | API legacy |
| Pedidos | mock | *no disponible* | *no disponible* |
| Reparaciones | mock | *no disponible* | *no disponible* |
| Marca | fixture del piloto | *no disponible* (BR-006) | *no disponible* (BR-006) |

*"No disponible"* significa que `repositories.<feature>` es `null` y la pantalla
muestra un estado **"Próximamente"** explícito. No una lista vacía: "todavía no
tenemos esta función" y "no tienes pedidos" son cosas distintas, y mostrar la
segunda cuando es cierta la primera le dice al cliente algo falso sobre su
propia cuenta.

## Detalle

### Catálogo — `API_READY`, no integrado

`GET /api/products/` y `/api/categories/` existen en `master`, son públicos y
están verificados. `ApiCatalogRepository` está **escrito y listo**, y se activa
con `EXPO_PUBLIC_USE_MOCK_DATA=false`.

No es el default, y M0.1 corrige el motivo que M0 daba:

- **En `master`** el catálogo **no está tenantizado**: `ProductViewSet` devuelve
  `Product.objects.filter(is_active=True)`, global. Un cliente móvil recibiría
  el catálogo de **todas** las empresas.
- **En el árbol en progreso** del equipo Web se está añadiendo resolución por
  Host, que descartaría a un cliente móvil y devolvería **vacío**.

Ninguno de los dos es un contrato SaaS utilizable. **Bloqueado por BR-002.**

> Este catálogo legacy **no se considera todavía el contrato SaaS definitivo de
> Mobile**. Ver BR-007 (`/api/v1/`).

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
| Catálogo | BR-002 (+ BR-007) | Cambiar el default en `src/repositories/index.ts`. El repositorio ya existe. |
| Pedidos | BR-001, BR-003 | Escribir `ApiOrderRepository` (el mapeador es directo). |
| Reparaciones | BR-005 | Escribir `ApiRepairRepository`; el dominio ya está modelado. |
| Auth | BR-001, BR-007 | Escribir `ApiAuthRepository` + Bearer para `/api/v1/` + refresh. |
| Marca | BR-006 | Escribir `ApiCompanyRepository`; el fixture queda como fallback del piloto. |

El patrón es el mismo en los cinco casos: **una clase nueva y una línea en el
composition root**. Ninguna pantalla cambia. Esa es la razón de la capa de
repositorios.

## Nota de verificación

Lo documentado en `API_CONTRACT.md` se re-verificó en M0.1 contra
`origin/master` @ `2624d47`. M0 había leído un working tree en la rama
`feat/tenant-aware-commerce` con cambios sin commitear, y algunas afirmaciones
describían código que **no es contrato estable**. M1 debe volver a inspeccionar
`master` cuando el equipo Web cierre su fase.
