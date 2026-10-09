# Espejo fiel del Excel (cuadrícula) — Plan de implementación

> Plan aprobado el 2026-10-09. Spec base: docs/superpowers/specs/2026-10-08-padron-excel-activacion-bajo-demanda-design.md (§3.1 y §7 se actualizan en la Tarea 5).


## Contexto
El menú "Excel" (`apps/web-admin/app/(panel)/excel`) hoy es una tabla filtrable de 10 columnas. La administradora de la data quiere verlo **como el Excel original** (`docs/xls/DATA ADRENALINA_hoy.xlsm`, Hoja1): con letras de columna A–K, números de fila reales (los datos empiezan en la fila 4, la fila 3 son los títulos), las columnas I, J, K (hoy no se importan), los colores de fila y los estilos de texto (negrita, rojo/verde en fechas). Además debe poder **corregir celdas y resaltar filas** desde la pantalla. Todo se trabaja en la versión web.

Hallazgos del archivo (solo lectura): Hoja1 con autofiltro `A3:K1432`; fila 3 = títulos (`NOMBRE, STATUS, F/NACIMIENTO, CELULAR, CEDULA, F/VENC, FECHA PAGO, PLAN`, I y J en blanco, K sin título), altura 28.5; anchos por columna; I tiene 27 celdas con datos ("3", "Pend", "ok"), J 35 ("resta 7", "VIRGEN DEL VALLE", "No ha venido", un serial de fecha 45511) y K 5 ("REINC", "pagó"…); 210 celdas con relleno: 20 filas `FFC000` (naranja), 3 filas `92D050` (verde) y blancas; 9 fuentes (negrita, rojo `FF0000` y verde `00B050`); formato de fecha `m/d/yy`; sin formato condicional, celdas combinadas ni paneles congelados. Hoja2/Hoja3 vacías; filas 1–2 vacías.

## Decisiones tomadas (usuario)
1. **Filas:** solo las de cédula única (sin cambios: las 52 sin cédula/repetidas siguen fuera). Se muestran con su **número real de fila** del Excel, por lo que habrá saltos en la numeración.
2. **Edición:** texto de las columnas A–K (incluidas I, J, K) en filas de quien aún no es miembro, **y también resaltar/quitar el color de una fila** desde la pantalla. Las filas de quien ya es miembro siguen bloqueadas (ajuste en su ficha).
3. **Navegación:** una sola cuadrícula con scroll (sin paginar), con filtros; aceptada "si no se pone lenta" → se mitiga con renderizado progresivo y se valida en producción.

4. **Ir a fila:** un control "Ir a fila" para saltar a cualquier fila por su **número real del Excel**, desde la 4 (primera con datos) hasta la última visible. Las filas que no están en el sistema (sin cédula/repetidas) **cuentan en la numeración**: el rango y el número que se ve son los del archivo fuente, para que la administradora pueda ir a cualquier fila fiel a la data original.

## Supuestos míos (a confirmar en la revisión)
- El color de una fila es el relleno de la **columna A** (si no es blanco); se pinta en las 11 celdas. Los rellenos parciales por celda (p. ej. solo hasta I) se unifican por fila.
- Negrita, color de fuente (rojo/verde) y alineación **sí** se conservan por celda; solo se importan, no se editan.
- Las fechas (serial de Excel o `dd-mm-aaaa`) se muestran como `dd/mm/aaaa`; el texto libre se muestra tal cual.
- La cuadrícula usa aspecto "hoja" claro (fondo blanco, líneas grises, encabezados grises) independiente del tema oscuro, para que los colores y fuentes salgan fieles. "Estado en el sistema" va como columna aparte a la derecha, fuera de A–K.
- Paleta de resaltado: amarillo `FFFF00`, naranja `FFC000`, verde `92D050`, celeste `00B0F0`, rosado `FF99CC`, rojo claro `FF7C80`, sin color.
- Reimportar: los textos editados a mano y los **colores puestos a mano se respetan** (como ya ocurre con `camposEditados`) y se listan como conflicto; estilos de fuente y títulos siempre vienen del archivo.
- Las notas de I/J/K no pasan al `Miembro` al activar (no se pidió).

## Diseño

### Datos (`packages/db/prisma/schema.prisma`)
- `MiembroReferencia` añade: `colI`, `colJ`, `colK` (`String?`), `estilos Json?` (por columna: `{ b?: true, c?: "FF0000", a?: "center"|"left"|"right" }`), `resaltado String?` (hex del relleno de la fila), `resaltadoEditado Boolean @default(false)`.
- Tabla nueva `PadronHoja` (una por org+sucursal, único): `encabezados Json` (11 entradas `{ col: "A", titulo, anchoPx }`), `alturaEncabezadoPx`, `archivoOrigen`, `importadoAt`.
- Migración generada con `prisma migrate diff --script` (NUNCA `migrate dev/deploy` contra la BD: el `.env` es producción). La aplica el contenedor al desplegar; después se reimporta con `--confirm`.

### Dominio (`packages/domain`)
- `utils/padronExcel.ts`: `CAMPOS_EDITABLES_PADRON` suma `colI, colJ, colK`; `PALETA_RESALTADO`; tipos de `estilos`.
- `entities/MiembroReferencia.ts`: nuevos campos; `FilaReferenciaConEstado` conserva `miembroId`.
- `use-cases/EditarMiembroReferencia.ts`: acepta `resaltado` (solo valores de la paleta o `null`), marca `resaltadoEditado`; las celdas I–K son texto libre.
- Puerto/repo: reemplazar `listar` (paginado, ya sin uso) por `listarTodas(organizacionId, sucursalId)` (filas + `miembroId` por join de cédula) y `obtenerHoja(...)`; `actualizarEdicion` persiste `resaltado`/`resaltadoEditado`.

### Importador (`packages/db`)
- Nuevo `migracion-excel/leerEstilosExcel.ts`: con `readFile(..., { cellStyles: true, bookFiles: true })` lee `xl/styles.xml` (fuentes, rellenos, `cellXfs`) y `xl/worksheets/sheet1.xml` (`<c r=".." s="..">`) y devuelve por celda `{ relleno?, fuenteRgb?, negrita?, alineacion? }`; ignora relleno blanco/tema y fuente tema 1 (negro). Títulos y anchos salen de `!cols`/fila 3.
- `leerExcel.ts`: lee también I, J, K (si el formato de celda es fecha y el valor numérico → `aaaa-mm-dd`) y adjunta estilos.
- `padron.ts`: `DatosPadron` suma `colI/J/K`, `estilos`, `resaltado`; `reconciliarPadron` respeta `camposEditados` (ahora con colI–K) y `resaltadoEditado`, y reporta conflicto de `resaltado`.
- `importarPadronExcel.ts`: upsert de las filas con los campos nuevos y de `PadronHoja` en `--confirm`; el dry-run muestra un resumen de títulos/anchos y de filas con color.

### Web (`apps/web-admin/app/(panel)/excel`)
- `page.tsx` (servidor): mismas reglas de acceso; carga **todas** las filas + hoja y las pasa como datos planos al cliente.
- `ExcelGrid.tsx` (cliente): barra tipo Excel (referencia de celda seleccionada, p. ej. `K166`, y su contenido); fila de letras A–K (+ columna "Estado"), fila 3 con los títulos (alto y anchos del archivo), fila de números reales a la izquierda; encabezados y números **fijos al hacer scroll**; celdas con relleno de fila, negrita, color de fuente y alineación; marca "Editado" por celda tocada; fila gris con "Ya es miembro → ficha" y bloqueada.
- **Rendimiento:** renderizado progresivo (bloques de 150 filas con un centinela de scroll) + `content-visibility: auto` por fila; filtros en el navegador (cédula, nombre, status, plan, rango de vencimiento, estado en el sistema, color) sobre el arreglo completo con `useMemo`.
- **Ir a fila:** campo numérico en la barra superior (`Ir a fila [  ] Ir`, también con Enter) con el rango visible "4 – N" (N = número de la última fila cargada, p. ej. 1432). Al saltar: se limpian los filtros que oculten esa fila, se renderizan los bloques necesarios hasta llegar a ella (el renderizado progresivo carga hasta esa posición), se desplaza hasta dejarla bajo el encabezado fijo y se selecciona/resalta un instante. Si el número está dentro del rango pero esa fila **no está en el sistema** (sin cédula o cédula repetida), no falla: salta a la siguiente fila existente y avisa "La fila 48 del Excel no está en el sistema (sin cédula o cédula repetida); se muestra la 49." Fuera del rango (menor que 4 o mayor que N) muestra el rango válido. Lógica pura y testeable: `resolverSaltoFila(numerosDeFila: number[], pedido: number)` → `{ destino, mensaje? }` con tests (existente, hueco → siguiente, antes de 4, después de la última, no entero).
- **Edición:** doble clic o Enter sobre una celda de una fila editable abre un campo; Enter guarda, Esc cancela; cada guardado llama a `editarFilaPadronAction` (una celda) y **actualiza la fila en memoria con la fila devuelta** (sin recargar las 1376). Clic en el número de fila abre la paleta de resaltado (acción nueva `resaltarFilaPadronAction`). Errores de dominio devueltos como `{ error }` (patrón ya establecido; en producción Next oculta los mensajes lanzados).

## Archivos principales
Crear: `packages/db/migracion-excel/leerEstilosExcel.ts` (+ test), `apps/web-admin/app/(panel)/excel/ExcelGrid.tsx`, migración nueva en `packages/db/prisma/migrations/`. Modificar: `schema.prisma`, `leerExcel.ts`, `padron.ts` (+ test), `importarPadronExcel.ts`, `packages/domain/utils/padronExcel.ts` (+ test), `entities/MiembroReferencia.ts`, `ports/IMiembroReferenciaRepository.ts`, `use-cases/EditarMiembroReferencia.ts` (+ test), `PrismaMiembroReferenciaRepository.ts`, `excel/page.tsx`, `excel/actions.ts`; eliminar `FilaPadronEditable.tsx`; actualizar spec §3.1/§7, `CLAUDE.md`, `handoff.md`.

## Orden de ejecución (tareas para subagentes, TDD en lo puro)
1. Lectura de estilos e I–K (`leerEstilosExcel`, `leerExcel`) con tests sobre XML de ejemplo.
2. Dominio: campos, paleta, `EditarMiembroReferencia` (+ `resaltado`), `reconciliarPadron` (+ tests).
3. Schema, migración (`migrate diff`), importador y repo (`listarTodas`, `obtenerHoja`, `actualizarEdicion`).
4. Cuadrícula (`page.tsx`, `ExcelGrid.tsx` con "Ir a fila" y `resolverSaltoFila` en `packages/domain/utils/saltoFila.ts` + test, acciones, retirar `FilaPadronEditable`).
5. Spec, `CLAUDE.md`, `handoff.md`.

## Verificación
- `npm test --workspace packages/domain` y `--workspace packages/db`; `npx tsc --noEmit -p apps/web-admin/tsconfig.json`; `eslint` solo en los archivos tocados (el lint global tiene 15 errores previos).
- Dry-run del importador contra `DATA ADRENALINA_hoy.xlsm`: debe reportar `colI` 27 / `colJ` 35 / `colK` 5 celdas con datos, 23 filas con color (20 naranjas + 3 verdes, o las que queden con cédula única) y los 11 títulos con sus anchos; las 1376 filas aparecen como "cambios" (campos nuevos), sin conflictos.
- `resolverSaltoFila`: tests Vitest (en `packages/domain/utils`, función pura) y revisión manual del salto con filtros activos y filas intermedias ausentes (p. ej. pedir la 48 → mensaje y destino 49).
- Tras desplegar (respaldo en Easypanel → deploy → `db:importar-padron:confirm`): revisar en `/excel` que A4 = "Jhon Bret CARPINTERO", que `K166`/`J174`/`J179` muestran sus notas, que las filas naranjas/verdes coinciden con el archivo, que editar una celda y resaltar una fila persisten y que reimportar los conserva como conflicto. Sin navegador automatizado (regla del proyecto): la prueba visual y de fluidez con las 1376 filas la hace la administradora; si va lenta, bajar el bloque de renderizado o virtualizar.
