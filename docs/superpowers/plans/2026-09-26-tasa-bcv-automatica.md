# Tasa BCV automática — Implementation Plan

> **Para el agente (Claude Code):** ejecuta este plan **una etapa a la vez**. Al terminar cada etapa, DETENTE, entrega la respuesta final obligatoria (ver §Reglas) y espera la confirmación explícita del usuario antes de empezar la siguiente. Los pasos usan checkboxes (`- [ ]`).

**Ubicación sugerida en el repo:** `docs/superpowers/plans/2026-09-26-tasa-bcv-automatica.md`

**Goal:** que el sistema cobre **siempre con la última tasa publicada por el BCV, desde el mismo momento en que se publica**, sin intervención manual, sin servicios 24/7 nuevos y sin CI, rellenando automáticamente cualquier día faltante.

**Architecture:** hexagonal (igual que el resto del repo).
- `packages/domain`: la **regla de vigencia** (`ObtenerTasaVigente`: la última publicada, más una señal de desactualización) y la **reconciliación** (`SincronizarTasas`). Sin reloj, sin fetch, sin Prisma.
- `packages/infrastructure`: `BcvApiAdapter` consume el endpoint de **históricos** de DolarAPI con **ETag** (petición condicional, `304` = sin cambios). `PrismaTasaCambioRepository` gana el guardado en lote.
- `apps/web-admin/lib`: el **orquestador** con estado de proceso (throttle de 45 min, single-flight, versión/ETag conocida) que dispara la sincronización durante el uso normal del panel, con `after()` de Next.js para no bloquear la respuesta.
- Server Actions de pago y egreso: validan en el servidor que la tasa usada sea la última publicada.

**Tech Stack:** Next.js 16.3.4 (`after` de `next/server`), Prisma 7, `fetch` nativo de Node 22, `tsx` para scripts de verificación. **Sin dependencias nuevas.**

---

## Contexto obligatorio antes de empezar

- **`handoff.md` dice que la actualización automática de la tasa está "DESACTIVADA A PEDIDO DEL USUARIO".** Esa decisión se refería al **daemon** (`apps/worker/src/daemon.ts` + servicio `tasa-bcv` en Easypanel), que sigue descartado. **El 2026-09-26 el usuario pidió explícitamente este nuevo enfoque** (sin daemon, sin servicio nuevo, sin CI). Actualiza esa sección de `handoff.md` al cerrar la Etapa 1.
- **Criterio de negocio (decisión del dueño, 2026-09-26, no negociable):** se trabaja **siempre con la última tasa publicada**. La tasa nueva entra en curso **en cuanto se detecta la publicación**, sin diferirla por su fecha valor bajo ningún concepto. Ejemplo: la tasa que el BCV publica el viernes en la tarde (con fecha valor del lunes) se cobra desde ese mismo viernes en la tarde.
- Estado verificado el 2026-09-26: la última fila de `TasaCambio` es del **22/09/2026** (852,4168). DolarAPI ya tenía publicadas la del 23, 24, 25 y **28/09** (857,0058, publicada el viernes 25 en la tarde).
- Hallazgos verificados contra la API real:
  - `GET https://ve.dolarapi.com/v1/historicos/dolares/oficial` devuelve un array `[{ fuente, compra, venta, promedio, fecha: "YYYY-MM-DD" }]`, solo días hábiles, e **incluye la tasa nueva apenas se publica** (con su fecha valor futura). Pesa unos 6,7 KB comprimido.
  - Soporta **ETag**: con `If-None-Match` responde `304` con 0 bytes. Por eso se puede consultar cada pocos minutos sin costo.
  - `GET /v1/dolares/oficial` **va rezagado**: el sábado a las 00:20 VET seguía devolviendo la tasa del 25 cuando los históricos ya tenían la del 28. **No usar ese endpoint.**
- Latencia residual que no controlamos: el tiempo que tarda DolarAPI en recoger la publicación del BCV. Todo lo demás queda en un máximo de ~45 minutos mientras haya uso del panel.

## Decisiones

| Decisión | Resultado |
|---|---|
| Regla de vigencia | **Siempre la última tasa publicada** (la de mayor fecha valor guardada), aplicada desde su detección. Sin excepciones por día hábil, fin de semana ni feriado. |
| Señal de desactualización | Si la última guardada tiene una fecha valor **anterior a hoy** (día calendario de Caracas), casi seguro existe una publicación más reciente → `DESACTUALIZADA` → sincronización bloqueante. |
| Feriados | Sin calendario: la regla no depende del tipo de día. |
| Fuente | DolarAPI (`ve.dolarapi.com`), endpoint de **históricos** + ETag. Se mantiene el proveedor. |
| Disparador | Refresco perezoso durante el uso del panel: verificación cada **45 min** como máximo (ETag, casi siempre `304`). Bloqueante (máx. 2,5 s) solo si está `DESACTUALIZADA`; si no, en segundo plano con `after()`. El cliente vuelve a consultar cada 45 min y al enfocar la pestaña. |
| Cobro en curso | La Server Action valida en el servidor que la tasa del formulario sea la última publicada. Si cambió, rechaza y devuelve la tasa nueva para reconfirmar. **Nunca se registra un cobro con una tasa vieja.** |
| Huecos | Reconciliación: cada sincronización guarda lo publicado desde 7 días antes de la última fila guardada (60 días si la tabla está vacía). Upsert idempotente por `fecha`. |
| Schema | **Sin cambios.** `TasaCambio.fecha @unique` (fecha valor) ya cubre la idempotencia. Sin migraciones. |

> **Ruling (2026-09-26, decisión del usuario al iniciar la ejecución):** el intervalo de refresco perezoso pasa de 5 min a **45 min** en todo el plan (throttle del orquestador, polling de `RelojYTasa`, re-chequeo de `SelectorMetodoPago`/`ModalRegistrarEgreso`, y el caso de prueba #12). Motivo: 5 min era un chequeo demasiado frecuente para el uso real del panel. La Etapa 3 (validación en el servidor con `forzar: true` justo antes de registrar el cobro) **no cambia**: ya cumple el requisito de "revisar la tasa correcta justo antes de cobrar" independientemente del throttle de 45 min. Costo si la decisión resulta equivocada: hasta 45 min de latencia adicional en detectar una tasa nueva mientras el panel está en uso (nunca afecta el cobro, que siempre valida en caliente).
| Kiosco / `/api/checkin` | **No se tocan.** |

## Reglas del proyecto (obligatorias en cada etapa)

- Todo en español, incluido el razonamiento. Antes de ejecutar comandos o escribir código: **Evaluación de Impacto → Resolución de Conflictos → Mentoría Técnica → Plan de Acción**.
- **Nunca** `git commit`, `git push` ni abrir PRs. Deja los cambios en el working tree y sugiere commits en Conventional Commits en español.
- No crear `SUMMARY.md` / `REPORT.md`. Al cerrar la sesión, actualizar `handoff.md` (Objetivo, Estado actual, Archivos y cambios, Intentos fallidos, Próximos pasos).
- No usar MCP Chrome DevTools. Terminal, logs y `npm run dev`.
- Base de datos: no modificar el motor a mano. Este plan no toca `schema.prisma`.
- Respuesta final de cada etapa: **Resumen Ejecutivo · Verificación Manual en Producción · Migraciones Ejecutadas · Builds y Validaciones (✅/❌) · Commits Sugeridos**.

## Restricciones globales

- `packages/domain` no importa `fetch`, Prisma, `next/*` ni lee el reloj: `hoy` siempre entra como parámetro.
- El ETag/versión y el throttle viven **solo** en `apps/web-admin/lib` (estado de proceso), nunca en el dominio ni en el adaptador.
- La versión (ETag) conocida se actualiza **solo después** de persistir con éxito. Si se guardara antes y la escritura fallara, un `304` posterior ocultaría para siempre las filas no guardadas.
- Ninguna ruta pública nueva en las Etapas 1 a 3.
- Los pagos y egresos ya registrados no se recalculan: guardan su propia tasa.

---

## ETAPA 1 — Última tasa publicada + reconciliación (sin disparo automático todavía)

### Tarea 1.1: Pre-flight (solo lectura, reportar antes de editar)

- [ ] **Step 1:** localizar todos los consumidores actuales:

```bash
grep -rn "obtenerTasaActual\|convertirMontoUSDaVES\|actualizarTasaDiaria\|obtenerTasaOficial\|obtenerUltima(" --include=*.ts --include=*.tsx apps packages
grep -rn "TASA_BCV_FIJA" --include=*.ts --include=*.tsx apps packages
grep -rn "/api/tasa-cambio\|tasaCambio" --include=*.ts --include=*.tsx apps/web-admin/app
```

- [ ] **Step 2:** reportar al usuario la lista de archivos encontrados. Si `TASA_BCV_FIJA` (850, "solo para pruebas") se usa en algún cálculo de dinero real, **reportarlo y no tocarlo** en esta etapa.

Consumidores conocidos (confirmar con el grep): `apps/web-admin/app/api/tasa-cambio/route.ts`, `apps/web-admin/app/(panel)/caja/page.tsx`, `apps/worker/src/actualizar-tasa.ts`. Las acciones `registrarPagoAction` (`app/(panel)/pagos/actions.ts`) y `registrarEgresoAction` (`app/(panel)/caja/actions.ts`) reciben la tasa del cliente; se tratan en la Etapa 3.

### Tarea 1.2: Utilidad de fecha de Caracas (dominio, pura)

**Files:** Create `packages/domain/utils/fechaCaracas.ts`

- [ ] **Step 1:**

```ts
// Día calendario en America/Caracas, normalizado a medianoche UTC (mismo formato que TasaCambio.fecha).
export function diaCalendarioCaracas(ahora: Date): Date {
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Caracas", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(ahora); // "2026-09-26"
  return new Date(`${iso}T00:00:00Z`);
}

export function sumarDias(fecha: Date, dias: number): Date {
  return new Date(fecha.getTime() + dias * 86_400_000);
}
```

No depender de `TZ=America/Caracas` del proceso: se usa `Intl` explícito.

### Tarea 1.3: Puertos

**Files:** Modify `packages/domain/ports/IExchangeRateService.ts`, `packages/domain/ports/ITasaCambioRepository.ts`

- [ ] **Step 1: `IExchangeRateService`**

```ts
export interface TasaExterna {
  valor: number;
  fecha: Date; // fecha valor publicada por el BCV (medianoche UTC)
}

export type ResultadoPublicadas =
  | { tipo: "SIN_CAMBIOS" }
  | { tipo: "CAMBIOS"; version: string | null; tasas: TasaExterna[] };

export interface IExchangeRateService {
  // versionConocida = última versión (ETag) persistida con éxito; null = forzar descarga completa.
  obtenerPublicadas(versionConocida: string | null): Promise<ResultadoPublicadas>;
}
```

Si tras la Tarea 1.8 `obtenerTasaOficial` ya no tiene consumidores, eliminarlo del puerto y del adaptador.

- [ ] **Step 2: `ITasaCambioRepository`** — agregar, sin quitar `guardar` ni `obtenerUltima`:

```ts
guardarVarias(tasas: Array<{ fecha: Date; valor: number }>, fuente: string): Promise<number>; // filas escritas
```

### Tarea 1.4: Caso de uso `ObtenerTasaVigente` (el criterio del negocio)

**Files:** Create `packages/domain/use-cases/ObtenerTasaVigente.ts`

- [ ] **Step 1:**

```ts
import type { ITasaCambioRepository } from "../ports/ITasaCambioRepository";
import type { TasaCambio } from "../entities/TasaCambio";

export class SinTasaDisponibleError extends Error {
  constructor() { super("No hay ninguna tasa de cambio guardada todavía."); }
}

// Criterio del negocio (2026-09-26): SIEMPRE la última tasa publicada, desde su publicación.
// No se difiere por fecha valor bajo ningún concepto.
// AL_DIA: la última guardada tiene fecha valor >= hoy.
// DESACTUALIZADA: fecha valor < hoy → casi seguro hay una publicación posterior sin sincronizar.
export type EstadoTasa = "AL_DIA" | "DESACTUALIZADA";

export interface TasaVigente { tasa: TasaCambio; estado: EstadoTasa; }

export async function obtenerTasaVigente(
  deps: { tasas: ITasaCambioRepository },
  hoy: Date
): Promise<TasaVigente> {
  const ultima = await deps.tasas.obtenerUltima();
  if (!ultima) throw new SinTasaDisponibleError();
  return { tasa: ultima, estado: ultima.fecha < hoy ? "DESACTUALIZADA" : "AL_DIA" };
}
```

- [ ] **Step 2:** `SinTasaDisponibleError` queda definido **aquí**. Los consumidores que lo importaban de `ObtenerTasaActual` pasan a importarlo de este archivo.

Nota para la mentoría: `obtenerUltima()` ya devolvía la última publicada. Lo que fallaba era el disparo, no la lectura. Este caso de uso formaliza el criterio y agrega la señal `estado` que usa la Etapa 2.

### Tarea 1.5: Caso de uso `SincronizarTasas` (reconciliación)

**Files:** Create `packages/domain/use-cases/SincronizarTasas.ts`

- [ ] **Step 1:** comportamiento:
  1. `servicioTasa.obtenerPublicadas(versionConocida)`. Si devuelve `SIN_CAMBIOS` → `{ estado: "SIN_CAMBIOS", guardadas: 0, version: versionConocida }`.
  2. Si hay cambios: `ultima = tasas.obtenerUltima()`. Ventana desde `ultima.fecha - 7 días` (o `hoy - 60 días` si la tabla está vacía). Los 7 días recogen correcciones eventuales del BCV.
  3. Filtrar las tasas dentro de la ventana con `Number.isFinite(valor) && valor > 0`.
  4. `tasas.guardarVarias(filtradas, "BCV")`.
  5. Devolver `{ estado: "ACTUALIZADO", guardadas, version }`.
  6. Los errores de red o de la API **se propagan** (los maneja la capa de aplicación). El dominio no inventa filas.

Firma:

```ts
export async function sincronizarTasas(
  deps: { servicioTasa: IExchangeRateService; tasas: ITasaCambioRepository },
  input: { versionConocida: string | null; hoy: Date }
): Promise<{ estado: "SIN_CAMBIOS" | "ACTUALIZADO"; guardadas: number; version: string | null }>;
```

### Tarea 1.6: `BcvApiAdapter` con históricos + ETag

**Files:** Modify `packages/infrastructure/exchange-rate/BcvApiAdapter.ts`

- [ ] **Step 1:** implementar `obtenerPublicadas`:
  - URL: `https://ve.dolarapi.com/v1/historicos/dolares/oficial`.
  - Si `versionConocida`, enviar el header `If-None-Match: <versionConocida>`.
  - `signal: AbortSignal.timeout(5000)`.
  - `304` → `{ tipo: "SIN_CAMBIOS" }`. Cualquier otro `!ok` → lanzar `Error("dolarapi.com respondió <status>")`.
  - `200` → validar que sea un array. Por cada elemento: `fecha` debe cumplir `/^\d{4}-\d{2}-\d{2}$/` y `promedio` debe ser un número finito mayor que 0. Si no, **descartar la fila** (no lanzar). Mapear a `{ fecha: new Date(`${fecha}T00:00:00Z`), valor: promedio }`.
  - `version = respuesta.headers.get("etag")`.
  - El adaptador es **stateless**: no guarda el ETag.

### Tarea 1.7: `PrismaTasaCambioRepository`

**Files:** Modify `packages/infrastructure/persistence/prisma/PrismaTasaCambioRepository.ts`

- [ ] **Step 1:** `guardarVarias(tasas, fuente)` → `this.prisma.$transaction(tasas.map(t => upsert(...)))`, con la misma normalización `inicioDelDia` que `guardar`. Devuelve la cantidad de filas.
- [ ] **Step 2:** confirmar que `obtenerUltima()` ordena por `fecha desc`. Ya lo hace; no requiere cambios.

### Tarea 1.8: Consumidores actuales

**Files:** Modify `apps/worker/src/actualizar-tasa.ts`, `apps/web-admin/app/api/tasa-cambio/route.ts`, `apps/web-admin/app/(panel)/caja/page.tsx`. Delete `packages/domain/use-cases/ActualizarTasaDiaria.ts` y `packages/domain/use-cases/ObtenerTasaActual.ts` **solo si** el grep confirma que no quedan consumidores. `ConvertirMontoUSDaVES` ya usa la última guardada: no requiere cambios.

- [ ] **Step 1 — worker** (sigue siendo el mecanismo manual de respaldo): llamar `sincronizarTasas(deps, { versionConocida: null, hoy: diaCalendarioCaracas(new Date()) })`, luego `obtenerTasaVigente` e imprimir:
  - `✅ Sincronizado: N filas. Tasa en curso: <valor> (publicada con fecha valor <YYYY-MM-DD>)`.
  - Si la API falla: `⚠️ DolarAPI falló: <mensaje>. Tasa guardada: ...`, y terminar con exit 0 si existe tasa, o exit 1 si la tabla está vacía.
- [ ] **Step 2 — ruta `GET /api/tasa-cambio`:** usar `obtenerTasaVigente(deps, diaCalendarioCaracas(new Date()))`. Responder `{ ...tasa, estado }`. Es un cambio aditivo: `RelojYTasa`, `SelectorMetodoPago` y `ModalRegistrarEgreso` solo leen `valor`. Mantener `401` sin sesión y `404` con `SinTasaDisponibleError`.
- [ ] **Step 3 — `caja/page.tsx`:** mismo reemplazo, conservando el `.catch` que devuelve `null` ante `SinTasaDisponibleError`.

### Tarea 1.9: Script de verificación (sin DB ni red)

**Files:** Create `apps/web-admin/scripts/verificar-tasa-bcv.ts` (mismo patrón que `scripts/verificar-autorizacion.ts`), con `node:assert/strict`, un repositorio en memoria y un servicio falso.

- [ ] **Step 1:** casos de `obtenerTasaVigente`. Valores: 24/09 = 854,4637 · 25/09 = 855,6625 · 28/09 = 857,0058.

| # | Hoy | Filas guardadas | Esperado |
|---|---|---|---|
| 1 | Vie 2026-09-25, antes de la publicación | 24, 25 | 855,6625 · `AL_DIA` |
| 2 | Vie 2026-09-25, después de la publicación | 24, 25, 28 | **857,0058** · `AL_DIA` (no se difiere al lunes) |
| 3 | Sáb 2026-09-26 | 25, 28 | 857,0058 · `AL_DIA` |
| 4 | Lun 2026-09-28 | 25, 28 | 857,0058 · `AL_DIA` |
| 5 | Mar 2026-09-29, sin sincronizar desde el viernes | 25, 28 | 857,0058 · `DESACTUALIZADA` |
| 6 | Lun 2026-09-28 feriado, el viernes se publicó la del martes 29 = 860 | 25, 29 | 860 · `AL_DIA` |
| 7 | cualquiera | vacía | lanza `SinTasaDisponibleError` |

- [ ] **Step 2:** casos de `sincronizarTasas`:
  - (8) La base tiene hasta el 22 y el servicio publica del 15 al 28 → se guardan 15..28 dentro de la ventana (22−7). La tasa en curso pasa a ser 857,0058.
  - (9) Segunda corrida con `SIN_CAMBIOS` → 0 escrituras y la versión se mantiene.
  - (10) El servicio lanza un error → `sincronizarTasas` lo propaga y el repositorio queda intacto.
  - (11) Filas inválidas (`promedio` null, `fecha` mal formada) → se descartan sin lanzar.

- [ ] **Step 3:** `cd apps/web-admin && npx tsx scripts/verificar-tasa-bcv.ts` → salida `OK (11/11)` y exit 0.

### Tarea 1.10: Builds

- [ ] `cd apps/worker && npx tsc --noEmit` → exit 0
- [ ] `cd apps/web-admin && npx tsc --noEmit` → exit 0
- [ ] `npx turbo run build --filter=web-admin` → exit 0
- [ ] `npx turbo run lint --filter=web-admin` → exit 0

### Tarea 1.11: Prueba real (la ejecuta el usuario; requiere red y la base de datos)

- [ ] `npm run actualizar-tasa` → debe guardar todos los días faltantes desde la última fila y mostrar la tasa en curso (la última publicada).
- [ ] Correrlo una segunda vez → no se duplican filas (confirmar en `npx prisma studio`, tabla `TasaCambio`).
- [ ] `curl` autenticado a `GET /api/tasa-cambio` → devuelve la última publicada, con `estado: "AL_DIA"`.

### 🛑 FIN DE ETAPA 1

Entregar la respuesta final obligatoria, actualizar `handoff.md` y **esperar confirmación**.

Commits sugeridos (sin ejecutarlos):
- `feat: aplica siempre la última tasa BCV publicada desde su publicación`
- `feat: sincroniza tasas BCV por reconciliación con históricos de DolarAPI`
- `test: agrega script de verificación de reglas de tasa BCV`

---

## ETAPA 2 — Refresco perezoso durante el uso del panel

### Tarea 2.1: Orquestador inyectable

**Files:** Create `apps/web-admin/lib/tasaBcv.ts`

- [ ] **Step 1:** separar la lógica (probable con fakes) del cableado con Next:

```ts
const INTERVALO_MIN_MS = 45 * 60_000;    // ETag → casi siempre 304 de 0 bytes
const TIMEOUT_BLOQUEANTE_MS = 2_500;

export function crearOrquestadorTasa(deps: {
  sincronizar: (versionConocida: string | null) => Promise<{ version: string | null }>;
  obtenerVigente: () => Promise<TasaVigente>;
  programar: (tarea: () => Promise<void>) => void; // en producción: after() de next/server
  ahoraMs: () => number;
}) {
  let ultimoIntento = 0;
  let versionConocida: string | null = null;
  let enCurso: Promise<void> | null = null;

  function sincronizarUnaVez(): Promise<void> {
    enCurso ??= deps.sincronizar(versionConocida)
      .then((r) => { versionConocida = r.version; })   // solo tras persistir con éxito
      .catch((e) => console.warn("[tasa-bcv] sincronización fallida:", e))
      .finally(() => { enCurso = null; });
    return enCurso;
  }

  async function obtenerTasaVigenteFresca(opciones?: { forzar?: boolean }): Promise<TasaVigente> {
    let vigente = await deps.obtenerVigente(); // puede lanzar SinTasaDisponibleError con la tabla vacía
    const toca = opciones?.forzar || deps.ahoraMs() - ultimoIntento >= INTERVALO_MIN_MS;
    if (!toca) return vigente;
    ultimoIntento = deps.ahoraMs();
    if (vigente.estado === "DESACTUALIZADA" || opciones?.forzar) {
      await Promise.race([sincronizarUnaVez(), new Promise((r) => setTimeout(r, TIMEOUT_BLOQUEANTE_MS))]);
      vigente = await deps.obtenerVigente();
    } else {
      deps.programar(sincronizarUnaVez);
    }
    return vigente;
  }

  return { obtenerTasaVigenteFresca, sincronizarUnaVez };
}
```

- [ ] **Step 2:** manejar la **tabla vacía**. Si `obtenerVigente` lanza `SinTasaDisponibleError`, hacer una sincronización bloqueante (con el mismo timeout) y reintentar la lectura una sola vez antes de propagar el error.
- [ ] **Step 3:** exportar una instancia singleton de módulo, cableada con `PrismaTasaCambioRepository(prisma)`, `new BcvApiAdapter()`, `sincronizarTasas`, `obtenerTasaVigente`, `diaCalendarioCaracas(new Date())` evaluado en cada llamada, y `programar: (t) => after(t)`.

### Tarea 2.2: Consumidores server-side

- [ ] `GET /api/tasa-cambio` → usa `obtenerTasaVigenteFresca()`.
- [ ] `caja/page.tsx` → usa `obtenerTasaVigenteFresca()`.

### Tarea 2.3: El cliente siempre ve la última

- [ ] `packages/ui/components/RelojYTasa.tsx`: volver a pedir `/api/tasa-cambio` **cada 45 min** mientras la pestaña esté visible, y también al pasar a visible (`visibilitychange`). Cada una de esas peticiones también dispara la verificación en el servidor. No cambiar el diseño visual.
- [ ] `SelectorMetodoPago.tsx` y `ModalRegistrarEgreso.tsx`: ya piden la tasa al elegir un método en Bs. Agregar que la vuelvan a pedir si pasaron más de 45 min desde que se cargó (con el modal todavía abierto), y actualizar el monto en Bs mostrado.

### Tarea 2.4: Verificación

- [ ] Extender `scripts/verificar-tasa-bcv.ts` con el orquestador, usando fakes (`programar` captura la tarea y `ahoraMs` es controlable):
  - (12) Dos llamadas dentro de 45 min → una sola sincronización.
  - (13) `DESACTUALIZADA` → espera a la sincronización y devuelve la tasa nueva.
  - (14) Sincronización lenta (> 2,5 s) → devuelve la guardada sin esperar más.
  - (15) Cinco llamadas simultáneas con el throttle vencido → una sola llamada al servicio (single-flight).
  - (16) Una sincronización fallida no actualiza la versión conocida.
  - (17) `forzar: true` ignora el throttle y espera a la sincronización.
- [ ] Builds de la Tarea 1.10 → todos ✅.
- [ ] Manual con `npm run dev`: iniciar sesión y confirmar en la terminal un log `[tasa-bcv]` como máximo cada 45 min. Recargar varias veces y confirmar que no hay más llamadas dentro de ese intervalo.

### 🛑 FIN DE ETAPA 2

Entregar la respuesta final obligatoria, actualizar `handoff.md` y esperar confirmación.

Commit sugerido: `feat: actualiza la tasa BCV automáticamente durante el uso del panel`

---

## ETAPA 3 — Protección de cobros: nunca registrar con una tasa vieja

Hoy `registrarPagoAction` y `registrarEgresoAction` confían en la `tasaCambio` que envía el navegador en un campo oculto. Si el BCV publica mientras la cajera tiene el cobro abierto, se registraría con la tasa anterior. Eso contradice el criterio del negocio.

### Tarea 3.1: Validación en el servidor

**Files:** Modify `apps/web-admin/app/(panel)/pagos/actions.ts`, `apps/web-admin/app/(panel)/caja/actions.ts`

- [ ] Cuando la operación es en Bs: obtener `obtenerTasaVigenteFresca({ forzar: true })`, que espera como máximo 2,5 s.
  - Si la tasa enviada por el cliente **difiere** de la última publicada, **no registrar** y devolver `{ error: "La tasa BCV cambió a Bs. X. Revisa el monto y confirma de nuevo.", tasaNueva: X }`.
  - Si coincide, registrar con la tasa **del servidor**, nunca con la del formulario.
- [ ] Comparar con tolerancia de redondeo (4 decimales, igual que `Decimal(12,4)`).
- [ ] Si DolarAPI no responde, validar contra la última guardada (el fallback de siempre). No bloquear la caja.

### Tarea 3.2: UI de reconfirmación

- [ ] `SelectorMetodoPago` / `FormularioPago` / `ModalRegistrarEgreso`: si la respuesta trae `tasaNueva`, actualizar la tasa y el monto en Bs mostrados y dejar el formulario listo para confirmar de nuevo. No cerrar el modal ni perder los datos cargados.

### Tarea 3.3: Verificación

- [ ] Manual: abrir el modal de cobro en Bs, cambiar la tasa guardada en la base de **desarrollo** con el script de sincronización y un servicio falso (no editando el motor a mano), y confirmar que al enviar aparece el aviso con la tasa nueva y que no se registró nada.
- [ ] Builds de la Tarea 1.10 → todos ✅.

### 🛑 FIN DE ETAPA 3

Commit sugerido: `feat: valida en servidor que los cobros en Bs usen la última tasa BCV`

---

## ETAPA 4 (OPCIONAL) — Respaldo en horario de publicación. Solo con aprobación explícita

Objetivo: que la tasa nueva entre aunque nadie esté usando el panel en la tarde.

- [ ] `POST /api/tasa-cambio/sincronizar`:
  - Sin sesión. Header `Authorization: Bearer <CRON_SECRET>` comparado con `crypto.timingSafeEqual`.
  - Llama a `obtenerTasaVigenteFresca({ forzar: true })`.
  - Responde `200 { tasa }`, `401` o `503`.
- [ ] Versionar en `infra/systemd/` los archivos `tasa-bcv.service` (un `curl -fsS -X POST` con el header) y `tasa-bcv.timer` (`OnCalendar=Mon..Fri *-*-* 16..23:00/10 UTC`, cada 10 min entre 12:00 y 19:50 VET, con `Persistent=true`). **Claude Code no toca el VPS**: el usuario los instala. Alternativa documentada: cron-job.org con la misma frecuencia.
- [ ] `CRON_SECRET` debe agregarse al `.env` de producción (cifrado con dotenvx en Easypanel). **Lo hace el usuario.** El `handoff.md` registra que la ubicación de ese `.env` en la UI de Easypanel quedó sin resolver.

Commit sugerido: `feat: agrega disparador de respaldo protegido para sincronizar la tasa BCV`

---

## Fuera de alcance

- `Sucursal.tasaCambioUSD` (override manual), un segundo proveedor en cadena y un calendario de feriados: YAGNI por ahora.
