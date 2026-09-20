# Ciclos de Membresía Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a "Ciclos" block in the member profile, enrich the payment
history with the transaction details already stored (rate, who
registered it, exact time), surface a "Última fecha de renovación"
field, and use `Sucursal.diasGracia` (which exists but is unused today)
to add a grace-period check-in state to the kiosk.

**Architecture:** `Pago` gains two nullable columns
(`fechaInicioCiclo`/`fechaFinCiclo`) captured by `registrarPago` at the
moment of payment — no change to the existing `Suscripcion`
extend-in-place behavior. `EstadoCheckIn` gains a third value
(`"en_gracia"`) computed by `validarAccesoSucursal` from
`Miembro.fechaVencimiento` + the physical sucursal's `diasGracia`. UI
changes are additive: new columns in the existing payment-history table,
a new read-only card in the member form, a new label/color/message in
the kiosk.

**Tech Stack:** Next.js 16 (Turbopack) monorepo, Prisma 7 / PostgreSQL,
Server Actions, React Server + Client Components, TypeScript strict.

**Spec:** `docs/superpowers/specs/2026-09-20-ciclos-membresia-design.md`

## Global Constraints

- New `Pago` columns are nullable — never backfilled, never required.
  Pagos created before this change keep `fechaInicioCiclo`/
  `fechaFinCiclo = null` and must render as `"—"` wherever shown.
- Grace-period days are counted from the **physical** sucursal where the
  check-in happens (`input.sucursalId` in `RegistrarCheckIn`), not the
  member's assigned sucursal.
- Grace window: vencimiento on day D with `diasGracia = N` → `"en_gracia"`
  for `ahora` in `(D, D+N days]` (inclusive of the Nth day, exclusive of
  D itself); `ahora > D + N days` → `"vencido"`.
- No monto/plan amount is shown in the kiosk grace/vencido messages —
  text only.
- Only the single most recent ciclo (by `fechaFinCiclo` descending, among
  pagos that have ciclo data) may render as "VIGENTE"; all others render
  "VENCIDO".
- This project has no Jest/Vitest test runner. Verification happens via
  disposable `tsx` scripts run against the real Postgres DB (see
  `DATABASE_URL` in `.env`), following the existing pattern of
  `packages/db/limpiarMiembros.ts` and prior sessions' `check-temp.ts`
  scripts — write the script, run it with `npx tsx <name>.ts` from
  `packages/db/`, confirm the printed output, then delete the script.
  Do not leave throwaway verification scripts committed.
- Every task that touches `apps/web-admin` or `apps/kiosk` ends with a
  clean build (`npm run build --workspace apps/web-admin` /
  `--workspace apps/kiosk`) before moving on — this project relies on
  `next build`'s TypeScript pass as its type-check, there is no separate
  `tsc --noEmit` script.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/db/prisma/schema.prisma` | Add `Pago.fechaInicioCiclo`/`fechaFinCiclo` |
| `packages/db/prisma/migrations/20260920190000_ciclos_pago_fechas/migration.sql` | Raw SQL for the two new nullable columns |
| `packages/domain/entities/Pago.ts` | Add `fechaInicioCiclo`, `fechaFinCiclo`, `registradoPorNombre` to `Pago` and `DatosNuevoPago` |
| `packages/domain/entities/CheckIn.ts` | Add `"en_gracia"` to `EstadoCheckIn` |
| `packages/domain/use-cases/RegistrarPago.ts` | Capture ciclo start/end, pass to `pagos.crear` |
| `packages/domain/use-cases/ValidarAccesoSucursalPorPlan.ts` | Compute `"en_gracia"` vs `"vencido"` using vencimiento + diasGracia |
| `packages/domain/use-cases/RegistrarCheckIn.ts` | Pass `sucursal.diasGracia` + `miembro.fechaVencimiento` to the validator; return `diasGraciaRestantes` |
| `packages/infrastructure/persistence/prisma/PrismaPagoRepository.ts` | Persist/map the two new columns; join `UsuarioAdmin` for `registradoPorNombre` |
| `apps/web-admin/app/api/checkin/route.ts` | Forward `diasGraciaRestantes` in the JSON response |
| `apps/kiosk/lib/api.ts` | Add `"en_gracia"` to `EstadoCheckIn`, `diasGraciaRestantes` to `ResultadoCheckIn` |
| `apps/kiosk/components/AccessCard.tsx` | New label/color for `en_gracia`, grace/vencido message |
| `apps/web-admin/app/(panel)/miembros/[id]/pagos/page.tsx` | Add Hora, Tasa, Registrado por, Ciclo columns |
| `apps/web-admin/app/(panel)/miembros/FormularioMiembro.tsx` | Add "Última fecha de renovación" to the read-only plan card; add new "Ciclos" card |
| `apps/web-admin/app/(panel)/miembros/[id]/page.tsx` | Fetch últimos ciclos, pass to `FormularioMiembro` |

---

### Task 1: Migration — `Pago.fechaInicioCiclo` / `Pago.fechaFinCiclo`

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (the `Pago` model, currently at line 187)
- Create: `packages/db/prisma/migrations/20260920190000_ciclos_pago_fechas/migration.sql`

**Interfaces:**
- Produces: two new nullable `DateTime` columns on the `Pago` table —
  `fechaInicioCiclo`, `fechaFinCiclo` — for every later task to read and
  write.

- [ ] **Step 1: Edit the schema**

In `packages/db/prisma/schema.prisma`, find the `Pago` model and add the
two new fields right after `fechaPago`:

```prisma
model Pago {
  id              String   @id @default(cuid())
  miembroId       String
  miembro         Miembro  @relation(fields: [miembroId], references: [id])
  sucursalId      String
  sucursal        Sucursal @relation(fields: [sucursalId], references: [id])
  turnoId         String?
  turno           Turno?   @relation(fields: [turnoId], references: [id])
  registradoPorId String
  registradoPor   UsuarioAdmin @relation("PagosRegistrados", fields: [registradoPorId], references: [id])

  monto           Decimal  @db.Decimal(10, 2)
  metodo          String // snapshot legible al momento del pago (ej. "Pago Móvil - Banesco"), no cambia si el MetodoPago se edita/borra luego
  metodoPagoId    String?
  metodoPago      MetodoPago? @relation(fields: [metodoPagoId], references: [id])
  numeroOperacion String?
  tasaCambio      Decimal? @db.Decimal(10, 2)
  montoBs         Decimal? @db.Decimal(12, 2)
  fechaPago       DateTime @default(now())
  fechaInicioCiclo DateTime? // inicio real del ciclo que este pago activó/extendió — null en pagos previos a esta migración
  fechaFinCiclo    DateTime? // fin real de ese ciclo (mismo valor que pasa a ser Suscripcion.fin/Miembro.fechaVencimiento tras este pago)

  anuladoEn       DateTime?
  anuladoPorId    String?
  anuladoPor      UsuarioAdmin? @relation("PagosAnulados", fields: [anuladoPorId], references: [id])
  motivoAnulacion String?
}
```

- [ ] **Step 2: Write the migration SQL**

Create `packages/db/prisma/migrations/20260920190000_ciclos_pago_fechas/migration.sql`:

```sql
-- Pago.fechaInicioCiclo / Pago.fechaFinCiclo

ALTER TABLE "Pago" ADD COLUMN "fechaInicioCiclo" TIMESTAMP(3);
ALTER TABLE "Pago" ADD COLUMN "fechaFinCiclo" TIMESTAMP(3);
```

- [ ] **Step 3: Apply the migration against the real DB**

Run from `packages/db/`:

```bash
npx prisma migrate deploy
```

Expected output: `1 migration found in prisma/migrations` /
`The following migration(s) have been applied: 20260920190000_ciclos_pago_fechas`

If it reports the migration is already applied or up to date with no
pending migrations, re-check the folder name matches exactly
`20260920190000_ciclos_pago_fechas` and re-run.

- [ ] **Step 4: Regenerate the Prisma client**

Run from `packages/db/`:

```bash
npx prisma generate
```

Expected: `Generated Prisma Client` with no errors.

- [ ] **Step 5: Verify the columns exist**

Create a disposable script `packages/db/check-temp.ts`:

```ts
import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";
import path from "node:path";

config({ path: path.resolve(__dirname, "../../.env") });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const columnas: unknown = await prisma.$queryRawUnsafe(
    `SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = 'Pago' AND column_name IN ('fechaInicioCiclo', 'fechaFinCiclo')`
  );
  console.log(columnas);
  await prisma.$disconnect();
}

main();
```

Run: `npx tsx check-temp.ts` (from `packages/db/`)

Expected: two rows printed, both with `is_nullable: 'YES'`.

- [ ] **Step 6: Delete the disposable script**

```bash
rm packages/db/check-temp.ts
```

- [ ] **Step 7: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations/20260920190000_ciclos_pago_fechas
git commit -m "feat: agrega Pago.fechaInicioCiclo y Pago.fechaFinCiclo"
```

---

### Task 2: `EstadoCheckIn` gains `"en_gracia"`

**Files:**
- Modify: `packages/domain/entities/CheckIn.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `EstadoCheckIn = "activo" | "en_gracia" | "vencido" | "sucursal_incorrecta"` for `ValidarAccesoSucursalPorPlan.ts`, `RegistrarCheckIn.ts`, `apps/kiosk/lib/api.ts`, and `apps/kiosk/components/AccessCard.tsx` to consume.

- [ ] **Step 1: Edit the type**

In `packages/domain/entities/CheckIn.ts`, change:

```ts
export type EstadoCheckIn = "activo" | "vencido" | "sucursal_incorrecta";
```

to:

```ts
export type EstadoCheckIn = "activo" | "en_gracia" | "vencido" | "sucursal_incorrecta";
```

- [ ] **Step 2: Confirm the domain package still compiles**

There's no standalone `tsc` script for `packages/domain` — the type
error (if any) will surface in Task 3/4's `next build`. Skip a separate
check here; this task's own build verification happens at the end of
Task 5.

- [ ] **Step 3: Commit**

```bash
git add packages/domain/entities/CheckIn.ts
git commit -m "feat: agrega el estado en_gracia a EstadoCheckIn"
```

---

### Task 3: `validarAccesoSucursal` computes `"en_gracia"`

**Files:**
- Modify: `packages/domain/use-cases/ValidarAccesoSucursalPorPlan.ts`

**Interfaces:**
- Consumes: `EstadoCheckIn` from Task 2 (`"activo" | "en_gracia" | "vencido" | "sucursal_incorrecta"`).
- Produces: new signature —

```ts
export async function validarAccesoSucursal(
  deps: ValidarAccesoDeps,
  miembroId: string,
  sucursalIdDelMiembro: string | null,
  sucursalIdDelCheckIn: string,
  fechaVencimientoMiembro: Date | null,
  diasGracia: number,
  ahora: Date = new Date()
): Promise<EstadoCheckIn>
```

  Task 4 (`RegistrarCheckIn.ts`) calls this with the two new parameters.

- [ ] **Step 1: Rewrite the function**

Replace the full contents of `packages/domain/use-cases/ValidarAccesoSucursalPorPlan.ts`:

```ts
import { ISuscripcionRepository } from "../ports/ISuscripcionRepository";
import { EstadoCheckIn } from "../entities/CheckIn";

export interface ValidarAccesoDeps {
  suscripciones: ISuscripcionRepository;
}

// Cuántos milisegundos tiene un día — usado para calcular el límite del
// período de gracia sin depender de setDate (evita problemas de huso
// horario al comparar contra "ahora").
const MS_POR_DIA = 24 * 60 * 60 * 1000;

// El acceso ya no depende del Plan (que dejó de estar anclado a
// sucursal): primero se valida que el miembro esté haciendo check-in en
// SU sucursal asignada, y solo después si tiene una Suscripcion activa
// vigente.
export async function validarAccesoSucursal(
  deps: ValidarAccesoDeps,
  miembroId: string,
  sucursalIdDelMiembro: string | null,
  sucursalIdDelCheckIn: string,
  fechaVencimientoMiembro: Date | null,
  diasGracia: number,
  ahora: Date = new Date()
): Promise<EstadoCheckIn> {
  // sucursalIdDelMiembro === null significa "Ambas" (miembro con Plan
  // multisede) — pasa la validación de sede sin importar en qué sucursal
  // de la organización haga check-in.
  if (sucursalIdDelMiembro !== null && sucursalIdDelMiembro !== sucursalIdDelCheckIn) {
    return "sucursal_incorrecta";
  }

  const suscripcion = await deps.suscripciones.buscarActivaVigentePorMiembro(miembroId, ahora);

  if (suscripcion) {
    return "activo";
  }

  // Sin suscripción activa vigente: se registra igual el check-in (no
  // bloquear la operación física). Si todavía está dentro del período
  // de gracia de la sucursal FÍSICA donde ocurre el check-in, se marca
  // "en_gracia" en vez de "vencido" — los días de gracia empiezan a
  // contar el día SIGUIENTE al vencimiento (vencimiento 31/08,
  // diasGracia=3 → en_gracia hasta el 03/09 inclusive; 04/09 en
  // adelante ya es "vencido").
  if (fechaVencimientoMiembro && diasGracia > 0) {
    const limiteGracia = new Date(fechaVencimientoMiembro.getTime() + diasGracia * MS_POR_DIA);
    if (ahora.getTime() > fechaVencimientoMiembro.getTime() && ahora.getTime() <= limiteGracia.getTime()) {
      return "en_gracia";
    }
  }

  return "vencido";
}
```

- [ ] **Step 2: Verify the grace-window boundary with a disposable script**

Create `packages/db/check-temp.ts`:

```ts
import { validarAccesoSucursal } from "../domain/use-cases/ValidarAccesoSucursalPorPlan";

async function main() {
  const suscripciones = {
    buscarActivaVigentePorMiembro: async () => null,
  } as any;

  const vencimiento = new Date("2026-08-31T00:00:00Z");

  // Un día después del vencimiento, con 3 días de gracia -> en_gracia
  const unDiaDespues = new Date("2026-09-01T00:00:00Z");
  console.log("1 día después (esperado en_gracia):", await validarAccesoSucursal({ suscripciones }, "m1", "s1", "s1", vencimiento, 3, unDiaDespues));

  // Exactamente al final del período de gracia (3 días después) -> en_gracia
  const finGracia = new Date("2026-09-03T00:00:00Z");
  console.log("3 días después, límite (esperado en_gracia):", await validarAccesoSucursal({ suscripciones }, "m1", "s1", "s1", vencimiento, 3, finGracia));

  // Un instante después del límite -> vencido
  const pasadoElLimite = new Date("2026-09-03T00:00:00.001Z");
  console.log("justo después del límite (esperado vencido):", await validarAccesoSucursal({ suscripciones }, "m1", "s1", "s1", vencimiento, 3, pasadoElLimite));

  // Sin diasGracia (0) -> vencido inmediatamente
  console.log("diasGracia=0 (esperado vencido):", await validarAccesoSucursal({ suscripciones }, "m1", "s1", "s1", vencimiento, 0, unDiaDespues));

  // Sin fechaVencimientoMiembro -> vencido
  console.log("sin fechaVencimiento (esperado vencido):", await validarAccesoSucursal({ suscripciones }, "m1", "s1", "s1", null, 3, unDiaDespues));
}

main();
```

Run from `packages/db/`: `npx tsx check-temp.ts`

Expected output (in order): `en_gracia`, `en_gracia`, `vencido`, `vencido`, `vencido`.

- [ ] **Step 3: Delete the disposable script**

```bash
rm packages/db/check-temp.ts
```

- [ ] **Step 4: Commit**

```bash
git add packages/domain/use-cases/ValidarAccesoSucursalPorPlan.ts
git commit -m "feat: validarAccesoSucursal calcula el estado en_gracia"
```

---

### Task 4: `RegistrarCheckIn` passes grace data through; returns `diasGraciaRestantes`

**Files:**
- Modify: `packages/domain/use-cases/RegistrarCheckIn.ts`

**Interfaces:**
- Consumes: `validarAccesoSucursal` new signature from Task 3;
  `ISucursalRepository.buscarPorId(organizacionId, id): Promise<Sucursal | null>` (existing, `Sucursal.diasGracia: number`); `Miembro.fechaVencimiento: Date | null` (existing).
- Produces: `RegistrarCheckInResultado` gains `diasGraciaRestantes: number | null` — Task 5 (`apps/web-admin/app/api/checkin/route.ts`) forwards this field verbatim.

- [ ] **Step 1: Rewrite the function**

Replace the full contents of `packages/domain/use-cases/RegistrarCheckIn.ts`:

```ts
import { IMemberRepository } from "../ports/IMemberRepository";
import { ICheckInRepository } from "../ports/ICheckInRepository";
import { ISuscripcionRepository } from "../ports/ISuscripcionRepository";
import { ISucursalRepository } from "../ports/ISucursalRepository";
import { EstadoCheckIn } from "../entities/CheckIn";
import { validarAccesoSucursal } from "./ValidarAccesoSucursalPorPlan";

const VENTANA_IDEMPOTENCIA_MINUTOS = 2;
const MS_POR_DIA = 24 * 60 * 60 * 1000;

export interface RegistrarCheckInDeps {
  miembros: IMemberRepository;
  checkIns: ICheckInRepository;
  suscripciones: ISuscripcionRepository;
  sucursales: ISucursalRepository;
}

export interface RegistrarCheckInInput {
  organizacionId: string;
  sucursalId: string;
  cedula: string;
}

export interface RegistrarCheckInResultado {
  nombre: string;
  fotoUrl: string | null;
  entrenadorNombre: string | null;
  estado: EstadoCheckIn;
  // Sede asignada al miembro — se informa siempre, pero cobra sentido en
  // el kiosco cuando estado === "sucursal_incorrecta" ("Acceso denegado,
  // tu sede es X en Y").
  sucursalAsignadaNombre: string;
  sucursalAsignadaDireccion: string | null;
  // Días de gracia que le quedan al miembro en la sucursal física donde
  // hizo el check-in — solo tiene sentido cuando estado es "en_gracia"
  // (null en cualquier otro estado).
  diasGraciaRestantes: number | null;
}

export class MiembroNoEncontradoError extends Error {
  constructor() {
    super("No se encontró ningún miembro con esa cédula.");
  }
}

export async function registrarCheckIn(
  deps: RegistrarCheckInDeps,
  input: RegistrarCheckInInput
): Promise<RegistrarCheckInResultado> {
  const miembro = await deps.miembros.buscarPorOrganizacionYCedula(input.organizacionId, input.cedula);

  if (!miembro) {
    throw new MiembroNoEncontradoError();
  }

  const sucursalAsignada = miembro.sucursalId
    ? await deps.sucursales.buscarPorId(input.organizacionId, miembro.sucursalId)
    : null;

  const sucursalDelCheckIn = await deps.sucursales.buscarPorId(input.organizacionId, input.sucursalId);
  const diasGracia = sucursalDelCheckIn?.diasGracia ?? 0;

  const base = {
    nombre: miembro.nombre,
    fotoUrl: miembro.fotoUrl,
    entrenadorNombre: miembro.entrenadorNombre,
    // Sin sucursalId (miembro "Ambas") no hay una sede única que informar
    // en un eventual mensaje de acceso denegado — de hecho nunca se
    // deniega por sede a este miembro, ver validarAccesoSucursal.
    sucursalAsignadaNombre: miembro.sucursalId ? sucursalAsignada?.nombre ?? "" : "Ambas",
    sucursalAsignadaDireccion: sucursalAsignada?.direccion ?? null,
  };

  const desde = new Date(Date.now() - VENTANA_IDEMPOTENCIA_MINUTOS * 60_000);
  const existente = await deps.checkIns.buscarRecientePorMiembroYSucursal(
    miembro.id,
    input.sucursalId,
    desde
  );

  function calcularDiasGraciaRestantes(ahora: Date): number | null {
    if (!miembro!.fechaVencimiento || diasGracia <= 0) return null;
    const limiteGracia = miembro!.fechaVencimiento.getTime() + diasGracia * MS_POR_DIA;
    const restantesMs = limiteGracia - ahora.getTime();
    if (restantesMs <= 0) return null;
    return Math.ceil(restantesMs / MS_POR_DIA);
  }

  if (existente) {
    return {
      ...base,
      estado: existente.estadoAlMomento,
      diasGraciaRestantes: existente.estadoAlMomento === "en_gracia" ? calcularDiasGraciaRestantes(new Date()) : null,
    };
  }

  const ahora = new Date();
  const estado = await validarAccesoSucursal(
    { suscripciones: deps.suscripciones },
    miembro.id,
    miembro.sucursalId,
    input.sucursalId,
    miembro.fechaVencimiento,
    diasGracia,
    ahora
  );

  await deps.checkIns.crear({
    sucursalId: input.sucursalId,
    miembroId: miembro.id,
    estadoAlMomento: estado,
  });

  return {
    ...base,
    estado,
    diasGraciaRestantes: estado === "en_gracia" ? calcularDiasGraciaRestantes(ahora) : null,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/domain/use-cases/RegistrarCheckIn.ts
git commit -m "feat: RegistrarCheckIn calcula y devuelve diasGraciaRestantes"
```

---

### Task 5: Forward `diasGraciaRestantes` through the check-in API + kiosk client

**Files:**
- Modify: `apps/web-admin/app/api/checkin/route.ts`
- Modify: `apps/kiosk/lib/api.ts`
- Test: build both apps (see below)

**Interfaces:**
- Consumes: `RegistrarCheckInResultado` from Task 4 (`estado: EstadoCheckIn`, `diasGraciaRestantes: number | null`).
- Produces: `ResultadoCheckIn` (kiosk-side type) with the same two fields, for Task 6 (`AccessCard.tsx`) to render.

- [ ] **Step 1: Update the API route's JSON response**

In `apps/web-admin/app/api/checkin/route.ts`, find the `json(...)` call
inside the `try` block (currently returning `nombre`, `fotoUrl`,
`entrenador`, `estado`, `sucursalAsignadaNombre`,
`sucursalAsignadaDireccion`) and add the new field:

```ts
return json(
  {
    nombre: resultado.nombre,
    fotoUrl: resultado.fotoUrl,
    entrenador: resultado.entrenadorNombre,
    estado: resultado.estado,
    sucursalAsignadaNombre: resultado.sucursalAsignadaNombre,
    sucursalAsignadaDireccion: resultado.sucursalAsignadaDireccion,
    diasGraciaRestantes: resultado.diasGraciaRestantes,
  },
  200
);
```

- [ ] **Step 2: Update the kiosk API client type**

In `apps/kiosk/lib/api.ts`, change:

```ts
export type EstadoCheckIn = "activo" | "vencido" | "sucursal_incorrecta";

export interface ResultadoCheckIn {
  nombre: string;
  fotoUrl: string | null;
  entrenador: string | null;
  estado: EstadoCheckIn;
  sucursalAsignadaNombre: string;
  sucursalAsignadaDireccion: string | null;
}
```

to:

```ts
export type EstadoCheckIn = "activo" | "en_gracia" | "vencido" | "sucursal_incorrecta";

export interface ResultadoCheckIn {
  nombre: string;
  fotoUrl: string | null;
  entrenador: string | null;
  estado: EstadoCheckIn;
  sucursalAsignadaNombre: string;
  sucursalAsignadaDireccion: string | null;
  diasGraciaRestantes: number | null;
}
```

- [ ] **Step 3: Build web-admin**

```bash
npm run build --workspace apps/web-admin
```

Expected: exit code 0, no TypeScript errors. (This will likely fail
right now because `AccessCard.tsx` still only handles the old 3-value
`EstadoCheckIn` — that's fixed in Task 6. If `apps/web-admin`'s build
fails specifically on `apps/kiosk` files, that's a build-graph
misconfiguration, not expected — check `turbo.json`/workspace filters
before proceeding. If `apps/web-admin` builds clean on its own, that
confirms this task's own changes are correct; `apps/kiosk`'s build is
verified in Task 6.)

- [ ] **Step 4: Commit**

```bash
git add apps/web-admin/app/api/checkin/route.ts apps/kiosk/lib/api.ts
git commit -m "feat: la API de check-in devuelve diasGraciaRestantes"
```

---

### Task 6: Kiosk UI — `"en_gracia"` label, color, and message

**Files:**
- Modify: `apps/kiosk/components/AccessCard.tsx`

**Interfaces:**
- Consumes: `ResultadoCheckIn` from Task 5 (`estado: EstadoCheckIn` including `"en_gracia"`, `diasGraciaRestantes: number | null`).
- Produces: nothing consumed by later tasks — this is a leaf UI component.

- [ ] **Step 1: Add the label and color for `en_gracia`**

In `apps/kiosk/components/AccessCard.tsx`, update `ETIQUETA_ESTADO`:

```ts
const ETIQUETA_ESTADO: Record<ResultadoCheckIn["estado"], string> = {
  activo: "Acceso permitido",
  en_gracia: "Membresía vencida — período de gracia",
  vencido: "Membresía vencida",
  sucursal_incorrecta: "Acceso denegado",
};
```

Then update the color logic. Replace:

```ts
export function AccessCard({ resultado, hora }: { resultado: ResultadoCheckIn; hora: string }) {
  const activo = resultado.estado === "activo";
  const colorEstado = activo ? "var(--gx-accent)" : "var(--gx-bad)";
  const colorEstadoInk = activo ? "var(--gx-accent-ink)" : "var(--gx-bad-ink)";
```

with:

```ts
export function AccessCard({ resultado, hora }: { resultado: ResultadoCheckIn; hora: string }) {
  const activo = resultado.estado === "activo";
  const enGracia = resultado.estado === "en_gracia";
  const colorEstado = activo ? "var(--gx-accent)" : enGracia ? "var(--gx-warn)" : "var(--gx-bad)";
  const colorEstadoInk = activo ? "var(--gx-accent-ink)" : enGracia ? "var(--gx-warn-ink)" : "var(--gx-bad-ink)";
```

- [ ] **Step 2: Verify the `--gx-warn-ink` CSS variable exists**

```bash
grep -rn "gx-warn-ink\|gx-warn\b" apps/web-admin/app/globals.css packages/ui 2>/dev/null
```

If `--gx-warn-ink` is not found anywhere (only `--gx-warn` exists),
fall back to `var(--gx-ink)` for `colorEstadoInk` in the `enGracia`
branch instead of `var(--gx-warn-ink)`, and use `var(--gx-warn)` only
for `colorEstado`. Confirm which variables actually exist before
finalizing Step 1's edit.

- [ ] **Step 3: Add the grace/vencido message under the status bar**

In the same file, find the block that renders `resultado.entrenador`
(the `<div className="grid grid-cols-2 gap-4 border-t ...">` inside the
`else` branch of `resultado.estado === "sucursal_incorrecta" ? ... :
...`). Add a message row above that grid, inside the same `else`
branch, so the final structure reads:

```tsx
          {resultado.estado === "sucursal_incorrecta" ? (
            <div className="border-t pt-4" style={{ borderColor: "var(--gx-edge)" }}>
              <span className="text-xs font-bold uppercase" style={{ letterSpacing: "0.1em", color: "var(--gx-muted-dim)" }}>
                Tu sede asignada es
              </span>
              <p className="mt-1 text-2xl font-semibold" style={{ color: "var(--gx-ink)" }}>
                {resultado.sucursalAsignadaNombre}
              </p>
              {resultado.sucursalAsignadaDireccion && (
                <p className="text-base" style={{ color: "var(--gx-muted)" }}>
                  {resultado.sucursalAsignadaDireccion}
                </p>
              )}
            </div>
          ) : (
            <>
              {(resultado.estado === "en_gracia" || resultado.estado === "vencido") && (
                <p className="border-t pt-4 text-lg font-medium" style={{ borderColor: "var(--gx-edge)", color: "var(--gx-warn)" }}>
                  {resultado.estado === "en_gracia"
                    ? `Tenés ${resultado.diasGraciaRestantes ?? 0} día(s) de gracia — acercate a recepción a renovar tu plan.`
                    : "Tu período de gracia terminó — acercate a recepción a renovar tu plan."}
                </p>
              )}
              <div className="grid grid-cols-2 gap-4 border-t pt-4" style={{ borderColor: "var(--gx-edge)" }}>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-bold uppercase" style={{ letterSpacing: "0.1em", color: "var(--gx-muted-dim)" }}>
                    Entrada
                  </span>
                  <span className="text-xl font-semibold" style={{ color: "var(--gx-ink)" }}>{hora}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-bold uppercase" style={{ letterSpacing: "0.1em", color: "var(--gx-muted-dim)" }}>
                    Entrenador
                  </span>
                  <span className="text-xl font-semibold" style={{ color: "var(--gx-ink)" }}>{resultado.entrenador ?? "—"}</span>
                </div>
              </div>
            </>
          )}
```

(Wrap the previously-single `<div className="grid grid-cols-2 ...">` in
a `<>...</>` fragment alongside the new conditional message, as shown
above — replace the entire `) : (` ... `)}` branch with this.)

- [ ] **Step 4: Build the kiosk app**

```bash
npm run build --workspace apps/kiosk
```

Expected: exit code 0, no TypeScript errors.

- [ ] **Step 5: Build web-admin again to confirm Task 5 is now fully clean**

```bash
npm run build --workspace apps/web-admin
```

Expected: exit code 0.

- [ ] **Step 6: Commit**

```bash
git add apps/kiosk/components/AccessCard.tsx
git commit -m "feat: el kiosco muestra el estado en_gracia con mensaje y color propios"
```

---

### Task 7: `RegistrarPago` captures the ciclo's start/end dates

**Files:**
- Modify: `packages/domain/entities/Pago.ts`
- Modify: `packages/domain/use-cases/RegistrarPago.ts`

**Interfaces:**
- Consumes: nothing new from earlier tasks.
- Produces: `Pago.fechaInicioCiclo: Date | null`, `Pago.fechaFinCiclo: Date | null`, `DatosNuevoPago.fechaInicioCiclo: Date`, `DatosNuevoPago.fechaFinCiclo: Date` — Task 8 (`PrismaPagoRepository.ts`) persists/maps these; Task 10 and Task 11 (UI) read `Pago.fechaInicioCiclo`/`fechaFinCiclo`.

- [ ] **Step 1: Update the `Pago` and `DatosNuevoPago` entities**

In `packages/domain/entities/Pago.ts`, add fields to both interfaces:

```ts
export interface Pago {
  id: string;
  miembroId: string;
  miembroNombre?: string;
  miembroPrecioPlan?: number;
  sucursalId: string;
  turnoId: string | null;
  registradoPorId: string;
  registradoPorNombre?: string;
  monto: number;
  metodo: string;
  metodoPagoId: string | null;
  numeroOperacion: string | null;
  tasaCambio: number | null;
  montoBs: number | null;
  fechaPago: Date;
  fechaInicioCiclo: Date | null;
  fechaFinCiclo: Date | null;
  anuladoEn: Date | null;
  anuladoPorId: string | null;
  motivoAnulacion: string | null;
}

export interface DatosNuevoPago {
  miembroId: string;
  sucursalId: string;
  turnoId: string | null;
  registradoPorId: string;
  monto: number;
  metodo: string;
  metodoPagoId: string | null;
  numeroOperacion: string | null;
  tasaCambio: number | null;
  montoBs: number | null;
  fechaInicioCiclo: Date;
  fechaFinCiclo: Date;
}
```

(Note: `registradoPorNombre` is added here too — it belongs to this
entity edit even though Task 8 is the one that populates it, to keep
the interface change in one place. `fechaInicioCiclo`/`fechaFinCiclo`
are **required** — not optional — on `DatosNuevoPago`, since
`RegistrarPago` always computes both.)

- [ ] **Step 2: Update `registrarPago` to capture and pass the ciclo dates**

In `packages/domain/use-cases/RegistrarPago.ts`, the existing block:

```ts
  const ahora = new Date();
  const activa = await deps.suscripciones.buscarActivaVigentePorMiembroYPlan(input.miembroId, input.planId, ahora);

  const base = activa && activa.fin > ahora ? activa.fin : ahora;
  const fin = new Date(base);
  fin.setDate(fin.getDate() + DURACION_DIAS_POR_FRECUENCIA[plan.frecuencia]);

  if (activa) {
    await deps.suscripciones.extenderFin(activa.id, fin);
  } else {
    await deps.suscripciones.crear({ miembroId: input.miembroId, planId: input.planId, inicio: ahora, fin });
  }

  await deps.miembros.actualizar(input.organizacionId, input.miembroId, { planId: input.planId });
  await deps.miembros.actualizarFechasPago(input.miembroId, ahora, fin);

  const turnoAbierto = await deps.turnos.buscarAbiertoPorSucursal(input.sucursalId);

  return deps.pagos.crear({
    miembroId: input.miembroId,
    sucursalId: input.sucursalId,
    turnoId: turnoAbierto?.id ?? null,
    registradoPorId: input.registradoPorId,
    monto: input.monto,
    metodo: input.metodo,
    metodoPagoId: input.metodoPagoId,
    numeroOperacion: input.numeroOperacion,
    tasaCambio: input.tasaCambio,
    montoBs: input.tasaCambio !== null ? input.monto * input.tasaCambio : null,
  });
```

becomes (the `const base` value is reused, unchanged, as
`fechaInicioCiclo`; `fin` as `fechaFinCiclo`):

```ts
  const ahora = new Date();
  const activa = await deps.suscripciones.buscarActivaVigentePorMiembroYPlan(input.miembroId, input.planId, ahora);

  const base = activa && activa.fin > ahora ? activa.fin : ahora;
  const fin = new Date(base);
  fin.setDate(fin.getDate() + DURACION_DIAS_POR_FRECUENCIA[plan.frecuencia]);

  if (activa) {
    await deps.suscripciones.extenderFin(activa.id, fin);
  } else {
    await deps.suscripciones.crear({ miembroId: input.miembroId, planId: input.planId, inicio: ahora, fin });
  }

  await deps.miembros.actualizar(input.organizacionId, input.miembroId, { planId: input.planId });
  await deps.miembros.actualizarFechasPago(input.miembroId, ahora, fin);

  const turnoAbierto = await deps.turnos.buscarAbiertoPorSucursal(input.sucursalId);

  return deps.pagos.crear({
    miembroId: input.miembroId,
    sucursalId: input.sucursalId,
    turnoId: turnoAbierto?.id ?? null,
    registradoPorId: input.registradoPorId,
    monto: input.monto,
    metodo: input.metodo,
    metodoPagoId: input.metodoPagoId,
    numeroOperacion: input.numeroOperacion,
    tasaCambio: input.tasaCambio,
    montoBs: input.tasaCambio !== null ? input.monto * input.tasaCambio : null,
    fechaInicioCiclo: base,
    fechaFinCiclo: fin,
  });
```

- [ ] **Step 2: Commit**

```bash
git add packages/domain/entities/Pago.ts packages/domain/use-cases/RegistrarPago.ts
git commit -m "feat: RegistrarPago captura el rango de fechas del ciclo"
```

---

### Task 8: `PrismaPagoRepository` persists ciclo dates and joins `registradoPorNombre`

**Files:**
- Modify: `packages/infrastructure/persistence/prisma/PrismaPagoRepository.ts`

**Interfaces:**
- Consumes: `DatosNuevoPago` (Task 7, with required `fechaInicioCiclo`/`fechaFinCiclo`); `Pago` entity (Task 7, with `registradoPorNombre?`, `fechaInicioCiclo`, `fechaFinCiclo`); Prisma model `UsuarioAdmin.nombre: string` (existing, confirmed in schema).
- Produces: every `listarPor*`/`buscarPorId` method now returns `Pago` objects with `fechaInicioCiclo`/`fechaFinCiclo` populated (or `null` for pre-migration rows) and, where the query already joins `registradoPor`, `registradoPorNombre` populated — Task 10 and Task 11 (UI pages) read these fields directly off the `Pago[]` they already receive from `listarPagos`.

- [ ] **Step 1: Rewrite the file**

Replace the full contents of `packages/infrastructure/persistence/prisma/PrismaPagoRepository.ts`:

```ts
import type { PrismaClient } from "@gym-app/db/generated/prisma/client";
import type { IPagoRepository } from "@gym-app/domain/ports/IPagoRepository";
import type { Pago, DatosNuevoPago } from "@gym-app/domain/entities/Pago";

type FilaPago = {
  id: string;
  miembroId: string;
  sucursalId: string;
  turnoId: string | null;
  registradoPorId: string;
  monto: { toNumber(): number };
  metodo: string;
  metodoPagoId: string | null;
  numeroOperacion: string | null;
  tasaCambio: { toNumber(): number } | null;
  montoBs: { toNumber(): number } | null;
  fechaPago: Date;
  fechaInicioCiclo: Date | null;
  fechaFinCiclo: Date | null;
  anuladoEn: Date | null;
  anuladoPorId: string | null;
  motivoAnulacion: string | null;
};

function mapear(pago: FilaPago): Pago {
  return {
    id: pago.id,
    miembroId: pago.miembroId,
    sucursalId: pago.sucursalId,
    turnoId: pago.turnoId,
    registradoPorId: pago.registradoPorId,
    monto: pago.monto.toNumber(),
    metodo: pago.metodo,
    metodoPagoId: pago.metodoPagoId,
    numeroOperacion: pago.numeroOperacion,
    tasaCambio: pago.tasaCambio ? pago.tasaCambio.toNumber() : null,
    montoBs: pago.montoBs ? pago.montoBs.toNumber() : null,
    fechaPago: pago.fechaPago,
    fechaInicioCiclo: pago.fechaInicioCiclo,
    fechaFinCiclo: pago.fechaFinCiclo,
    anuladoEn: pago.anuladoEn,
    anuladoPorId: pago.anuladoPorId,
    motivoAnulacion: pago.motivoAnulacion,
  };
}

export class PrismaPagoRepository implements IPagoRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async crear(datos: DatosNuevoPago): Promise<Pago> {
    const pago = await this.prisma.pago.create({
      data: {
        miembroId: datos.miembroId,
        sucursalId: datos.sucursalId,
        turnoId: datos.turnoId,
        registradoPorId: datos.registradoPorId,
        monto: datos.monto,
        metodo: datos.metodo,
        metodoPagoId: datos.metodoPagoId,
        numeroOperacion: datos.numeroOperacion,
        tasaCambio: datos.tasaCambio,
        montoBs: datos.montoBs,
        fechaInicioCiclo: datos.fechaInicioCiclo,
        fechaFinCiclo: datos.fechaFinCiclo,
      },
    });
    return mapear(pago);
  }

  async listarPorMiembro(miembroId: string): Promise<Pago[]> {
    const pagos = await this.prisma.pago.findMany({
      where: { miembroId },
      include: { registradoPor: { select: { nombre: true } } },
      orderBy: { fechaPago: "desc" },
    });
    return pagos.map((pago) => ({ ...mapear(pago), registradoPorNombre: pago.registradoPor.nombre }));
  }

  async listarPorOrganizacion(organizacionId: string): Promise<Pago[]> {
    const pagos = await this.prisma.pago.findMany({
      where: { miembro: { organizacionId } },
      include: { miembro: { select: { nombre: true } }, registradoPor: { select: { nombre: true } } },
      orderBy: { fechaPago: "desc" },
    });
    return pagos.map((pago) => ({
      ...mapear(pago),
      miembroNombre: pago.miembro.nombre,
      registradoPorNombre: pago.registradoPor.nombre,
    }));
  }

  async listarPorOrganizacionYRango(organizacionId: string, desde: Date, hasta: Date): Promise<Pago[]> {
    const pagos = await this.prisma.pago.findMany({
      where: { miembro: { organizacionId }, fechaPago: { gte: desde, lte: hasta } },
      include: { miembro: { select: { nombre: true, precioPlan: true } } },
      orderBy: { fechaPago: "asc" },
    });
    return pagos.map((pago) => ({
      ...mapear(pago),
      miembroNombre: pago.miembro.nombre,
      miembroPrecioPlan: pago.miembro.precioPlan.toNumber(),
    }));
  }

  async listarPorTurno(turnoId: string): Promise<Pago[]> {
    const pagos = await this.prisma.pago.findMany({
      where: { turnoId },
      include: { miembro: { select: { nombre: true } } },
      orderBy: { fechaPago: "asc" },
    });
    return pagos.map((pago) => ({ ...mapear(pago), miembroNombre: pago.miembro.nombre }));
  }

  async buscarPorId(organizacionId: string, id: string): Promise<Pago | null> {
    const pago = await this.prisma.pago.findFirst({
      where: { id, miembro: { organizacionId } },
      include: { miembro: { select: { nombre: true } } },
    });
    return pago ? { ...mapear(pago), miembroNombre: pago.miembro.nombre } : null;
  }

  async anular(organizacionId: string, id: string, anuladoPorId: string, motivo: string, anuladoEn: Date): Promise<Pago> {
    const existente = await this.prisma.pago.findFirst({ where: { id, miembro: { organizacionId } } });
    if (!existente) {
      throw new Error("No se encontró el pago.");
    }
    const pago = await this.prisma.pago.update({
      where: { id },
      data: { anuladoEn, anuladoPorId, motivoAnulacion: motivo },
    });
    return mapear(pago);
  }
}
```

(Only `listarPorMiembro` and `listarPorOrganizacion` gain the
`registradoPor` join — those are the two call sites the UI tasks below
actually use for the enriched history/ciclos views. `listarPorTurno`,
`listarPorOrganizacionYRango`, and `buscarPorId` are left as they were,
aside from `mapear` now also carrying the two ciclo fields
automatically since they're plain columns on every `Pago` row.)

- [ ] **Step 2: Build web-admin to confirm the repository compiles against the new required `DatosNuevoPago` fields**

```bash
npm run build --workspace apps/web-admin
```

Expected: exit code 0. If it fails on a caller of `pagos.crear(...)`
that doesn't yet pass `fechaInicioCiclo`/`fechaFinCiclo`, that means a
caller other than `RegistrarPago.ts` calls `crear` directly — search
for it:

```bash
grep -rn "pagos.crear(\|\.pagos\.crear(" apps/web-admin packages --include="*.ts" --include="*.tsx"
```

`RegistrarPago.ts` (updated in Task 7) should be the only call site. If
another one turns up, it needs the same two fields added inline.

- [ ] **Step 3: Verify against the real DB with a disposable script**

Create `packages/db/check-temp.ts`:

```ts
import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";
import path from "node:path";

config({ path: path.resolve(__dirname, "../../.env") });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const cualquierPago = await prisma.pago.findFirst({
    include: { registradoPor: { select: { nombre: true } } },
  });
  console.log("Pago de ejemplo:", cualquierPago);
  await prisma.$disconnect();
}

main();
```

Run from `packages/db/`: `npx tsx check-temp.ts`

Expected: prints an existing `Pago` row (or `null` if the DB has no
pagos yet) with `fechaInicioCiclo: null`, `fechaFinCiclo: null` (since
no pago has been registered through the updated code yet), and
`registradoPor: { nombre: '...' }` populated.

- [ ] **Step 4: Delete the disposable script**

```bash
rm packages/db/check-temp.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/infrastructure/persistence/prisma/PrismaPagoRepository.ts
git commit -m "feat: PrismaPagoRepository persiste el rango del ciclo y une registradoPorNombre"
```

---

### Task 9: End-to-end verification of a real payment cycle against the DB

**Files:**
- None (verification-only task; no files change).

**Interfaces:**
- Consumes: `registrarPago` (Task 7), `PrismaPagoRepository` (Task 8), existing `PrismaSuscripcionRepository`, `PrismaMemberRepository`, `PrismaPlanRepository`, `PrismaTurnoRepository`, `AuthorizationService`/`PrismaPermisoRepository` (all pre-existing, unchanged).
- Produces: confidence that Tasks 1, 7, and 8 work together correctly against real data before building UI on top of them. No new interface for later tasks.

- [ ] **Step 1: Find a real miembro, plan, and sucursal to test with**

Create `packages/db/check-temp.ts`:

```ts
import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";
import path from "node:path";

config({ path: path.resolve(__dirname, "../../.env") });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const miembro = await prisma.miembro.findFirst({ where: { activo: true, planId: { not: null } } });
  console.log("Miembro:", miembro?.id, miembro?.nombre, "planId:", miembro?.planId, "sucursalId:", miembro?.sucursalId, "fechaVencimiento:", miembro?.fechaVencimiento);
  const admin = await prisma.usuarioAdmin.findFirst({ where: { organizacionId: miembro?.organizacionId } });
  console.log("Admin:", admin?.id, admin?.nombre, "rol:", admin?.rol);
  await prisma.$disconnect();
}

main();
```

Run from `packages/db/`: `npx tsx check-temp.ts`

Note the printed `miembro.id`, `miembro.planId`, `miembro.sucursalId`,
`miembro.organizacionId`, and `admin.id` — Step 2 needs them. Do not
delete this script yet, edit it in place for Step 2.

- [ ] **Step 2: Call `registrarPago` directly and inspect the resulting `Pago` row**

Overwrite `packages/db/check-temp.ts`, substituting the IDs found in
Step 1 for `MIEMBRO_ID`, `PLAN_ID`, `SUCURSAL_ID`, `ORGANIZACION_ID`,
`ADMIN_ID`:

```ts
import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";
import path from "node:path";
import { registrarPago } from "../domain/use-cases/RegistrarPago";
import { PrismaPagoRepository } from "../infrastructure/persistence/prisma/PrismaPagoRepository";
import { PrismaSuscripcionRepository } from "../infrastructure/persistence/prisma/PrismaSuscripcionRepository";
import { PrismaMemberRepository } from "../infrastructure/persistence/prisma/PrismaMemberRepository";
import { PrismaPlanRepository } from "../infrastructure/persistence/prisma/PrismaPlanRepository";
import { PrismaTurnoRepository } from "../infrastructure/persistence/prisma/PrismaTurnoRepository";
import { PrismaPermisoRepository } from "../infrastructure/persistence/prisma/PrismaPermisoRepository";
import { AuthorizationService } from "../domain/services/AuthorizationService";

config({ path: path.resolve(__dirname, "../../.env") });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const MIEMBRO_ID = "REEMPLAZAR";
const PLAN_ID = "REEMPLAZAR";
const SUCURSAL_ID = "REEMPLAZAR";
const ORGANIZACION_ID = "REEMPLAZAR";
const ADMIN_ID = "REEMPLAZAR";

async function main() {
  const antes = await prisma.miembro.findUnique({ where: { id: MIEMBRO_ID } });
  console.log("fechaVencimiento ANTES:", antes?.fechaVencimiento);

  const pago = await registrarPago(
    {
      pagos: new PrismaPagoRepository(prisma),
      suscripciones: new PrismaSuscripcionRepository(prisma),
      miembros: new PrismaMemberRepository(prisma),
      planes: new PrismaPlanRepository(prisma),
      turnos: new PrismaTurnoRepository(prisma),
      autorizacion: new AuthorizationService(new PrismaPermisoRepository(prisma)),
    },
    {
      organizacionId: ORGANIZACION_ID,
      miembroId: MIEMBRO_ID,
      planId: PLAN_ID,
      monto: 1,
      metodo: "Efectivo (USD)",
      metodoPagoId: null,
      numeroOperacion: null,
      tasaCambio: null,
      sucursalId: SUCURSAL_ID,
      registradoPorId: ADMIN_ID,
      rolUsuario: "SOCIO",
    }
  );

  console.log("Pago creado:", {
    id: pago.id,
    monto: pago.monto,
    fechaInicioCiclo: pago.fechaInicioCiclo,
    fechaFinCiclo: pago.fechaFinCiclo,
  });

  const despues = await prisma.miembro.findUnique({ where: { id: MIEMBRO_ID } });
  console.log("fechaVencimiento DESPUÉS:", despues?.fechaVencimiento);

  await prisma.$disconnect();
}

main();
```

Run from `packages/db/`: `npx tsx check-temp.ts`

Expected:
- `pago.fechaInicioCiclo` equals `antes.fechaVencimiento` if it was in
  the future (renewal before expiry), or approximately "now" if
  `antes.fechaVencimiento` was in the past or null.
- `pago.fechaFinCiclo` equals `despues.fechaVencimiento` (the member's
  vencimiento after the payment) — confirming the ciclo's end date
  matches what the member record now shows.

This test data intentionally creates a real `$1` payment against a real
member — this is consistent with the project's established pattern of
running verification scripts against the live database, but flag it to
the user before running if that member is not a designated test
account, since it is not reversible without a manual cleanup.

- [ ] **Step 3: Delete the disposable script**

```bash
rm packages/db/check-temp.ts
```

- [ ] **Step 4: No commit for this task** — it produced no file changes, only confidence that Tasks 1/7/8 work end-to-end. Proceed to Task 10.

---

### Task 10: Enrich `/miembros/[id]/pagos` — Hora, Tasa, Registrado por, Ciclo columns

**Files:**
- Modify: `apps/web-admin/app/(panel)/miembros/[id]/pagos/page.tsx`

**Interfaces:**
- Consumes: `Pago` entity (Task 7/8) with `fechaInicioCiclo`, `fechaFinCiclo`, `registradoPorNombre`, `tasaCambio` (all already present on the objects `listarPagos` returns, per Task 8's `listarPorMiembro`).
- Produces: nothing consumed by later tasks — this page is a leaf.

- [ ] **Step 1: Rewrite the file**

Replace the full contents of `apps/web-admin/app/(panel)/miembros/[id]/pagos/page.tsx`:

```tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaMemberRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMemberRepository";
import { PrismaPagoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPagoRepository";
import { obtenerMiembro, MiembroNoEncontradoError } from "@gym-app/domain/use-cases/ObtenerMiembro";
import { listarPagos } from "@gym-app/domain/use-cases/ListarPagos";
import { Card } from "@gym-app/ui/components/Card";
import { PageHeader } from "@gym-app/ui/components/PageHeader";

function formatearFechaHora(fecha: Date): string {
  return new Date(fecha).toLocaleString("es-VE", { dateStyle: "short", timeStyle: "short" });
}

function formatearRangoCiclo(inicio: Date | null, fin: Date | null): string {
  if (!inicio || !fin) return "—";
  const opciones: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit" };
  return `${new Date(inicio).toLocaleDateString("es-VE", opciones)} → ${new Date(fin).toLocaleDateString("es-VE", opciones)}`;
}

export default async function PaginaHistorialPagos({ params }: { params: Promise<{ id: string }> }) {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const { id } = await params;

  const miembro = await obtenerMiembro(
    { miembros: new PrismaMemberRepository(prisma) },
    { organizacionId: usuario.organizacionId, id }
  ).catch((error) => {
    if (error instanceof MiembroNoEncontradoError) return null;
    throw error;
  });

  if (!miembro) notFound();

  const pagos = await listarPagos(
    { pagos: new PrismaPagoRepository(prisma), miembros: new PrismaMemberRepository(prisma) },
    { organizacionId: usuario.organizacionId, miembroId: id }
  );

  return (
    <div className="max-w-4xl p-6 lg:p-8">
      <Link
        href={`/miembros/${id}`}
        className="mb-4 inline-block text-sm font-medium hover:underline"
        style={{ color: "var(--gx-accent)" }}
      >
        ← Volver a {miembro.nombre}
      </Link>

      <div className="mb-6">
        <PageHeader>Historial de pagos</PageHeader>
      </div>

      <div className="hidden lg:block">
        <Card>
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b text-sm" style={{ borderColor: "var(--gx-edge)", color: "var(--gx-muted)" }}>
                <th className="py-2">Fecha y hora</th>
                <th className="py-2">Monto (USD)</th>
                <th className="py-2">Tasa aplicada</th>
                <th className="py-2">Método</th>
                <th className="py-2">Ciclo</th>
                <th className="py-2">Registrado por</th>
              </tr>
            </thead>
            <tbody>
              {pagos.map((pago) => (
                <tr key={pago.id} className="border-b" style={{ borderColor: "var(--gx-edge)" }}>
                  <td className="py-2" style={{ color: "var(--gx-ink)" }}>
                    {formatearFechaHora(pago.fechaPago)}
                  </td>
                  <td className="py-2" style={{ color: "var(--gx-ink)" }}>
                    ${pago.monto.toFixed(2)}
                  </td>
                  <td className="py-2" style={{ color: "var(--gx-ink)" }}>
                    {pago.tasaCambio !== null ? `Bs. ${pago.tasaCambio}` : "—"}
                  </td>
                  <td className="py-2" style={{ color: "var(--gx-ink)" }}>
                    {pago.metodo}
                  </td>
                  <td className="py-2" style={{ color: "var(--gx-ink)" }}>
                    {formatearRangoCiclo(pago.fechaInicioCiclo, pago.fechaFinCiclo)}
                  </td>
                  <td className="py-2" style={{ color: "var(--gx-ink)" }}>
                    {pago.registradoPorNombre ?? "—"}
                  </td>
                </tr>
              ))}

              {pagos.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center" style={{ color: "var(--gx-muted)" }}>
                    Todavía no hay pagos registrados para este miembro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>

      <div className="flex flex-col gap-3 lg:hidden">
        {pagos.map((pago) => (
          <Card key={pago.id} className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span style={{ color: "var(--gx-ink)" }}>{formatearFechaHora(pago.fechaPago)}</span>
              <p className="font-semibold" style={{ color: "var(--gx-accent)" }}>
                ${pago.monto.toFixed(2)}
              </p>
            </div>
            <div className="flex flex-col gap-0.5 text-sm" style={{ color: "var(--gx-muted)" }}>
              <span>{pago.metodo}</span>
              <span>Ciclo: {formatearRangoCiclo(pago.fechaInicioCiclo, pago.fechaFinCiclo)}</span>
              <span>Tasa: {pago.tasaCambio !== null ? `Bs. ${pago.tasaCambio}` : "—"}</span>
              <span>Registró: {pago.registradoPorNombre ?? "—"}</span>
            </div>
          </Card>
        ))}

        {pagos.length === 0 && (
          <Card>
            <p className="text-center" style={{ color: "var(--gx-muted)" }}>
              Todavía no hay pagos registrados para este miembro.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build web-admin**

```bash
npm run build --workspace apps/web-admin
```

Expected: exit code 0.

- [ ] **Step 3: Manual visual check**

Start the dev server (`npm run dev --workspace apps/web-admin`) and
open `/miembros/<algún-id-con-pagos>/pagos` in a browser. Confirm: pagos
registered before Task 7's deploy show "—" in the Ciclo column; a pago
registered via Task 9's test script shows a real date range.

- [ ] **Step 4: Commit**

```bash
git add "apps/web-admin/app/(panel)/miembros/[id]/pagos/page.tsx"
git commit -m "feat: el historial de pagos muestra tasa, quien registro y el ciclo"
```

---

### Task 11: "Última fecha de renovación" + "Ciclos" card in the member profile

**Files:**
- Modify: `apps/web-admin/app/(panel)/miembros/FormularioMiembro.tsx`
- Modify: `apps/web-admin/app/(panel)/miembros/[id]/page.tsx`

**Interfaces:**
- Consumes: `Pago` entity (Task 7/8) with `fechaInicioCiclo`, `fechaFinCiclo`; `Badge` component (`packages/ui/components/Badge.tsx`, existing, `tono: "verde" | "gris" | "ambar" | "rojo"`).
- Produces: `FormularioMiembro` gains two new required props — `miembroId: string | null` and `ultimosCiclos: { id: string; fechaInicioCiclo: Date | null; fechaFinCiclo: Date | null }[]` — this is the last task in the plan, nothing downstream consumes its output.

- [ ] **Step 1: Add the `miembroId` and `ultimosCiclos` props and their types to `FormularioMiembro`**

In `apps/web-admin/app/(panel)/miembros/FormularioMiembro.tsx`, add two
imports near the top (alongside the existing `Button`/`Input`/`Card`
imports):

```ts
import Link from "next/link";
import { Badge } from "@gym-app/ui/components/Badge";
```

Then update the component's props type. Find:

```ts
export function FormularioMiembro({
  accion,
  entrenadoresPorSucursal,
  sucursales,
  sucursalesOrganizacion,
  sucursalIdDefault,
  planes,
  metodosPago,
  valoresIniciales,
  panelLateral,
}: {
  accion: (estado: EstadoFormularioMiembro, formData: FormData) => Promise<EstadoFormularioMiembro>;
  // Entrenadores disponibles por cada sucursal visible — el elegible
  // depende de la sucursal seleccionada en el propio formulario, así que
  // se filtra en el cliente sin ida y vuelta al servidor.
  entrenadoresPorSucursal: Record<string, EntrenadorResumen[]>;
  sucursales: SucursalResumen[];
  // Ver SelectorMetodoPago — determinan el selector "Sede del pago" del
  // primer pago.
  sucursalesOrganizacion: SucursalResumen[];
  sucursalIdDefault: string | null;
  planes: Plan[];
  metodosPago: MetodoPago[];
  valoresIniciales?: ValoresFormularioMiembro;
  // Contenido propio de la pantalla de edición (dar de baja, historial de
  // pagos, registrar pago) — se muestra en el panel derecho cuando no hay
  // ticket de confirmación abierto, para no tener que scrollear.
  panelLateral?: React.ReactNode;
}) {
```

Replace with (adding `miembroId` and `ultimosCiclos` to both the
destructuring and the type):

```ts
export function FormularioMiembro({
  accion,
  entrenadoresPorSucursal,
  sucursales,
  sucursalesOrganizacion,
  sucursalIdDefault,
  planes,
  metodosPago,
  miembroId,
  ultimosCiclos,
  valoresIniciales,
  panelLateral,
}: {
  accion: (estado: EstadoFormularioMiembro, formData: FormData) => Promise<EstadoFormularioMiembro>;
  // Entrenadores disponibles por cada sucursal visible — el elegible
  // depende de la sucursal seleccionada en el propio formulario, así que
  // se filtra en el cliente sin ida y vuelta al servidor.
  entrenadoresPorSucursal: Record<string, EntrenadorResumen[]>;
  sucursales: SucursalResumen[];
  // Ver SelectorMetodoPago — determinan el selector "Sede del pago" del
  // primer pago.
  sucursalesOrganizacion: SucursalResumen[];
  sucursalIdDefault: string | null;
  planes: Plan[];
  metodosPago: MetodoPago[];
  // null solo en modo creación (no hay ficha de ciclos que enlazar
  // todavía). En modo edición siempre es el id real del miembro.
  miembroId: string | null;
  // Últimos 3-5 pagos del miembro que tienen datos de ciclo (pagos
  // previos a esta funcionalidad no tienen fechaInicioCiclo/
  // fechaFinCiclo y no aparecen aquí) — solo se usa en modo edición.
  ultimosCiclos: { id: string; fechaInicioCiclo: Date | null; fechaFinCiclo: Date | null }[];
  valoresIniciales?: ValoresFormularioMiembro;
  // Contenido propio de la pantalla de edición (dar de baja, historial de
  // pagos, registrar pago) — se muestra en el panel derecho cuando no hay
  // ticket de confirmación abierto, para no tener que scrollear.
  panelLateral?: React.ReactNode;
}) {
```

- [ ] **Step 2: Add a date formatter and derive the "última renovación" value**

Near the top of the file, alongside the existing `formatearFecha`
helper (which formats a `yyyy-mm-dd` string, not a `Date` — a different
helper is needed here since `fechaInicioCiclo` is a real `Date`), add:

```ts
function formatearFechaCorta(fecha: Date): string {
  return new Date(fecha).toLocaleDateString("es-VE", { day: "2-digit", month: "2-digit", year: "numeric" });
}
```

Then, inside the component body, right after the existing
`nombreMetodoPagoActual` line (currently `const nombreMetodoPagoActual
= seleccionMetodo.metodo || null;`), add:

```ts
  // El ciclo más reciente (por fechaFinCiclo) entre los que tienen datos
  // de ciclo — su fechaInicioCiclo es la "última fecha de renovación".
  const cicloMasReciente = ultimosCiclos.find((c) => c.fechaInicioCiclo && c.fechaFinCiclo) ?? null;
  const ultimaFechaRenovacion = cicloMasReciente?.fechaInicioCiclo ?? null;
```

- [ ] **Step 3: Add "Última fecha de renovación" to the read-only plan card**

Find this block (the read-only plan summary, currently rendered when
`esEdicion && !editandoPlan`):

```tsx
          {esEdicion && !editandoPlan && (
            <div className="rounded-lg border p-4" style={{ borderColor: "var(--gx-edge)" }}>
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium" style={{ color: "var(--gx-muted)" }}>
                  {nombrePlanActual}
                </span>
                <span className="text-2xl font-semibold" style={{ color: "var(--gx-ink)" }}>
                  ${precioActual}
                  {planSeleccionado && (
                    <span className="text-sm font-normal" style={{ color: "var(--gx-muted)" }}>
                      /{ETIQUETA_FRECUENCIA[planSeleccionado.frecuencia].toLowerCase()}
                    </span>
                  )}
                </span>
              </div>
              {requiereEntrenador && (
                <p className="mt-1 text-xs font-medium" style={{ color: "var(--gx-accent)" }}>
                  Entrenador: {nombreEntrenadorActual ?? "Sin asignar"}
                </p>
              )}
            </div>
          )}
```

Replace with (adding the renovación row):

```tsx
          {esEdicion && !editandoPlan && (
            <div className="rounded-lg border p-4" style={{ borderColor: "var(--gx-edge)" }}>
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium" style={{ color: "var(--gx-muted)" }}>
                  {nombrePlanActual}
                </span>
                <span className="text-2xl font-semibold" style={{ color: "var(--gx-ink)" }}>
                  ${precioActual}
                  {planSeleccionado && (
                    <span className="text-sm font-normal" style={{ color: "var(--gx-muted)" }}>
                      /{ETIQUETA_FRECUENCIA[planSeleccionado.frecuencia].toLowerCase()}
                    </span>
                  )}
                </span>
              </div>
              {requiereEntrenador && (
                <p className="mt-1 text-xs font-medium" style={{ color: "var(--gx-accent)" }}>
                  Entrenador: {nombreEntrenadorActual ?? "Sin asignar"}
                </p>
              )}
              <div className="mt-2 flex justify-between text-xs" style={{ color: "var(--gx-muted)" }}>
                <span>Última fecha de renovación</span>
                <span className="font-medium" style={{ color: "var(--gx-ink)" }}>
                  {ultimaFechaRenovacion ? formatearFechaCorta(ultimaFechaRenovacion) : "—"}
                </span>
              </div>
            </div>
          )}
```

- [ ] **Step 4: Add the "Ciclos" card**

Find the closing `</Card>` of the "Plan de membresía" card (the one
immediately followed by `<Button type="button" onClick=
{manejarClickGuardar} ...>Guardar</Button>` — search for
`Cancelar cambio de plan` to locate it, since that button is the last
thing rendered inside that card before its closing tag):

```tsx
          {esEdicion && editandoPlan && (
            <Button
              type="button"
              variant="secundario"
              className="mt-4"
              onClick={() => {
                // Revierte al plan original del miembro sin tocar el resto
                // del formulario (nombre, sede, etc. ya editados se conservan).
                if (planIdOriginal) manejarCambioPlan(planIdOriginal);
                setEditandoPlan(false);
              }}
            >
              Cancelar cambio de plan
            </Button>
          )}
        </Card>

        <Button type="button" onClick={manejarClickGuardar} disabled={enviando}>
          Guardar
        </Button>
      </form>
```

Replace with (inserting the new card between the "Plan de membresía"
card's closing `</Card>` and the "Guardar" button):

```tsx
          {esEdicion && editandoPlan && (
            <Button
              type="button"
              variant="secundario"
              className="mt-4"
              onClick={() => {
                // Revierte al plan original del miembro sin tocar el resto
                // del formulario (nombre, sede, etc. ya editados se conservan).
                if (planIdOriginal) manejarCambioPlan(planIdOriginal);
                setEditandoPlan(false);
              }}
            >
              Cancelar cambio de plan
            </Button>
          )}
        </Card>

        {esEdicion && ultimosCiclos.length > 0 && (
          <Card>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--gx-muted)" }}>
              Ciclos
            </h2>
            <div className="flex flex-col gap-2">
              {ultimosCiclos.map((ciclo, indice) => (
                <div
                  key={ciclo.id}
                  className="flex items-center justify-between rounded-lg border p-3 text-sm"
                  style={{ borderColor: "var(--gx-edge)" }}
                >
                  <span style={{ color: "var(--gx-ink)" }}>
                    {ciclo.fechaInicioCiclo && ciclo.fechaFinCiclo
                      ? `${formatearFechaCorta(ciclo.fechaInicioCiclo)} → ${formatearFechaCorta(ciclo.fechaFinCiclo)}`
                      : "—"}
                  </span>
                  <Badge tono={indice === 0 ? "verde" : "gris"}>{indice === 0 ? "VIGENTE" : "VENCIDO"}</Badge>
                </div>
              ))}
            </div>
            {miembroId && (
              <Link
                href={`/miembros/${miembroId}/pagos`}
                className="mt-3 inline-block text-sm font-medium hover:underline"
                style={{ color: "var(--gx-accent)" }}
              >
                Ver todos los ciclos
              </Link>
            )}
          </Card>
        )}

        <Button type="button" onClick={manejarClickGuardar} disabled={enviando}>
          Guardar
        </Button>
      </form>
```

Only the first item in `ultimosCiclos` (index 0) renders the green
"VIGENTE" badge — every other item renders gray "VENCIDO". This relies
on `ultimosCiclos` already being sorted most-recent-first, which Step 5
below guarantees by deriving it from `listarPagos`' existing
`fechaPago: "desc"` ordering.

- [ ] **Step 5: Pass `miembroId` and `ultimosCiclos` from `/miembros/[id]/page.tsx`**

In `apps/web-admin/app/(panel)/miembros/[id]/page.tsx`, the `pagos`
array is already fetched via `listarPagos`. Add a derived slice right
after it's fetched. Find:

```ts
  const [pagos, planes, sucursales, sucursalesOrganizacion, metodosPago] = await Promise.all([
    listarPagos(
      { pagos: new PrismaPagoRepository(prisma), miembros: new PrismaMemberRepository(prisma) },
      { organizacionId: usuario.organizacionId, miembroId: id }
    ),
    listarPlanes({ planes: new PrismaPlanRepository(prisma) }, usuario.organizacionId),
    obtenerSucursalesVisiblesParaMiembro(usuario),
    listarSucursales({ sucursales: new PrismaSucursalRepository(prisma) }, usuario.organizacionId),
    listarMetodosPagoActivos({ metodosPago: new PrismaMetodoPagoRepository(prisma) }, usuario.organizacionId),
  ]);
  const entrenadoresPorSucursal = await obtenerEntrenadoresPorSucursal(usuario.organizacionId, sucursales);

  const planesActivos = planes.filter((plan) => plan.activo);
```

Replace with:

```ts
  const [pagos, planes, sucursales, sucursalesOrganizacion, metodosPago] = await Promise.all([
    listarPagos(
      { pagos: new PrismaPagoRepository(prisma), miembros: new PrismaMemberRepository(prisma) },
      { organizacionId: usuario.organizacionId, miembroId: id }
    ),
    listarPlanes({ planes: new PrismaPlanRepository(prisma) }, usuario.organizacionId),
    obtenerSucursalesVisiblesParaMiembro(usuario),
    listarSucursales({ sucursales: new PrismaSucursalRepository(prisma) }, usuario.organizacionId),
    listarMetodosPagoActivos({ metodosPago: new PrismaMetodoPagoRepository(prisma) }, usuario.organizacionId),
  ]);
  const entrenadoresPorSucursal = await obtenerEntrenadoresPorSucursal(usuario.organizacionId, sucursales);

  const planesActivos = planes.filter((plan) => plan.activo);

  // Últimos 5 ciclos con datos de rango — listarPagos ya devuelve los
  // pagos ordenados por fechaPago desc (ver PrismaPagoRepository), así
  // que basta filtrar y tomar los primeros 5.
  const ultimosCiclos = pagos
    .filter((pago) => pago.fechaInicioCiclo !== null && pago.fechaFinCiclo !== null)
    .slice(0, 5)
    .map((pago) => ({ id: pago.id, fechaInicioCiclo: pago.fechaInicioCiclo, fechaFinCiclo: pago.fechaFinCiclo }));
```

- [ ] **Step 6: Pass the two new props to `<FormularioMiembro>`**

In the same file, find the `<FormularioMiembro ...>` call:

```tsx
      <FormularioMiembro
        accion={actualizarMiembroAction.bind(null, id)}
        entrenadoresPorSucursal={entrenadoresPorSucursal}
        planes={planes}
        sucursales={sucursales}
        sucursalesOrganizacion={sucursalesOrganizacion}
        sucursalIdDefault={usuario.sucursalId}
        metodosPago={metodosPago}
        valoresIniciales={{
```

Replace with:

```tsx
      <FormularioMiembro
        accion={actualizarMiembroAction.bind(null, id)}
        entrenadoresPorSucursal={entrenadoresPorSucursal}
        planes={planes}
        sucursales={sucursales}
        sucursalesOrganizacion={sucursalesOrganizacion}
        sucursalIdDefault={usuario.sucursalId}
        metodosPago={metodosPago}
        miembroId={id}
        ultimosCiclos={ultimosCiclos}
        valoresIniciales={{
```

- [ ] **Step 7: Fix the other call site — `/miembros/nuevo/page.tsx` (creation mode)**

`FormularioMiembro` is also rendered from the "new member" page without
`valoresIniciales` (creation mode). It now requires `miembroId` and
`ultimosCiclos` too (both required props per Step 1's type). Find that
file:

```bash
grep -n "FormularioMiembro" "apps/web-admin/app/(panel)/miembros/nuevo/page.tsx"
```

Read the file, find the `<FormularioMiembro ...>` call, and add
`miembroId={null}` and `ultimosCiclos={[]}` to its props (creation mode
has no member yet, so there's nothing to link to and no ciclos to
show — the component already guards both behind `esEdicion` and
`miembroId &&`, so passing empty/null values here is safe and renders
nothing extra).

- [ ] **Step 8: Build web-admin**

```bash
npm run build --workspace apps/web-admin
```

Expected: exit code 0. If it fails with a missing-prop error on
`/miembros/nuevo/page.tsx`, that confirms Step 7 was needed — re-check
that both new props were added there.

- [ ] **Step 9: Manual visual check**

Start the dev server and open `/miembros/<id>` for a member with at
least one payment registered via Task 9's script (or register a real
one through the UI). Confirm:
- "Plan de membresía" card shows "Última fecha de renovación" with a
  real date (not "—") when a ciclo exists.
- A new "Ciclos" card appears below "Plan de membresía" listing that
  ciclo's date range with a "VIGENTE" green badge.
- "Ver todos los ciclos" links to `/miembros/<id>/pagos` and that page
  still loads correctly (Task 10).
- Open `/miembros/nuevo` and confirm the creation form still renders
  with no console errors and no "Ciclos" card.

- [ ] **Step 10: Commit**

```bash
git add "apps/web-admin/app/(panel)/miembros/FormularioMiembro.tsx" "apps/web-admin/app/(panel)/miembros/[id]/page.tsx" "apps/web-admin/app/(panel)/miembros/nuevo/page.tsx"
git commit -m "feat: agrega la ultima fecha de renovacion y el bloque de Ciclos a la ficha del miembro"
```

---

## Final Verification

- [ ] **Step 1: Full production build of both apps**

```bash
npm run build --workspace apps/web-admin
npm run build --workspace apps/kiosk
```

Expected: both exit code 0.

- [ ] **Step 2: Confirm no disposable scripts were left behind**

```bash
git status --short packages/db/
```

Expected: no untracked `check-temp.ts` (or similarly named) file. If one
remains, delete it — it should never be committed.

- [ ] **Step 3: Final commit check**

```bash
git log --oneline -15
```

Expected: one commit per task above, in order, with no leftover
uncommitted changes (`git status --short` at the repo root should be
empty).
