# Análisis exhaustivo — DATA_ADRENALINA_.xlsm

**Fecha del análisis:** 2026-09-27
**Alcance:** Solo lectura. No se modificó el archivo ni el código.
**Cobertura de datos:** Se extrajeron y verificaron programáticamente (vía pandas, sobre un volcado completo de la hoja) las **1395 filas de datos reales** de `Hoja1` (filas 4–1399; encabezado en fila 3), más 1 fila totalmente en blanco intermedia (fila ≈1090) que no cuenta como registro.

> **Nota de transparencia metodológica:** durante el análisis, la conexión con Excel quedó bloqueada tras una llamada que expiró (timeout) al intentar leer el formato condicional/colores de fuente en un rango amplio (`B4:B60`/`F4:F60`). Esto impidió verificar a escala completa un hallazgo de coloreado de fuente que sí se observó en una muestra pequeña (primeras 10 filas) — ver sección 1.7. También no fue posible extraer el proyecto VBA de forma independiente (no hay acceso a los bytes crudos del `.xlsm` en este entorno), por lo que el hallazgo de la macro `TextBox1_Change` se reporta basado en lo que el usuario ya verificó, no en una re-extracción propia con `oletools`. Ambos puntos quedan listados en "Preguntas / pendientes" al final.

---

## PARTE 1 — Anatomía completa

### 1.1 Inventario de columnas (Hoja1, fila 3 = encabezado)

| Columna | Encabezado | Tipo real observado | % vacío (sobre 1395) | Notas |
|---|---|---|---|---|
| A | NOMBRE | Texto libre | ~0% (1 fila totalmente vacía aparte) | Incluye anotaciones pegadas al nombre: paréntesis con relación ("Hijo de...", "Esposa Paul"), apodos, "2" para distinguir homónimos |
| B | STATUS | Texto libre, 7 variantes | 0.1% (2 filas) | Ver 1.2 |
| C | F/NACIMIENTO | Texto/fecha | 99.6% (1391/1396) | Ver 1.4 — casi nunca se usa, y cuando tiene contenido no es una fecha de nacimiento real |
| D | CELULAR | Texto (formato teléfono VE) | 5.4% (76/1396) | 16 filas adicionales tienen texto no-teléfono en esta columna (ver 1.1.1) |
| E | CEDULA | Numérico (mayoría) / texto | 2.4% (33/1396) | Ver 1.1.2 para duplicados |
| F | F/VENC | Fecha (serial o texto) | 0.8% (11/1396) | Ver 1.5 |
| G | FECHA PAGO | Fecha (serial o texto) / texto libre | 52.8% (737/1396) | Ver 1.6 |
| H | PLAN | Numérico (mayoría) / texto | ~1% | Ver 1.3 — la columna más sucia |

**1.1.1 — CELULAR:** de las 1320 celdas no vacías, 1304 siguen el patrón de teléfono venezolano (`04XX-XXXXXXX`). Las 16 restantes son texto no-teléfono: `ESPAÑA`, `BRASIL`, `S/N`, `Fabiol`, `Nunca vino`, y variantes con formato ligeramente roto (11 o 12 dígitos en vez de 10-11, ej. `0412-98976788`, `04142-8799059`). Esto confirma que el campo se usa a veces para anotar "no tiene teléfono / no vino / es de otro país" en vez de dejarlo vacío.

**1.1.2 — CEDULA:**
- **Vacías:** 33 filas (2.4%).
- **Duplicadas:** 7 valores de cédula aparecen exactamente 2 veces cada uno, afectando 14 filas: `33473596`, `32668117`, `29700435`, `22969126`, `15634060`, `32457116`, `32202947`. En varios casos corresponden a la misma persona registrada dos veces (ej. cédula `22969126` aparece en "Vanessa Yajuris (Virgen Valle)" y "Vannesa Yajunis" — mismo nombre con grafía distinta, casi seguro duplicado real de la misma persona con dos filas de historial). En otros casos no es obvio sin más contexto.
- Formatos no-numéricos en la columna: valores como `E-3880506`, `S/C`, `G` (un solo carácter), `S/N` — probablemente cédulas de extranjeros, "sin cédula" o error de tipeo.

### 1.2 Columna STATUS — todas las variantes

Sobre 1396 filas con nombre, la columna STATUS tiene **7 variantes textuales**, que agrupan a 2 significados de negocio (más 2 filas ambiguas):

| Valor exacto (con espacios) | Filas | Grupo probable |
|---|---|---|
| `" S/V"` (espacio inicial) | 793 | Vencido |
| `"S/V"` (sin espacio) | 239 | Vencido |
| `"ACTIVO"` | 310 | Activo |
| `" ACTIVO"` (espacio inicial) | 51 | Activo |
| `" ACTIVA"` (femenino, espacio inicial) | 1 | Activo |
| `""` (vacío) | 1 | Sin dato |
| `" "` (solo espacio) | 1 | Sin dato |

**Total agrupado:** Vencido (S/V) = 1032 filas (73.9%) · Activo = 362 filas (25.9%) · Sin dato = 2 filas (0.1%).

Las variantes son puramente de digitación (espacios iniciales inconsistentes, un caso de género "ACTIVA" en vez de "ACTIVO") — no representan estados de negocio distintos entre sí.

### 1.3 Columna PLAN — la más sucia

37 valores distintos. Clasificación:

**(a) Precio limpio en USD** (numérico puro, sin decoración) — domina la columna:
`20` (306), `8` (273), `25` (258), `30` (249), `22` (193), `15` (15), `5` (11), `31` (5), `16` (5), `0` (4 — ver nota), `7` (3), `23` (3), `18` (3), `28` (2), `6` (2), `17.5` (2), `26` (2), `27` (1), `4` (1), `9` (1), `12` (1), `10` (1).
→ Suman **~1339 filas** con un valor numérico limpio interpretable como precio mensual en USD.
Nota sobre `0`: 4 filas tienen PLAN=0 (ej. "Erika Caraballo (Membresia)", "Leonardo Relucido (Intercambio)", "Juan Arias (Dichel) Membresia", "Freddy Padrino"). El nombre entre paréntesis en 3 de las 4 sugiere que son cortesías/intercambios sin cobro, no un error.

**(b) Precio con decoración** (asterisco o "+N"):
`15*` (20), ` 20*` (7 con espacio inicial), `20*` (2), `10*` (1), ` 15*` (1 con espacio) → subtotal ~31 filas con asterisco.
`25+5` (1). El asterisco aparece casi siempre junto al valor `15` — patrón consistente que sugiere una tarifa/promoción especial marcada (posiblemente "plan compartido" o "tarifa familiar"), pero **el significado exacto del asterisco no está documentado en ningún lugar de la hoja** (no hay leyenda, nota ni comentario de celda).

**(c) Texto que no es un plan** (9 filas + 9 blancos "puros"):

| Valor | Filas | Contexto observado |
|---|---|---|
| `Pend` | 2 | "Genesis Rondón", "Wilmaris Contreras" — ambas ACTIVO, FECHA PAGO vacía. Parece "pendiente de definir plan/pago", no basura. |
| `TV` | 1 | "Rosiede Rondón" — FECHA PAGO="Intercambio". Probable trueque (publicidad/TV a cambio de membresía). |
| `Radio` | 1 | "Nelismar Mata" — FECHA PAGO="Membresia". Mismo patrón de trueque, con una radio. |
| `jorge` | 1 | "Jorgelis Gómez" — FECHA PAGO="novia del vecino, jorge". Nota de relación/cortesía, no un plan. |
| `Virgen` | 1 | "Vannesa Yajunis" — fila casi duplicada de "Vanessa Yajuris (Virgen Valle)" con PLAN=`*`. "Virgen" es probablemente el apellido "Valle" truncado/mal copiado, no un plan real. |
| `*` (solo asterisco, sin número) | 3 | "Antonella Figueroa", "Jhosua Almenarez", "Vanessa Yajuris (Virgen Valle)" — asterisco sin número asociado; no se puede inferir precio. |
| `+` (solo signo) | 1 | "Rossi González" — fila con casi todos los demás campos vacíos también. |
| *(blanco)* | 9 | Filas con PLAN vacío pero NOMBRE y otros campos presentes. |

**Conclusión de la Parte 1.3:** ninguno de estos valores de texto se puede mapear a un plan/precio sin contexto adicional. Todos quedan en la lista de "preguntas para el dueño del gimnasio".

### 1.4 Columna F/NACIMIENTO

De 1396 filas, solo **5 tienen contenido** (0.4%), y ninguna es una fecha real:
`PENDIENTE` (x2, en filas donde además STATUS quedó mal desplazado — ver nota abajo), `Ray`, `Julio`, `pasaporte`.

**Hallazgo importante:** en al menos 4 filas (Nicola Silva, Brian Ramos, y otras dos con "PENDIENTE" en esta columna), el valor "PENDIENTE" que aparece en F/NACIMIENTO en realidad pertenece semánticamente a la columna STATUS o FECHA PAGO — es decir, **hay corrimiento de datos entre columnas en algunas filas**, síntoma de tipeo manual sin validación. Confirma que el campo F/NACIMIENTO **no se usa en la práctica** — se puede tratar como descartable para la migración, no como un campo real de negocio.

### 1.5 Columna F/VENC — ¿qué tan confiable es?

Clasificación exacta sobre 1396 filas:
- **947 filas (67.8%):** número serial de Excel (fecha real, tipo `date` nativo).
- **436 filas (31.2%):** texto con formato `dd-mm-yyyy` (fecha real, pero almacenada como texto, no como tipo fecha de Excel — probablemente por haber sido tipeada directamente en vez de seleccionada de un date picker).
- **11 filas (0.8%):** vacías.
- **2 filas (0.1%):** con error de tipeo que rompe el parseo: `"19-082026"` (falta un separador) y `"17-06-026"` (falta un dígito del año).

**Rango de fechas:** 2023-07-24 a 2026-09-23, con distribución 2024=235, 2025=414, 2026=732 filas.

**Conclusión:** el campo es funcionalmente confiable en 99% de los casos (fecha real, aunque con dos formatos de almacenamiento mezclados: serial vs. texto). Cualquier migración debe re-parsear ambos formatos y no puede asumir que toda la columna es un tipo `date` de Excel. Las 2 filas malformadas y las 11 vacías requieren limpieza manual antes de migrar.

### 1.6 FECHA PAGO — ¿consistente?

**No, es el campo menos consistente de la hoja:**
- **737 filas (52.8%):** vacías — la mitad de la base no tiene fecha de pago registrada.
- **454 filas (32.5%):** número serial (fecha real).
- **175 filas (12.5%):** texto `dd-mm-yyyy` (fecha real).
- **30 filas (2.1%):** texto que no es fecha en absoluto: `PENDIENTE` (x6), `Membresia`/`Membresis` (x4), `Promo`, `2 X 1`/`2x1` (x3), `Intercambio` (x2), `Bco Vzla`, `Esposa Paul`, `del 20`, `Cancela los 15`, `novia del vecino, jorge`, `NO VENDRA`, `Enferma`, `VECINA JORGE`, `cantv`, `montaoriente`, `Primo Oscar`, `CHAQUETA`.

Estos 30 valores de texto son en su mayoría **notas operativas del gimnasio** (forma de pago en especie, cortesías, razones de no-pago), no errores aleatorios — pero ocupan una columna que se supone es una fecha, y se pierden en cualquier migración automática sin revisión manual.

**Relación FECHA PAGO vs F/VENC (para inferir si PLAN = precio mensual):** en las 620 filas donde ambas fechas son parseables, la diferencia `F/VENC − FECHA PAGO` tiene media 138.9 días y mediana 106 días — **muy por encima de los ~30 días de un plan mensual**, y con desviación estándar altísima (149 días). Agrupando por valor de PLAN (ver Parte 2), tampoco aparece un ciclo limpio de 30 días. Esto indica que:
- FECHA PAGO no siempre refleja el último pago (puede quedar desactualizada mientras F/VENC se sigue empujando manualmente en cada renovación), o
- El vencimiento no sigue estrictamente "fecha de pago + 30 días", sino ajustes manuales caso por caso (congelamientos, adelantos, etc. que no quedan registrados en ningún otro campo).

### 1.7 Macro `TextBox1_Change`

**No se pudo re-verificar de forma independiente en esta sesión** — no hay acceso a los bytes crudos del archivo `.xlsm` desde este entorno (no se cargó como archivo adjunto accesible ni por `blobs` ni por el sandbox de Python), por lo que no fue posible correr `oletools`/`olevba` como se pidió. Este hallazgo se reporta tal como lo aportó el usuario, **sin confirmación propia**:
- Vive en el objeto de código de `Hoja1` (control ActiveX `TextBox1` embebido en la hoja, no en un módulo estándar).
- Aplica un `AutoFilter` de búsqueda por nombre sobre la columna A al cambiar el texto del cuadro.
- No hay lógica de negocio (cálculo de vencimientos, envío de datos, etc.) en esta macro ni en otras partes del proyecto VBA, según lo reportado.

**Pendiente:** confirmar con `oletools`/`olevba` sobre el archivo real antes de dar esto por cerrado — ver "Preguntas/pendientes".

### 1.8 Metadata adicional (formato condicional, validación, hojas ocultas)

- **Hoja2 y Hoja3:** confirmado por metadata del libro (`maxRows: 0, maxColumns: 0` en ambas) que están completamente vacías — vestigios sin uso. No se pudo verificar si hay una macro que las referencie más allá de lo ya reportado por el usuario (ThisWorkbook/Hoja2/Hoja3 vacías), por la misma limitación de acceso a VBA mencionada arriba.
- **Coloreado de fuente en F/VENC (hallazgo parcial, sin validar a escala):** en la muestra de las primeras filas (`A1:H10`), se observó que las celdas de F/VENC con STATUS="ACTIVO" tienen fuente **verde y negrita** (`#00B050`), y las celdas con STATUS=" S/V" tienen fuente **roja y negrita** (`#FF0000`). Esto sugiere una convención manual (no una regla de formato condicional automática, sino texto coloreado a mano al momento de actualizar cada fila) para marcar visualmente vigente/vencido. **No se pudo confirmar si este patrón es consistente en las 1395 filas** porque la llamada para leer estilos en un rango más amplio (`B4:B60`/`F4:F60`) tuvo timeout y dejó la conexión de Excel bloqueada por el resto de la sesión. Se recomienda validar esto en una sesión nueva antes de asumir que es una regla generalizable.
- No se detectaron comentarios de celda, reglas de validación de datos, ni columnas/filas ocultas en los rangos inspeccionados (A1:H10 y la lectura completa vía CSV, que no oculta datos pero tampoco reporta visibilidad — este punto específico de filas/columnas ocultas tampoco pudo verificarse a fondo por el mismo bloqueo de conexión).

## PARTE 2 — Reglas de negocio implícitas

### 2.1 ¿Qué determina STATUS = "S/V" vs "ACTIVO"?

Comparando la fecha F/VENC de cada fila según su STATUS (n=1380 filas con fecha parseable):

| STATUS | Filas | F/VENC mínima | F/VENC mediana | F/VENC máxima |
|---|---|---|---|---|
| ACTIVO (+variantes) | 358 | 2025-01-03 | **2026-07-06** | 2026-09-23 |
| S/V (+variantes) | 1023 | 2023-07-24 | **2025-07-30** | 2026-08-31 |

La mediana de F/VENC de las filas "ACTIVO" es casi **un año más reciente/futura** que la de las filas "S/V" — evidencia clara de que **STATUS = "ACTIVO" significa membresía vigente (F/VENC futuro) y "S/V" significa vencida (F/VENC pasado)**, consistente con lo que sugiere el propio texto ("S/V" = "Sin Vigencia" o similar).

**Pero no es 100% limpio:** el máximo de F/VENC entre las filas "S/V" es 2026-08-31 — prácticamente la misma fecha máxima que las "ACTIVO" (2026-09-23). Esto significa que **hay filas marcadas "S/V" con una fecha de vencimiento futura**, lo cual solo se explica por: (a) el campo STATUS no se actualiza automáticamente y quedó desfasado tras una renovación reciente, o (b) "S/V" a veces se usa con otro significado no capturado por esta hipótesis (ej. "suspendido" en vez de "vencido"). **Esto debe confirmarse con el dueño del gimnasio, no asumirse.**

### 2.2 ¿PLAN es precio mensual, o representa otra cosa?

Se cruzó el valor numérico de PLAN contra la diferencia en días entre FECHA PAGO y F/VENC, en las 620 filas donde ambas fechas son parseables:

| PLAN | Filas | Media (días) | Mediana (días) | Desv. estándar |
|---|---|---|---|---|
| 5 | 7 | 217.9 | 104 | 315.9 |
| 8 | 67 | 127.5 | 112 | 122.1 |
| 15 | 23 | 36.8 | 0 | 86.9 |
| 20 | 182 | 143.6 | 142.5 | 129.8 |
| 22 | 151 | 138.3 | 127 | 140.1 |
| 25 | 117 | 154.5 | 103 | 171.9 |
| 30 | 46 | 125.4 | 63 | 176.6 |

**No hay una relación limpia entre el valor de PLAN y una duración fija en días.** Si PLAN fuera simplemente "precio de un plan mensual de N días fijos", esperaríamos que la mediana de días fuera consistente (~30) y con baja varianza para cada valor de plan. En cambio, la mediana varía de 0 a 142.5 días según el plan, y la desviación estándar es enorme en todos los casos (86–316 días).

**Interpretación más probable (sin poder confirmarla con certeza):** PLAN sí parece ser el **precio mensual en USD** (los valores 8, 20, 22, 25, 30 son montos razonables y se repiten con alta frecuencia, consistente con una tabla de precios de un gimnasio), pero **F/VENC no se recalcula de forma consistente como "FECHA PAGO + 30 días"** — se ajusta manualmente fila por fila, posiblemente con pagos atrasados, adelantados, congelamientos de membresía, o simplemente porque FECHA PAGO no siempre se actualiza en cada renovación (recordar que 52.8% de FECHA PAGO está vacía). **Esto es una pregunta directa para el dueño del gimnasio: ¿el número en PLAN es el precio, la duración en días, o un código interno?**

---

## PARTE 3 — Contraste contra gym-app (gaps de migración)

> **Advertencia de alcance:** este análisis no tuvo acceso al archivo `packages/db/prisma/schema.prisma` del repositorio de gym-app (no hay conexión a ese sistema de archivos desde este entorno). La comparación que sigue se basa **únicamente en los nombres de modelos y campos que el propio usuario mencionó en la solicitud** (`Miembro`, `Plan`, `Suscripcion`, `EstadoSuscripcion`, `FrecuenciaPago`, `calcularCambioPlan`, `RegistrarPago`), no en una lectura verificada del schema real. Cualquier suposición sobre tipos de campo exactos en gym-app debe confirmarse leyendo el archivo directamente.

### 3.1 Mapeo campo por campo

| Campo Excel | ¿Equivalente en gym-app? | Pérdida de información si se descarta | Notas |
|---|---|---|---|
| NOMBRE | `Miembro.nombre` (asumido) | Ninguna si se mapea 1:1 | Sin separación nombre/apellido; sin normalización de anotaciones entre paréntesis |
| STATUS | `Suscripcion.estado` (`EstadoSuscripcion`) | Se pierde el matiz "sin dato" (2 filas) y la ambigüedad S/V-con-fecha-futura (2.1) si se mapea ciegamente | Requiere regla de conversión explícita, no un mapeo trivial 1:1 |
| F/NACIMIENTO | **Sin campo equivalente aparente en `Miembro`** | Prácticamente ninguna — el campo casi no se usa (99.6% vacío) y los 5 valores que tiene son basura, no fechas reales | No es prioritario migrarlo ni añadirlo al modelo |
| CELULAR | `Miembro.telefono` (asumido) | 16 filas perderían la nota "no tiene/no vino/extranjero" si se fuerza a formato teléfono | Aceptable descartar como campo libre, pero limpiar antes |
| CEDULA | `Miembro.cedula` con `@@unique([organizacionId, cedula])` | **Bloqueante:** 33 filas sin cédula + 14 filas con cédula duplicada no pueden migrar directo bajo esa restricción única | Ver 3.3 |
| F/VENC | `Suscripcion.fechaVencimiento` (asumido) | Mínima — 99% son fechas reales parseables | Requiere normalizar los dos formatos (serial + texto) antes de insertar |
| FECHA PAGO | `Suscripcion`/pago histórico vía `RegistrarPago` (asumido) | **Alta si se descarta sin revisión:** 30 filas tienen notas de negocio (trueques, cortesías, razones de no pago) que no son fechas y que hoy no tienen dónde vivir en un modelo de pagos estructurado | gym-app no parece tener un campo de "nota/motivo" en el pago — esto es una funcionalidad que el gimnasio usa hoy y podría esperar seguir teniendo |
| PLAN | `Plan` (nombre/precio) vinculado via `Suscripcion.planId` (asumido) | **Alta:** ninguno de los 9 valores de texto (`Pend`, `TV`, `Radio`, `jorge`, `Virgen`, asteriscos, `+`) tiene un `Plan` real al que mapear hoy | Ver 3.3 |

### 3.2 Casos puntuales resueltos explícitamente

**a) `STATUS` con sus 6-7 variantes → ¿colapsan a los 4 valores de `EstadoSuscripcion`?**
Los datos solo evidencian **2 estados de negocio reales**: vigente (ACTIVO) y vencido (S/V), que mapean naturalmente a `ACTIVA` y `VENCIDA`. **No hay evidencia en los datos de un tercer o cuarto estado** como `CANCELADA` o `PAUSADA` — el Excel no distingue "el miembro se dio de baja" de "está vencido sin renovar", ambos casos probablemente terminan como "S/V". Esto es una **pérdida real de información** si gym-app sí distingue esos 4 estados: hoy no hay forma de saber, solo del dato histórico, cuáles de las 1023 filas "S/V" son bajas definitivas vs. vencimientos esperando renovación. Tampoco hay evidencia de un estado "pendiente de pago" separado — los casos con PLAN=`Pend` o FECHA PAGO=`PENDIENTE` tienen STATUS="ACTIVO", no un estado propio.

**b) Valores de PLAN que no son precios limpios → ¿a qué Plan real mapean?**
Ninguno se puede mapear con certeza a partir del dato mismo:
- `Pend` (2 filas): posiblemente plan aún no decidido — no bloquea la migración de la fila del miembro, pero sí la de su suscripción/plan.
- `TV`, `Radio` (1 fila c/u): probables trueques/patrocinios — no son planes de precio y no tienen equivalente en un modelo `Plan` estándar de precio fijo.
- `jorge`, `Virgen` (1 fila c/u): parecen texto mal ubicado (nombres/relaciones), no planes.
- Asteriscos (`15*`, `20*`, etc., ~31 filas) y `+`/`25+5` (2 filas): sin leyenda documentada, no se puede saber si el asterisco cambia el precio o es solo una marca visual.

**Los 9 valores no numéricos (más los blancos) representan ~0.9% de las filas — bajo volumen, pero cada uno requiere una decisión manual antes de migrar; no se pueden migrar por lote.**

**c) `F/NACIMIENTO`: ¿se llena alguna vez?**
Confirmado sobre las 1395 filas: prácticamente nunca (5 de 1396, 0.4%), y ninguno de esos 5 valores es una fecha de nacimiento real (son texto: "PENDIENTE", "Ray", "Julio", "pasaporte" — corrimiento de datos entre columnas). **No hay pérdida real de información al no migrar este campo**, y no es necesario agregarlo al modelo `Miembro` de gym-app basándose en este dataset.

**d) `CEDULA` sin dato o duplicada → bloqueo de migración directa**
- 33 filas (2.4%) sin cédula: **no pueden crear un `Miembro` bajo `@@unique([organizacionId, cedula])`** si esa columna es NOT NULL / parte de la unique constraint tal como se describe. Requieren decisión: ¿se migran con cédula placeholder, se excluyen, o se les pide la cédula antes de migrar?
- 14 filas (7 pares) con cédula duplicada: al menos un par ("Vanessa Yajuris (Virgen Valle)" / "Vannesa Yajunis", cédula `22969126`) es casi con certeza la misma persona duplicada por error de tipeo del nombre — candidata a fusionarse antes de migrar, no a insertarse dos veces. Los otros 6 pares requieren revisión manual uno por uno para decidir si son personas distintas que coinciden por error de tipeo de cédula, o duplicados reales.

### 3.3 Funcionalidad que el Excel no captura hoy pero gym-app sí

Basado únicamente en los nombres de función que el usuario mencionó (`calcularCambioPlan`, `RegistrarPago`) — sin haber leído su implementación —, es razonable esperar que gym-app ya soporte: historial de pagos con múltiples registros por miembro (vs. el Excel que solo guarda la última FECHA PAGO), cambios de plan con lógica de prorrateo, y estados de suscripción más granulares. El gimnasio probablemente **no va a resistirse** a ganar esto — el riesgo de migración no es "gym-app hace menos", sino que los datos de origen (Excel) no tienen la granularidad para poblar esas funcionalidades más ricas desde el día uno (ej. no hay historial de pagos, solo el último).

---

# Preguntas para el dueño del gimnasio (todo lo que no se pudo inferir con certeza)

1. **PLAN — valores de texto:** ¿qué son exactamente `Pend`, `TV`, `Radio`, `jorge`, `Virgen`, `+`? ¿Son trueques/cortesías, errores de tipeo, o algo con lógica de negocio propia?
2. **PLAN — asterisco:** ¿qué significa el asterisco en valores como `15*`, `20*`, `10*` (~31 filas)? ¿Cambia el precio, marca una promoción, o es solo una nota visual sin efecto en el cobro?
3. **PLAN — naturaleza del número:** ¿el número en PLAN es el precio mensual en USD, la duración en días, o un código de plan? El análisis de fechas no mostró una relación limpia de "N días" por valor de plan.
4. **STATUS "S/V" con F/VENC futuro:** ¿por qué existen filas marcadas "S/V" con fecha de vencimiento posterior a la fecha de otras filas "ACTIVO"? ¿Es un desfase de actualización, o "S/V" tiene más de un significado (ej. "vencido" vs. "suspendido")?
5. **Estados intermedios:** ¿existe en la operación real del gimnasio algo como "pendiente de pago" o "pausado/congelado" que hoy simplemente no se refleja en STATUS (todo termina en ACTIVO o S/V)?
6. **CEDULA duplicada:** confirmar, fila por fila, cuáles de los 7 pares duplicados son la misma persona (para fusionar) y cuáles son personas distintas con error de tipeo en la cédula.
7. **CEDULA vacía (33 filas):** ¿se puede recuperar la cédula real de estas personas antes de migrar, o se migran con un valor placeholder / se excluyen de la migración inicial?
8. **FECHA PAGO — notas de texto (30 filas):** confirmar el significado de `Membresia`, `Intercambio`, `2 X 1`, `Bco Vzla`, `cantv`, `montaoriente`, etc. — parecen relevantes para historial de pagos/trueques y no deberían perderse silenciosamente.
9. **Coloreado rojo/verde en F/VENC:** ¿es una convención manual intencional (rojo=vencido, verde=vigente) que el gimnasio usa como ayuda visual? Solo se verificó en una muestra de 10 filas por una limitación técnica de esta sesión — confirmar si aplica de forma consistente a las 1395 filas.
10. **Macro VBA:** este análisis no pudo re-extraer el proyecto VBA de forma independiente (no hubo acceso a los bytes crudos del archivo en este entorno). Se recomienda correr `oletools`/`olevba` sobre el archivo real antes de asumir que `TextBox1_Change` es la única lógica — especialmente confirmar que no hay macros en módulos estándar fuera de las hojas.
11. **Filas con corrimiento de columnas** (ej. "PENDIENTE" apareciendo en F/NACIMIENTO en vez de STATUS/FECHA PAGO): ¿cuántas más hay de este tipo, y vale la pena una limpieza manual antes de migrar, o se descartan esas filas?
</content>
</invoke>
