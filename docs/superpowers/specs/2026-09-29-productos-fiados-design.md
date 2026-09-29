# Productos fiados (venta a crédito a miembros) — diseño

Fecha: 2026-09-29. Extiende el módulo de Productos y "Vender producto" (commit `082ea20`).

## Objetivo
Permitir que un miembro se lleve un producto sin pagarlo en el momento: queda como **pendiente de cobro** a su nombre y se cobra después, en bloque ("lo que debe"), con los mismos métodos de pago. Debe ser rápido y simple.

## Decisiones acordadas con el usuario
- El producto se entrega al momento; solo el cobro se difiere. Sin stock, intereses ni fechas límite.
- Solo se fía a **miembros** (no a personas sueltas).
- Cobro **siempre por el total** que debe el miembro, en un solo pago. Sin cobro parcial ni producto por producto.
- Todo el cobro ocurre desde **Caja** (botón "Cobrar deudas"). No se toca la ficha del miembro.
- Enfoque de datos: **tabla propia** de deudas. No se reutiliza `Pago` con un estado "pendiente", para no tener que excluir pendientes en cada consulta de pagos, turno, arqueo e histórico.

## Flujo de usuario
1. **Fiar.** En el modal "Vender producto" hay un interruptor **"Fiar a un miembro"**. Al activarlo:
   - aparece el buscador de miembros (`BuscadorMiembro`, el mismo de "Registrar pago");
   - desaparece el selector de método de pago;
   - el botón pasa a "Fiar".
   Se elige producto y cantidad como hoy. Crea una deuda Pendiente. No mueve caja.
2. **Cobrar.** Botón nuevo **"Cobrar deudas"** junto a los de Caja:
   - lista los miembros con saldo pendiente y su total en USD y Bs (tasa vigente);
   - al elegir uno, muestra sus productos pendientes y el total;
   - abajo, `SelectorMetodoPago`; se cobra el total en un solo pago;
   - cada producto tiene un botón "Anular" (fiado por error).
3. **Efecto en caja.** El dinero entra al turno abierto **al cobrar**, no al del día de la venta. En "Pagos del turno" el concepto muestra los nombres de los productos ("Agua × 2, Gatorade"); el pago queda a nombre del miembro.

## Datos (migración aditiva)
Nuevo enum `EstadoDeuda` (`PENDIENTE`, `COBRADA`, `ANULADA`) y modelo `DeudaProducto`:

| Campo | Tipo | Nota |
|---|---|---|
| id | String (cuid) | |
| organizacionId | String | FK Organizacion |
| sucursalId | String | FK Sucursal; sucursal donde se fió |
| miembroId | String | FK Miembro |
| productoId | String? | FK Producto (`onDelete: SetNull`) |
| productoNombre | String | copia del nombre al fiar |
| cantidad | Int | |
| precioUnitarioUSD | Decimal(10,2) | congelado al fiar; los Bs se calculan al cobrar |
| estado | EstadoDeuda | default PENDIENTE |
| registradaPorId | String | FK UsuarioAdmin |
| creadaEn | DateTime | default now |
| cobradaEn / cobradaPorId | DateTime? / String? | al cobrar |
| grupoPagoId | String? | id del grupo de pagos que la cubrió |
| anuladaEn / anuladaPorId | DateTime? / String? | al anular |

Índices: `(organizacionId, estado)` y `(miembroId, estado)`. `Miembro`, `Producto`, `Sucursal` y `UsuarioAdmin` ganan la relación inversa (sin columnas nuevas).

## Dominio (`packages/domain`)
- `entities/DeudaProducto.ts`, `ports/IDeudaProductoRepository.ts` (`crear`, `listarPendientesPorOrganizacion`, `listarPendientesPorMiembro`, `buscarPorId`, `marcarCobradas(ids, datos)` que solo afecta filas aún PENDIENTE y devuelve cuántas actualizó, `anular`).
- `use-cases/FiarProducto.ts`: permiso CAJA/CREAR; miembro de la organización y de la sucursal (mismo criterio que `registrarPago`: `MiembroFueraDeSucursalError`); producto activo; cantidad entera ≥ 1. No exige turno abierto.
- `use-cases/CobrarDeudasMiembro.ts`: permiso CAJA/CREAR; exige turno abierto; carga las deudas PENDIENTE del miembro; el **servidor recalcula el total** (`Σ precioUnitarioUSD × cantidad`, redondeado a 2 decimales) y valida las líneas con `validarLineasDePago(lineas, "exacto", total)`; crea una fila `Pago` por línea (todas con el mismo `grupoPagoId`, que también queda en las deudas cobradas) con `miembroId`, `productoNombre` = concepto resumido, sin producto ni ciclo; luego `marcarCobradas`. Si `marcarCobradas` actualiza menos filas que las cargadas (otra caja cobró a la vez) lanza `DeudasYaCobradasError` y la transacción se revierte.
- `use-cases/AnularDeuda.ts`: permiso PAGOS/ELIMINAR; solo deudas PENDIENTE; `DeudaNoPendienteError` si no.
- `use-cases/ListarDeudasPendientes.ts`: agrupa por miembro (nombre, cédula, foto, total USD, ítems).

## Infraestructura y Web-admin
- `PrismaDeudaProductoRepository.ts` (patrón de `PrismaProductoRepository`; acepta `PrismaClientOrTx`).
- `cobrarDeudasAction` corre `cobrarDeudasMiembro` dentro de `prisma.$transaction((tx) => …)`, igual que `cambiarPlanAction`, y reutiliza `validarTasaSiEsEnBs` (`lib/tasaBcv.ts`) por cada línea en Bs.
- `fiarProductoAction` y `anularDeudaAction` en `caja/actions.ts`; `venderProductoAction` no cambia.
- UI: `ModalVenderProducto` gana el interruptor "Fiar a un miembro" y recibe `miembros` y `planes` para el buscador; `BotonCobrarDeudas` + `ModalCobrarDeudas` nuevos. `caja/page.tsx` carga las deudas pendientes agrupadas.
- `conceptoPago` ya muestra `productoNombre` primero, así que el pago cobrado se ve con los nombres de los productos sin cambios.

## Reglas y errores
- Totales siempre calculados en el servidor; el monto que envía el cliente solo se compara.
- Errores de dominio con mensajes en español, como el resto de los use-cases.
- Sin cambios en `ObtenerResumenTurno`, arqueo ni histórico: la deuda no existe para ellos hasta que se cobra.

## Pruebas (vitest, fakes en memoria)
- `FiarProducto`: sin permiso, producto inactivo, cantidad inválida, miembro fuera de la sucursal, caso feliz con precio congelado.
- `CobrarDeudasMiembro`: total recalculado en el servidor, suma distinta falla, sin turno abierto falla, sin deudas pendientes falla, deuda ya cobrada falla, caso feliz (pagos con miembro y concepto; deudas quedan COBRADA con `grupoPagoId`), pago combinado.
- `AnularDeuda`: sin permiso, solo pendientes, caso feliz.

## Riesgos
- Migración aditiva (tabla y enum nuevos + FK). Antes de aplicarla, revisar `pg_stat_activity` por sesiones `idle in transaction`; el `ADD CONSTRAINT … FOREIGN KEY` toma un lock breve sobre Miembro. No lanzarla en background con timeout (ver `handoff.md`, sección 4).
- Un cambio de precio del producto no afecta deudas ya fiadas (precio congelado).

## Fuera de alcance
Cobro parcial o por producto, fechas límite y recordatorios, aviso en la ficha del miembro, stock, fiar a no miembros.
