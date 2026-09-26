# Pagos total / abono / combinado en Caja — Diseño

## Contexto

Hoy el modal de Caja (`ModalRegistrarPagoCaja.tsx`) solo permite registrar un
pago con **un monto y un solo método** por envío. Ya existe un mecanismo de
"abono" (pago parcial que no cierra el ciclo hasta completar el precio del
plan), pero:

- No hay forma de dividir un mismo cobro entre varios métodos de pago
  (ej. mitad efectivo, mitad punto de venta) en una sola operación — hoy
  requeriría múltiples envíos separados del wizard.
- El Paso 3 del wizard no distingue explícitamente entre "pago total" y
  "abono"; simplemente permite bajar el monto.
- El conteo/arqueo de turno (`ObtenerResumenTurno`) ya agrupa correctamente
  por el string `metodo` de cada fila `Pago`, así que no necesita cambios de
  fondo — pero la vista de Caja debe reflejar en vivo (antes de confirmar)
  cómo quedaría el resumen del turno mientras el usuario distribuye montos
  entre métodos.

El objetivo es agregar la modalidad de **pago combinado** (múltiples
métodos en un solo cobro) reutilizando al máximo la lógica de abono/ciclo ya
existente, sin tocar el modelo relacional de forma invasiva.

## Modelo de datos

- Agregar `Pago.grupoPagoId String?` (con índice) en
  `packages/db/prisma/schema.prisma`. Es un correlacionador opcional: se
  genera un `grupoPagoId` (cuid) **solo cuando un envío del wizard produce
  más de una fila `Pago`** (pago combinado). Pagos simples (total o abono)
  siguen sin usarlo, igual que hoy.
- No se toca `ArqueoLinea`, `Turno`, `Suscripcion` ni `MetodoPago`. La
  agrupación por ciclo (`pagosVigentesDelCiclo`/`totalPagado` en
  `packages/domain/entities/Pago.ts`) sigue funcionando igual porque todas
  las líneas de un pago combinado comparten el mismo
  `fechaInicioCiclo`/`fechaFinCiclo`.
- Migración Prisma: columna nueva nullable, sin backfill necesario.

## Dominio — `registrarPago`

- `DatosRegistrarPago` reemplaza los campos planos
  `monto/metodo/metodoPagoId/numeroOperacion/tasaCambio` por
  `lineas: DatosLineaPago[]` (una línea por método). Un pago simple hoy
  equivale a `lineas` con un solo elemento.
- El monto total considerado para `esAbonoDeCicloAbierto` y el cálculo de
  `fin` es la **suma de `lineas[].monto`**.
- `grupoPagoId` (cuid) se genera solo si `lineas.length > 1`.
- Se crean N filas `Pago`, todas con el mismo
  `fechaInicioCiclo`/`fechaFinCiclo`/`turnoId`/`grupoPagoId`.
- `registrarPago` ahora **devuelve `Pago[]`** en vez de `Pago` — todos los
  llamadores (server actions, ruta API) se actualizan para construir
  `lineas: [...]` y leer `pagos[0]` cuando solo necesitan un valor
  (`fechaFinCiclo` es igual en todas las líneas del mismo grupo).

## UI — Wizard (Paso 3)

- Selector de modalidad con 3 opciones: **Pago total** / **Abono parcial**
  / **Pago combinado**.
  - Total/Abono: comportamiento actual (una línea).
  - Combinado: lista repetible de líneas (monto + `SelectorMetodoPago`),
    con total objetivo editable, suma en vivo, y validación de que la suma
    de líneas sea igual al total antes de habilitar el submit.
- Proyección en vivo del resumen de turno (`proyeccionArqueo.ts`), mostrada
  junto a las líneas mientras se editan — cálculo puro en cliente, nada se
  persiste hasta enviar el formulario.

## Verificación

- Tests de dominio para `registrarPago` con 1 y N líneas.
- Test de `obtenerResumenTurno` con un turno que incluye un pago combinado.
- Prueba manual end-to-end en `/caja`.
