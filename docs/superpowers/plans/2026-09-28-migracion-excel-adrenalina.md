# Migración DATA_ADRENALINA_.xlsm Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone, re-runnable Node/TS script that reads `docs/xls/DATA ADRENALINA_.xlsm`, applies configurable cleanup rules for messy PLAN/CEDULA values, and populates an isolated, disposable test `Organizacion` in the local dev database with `Miembro`/`Plan`/`Suscripcion`/`Pago` records — defaulting to a dry-run report, never writing without `--confirm`.

**Architecture:** A pure normalization/classification module (unit-tested with Vitest, following the `packages/domain` pattern) turns each raw Excel row into a typed, categorized result using two user-editable JSON config files. A thin CLI entrypoint (following the `packages/db/*.ts` script pattern: `PrismaPg` adapter + dotenv) reads the workbook, runs each row through the pure module, always prints/writes the categorized report, and only performs Prisma writes when `--confirm` is passed — one transaction per row, idempotent via `(organizacionId, cedula)` lookup.

**Tech Stack:** TypeScript, `tsx` (already a devDependency), `@prisma/client` + `@prisma/adapter-pg` (already used by every script in `packages/db`), `xlsx` (new dependency — SheetJS, handles `.xlsm`), Vitest (already used in `packages/domain`, added fresh to `packages/db` for this task).

**Spec:** `docs/superpowers/specs/2026-09-28-migracion-excel-adrenalina-design.md`

## Global Constraints

- Script lives flat in `packages/db/`, matching every existing script there (`limpiarMiembros.ts`, `sembrarMiembrosPrueba.ts`, etc.) — no `scripts/migracion-excel/` subfolder.
- Prisma access uses the established pattern: `new PrismaPg({ connectionString: process.env.DATABASE_URL })` + `new PrismaClient({ adapter })`, with `dotenv.config({ path: path.resolve(__dirname, "../../.env") })` at the top.
- Default run mode is dry-run (no `--confirm` flag): read Excel, classify all 1395 rows, print summary + write report JSON, write nothing to the database.
- `--confirm` is the only flag that enables writes.
- Target `Organizacion` is identified by a hardcoded fixed slug `"migracion-adrenalina-test"` — never configurable by flag in this phase, never the real Adrenalina organization.
- `Miembro.cedula` is `String` NOT NULL, `@@unique([organizacionId, cedula])` — every migrated row must resolve to a cedula value before insert.
- Cedula placeholder formula is exactly `PLACEHOLDER-<numeroFilaExcelOriginal>` (the real 1-indexed Excel row number, e.g. row 47 → `PLACEHOLDER-47`) — never UUID, never timestamp-based, so re-runs are idempotent.
- The 5 dominant PLAN values are exactly `[20, 8, 25, 30, 22]` (hardcoded list, not a computed threshold) — each auto-creates/reuses a `Plan` with `frecuencia: "MENSUAL"`, `diasCiclo: 30`, `precioUSD` equal to the value, `nombre: "Plan $<valor>"`.
- Every other PLAN value (17 rare numeric values + 9 text values + blanks) must resolve through `mapeo-plan.json`; an unresolved value is never migrated silently — it's excluded with motive `sin-mapeo-plan-definido`.
- One Prisma transaction per row (not one global transaction) — a failure on one row must not roll back or block previously committed rows.
- No test framework exists yet in `packages/db`; this plan adds `vitest` there for the first time, scoped to the pure normalization module only.

## Review Focus

- **Row with CEDULA holding a non-numeric placeholder-like value already** (e.g. `"E-3880506"`, `"S/C"`, `"G"`) — a reasonable person expects these treated as present-but-nonstandard cedulas (migrated as-is, not treated as empty and given a `PLACEHOLDER-N`), since the spec's "vacía" rule is about truly empty cells, not malformed-but-present ones. Task 2's classifier must distinguish "empty string/whitespace" from "non-empty non-numeric text."
- **PLAN value with trailing/leading whitespace or asterisk variants** (` 20*`, `20*`, `15*`) — a reasonable person expects `20*` and ` 20*` to classify identically (both go through `mapeo-plan.json`, not silently treated as clean `20`), since the analysis doc explicitly separates decorated values from clean numeric ones. Task 2's classifier must trim before comparing but never strip the asterisk before classification.
- **STATUS value that is exactly `"ACTIVO"` vs `" ACTIVO"` vs `" ACTIVA"`** — a reasonable person expects all three (plus the S/V variants) to normalize identically regardless of leading whitespace or the one gendered variant, per section 1.2 of the analysis. Task 2 must cover this in tests, not just the two "clean" spellings.
- **F/VENC stored as Excel date serial vs. `dd-mm-yyyy` text vs. malformed text** (`"19-082026"`, `"17-06-026"`) — a reasonable person expects all three input shapes handled, with only the truly malformed ones falling back to the placeholder date path, not every text-formatted date. Task 3 needs explicit tests for the serial path, the text path, and the two known malformed strings.
- **Re-running the script twice with `--confirm` against a database that already has some rows from the first run** — a reasonable person expects the second run to skip already-migrated rows cleanly (report shows `ya-existia`) and never throw a unique-constraint error or create duplicate `Plan`/`Miembro` rows. Task 7's integration verification must include an explicit second dry-then-confirm pass, not just a single run.
- **CELULAR column value, including the ~16 non-phone text rows** (`ESPAÑA`, `Nunca vino`, etc.) — a reasonable person expects this free-text field to migrate as-is into `Miembro.celular` (no special validation, since the schema field is free text), and expects it to actually be read from the source row rather than silently dropped. Task 2's `normalizarFila` must populate `celularOriginal` the same way it populates `cedulaOriginal`, and Task 3's `clasificarFila` must pass it through to `datos.celular` instead of hardcoding `null`.

---

## File Structure

- **Create `packages/db/migracion-excel/normalizarFila.ts`** — pure functions: parse/normalize a raw Excel row into typed intermediate values (status, cedula, plan, fechas). No I/O, no Prisma. This is the unit-tested core.
- **Create `packages/db/migracion-excel/normalizarFila.test.ts`** — Vitest tests for every branch called out in Review Focus plus the analysis doc's known edge cases.
- **Create `packages/db/migracion-excel/clasificarFila.ts`** — pure functions: given a normalized row + the two config objects (`mapeo-plan.json`, `reglas-cedula.json` contents, already parsed), produce a `FilaClasificada` result (one of: migrada-limpia, migrada-con-flag, fusionada, excluida) plus the exact `Miembro`/`Suscripcion`/`Pago` field values to write. No I/O.
- **Create `packages/db/migracion-excel/clasificarFila.test.ts`** — Vitest tests covering each classification category and the cedula-duplicate/merge logic.
- **Create `packages/db/migracion-excel/tipos.ts`** — shared TypeScript types/interfaces used across the above modules and the entrypoint (`FilaExcelCruda`, `FilaNormalizada`, `FilaClasificada`, `MapeoPlanEntry`, `ReglasCedula`, etc.).
- **Create `packages/db/migracion-excel/mapeo-plan.json`** — the editable config file, pre-populated by a generator step (Task 6) with all 17 rare numeric + 9 text + blank PLAN values, `accion: "pendiente"`.
- **Create `packages/db/migracion-excel/reglas-cedula.json`** — the editable config file, pre-populated by the same generator with the 7 real duplicate pairs and a suggested merge per pair.
- **Create `packages/db/migrarExcelAdrenalina.ts`** — the CLI entrypoint: reads the `.xlsm`, loads the two config files, calls `normalizarFila` + `clasificarFila` per row, prints the DATABASE_URL host/db, writes the report JSON, and — only with `--confirm` — performs the per-row Prisma transaction (org/sucursal bootstrap once, then per-row Miembro/Suscripcion/Pago).
- **Create `packages/db/limpiarMigracionExcelPrueba.ts`** — companion cleanup script: deletes the disposable `Organizacion` (slug `migracion-adrenalina-test`) and everything under it, following the same manual-cascade-order pattern as `limpiarMiembros.ts` (CheckIn → CambioPlanAuditoria → Pago → Suscripcion → Miembro → Plan → Sucursal → Organizacion).
- **Modify `packages/db/package.json`** — add `xlsx` dependency, add `vitest` devDependency, add scripts `db:migrar-excel-adrenalina`, `db:migrar-excel-adrenalina:confirm`, `db:limpiar-migracion-excel-prueba`, `test`.

---

## Task 1: Shared types and config file shapes

**Files:**
- Create: `packages/db/migracion-excel/tipos.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: all types below, imported by every later task.

- [ ] **Step 1: Write the types file**

```typescript
// packages/db/migracion-excel/tipos.ts

export interface FilaExcelCruda {
  numeroFila: number; // 1-indexed real row number in the .xlsm (4..1399)
  nombre: string;
  status: string;
  fNacimiento: string | number | null;
  celular: string | number | null;
  cedula: string | number | null;
  fVenc: string | number | null;
  fechaPago: string | number | null;
  plan: string | number | null;
}

export type EstadoSuscripcionNormalizado = "ACTIVA" | "VENCIDA" | null; // null = sin dato (2 filas)

export type ClasificacionPlan =
  | { tipo: "dominante"; valorUSD: number }
  | { tipo: "requiereMapeo"; valorOriginal: string };

export type ResultadoFecha =
  | { tipo: "valida"; fecha: Date }
  | { tipo: "invalida"; motivo: "vacia" | "malformada"; valorOriginal: string | number | null };

export interface FilaNormalizada {
  numeroFila: number;
  nombre: string;
  estado: EstadoSuscripcionNormalizado;
  cedulaOriginal: string | null; // trimmed, null only if truly empty
  celularOriginal: string | null; // trimmed, null only if truly empty — texto libre, incluye no-telefonos como "ESPAÑA"/"Nunca vino"
  plan: ClasificacionPlan;
  fVenc: ResultadoFecha;
  fechaPago:
    | { tipo: "fecha"; fecha: Date }
    | { tipo: "notaTexto"; texto: string }
    | { tipo: "vacia" };
}

export type AccionMapeoPlan = "mapear" | "excluir" | "pendiente";

export interface MapeoPlanEntry {
  valorExcel: string;
  accion: AccionMapeoPlan;
  planNombreDestino?: string;
  precioPlanOverrideUSD?: number;
  planLegacy?: boolean; // if true and accion=mapear, auto-created Plan gets activo:false
}

export interface ReglaCedulaDuplicado {
  cedula: string;
  filaA: number;
  filaB: number;
  fusionar: boolean;
  filaGanadora: number;
}

export interface ReglasCedula {
  vaciaAccion: "placeholder";
  duplicados: ReglaCedulaDuplicado[];
}

export type MotivoFlagRevision =
  | "cedula-placeholder"
  | "fecha-vencimiento-placeholder"
  | "plan-legacy"
  | "pago-aproximado";

export type MotivoExclusion =
  | "sin-mapeo-plan-definido"
  | "status-sin-dato"
  | "duplicado-pendiente-revision"
  | "error-parseo";

export interface DatosMiembroAMigrar {
  cedula: string;
  nombre: string;
  celular: string | null;
  precioPlanUSD: number;
  planNombre: string;
  planLegacy: boolean;
  estado: "ACTIVA" | "VENCIDA";
  fechaVencimiento: Date;
  fechaInicio: Date;
  pago:
    | { monto: number; metodo: string; fechaPago: Date }
    | null;
}

export type FilaClasificada =
  | { categoria: "migrada"; flags: MotivoFlagRevision[]; datos: DatosMiembroAMigrar; numeroFila: number; filaFusionadaDescartada?: number }
  | { categoria: "excluida"; motivo: MotivoExclusion; numeroFila: number; detalle?: string }
  | { categoria: "ya-existia"; numeroFila: number; cedula: string };
```

- [ ] **Step 2: Commit**

```bash
cd packages/db
git add migracion-excel/tipos.ts
git commit -m "feat(migracion-excel): agregar tipos compartidos del pipeline"
```

---

## Task 2: Row normalization — `normalizarFila`

**Files:**
- Create: `packages/db/migracion-excel/normalizarFila.ts`
- Test: `packages/db/migracion-excel/normalizarFila.test.ts`

**Interfaces:**
- Consumes: types from Task 1 (`FilaExcelCruda`, `FilaNormalizada`, `EstadoSuscripcionNormalizado`, `ClasificacionPlan`, `ResultadoFecha`).
- Produces: `normalizarFila(fila: FilaExcelCruda): FilaNormalizada`, plus exported helpers `normalizarStatus`, `clasificarValorPlan`, `parsearFechaExcel` (all consumed directly by `clasificarFila.ts` in Task 3 and by their own tests here).

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/db/migracion-excel/normalizarFila.test.ts
import { describe, expect, test } from "vitest";
import { normalizarStatus, clasificarValorPlan, parsearFechaExcel, normalizarFila } from "./normalizarFila";
import type { FilaExcelCruda } from "./tipos";

describe("normalizarStatus", () => {
  test("ACTIVO sin espacios → ACTIVA", () => {
    expect(normalizarStatus("ACTIVO")).toBe("ACTIVA");
  });
  test(" ACTIVO con espacio inicial → ACTIVA", () => {
    expect(normalizarStatus(" ACTIVO")).toBe("ACTIVA");
  });
  test(" ACTIVA variante femenina → ACTIVA", () => {
    expect(normalizarStatus(" ACTIVA")).toBe("ACTIVA");
  });
  test("S/V sin espacio → VENCIDA", () => {
    expect(normalizarStatus("S/V")).toBe("VENCIDA");
  });
  test(" S/V con espacio inicial → VENCIDA", () => {
    expect(normalizarStatus(" S/V")).toBe("VENCIDA");
  });
  test("vacío → null", () => {
    expect(normalizarStatus("")).toBe(null);
  });
  test("solo espacio → null", () => {
    expect(normalizarStatus(" ")).toBe(null);
  });
});

describe("clasificarValorPlan", () => {
  test("20 limpio → dominante valorUSD 20", () => {
    expect(clasificarValorPlan("20")).toEqual({ tipo: "dominante", valorUSD: 20 });
  });
  test("8 limpio → dominante valorUSD 8", () => {
    expect(clasificarValorPlan(8)).toEqual({ tipo: "dominante", valorUSD: 8 });
  });
  test("15 (no dominante) → requiereMapeo", () => {
    expect(clasificarValorPlan("15")).toEqual({ tipo: "requiereMapeo", valorOriginal: "15" });
  });
  test("20* con asterisco → requiereMapeo, nunca tratado como 20 limpio", () => {
    expect(clasificarValorPlan("20*")).toEqual({ tipo: "requiereMapeo", valorOriginal: "20*" });
  });
  test(" 20* con espacio y asterisco → requiereMapeo con valor trimmeado", () => {
    expect(clasificarValorPlan(" 20*")).toEqual({ tipo: "requiereMapeo", valorOriginal: "20*" });
  });
  test("Pend (texto) → requiereMapeo", () => {
    expect(clasificarValorPlan("Pend")).toEqual({ tipo: "requiereMapeo", valorOriginal: "Pend" });
  });
  test("blanco/null → requiereMapeo con valorOriginal vacío", () => {
    expect(clasificarValorPlan(null)).toEqual({ tipo: "requiereMapeo", valorOriginal: "" });
  });
  test("0 → requiereMapeo (no es uno de los 5 dominantes)", () => {
    expect(clasificarValorPlan(0)).toEqual({ tipo: "requiereMapeo", valorOriginal: "0" });
  });
});

describe("parsearFechaExcel", () => {
  test("serial de Excel (45658 = 2025-01-01) → fecha válida", () => {
    const resultado = parsearFechaExcel(45658);
    expect(resultado.tipo).toBe("valida");
    if (resultado.tipo === "valida") {
      expect(resultado.fecha.getUTCFullYear()).toBe(2025);
      expect(resultado.fecha.getUTCMonth()).toBe(0);
      expect(resultado.fecha.getUTCDate()).toBe(1);
    }
  });
  test("texto dd-mm-yyyy → fecha válida", () => {
    const resultado = parsearFechaExcel("24-07-2023");
    expect(resultado.tipo).toBe("valida");
    if (resultado.tipo === "valida") {
      expect(resultado.fecha.getUTCFullYear()).toBe(2023);
      expect(resultado.fecha.getUTCMonth()).toBe(6);
      expect(resultado.fecha.getUTCDate()).toBe(24);
    }
  });
  test("malformada 19-082026 (falta separador) → invalida malformada", () => {
    const resultado = parsearFechaExcel("19-082026");
    expect(resultado).toEqual({ tipo: "invalida", motivo: "malformada", valorOriginal: "19-082026" });
  });
  test("malformada 17-06-026 (falta dígito de año) → invalida malformada", () => {
    const resultado = parsearFechaExcel("17-06-026");
    expect(resultado).toEqual({ tipo: "invalida", motivo: "malformada", valorOriginal: "17-06-026" });
  });
  test("vacía/null → invalida vacia", () => {
    expect(parsearFechaExcel(null)).toEqual({ tipo: "invalida", motivo: "vacia", valorOriginal: null });
  });
  test("vacía string → invalida vacia", () => {
    expect(parsearFechaExcel("")).toEqual({ tipo: "invalida", motivo: "vacia", valorOriginal: "" });
  });
});

describe("normalizarFila — cedula", () => {
  function filaBase(overrides: Partial<FilaExcelCruda>): FilaExcelCruda {
    return {
      numeroFila: 100,
      nombre: "Alguien",
      status: "ACTIVO",
      fNacimiento: null,
      celular: null,
      cedula: "12345678",
      fVenc: 45658,
      fechaPago: null,
      plan: "20",
      ...overrides,
    };
  }

  test("celular presente (formato teléfono) → celularOriginal con el valor tal cual", () => {
    const resultado = normalizarFila(filaBase({ celular: "0412-1234567" }));
    expect(resultado.celularOriginal).toBe("0412-1234567");
  });

  test("celular presente con texto no-teléfono (ESPAÑA) → celularOriginal preservado tal cual", () => {
    const resultado = normalizarFila(filaBase({ celular: "ESPAÑA" }));
    expect(resultado.celularOriginal).toBe("ESPAÑA");
  });

  test("celular vacío (null) → celularOriginal null", () => {
    const resultado = normalizarFila(filaBase({ celular: null }));
    expect(resultado.celularOriginal).toBe(null);
  });

  test("celular vacío (string vacío) → celularOriginal null", () => {
    const resultado = normalizarFila(filaBase({ celular: "" }));
    expect(resultado.celularOriginal).toBe(null);
  });

  test("cedula numérica presente → cedulaOriginal con el valor tal cual (string)", () => {
    const resultado = normalizarFila(filaBase({ cedula: 12345678 }));
    expect(resultado.cedulaOriginal).toBe("12345678");
  });

  test("cedula vacía (null) → cedulaOriginal null", () => {
    const resultado = normalizarFila(filaBase({ cedula: null }));
    expect(resultado.cedulaOriginal).toBe(null);
  });

  test("cedula vacía (string vacío) → cedulaOriginal null", () => {
    const resultado = normalizarFila(filaBase({ cedula: "" }));
    expect(resultado.cedulaOriginal).toBe(null);
  });

  test("cedula no-numérica pero presente (E-3880506) → cedulaOriginal preservado, NO tratada como vacía", () => {
    const resultado = normalizarFila(filaBase({ cedula: "E-3880506" }));
    expect(resultado.cedulaOriginal).toBe("E-3880506");
  });

  test("cedula S/C (texto presente) → cedulaOriginal preservado, NO tratada como vacía", () => {
    const resultado = normalizarFila(filaBase({ cedula: "S/C" }));
    expect(resultado.cedulaOriginal).toBe("S/C");
  });

  test("cedula de un solo carácter G → cedulaOriginal preservado, NO tratada como vacía", () => {
    const resultado = normalizarFila(filaBase({ cedula: "G" }));
    expect(resultado.cedulaOriginal).toBe("G");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/db && npx vitest run migracion-excel/normalizarFila.test.ts`
Expected: FAIL with "Cannot find module './normalizarFila'"

- [ ] **Step 3: Write the implementation**

```typescript
// packages/db/migracion-excel/normalizarFila.ts
import type { ClasificacionPlan, EstadoSuscripcionNormalizado, FilaExcelCruda, FilaNormalizada, ResultadoFecha } from "./tipos";

const VALORES_PLAN_DOMINANTES = [20, 8, 25, 30, 22];

export function normalizarStatus(valor: string): EstadoSuscripcionNormalizado {
  const limpio = valor.trim().toUpperCase();
  if (limpio === "") return null;
  if (limpio === "ACTIVO" || limpio === "ACTIVA") return "ACTIVA";
  if (limpio === "S/V") return "VENCIDA";
  return null;
}

export function clasificarValorPlan(valor: string | number | null): ClasificacionPlan {
  if (valor === null) return { tipo: "requiereMapeo", valorOriginal: "" };

  const comoTexto = String(valor).trim();
  if (comoTexto === "") return { tipo: "requiereMapeo", valorOriginal: "" };

  // Solo un número puro (sin asterisco, sin +, sin letras) puede ser "dominante".
  const esNumeroPuro = /^-?\d+(\.\d+)?$/.test(comoTexto);
  if (esNumeroPuro) {
    const numero = Number(comoTexto);
    if (VALORES_PLAN_DOMINANTES.includes(numero)) {
      return { tipo: "dominante", valorUSD: numero };
    }
  }

  return { tipo: "requiereMapeo", valorOriginal: comoTexto };
}

function excelSerialADate(serial: number): Date {
  // Excel epoch: día 0 = 1899-12-30 (compensa el bug histórico del año bisiesto 1900).
  const epoch = Date.UTC(1899, 11, 30);
  return new Date(epoch + serial * 86400000);
}

export function parsearFechaExcel(valor: string | number | null): ResultadoFecha {
  if (valor === null) return { tipo: "invalida", motivo: "vacia", valorOriginal: null };

  if (typeof valor === "number") {
    return { tipo: "valida", fecha: excelSerialADate(valor) };
  }

  const texto = valor.trim();
  if (texto === "") return { tipo: "invalida", motivo: "vacia", valorOriginal: valor };

  const match = texto.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) return { tipo: "invalida", motivo: "malformada", valorOriginal: valor };

  const [, dia, mes, anio] = match;
  const fecha = new Date(Date.UTC(Number(anio), Number(mes) - 1, Number(dia)));
  return { tipo: "valida", fecha };
}

export function normalizarFila(fila: FilaExcelCruda): FilaNormalizada {
  const cedulaTexto = fila.cedula === null ? "" : String(fila.cedula).trim();
  const celularTexto = fila.celular === null ? "" : String(fila.celular).trim();

  let fechaPago: FilaNormalizada["fechaPago"];
  const fechaPagoParsed = parsearFechaExcel(fila.fechaPago);
  if (fechaPagoParsed.tipo === "valida") {
    fechaPago = { tipo: "fecha", fecha: fechaPagoParsed.fecha };
  } else if (fechaPagoParsed.motivo === "vacia") {
    fechaPago = { tipo: "vacia" };
  } else {
    // "malformada" en FECHA PAGO significa: no es fecha en absoluto → nota de texto operativa.
    fechaPago = { tipo: "notaTexto", texto: String(fila.fechaPago).trim() };
  }

  return {
    numeroFila: fila.numeroFila,
    nombre: fila.nombre.trim(),
    estado: normalizarStatus(fila.status),
    cedulaOriginal: cedulaTexto === "" ? null : cedulaTexto,
    celularOriginal: celularTexto === "" ? null : celularTexto,
    plan: clasificarValorPlan(fila.plan),
    fVenc: parsearFechaExcel(fila.fVenc),
    fechaPago,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/db && npx vitest run migracion-excel/normalizarFila.test.ts`
Expected: PASS, all tests green

- [ ] **Step 5: Commit**

```bash
git add packages/db/migracion-excel/normalizarFila.ts packages/db/migracion-excel/normalizarFila.test.ts
git commit -m "feat(migracion-excel): normalizar filas crudas del Excel (status, plan, fechas, cedula)"
```

---

## Task 3: Row classification — `clasificarFila`

**Files:**
- Create: `packages/db/migracion-excel/clasificarFila.ts`
- Test: `packages/db/migracion-excel/clasificarFila.test.ts`

**Interfaces:**
- Consumes: `FilaNormalizada` from Task 2's `normalizarFila`; `MapeoPlanEntry`, `ReglasCedula`, `FilaClasificada`, `DatosMiembroAMigrar` from Task 1.
- Produces: `clasificarFila(fila: FilaNormalizada, mapeoPlan: MapeoPlanEntry[], reglasCedula: ReglasCedula, numeroFilaPlaceholderFecha: () => Date): FilaClasificada`. The `numeroFilaPlaceholderFecha` callback is injected so tests control the placeholder date deterministically; the real entrypoint (Task 5) passes a fixed near-future date per spec section 6.

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/db/migracion-excel/clasificarFila.test.ts
import { describe, expect, test } from "vitest";
import { clasificarFila } from "./clasificarFila";
import type { FilaNormalizada, MapeoPlanEntry, ReglasCedula } from "./tipos";

const FECHA_PLACEHOLDER = new Date("2026-10-05T00:00:00.000Z");
const placeholderFecha = () => FECHA_PLACEHOLDER;

function filaNormalizadaBase(overrides: Partial<FilaNormalizada>): FilaNormalizada {
  return {
    numeroFila: 50,
    nombre: "Juan Perez",
    estado: "ACTIVA",
    cedulaOriginal: "12345678",
    celularOriginal: null,
    plan: { tipo: "dominante", valorUSD: 20 },
    fVenc: { tipo: "valida", fecha: new Date("2026-12-01T00:00:00.000Z") },
    fechaPago: { tipo: "vacia" },
    ...overrides,
  };
}

const mapeoVacio: MapeoPlanEntry[] = [];
const reglasCedulaVacias: ReglasCedula = { vaciaAccion: "placeholder", duplicados: [] };

describe("clasificarFila — caso limpio", () => {
  test("plan dominante + status con dato + fecha válida → migrada sin flags", () => {
    const resultado = clasificarFila(filaNormalizadaBase({}), mapeoVacio, reglasCedulaVacias, placeholderFecha);
    expect(resultado.categoria).toBe("migrada");
    if (resultado.categoria === "migrada") {
      expect(resultado.flags).toEqual([]);
      expect(resultado.datos.cedula).toBe("12345678");
      expect(resultado.datos.precioPlanUSD).toBe(20);
      expect(resultado.datos.estado).toBe("ACTIVA");
    }
  });

  test("celularOriginal presente se migra tal cual en datos.celular, sin lógica especial", () => {
    const resultado = clasificarFila(
      filaNormalizadaBase({ celularOriginal: "ESPAÑA" }),
      mapeoVacio,
      reglasCedulaVacias,
      placeholderFecha,
    );
    expect(resultado.categoria).toBe("migrada");
    if (resultado.categoria === "migrada") {
      expect(resultado.datos.celular).toBe("ESPAÑA");
    }
  });

  test("celularOriginal null se migra como celular null", () => {
    const resultado = clasificarFila(
      filaNormalizadaBase({ celularOriginal: null }),
      mapeoVacio,
      reglasCedulaVacias,
      placeholderFecha,
    );
    expect(resultado.categoria).toBe("migrada");
    if (resultado.categoria === "migrada") {
      expect(resultado.datos.celular).toBe(null);
    }
  });
});

describe("clasificarFila — status sin dato", () => {
  test("estado null → excluida status-sin-dato", () => {
    const resultado = clasificarFila(filaNormalizadaBase({ estado: null }), mapeoVacio, reglasCedulaVacias, placeholderFecha);
    expect(resultado).toEqual({ categoria: "excluida", motivo: "status-sin-dato", numeroFila: 50 });
  });
});

describe("clasificarFila — cedula vacía", () => {
  test("cedulaOriginal null → migrada con flag cedula-placeholder y cedula PLACEHOLDER-<numeroFila>", () => {
    const resultado = clasificarFila(filaNormalizadaBase({ cedulaOriginal: null, numeroFila: 47 }), mapeoVacio, reglasCedulaVacias, placeholderFecha);
    expect(resultado.categoria).toBe("migrada");
    if (resultado.categoria === "migrada") {
      expect(resultado.flags).toContain("cedula-placeholder");
      expect(resultado.datos.cedula).toBe("PLACEHOLDER-47");
    }
  });

  test("mismo numeroFila siempre genera el mismo placeholder (determinístico)", () => {
    const r1 = clasificarFila(filaNormalizadaBase({ cedulaOriginal: null, numeroFila: 47 }), mapeoVacio, reglasCedulaVacias, placeholderFecha);
    const r2 = clasificarFila(filaNormalizadaBase({ cedulaOriginal: null, numeroFila: 47 }), mapeoVacio, reglasCedulaVacias, placeholderFecha);
    expect(r1).toEqual(r2);
  });
});

describe("clasificarFila — plan sin mapeo", () => {
  test("plan requiereMapeo sin entrada en mapeoPlan → excluida sin-mapeo-plan-definido", () => {
    const fila = filaNormalizadaBase({ plan: { tipo: "requiereMapeo", valorOriginal: "TV" } });
    const resultado = clasificarFila(fila, mapeoVacio, reglasCedulaVacias, placeholderFecha);
    expect(resultado).toEqual({ categoria: "excluida", motivo: "sin-mapeo-plan-definido", numeroFila: 50, detalle: "TV" });
  });

  test("plan requiereMapeo con accion pendiente → excluida sin-mapeo-plan-definido", () => {
    const fila = filaNormalizadaBase({ plan: { tipo: "requiereMapeo", valorOriginal: "TV" } });
    const mapeo: MapeoPlanEntry[] = [{ valorExcel: "TV", accion: "pendiente" }];
    const resultado = clasificarFila(fila, mapeo, reglasCedulaVacias, placeholderFecha);
    expect(resultado).toEqual({ categoria: "excluida", motivo: "sin-mapeo-plan-definido", numeroFila: 50, detalle: "TV" });
  });

  test("plan requiereMapeo con accion excluir → excluida sin-mapeo-plan-definido", () => {
    const fila = filaNormalizadaBase({ plan: { tipo: "requiereMapeo", valorOriginal: "Pend" } });
    const mapeo: MapeoPlanEntry[] = [{ valorExcel: "Pend", accion: "excluir" }];
    const resultado = clasificarFila(fila, mapeo, reglasCedulaVacias, placeholderFecha);
    expect(resultado.categoria).toBe("excluida");
  });

  test("plan requiereMapeo con accion mapear → migrada con flag plan-legacy si corresponde", () => {
    const fila = filaNormalizadaBase({ plan: { tipo: "requiereMapeo", valorOriginal: "17.5" } });
    const mapeo: MapeoPlanEntry[] = [
      { valorExcel: "17.5", accion: "mapear", planNombreDestino: "Plan $20 (legacy)", precioPlanOverrideUSD: 17.5, planLegacy: true },
    ];
    const resultado = clasificarFila(fila, mapeo, reglasCedulaVacias, placeholderFecha);
    expect(resultado.categoria).toBe("migrada");
    if (resultado.categoria === "migrada") {
      expect(resultado.flags).toContain("plan-legacy");
      expect(resultado.datos.precioPlanUSD).toBe(17.5);
      expect(resultado.datos.planNombre).toBe("Plan $20 (legacy)");
      expect(resultado.datos.planLegacy).toBe(true);
    }
  });
});

describe("clasificarFila — fecha de vencimiento inválida", () => {
  test("fVenc invalida → migrada con flag fecha-vencimiento-placeholder y fecha inyectada", () => {
    const fila = filaNormalizadaBase({ fVenc: { tipo: "invalida", motivo: "malformada", valorOriginal: "19-082026" } });
    const resultado = clasificarFila(fila, mapeoVacio, reglasCedulaVacias, placeholderFecha);
    expect(resultado.categoria).toBe("migrada");
    if (resultado.categoria === "migrada") {
      expect(resultado.flags).toContain("fecha-vencimiento-placeholder");
      expect(resultado.datos.fechaVencimiento).toEqual(FECHA_PLACEHOLDER);
    }
  });
});

describe("clasificarFila — FECHA PAGO nota de texto", () => {
  test("fechaPago notaTexto → migrada con flag pago-aproximado y Pago monto 0", () => {
    const fila = filaNormalizadaBase({ fechaPago: { tipo: "notaTexto", texto: "Intercambio" } });
    const resultado = clasificarFila(fila, mapeoVacio, reglasCedulaVacias, placeholderFecha);
    expect(resultado.categoria).toBe("migrada");
    if (resultado.categoria === "migrada") {
      expect(resultado.flags).toContain("pago-aproximado");
      expect(resultado.datos.pago).toEqual({ monto: 0, metodo: "Intercambio", fechaPago: fila.fVenc.tipo === "valida" ? fila.fVenc.fecha : FECHA_PLACEHOLDER });
    }
  });

  test("fechaPago vacia → migrada sin Pago adicional", () => {
    const resultado = clasificarFila(filaNormalizadaBase({ fechaPago: { tipo: "vacia" } }), mapeoVacio, reglasCedulaVacias, placeholderFecha);
    expect(resultado.categoria).toBe("migrada");
    if (resultado.categoria === "migrada") {
      expect(resultado.datos.pago).toBe(null);
    }
  });
});

describe("clasificarFila — duplicados de cedula", () => {
  test("fila es la ganadora de un par fusionable → migrada, sin exclusión", () => {
    const reglas: ReglasCedula = {
      vaciaAccion: "placeholder",
      duplicados: [{ cedula: "22969126", filaA: 812, filaB: 951, fusionar: true, filaGanadora: 951 }],
    };
    const fila = filaNormalizadaBase({ numeroFila: 951, cedulaOriginal: "22969126" });
    const resultado = clasificarFila(fila, mapeoVacio, reglas, placeholderFecha);
    expect(resultado.categoria).toBe("migrada");
    if (resultado.categoria === "migrada") {
      expect(resultado.filaFusionadaDescartada).toBe(812);
    }
  });

  test("fila es la perdedora de un par fusionable → excluida duplicado-pendiente-revision", () => {
    const reglas: ReglasCedula = {
      vaciaAccion: "placeholder",
      duplicados: [{ cedula: "22969126", filaA: 812, filaB: 951, fusionar: true, filaGanadora: 951 }],
    };
    const fila = filaNormalizadaBase({ numeroFila: 812, cedulaOriginal: "22969126" });
    const resultado = clasificarFila(fila, mapeoVacio, reglas, placeholderFecha);
    expect(resultado).toEqual({ categoria: "excluida", motivo: "duplicado-pendiente-revision", numeroFila: 812, detalle: "22969126" });
  });

  test("par marcado fusionar:false → ambas filas excluidas", () => {
    const reglas: ReglasCedula = {
      vaciaAccion: "placeholder",
      duplicados: [{ cedula: "11111111", filaA: 100, filaB: 200, fusionar: false, filaGanadora: 200 }],
    };
    const filaA = filaNormalizadaBase({ numeroFila: 100, cedulaOriginal: "11111111" });
    const filaB = filaNormalizadaBase({ numeroFila: 200, cedulaOriginal: "11111111" });
    expect(clasificarFila(filaA, mapeoVacio, reglas, placeholderFecha).categoria).toBe("excluida");
    expect(clasificarFila(filaB, mapeoVacio, reglas, placeholderFecha).categoria).toBe("excluida");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/db && npx vitest run migracion-excel/clasificarFila.test.ts`
Expected: FAIL with "Cannot find module './clasificarFila'"

- [ ] **Step 3: Write the implementation**

```typescript
// packages/db/migracion-excel/clasificarFila.ts
import type {
  DatosMiembroAMigrar,
  FilaClasificada,
  FilaNormalizada,
  MapeoPlanEntry,
  MotivoFlagRevision,
  ReglasCedula,
} from "./tipos";

function diasCicloMensual(): number {
  return 30;
}

export function clasificarFila(
  fila: FilaNormalizada,
  mapeoPlan: MapeoPlanEntry[],
  reglasCedula: ReglasCedula,
  obtenerFechaPlaceholder: () => Date,
): FilaClasificada {
  if (fila.estado === null) {
    return { categoria: "excluida", motivo: "status-sin-dato", numeroFila: fila.numeroFila };
  }

  // Duplicados de cédula: resolver antes que cualquier otra cosa.
  if (fila.cedulaOriginal !== null) {
    const parDuplicado = reglasCedula.duplicados.find(
      (d) => d.filaA === fila.numeroFila || d.filaB === fila.numeroFila,
    );
    if (parDuplicado) {
      if (!parDuplicado.fusionar) {
        return {
          categoria: "excluida",
          motivo: "duplicado-pendiente-revision",
          numeroFila: fila.numeroFila,
          detalle: parDuplicado.cedula,
        };
      }
      if (parDuplicado.filaGanadora !== fila.numeroFila) {
        return {
          categoria: "excluida",
          motivo: "duplicado-pendiente-revision",
          numeroFila: fila.numeroFila,
          detalle: parDuplicado.cedula,
        };
      }
      // Es la fila ganadora: sigue el flujo normal, y al final se marca filaFusionadaDescartada.
    }
  }

  const flags: MotivoFlagRevision[] = [];

  // Cédula
  let cedula: string;
  if (fila.cedulaOriginal !== null) {
    cedula = fila.cedulaOriginal;
  } else {
    cedula = `PLACEHOLDER-${fila.numeroFila}`;
    flags.push("cedula-placeholder");
  }

  // Plan
  let precioPlanUSD: number;
  let planNombre: string;
  let planLegacy = false;

  if (fila.plan.tipo === "dominante") {
    precioPlanUSD = fila.plan.valorUSD;
    planNombre = `Plan $${fila.plan.valorUSD}`;
  } else {
    const entrada = mapeoPlan.find((m) => m.valorExcel === fila.plan.valorOriginal);
    if (!entrada || entrada.accion !== "mapear") {
      return {
        categoria: "excluida",
        motivo: "sin-mapeo-plan-definido",
        numeroFila: fila.numeroFila,
        detalle: fila.plan.valorOriginal,
      };
    }
    precioPlanUSD = entrada.precioPlanOverrideUSD ?? 0;
    planNombre = entrada.planNombreDestino ?? `Plan (mapeado desde "${fila.plan.valorOriginal}")`;
    planLegacy = entrada.planLegacy ?? false;
    if (planLegacy) flags.push("plan-legacy");
  }

  // Fecha de vencimiento
  let fechaVencimiento: Date;
  if (fila.fVenc.tipo === "valida") {
    fechaVencimiento = fila.fVenc.fecha;
  } else {
    fechaVencimiento = obtenerFechaPlaceholder();
    flags.push("fecha-vencimiento-placeholder");
  }

  const fechaInicio = new Date(fechaVencimiento);
  fechaInicio.setUTCDate(fechaInicio.getUTCDate() - diasCicloMensual());

  // Pago histórico opcional
  let pago: DatosMiembroAMigrar["pago"] = null;
  if (fila.fechaPago.tipo === "notaTexto") {
    pago = { monto: 0, metodo: fila.fechaPago.texto, fechaPago: fechaVencimiento };
    flags.push("pago-aproximado");
  }

  const datos: DatosMiembroAMigrar = {
    cedula,
    nombre: fila.nombre,
    celular: fila.celularOriginal,
    precioPlanUSD,
    planNombre,
    planLegacy,
    estado: fila.estado,
    fechaVencimiento,
    fechaInicio,
    pago,
  };

  const parDuplicado = fila.cedulaOriginal
    ? reglasCedula.duplicados.find((d) => d.filaGanadora === fila.numeroFila)
    : undefined;
  const filaFusionadaDescartada = parDuplicado
    ? (parDuplicado.filaA === fila.numeroFila ? parDuplicado.filaB : parDuplicado.filaA)
    : undefined;

  return {
    categoria: "migrada",
    flags,
    datos,
    numeroFila: fila.numeroFila,
    ...(filaFusionadaDescartada !== undefined ? { filaFusionadaDescartada } : {}),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/db && npx vitest run migracion-excel/clasificarFila.test.ts`
Expected: PASS, all tests green

- [ ] **Step 5: Commit**

```bash
git add packages/db/migracion-excel/clasificarFila.ts packages/db/migracion-excel/clasificarFila.test.ts
git commit -m "feat(migracion-excel): clasificar filas normalizadas contra mapeo de plan y reglas de cedula"
```

---

## Task 4: Vitest wiring for `packages/db`

**Files:**
- Modify: `packages/db/package.json`

**Interfaces:**
- Consumes: nothing new.
- Produces: `npm run test --workspace packages/db` runs the Task 2/3 test files.

- [ ] **Step 1: Add vitest devDependency and test script**

```json
{
  "name": "@gym-app/db",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "generate": "prisma generate",
    "migrate:dev": "prisma migrate dev",
    "db:seed": "prisma db seed",
    "db:limpiar-miembros": "tsx limpiarMiembros.ts",
    "db:sembrar-prueba": "tsx sembrarMiembrosPrueba.ts",
    "db:quitar-permisos-entrenadores": "tsx quitarPermisosEntrenadores.ts",
    "db:migrar-excel-adrenalina": "tsx migrarExcelAdrenalina.ts",
    "db:migrar-excel-adrenalina:confirm": "tsx migrarExcelAdrenalina.ts --confirm",
    "db:limpiar-migracion-excel-prueba": "tsx limpiarMigracionExcelPrueba.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "@prisma/client": "^7.10.0",
    "@prisma/adapter-pg": "^7.10.0",
    "xlsx": "^0.18.5"
  },
  "devDependencies": {
    "prisma": "^7.10.0",
    "dotenv": "^17.4.2",
    "tsx": "^4.23.13",
    "bcryptjs": "^3.0.3",
    "@types/bcryptjs": "^2.4.6",
    "vitest": "5.0.2"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `cd packages/db && npm install`
Expected: `xlsx` and `vitest` installed without errors

- [ ] **Step 3: Run the full test suite to confirm wiring**

Run: `cd packages/db && npm test`
Expected: PASS — all tests from Task 2 and Task 3 run and pass

- [ ] **Step 4: Commit**

```bash
git add packages/db/package.json packages/db/package-lock.json
git commit -m "chore(db): agregar xlsx y vitest para el script de migracion de Excel"
```

(If the monorepo uses a root lockfile instead of a per-package one, `git add` whichever lockfile actually changed — check with `git status` before committing.)

---

## Task 5: Config file generator + loader

**Files:**
- Create: `packages/db/migracion-excel/config.ts`
- Test: `packages/db/migracion-excel/config.test.ts`

**Interfaces:**
- Consumes: `MapeoPlanEntry`, `ReglasCedula` from Task 1; `FilaNormalizada` from Task 2.
- Produces: `generarTemplateMapeoPlan(filas: FilaNormalizada[]): MapeoPlanEntry[]`, `generarTemplateReglasCedula(filas: FilaNormalizada[]): ReglasCedula`, `cargarOCrearConfig<T>(rutaArchivo: string, generador: () => T): T` (used by the entrypoint in Task 6 to load-or-bootstrap both JSON files).

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/db/migracion-excel/config.test.ts
import { describe, expect, test } from "vitest";
import { generarTemplateMapeoPlan, generarTemplateReglasCedula } from "./config";
import type { FilaNormalizada } from "./tipos";

function fila(overrides: Partial<FilaNormalizada>): FilaNormalizada {
  return {
    numeroFila: 1,
    nombre: "X",
    estado: "ACTIVA",
    cedulaOriginal: "1",
    celularOriginal: null,
    plan: { tipo: "dominante", valorUSD: 20 },
    fVenc: { tipo: "valida", fecha: new Date() },
    fechaPago: { tipo: "vacia" },
    ...overrides,
  };
}

describe("generarTemplateMapeoPlan", () => {
  test("incluye cada valorOriginal requiereMapeo distinto, una sola vez, en pendiente", () => {
    const filas = [
      fila({ plan: { tipo: "requiereMapeo", valorOriginal: "TV" } }),
      fila({ plan: { tipo: "requiereMapeo", valorOriginal: "TV" } }), // repetido
      fila({ plan: { tipo: "requiereMapeo", valorOriginal: "Pend" } }),
      fila({ plan: { tipo: "dominante", valorUSD: 20 } }), // no debe aparecer
    ];
    const template = generarTemplateMapeoPlan(filas);
    expect(template).toHaveLength(2);
    expect(template.every((e) => e.accion === "pendiente")).toBe(true);
    expect(template.map((e) => e.valorExcel).sort()).toEqual(["Pend", "TV"]);
  });
});

describe("generarTemplateReglasCedula", () => {
  test("detecta pares con la misma cedulaOriginal y sugiere una filaGanadora", () => {
    const filas = [
      fila({ numeroFila: 10, cedulaOriginal: "999", nombre: "Vanessa Yajuris" }),
      fila({ numeroFila: 20, cedulaOriginal: "999", nombre: "Vannesa Yajunis" }),
      fila({ numeroFila: 30, cedulaOriginal: "888", nombre: "Otra Persona" }), // única, no es par
    ];
    const reglas = generarTemplateReglasCedula(filas);
    expect(reglas.vaciaAccion).toBe("placeholder");
    expect(reglas.duplicados).toHaveLength(1);
    expect(reglas.duplicados[0].cedula).toBe("999");
    expect([reglas.duplicados[0].filaA, reglas.duplicados[0].filaB].sort()).toEqual([10, 20]);
    expect([10, 20]).toContain(reglas.duplicados[0].filaGanadora);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/db && npx vitest run migracion-excel/config.test.ts`
Expected: FAIL with "Cannot find module './config'"

- [ ] **Step 3: Write the implementation**

```typescript
// packages/db/migracion-excel/config.ts
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { FilaNormalizada, MapeoPlanEntry, ReglasCedula } from "./tipos";

export function generarTemplateMapeoPlan(filas: FilaNormalizada[]): MapeoPlanEntry[] {
  const valoresVistos = new Set<string>();
  const entradas: MapeoPlanEntry[] = [];

  for (const fila of filas) {
    if (fila.plan.tipo !== "requiereMapeo") continue;
    if (valoresVistos.has(fila.plan.valorOriginal)) continue;
    valoresVistos.add(fila.plan.valorOriginal);
    entradas.push({ valorExcel: fila.plan.valorOriginal, accion: "pendiente" });
  }

  return entradas;
}

function similitudNombre(a: string, b: string): number {
  const normA = a.toLowerCase().replace(/[^a-záéíóúñ]/gi, "");
  const normB = b.toLowerCase().replace(/[^a-záéíóúñ]/gi, "");
  if (normA === normB) return 1;
  const largo = Math.max(normA.length, normB.length);
  if (largo === 0) return 0;
  let coincidencias = 0;
  for (let i = 0; i < Math.min(normA.length, normB.length); i++) {
    if (normA[i] === normB[i]) coincidencias++;
  }
  return coincidencias / largo;
}

export function generarTemplateReglasCedula(filas: FilaNormalizada[]): ReglasCedula {
  const porCedula = new Map<string, FilaNormalizada[]>();
  for (const fila of filas) {
    if (fila.cedulaOriginal === null) continue;
    const lista = porCedula.get(fila.cedulaOriginal) ?? [];
    lista.push(fila);
    porCedula.set(fila.cedulaOriginal, lista);
  }

  const duplicados: ReglasCedula["duplicados"] = [];
  for (const [cedula, lista] of porCedula) {
    if (lista.length !== 2) continue;
    const [a, b] = lista;
    const similitud = similitudNombre(a.nombre, b.nombre);
    const filaGanadora = a.nombre.length >= b.nombre.length ? a.numeroFila : b.numeroFila;
    duplicados.push({
      cedula,
      filaA: a.numeroFila,
      filaB: b.numeroFila,
      fusionar: similitud >= 0.6,
      filaGanadora,
    });
  }

  return { vaciaAccion: "placeholder", duplicados };
}

export function cargarOCrearConfig<T>(rutaArchivo: string, generador: () => T): T {
  if (existsSync(rutaArchivo)) {
    return JSON.parse(readFileSync(rutaArchivo, "utf-8")) as T;
  }
  const valor = generador();
  writeFileSync(rutaArchivo, JSON.stringify(valor, null, 2), "utf-8");
  return valor;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/db && npx vitest run migracion-excel/config.test.ts`
Expected: PASS, all tests green

- [ ] **Step 5: Commit**

```bash
git add packages/db/migracion-excel/config.ts packages/db/migracion-excel/config.test.ts
git commit -m "feat(migracion-excel): generar templates editables de mapeo de plan y reglas de cedula"
```

---

## Task 6: Excel reader

**Files:**
- Create: `packages/db/migracion-excel/leerExcel.ts`

**Interfaces:**
- Consumes: `FilaExcelCruda` from Task 1; `xlsx` package.
- Produces: `leerFilasExcel(rutaArchivo: string): FilaExcelCruda[]` — reads `Hoja1`, rows 4–1399, mapping columns A–H to the `FilaExcelCruda` fields, using the true spreadsheet row number (not array index) as `numeroFila`.

This task has no independent unit test (it's a thin I/O wrapper around `xlsx`) — it's verified end-to-end in Task 7's integration check against the real file. This matches the plan's approach of unit-testing pure logic (Tasks 2/3/5) and integration-verifying I/O (Task 7).

- [ ] **Step 1: Write the implementation**

```typescript
// packages/db/migracion-excel/leerExcel.ts
import { readFile, utils } from "xlsx";
import type { FilaExcelCruda } from "./tipos";

const PRIMERA_FILA_DATOS = 4; // fila 3 = encabezado
const ULTIMA_FILA_DATOS = 1399;

export function leerFilasExcel(rutaArchivo: string): FilaExcelCruda[] {
  const libro = readFile(rutaArchivo);
  const hoja = libro.Sheets["Hoja1"];
  if (!hoja) {
    throw new Error(`No se encontró "Hoja1" en ${rutaArchivo}`);
  }

  const filas: FilaExcelCruda[] = [];

  for (let numeroFila = PRIMERA_FILA_DATOS; numeroFila <= ULTIMA_FILA_DATOS; numeroFila++) {
    const celda = (columna: string) => hoja[`${columna}${numeroFila}`];
    const valorCelda = (columna: string): string | number | null => {
      const c = celda(columna);
      if (c === undefined) return null;
      return c.v ?? null;
    };

    const nombre = valorCelda("A");
    if (nombre === null || String(nombre).trim() === "") continue; // fila totalmente en blanco (ej. ~1090)

    filas.push({
      numeroFila,
      nombre: String(nombre),
      status: String(valorCelda("B") ?? ""),
      fNacimiento: valorCelda("C"),
      celular: valorCelda("D"),
      cedula: valorCelda("E"),
      fVenc: valorCelda("F"),
      fechaPago: valorCelda("G"),
      plan: valorCelda("H"),
    });
  }

  return filas;
}

export function utilsParaTest() {
  return utils;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/db/migracion-excel/leerExcel.ts
git commit -m "feat(migracion-excel): leer filas crudas del .xlsm preservando el numero de fila original"
```

---

## Task 7: CLI entrypoint — dry-run and `--confirm` execution

**Files:**
- Create: `packages/db/migrarExcelAdrenalina.ts`

**Interfaces:**
- Consumes: `leerFilasExcel` (Task 6), `normalizarFila` (Task 2), `clasificarFila` (Task 3), `cargarOCrearConfig` + generators (Task 5), all types (Task 1).
- Produces: the runnable script itself — no further tasks depend on its exports, only on its observable behavior (report file + console output + optional DB writes).

- [ ] **Step 1: Write the implementation**

```typescript
// packages/db/migrarExcelAdrenalina.ts
// Migra DATA_ADRENALINA_.xlsm hacia una Organizacion de prueba aislada y
// desechable (slug fijo "migracion-adrenalina-test"), nunca la organización
// real. Ver docs/superpowers/specs/2026-09-28-migracion-excel-adrenalina-design.md
//
// Uso (dry-run, no escribe nada):
//   npm run db:migrar-excel-adrenalina --workspace packages/db
// Uso (escribe en la base):
//   npm run db:migrar-excel-adrenalina:confirm --workspace packages/db
import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config as configDotenv } from "dotenv";
import path from "node:path";
import { writeFileSync } from "node:fs";
import { leerFilasExcel } from "./migracion-excel/leerExcel";
import { normalizarFila } from "./migracion-excel/normalizarFila";
import { clasificarFila } from "./migracion-excel/clasificarFila";
import { cargarOCrearConfig, generarTemplateMapeoPlan, generarTemplateReglasCedula } from "./migracion-excel/config";
import type { FilaClasificada } from "./migracion-excel/tipos";

configDotenv({ path: path.resolve(__dirname, "../../.env") });

const RUTA_EXCEL = path.resolve(__dirname, "../../docs/xls/DATA ADRENALINA_.xlsm");
const RUTA_MAPEO_PLAN = path.resolve(__dirname, "migracion-excel/mapeo-plan.json");
const RUTA_REGLAS_CEDULA = path.resolve(__dirname, "migracion-excel/reglas-cedula.json");

const SLUG_ORGANIZACION_PRUEBA = "migracion-adrenalina-test";
const NOMBRE_ORGANIZACION_PRUEBA = "Migración Adrenalina (prueba)";
const NOMBRE_SUCURSAL_PRUEBA = "Sucursal Principal";

// Fecha placeholder para F/VENC inválido/vacío — fija y fácilmente
// identificable como pendiente de revisión (sección 6 y 8.3 del diseño).
function obtenerFechaPlaceholder(): Date {
  return new Date("2026-10-05T00:00:00.000Z");
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

function ofuscarUrl(url: string | undefined): string {
  if (!url) return "(sin DATABASE_URL)";
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname}`;
  } catch {
    return "(url no parseable)";
  }
}

async function obtenerOCrearOrganizacionPrueba() {
  const existente = await prisma.organizacion.findUnique({ where: { slug: SLUG_ORGANIZACION_PRUEBA } });
  if (existente) return existente;
  return prisma.organizacion.create({
    data: { nombre: NOMBRE_ORGANIZACION_PRUEBA, slug: SLUG_ORGANIZACION_PRUEBA, plan: "basico" },
  });
}

async function obtenerOCrearSucursalPrueba(organizacionId: string) {
  const existente = await prisma.sucursal.findFirst({ where: { organizacionId, nombre: NOMBRE_SUCURSAL_PRUEBA } });
  if (existente) return existente;
  return prisma.sucursal.create({
    data: { organizacionId, nombre: NOMBRE_SUCURSAL_PRUEBA, activo: true },
  });
}

async function obtenerOCrearPlanParaFila(
  organizacionId: string,
  nombre: string,
  precioUSD: number,
  activo: boolean,
) {
  const existente = await prisma.plan.findFirst({ where: { organizacionId, nombre } });
  if (existente) return existente;
  return prisma.plan.create({
    data: {
      organizacionId,
      nombre,
      frecuencia: "MENSUAL",
      diasCiclo: 30,
      precioUSD,
      activo,
    },
  });
}

interface UsuarioAdminMinimo {
  id: string;
}

async function obtenerOCrearAdminPrueba(organizacionId: string): Promise<UsuarioAdminMinimo> {
  const existente = await prisma.usuarioAdmin.findFirst({ where: { organizacionId } });
  if (existente) return existente;
  return prisma.usuarioAdmin.create({
    data: {
      organizacionId,
      nombre: "Admin Migración",
      rol: "SOCIO",
      email: `admin-${SLUG_ORGANIZACION_PRUEBA}@migracion.local`,
      passwordHash: "no-usar-para-login",
    },
  });
}

async function migrarFilaConfirmada(
  fila: Extract<FilaClasificada, { categoria: "migrada" }>,
  organizacionId: string,
  sucursalId: string,
  adminId: string,
): Promise<{ escrita: boolean }> {
  const existente = await prisma.miembro.findUnique({
    where: { organizacionId_cedula: { organizacionId, cedula: fila.datos.cedula } },
  });
  if (existente) return { escrita: false };

  const plan = await obtenerOCrearPlanParaFila(
    organizacionId,
    fila.datos.planNombre,
    fila.datos.precioPlanUSD,
    !fila.datos.planLegacy,
  );

  await prisma.$transaction(async (tx) => {
    const miembro = await tx.miembro.create({
      data: {
        organizacionId,
        sucursalId,
        nombre: fila.datos.nombre,
        cedula: fila.datos.cedula,
        celular: fila.datos.celular,
        planId: plan.id,
        precioPlan: fila.datos.precioPlanUSD,
        fechaUltimoPago: fila.datos.pago ? fila.datos.pago.fechaPago : null,
        fechaVencimiento: fila.datos.fechaVencimiento,
        activo: true,
      },
    });

    await tx.suscripcion.create({
      data: {
        miembroId: miembro.id,
        planId: plan.id,
        inicio: fila.datos.fechaInicio,
        fin: fila.datos.fechaVencimiento,
        estado: fila.datos.estado,
      },
    });

    if (fila.datos.pago) {
      await tx.pago.create({
        data: {
          miembroId: miembro.id,
          sucursalId,
          registradoPorId: adminId,
          monto: fila.datos.pago.monto,
          metodo: fila.datos.pago.metodo,
          fechaPago: fila.datos.pago.fechaPago,
        },
      });
    }
  });

  return { escrita: true };
}

async function main() {
  const confirmar = process.argv.includes("--confirm");

  console.log(`Base de datos destino: ${ofuscarUrl(process.env.DATABASE_URL)}`);
  console.log(`Modo: ${confirmar ? "CONFIRM (va a escribir)" : "DRY-RUN (no escribe nada)"}`);

  const filasCrudas = leerFilasExcel(RUTA_EXCEL);
  console.log(`Filas leídas del Excel: ${filasCrudas.length}`);

  const filasNormalizadas = filasCrudas.map(normalizarFila);

  const mapeoPlan = cargarOCrearConfig(RUTA_MAPEO_PLAN, () => generarTemplateMapeoPlan(filasNormalizadas));
  const reglasCedula = cargarOCrearConfig(RUTA_REGLAS_CEDULA, () => generarTemplateReglasCedula(filasNormalizadas));

  const resultados = filasNormalizadas.map((fila) =>
    clasificarFila(fila, mapeoPlan, reglasCedula, obtenerFechaPlaceholder),
  );

  const conteos: Record<string, number> = {};
  for (const r of resultados) {
    const clave =
      r.categoria === "migrada"
        ? r.flags.length === 0
          ? "migrada-limpia"
          : `migrada-con-flag(${r.flags.join(",")})`
        : r.categoria === "excluida"
          ? `excluida(${r.motivo})`
          : "ya-existia";
    conteos[clave] = (conteos[clave] ?? 0) + 1;
  }

  console.log("Resumen de clasificación:");
  for (const [clave, cantidad] of Object.entries(conteos)) {
    console.log(`  ${clave}: ${cantidad}`);
  }

  const reporteInicial = { timestamp: new Date().toISOString(), modo: confirmar ? "confirm" : "dry-run", resultados };
  const rutaReporte = path.resolve(__dirname, `migracion-excel/reporte-migracion-${Date.now()}.json`);
  writeFileSync(rutaReporte, JSON.stringify(reporteInicial, null, 2), "utf-8");
  console.log(`Reporte escrito en: ${rutaReporte}`);

  if (!confirmar) {
    console.log("Dry-run completo. Corré con --confirm para escribir en la base.");
    return;
  }

  const organizacion = await obtenerOCrearOrganizacionPrueba();
  const sucursal = await obtenerOCrearSucursalPrueba(organizacion.id);
  const admin = await obtenerOCrearAdminPrueba(organizacion.id);

  let escritas = 0;
  let saltadas = 0;

  for (const resultado of resultados) {
    if (resultado.categoria !== "migrada") continue;
    try {
      const { escrita } = await migrarFilaConfirmada(resultado, organizacion.id, sucursal.id, admin.id);
      if (escrita) escritas++;
      else saltadas++;
    } catch (error) {
      console.error(`Fila ${resultado.numeroFila} falló al escribir:`, error);
    }
  }

  console.log(`Filas escritas: ${escritas}`);
  console.log(`Filas ya existentes (salteadas): ${saltadas}`);

  writeFileSync(
    rutaReporte,
    JSON.stringify({ ...reporteInicial, filasEscritas: escritas, filasSalteadas: saltadas }, null, 2),
    "utf-8",
  );
}

main()
  .catch((error) => {
    console.error("Error en la migración:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 2: Run a dry-run against the real file**

Run: `cd packages/db && npm run db:migrar-excel-adrenalina`
Expected: prints DB host, "DRY-RUN" mode, ~1395 rows read, a classification summary table, and writes a `reporte-migracion-<timestamp>.json` — no errors, no DB writes. The first run also creates `migracion-excel/mapeo-plan.json` and `migracion-excel/reglas-cedula.json` templates.

- [ ] **Step 3: Inspect the generated config templates**

Open `packages/db/migracion-excel/mapeo-plan.json` and `packages/db/migracion-excel/reglas-cedula.json`, confirm they contain the expected ~17+9 PLAN entries (all `"pendiente"`) and 7 cedula duplicate pairs with suggested merges — per the analysis doc's counts.

- [ ] **Step 4: Run with `--confirm` against the local dev database**

Run: `cd packages/db && npm run db:migrar-excel-adrenalina:confirm`
Expected: prints "CONFIRM" mode, creates the `migracion-adrenalina-test` Organizacion/Sucursal/Plan/Miembro/Suscripcion/Pago rows for every row classified `migrada` (rows still `pendiente`/undecided in the config files are excluded per the "never migrate silently" rule — this first confirm run will exclude most of the messy rows until the config is filled in, which is expected).

- [ ] **Step 5: Run `--confirm` a second time to verify idempotency**

Run: `cd packages/db && npm run db:migrar-excel-adrenalina:confirm`
Expected: report shows the previously-written rows now classified as skipped/`ya-existia` — no duplicate-key errors, no duplicate `Miembro`/`Plan` rows created. This directly verifies the Review Focus item on re-running `--confirm`.

- [ ] **Step 6: Commit**

```bash
git add packages/db/migrarExcelAdrenalina.ts packages/db/package.json
git add packages/db/migracion-excel/mapeo-plan.json packages/db/migracion-excel/reglas-cedula.json
git commit -m "feat(migracion-excel): entrypoint CLI con dry-run por defecto y escritura idempotente con --confirm"
```

(The generated `mapeo-plan.json`/`reglas-cedula.json` are committed as the starting templates the user and gym owner will edit — matching the spec's intent that they're user-editable files tracked alongside the script, not gitignored scratch output.)

---

## Task 8: Disposable organization cleanup script

**Files:**
- Create: `packages/db/limpiarMigracionExcelPrueba.ts`

**Interfaces:**
- Consumes: `PrismaClient` (same pattern as `limpiarMiembros.ts`); no exports consumed by other tasks.
- Produces: a runnable script deleting the `migracion-adrenalina-test` Organizacion and everything under it.

- [ ] **Step 1: Write the implementation**

```typescript
// packages/db/limpiarMigracionExcelPrueba.ts
// Borra COMPLETA la Organizacion de prueba desechable creada por
// migrarExcelAdrenalina.ts (slug "migracion-adrenalina-test") — miembros,
// pagos, suscripciones, planes, sucursales, usuarios admin y la propia
// organización. Nunca toca la organización real de Adrenalina.
//
// Uso: npm run db:limpiar-migracion-excel-prueba --workspace packages/db
import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";
import path from "node:path";

config({ path: path.resolve(__dirname, "../../.env") });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const SLUG_ORGANIZACION_PRUEBA = "migracion-adrenalina-test";

async function main() {
  const organizacion = await prisma.organizacion.findUnique({ where: { slug: SLUG_ORGANIZACION_PRUEBA } });
  if (!organizacion) {
    console.log(`No existe ninguna Organizacion con slug "${SLUG_ORGANIZACION_PRUEBA}" — nada que borrar.`);
    return;
  }

  const miembroIds = (await prisma.miembro.findMany({ where: { organizacionId: organizacion.id }, select: { id: true } })).map((m) => m.id);

  const checkIns = await prisma.checkIn.deleteMany({ where: { miembroId: { in: miembroIds } } });
  console.log(`🗑️  CheckIns borrados: ${checkIns.count}`);

  const auditorias = await prisma.cambioPlanAuditoria.deleteMany({ where: { organizacionId: organizacion.id } });
  console.log(`🗑️  Auditorías de cambio de plan borradas: ${auditorias.count}`);

  const pagos = await prisma.pago.deleteMany({ where: { miembroId: { in: miembroIds } } });
  console.log(`🗑️  Pagos borrados: ${pagos.count}`);

  const suscripciones = await prisma.suscripcion.deleteMany({ where: { miembroId: { in: miembroIds } } });
  console.log(`🗑️  Suscripciones borradas: ${suscripciones.count}`);

  const miembros = await prisma.miembro.deleteMany({ where: { organizacionId: organizacion.id } });
  console.log(`🗑️  Miembros borrados: ${miembros.count}`);

  const planes = await prisma.plan.deleteMany({ where: { organizacionId: organizacion.id } });
  console.log(`🗑️  Planes borrados: ${planes.count}`);

  const usuariosAdmin = await prisma.usuarioAdmin.deleteMany({ where: { organizacionId: organizacion.id } });
  console.log(`🗑️  Usuarios admin borrados: ${usuariosAdmin.count}`);

  const sucursales = await prisma.sucursal.deleteMany({ where: { organizacionId: organizacion.id } });
  console.log(`🗑️  Sucursales borradas: ${sucursales.count}`);

  await prisma.organizacion.delete({ where: { id: organizacion.id } });
  console.log(`✅ Organizacion de prueba "${SLUG_ORGANIZACION_PRUEBA}" borrada por completo.`);
}

main()
  .catch((error) => {
    console.error("❌ Error al limpiar la organización de prueba:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 2: Run it against the database populated by Task 7**

Run: `cd packages/db && npm run db:limpiar-migracion-excel-prueba`
Expected: prints counts for each deleted entity type and a final success message; confirm via `npm run db:migrar-excel-adrenalina` (dry-run) or a direct Prisma query that no `Miembro` with the test org's cedulas remains.

- [ ] **Step 3: Commit**

```bash
git add packages/db/limpiarMigracionExcelPrueba.ts
git commit -m "feat(migracion-excel): agregar script de limpieza para la organizacion de prueba desechable"
```

---

## Self-Review Notes

- **Spec coverage:** Section 1 (dry-run default, `--confirm` gate, DB URL echo) → Task 7. Section 2 (config file shapes) → Task 1 + Task 5. Section 3 (pipeline steps 1–9) → Tasks 2, 3, 6, 7. Section 4 (report/categories) → Task 3's `FilaClasificada` + Task 7's report writer. Section 5 (idempotency, per-row transaction, deterministic placeholder) → Task 3's cedula placeholder logic + Task 7's `findUnique` pre-check and per-row `$transaction`. Section 6 (placeholder date) → Task 7's `obtenerFechaPlaceholder`. Section 9 (disposable org, fixed slug, cascade cleanup) → Task 7's org/sucursal bootstrap + Task 8's cleanup script. Section 10 (pending business params) is explicitly not implementable — it's data the user fills into the generated JSON files, correctly left as manual follow-up, not a code task.
- **Placeholder scan:** no "TBD"/"similar to Task N" patterns; every step has literal code.
- **Type consistency:** `FilaClasificada`, `MotivoFlagRevision`, `MotivoExclusion`, `DatosMiembroAMigrar` defined once in Task 1 and used identically through Tasks 3, 5, 7. `clasificarFila`'s signature (fila, mapeoPlan, reglasCedula, obtenerFechaPlaceholder) matches between Task 3's implementation/tests and Task 7's call site.
- **Review Focus:** all six items have explicit tests — cedula non-empty-but-nonstandard (Task 2), PLAN asterisk/whitespace variants (Task 2), STATUS whitespace/gender variants (Task 2), F/VENC serial/text/malformed (Task 2), double-`--confirm` idempotency (Task 7 Step 5, integration-level since it needs a real database), and CELULAR passthrough including non-phone text values (Task 2 and Task 3 tests, added after this exact gap was caught in review — `celularOriginal` now flows from `normalizarFila` through `clasificarFila` into `datos.celular` instead of the earlier hardcoded `null`).
