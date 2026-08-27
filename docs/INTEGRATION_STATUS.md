# Integration Status

Estado real, no aspiracional. La fuente de verdad ejecutable es
`src/config/integration-status.ts` — la app la lee en tiempo de ejecución para
decidir si muestra el aviso de "datos de ejemplo". Si este documento y ese
archivo discrepan, **el archivo tiene razón**.

## Resumen

| Feature | Mobile UI | Backend | Integration | Tests | Estado |
|---|---|---|---|---|---|
| Catálogo (tienda) | IMPLEMENTADO | API_READY | MOCK | TESTED UI | PARCIAL |
| Detalle de producto | IMPLEMENTADO | API_READY | MOCK | TESTED UI | PARCIAL |
| Pedidos | IMPLEMENTADO | API_PENDING | MOCK | TESTED UI | PARCIAL |
| Detalle de pedido | IMPLEMENTADO | API_PENDING | MOCK | TESTED UI | PARCIAL |
| Reparaciones | IMPLEMENTADO | MOCK | MOCK | TESTED UI | PARCIAL |
| Detalle de reparación | IMPLEMENTADO | MOCK | MOCK | TESTED UI | PARCIAL |
| Autenticación | IMPLEMENTADO (UI) | API_PENDING | MOCK | TESTED (validación) | PARCIAL |
| Marca / multiempresa | IMPLEMENTADO | MOCK | MOCK | TESTED UI | PARCIAL |
| Design system | IMPLEMENTADO | n/a | n/a | TESTED | IMPLEMENTADO |
| Tema claro/oscuro/sistema | IMPLEMENTADO | n/a | n/a | TESTED | IMPLEMENTADO |
| Navegación | IMPLEMENTADO | n/a | n/a | TESTED UI | IMPLEMENTADO |
| Cliente API | IMPLEMENTADO | n/a | n/a | TESTED | IMPLEMENTADO |
| Almacenamiento seguro | IMPLEMENTADO | n/a | n/a | NO TESTED | PARCIAL |
| Compra / pagos | NO IMPLEMENTADO | existe (web) | — | — | PENDIENTE |

**Ninguna feature de datos está INTEGRATED.** Ninguna llama al backend en la
configuración por defecto.

## Detalle

### Catálogo — `API_READY`, no integrado

`GET /api/products/` y `/api/categories/` existen, son públicos y están
verificados. `ApiCatalogRepository` está **escrito y listo**, y se activa con
`EXPO_PUBLIC_USE_MOCK_DATA=false`.

No es el default porque `resolve_storefront_company` resuelve el tenant por Host
y descarta los subdominios `api`/`app`/`www`/`admin`: en producción, la app
recibiría un catálogo vacío. **Bloqueado por BR-002.**

Contra un Django local con una sola empresa activa y `DEBUG=True`, la ruta real
sí funciona hoy (por el fallback de empresa única).

### Pedidos — `API_PENDING`

`GET /api/orders/` existe pero exige cookie + CSRF (**BR-001**), y no serializa
`fulfillment_status` (**BR-003**). La UI ya separa pago y entrega, y muestra
"Sin información" cuando el backend no envía el estado operativo — en lugar de
suponer `pending`.

### Reparaciones — `MOCK`

No existe backend. Ni modelo, ni endpoint. Propuesta completa en **BR-005**.
Es la feature con más distancia entre UI y servidor, y la que más claramente lo
declara en pantalla.

### Autenticación — `API_PENDING`

Cinco pantallas terminadas, validación real con Zod, estados de envío y error
reales. Ningún endpoint llamado. Ver `MOBILE_AUTH.md` y **BR-001**.

### Marca / multiempresa — `MOCK`

`CompanyBrand` es una abstracción real que gobierna la app: el nombre del
comercio, los canales de soporte y **qué pestañas existen** (`enabledFeatures`
alimenta el tab bar). Los datos son el fixture del piloto. **BR-006.**

## Qué haría falta para llegar a INTEGRATED

| Feature | Bloqueo | Trabajo Mobile una vez desbloqueado |
|---|---|---|
| Catálogo | BR-002 | Cambiar el default en `src/repositories/index.ts`. El repositorio ya existe. |
| Pedidos | BR-001, BR-003 | Escribir `ApiOrderRepository` (el mapeador es directo). |
| Reparaciones | BR-005 | Escribir `ApiRepairRepository`; el dominio ya está modelado. |
| Auth | BR-001 | Escribir `ApiAuthRepository` + Bearer en el cliente + refresh. |
| Marca | BR-006 | Escribir `ApiCompanyRepository`; el fixture pasa a ser fallback offline. |

El patrón es el mismo en los cinco casos: **una clase nueva y una línea en el
composition root**. Ninguna pantalla cambia. Esa es exactamente la razón por la
que existe la capa de repositorios.
