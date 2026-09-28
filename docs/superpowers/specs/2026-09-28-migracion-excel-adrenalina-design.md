# Migración DATA_ADRENALINA_.xlsm → gym-app (diseño)

**Fecha:** 2026-09-28
**Estado:** Aprobado para implementación (parámetros de negocio pendientes de completar por el usuario — ver sección 8)
**Alcance de esta fase:** Solo la base local/dev existente (VPS de construcción, sin usuarios reales). Nunca producción sin decisión explícita posterior.

## Contexto

`docs/xls/DATA ADRENALINA_.xlsm` contiene 1395 filas reales de miembros de un gimnasio, ya analizadas exhaustivamente en `docs/xls/ANALISIS_MIGRACION_EXCEL.md` (léase primero — no se repite ese análisis acá). Resumen de lo relevante para este diseño:

- **STATUS** colapsa a 2 estados reales: `ACTIVO` (362 filas, con variantes de espacios/género) y `S/V` (1032 filas, con variantes de espacios). 2 filas sin dato.
- **PLAN** es ~96% precio limpio en USD. 5 valores concentran el 95% de esas filas: `20` (306), `8` (273), `25` (258), `30` (249), `22` (193) = 1279 filas. Los 17 valores restantes (`15`, `5`, `31`, `16`, `0`, `7`, `23`, `18`, `28`, `6`, `17.5`, `26`, `27`, `4`, `9`, `12`, `10`, más asteriscos `15*`/`20*`/`10*`) son casos puntuales de baja frecuencia. Además hay 9 valores de texto sin equivalente (`Pend`, `TV`, `Radio`, `jorge`, `Virgen`, `*` solo, `+`, `25+5`) y 9 filas en blanco.
- **CEDULA**: 33 filas vacías, 14 filas en 7 pares duplicados.
- **F/VENC**: 947 filas fecha serial, 436 texto `dd-mm-yyyy`, 11 vacías, 2 malformadas.
- **FECHA PAGO**: 52.8% vacía, resto fecha real o 30 filas con nota de texto operativa (trueques, cortesías, motivos de no pago).
- **F/NACIMIENTO**: descartable, prácticamente nunca usado y sin datos reales cuando tiene contenido.

Schema real relevante (`packages/db/prisma/schema.prisma`, leído directamente, no asumido):
- `Miembro.cedula`: `String` **NOT NULL**, `@@unique([organizacionId, cedula])`.
- `Miembro.precioPlan`: `Decimal` NOT NULL (precio vigente que paga, puede diferir del catálogo).
- `Plan.diasCiclo`: `Int`, única fuente de verdad de duración de ciclo (ya migrado en la Fase 2 previa).
- `Suscripcion.inicio` / `.fin`: `DateTime` NOT NULL ambos.
- `EstadoSuscripcion`: `ACTIVA | VENCIDA | CANCELADA | PAUSADA`.
- `Pago.monto`, `.metodo`: NOT NULL; no existe campo de "nota" separado — `metodo` es el único lugar libre para texto.
- No hay campo equivalente a F/NACIMIENTO en `Miembro`.

## 1. Alcance y entorno

Script Node/TS standalone en `packages/db/scripts/migracion-excel/`, ejecutado con `tsx`, usando el Prisma Client ya generado del monorepo (`packages/db/generated/prisma`).

No existe distinción de infraestructura entre "producción" y "pruebas" en este momento — hay un único `DATABASE_URL` (VPS de construcción). El guardrail no intenta detectar el entorno por patrón de string. En su lugar:

- Al arrancar, el script imprime explícitamente el host y nombre de base de `DATABASE_URL` en uso (sin credenciales).
- Por defecto (sin flags), corre en **modo dry-run**: lee el Excel, aplica todas las reglas y mapeos, y genera el reporte completo de qué se crearía/actualizaría/excluiría — sin ejecutar ninguna escritura.
- Solo escribe en la base si se invoca con `--confirm` explícito. La decisión de cuándo es seguro confirmar es del usuario, no del script.

## 2. Datos de entrada editables

### `mapeo-plan.json`
Array de entradas, una por cada valor de PLAN que no es uno de los 5 dominantes:

```json
[
  { "valorExcel": "15", "accion": "mapear", "planNombreDestino": "Plan $15" },
  { "valorExcel": "17.5", "accion": "mapear", "planNombreDestino": "Plan $20 (legacy)" },
  { "valorExcel": "0", "accion": "mapear", "planNombreDestino": "Cortesia", "precioPlanOverrideUSD": 0 },
  { "valorExcel": "Pend", "accion": "excluir" },
  { "valorExcel": "TV", "accion": "excluir" },
  { "valorExcel": "", "accion": "pendiente" }
]
```

- `accion`: `"mapear"` (referencia un `Plan` existente o a auto-crear como legacy/inactivo — ver sección 3.4), `"excluir"` (la fila no genera `Suscripcion`; el `Miembro` puede migrar igual sin plan, o excluirse del todo — a decidir junto con el usuario al completar el archivo), o `"pendiente"` (valor por defecto al generar el template; el script trata `"pendiente"` igual que `"excluir"` con motivo `sin-mapeo-plan-definido`, nunca migra en silencio).
- `precioPlanOverrideUSD` (opcional): permite fijar el `Miembro.precioPlan` real aunque el `Plan` referenciado tenga otro precio de catálogo (ej. cortesías a $0).
- El script genera un template inicial de este archivo (con las ~17 entradas numéricas raras + 9 de texto + blancos, todas en `"pendiente"`) la primera vez que corre, para que el usuario y el dueño del gimnasio lo completen.

### `reglas-cedula.json`
```json
{
  "vaciaAccion": "placeholder",
  "duplicados": [
    {
      "cedula": "22969126",
      "filaA": 812,
      "filaB": 951,
      "fusionar": true,
      "filaGanadora": 951
    }
  ]
}
```
- `vaciaAccion` fijo en `"placeholder"` según decisión ya tomada.
- `duplicados`: el script pre-puebla los 7 pares detectados, con una fusión sugerida automáticamente por similitud de nombre (`fusionar: true` cuando la similitud supera un umbral simple, `false` en caso contrario) y `filaGanadora` sugerida (la fila con más campos completos). El usuario revisa y ajusta antes de `--confirm`.

## 3. Pipeline de procesamiento

1. **Leer** el `.xlsm` (`Hoja1`, filas 4–1399) con una librería de parseo de Excel; conservar el **número de fila original** de cada registro como identificador estable en todo el pipeline.
2. **Normalizar** cada fila: trim de espacios en STATUS, parseo dual de fechas (serial Excel y texto `dd-mm-yyyy`), clasificación de PLAN (limpio / con asterisco / texto / blanco).
3. **Resolver cédula:**
   - Vacía → `PLACEHOLDER-<numeroFilaExcelOriginal>` (ver sección 5, fórmula determinística) + flag `cedula-placeholder`.
   - Duplicada → si `fusionar: true` en `reglas-cedula.json`, se migra una sola fila (la `filaGanadora`, con los datos más completos entre el par) con flag `fusionada`; si `fusionar: false`, ambas filas se marcan `excluida` con motivo `duplicado-pendiente-revision` hasta que se decida a mano.
4. **Resolver STATUS:** `ACTIVO`/variantes → `EstadoSuscripcion.ACTIVA`; `S/V`/variantes → `EstadoSuscripcion.VENCIDA`; sin dato (2 filas) → `excluida`, motivo `status-sin-dato`.
5. **Resolver PLAN:**
   - Si el valor numérico limpio está en la lista fija `[20, 8, 25, 30, 22]`: usar (o auto-crear si no existe aún en la organización) un `Plan` `MENSUAL`, `diasCiclo: 30`, `precioUSD` = ese valor, `nombre: "Plan $<valor>"`.
   - Cualquier otro valor (los 17 raros + 9 de texto + blancos): resolver contra `mapeo-plan.json` según su `accion`.
6. **Resolver fechas de Suscripcion:**
   - `fin` = F/VENC parseado. Si es una de las 13 filas inválidas/vacías → `fin` = placeholder de fecha (ver sección 6) + flag `fecha-vencimiento-placeholder`.
   - `inicio` = `fin - diasCiclo` del `Plan` resuelto.
7. **Resolver FECHA PAGO:**
   - Fecha real parseable → no genera `Pago` adicional (el dato ya se refleja en `Miembro.fechaUltimoPago`, tomado de esa misma fecha).
   - Nota de texto (30 filas) → crea un `Pago` con `monto: 0`, `metodo: "<texto original de la nota>"`, `fechaPago: F/VENC` (aproximado), flag `pago-aproximado`.
   - Vacía → no genera `Pago`.
8. **Clasificar la fila** en una de las categorías de la sección 4 y agregarla al reporte.
9. **Si `--confirm`:** para cada fila migrable, en una transacción Prisma por fila: buscar `(organizacionId, cedula)` existente → si existe, saltear (`ya-existia`); si no, crear `Miembro` + `Suscripcion` + `Pago` (si aplica). Auto-crear `Organizacion` de prueba y `Sucursal` `"Migracion-Test"` si no existen aún, antes de procesar filas.

## 4. Manejo de errores y reporte

Ninguna fila se migra en silencio. Cada una de las 1395 filas termina en exactamente una categoría:

- **Migrada limpia** — sin flags.
- **Migrada con flag de revisión** — sub-motivos: `cedula-placeholder`, `fecha-vencimiento-placeholder`, `plan-legacy`, `pago-aproximado`.
- **Fusionada** — indica fila ganadora y fila descartada, con los datos originales completos de ambas.
- **Excluida** — motivo explícito: `sin-mapeo-plan-definido`, `status-sin-dato`, `duplicado-pendiente-revision`, u otro error de parseo irrecuperable.

**Salida:** `reporte-migracion-<timestamp>.json` con detalle fila por fila (número de fila original, nombre, categoría, motivo, datos originales vs. datos migrados/a migrar) + resumen tabular en consola con conteos por categoría. Se genera siempre — único resultado en dry-run; en `--confirm` se genera antes de escribir (plan de acción) y se regenera al final reflejando lo efectivamente escrito.

## 5. Idempotencia y manejo de fallas a mitad de camino

- **Verificación previa:** antes de escribir cualquier fila, el script busca `Miembro` existente por `(organizacionId, cedula)`. Si ya existe, la fila se saltea completa y se marca `ya-existia` — correr `--confirm` dos veces seguidas es seguro.
- **Placeholder de cédula determinístico:** `PLACEHOLDER-<numeroFilaExcelOriginal>`, usando el número de fila real del `.xlsm` fuente (nunca UUID ni timestamp). La fila 47 sin cédula genera siempre `PLACEHOLDER-47` en cualquier corrida, permitiendo que la verificación de "ya existe" la detecte correctamente en re-ejecuciones. **Precondición:** el script debe leer el `.xlsm` como archivo fijo de entrada, preservando los números de fila originales — nunca re-derivarlos de un dataset ya filtrado o reordenado.
- **Granularidad de transacción:** una transacción Prisma independiente por fila (`Miembro` + `Suscripcion` + `Pago` opcional, todo o nada por esa fila). Un fallo en una fila no revierte filas anteriores ya confirmadas ni bloquea el resto del batch — se captura el error, la fila se marca `excluida` con el motivo técnico, y el script continúa.
- **Corte del proceso completo:** si el proceso se interrumpe (kill, caída de conexión), las filas ya escritas quedan como están (commits por fila, no transacción global). Reintentar con `--confirm` retoma de forma segura gracias a la verificación de "ya existe".
- **Fuera de alcance de esta fase:** no hay rollback automático de todo el batch ni modo "deshacer migración completa". Si hace falta deshacer, se hace a mano contra la base local, acotado por la `Sucursal "Migracion-Test"` (todo lo migrado cuelga de ahí) o por rango de fecha de creación.

## 6. Fecha placeholder (F/VENC inválido/vacío)

Para las 13 filas sin F/VENC parseable, se usa una fecha placeholder explícita y fácilmente identificable como tal (a definir el valor exacto en implementación, ej. una fecha muy próxima que obligue a revisión inmediata) — la fila se migra con `Suscripcion.estado` forzado a coherencia con el flag `fecha-vencimiento-placeholder`, nunca se asume una fecha de vencimiento real inventada.

## 7. Explícitamente fuera de alcance

- Migrar `F/NACIMIENTO` (descartable según el análisis).
- Migrar contra producción o cualquier entorno más allá del `DATABASE_URL` actual.
- Detección automática de "producción" por patrón de string.
- Rollback automático de todo el batch.
- Resolver automáticamente los 7 pares de cédula duplicada sin revisión del usuario (la fusión automática es una *sugerencia*, no una decisión final sin `reglas-cedula.json` completado).

## 8. Parámetros de negocio pendientes (a completar por el usuario antes de `--confirm`)

1. Completar `mapeo-plan.json`: decidir para cada uno de los 17 valores raros de PLAN + 9 textos + blancos si mapean a uno de los 5 planes reales, se crean como legacy/inactivo, o se excluyen.
2. Revisar y confirmar/ajustar `reglas-cedula.json`: validar las fusiones sugeridas para los 7 pares duplicados.
3. Confirmar el valor exacto de la fecha placeholder de la sección 6.
4. Confirmar si los planes "legacy" creados desde `mapeo-plan.json` deben quedar con `Plan.activo = false` para no aparecer en selectores de la app.
