# Padrón Excel y activación bajo demanda — Diseño

> **Reemplaza** a `2026-09-28-migracion-excel-adrenalina-design.md` (migración masiva con corte de 90 días). Lo ya ejecutado (216 miembros en `gym-demo`, 2026-10-03) se conserva.

## 1. Problema

La migración del 2026-10-03 solo cargó a quien vencía hace ≤90 días (216 de 1395 filas). Mucha gente que asiste al gym no existe en el sistema, y el Excel ya cambió (`DATA ADRENALINA_hoy.xlsm`: 1428 filas con nombre, +31 cédulas, 0 desaparecidas, 17 vencimientos, 10 planes y 15 fechas de pago distintos; misma estructura). Inyectar todo el Excel como miembros no sirve: el Excel es una fuente externa que cambia y no debe convertirse en la población activa.

**Principio rector:** no migrar usuarios; importar referencias y activarlos bajo demanda.

## 2. Alcance

Incluye: tabla-padrón, importador CLI, caso de uso de activación, enganche en kiosco y panel, menú "Excel" de consulta y edición de filas del padrón, y reemplazo del aviso "Ajustar fecha o pago" por "Por regularizar".

No incluye: subir el Excel desde el panel, sincronizar cambios del Excel hacia miembros ya activados, activar desde otras sedes, recuperar filas sin cédula o con cédula repetida (se registran a mano como miembros nuevos).

## 3. Modelo de datos

### 3.1 `MiembroReferencia` (nuevo, `packages/db/prisma/schema.prisma`)

Espejo fiel del Excel, un registro por cédula. Clave única `(organizacionId, cedula)`.

| Campo | Notas |
|---|---|
| `organizacionId`, `sucursalId` | `sucursalId` = Sede Principal (fija al importar) |
| `cedula` | texto recortado; clave de búsqueda |
| `numeroFila` | fila en el Excel, para trazabilidad |
| Columnas crudas | `nombre`, `status`, `fNacimiento`, `celular`, `fVenc`, `fechaPago`, `plan` — como texto (`String?`), tal cual vienen. Es lo que muestra el menú "Excel" |
| Columnas I–K | `colI`, `colJ`, `colK` (`String?`): las tres columnas sin título del Excel, como texto. Las fechas se guardan en ISO (`aaaa-mm-dd`) y se muestran como dd/mm/aaaa |
| Estilos | `estilos Json?`: por columna (A–K), negrita, color de fuente y alineación de la celda, leídos del Excel |
| Resaltado | `resaltado String?` (hex de la paleta, p. ej. `FFFF00`; viene del relleno de la columna A del Excel) y `resaltadoEditado Boolean` (true si el color se puso a mano desde el menú) |
| Normalizadas | `fechaVencimiento DateTime?`, `fechaUltimoPago DateTime?`, `fechaNacimiento DateTime?`, `planNombre String?`, `precioPlanUSD Decimal?` — calculadas con `normalizarFila`/`clasificarFila`; `null` si no hay dato confiable |
| `archivoOrigen`, `importadoAt` | qué Excel y cuándo se cargó por última vez |
| `camposEditados String[]`, `editadoAt`, `editadoPor` | ediciones manuales hechas desde el menú "Excel" (§7): qué columnas crudas se tocaron, cuándo y quién (nombre del usuario). Vacío si la fila es tal cual el Excel |

**`PadronHoja`** (una por `(organizacionId, sucursalId)`): `encabezados Json` (las 11 columnas A–K con `col`, `titulo` de la fila 3 y `anchoPx`), `alturaEncabezadoPx`, `archivoOrigen`, `importadoAt`. La escribe el importador con `--confirm`; mientras no exista, el menú usa una hoja por defecto (títulos y anchos fijos en `tiposGrid.ts`). Migración `20261010000000_excel_espejo_fiel`.

No guarda un enlace a `Miembro`: "ya activado" se calcula por join de cédula (el padrón nunca se sincroniza con `Miembro`).

### 3.2 Regularización

`Miembro.ajustarFecha` se **renombra** a `Miembro.porRegularizar` (migración `RENAME COLUMN`, conserva el `true` de los 216). Semántica: "los datos de fecha/pago de este miembro vienen de una fuente externa no verificada". Se apaga igual que hoy: ajuste manual de vencimiento (un solo uso) o registro de un pago (normal o retroactivo). Foto y fecha de nacimiento faltantes se muestran como pendientes en el banner de la ficha pero **no** bloquean apagar el aviso.

Renombrado mecánico en ~20 archivos (domain, infra, web-admin, `marcarAjustarFecha.ts`); `tsc` y los tests existentes lo validan. Textos de UI: badge y banner dicen "Por regularizar"; los mensajes de `AjusteFechaNoDisponibleError` y `registrarPagoRetroactivo` se actualizan.

## 4. Importación del padrón (CLI)

`packages/db/importarPadronExcel.ts` (script plano en `packages/db`, mismo boilerplate dotenv + `PrismaPg`; script npm `db:importar-padron` y `db:importar-padron:confirm`).

- Argumentos: `--archivo=<ruta>` (por defecto el `*_hoy.xlsm`), `--org=<slug>`, `--sucursal="<nombre>"` (Sede Principal). Aborta si alguno no existe.
- Reutiliza `leerExcel.ts`, `normalizarFila.ts` y `PLANES_REALES`/resolución de plan de `clasificarFila.ts`. Se **elimina** de ese flujo el corte de 90 días y la creación de Plan/Suscripción/Pago.
- Reglas de elegibilidad (puras, con tests): se excluye la fila si la cédula está vacía o no contiene dígitos (`S/C`, `G`), o si la cédula (recortada) aparece en más de una fila (se excluyen **todas** las repetidas). Cédulas con letra y dígitos (`E-3880506`) entran.
- Dry-run por defecto: imprime y escribe un reporte JSON con altas, cambios (campo viejo → nuevo), sin cambios y excluidas por motivo. `--confirm` hace upsert por `(organizacionId, cedula)`; es idempotente. El archivo de trabajo es único (`DATA ADRENALINA_hoy.xlsm`) y puede reimportarse varias veces mientras se editan filas desde el menú: **los campos editados a mano (`camposEditados`) se respetan** (se conserva el valor del padrón y se recalculan las columnas normalizadas), y el reporte los lista como "conflicto" (valor del Excel vs. valor editado) para que se decida a mano. Los campos no editados se actualizan con el Excel.
- **Espejo fiel (2026-10-09).** El importador también lee las columnas I–K (`colI`/`colJ`/`colK`), los estilos por columna (negrita, color de fuente, alineación), el relleno de la columna A (`resaltado`) y los títulos de la fila 3 con los anchos de columna (`PadronHoja`, con `--confirm`). Además de los textos editados (`camposEditados`), respeta el color puesto a mano (`resaltadoEditado = true`): ese color no se pisa al reimportar. Dry-run del archivo real: 1376 elegibles, 52 excluidas (34 sin cédula, 18 cédula repetida), 23 filas con color, 25/32/5 celdas con valor en I/J/K. El dry-run tolera que las columnas nuevas aún no existan en la base (P2022).
- No toca `Miembro`, `Plan`, `Suscripcion` ni `Pago`.
- Se retiran `migrarExcelAdrenalina.ts` y su configuración (`mapeo-plan.json`, `reglas-cedula.json`) en el plan de implementación, una vez reutilizado lo necesario; `limpiarMigracionExcelPrueba.ts` se conserva solo si sigue siendo útil.

## 5. Activación bajo demanda

`packages/domain/use-cases/ActivarMiembroDesdePadron.ts` (puro, con tests). Puerto nuevo `IMiembroReferenciaRepository` (`buscarPorCedula`), implementado en `packages/infrastructure/persistence/prisma/`.

`activarMiembroPorCedula({organizacionId, sucursalId, cedula})`:
1. Busca `Miembro` por cédula → si existe, lo devuelve (no activa nada).
2. Si `sucursalId` ≠ sucursal del padrón → "no encontrado".
3. Busca en el padrón; si no hay → "no encontrado".
4. Crea en una transacción: `Miembro` (nombre, cédula, celular, fechaNacimiento si existe, `sucursalId` = Sede Principal, `planId` si el plan existe en la organización por nombre, `precioPlan` = precio del padrón, `fechaVencimiento`, `fechaUltimoPago`, `porRegularizar = true`, `activo = true`) y `Suscripcion` (inicio = vencimiento − `diasCiclo` del plan, fin = vencimiento) cuando hay plan y vencimiento. **No crea `Pago`.**
5. Si el plan del padrón no existe como `Plan` de la organización: se activa sin `planId`/`Suscripcion`, con `precioPlan` del Excel, y queda `porRegularizar` (se asigna plan al pagar).
6. Condición de carrera (dos check-ins simultáneos): la unicidad `(organizacionId, cedula)` es la guarda; ante error de unicidad se relee y se devuelve el `Miembro` existente.

Si el padrón no trae vencimiento, el miembro se crea sin `fechaVencimiento` y el check-in lo trata como hoy trata a un miembro sin fecha.

## 6. Puntos de entrada

**Kiosco.** `registrarCheckIn` (`packages/domain/use-cases/RegistrarCheckIn.ts`) llama a `activarMiembroPorCedula` en lugar de lanzar `MiembroNoEncontradoError` de inmediato; si activa, continúa con el flujo normal (permitido / por vencer / en gracia / vencido según el vencimiento del Excel). `MiembroNoEncontradoError` solo se lanza si tampoco está en el padrón. Sin mensaje especial de "recién activado". Los kioscos de otras sedes nunca activan (paso 2).

**Panel.** En `/miembros`, al buscar una cédula sin resultado y con la sucursal activa = Sede Principal, se ofrece "Activar desde Excel" (misma función, server action nueva); al terminar lleva a la ficha, con el aviso "Por regularizar". Requiere permiso `MIEMBROS`/`CREAR`.

## 7. Menú "Excel" (cuadrícula tipo hoja)

Ruta `apps/web-admin/app/(panel)/excel`, entrada en `layout.tsx` y `NavegacionMobile.tsx`, visible solo si la sucursal activa es la del padrón; permiso `MIEMBROS`/`VER` para ver y `MIEMBROS`/`EDITAR` para editar (sin enum nuevo).

**Cuadrícula.** El menú es una hoja que imita al Excel, no una tabla paginada: encabezado fijo con las letras A–K y la fila 3 con los títulos reales (con los anchos de `PadronHoja`), columna fija de números con el **número real de fila** del Excel (desde la 4), el relleno de fila tomado de la columna A, y negrita, color de fuente y alineación por celda según `estilos`. Se cargan todas las filas en una sola cuadrícula con **renderizado progresivo** (bloques de 150, `IntersectionObserver`; filas de alto fijo con `content-visibility`) y los **filtros** (cédula, nombre, status, plan, rango de vencimiento, estado en el sistema y color) se aplican en el navegador. La caja de nombre muestra la celda seleccionada (p. ej. `K166`) y su valor crudo. Las fechas se muestran dd/mm/aaaa; el texto libre se muestra tal cual.

**Ir a fila.** Rango `4 – N` (N = última fila del Excel). Cuenta también las filas que no están en el padrón (sin cédula o con cédula repetida): siguen fuera de la hoja, pero cuentan en la numeración. Fuera del rango o no entera: no salta y avisa "Escribe una fila entre 4 y N.". Si la fila está en el rango pero no existe en el padrón, salta a la siguiente existente con un aviso. Si hay filtros activos, se limpian antes de saltar.

**Visor del estado.** La columna Estado dice "No es miembro" o "Ya es miembro". Si la cédula ya existe como `Miembro`, la fila queda **bloqueada** (texto gris, sin edición ni resaltado) con un enlace a la ficha: el padrón nunca modifica `Miembro` y la ficha es la única fuente de verdad de quien ya fue activado.

**Edición.** En las filas de quien aún no es miembro se edita la celda (doble clic, o clic sobre una celda ya seleccionada, Enter o F2; Enter guarda y Esc cancela). Editables: A–K salvo E (la cédula es la clave). Fechas: C y F aceptan vacío, `aaaa-mm-dd`, `dd/mm/aaaa` o `dd-mm-aaaa` (la cuadrícula lo convierte a `aaaa-mm-dd` antes de enviar; cualquier otra cosa se rechaza); G (fecha de pago) admite texto libre, pero si se escribe una fecha en esos formatos se convierte igual; el resto es texto libre. Al guardar se recalculan las columnas normalizadas con la lógica del importador y se registra `camposEditados`/`editadoAt`/`editadoPor`; la celda editada lleva un triángulo naranja. Una edición vale para la activación futura y sobrevive a reimportar (§4).

**Resaltado de fila.** Sobre una fila editable, una paleta de 6 colores (amarillo, naranja, verde, celeste, rosado, rojo claro) más "Sin color" fija `resaltado` y marca `resaltadoEditado`, para que el importador no lo pise.

## 8. Qué pasa con lo existente

- Los 216 miembros y sus fotos no se tocan; conservan `porRegularizar = true`.
- Los 6 `PLACEHOLDER-<fila>` quedan fuera de alcance (corrección manual, como ya estaba pendiente).
- Un Excel nuevo solo actualiza el padrón; un miembro ya activado nunca cambia por reimportar.

## 9. Riesgos aceptados

- Una cédula tecleada en el kiosco crea un miembro sin verificar identidad; el Excel puede estar desactualizado y el kiosco puede permitir acceso con un vencimiento erróneo. Mitigación: `porRegularizar` visible en recepción y panel.
- ~39 filas (sin cédula/repetidas) no se pueden activar desde el padrón.
- Cédulas alfanuméricas solo se activan desde el panel (el numpad del kiosco solo teclea dígitos).
- Las ediciones manuales del padrón y el Excel pueden divergir; mientras el archivo siga cambiando habrá que reimportar y revisar los conflictos del reporte. Un editor con permiso `MIEMBROS`/`EDITAR` puede introducir un dato erróneo que el kiosco usará para decidir acceso hasta que el miembro se regularice.
- Si se elimina un miembro con 'Quitar del sistema' (borrado físico), su cédula sigue en el padrón y se vuelve a crear sola en su siguiente check-in en la Sede Principal, con el vencimiento del Excel. Para evitarlo habría que marcar la fila del padrón al eliminar (no incluido).

## 10. Pruebas y despliegue

- Vitest en `packages/domain`: `ActivarMiembroDesdePadron` (existe, no existe, otra sede, plan inexistente, sin vencimiento, carrera de unicidad) y `RegistrarCheckIn` con activación; los tests de `ajustarFecha` se renombran.
- Vitest en `packages/db`: elegibilidad de filas (vacía, `S/C`, repetida, alfanumérica) y diff altas/cambios.
- Verificación manual: dry-run con el Excel `_hoy` y comparación con los conteos de §1; check-in en kiosco con una cédula solo del padrón; menú "Excel" con filtros.
- Despliegue: respaldo de BD en Easypanel → deploy web-admin (aplica la migración de `MiembroReferencia` y el renombrado al arrancar) → importar con `--confirm` → deploy del kiosco.

## 11. Decisiones a confirmar en la revisión

1. Foto y nacimiento faltantes no bloquean apagar "Por regularizar" (el brief inicial los incluía como parte de "completar").
2. Renombrar la columna `ajustarFecha` → `porRegularizar` (alternativa más barata: dejar el nombre de columna y cambiar solo los textos de UI).
3. Permiso del menú "Excel" reutiliza `MIEMBROS`/`VER` (ver) y `MIEMBROS`/`EDITAR` (editar filas).
4. Supuesto: al reimportar el mismo archivo, lo editado a mano **se respeta** y se reporta como conflicto (la alternativa, que el Excel pise las ediciones, perdería los microajustes).
