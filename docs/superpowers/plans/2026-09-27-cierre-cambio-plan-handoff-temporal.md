# Handoff temporal — Cierre integral del flujo de cambio de plan (pausa 2026-09-27)

Documento de retoma rápida. No es el handoff.md oficial del proyecto (ese sigue
las 5 secciones fijas de CLAUDE.md) — esto es solo para no perder el hilo de esta
tarea multi-fase mientras el usuario está fuera.

## Qué se pidió originalmente

Prompt maestro de 4 fases para cerrar el flujo de "cambio de plan":
- **Fase 0:** push de un commit pendiente (resultó no aplicar — ver abajo).
- **Fase 1:** eliminar "Solo ajustar vencimiento", dejar un único camino de cálculo
  diferencial. ✅ **HECHA, commiteada y pusheada.**
- **Fase 2:** anclaje estricto en USD (auditoría) + frecuencias genéricas
  (`Plan.diasCiclo` configurable en vez de enum fijo). 🔶 **EN DISEÑO — pausada acá.**
- **Fase 3:** conectar las 3 modalidades de pago (total/abono/fraccionado) al cambio
  de plan, reusando `RegistrarPago.ts`/`ReglaAbono.ts`. **No empezada.**

Regla del usuario: una fase a la vez, con confirmación explícita antes de avanzar
a la siguiente. No adelantar fases.

## Fase 0 — resuelta como "no aplica"

El handoff.md del repo (de una sesión anterior) decía que había un commit `dd378be`
sin pushear y 4 archivos con cambios sin commitear. Verificado con `git log`/`git
status`/`git fetch`: **eso ya estaba commiteado y pusheado** en un commit `71890e3`
anterior a esta sesión. No hubo nada que hacer en la Fase 0 — se saltó directo a
la Fase 1 con confirmación del usuario.

## Fase 1 — completa, commiteada y pusheada

Commits (en este orden, encima de `71890e3`):
1. `2547568` — `feat(cambio-plan): unificar en un unico calculo diferencial, sin ajustar vencimiento sin cobro`
2. `f42ce22` — `test(cambio-plan): actualizar suite al unico camino de calculo diferencial`
3. `66e7743` — `feat(cambio-plan): quitar boton de ajustar vencimiento sin cobro y limpiar codigo muerto`

Verificado con `git log --oneline`, `git status` y `git fetch origin main` (no
solo la referencia en caché) que `origin/main` tiene exactamente estos 3 commits.
Working tree limpio al momento de la pausa.

### Qué cambió en el dominio

`packages/domain/entities/cambioPlanCalculo.ts` — se eliminó `ModoCambioPlan` y el
parámetro `modo`. Ahora `calcularCambioPlan` es un único camino:
- `V > precioNuevo` → excedente absorbido en días extra del plan nuevo, sin cobro.
- `V < precioNuevo` → cobra `precioNuevo - V`, vencimiento avanza un ciclo normal
  del plan nuevo desde hoy.
- `V == precioNuevo` → sin cobro, vencimiento avanza un ciclo normal desde hoy.

`packages/domain/use-cases/CambiarPlanConPago.ts` — ya no recibe `modo` en
`DatosCambiarPlanConPago`; llama a `calcularCambioPlan` sin ese parámetro. El
registro de auditoría sigue escribiendo `modo: "CICLO_COMPLETO"` siempre (el enum
`ModoCambioPlanAuditoria` de Prisma se conserva con 2 valores por compatibilidad de
lectura histórica, pero el código nunca vuelve a escribir `AJUSTAR_VENCIMIENTO`).

**Dato clave verificado contra la base real de producción antes de tocar nada:**
`CambioPlanAuditoria` tenía **0 registros en total, en cualquier modo** — no hubo
ningún ajuste retroactivo que hacer.

### Qué cambió en frontend

`FormularioCambiarPlan.tsx` — un único botón de confirmación ("Cambiar de plan —
cobrar $X" / "Cambiar de plan — sin costo adicional"), sin el botón "Solo ajustar
vencimiento". `ModalRegistrarPagoCaja.tsx` (wizard de Caja) actualizado al mismo
pronóstico único vía `ProyeccionCambioPlan` (ya sin campo `modo`).

### Limpieza

Se eliminó código muerto que modelaba el comportamiento viejo (confirmado sin
importadores antes de borrar):
- `packages/domain/entities/CambioPlan.ts`
- `apps/web-admin/app/(panel)/caja/calcularProrrateoPlan.ts`

### Tests

`packages/domain/entities/cambioPlanCalculo.test.ts` y
`packages/domain/use-cases/CambiarPlanConPago.test.ts` reescritos completos para
la fórmula nueva. Incluye, a pedido explícito del usuario:
- Caso `V == precioNuevo` con cambio de FRECUENCIA (no solo con/sin entrenador
  mismo ciclo) — confirma que "avanza un ciclo" usa `diasCicloNuevo` desde HOY, no
  la duración del ciclo viejo.
- Caso `V > precioNuevo` en `CambiarPlanConPago.test.ts` confirmando explícitamente
  que NO exige método de pago (no debe lanzar `MetodoPagoRequeridoError`, no debe
  crearse ningún `Pago`).

Verificado: `npx vitest run` → 18/18 en verde (`packages/domain`). `npx tsc --noEmit`
limpio en `apps/web-admin`, `apps/kiosk`, `apps/worker`.

## Fase 2 — auditoría hecha, diseño en curso (pausada acá)

### 2.1 Auditoría de anclaje USD — CERRADA, sin hallazgos que corregir

Verificado con evidencia archivo+línea (agente Explore, informe completo en el
historial de esta conversación) que la tasa BCV **nunca** entra al cálculo
diferencial:
- `CambiarPlanConPago.ts:151-172` — `precioViejo`/`precioNuevo` salen directo de
  `Plan.precioUSD` (o `Miembro.precioPlan` de fallback), sin ninguna conversión
  intermedia. `calcularCambioPlan` no tiene parámetro de tasa en su firma.
- `tasaCambio` solo se usa DESPUÉS de tener `montoCobrado` en USD
  (`CambiarPlanConPago.ts:195`, `montoBs: montoCobrado * input.tasaCambio`) — para
  el registro del Pago, nunca al revés.
- Frontend (`FormularioCambiarPlan.tsx:132-139`) mismo patrón: la tasa elegida
  viaja como campo oculto hacia el servidor, nunca entra al cálculo del cliente.

**No hay nada que corregir en este punto.** Ya cumple el criterio de la Fase 2.

### 2.2 `diasCiclo` configurable — auditado, bloqueante confirmado, diseño en curso

Estado actual confirmado:
- `Plan` en `packages/db/prisma/schema.prisma` **no tiene** campo numérico de
  duración — solo `frecuencia FrecuenciaPago` (enum de exactamente 4 valores:
  `DIARIO`/`SEMANAL`/`QUINCENAL`/`MENSUAL`).
- `DURACION_DIAS_POR_FRECUENCIA` (`packages/domain/entities/Plan.ts:13-18`) es la
  única fuente de días por ciclo:
  ```ts
  export const DURACION_DIAS_POR_FRECUENCIA: Record<FrecuenciaPago, number> = {
    DIARIO: 1,
    SEMANAL: 7,
    QUINCENAL: 15,
    MENSUAL: 30,
  };
  ```
- No existe ningún diseño previo en `docs/superpowers/` para esto — se parte de
  cero en este frente.

**Backfill confirmado por el usuario:** Diario=1, Semanal=7, Quincenal=15,
Mensual=30 (ya existentes) + **Semestral=180** (no 182 — simplicidad sobre
precisión calendario exacta, decisión explícita del usuario) + **Anual=365**.

#### Migración de Prisma — mecánica confirmada, en 2 pasos separados

Hay precedente exacto en el propio repo:
`packages/db/prisma/migrations/20260924000000_frecuencia_diario/migration.sql`
agregó `DIARIO` al enum así:
```sql
ALTER TYPE "FrecuenciaPago" ADD VALUE IF NOT EXISTS 'DIARIO';
```
como su propia migración, sin nada más en el archivo.

Postgres no permite usar un valor de enum recién agregado con `ADD VALUE` dentro
de la misma transacción que lo creó (no se puede comparar/filtrar por él hasta que
esa transacción haga commit). Prisma corre cada migración en su propia
transacción, así que el plan es:

- **Migración A** (aislada, solo enum): agrega `SEMESTRAL` y `ANUAL` con
  `ADD VALUE IF NOT EXISTS` (mismo patrón que la de `DIARIO`), nada más en el
  archivo.
- **Migración B** (posterior, timestamp mayor): agrega `Plan.diasCiclo INTEGER` +
  el `UPDATE ... WHERE frecuencia = 'SEMESTRAL'` de backfill — como corre en una
  transacción posterior a la que creó los valores nuevos del enum, ya puede
  referenciarlos sin error.

**No se puede** agregar los valores del enum y hacer el UPDATE que los usa en el
mismo archivo/transacción — confirmado como riesgo real, no hipotético.

#### Alcance real de reemplazar `DURACION_DIAS_POR_FRECUENCIA[frecuencia]` por `plan.diasCiclo`

Tabla completa de los 7 consumidores (más la propia definición), con evidencia
archivo+línea, ya entregada al usuario en el chat. Resumen:

| Archivo | ¿Cambia la firma? |
|---|---|
| `Plan.ts` (definición del mapa) | — (se retira o queda de fallback, a decidir) |
| `RegistrarPago.ts:189,214` | No — cambio local, ya tiene `plan` completo en scope |
| `CambiarPlanConPago.ts:168,171,231,233` | No — cambio local, ya tiene `planViejo`/`planNuevo` completos |
| `proyeccionAbono.ts:65` | No (parcial) — el objeto `plan` inline solo necesita un campo más |
| `CalcularVencimientoPlan.ts` (`prorratearVencimiento`) | **Sí** — hoy recibe `frecuenciaVieja/Nueva: FrecuenciaPago` sueltas, no un `Plan`; obliga a tocar su(s) llamador(es). Pendiente confirmar si esta función sigue viva (no se la vio invocada en los greps hechos) |
| `proyeccionRenovacion.ts` (`calcularProyeccionRenovacion`) | **Sí** — recibe `frecuencia: FrecuenciaPago` suelta; obliga a tocar su llamador, `ModalRegistrarPagoCaja.tsx` |
| `FormularioCambiarPlan.tsx:135,138` | **Sí, de props** — `PlanParaCambio`/`frecuenciaActual` deben pasar a incluir `diasCiclo`; se propaga a los 2 padres que lo renderizan: `miembros/[id]/page.tsx` y `ModalRegistrarPagoCaja.tsx` |
| `FormularioReglaAbono.tsx` / `ReglaAbonoPorFrecuencia` | **Caso aparte** — este modelo está atado a la FRECUENCIA (enum), no a un Plan individual. No es un simple find-replace: hay que decidir si la regla de abono por frecuencia sigue usando una duración "típica" de esa frecuencia o si pasa a configurarse en días directamente ahí también |

### Pregunta abierta — RESUELTA (retomado 2026-09-27, misma sesión)

**¿Cómo debe funcionar `ReglaAbonoPorFrecuencia` una vez que `diasCiclo` es
configurable por plan?** Verificado con evidencia archivo+línea en
`packages/domain/entities/ReglaAbono.ts` que `minimoAbonoValor`/`minimoAbonoTipo`
(tanto en `Plan` como en `ReglaAbonoPorFrecuencia`) **nunca se calculan** en
función de `diasCiclo` — son siempre valores fijos que un admin configura a mano.
`diasCiclo` solo entra en el CONSUMO de esos valores (`calcularMontoMinimoAbono`,
`diasAPorcentaje`/`porcentajeADias`, ReglaAbono.ts:49-72), como un parámetro
numérico plano que esas funciones ya reciben hoy — no lo derivan de la frecuencia
internamente.

**Decisión del usuario, aplicada:**
1. No hay conflicto arquitectónico — `ReglaAbonoPorFrecuencia` queda intacta.
2. El único trabajo pendiente ahí es agregar filas de configuración para
   Semestral/Anual (UI en `/configuraciones/reglas-abono` + seed), trabajo de
   UI/datos, no de arquitectura.
3. **No se migra** la regla de abono a nivel de plan individual en esta fase —
   nadie lo pidió y no hay caso de negocio hoy que lo requiera (dos planes de la
   misma frecuencia con `diasCiclo` distinto). Si aparece en el futuro, es una
   fase aparte.

Con esto, la pregunta abierta queda cerrada y no bloquea el diseño de la
migración.

### `CalcularVencimientoPlan.prorratearVencimiento` — confirmado en uso real

Verificado con grep: **2 llamadores reales**, no es código vestigial.
- `ActualizarMiembro.ts:69` — `prorratearVencimiento(activa.inicio, ahora, planViejo.frecuencia, planNuevo.frecuencia)`.
- `ActualizarFrecuenciaPlan.ts:73` — `prorratearVencimiento(suscripcion.inicio, ahora, frecuenciaVieja, input.frecuencia)`.

Ambos llamadores ya tienen el `Plan` completo (`planViejo`/`planNuevo`) en su
scope — el cambio de firma (`frecuenciaVieja/Nueva: FrecuenciaPago` →
`diasCicloViejo/Nuevo: number`) se propaga a exactamente estos 2 sitios, y en
ambos el reemplazo es directo (`planViejo.diasCiclo` en vez de
`planViejo.frecuencia`). No es código muerto, pero tampoco es un cambio riesgoso.

## Diseño de la migración — 4 correcciones tras revisión crítica del usuario (2026-09-27, misma sesión de retoma)

Antes de aprobar, el usuario pidió 4 verificaciones concretas sobre mi propuesta
inicial. Resultado:

1. **`DURACION_DIAS_POR_FRECUENCIA` NO queda como "fallback" en ningún lado —
   corrección de mi propio diseño.** Verificado que los 8 usos actuales del mapa
   son TODOS caminos de cálculo real (`CambiarPlanConPago.ts`, `RegistrarPago.ts`,
   `proyeccionAbono.ts`, `proyeccionRenovacion.ts`, `CalcularVencimientoPlan.ts`,
   `FormularioCambiarPlan.tsx`, `FormularioReglaAbono.tsx`, `Plan.ts`), ninguno es
   solo un valor sugerido de UI. Mantenerlo en paralelo repetiría el patrón de dos
   fuentes de verdad que causó el bug E6 ya corregido en la Fase 1. **Se elimina
   el mapa por completo**, los 8 archivos pasan a leer `plan.diasCiclo`.

2. **Decisión de producto tomada por el usuario vía AskUserQuestion: HÍBRIDO.**
   El formulario de plan (`FormularioPlan.tsx`) va a tener un `<select>` con las 6
   frecuencias fijas (autocompletan `diasCiclo`: 1/7/15/30/180/365) MÁS una
   opción **"Personalizado"** que revela un input numérico de días libre. Esto
   implica que `frecuencia` necesita representar ese caso (a definir en el diseño
   final: ¿un valor de enum `PERSONALIZADO`, o `frecuencia` nullable cuando hay un
   `diasCiclo` a medida?) — pendiente de detallar antes de implementar.

3. **Atomicidad migración+código — sin ventana de riesgo, gracias al pipeline
   existente.** El proyecto YA tiene `docker-entrypoint.sh` corriendo
   `prisma migrate deploy` (con `set -e`) ANTES de arrancar `server.js` en cada
   build de contenedor (ver Dockerfile, sección "Roadmap del cliente punto a" del
   handoff.md oficial) — migración y código nuevo viajan en el mismo deploy, nunca
   hay código viejo sirviendo tráfico contra schema nuevo. Dentro de la migración B
   en sí: el `ALTER COLUMN diasCiclo SET NOT NULL` va en un paso separado DESPUÉS
   del `UPDATE` de backfill (misma transacción del archivo .sql) — si el `UPDATE`
   deja alguna fila en `NULL` (ej. una 7ma frecuencia futura sin agregar al `CASE`),
   el `SET NOT NULL` falla explícito y el deploy no arranca, en vez de correr
   silenciosamente con datos incompletos.

4. **`packages/db/prisma/seed.ts` agregado a la lista de archivos a tocar.**
   Confirmado con evidencia (`seed.ts:72-89`): crea 2 planes vía
   `prisma.plan.create({ data: {...} })` directo (sin pasar por
   `PrismaPlanRepository`) — con `diasCiclo NOT NULL` sin default, este archivo
   rompe si no se actualiza. Se le agrega `diasCiclo: 30` a ambos `create` (son
   planes `MENSUAL`).

## Qué falta para cerrar la Fase 2 (al retomar)

1. ~~Resolver la pregunta abierta de `ReglaAbonoPorFrecuencia`~~ — **RESUELTO**
   (ver arriba): no hay conflicto, queda intacta, solo falta agregar filas de
   Semestral/Anual (UI/seed).
2. ~~Confirmar si `CalcularVencimientoPlan.prorratearVencimiento` sigue en uso
   real~~ — **RESUELTO** (ver arriba): sí, 2 llamadores, ambos con `Plan` completo
   en scope.
3. Escribir el diseño completo de la migración (2 archivos SQL en el orden
   correcto) y el plan de reemplazo archivo por archivo, para aprobación del
   usuario ANTES de tocar código (todavía no se implementó nada de la Fase 2).
4. Tras aprobación: implementar 2.2, luego 2.3 (tests de anclaje USD con dos tasas
   distintas, ya diseñados en el prompt maestro original pero no escritos).
5. Recién después de que el usuario apruebe el cierre completo de la Fase 2,
   pasar a la Fase 3 (conectar las 3 modalidades de pago al cambio de plan) — no
   antes, por instrucción explícita del usuario de no adelantar fases.

## Estado de git al momento de la pausa

```
$ git log --oneline -6
66e7743 feat(cambio-plan): quitar boton de ajustar vencimiento sin cobro y limpiar codigo muerto
f42ce22 test(cambio-plan): actualizar suite al unico camino de calculo diferencial
2547568 feat(cambio-plan): unificar en un unico calculo diferencial, sin ajustar vencimiento sin cobro
71890e3 feat(cambio-plan): migrar a calcularCambioPlan y corregir vencimiento mostrado en Caja (E6)
dd378be feat(datos): resetear vencimientos de prueba a rango realista
a2f885f feat(auditoria): registrar el cambio de plan en una transacción atómica

$ git status
On branch main
Your branch is up to date with 'origin/main'.
nothing to commit, working tree clean
```

Sin cambios de código pendientes de la Fase 2 — todo lo hecho hasta la pausa es
lectura/auditoría, ningún archivo fue modificado todavía para esta fase.
