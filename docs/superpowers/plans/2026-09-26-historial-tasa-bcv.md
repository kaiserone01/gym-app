# Historial de tasa BCV en el badge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** al pulsar el texto de la tasa en el badge `RelojYTasa`, abrir un modal con el historial de `TasaCambio` — últimas 20 con "Cargar más", o búsqueda por fecha exacta con fallback a la más cercana anterior — mostrando fecha valor, monto (2 decimales) y quién la registró (`AUTO: DolarAPI` para BCV, nombre + hora am/pm para MANUAL).

**Architecture:** hexagonal (igual que el resto del repo).
- `packages/domain`: nuevos métodos de puerto (`ITasaCambioRepository`) y un caso de uso `ListarHistoricoTasas` que orquesta paginación cursor-based + búsqueda por fecha con fallback. Sin reloj, sin fetch, sin Prisma.
- `packages/infrastructure`: `PrismaTasaCambioRepository` implementa los métodos nuevos; `registrarTasaManual` pasa a requerir `registradoPorId`.
- `apps/web-admin`: nueva ruta `GET /api/tasa-cambio/historial`, componente cliente `ModalHistorialTasas` (responsive: tabla en desktop, cards en mobile — mismo patrón que `ListaMiembros.tsx`), texto de la tasa en `RelojYTasa` se vuelve pulsable.

**Tech Stack:** Next.js 16.3.4, Prisma 7, `tsx` para scripts de verificación. Sin dependencias nuevas.

**Spec:** decisiones acordadas con `/grill-me` en esta conversación (no hay un documento de spec separado — las decisiones relevantes están resumidas en Global Constraints).

## Global Constraints

- `TasaCambio` gana una columna nueva `registradoPorId String?` (nullable, para no romper filas históricas) — requiere migración SQL escrita a mano (mismo patrón que `packages/db/prisma/migrations/20260924000000_frecuencia_diario/migration.sql`), sin acceso a `DATABASE_URL` real en esta sesión.
- **DolarAPI no expone la hora real de publicación del BCV** (verificado en vivo contra `https://ve.dolarapi.com/v1/historicos/dolares/oficial` y `https://ve.dolarapi.com/v1/dolares/oficial` el 2026-09-26: ningún campo trae hora real, `fechaActualizacion` siempre es medianoche). Por eso las filas `fuente: "BCV"` **nunca muestran hora**, solo la fecha valor.
- Para filas `fuente: "MANUAL"`, si `registradoPorId` es no nulo, se muestra el nombre completo de `UsuarioAdmin.nombre`; si es nulo (filas históricas previas a esta migración), se muestra `"Usuario no registrado"`. En ambos casos, se agrega la hora de `createdAt` **entre paréntesis en la misma columna** ("Registrado por"), en formato 12 horas con am/pm (`es-VE`, ej. `2:32 p.m.`) — nunca se agrega una columna nueva solo para la hora.
- El monto se guarda completo (`Decimal(12,4)`, sin cambios) pero se **muestra redondeado a 2 decimales** en la UI del historial.
- Sin restricción de permisos: cualquier usuario logueado puede abrir el modal — la tasa BCV y quién la registró no es información sensible.
- `registrarTasaManual` (caso de uso de dominio) pasa a requerir `registradoPorId: string` como parámetro obligatorio — cualquier Server Action futura que registre una tasa manual queda forzada a pasar el usuario de su sesión. Hoy el único caller es `registrarTasaManualAction`.
- El selector de fecha (`<input type="date">`) no lleva `min`/`max` calculados contra la base — sin restricciones de rango en el HTML.
- "Cargar más" es un botón explícito, nunca scroll infinito automático (sin `IntersectionObserver`).
- El texto de la tasa en `RelojYTasa` (`Bs. X (BCV)`) es lo único pulsable — el reloj y el separador `|` no reaccionan a click. El diseño visual existente del badge no cambia salvo `cursor-pointer` + un leve cambio de color en `:hover` sobre el texto de la tasa.
- Responsive: en mobile (`<lg`, breakpoint de Tailwind) el historial se muestra como cards apiladas; en desktop (`lg:` y superior), tabla — mismo patrón exacto que `apps/web-admin/app/(panel)/miembros/ListaMiembros.tsx` (`lg:hidden` / `hidden lg:block`).

## Review Focus

- **Filas MANUAL sin `registradoPorId`** (todas las existentes antes de esta migración): el fallback `"Usuario no registrado (hora)"` debe aparecer, no un `undefined`/`null` crudo ni un error de render.
- **Búsqueda por fecha sin registro exacto** (fin de semana, feriado, o fecha futura): debe mostrar el aviso + atajo "Ver la más cercana anterior" — nunca una lista vacía silenciosa ni un error 500.
- **Búsqueda por una fecha anterior a la primera fila de `TasaCambio`** (tabla no tiene ninguna fila igual o anterior a la elegida): el atajo "más cercana anterior" no tiene a qué apuntar — debe decir explícitamente que no hay ninguna tasa registrada hasta esa fecha, no lanzar ni quedarse cargando.
- **"Cargar más" en el límite del historial** (ya se cargaron todas las filas que existen): el botón debe desaparecer u ocultarse, nunca quedar visible pidiendo una página vacía en loop.
- **Redondeo del monto a 2 decimales cerca de un límite** (ej. `Decimal` guardado como `857.0058` → mostrado como `857.01`, no `857.00` por truncamiento): usar redondeo estándar (`toFixed(2)`), no truncar.

---

## Tarea 1: Migración de base de datos — `TasaCambio.registradoPorId`

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/20260926120000_tasa_cambio_registrado_por/migration.sql`

**Interfaces:**
- Produces: columna `TasaCambio.registradoPorId String?` (nullable), sin relación FK declarada en Prisma (evita acoplar `TasaCambio` a `UsuarioAdmin` en el schema — el join se hace explícito en el repositorio de infraestructura cuando haga falta el nombre).

- [ ] **Step 1:** editar `packages/db/prisma/schema.prisma`, modelo `TasaCambio` (línea ~294):

```prisma
model TasaCambio {
  id              String   @id @default(cuid())
  fecha           DateTime @unique // día calendario
  valor           Decimal  @db.Decimal(12, 4)
  fuente          String // "BCV" | "BINANCE_P2P" | "MANUAL"
  registradoPorId String? // UsuarioAdmin.id — solo se conoce para fuente MANUAL; null en filas BCV o en MANUAL previas a esta columna.
  createdAt       DateTime @default(now())
}
```

- [ ] **Step 2:** crear el directorio `packages/db/prisma/migrations/20260926120000_tasa_cambio_registrado_por/` con `migration.sql`:

```sql
-- AlterTable
ALTER TABLE "TasaCambio" ADD COLUMN "registradoPorId" TEXT;
```

- [ ] **Step 3:** correr `cd packages/db && npx prisma validate` para confirmar que el schema es válido sin conectarse a la base.

Expected: `The schema at prisma/schema.prisma is valid 🚀` (o mensaje equivalente de éxito).

- [ ] **Step 4:** commit.

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations/20260926120000_tasa_cambio_registrado_por/
git commit -m "feat: agrega columna registradoPorId a TasaCambio"
```

**Nota para el usuario:** esta migración no se corre contra ninguna base en esta sesión (sin `DATABASE_URL` real). Cuando la despliegues, `docker-entrypoint.sh` ya aplica migraciones pendientes automáticamente al arrancar el contenedor (ver `handoff.md`, punto sobre migraciones automáticas) — no requiere ningún paso manual adicional, salvo que quieras probarla antes en local con `npx prisma migrate dev`.

---

## Tarea 2: Entidad de dominio y `registrarTasaManual` con `registradoPorId` obligatorio

**Files:**
- Modify: `packages/domain/entities/TasaCambio.ts`
- Modify: `packages/domain/use-cases/RegistrarTasaManual.ts`
- Modify: `apps/web-admin/app/(panel)/configuraciones/actions.ts`
- Test: `apps/web-admin/scripts/verificar-historial-tasa-bcv.ts` (nuevo, mismo patrón que `verificar-tasa-bcv.ts`)

**Interfaces:**
- Consumes: nada nuevo de tareas anteriores.
- Produces: `TasaCambio.registradoPorId: string | null` y `TasaCambio.createdAt: Date` (entidad de dominio); `registrarTasaManual(deps, input: { valor: number; registradoPorId: string })`.

- [ ] **Step 1:** escribir el script de verificación (aún no existe, así que este primer caso fallará por "Cannot find module"):

```ts
// apps/web-admin/scripts/verificar-historial-tasa-bcv.ts
// Script manual (no hay framework de tests en el repo todavía) para verificar
// las reglas del historial de tasa BCV: corre
// `npx tsx scripts/verificar-historial-tasa-bcv.ts` desde apps/web-admin.
import assert from "node:assert/strict";
import { registrarTasaManual, TasaInvalidaError } from "@gym-app/domain/use-cases/RegistrarTasaManual";
import type { ITasaCambioRepository } from "@gym-app/domain/ports/ITasaCambioRepository";
import type { TasaCambio } from "@gym-app/domain/entities/TasaCambio";

let pasadas = 0;
let total = 0;

function caso(nombre: string, fn: () => void | Promise<void>) {
  total++;
  return Promise.resolve(fn())
    .then(() => {
      pasadas++;
      console.log(`✅ ${nombre}`);
    })
    .catch((error) => {
      console.error(`❌ ${nombre}`);
      console.error(error);
    });
}

function fecha(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

class RepositorioEnMemoria implements ITasaCambioRepository {
  filas: TasaCambio[] = [];

  constructor(iniciales: Array<{ fecha: Date; valor: number; fuente?: string; registradoPorId?: string | null; createdAt?: Date }> = []) {
    this.filas = iniciales.map((t, i) => ({
      id: `fake-${i}`,
      fecha: t.fecha,
      valor: t.valor,
      fuente: t.fuente ?? "BCV",
      registradoPorId: t.registradoPorId ?? null,
      createdAt: t.createdAt ?? new Date(),
    }));
  }

  async guardar(fecha: Date, valor: number, fuente: string, registradoPorId: string | null = null): Promise<TasaCambio> {
    const existente = this.filas.find((f) => f.fecha.getTime() === fecha.getTime());
    if (existente) {
      existente.valor = valor;
      existente.fuente = fuente;
      existente.registradoPorId = registradoPorId;
      return existente;
    }
    const nueva: TasaCambio = { id: `fake-${this.filas.length}`, fecha, valor, fuente, registradoPorId, createdAt: new Date() };
    this.filas.push(nueva);
    return nueva;
  }

  async obtenerUltima(): Promise<TasaCambio | null> {
    if (this.filas.length === 0) return null;
    return [...this.filas].sort((a, b) => b.fecha.getTime() - a.fecha.getTime())[0];
  }

  async guardarVarias(tasas: Array<{ fecha: Date; valor: number }>, fuente: string): Promise<number> {
    for (const t of tasas) await this.guardar(t.fecha, t.valor, fuente);
    return tasas.length;
  }
}

async function main() {
  await caso("1: registrarTasaManual guarda con el registradoPorId dado", async () => {
    const tasas = new RepositorioEnMemoria([]);
    const resultado = await registrarTasaManual({ tasas }, { valor: 860, registradoPorId: "usuario-1" });
    assert.equal(resultado.registradoPorId, "usuario-1");
    assert.equal(resultado.fuente, "MANUAL");
  });

  await caso("2: registrarTasaManual rechaza valor <= 0", async () => {
    const tasas = new RepositorioEnMemoria([]);
    await assert.rejects(
      () => registrarTasaManual({ tasas }, { valor: 0, registradoPorId: "usuario-1" }),
      TasaInvalidaError
    );
  });

  console.log(`\n${pasadas === total ? "OK" : "FALLÓ"} (${pasadas}/${total})`);
  process.exit(pasadas === total ? 0 : 1);
}

main();
```

- [ ] **Step 2:** correr el script y confirmar que falla (el módulo o los tipos actuales no coinciden todavía).

Run: `cd apps/web-admin && npx tsx scripts/verificar-historial-tasa-bcv.ts`
Expected: falla — `registrarTasaManual` actual solo acepta `{ valor: number }`, no `{ valor, registradoPorId }`, y `guardar()` del puerto actual no acepta un cuarto parámetro `registradoPorId`. El caso 1 debe fallar (TypeScript ya lo marcaría en `tsc`, pero al ser un script `tsx` sin chequeo estricto en runtime, confirma que `resultado.registradoPorId` es `undefined` en vez de `"usuario-1"`).

- [ ] **Step 3:** actualizar la entidad `packages/domain/entities/TasaCambio.ts`:

```ts
export interface TasaCambio {
  id: string;
  fecha: Date;
  valor: number;
  // Columna libre en Prisma (no un enum de base de datos): "BCV" | "BINANCE_P2P" | "MANUAL".
  fuente: string;
  // UsuarioAdmin.id — solo se conoce para fuente MANUAL; null en filas BCV
  // o en MANUAL registradas antes de que existiera esta columna.
  registradoPorId: string | null;
  createdAt: Date;
}
```

- [ ] **Step 4:** actualizar el puerto `packages/domain/ports/ITasaCambioRepository.ts` — agregar el parámetro a `guardar` sin romper los callers existentes que no lo pasan (default `null`):

```ts
import { TasaCambio } from "../entities/TasaCambio";

export interface ITasaCambioRepository {
  guardar(fecha: Date, valor: number, fuente: string, registradoPorId?: string | null): Promise<TasaCambio>;
  obtenerUltima(): Promise<TasaCambio | null>;
  guardarVarias(tasas: Array<{ fecha: Date; valor: number }>, fuente: string): Promise<number>;
}
```

- [ ] **Step 5:** actualizar `packages/domain/use-cases/RegistrarTasaManual.ts`:

```ts
import { ITasaCambioRepository } from "../ports/ITasaCambioRepository";
import { TasaCambio } from "../entities/TasaCambio";

export class TasaInvalidaError extends Error {
  constructor() {
    super("El valor de la tasa debe ser mayor a cero.");
  }
}

// Ingreso manual de la tasa BCV cuando la API de consulta falla — requiere
// doble confirmación en la UI (ver diseño acordado). Se guarda con fuente
// MANUAL, visible de inmediato para el resto de la organización.
// registradoPorId es obligatorio: cualquier pantalla que llame a este caso
// de uso debe pasar el id del usuario de su propia sesión — así el
// historial (ver ListarHistoricoTasas) siempre puede mostrar quién la
// registró, sin importar desde qué flujo se llamó.
export async function registrarTasaManual(
  deps: { tasas: ITasaCambioRepository },
  input: { valor: number; registradoPorId: string }
): Promise<TasaCambio> {
  if (!(input.valor > 0)) {
    throw new TasaInvalidaError();
  }

  return deps.tasas.guardar(new Date(), input.valor, "MANUAL", input.registradoPorId);
}
```

- [ ] **Step 6:** correr el script otra vez y confirmar que pasa.

Run: `cd apps/web-admin && npx tsx scripts/verificar-historial-tasa-bcv.ts`
Expected: `OK (2/2)`.

- [ ] **Step 7:** actualizar `PrismaTasaCambioRepository.guardar` para persistir `registradoPorId` (`packages/infrastructure/persistence/prisma/PrismaTasaCambioRepository.ts`):

```ts
async guardar(fecha: Date, valor: number, fuente: string, registradoPorId: string | null = null): Promise<TasaCambio> {
  const dia = inicioDelDia(fecha);

  const tasa = await this.prisma.tasaCambio.upsert({
    where: { fecha: dia },
    create: { fecha: dia, valor, fuente, registradoPorId },
    update: { valor, fuente, registradoPorId },
  });

  return mapear(tasa);
}
```

Y actualizar `mapear()` para incluir los campos nuevos:

```ts
function mapear(fila: FilaTasaCambio): TasaCambio {
  return {
    id: fila.id,
    fecha: fila.fecha,
    valor: fila.valor.toNumber(),
    fuente: fila.fuente,
    registradoPorId: fila.registradoPorId ?? null,
    createdAt: fila.createdAt,
  };
}
```

Y el tipo `FilaTasaCambio` (mismo archivo) necesita los campos:

```ts
type FilaTasaCambio = {
  id: string;
  fecha: Date;
  valor: { toNumber(): number };
  fuente: string;
  registradoPorId: string | null;
  createdAt: Date;
};
```

- [ ] **Step 8:** cablear `apps/web-admin/app/(panel)/configuraciones/actions.ts` (`registrarTasaManualAction`, línea 181) para pasar el usuario de la sesión. `obtenerUsuarioDeSesionActual()` devuelve `{ usuario, sucursalActivaId } | null` (mismo shape que consume `registrarPagoAction` en `pagos/actions.ts:54` vía `const { usuario, sucursalActivaId } = sesion;`) — `registrarTasaManualAction` hoy solo hace `const sesion = await obtenerUsuarioDeSesionActual();` sin destructurar. Cambiar esa línea (185) para destructurar `usuario`:

```ts
const sesion = await obtenerUsuarioDeSesionActual();
if (!sesion) redirect("/login");
const { usuario } = sesion;
```

Y cambiar la llamada a `registrarTasaManual` (línea 195) de:

```ts
await registrarTasaManual({ tasas: new PrismaTasaCambioRepository(prisma) }, { valor });
```

a:

```ts
await registrarTasaManual(
  { tasas: new PrismaTasaCambioRepository(prisma) },
  { valor, registradoPorId: usuario.id }
);
```

- [ ] **Step 9:** correr `cd apps/web-admin && npx tsc --noEmit` y confirmar que no aparecen errores nuevos (los 2 preexistentes de `PrismaPlanRepository.ts` por `FrecuenciaPago`/`DIARIO` siguen ahí, ajenos a este plan).

Expected: solo los 2 errores preexistentes de `PrismaPlanRepository.ts`.

- [ ] **Step 10:** commit.

```bash
git add packages/domain/entities/TasaCambio.ts
git add packages/domain/ports/ITasaCambioRepository.ts
git add packages/domain/use-cases/RegistrarTasaManual.ts
git add packages/infrastructure/persistence/prisma/PrismaTasaCambioRepository.ts
git add "apps/web-admin/app/(panel)/configuraciones/actions.ts"
git add apps/web-admin/scripts/verificar-historial-tasa-bcv.ts
git commit -m "feat: registra quién ingresó cada tasa BCV manual"
```

---

## Tarea 3: Caso de uso `ListarHistoricoTasas` + métodos de repositorio

**Files:**
- Modify: `packages/domain/ports/ITasaCambioRepository.ts`
- Create: `packages/domain/use-cases/ListarHistoricoTasas.ts`
- Modify: `packages/infrastructure/persistence/prisma/PrismaTasaCambioRepository.ts`
- Test: `apps/web-admin/scripts/verificar-historial-tasa-bcv.ts` (extender)

**Interfaces:**
- Consumes: `TasaCambio` (Tarea 2), `ITasaCambioRepository` (Tarea 2).
- Produces:
  - `ITasaCambioRepository.listarHistorico(input: { antesDe: Date | null; limite: number }): Promise<TasaCambio[]>` — filas ordenadas por `fecha desc`, estrictamente anteriores a `antesDe` si se da (para paginación cursor-based), o las más recientes si `antesDe` es `null`.
  - `ITasaCambioRepository.buscarPorFecha(fecha: Date): Promise<TasaCambio | null>` — la fila exacta de esa fecha valor, o `null`.
  - `ITasaCambioRepository.buscarMasCercanaAnterior(fecha: Date): Promise<TasaCambio | null>` — la fila con `fecha <= fecha` de mayor valor (la última vigente hasta esa fecha), o `null` si no hay ninguna.
  - `listarHistoricoTasas(deps, input: { modo: "recientes"; antesDe: Date | null; limite: number }): Promise<{ filas: TasaCambio[]; hayMas: boolean }>`
  - `listarHistoricoTasas(deps, input: { modo: "fecha"; fecha: Date }): Promise<ResultadoBusquedaPorFecha>` donde:
    ```ts
    export type ResultadoBusquedaPorFecha =
      | { tipo: "ENCONTRADA"; tasa: TasaCambio }
      | { tipo: "NO_ENCONTRADA"; masCercanaAnterior: TasaCambio | null };
    ```

- [ ] **Step 1:** extender el puerto `packages/domain/ports/ITasaCambioRepository.ts`:

```ts
import { TasaCambio } from "../entities/TasaCambio";

export interface ITasaCambioRepository {
  guardar(fecha: Date, valor: number, fuente: string, registradoPorId?: string | null): Promise<TasaCambio>;
  obtenerUltima(): Promise<TasaCambio | null>;
  guardarVarias(tasas: Array<{ fecha: Date; valor: number }>, fuente: string): Promise<number>;
  // Historial (más reciente primero). Si antesDe no es null, solo filas
  // con fecha estrictamente menor — así se pagina "hacia atrás" en el tiempo.
  listarHistorico(input: { antesDe: Date | null; limite: number }): Promise<TasaCambio[]>;
  // La fila cuya fecha valor es exactamente igual a `fecha`, o null.
  buscarPorFecha(fecha: Date): Promise<TasaCambio | null>;
  // La fila con la mayor fecha <= `fecha` (la que habría estado vigente
  // ese día según el criterio "siempre la última publicada"), o null si
  // no hay ninguna fila igual o anterior a esa fecha.
  buscarMasCercanaAnterior(fecha: Date): Promise<TasaCambio | null>;
}
```

- [ ] **Step 2:** escribir los casos de prueba del caso de uso (antes de que exista `ListarHistoricoTasas.ts`, así que fallarán por "Cannot find module"). Agregar al final de `apps/web-admin/scripts/verificar-historial-tasa-bcv.ts`, antes del `main()` de cierre — extender la clase `RepositorioEnMemoria` con los 3 métodos nuevos:

```ts
// Agregar estos 3 métodos dentro de la clase RepositorioEnMemoria:
async listarHistorico(input: { antesDe: Date | null; limite: number }): Promise<TasaCambio[]> {
  const ordenadas = [...this.filas].sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
  const filtradas = input.antesDe ? ordenadas.filter((f) => f.fecha.getTime() < input.antesDe!.getTime()) : ordenadas;
  return filtradas.slice(0, input.limite);
}

async buscarPorFecha(fecha: Date): Promise<TasaCambio | null> {
  return this.filas.find((f) => f.fecha.getTime() === fecha.getTime()) ?? null;
}

async buscarMasCercanaAnterior(fecha: Date): Promise<TasaCambio | null> {
  const candidatas = this.filas.filter((f) => f.fecha.getTime() <= fecha.getTime());
  if (candidatas.length === 0) return null;
  return [...candidatas].sort((a, b) => b.fecha.getTime() - a.fecha.getTime())[0];
}
```

Y agregar el import y los casos de prueba:

```ts
import { listarHistoricoTasas } from "@gym-app/domain/use-cases/ListarHistoricoTasas";

// ... dentro de main(), antes del console.log final:

await caso("3: listarHistoricoTasas modo recientes, primera página sin antesDe", async () => {
  const tasas = new RepositorioEnMemoria([
    { fecha: fecha("2026-09-20"), valor: 800 },
    { fecha: fecha("2026-09-21"), valor: 810 },
    { fecha: fecha("2026-09-22"), valor: 820 },
  ]);
  const r = await listarHistoricoTasas({ tasas }, { modo: "recientes", antesDe: null, limite: 2 });
  assert.equal(r.filas.length, 2);
  assert.equal(r.filas[0].valor, 820);
  assert.equal(r.filas[1].valor, 810);
  assert.equal(r.hayMas, true);
});

await caso("4: listarHistoricoTasas modo recientes, siguiente página con antesDe agota la lista (hayMas:false)", async () => {
  const tasas = new RepositorioEnMemoria([
    { fecha: fecha("2026-09-20"), valor: 800 },
    { fecha: fecha("2026-09-21"), valor: 810 },
    { fecha: fecha("2026-09-22"), valor: 820 },
  ]);
  const r = await listarHistoricoTasas({ tasas }, { modo: "recientes", antesDe: fecha("2026-09-21"), limite: 2 });
  assert.equal(r.filas.length, 1);
  assert.equal(r.filas[0].valor, 800);
  assert.equal(r.hayMas, false);
});

await caso("5: listarHistoricoTasas modo fecha, encuentra la fila exacta", async () => {
  const tasas = new RepositorioEnMemoria([
    { fecha: fecha("2026-09-22"), valor: 820, fuente: "BCV" },
  ]);
  const r = await listarHistoricoTasas({ tasas }, { modo: "fecha", fecha: fecha("2026-09-22") });
  assert.equal(r.tipo, "ENCONTRADA");
  if (r.tipo === "ENCONTRADA") assert.equal(r.tasa.valor, 820);
});

await caso("6: listarHistoricoTasas modo fecha, sin fila exacta, devuelve la más cercana anterior", async () => {
  const tasas = new RepositorioEnMemoria([
    { fecha: fecha("2026-09-19"), valor: 790 },
    { fecha: fecha("2026-09-22"), valor: 820 },
  ]);
  const r = await listarHistoricoTasas({ tasas }, { modo: "fecha", fecha: fecha("2026-09-25") });
  assert.equal(r.tipo, "NO_ENCONTRADA");
  if (r.tipo === "NO_ENCONTRADA") assert.equal(r.masCercanaAnterior?.valor, 820);
});

await caso("7: listarHistoricoTasas modo fecha, sin fila exacta y sin ninguna anterior", async () => {
  const tasas = new RepositorioEnMemoria([
    { fecha: fecha("2026-09-22"), valor: 820 },
  ]);
  const r = await listarHistoricoTasas({ tasas }, { modo: "fecha", fecha: fecha("2026-09-19") });
  assert.equal(r.tipo, "NO_ENCONTRADA");
  if (r.tipo === "NO_ENCONTRADA") assert.equal(r.masCercanaAnterior, null);
});
```

- [ ] **Step 3:** correr el script y confirmar que los 4 casos nuevos fallan por "Cannot find module '@gym-app/domain/use-cases/ListarHistoricoTasas'".

Run: `cd apps/web-admin && npx tsx scripts/verificar-historial-tasa-bcv.ts`
Expected: falla al importar — módulo no existe todavía.

- [ ] **Step 4:** crear `packages/domain/use-cases/ListarHistoricoTasas.ts`:

```ts
import type { ITasaCambioRepository } from "../ports/ITasaCambioRepository";
import type { TasaCambio } from "../entities/TasaCambio";

export type ResultadoBusquedaPorFecha =
  | { tipo: "ENCONTRADA"; tasa: TasaCambio }
  | { tipo: "NO_ENCONTRADA"; masCercanaAnterior: TasaCambio | null };

export interface ResultadoRecientes {
  filas: TasaCambio[];
  hayMas: boolean;
}

export type InputListarHistoricoTasas =
  | { modo: "recientes"; antesDe: Date | null; limite: number }
  | { modo: "fecha"; fecha: Date };

export function listarHistoricoTasas(
  deps: { tasas: ITasaCambioRepository },
  input: { modo: "recientes"; antesDe: Date | null; limite: number }
): Promise<ResultadoRecientes>;
export function listarHistoricoTasas(
  deps: { tasas: ITasaCambioRepository },
  input: { modo: "fecha"; fecha: Date }
): Promise<ResultadoBusquedaPorFecha>;
export async function listarHistoricoTasas(
  deps: { tasas: ITasaCambioRepository },
  input: InputListarHistoricoTasas
): Promise<ResultadoRecientes | ResultadoBusquedaPorFecha> {
  if (input.modo === "recientes") {
    // Se piden limite+1 para saber si hay una página siguiente sin una
    // segunda consulta — se descarta la fila extra antes de devolver.
    const filas = await deps.tasas.listarHistorico({ antesDe: input.antesDe, limite: input.limite + 1 });
    const hayMas = filas.length > input.limite;
    return { filas: filas.slice(0, input.limite), hayMas };
  }

  const exacta = await deps.tasas.buscarPorFecha(input.fecha);
  if (exacta) return { tipo: "ENCONTRADA", tasa: exacta };

  const masCercanaAnterior = await deps.tasas.buscarMasCercanaAnterior(input.fecha);
  return { tipo: "NO_ENCONTRADA", masCercanaAnterior };
}
```

- [ ] **Step 5:** correr el script y confirmar que los 7 casos pasan.

Run: `cd apps/web-admin && npx tsx scripts/verificar-historial-tasa-bcv.ts`
Expected: `OK (7/7)`.

- [ ] **Step 6:** implementar los 3 métodos nuevos en `packages/infrastructure/persistence/prisma/PrismaTasaCambioRepository.ts` (agregar al final de la clase, antes del cierre `}`):

```ts
async listarHistorico(input: { antesDe: Date | null; limite: number }): Promise<TasaCambio[]> {
  const filas = await this.prisma.tasaCambio.findMany({
    where: input.antesDe ? { fecha: { lt: inicioDelDia(input.antesDe) } } : undefined,
    orderBy: { fecha: "desc" },
    take: input.limite,
  });
  return filas.map(mapear);
}

async buscarPorFecha(fecha: Date): Promise<TasaCambio | null> {
  const fila = await this.prisma.tasaCambio.findUnique({ where: { fecha: inicioDelDia(fecha) } });
  return fila ? mapear(fila) : null;
}

async buscarMasCercanaAnterior(fecha: Date): Promise<TasaCambio | null> {
  const fila = await this.prisma.tasaCambio.findFirst({
    where: { fecha: { lte: inicioDelDia(fecha) } },
    orderBy: { fecha: "desc" },
  });
  return fila ? mapear(fila) : null;
}
```

- [ ] **Step 7:** correr `cd apps/web-admin && npx tsc --noEmit` — solo deben quedar los 2 errores preexistentes de `PrismaPlanRepository.ts`.

- [ ] **Step 8:** commit.

```bash
git add packages/domain/ports/ITasaCambioRepository.ts
git add packages/domain/use-cases/ListarHistoricoTasas.ts
git add packages/infrastructure/persistence/prisma/PrismaTasaCambioRepository.ts
git add apps/web-admin/scripts/verificar-historial-tasa-bcv.ts
git commit -m "feat: agrega caso de uso para listar el historico de tasas BCV"
```

---

## Tarea 4: Ruta `GET /api/tasa-cambio/historial`

**Files:**
- Create: `apps/web-admin/app/api/tasa-cambio/historial/route.ts`

**Interfaces:**
- Consumes: `listarHistoricoTasas` (Tarea 3), `PrismaTasaCambioRepository` (existente + Tarea 3), `obtenerUsuarioDeSesion` (existente en `@/lib/sesion`).
- Produces: contrato HTTP:
  - `GET /api/tasa-cambio/historial?antesDe=<ISO fecha>&limite=<n>` (o sin `antesDe` para la primera página) → `200 { filas: FilaHistorial[], hayMas: boolean }`.
  - `GET /api/tasa-cambio/historial?fecha=<YYYY-MM-DD>` → `200 { tipo: "ENCONTRADA", tasa: FilaHistorial } | { tipo: "NO_ENCONTRADA", masCercanaAnterior: FilaHistorial | null }`.
  - Donde `FilaHistorial = { fecha: string (ISO); valor: number; fuente: string; registradoPorId: string | null; registradoPorNombre: string | null; createdAt: string (ISO) }` — `registradoPorNombre` se resuelve en el servidor contra `UsuarioAdmin` para que el cliente no tenga que hacer un segundo fetch.
  - `401` sin sesión.

- [ ] **Step 1:** revisar cómo obtiene el nombre de usuario otra ruta existente que haga un join simple contra `UsuarioAdmin` — usar `prisma.usuarioAdmin.findMany({ where: { id: { in: [...] } }, select: { id: true, nombre: true } })` para resolver todos los nombres de una sola consulta por página (nunca N+1). `TasaCambio.createdAt` ya está disponible desde la Tarea 2 — no requiere ningún cambio adicional acá.

- [ ] **Step 2:** crear `apps/web-admin/app/api/tasa-cambio/historial/route.ts`:

```ts
// GET /api/tasa-cambio/historial — historial de TasaCambio para el modal
// del badge (ver ModalHistorialTasas). Dos modos: "recientes" (paginado por
// cursor de fecha) y "fecha" (búsqueda exacta con fallback a la más
// cercana anterior).
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesion } from "@/lib/sesion";
import { PrismaTasaCambioRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaTasaCambioRepository";
import { listarHistoricoTasas } from "@gym-app/domain/use-cases/ListarHistoricoTasas";
import type { TasaCambio } from "@gym-app/domain/entities/TasaCambio";

const LIMITE_DEFECTO = 20;

interface FilaHistorial {
  fecha: string;
  valor: number;
  fuente: string;
  registradoPorId: string | null;
  registradoPorNombre: string | null;
  createdAt: string;
}

async function mapearConNombres(filas: TasaCambio[]): Promise<FilaHistorial[]> {
  const ids = [...new Set(filas.map((f) => f.registradoPorId).filter((id): id is string => id !== null))];
  const usuarios = ids.length
    ? await prisma.usuarioAdmin.findMany({ where: { id: { in: ids } }, select: { id: true, nombre: true } })
    : [];
  const nombrePorId = new Map(usuarios.map((u) => [u.id, u.nombre]));

  return filas.map((f) => ({
    fecha: f.fecha.toISOString(),
    valor: f.valor,
    fuente: f.fuente,
    registradoPorId: f.registradoPorId,
    registradoPorNombre: f.registradoPorId ? (nombrePorId.get(f.registradoPorId) ?? null) : null,
    createdAt: f.createdAt.toISOString(),
  }));
}

export async function GET(req: NextRequest) {
  const sesion = await obtenerUsuarioDeSesion(req);
  if (!sesion) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const fechaParam = searchParams.get("fecha");
  const tasas = new PrismaTasaCambioRepository(prisma);

  if (fechaParam) {
    const fecha = new Date(`${fechaParam}T00:00:00Z`);
    const resultado = await listarHistoricoTasas({ tasas }, { modo: "fecha", fecha });
    if (resultado.tipo === "ENCONTRADA") {
      const [fila] = await mapearConNombres([resultado.tasa]);
      return NextResponse.json({ tipo: "ENCONTRADA", tasa: fila });
    }
    const masCercanaAnterior = resultado.masCercanaAnterior
      ? (await mapearConNombres([resultado.masCercanaAnterior]))[0]
      : null;
    return NextResponse.json({ tipo: "NO_ENCONTRADA", masCercanaAnterior });
  }

  const antesDeParam = searchParams.get("antesDe");
  const antesDe = antesDeParam ? new Date(antesDeParam) : null;
  const limite = Number(searchParams.get("limite")) || LIMITE_DEFECTO;

  const { filas, hayMas } = await listarHistoricoTasas({ tasas }, { modo: "recientes", antesDe, limite });
  return NextResponse.json({ filas: await mapearConNombres(filas), hayMas });
}
```

- [ ] **Step 3:** correr `cd apps/web-admin && npx tsc --noEmit` y confirmar que solo quedan los 2 errores preexistentes de `PrismaPlanRepository.ts`, y `npx tsx scripts/verificar-historial-tasa-bcv.ts` → `OK (7/7)`.

- [ ] **Step 4:** commit.

```bash
git add "apps/web-admin/app/api/tasa-cambio/historial/route.ts"
git commit -m "feat: agrega la ruta de historial de tasa BCV"
```

---

## Tarea 5: `ModalHistorialTasas` (componente cliente)

**Files:**
- Create: `apps/web-admin/app/(panel)/ModalHistorialTasas.tsx`
- Modify: `packages/ui/components/RelojYTasa.tsx`

**Interfaces:**
- Consumes: `GET /api/tasa-cambio/historial` (Tarea 4).
- Produces: `<ModalHistorialTasas onCerrar={() => void} />` — componente autocontenido, sin props de datos (hace su propio fetch).

- [ ] **Step 1:** crear `apps/web-admin/app/(panel)/ModalHistorialTasas.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";

interface FilaHistorial {
  fecha: string;
  valor: number;
  fuente: string;
  registradoPorId: string | null;
  registradoPorNombre: string | null;
  createdAt: string;
}

type RespuestaFecha =
  | { tipo: "ENCONTRADA"; tasa: FilaHistorial }
  | { tipo: "NO_ENCONTRADA"; masCercanaAnterior: FilaHistorial | null };

const LIMITE = 20;

function formatearFechaValor(iso: string): string {
  return new Date(iso).toLocaleDateString("es-VE", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "UTC" });
}

function formatearHora12(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-VE", { hour: "numeric", minute: "2-digit", hour12: true });
}

function formatearMonto(valor: number): string {
  return valor.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Columna "Registrado por": AUTO: DolarAPI (BCV, sin hora — DolarAPI no
// expone la hora real de publicación del BCV, ver Global Constraints del
// plan) / Nombre (hora am-pm) para MANUAL con usuario conocido / "Usuario
// no registrado (hora)" para MANUAL sin registradoPorId (filas previas a
// esta migración).
function etiquetaRegistrador(fila: FilaHistorial): string {
  if (fila.fuente !== "MANUAL") return "AUTO: DolarAPI";
  const hora = formatearHora12(fila.createdAt);
  const nombre = fila.registradoPorNombre ?? "Usuario no registrado";
  return `${nombre} (${hora})`;
}

function FilaTabla({ fila }: { fila: FilaHistorial }) {
  return (
    <tr className="border-b" style={{ borderColor: "var(--gx-edge)" }}>
      <td className="py-2" style={{ color: "var(--gx-ink)" }}>{formatearFechaValor(fila.fecha)}</td>
      <td className="py-2" style={{ color: "var(--gx-ink)" }}>Bs. {formatearMonto(fila.valor)}</td>
      <td className="py-2" style={{ color: "var(--gx-muted)" }}>{etiquetaRegistrador(fila)}</td>
    </tr>
  );
}

function CardFila({ fila }: { fila: FilaHistorial }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border p-3 text-sm" style={{ borderColor: "var(--gx-edge)" }}>
      <div className="flex justify-between">
        <span style={{ color: "var(--gx-muted)" }}>{formatearFechaValor(fila.fecha)}</span>
        <span className="font-semibold" style={{ color: "var(--gx-ink)" }}>Bs. {formatearMonto(fila.valor)}</span>
      </div>
      <span className="text-xs" style={{ color: "var(--gx-muted)" }}>{etiquetaRegistrador(fila)}</span>
    </div>
  );
}

function ListaHistorial({ filas }: { filas: FilaHistorial[] }) {
  return (
    <>
      <div className="lg:hidden flex flex-col gap-2">
        {filas.map((f) => <CardFila key={f.fecha} fila={f} />)}
      </div>
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full min-w-[480px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b" style={{ borderColor: "var(--gx-edge)", color: "var(--gx-muted)" }}>
              <th className="py-2">Fecha valor</th>
              <th className="py-2">Monto</th>
              <th className="py-2">Registrado por</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => <FilaTabla key={f.fecha} fila={f} />)}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function ModalHistorialTasas({ onCerrar }: { onCerrar: () => void }) {
  const [modo, setModo] = useState<"recientes" | "fecha">("recientes");

  // Modo "recientes"
  const [filas, setFilas] = useState<FilaHistorial[]>([]);
  const [hayMas, setHayMas] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [cargandoMas, setCargandoMas] = useState(false);

  // Modo "fecha"
  const [fechaElegida, setFechaElegida] = useState("");
  const [resultadoFecha, setResultadoFecha] = useState<RespuestaFecha | null>(null);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    if (modo !== "recientes") return;
    setCargando(true);
    fetch(`/api/tasa-cambio/historial?limite=${LIMITE}`)
      .then((res) => res.json())
      .then((datos: { filas: FilaHistorial[]; hayMas: boolean }) => {
        setFilas(datos.filas);
        setHayMas(datos.hayMas);
      })
      .finally(() => setCargando(false));
  }, [modo]);

  function cargarMas() {
    const ultima = filas[filas.length - 1];
    if (!ultima) return;
    setCargandoMas(true);
    fetch(`/api/tasa-cambio/historial?limite=${LIMITE}&antesDe=${encodeURIComponent(ultima.fecha)}`)
      .then((res) => res.json())
      .then((datos: { filas: FilaHistorial[]; hayMas: boolean }) => {
        setFilas((prev) => [...prev, ...datos.filas]);
        setHayMas(datos.hayMas);
      })
      .finally(() => setCargandoMas(false));
  }

  function buscarPorFecha(fecha: string) {
    setFechaElegida(fecha);
    if (!fecha) {
      setResultadoFecha(null);
      return;
    }
    setBuscando(true);
    fetch(`/api/tasa-cambio/historial?fecha=${fecha}`)
      .then((res) => res.json())
      .then((datos: RespuestaFecha) => setResultadoFecha(datos))
      .finally(() => setBuscando(false));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "color-mix(in srgb, black 60%, transparent)" }}
      onClick={onCerrar}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-y-auto rounded-2xl border-2 p-6"
        style={{ borderColor: "var(--gx-accent)", background: "var(--gx-surface)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold" style={{ color: "var(--gx-ink)" }}>
            Historial de tasa BCV
          </h3>
          <button type="button" onClick={onCerrar} className="text-sm" style={{ color: "var(--gx-muted)" }}>
            Cerrar
          </button>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setModo("recientes")}
            className="rounded-lg px-3 py-1.5 text-sm font-medium"
            style={
              modo === "recientes"
                ? { background: "var(--gx-accent)", color: "white" }
                : { border: "1px solid var(--gx-edge)", color: "var(--gx-ink)" }
            }
          >
            Últimas
          </button>
          <button
            type="button"
            onClick={() => setModo("fecha")}
            className="rounded-lg px-3 py-1.5 text-sm font-medium"
            style={
              modo === "fecha"
                ? { background: "var(--gx-accent)", color: "white" }
                : { border: "1px solid var(--gx-edge)", color: "var(--gx-ink)" }
            }
          >
            Buscar por fecha
          </button>
        </div>

        {modo === "recientes" && (
          <div className="mt-4 flex flex-col gap-3">
            {cargando ? (
              <p className="text-sm" style={{ color: "var(--gx-muted)" }}>Cargando...</p>
            ) : filas.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--gx-muted)" }}>No hay tasas registradas todavía.</p>
            ) : (
              <>
                <ListaHistorial filas={filas} />
                {hayMas && (
                  <button
                    type="button"
                    onClick={cargarMas}
                    disabled={cargandoMas}
                    className="self-center rounded-lg border px-4 py-2 text-sm font-medium"
                    style={{ borderColor: "var(--gx-edge)", color: "var(--gx-ink)" }}
                  >
                    {cargandoMas ? "Cargando..." : "Cargar más"}
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {modo === "fecha" && (
          <div className="mt-4 flex flex-col gap-3">
            <label className="flex flex-col gap-1.5 text-sm" style={{ color: "var(--gx-muted)" }}>
              Fecha
              <input
                type="date"
                value={fechaElegida}
                onChange={(e) => buscarPorFecha(e.target.value)}
                className="min-h-11 rounded-lg border px-3 outline-none focus:border-[var(--gx-accent)]"
                style={{ background: "var(--gx-surface-2)", borderColor: "var(--gx-edge)", color: "var(--gx-ink)" }}
              />
            </label>

            {buscando && <p className="text-sm" style={{ color: "var(--gx-muted)" }}>Buscando...</p>}

            {!buscando && resultadoFecha?.tipo === "ENCONTRADA" && (
              <ListaHistorial filas={[resultadoFecha.tasa]} />
            )}

            {!buscando && resultadoFecha?.tipo === "NO_ENCONTRADA" && (
              <div className="flex flex-col gap-2 rounded-lg border p-3 text-sm" style={{ borderColor: "var(--gx-edge)" }}>
                <p style={{ color: "var(--gx-muted)" }}>No hay tasa registrada para esa fecha.</p>
                {resultadoFecha.masCercanaAnterior ? (
                  <button
                    type="button"
                    onClick={() => setResultadoFecha({ tipo: "ENCONTRADA", tasa: resultadoFecha.masCercanaAnterior! })}
                    className="self-start rounded-lg border px-3 py-1.5 text-sm font-medium"
                    style={{ borderColor: "var(--gx-accent)", color: "var(--gx-accent)" }}
                  >
                    Ver la más cercana anterior
                  </button>
                ) : (
                  <p className="text-xs" style={{ color: "var(--gx-muted)" }}>
                    No hay ninguna tasa registrada hasta esa fecha.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2:** modificar `packages/ui/components/RelojYTasa.tsx` para abrir el modal al pulsar el texto de la tasa. `RelojYTasa` vive en `packages/ui`, pero `ModalHistorialTasas` vive en `apps/web-admin` (porque hace `fetch` a una ruta de esa app) — para no crear una dependencia circular ni mover el modal a `packages/ui`, `RelojYTasa` recibe el modal como children/render-prop desde quien lo monta en `apps/web-admin`.

Cambiar la firma de `RelojYTasa` para aceptar un callback opcional `onClickTasa`:

```tsx
"use client";

import { useEffect, useState } from "react";

const INTERVALO_REFRESCO_MS = 45 * 60_000;

interface TasaCambioRespuesta {
  valor: number;
  fuente: string;
}

// Reloj en vivo (hora del navegador del operador) + última tasa BCV
// guardada — visible en una esquina de todo el panel administrativo. La
// hora "real" que usa el sistema para abrir/cerrar turno la fija el
// servidor vía TZ=America/Caracas (ver Task 1 del plan); este reloj es
// solo informativo para quien opera la caja.
export function RelojYTasa({ onClickTasa }: { onClickTasa?: () => void }) {
  const [ahora, setAhora] = useState<Date | null>(null);
  const [tasa, setTasa] = useState<TasaCambioRespuesta | null>(null);

  useEffect(() => {
    setAhora(new Date());
    const intervalo = setInterval(() => setAhora(new Date()), 1000);
    return () => clearInterval(intervalo);
  }, []);

  useEffect(() => {
    let cancelado = false;

    function cargarTasa() {
      fetch("/api/tasa-cambio")
        .then((res) => (res.ok ? res.json() : null))
        .then((datos: TasaCambioRespuesta | null) => {
          if (!cancelado && datos) setTasa(datos);
        })
        .catch(() => {});
    }

    cargarTasa();
    const intervalo = setInterval(cargarTasa, INTERVALO_REFRESCO_MS);

    function alVolverAFoco() {
      if (document.visibilityState === "visible") cargarTasa();
    }
    document.addEventListener("visibilitychange", alVolverAFoco);

    return () => {
      cancelado = true;
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", alVolverAFoco);
    };
  }, []);

  if (!ahora) return null;

  return (
    <div
      className="fixed right-4 top-4 z-40 flex items-center gap-3 rounded-full border px-4 py-2 text-xs font-medium shadow-sm print:hidden"
      style={{ background: "var(--gx-surface)", borderColor: "var(--gx-edge)", color: "var(--gx-ink)" }}
    >
      <span>{ahora.toLocaleString("es-VE", { dateStyle: "short", timeStyle: "medium" })}</span>
      {tasa && (
        <>
          <span style={{ color: "var(--gx-edge)" }}>|</span>
          <button
            type="button"
            onClick={onClickTasa}
            className="cursor-pointer transition-opacity duration-150 hover:opacity-70"
            style={{ color: "var(--gx-accent)" }}
          >
            Bs. {tasa.valor.toFixed(2)} (BCV)
          </button>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3:** `<RelojYTasa />` se monta en `apps/web-admin/app/(panel)/layout.tsx:32`, dentro de `PanelLayout` — un **server component** (`export default async function PanelLayout`). No puede manejar el estado `useState` del modal directamente, así que se crea un wrapper cliente que envuelve `RelojYTasa` + `ModalHistorialTasas`.

Crear `apps/web-admin/app/(panel)/RelojYTasaConHistorial.tsx`:

```tsx
"use client";

import { useState } from "react";
import { RelojYTasa } from "@gym-app/ui/components/RelojYTasa";
import { ModalHistorialTasas } from "./ModalHistorialTasas";

export function RelojYTasaConHistorial() {
  const [modalAbierto, setModalAbierto] = useState(false);
  return (
    <>
      <RelojYTasa onClickTasa={() => setModalAbierto(true)} />
      {modalAbierto && <ModalHistorialTasas onCerrar={() => setModalAbierto(false)} />}
    </>
  );
}
```

En `apps/web-admin/app/(panel)/layout.tsx`, cambiar el import de la línea 9:

```ts
import { RelojYTasa } from "@gym-app/ui/components/RelojYTasa";
```

por:

```ts
import { RelojYTasaConHistorial } from "./RelojYTasaConHistorial";
```

Y en la línea 32, cambiar:

```tsx
<RelojYTasa />
```

por:

```tsx
<RelojYTasaConHistorial />
```

- [ ] **Step 4:** correr `cd apps/web-admin && npx tsc --noEmit` — confirmar que solo quedan los 2 errores preexistentes.

- [ ] **Step 5:** commit.

```bash
git add packages/ui/components/RelojYTasa.tsx
git add "apps/web-admin/app/(panel)/ModalHistorialTasas.tsx"
git add "apps/web-admin/app/(panel)/RelojYTasaConHistorial.tsx"
git add "apps/web-admin/app/(panel)/layout.tsx"
git commit -m "feat: agrega modal de historial de tasa BCV al pulsar el badge"
```

---

## Tarea 6: Builds y verificación manual

- [ ] **Step 1:** `cd apps/web-admin && npx tsc --noEmit` → solo los 2 errores preexistentes de `PrismaPlanRepository.ts`.
- [ ] **Step 2:** `cd apps/web-admin && npx tsx scripts/verificar-historial-tasa-bcv.ts` → `OK (7/7)`.
- [ ] **Step 3:** `npx turbo run build --filter=web-admin` → mismo bloqueo preexistente de build esperado (documentar en `handoff.md` si sigue igual, o investigar si empeoró).
- [ ] **Step 4:** `npx turbo run lint --filter=web-admin` → comparar el conteo de problemas contra el baseline actual (19 problemas / 8 errores / 11 warnings, según el último `handoff.md`) con `git stash` si hace falta aislar la causa de cualquier diferencia.
- [ ] **Step 5:** manual (la ejecuta el usuario, requiere red y base de datos):
  - Correr la migración de la Tarea 1 contra una base de desarrollo.
  - Abrir el panel, pulsar el texto de la tasa en el badge — debe abrirse el modal.
  - Confirmar que las últimas filas aparecen, que "Cargar más" trae más filas y desaparece al agotar el historial.
  - Ingresar una tasa manual (flujo existente de `ModalIngresoManualTasa`) y confirmar que aparece en el historial con el nombre del usuario logueado y la hora en formato am/pm.
  - Buscar una fecha sin tasa (ej. un domingo) y confirmar el aviso + el botón "Ver la más cercana anterior".
  - Probar en una ventana angosta (mobile) que la lista se ve como cards, no como tabla con scroll horizontal.
- [ ] **Step 6:** actualizar `handoff.md` con el resultado de esta etapa (Objetivo, Estado actual, Archivos y cambios, Intentos fallidos, Próximos pasos — reglas del proyecto, `CLAUDE.md`).

---

## Fuera de alcance

- Editar o anular una fila del historial desde este modal (es de solo lectura).
- Exportar el historial a CSV/Excel.
- Notificaciones o alertas cuando se registra una tasa manual.
- Restricción de permisos por rol (decisión explícita: dato público, cualquier usuario logueado puede verlo).
