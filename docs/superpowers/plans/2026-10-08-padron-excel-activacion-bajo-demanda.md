# Padrón Excel y activación bajo demanda — Plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para ejecutar este plan tarea por tarea. Los pasos usan casillas (`- [ ]`).

**Objetivo:** reemplazar la migración masiva del Excel por un padrón de referencia (`MiembroReferencia`) que se importa por CLI y desde el cual se activan miembros bajo demanda (kiosco y panel), con un solo aviso "Por regularizar" y un menú "Excel" para consultar y ajustar filas del padrón en tiempo real.

**Arquitectura:** el padrón es una tabla aparte, ligada a la Sede Principal, que espeja el Excel. Un único caso de uso de dominio (`activarMiembroPorCedula`) crea `Miembro` + `Suscripcion` (sin `Pago`) a partir del padrón; `registrarCheckIn` lo recibe como dependencia opcional y el panel lo invoca por una server action. El import (`importarPadronExcel.ts`) reutiliza `leerExcel`/`normalizarFila` y nunca toca `Miembro`.

**Stack:** TypeScript, Prisma 7 (`packages/db`), Vitest, Next.js App Router (`apps/web-admin`), `xlsx`.

**Spec:** `docs/superpowers/specs/2026-10-08-padron-excel-activacion-bajo-demanda-design.md` (aprobada).

## Restricciones globales

- **NUNCA** correr `prisma migrate dev`/`migrate deploy` contra la BD: el `.env` apunta a producción (`31.220.56.1/gym-pg`). Las migraciones se generan con `prisma migrate diff --script` (sin BD) y las aplica el contenedor al arrancar tras el deploy. Solo se usa `prisma generate` y `prisma validate` localmente.
- Commits (CLAUDE.md): en español, **una sola línea**, sin cuerpo, **sin firmas ni trailers** (`Co-Authored-By`, etc.). Tras cada tarea: commit y `git push origin main`.
- Respuestas y textos de UI en español. Mensajes de error de dominio en español.
- Reuso antes de crear: `leerExcel.ts`, `normalizarFila.ts` (`parsearFechaExcel`), `AuthorizationService`, `PrismaClientOrTx`, `conMensajeOk`, `useFeedback`.
- El padrón solo contiene filas con **cédula única y con al menos un dígito**; sin cédula (`""`, `S/C`, `G`) o repetida → excluida (todas las repetidas).
- Activación: **sin `Pago`**; el miembro queda con `porRegularizar = true`; solo si `sucursalId` del check-in/panel = `sucursalId` del padrón.
- Los 216 miembros ya migrados y sus fotos no se tocan.
- La normalización del padrón (plan, fechas) vive UNA sola vez en `packages/domain/utils/padronExcel.ts`; el importador y la edición manual la reutilizan.
- Edición del padrón: solo filas de quien NO es `Miembro` (si lo es, se bloquea y se manda a su ficha); la cédula no se edita; lo editado se registra en `camposEditados` y la reimportación lo respeta. Permisos: `MIEMBROS`/`VER` para ver, `MIEMBROS`/`EDITAR` para editar.
- Tests por workspace: `npm test --workspace packages/domain`, `npm test --workspace packages/db`. Typecheck de la app: `npx tsc --noEmit -p apps/web-admin/tsconfig.json`.

## Foco de revisión

- **Cédula alfanumérica (`E-3880506`)**: entra al padrón y se activa desde el panel; el kiosco (solo dígitos) nunca la encuentra. Cubierto en Tarea 2 (test de elegibilidad).
- **Cédula con espacios o escrita como número en el Excel**: se recorta y se compara como texto. Tarea 2.
- **Fecha de vencimiento mal escrita (`19-082026`)**: el crudo se guarda tal cual y la fecha normalizada queda `null` (el miembro se activa sin vencimiento). Tareas 2 y 4.
- **Dos check-ins simultáneos de la misma cédula nueva**: no debe fallar ni duplicar; el segundo devuelve el miembro creado. Tarea 5 (`activarMiembroEnTransaccion`).
- **Plan del Excel sin `Plan` en la organización (legacy `$15`)**: se activa sin `planId`/`Suscripcion`, con `precioPlan` del Excel. Tarea 4.
- **Reimportar el Excel tras editar filas a mano**: el valor editado se conserva, se recalculan las columnas normalizadas y el reporte lista el conflicto (Excel vs. editado); no cambia miembros ya activados. Tareas 2 y 3.
- **Editar una fila de quien ya es miembro**: se rechaza con mensaje en español que remite a la ficha, y la UI ni ofrece el botón. Tarea 8.
- **Editar una fecha con texto inválido (`mañana`, `31-02-2026`)**: se rechaza; con el campo vacío la fecha normalizada queda `null`. Tarea 8.

---

## Estructura de archivos

- **Modificar (renombrado)** `packages/db/prisma/schema.prisma`, entidades/casos de uso/repos/UI que usan `ajustarFecha` → `porRegularizar` (Tarea 1).
- **Crear** `packages/domain/utils/padronExcel.ts` (+ test) — normalización única de plan/fechas, compartida por importador y edición (Tarea 2).
- **Crear** `packages/db/migracion-excel/padron.ts` + `padron.test.ts` — elegibilidad de filas y reconciliación que respeta lo editado (Tarea 2).
- **Modificar** `packages/db/migracion-excel/leerExcel.ts` — leer hasta la última fila real de la hoja (hoy topa en 1399; el Excel nuevo llega a 1452) (Tarea 2).
- **Crear** `packages/db/importarPadronExcel.ts`; **modificar** `packages/db/package.json` y `schema.prisma` (modelo `MiembroReferencia`) (Tarea 3).
- **Crear** `packages/domain/entities/MiembroReferencia.ts`, `ports/IMiembroReferenciaRepository.ts`, `use-cases/ActivarMiembroDesdePadron.ts` (+ test); **crear** `packages/infrastructure/persistence/prisma/PrismaMiembroReferenciaRepository.ts`; **modificar** `entities/Miembro.ts` (Tarea 4).
- **Modificar** `packages/domain/use-cases/RegistrarCheckIn.ts` (+ test) y `apps/web-admin/app/api/checkin/route.ts`; **crear** `apps/web-admin/lib/activacion.ts` (Tarea 5).
- **Crear** `apps/web-admin/app/(panel)/miembros/ActivarDesdeExcel.tsx`; **modificar** `miembros/actions.ts`, `miembros/page.tsx` (Tarea 6).
- **Crear** `apps/web-admin/app/(panel)/excel/page.tsx`; **modificar** el puerto/repo (método `listar`), `(panel)/layout.tsx`, `NavegacionMobile.tsx`, `MasSheet.tsx` (Tarea 7).
- **Crear** `packages/domain/use-cases/EditarMiembroReferencia.ts` (+ test), `excel/actions.ts`, `excel/FilaPadronEditable.tsx`; **modificar** puerto/repo (`actualizarEdicion`) (Tarea 8).
- **Eliminar** el pipeline viejo y **actualizar** `CLAUDE.md` y `handoff.md` (Tarea 9).

---

## Tarea 1: Renombrar `ajustarFecha` → `porRegularizar`

**Archivos:**
- Modificar: `packages/db/prisma/schema.prisma` (modelo `Miembro`, ~línea 158)
- Crear: `packages/db/prisma/migrations/20261009000000_miembro_por_regularizar/migration.sql`
- Modificar (renombrado mecánico): `packages/domain/entities/Miembro.ts`, `entities/CheckIn.ts`, `use-cases/{ActualizarMiembro,ListarEnSala,RegistrarPago}.ts`, tests `{ActualizarMiembro,CobrarAbonoPendiente,ListarEnSala,RegistrarPagoRetroactivo}.test.ts`, `packages/infrastructure/persistence/prisma/{PrismaMemberRepository,PrismaCheckInRepository}.ts`, `packages/db/{marcarAjustarFecha,migrarExcelAdrenalina}.ts`, y en `apps/web-admin/app/(panel)/`: `caja/{ModalRegistrarPagoCaja,SelectorMiembroModal}.tsx`, `en-sala/{ContextoEnSala,ListaEnSala}.tsx`, `miembros/{FormularioMiembro,ListaMiembros}.tsx`, `miembros/[id]/page.tsx`, `pagos/actions.ts`, `ports/ISuscripcionRepository.ts` (solo comentario).

**Interfaces:**
- Produce: campo `porRegularizar: boolean` en `Miembro`, `CambiosMiembro`, `CheckIn`/`ListarEnSala` y en el modelo Prisma `Miembro`. Todas las tareas siguientes lo usan.

- [ ] **Paso 1: Verificar que no hay identificadores compuestos**

Run: `grep -rnE "ajustarFecha[A-Za-z]|[A-Za-z_]ajustarFecha" apps packages --include=*.ts --include=*.tsx -l | grep -v "generated\|node_modules\|\.next"`
Expected: sin salida (solo existe el identificador exacto `ajustarFecha`; `marcarAjustarFecha.ts` es nombre de archivo y no coincide por la `A` mayúscula inicial del patrón compuesto — si aparece algo más, ajustar el sed del paso 3).

- [ ] **Paso 2: Cambiar el schema y generar el SQL de migración sin tocar la BD**

En `schema.prisma`, reemplazar la línea de `ajustarFecha` por:
```prisma
  porRegularizar   Boolean       @default(false) // los datos de fecha/pago vienen de una fuente externa (Excel/padrón) sin verificar: el socio debe ajustar el vencimiento o registrar un pago (badge "Por regularizar"); se limpia al ajustar la fecha o al registrar un pago
```
Crear `packages/db/prisma/migrations/20261009000000_miembro_por_regularizar/migration.sql`:
```sql
-- Renombrado (conserva los datos): ajustarFecha -> porRegularizar
ALTER TABLE "Miembro" RENAME COLUMN "ajustarFecha" TO "porRegularizar";
```
Run (desde `packages/db`): `git show HEAD:packages/db/prisma/schema.prisma > "$TEMP/viejo.prisma" && npx prisma migrate diff --from-schema "$TEMP/viejo.prisma" --to-schema prisma/schema.prisma --script`
Expected: el diff propone `DROP COLUMN`/`ADD COLUMN` (Prisma no detecta renombrados); **por eso se usa el `RENAME COLUMN` escrito a mano**. Si el nombre de las flags falla, ver `npx prisma migrate diff --help`.

- [ ] **Paso 3: Renombrar en el código**

Run (desde la raíz):
```bash
FILES=$(grep -rlE "\bajustarFecha\b|Ajustar fecha o pago|Ajustar fecha\b" apps packages --include=*.ts --include=*.tsx | grep -v "generated\|node_modules\|\.next")
sed -i -E 's/\bajustarFecha\b/porRegularizar/g; s/Ajustar fecha o pago/Por regularizar/g' $FILES
npm run generate --workspace packages/db
```
Luego revisar a mano los textos que dicen solo "Ajustar fecha" (badge antiguo en comentarios) con `grep -rn "Ajustar fecha" apps packages --include=*.ts --include=*.tsx | grep -v "generated\|node_modules\|\.next"` y cambiarlos a "Por regularizar" donde sea texto de usuario. `marcarAjustarFecha.ts` y su script npm conservan su nombre.

- [ ] **Paso 4: Verificar**

Run: `npx tsc --noEmit -p apps/web-admin/tsconfig.json && npm test --workspace packages/domain && npm test --workspace packages/db`
Expected: sin errores de tipos; todos los tests pasan (los que comparaban el texto "Ajustar fecha o pago" ya fueron actualizados por el sed; si alguno falla por un mensaje, corregir la expectativa al nuevo texto).

- [ ] **Paso 5: Commit**

```bash
git add -A packages apps
git commit -m "renombra ajustarFecha a porRegularizar y el aviso a Por regularizar"
git push origin main
```

---

## Tarea 2: Normalización del padrón (dominio), lógica de import y lector sin tope de filas

**Archivos:**
- Crear: `packages/domain/utils/padronExcel.ts` y `padronExcel.test.ts` — normalización única (plan, fechas), usada por el importador **y** por la edición (Tarea 8)
- Crear: `packages/db/migracion-excel/padron.ts` y `padron.test.ts` — elegibilidad y reconciliación con lo ya cargado/editado
- Modificar: `packages/db/migracion-excel/leerExcel.ts`
- Modificar: `packages/db/package.json` (dependencia `"@gym-app/domain": "*"`; el symlink de workspace ya existe en `node_modules/@gym-app/domain`)

**Interfaces:**
- Produce en `@gym-app/domain/utils/padronExcel` (Tareas 3, 4 y 8):
  - `PLANES_PADRON: Record<number, string>`
  - `CAMPOS_EDITABLES_PADRON = ["nombre","status","fNacimiento","celular","fVenc","fechaPago","plan"] as const`, `type CampoEditablePadron`
  - `interface CamposCrudosPadron { nombre: string; status: string|null; fNacimiento: string|null; celular: string|null; fVenc: string|null; fechaPago: string|null; plan: string|null }`
  - `type CambiosCrudosPadron = { nombre?: string } & Partial<Record<Exclude<CampoEditablePadron,"nombre">, string|null>>`
  - `interface NormalizadosPadron { fechaVencimiento: Date|null; fechaUltimoPago: Date|null; fechaNacimiento: Date|null; planNombre: string|null; precioPlanUSD: number|null }`
  - `resolverPlanPadron(valor: string|number|null): { planNombre: string|null; precioPlanUSD: number|null }`
  - `fechaDesdeTextoPadron(texto: string|null): Date|null` (acepta `aaaa-mm-dd` y `dd-mm-aaaa` reales; todo lo demás → `null`)
  - `normalizarCamposPadron(c: CamposCrudosPadron): NormalizadosPadron`
- Produce en `packages/db/migracion-excel/padron.ts` (Tarea 3):
  - `DatosPadron = { cedula: string; numeroFila: number } & CamposCrudosPadron & NormalizadosPadron`
  - `ComparablesPadron = Pick<DatosPadron, "cedula" | CampoEditablePadron> & { camposEditados: string[] }`
  - `prepararPadron(filas: FilaExcelCruda[]): { elegibles: DatosPadron[]; excluidas: FilaExcluidaPadron[] }`
  - `reconciliarPadron(existentes: Map<string, ComparablesPadron>, nuevos: DatosPadron[]): { aEscribir: DatosPadron[]; altas: DatosPadron[]; cambios: CambioPadron[]; conflictos: ConflictoPadron[]; sinCambios: number }`

- [ ] **Paso 1: Tests del dominio que fallan** — `packages/domain/utils/padronExcel.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { fechaDesdeTextoPadron, normalizarCamposPadron, resolverPlanPadron } from "./padronExcel";

describe("resolverPlanPadron", () => {
  test("precio de un plan real → nombre y precio", () => {
    expect(resolverPlanPadron(30)).toEqual({ planNombre: "Mensual con entrenador", precioPlanUSD: 30 });
    expect(resolverPlanPadron("8")).toEqual({ planNombre: "Semanal", precioPlanUSD: 8 });
    expect(resolverPlanPadron(0)).toEqual({ planNombre: "Cortesia", precioPlanUSD: 0 });
  });
  test("variantes con asterisco o 25+5", () => {
    expect(resolverPlanPadron("20*")).toEqual({ planNombre: "Plan Viejo", precioPlanUSD: 20 });
    expect(resolverPlanPadron(" 20* ")).toEqual({ planNombre: "Plan Viejo", precioPlanUSD: 20 });
    expect(resolverPlanPadron("25+5")).toEqual({ planNombre: "Mensual con entrenador", precioPlanUSD: 30 });
  });
  test("precio legacy sin plan real: conserva el precio, sin nombre", () => {
    expect(resolverPlanPadron(15)).toEqual({ planNombre: null, precioPlanUSD: 15 });
    expect(resolverPlanPadron("15*")).toEqual({ planNombre: null, precioPlanUSD: 15 });
  });
  test("texto o vacío: sin plan ni precio", () => {
    expect(resolverPlanPadron("Pend")).toEqual({ planNombre: null, precioPlanUSD: null });
    expect(resolverPlanPadron("")).toEqual({ planNombre: null, precioPlanUSD: null });
    expect(resolverPlanPadron(null)).toEqual({ planNombre: null, precioPlanUSD: null });
  });
});

describe("fechaDesdeTextoPadron", () => {
  test("acepta aaaa-mm-dd y dd-mm-aaaa", () => {
    expect(fechaDesdeTextoPadron("2026-10-01")?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(fechaDesdeTextoPadron("01-10-2026")?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(fechaDesdeTextoPadron(" 2026-10-01 ")?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });
  test("vacío, null, texto, malformada o inexistente → null", () => {
    for (const valor of [null, "", "  ", "mañana", "19-082026", "17-06-026", "2026-02-30", "31-02-2026"]) {
      expect(fechaDesdeTextoPadron(valor)).toBeNull();
    }
  });
});

describe("normalizarCamposPadron", () => {
  test("calcula fechas y plan a partir de los crudos", () => {
    const n = normalizarCamposPadron({
      nombre: "Ana", status: "ACTIVO", fNacimiento: "1990-05-02", celular: null,
      fVenc: "2026-10-01", fechaPago: "efectivo", plan: "25",
    });
    expect(n.fechaVencimiento?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(n.fechaNacimiento?.toISOString()).toBe("1990-05-02T00:00:00.000Z");
    expect(n.fechaUltimoPago).toBeNull(); // nota de texto, no fecha
    expect(n.planNombre).toBe("Mensual sin entrenador");
    expect(n.precioPlanUSD).toBe(25);
  });
});
```
Run: `npm test --workspace packages/domain -- padronExcel` → FAIL (módulo inexistente).

- [ ] **Paso 2: Implementar `packages/domain/utils/padronExcel.ts`**
```ts
// Normalización del padrón de referencia (espejo del Excel). Lógica pura, única fuente de verdad:
// la usan el importador (packages/db) y la edición manual de filas (EditarMiembroReferencia).

// Nombres tal como aparecen en /planes de la organización (precio USD → nombre del Plan).
export const PLANES_PADRON: Record<number, string> = {
  0: "Cortesia",
  8: "Semanal",
  20: "Plan Viejo",
  22: "Corporativo",
  25: "Mensual sin entrenador",
  30: "Mensual con entrenador",
};

export const CAMPOS_EDITABLES_PADRON = ["nombre", "status", "fNacimiento", "celular", "fVenc", "fechaPago", "plan"] as const;
export type CampoEditablePadron = (typeof CAMPOS_EDITABLES_PADRON)[number];

export interface CamposCrudosPadron {
  nombre: string;
  status: string | null;
  fNacimiento: string | null;
  celular: string | null;
  fVenc: string | null;
  fechaPago: string | null;
  plan: string | null;
}

export type CambiosCrudosPadron = { nombre?: string } & Partial<Record<Exclude<CampoEditablePadron, "nombre">, string | null>>;

export interface NormalizadosPadron {
  fechaVencimiento: Date | null;
  fechaUltimoPago: Date | null;
  fechaNacimiento: Date | null;
  planNombre: string | null;
  precioPlanUSD: number | null;
}

export function resolverPlanPadron(valor: string | number | null): { planNombre: string | null; precioPlanUSD: number | null } {
  const texto = valor === null ? "" : String(valor).trim();
  const precio = texto === "25+5" ? 30 : /^\d+(\.\d+)?\*?$/.test(texto) ? Number(texto.replace("*", "")) : null;
  if (precio === null) return { planNombre: null, precioPlanUSD: null };
  return { planNombre: PLANES_PADRON[precio] ?? null, precioPlanUSD: precio };
}

function fechaReal(anio: number, mes: number, dia: number): Date | null {
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia ? fecha : null;
}

// aaaa-mm-dd o dd-mm-aaaa con día real; cualquier otra cosa (texto, mal escrita, vacía) → null.
export function fechaDesdeTextoPadron(texto: string | null): Date | null {
  const t = texto?.trim() ?? "";
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return fechaReal(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const dmy = t.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (dmy) return fechaReal(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));
  return null;
}

export function normalizarCamposPadron(c: CamposCrudosPadron): NormalizadosPadron {
  return {
    fechaVencimiento: fechaDesdeTextoPadron(c.fVenc),
    fechaUltimoPago: fechaDesdeTextoPadron(c.fechaPago),
    fechaNacimiento: fechaDesdeTextoPadron(c.fNacimiento),
    ...resolverPlanPadron(c.plan),
  };
}
```
Run: `npm test --workspace packages/domain -- padronExcel` → PASS.

- [ ] **Paso 3: Tests de `packages/db/migracion-excel/padron.test.ts` (fallan)**
```ts
import { describe, expect, test } from "vitest";
import { prepararPadron, reconciliarPadron, type ComparablesPadron, type DatosPadron } from "./padron";
import type { FilaExcelCruda } from "./tipos";

function fila(sobrescribir: Partial<FilaExcelCruda>): FilaExcelCruda {
  return {
    numeroFila: 4, nombre: "Ana Pérez", status: "ACTIVO", fNacimiento: null, celular: "0414-1112233",
    cedula: "12345678", fVenc: 46296, // serial de Excel = 2026-10-01
    fechaPago: null, plan: 30,
    ...sobrescribir,
  };
}

describe("prepararPadron", () => {
  test("fila normal: crudos como texto y fechas normalizadas (serial → ISO)", () => {
    const { elegibles, excluidas } = prepararPadron([fila({})]);
    expect(excluidas).toEqual([]);
    const [d] = elegibles;
    expect(d.cedula).toBe("12345678");
    expect(d.fVenc).toBe("2026-10-01");
    expect(d.fechaVencimiento?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(d.plan).toBe("30");
    expect(d.planNombre).toBe("Mensual con entrenador");
    expect(d.precioPlanUSD).toBe(30);
  });
  test("cédula escrita como número y con espacios se recorta", () => {
    const { elegibles } = prepararPadron([fila({ cedula: 12345678 }), fila({ numeroFila: 5, cedula: " 87654321 " })]);
    expect(elegibles.map((e) => e.cedula)).toEqual(["12345678", "87654321"]);
  });
  test("sin cédula: vacía, null o sin dígitos (S/C, G) se excluye", () => {
    const { elegibles, excluidas } = prepararPadron([
      fila({ numeroFila: 4, cedula: null }), fila({ numeroFila: 5, cedula: "   " }),
      fila({ numeroFila: 6, cedula: "S/C" }), fila({ numeroFila: 7, cedula: "G" }),
    ]);
    expect(elegibles).toEqual([]);
    expect(excluidas.map((e) => [e.numeroFila, e.motivo])).toEqual([[4, "sin-cedula"], [5, "sin-cedula"], [6, "sin-cedula"], [7, "sin-cedula"]]);
  });
  test("cédula repetida: se excluyen TODAS las filas con esa cédula", () => {
    const { elegibles, excluidas } = prepararPadron([
      fila({ numeroFila: 4, cedula: "111" }), fila({ numeroFila: 5, cedula: "222" }), fila({ numeroFila: 6, cedula: "111" }),
    ]);
    expect(elegibles.map((e) => e.cedula)).toEqual(["222"]);
    expect(excluidas.map((e) => [e.numeroFila, e.motivo, e.cedula])).toEqual([[4, "cedula-repetida", "111"], [6, "cedula-repetida", "111"]]);
  });
  test("cédula alfanumérica con dígitos entra", () => {
    expect(prepararPadron([fila({ cedula: "E-3880506" })]).elegibles[0].cedula).toBe("E-3880506");
  });
  test("fecha de vencimiento mal escrita: crudo intacto y fecha normalizada null", () => {
    const [d] = prepararPadron([fila({ fVenc: "19-082026" })]).elegibles;
    expect(d.fVenc).toBe("19-082026");
    expect(d.fechaVencimiento).toBeNull();
  });
  test("fecha de pago que es una nota de texto: no es fecha", () => {
    const [d] = prepararPadron([fila({ fechaPago: "efectivo" })]).elegibles;
    expect(d.fechaPago).toBe("efectivo");
    expect(d.fechaUltimoPago).toBeNull();
  });
});

describe("reconciliarPadron", () => {
  const base = prepararPadron([fila({})]).elegibles[0];
  const existente = (sobre: Partial<ComparablesPadron> = {}): ComparablesPadron => ({ ...base, camposEditados: [], ...sobre });

  test("cédula nueva = alta y se escribe", () => {
    const r = reconciliarPadron(new Map(), [base]);
    expect(r.altas).toEqual([base]);
    expect(r.aEscribir).toEqual([base]);
    expect(r.cambios).toEqual([]);
    expect(r.conflictos).toEqual([]);
  });
  test("sin diferencias = sin cambios (aunque cambie el número de fila), pero se refresca la fila", () => {
    const r = reconciliarPadron(new Map([[base.cedula, existente()]]), [{ ...base, numeroFila: 99 }]);
    expect(r.sinCambios).toBe(1);
    expect(r.cambios).toEqual([]);
    expect(r.aEscribir[0].numeroFila).toBe(99);
  });
  test("reporta campo, valor anterior y nuevo", () => {
    const r = reconciliarPadron(new Map([[base.cedula, existente({ fVenc: "2026-09-01", plan: "25" })]]), [base]);
    expect(r.cambios).toEqual([
      { cedula: base.cedula, nombre: base.nombre, campos: [
        { campo: "fVenc", antes: "2026-09-01", despues: "2026-10-01" },
        { campo: "plan", antes: "25", despues: "30" },
      ] },
    ]);
  });
  test("un campo editado a mano se respeta, se recalculan las normalizadas y se reporta el conflicto", () => {
    const editado = existente({ fVenc: "2026-12-01", camposEditados: ["fVenc"] });
    const r = reconciliarPadron(new Map([[base.cedula, editado]]), [base]); // el Excel sigue trayendo 2026-10-01
    expect(r.aEscribir[0].fVenc).toBe("2026-12-01");
    expect(r.aEscribir[0].fechaVencimiento?.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(r.conflictos).toEqual([{ cedula: base.cedula, nombre: base.nombre, campo: "fVenc", excel: "2026-10-01", padron: "2026-12-01" }]);
    expect(r.cambios).toEqual([]);
  });
  test("si el Excel ya coincide con lo editado no hay conflicto; los campos no editados sí se actualizan", () => {
    const editado = existente({ fVenc: "2026-10-01", plan: "25", camposEditados: ["fVenc"] });
    const r = reconciliarPadron(new Map([[base.cedula, editado]]), [base]);
    expect(r.conflictos).toEqual([]);
    expect(r.aEscribir[0].plan).toBe("30");
    expect(r.cambios[0].campos).toEqual([{ campo: "plan", antes: "25", despues: "30" }]);
  });
});
```
Run: `npm test --workspace packages/db -- padron` → FAIL (módulo inexistente).

- [ ] **Paso 4: Implementar `packages/db/migracion-excel/padron.ts`**
```ts
// packages/db/migracion-excel/padron.ts
// Elegibilidad de filas del Excel para el padrón y reconciliación con lo ya cargado/editado.
// La normalización (plan, fechas) vive en @gym-app/domain/utils/padronExcel. Sin I/O ni Prisma.
import {
  CAMPOS_EDITABLES_PADRON,
  normalizarCamposPadron,
  type CampoEditablePadron,
  type CamposCrudosPadron,
  type NormalizadosPadron,
} from "@gym-app/domain/utils/padronExcel";
import { parsearFechaExcel } from "./normalizarFila";
import type { FilaExcelCruda } from "./tipos";

export type DatosPadron = { cedula: string; numeroFila: number } & CamposCrudosPadron & NormalizadosPadron;
export type ComparablesPadron = Pick<DatosPadron, "cedula" | CampoEditablePadron> & { camposEditados: string[] };

export interface FilaExcluidaPadron {
  numeroFila: number;
  nombre: string;
  motivo: "sin-cedula" | "cedula-repetida";
  cedula: string | null;
}

export interface CambioPadron {
  cedula: string;
  nombre: string;
  campos: { campo: CampoEditablePadron; antes: string | null; despues: string | null }[];
}

// Un campo editado a mano cuyo valor difiere del que trae el Excel.
export interface ConflictoPadron {
  cedula: string;
  nombre: string;
  campo: CampoEditablePadron;
  excel: string | null;
  padron: string | null;
}

export interface ResultadoPadron {
  aEscribir: DatosPadron[]; // todo lo que se upsertea (altas + existentes con las ediciones ya aplicadas)
  altas: DatosPadron[];
  cambios: CambioPadron[];
  conflictos: ConflictoPadron[];
  sinCambios: number;
}

function textoCrudo(valor: string | number | null): string | null {
  if (valor === null) return null;
  const texto = String(valor).trim();
  return texto === "" ? null : texto;
}

// Fecha guardada como serial o dd-mm-aaaa válido → aaaa-mm-dd; cualquier otra cosa se deja tal cual.
function textoColumnaFecha(valor: string | number | null): string | null {
  const fecha = parsearFechaExcel(valor);
  return fecha.tipo === "valida" ? fecha.fecha.toISOString().slice(0, 10) : textoCrudo(valor);
}

export function prepararPadron(filas: FilaExcelCruda[]): { elegibles: DatosPadron[]; excluidas: FilaExcluidaPadron[] } {
  const excluidas: FilaExcluidaPadron[] = [];
  const conCedula: { fila: FilaExcelCruda; cedula: string }[] = [];

  for (const fila of filas) {
    const cedula = textoCrudo(fila.cedula);
    if (cedula === null || !/\d/.test(cedula)) {
      excluidas.push({ numeroFila: fila.numeroFila, nombre: fila.nombre.trim(), motivo: "sin-cedula", cedula });
      continue;
    }
    conCedula.push({ fila, cedula });
  }

  const apariciones = new Map<string, number>();
  for (const { cedula } of conCedula) apariciones.set(cedula, (apariciones.get(cedula) ?? 0) + 1);

  const elegibles: DatosPadron[] = [];
  for (const { fila, cedula } of conCedula) {
    if ((apariciones.get(cedula) ?? 0) > 1) {
      excluidas.push({ numeroFila: fila.numeroFila, nombre: fila.nombre.trim(), motivo: "cedula-repetida", cedula });
      continue;
    }
    const crudos: CamposCrudosPadron = {
      nombre: fila.nombre.trim(),
      status: textoCrudo(fila.status),
      fNacimiento: textoColumnaFecha(fila.fNacimiento),
      celular: textoCrudo(fila.celular),
      fVenc: textoColumnaFecha(fila.fVenc),
      fechaPago: textoColumnaFecha(fila.fechaPago),
      plan: textoCrudo(fila.plan),
    };
    elegibles.push({ cedula, numeroFila: fila.numeroFila, ...crudos, ...normalizarCamposPadron(crudos) });
  }

  excluidas.sort((a, b) => a.numeroFila - b.numeroFila);
  return { elegibles, excluidas };
}

export function reconciliarPadron(existentes: Map<string, ComparablesPadron>, nuevos: DatosPadron[]): ResultadoPadron {
  const resultado: ResultadoPadron = { aEscribir: [], altas: [], cambios: [], conflictos: [], sinCambios: 0 };

  for (const nuevo of nuevos) {
    const viejo = existentes.get(nuevo.cedula);
    if (!viejo) {
      resultado.altas.push(nuevo);
      resultado.aEscribir.push(nuevo);
      continue;
    }

    // Lo editado a mano se conserva; el resto se toma del Excel y las normalizadas se recalculan.
    const editados = CAMPOS_EDITABLES_PADRON.filter((campo) => viejo.camposEditados.includes(campo));
    let datos = nuevo;
    if (editados.length > 0) {
      const crudos: CamposCrudosPadron = { ...nuevo };
      for (const campo of editados) {
        if (nuevo[campo] !== viejo[campo]) {
          resultado.conflictos.push({ cedula: nuevo.cedula, nombre: viejo.nombre, campo, excel: nuevo[campo], padron: viejo[campo] });
        }
        (crudos as unknown as Record<string, string | null>)[campo] = viejo[campo];
      }
      datos = { ...nuevo, ...crudos, ...normalizarCamposPadron(crudos) };
    }

    const campos = CAMPOS_EDITABLES_PADRON.filter((campo) => viejo[campo] !== datos[campo]).map((campo) => ({
      campo,
      antes: viejo[campo],
      despues: datos[campo],
    }));
    if (campos.length === 0) resultado.sinCambios++;
    else resultado.cambios.push({ cedula: nuevo.cedula, nombre: datos.nombre, campos });
    resultado.aEscribir.push(datos);
  }

  return resultado;
}
```
Agregar `"@gym-app/domain": "*"` a `dependencies` de `packages/db/package.json`.
Run: `npm test --workspace packages/db -- padron` → PASS.

- [ ] **Paso 5: Quitar el tope de 1399 filas en `leerExcel.ts`**

Reemplazar las constantes y el inicio del bucle:
```ts
const PRIMERA_FILA_DATOS = 4; // fila 3 = encabezado

export function leerFilasExcel(rutaArchivo: string): FilaExcelCruda[] {
  const libro = readFile(rutaArchivo);
  const hoja = libro.Sheets["Hoja1"];
  if (!hoja) {
    throw new Error(`No se encontró "Hoja1" en ${rutaArchivo}`);
  }
  // Última fila real de la hoja (el Excel crece: _hoy.xlsm llega a la 1452).
  const ultimaFila = Number(String(hoja["!ref"]).split(":")[1].replace(/\D/g, ""));
```
y el `for` pasa a `numeroFila <= ultimaFila`; borrar `ULTIMA_FILA_DATOS`. El resto igual.

- [ ] **Paso 6: Verificar**

Run: `npm test --workspace packages/db && npm test --workspace packages/domain` → PASS (tests nuevos + existentes; `normalizarFila.test`/`clasificarFila.test` siguen hasta la Tarea 9).
Comprobar el lector con ambos archivos (desde `packages/db`):
```bash
cat > _chk.ts <<'EOF'
import { leerFilasExcel } from "./migracion-excel/leerExcel";
import { prepararPadron } from "./migracion-excel/padron";
for (const f of ["DATA ADRENALINA_.xlsm", "DATA ADRENALINA_hoy.xlsm"]) {
  const filas = leerFilasExcel(`../../docs/xls/${f}`);
  const { elegibles, excluidas } = prepararPadron(filas);
  console.log(f, "filas", filas.length, "elegibles", elegibles.length, "excluidas", excluidas.length);
}
EOF
npx tsx _chk.ts; rm _chk.ts
```
Expected: `filas 1395` y `filas 1428`; las excluidas rondan 32 + las repetidas (~39). Anotar los números reales para la Tarea 3.

- [ ] **Paso 7: Commit**

```bash
git add packages/domain/utils/padronExcel.ts packages/domain/utils/padronExcel.test.ts packages/db/migracion-excel/padron.ts packages/db/migracion-excel/padron.test.ts packages/db/migracion-excel/leerExcel.ts packages/db/package.json
git commit -m "agrega la normalización del padrón en el dominio y la reconciliación que respeta las ediciones"
git push origin main
```
---

## Tarea 3: Modelo `MiembroReferencia` e importador CLI

**Archivos:**
- Modificar: `packages/db/prisma/schema.prisma` (modelo nuevo + relaciones inversas en `Organizacion` y `Sucursal`)
- Crear: `packages/db/prisma/migrations/20261009100000_miembro_referencia/migration.sql`
- Crear: `packages/db/importarPadronExcel.ts`
- Modificar: `packages/db/package.json`

**Interfaces:**
- Consume: `leerFilasExcel`, `prepararPadron`, `reconciliarPadron`, `DatosPadron`, `ComparablesPadron` (Tarea 2).
- Produce: tabla `MiembroReferencia` (modelo Prisma `miembroReferencia`) usada por las Tareas 4 y 7.

- [ ] **Paso 1: Agregar el modelo al schema**

Al final del bloque de modelos de `schema.prisma`:
```prisma
// Padrón de referencia: espejo del Excel (solo filas con cédula única). NO son miembros del sistema;
// se activan bajo demanda (ver ActivarMiembroDesdePadron). Ligado a la sede que usa ese Excel.
model MiembroReferencia {
  id               String       @id @default(cuid())
  organizacionId   String
  organizacion     Organizacion @relation(fields: [organizacionId], references: [id])
  sucursalId       String
  sucursal         Sucursal     @relation(fields: [sucursalId], references: [id])
  cedula           String
  numeroFila       Int
  // Columnas crudas del Excel, como texto (fechas serial → yyyy-mm-dd)
  nombre           String
  status           String?
  fNacimiento      String?
  celular          String?
  fVenc            String?
  fechaPago        String?
  plan             String?
  // Normalizadas (null = sin dato confiable)
  fechaVencimiento DateTime?
  fechaUltimoPago  DateTime?
  fechaNacimiento  DateTime?
  planNombre       String?
  precioPlanUSD    Decimal?     @db.Decimal(10, 2)
  archivoOrigen    String
  importadoAt      DateTime     @default(now())
  // Ediciones manuales desde el menú Excel: columnas crudas tocadas, cuándo y quién. Vacío = tal cual el Excel.
  camposEditados   String[]     @default([])
  editadoAt        DateTime?
  editadoPor       String?

  @@unique([organizacionId, cedula])
  @@index([sucursalId])
}
```
Agregar `miembrosReferencia MiembroReferencia[]` a los modelos `Organizacion` y `Sucursal` (junto a sus otras relaciones).

- [ ] **Paso 2: Generar la migración sin tocar la BD y el cliente**

Run (desde `packages/db`):
```bash
git show HEAD:packages/db/prisma/schema.prisma > "$TEMP/viejo.prisma"
npx prisma validate
npx prisma migrate diff --from-schema "$TEMP/viejo.prisma" --to-schema prisma/schema.prisma --script
```
Copiar el SQL emitido (un `CREATE TABLE "MiembroReferencia"`, un `CREATE UNIQUE INDEX "MiembroReferencia_organizacionId_cedula_key"`, un `CREATE INDEX`, y dos `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY`) a `migrations/20261009100000_miembro_referencia/migration.sql`. **Nota:** el diff se hace contra `HEAD`, que ya incluye el renombrado de la Tarea 1 commiteado, así que no debe aparecer ninguna sentencia sobre `Miembro`; si aparece, revisar.
Luego: `npm run generate --workspace packages/db`.

- [ ] **Paso 3: Escribir el importador**

`packages/db/importarPadronExcel.ts`:
```ts
// packages/db/importarPadronExcel.ts
// Importa un Excel de Adrenalina al padrón de referencia (MiembroReferencia). NO crea ni modifica
// Miembro/Plan/Suscripcion/Pago. Dry-run por defecto; --confirm escribe (upsert por org+cédula).
//
//   npm run db:importar-padron --workspace packages/db -- --org=<slug> --sucursal="<nombre>" [--archivo=<ruta>]
//   npm run db:importar-padron:confirm --workspace packages/db -- --org=<slug> --sucursal="<nombre>"
import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config as configDotenv } from "dotenv";
import path from "node:path";
import { writeFileSync } from "node:fs";
import { leerFilasExcel } from "./migracion-excel/leerExcel";
import { prepararPadron, reconciliarPadron, type ComparablesPadron } from "./migracion-excel/padron";

configDotenv({ path: path.resolve(__dirname, "../../.env") });

const ARCHIVO_POR_DEFECTO = path.resolve(__dirname, "../../docs/xls/DATA ADRENALINA_hoy.xlsm");
const LOTE = 20;

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

function argumento(nombre: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${nombre}=`))?.slice(nombre.length + 3);
}

function ofuscarUrl(url: string | undefined): string {
  if (!url) return "(sin DATABASE_URL)";
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname}`;
  } catch {
    return "(url no parseable)";
  }
}

async function main() {
  const confirmar = process.argv.includes("--confirm");
  const slug = argumento("org");
  const nombreSucursal = argumento("sucursal");
  if (!slug || !nombreSucursal) throw new Error('Hacen falta --org=<slug> y --sucursal="<nombre>".');
  const archivo = path.resolve(argumento("archivo") ?? ARCHIVO_POR_DEFECTO);

  const organizacion = await prisma.organizacion.findUnique({ where: { slug } });
  if (!organizacion) throw new Error(`No existe la organización "${slug}".`);
  const sucursal = await prisma.sucursal.findFirst({ where: { organizacionId: organizacion.id, nombre: nombreSucursal } });
  if (!sucursal) throw new Error(`No existe la sucursal "${nombreSucursal}" en "${slug}".`);

  console.log(`BD: ${ofuscarUrl(process.env.DATABASE_URL)} | org: ${slug} | sede: ${nombreSucursal} | modo: ${confirmar ? "ESCRIBE" : "dry-run"}`);
  console.log(`Archivo: ${archivo}`);

  const { elegibles, excluidas } = prepararPadron(leerFilasExcel(archivo));

  // Antes del primer deploy la tabla aún no existe (P2021): el dry-run sigue, tratándola como vacía.
  let existentes: ComparablesPadron[] = [];
  try {
    existentes = await prisma.miembroReferencia.findMany({ where: { organizacionId: organizacion.id } });
  } catch (error) {
    if ((error as { code?: string }).code !== "P2021") throw error;
    if (confirmar) throw new Error("La tabla MiembroReferencia no existe: despliega primero la migración.");
    console.log("(La tabla MiembroReferencia aún no existe: se compara contra un padrón vacío.)");
  }
  const diff = reconciliarPadron(new Map(existentes.map((e) => [e.cedula, e])), elegibles);

  const resumen = {
    elegibles: elegibles.length,
    altas: diff.altas.length,
    cambios: diff.cambios.length,
    sinCambios: diff.sinCambios,
    conflictos: diff.conflictos.length, // campos editados a mano que el Excel trae distintos (se respeta lo editado)
    excluidas: excluidas.length,
    excluidasPorMotivo: {
      "sin-cedula": excluidas.filter((e) => e.motivo === "sin-cedula").length,
      "cedula-repetida": excluidas.filter((e) => e.motivo === "cedula-repetida").length,
    },
  };
  console.log(resumen);

  const rutaReporte = path.resolve(__dirname, `migracion-excel/reporte-padron-${Date.now()}.json`);
  writeFileSync(rutaReporte, JSON.stringify({ archivo, resumen, altas: diff.altas.map((a) => a.cedula), cambios: diff.cambios, conflictos: diff.conflictos, excluidas }, null, 2));
  console.log(`Reporte: ${rutaReporte}`);

  if (!confirmar) {
    console.log("Dry-run: no se escribió nada. Usa --confirm para cargar el padrón.");
    return;
  }

  // Cada upsert es idempotente: si se interrumpe, basta con volver a correr --confirm. `aEscribir` ya trae
  // las ediciones manuales aplicadas, y camposEditados/editadoAt/editadoPor no se tocan.
  const archivoOrigen = path.basename(archivo);
  for (let i = 0; i < diff.aEscribir.length; i += LOTE) {
    await Promise.all(
      diff.aEscribir.slice(i, i + LOTE).map((d) => {
        const { cedula, ...datos } = d;
        const valores = { ...datos, sucursalId: sucursal.id, archivoOrigen, importadoAt: new Date() };
        return prisma.miembroReferencia.upsert({
          where: { organizacionId_cedula: { organizacionId: organizacion.id, cedula } },
          create: { organizacionId: organizacion.id, cedula, ...valores },
          update: valores,
        });
      })
    );
    console.log(`  ${Math.min(i + LOTE, diff.aEscribir.length)}/${diff.aEscribir.length}`);
  }
  console.log("Padrón cargado.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Paso 4: Scripts npm**

En `packages/db/package.json`, junto a los scripts `db:migrar-excel-*`:
```json
    "db:importar-padron": "tsx importarPadronExcel.ts",
    "db:importar-padron:confirm": "tsx importarPadronExcel.ts --confirm",
```

- [ ] **Paso 5: Verificar (dry-run, solo lectura)**

Run: `npm run db:importar-padron --workspace packages/db -- --org=gym-demo --sucursal="Sede Principal"`
Expected: imprime la BD de destino, aviso de que la tabla aún no existe (si no se ha desplegado), y el resumen: `elegibles` ≈ 1428 menos las excluidas, `altas` = `elegibles`, `conflictos` = 0, `excluidas` con `sin-cedula` y `cedula-repetida`; los números deben coincidir con los de la Tarea 2 Paso 5. **No** correr `--confirm` aquí (la tabla no existe hasta el deploy).
Run: `npx tsc --noEmit -p apps/web-admin/tsconfig.json && npm test --workspace packages/db` → sin errores.

- [ ] **Paso 6: Commit**

```bash
git add packages/db/prisma packages/db/importarPadronExcel.ts packages/db/package.json
git commit -m "agrega el modelo MiembroReferencia y el importador del padrón desde el Excel"
git push origin main
```

---

## Tarea 4: Dominio de la activación (`activarMiembroPorCedula`) y repositorio Prisma

**Archivos:**
- Crear: `packages/domain/entities/MiembroReferencia.ts`
- Crear: `packages/domain/ports/IMiembroReferenciaRepository.ts`
- Crear: `packages/domain/use-cases/ActivarMiembroDesdePadron.ts`
- Crear: `packages/domain/use-cases/ActivarMiembroDesdePadron.test.ts`
- Modificar: `packages/domain/entities/Miembro.ts` (`DatosNuevoMiembro`)
- Crear: `packages/infrastructure/persistence/prisma/PrismaMiembroReferenciaRepository.ts`

**Interfaces:**
- Consume: `IMemberRepository.{buscarPorOrganizacionYCedula,crear}`, `IPlanRepository.listarPorOrganizacion`, `ISuscripcionRepository.crear`.
- Produce:
  - `MiembroReferencia` (entidad con todos los campos del modelo; `precioPlanUSD: number | null`)
  - `IMiembroReferenciaRepository { buscarPorCedula(organizacionId, cedula): Promise<MiembroReferencia | null>; existeParaSucursal(organizacionId, sucursalId): Promise<boolean> }`
  - `ActivarMiembroDeps`, `ActivarMiembroInput = { organizacionId; sucursalId; cedula }`
  - `activarMiembroPorCedula(deps, input): Promise<Miembro | null>`
  - `DatosNuevoMiembro` con opcionales `fechaUltimoPago?`, `fechaVencimiento?`, `porRegularizar?`.

- [ ] **Paso 1: Entidad y puerto**

`packages/domain/entities/MiembroReferencia.ts`:
```ts
// Fila del padrón de referencia (espejo del Excel). No es un miembro del sistema.
export interface MiembroReferencia {
  id: string;
  organizacionId: string;
  sucursalId: string;
  cedula: string;
  numeroFila: number;
  nombre: string;
  status: string | null;
  fNacimiento: string | null;
  celular: string | null;
  fVenc: string | null;
  fechaPago: string | null;
  plan: string | null;
  fechaVencimiento: Date | null;
  fechaUltimoPago: Date | null;
  fechaNacimiento: Date | null;
  planNombre: string | null;
  precioPlanUSD: number | null;
  archivoOrigen: string;
  importadoAt: Date;
  camposEditados: string[]; // columnas crudas editadas a mano desde el menú Excel
  editadoAt: Date | null;
  editadoPor: string | null;
}
```
`packages/domain/ports/IMiembroReferenciaRepository.ts`:
```ts
import { MiembroReferencia } from "../entities/MiembroReferencia";

export interface IMiembroReferenciaRepository {
  buscarPorCedula(organizacionId: string, cedula: string): Promise<MiembroReferencia | null>;
  // ¿Hay un padrón cargado para esta sede? Decide si se muestran el menú "Excel" y "Activar desde Excel".
  existeParaSucursal(organizacionId: string, sucursalId: string): Promise<boolean>;
}
```
En `entities/Miembro.ts`, agregar a `DatosNuevoMiembro`:
```ts
  // Solo los usa la activación desde el padrón; un alta normal los deja en su valor por defecto.
  fechaUltimoPago?: Date | null;
  fechaVencimiento?: Date | null;
  porRegularizar?: boolean;
```

- [ ] **Paso 2: Tests que fallan**

`ActivarMiembroDesdePadron.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { activarMiembroPorCedula, type ActivarMiembroDeps } from "./ActivarMiembroDesdePadron";
import type { MiembroReferencia } from "../entities/MiembroReferencia";
import type { Miembro, DatosNuevoMiembro } from "../entities/Miembro";

const DIA = 24 * 60 * 60 * 1000;
const input = { organizacionId: "org", sucursalId: "principal", cedula: "123" };

const referenciaBase: MiembroReferencia = {
  id: "r1", organizacionId: "org", sucursalId: "principal", cedula: "123", numeroFila: 5,
  nombre: "Ana Pérez", status: "ACTIVO", fNacimiento: null, celular: "0414", fVenc: "2026-10-01",
  fechaPago: null, plan: "30", fechaVencimiento: new Date("2026-10-01T00:00:00Z"),
  fechaUltimoPago: new Date("2026-09-01T00:00:00Z"), fechaNacimiento: null,
  planNombre: "Mensual con entrenador", precioPlanUSD: 30, archivoOrigen: "x.xlsm", importadoAt: new Date(),
  camposEditados: [], editadoAt: null, editadoPor: null,
};

function crearDeps(opciones: { existente?: Partial<Miembro> | null; referencia?: Partial<MiembroReferencia> | null; planes?: { id: string; nombre: string; diasCiclo: number; precioUSD: number }[] } = {}) {
  const creados: DatosNuevoMiembro[] = [];
  const suscripciones: { miembroId: string; planId: string; inicio: Date; fin: Date; fechaLimiteAbono: Date | null }[] = [];
  const deps = {
    miembros: {
      buscarPorOrganizacionYCedula: async () => (opciones.existente ? (opciones.existente as Miembro) : null),
      crear: async (datos: DatosNuevoMiembro) => {
        creados.push(datos);
        return { id: "nuevo", ...datos } as unknown as Miembro;
      },
    },
    referencias: {
      buscarPorCedula: async () => (opciones.referencia === null ? null : { ...referenciaBase, ...opciones.referencia }),
    },
    planes: { listarPorOrganizacion: async () => opciones.planes ?? [{ id: "p30", nombre: "Mensual con entrenador", diasCiclo: 30, precioUSD: 30 }] },
    suscripciones: {
      crear: async (datos: (typeof suscripciones)[number]) => {
        suscripciones.push(datos);
        return datos;
      },
    },
  } as unknown as ActivarMiembroDeps;
  return { deps, creados, suscripciones };
}

describe("activarMiembroPorCedula", () => {
  test("si ya es miembro lo devuelve sin crear nada", async () => {
    const { deps, creados } = crearDeps({ existente: { id: "m1" } });
    expect((await activarMiembroPorCedula(deps, input))?.id).toBe("m1");
    expect(creados).toEqual([]);
  });

  test("si no está en el padrón devuelve null", async () => {
    const { deps, creados } = crearDeps({ referencia: null });
    expect(await activarMiembroPorCedula(deps, input)).toBeNull();
    expect(creados).toEqual([]);
  });

  test("otra sede no activa", async () => {
    const { deps, creados } = crearDeps();
    expect(await activarMiembroPorCedula(deps, { ...input, sucursalId: "otra" })).toBeNull();
    expect(creados).toEqual([]);
  });

  test("crea el miembro por regularizar con los datos del padrón y su suscripción", async () => {
    const { deps, creados, suscripciones } = crearDeps();
    const miembro = await activarMiembroPorCedula(deps, input);
    expect(miembro?.id).toBe("nuevo");
    expect(creados[0]).toMatchObject({
      organizacionId: "org", sucursalId: "principal", nombre: "Ana Pérez", cedula: "123", celular: "0414",
      planId: "p30", precioPlan: 30, porRegularizar: true,
    });
    expect(creados[0].fechaVencimiento).toEqual(new Date("2026-10-01T00:00:00Z"));
    expect(creados[0].fechaUltimoPago).toEqual(new Date("2026-09-01T00:00:00Z"));
    expect(suscripciones).toEqual([
      {
        miembroId: "nuevo", planId: "p30",
        inicio: new Date(new Date("2026-10-01T00:00:00Z").getTime() - 30 * DIA),
        fin: new Date("2026-10-01T00:00:00Z"), fechaLimiteAbono: null,
      },
    ]);
  });

  test("plan del Excel que no existe como Plan: sin planId ni suscripción, precio del Excel", async () => {
    const { deps, creados, suscripciones } = crearDeps({ referencia: { planNombre: null, precioPlanUSD: 15 } });
    await activarMiembroPorCedula(deps, input);
    expect(creados[0].planId).toBeNull();
    expect(creados[0].precioPlan).toBe(15);
    expect(suscripciones).toEqual([]);
  });

  test("sin vencimiento: se crea el miembro sin fecha y sin suscripción", async () => {
    const { deps, creados, suscripciones } = crearDeps({ referencia: { fechaVencimiento: null } });
    await activarMiembroPorCedula(deps, input);
    expect(creados[0].fechaVencimiento).toBeNull();
    expect(suscripciones).toEqual([]);
  });

  test("sin precio en el padrón usa el del plan encontrado, o 0", async () => {
    const { deps, creados } = crearDeps({ referencia: { precioPlanUSD: null } });
    await activarMiembroPorCedula(deps, input);
    expect(creados[0].precioPlan).toBe(30);
    const sinPlan = crearDeps({ referencia: { precioPlanUSD: null, planNombre: null } });
    await activarMiembroPorCedula(sinPlan.deps, input);
    expect(sinPlan.creados[0].precioPlan).toBe(0);
  });
});
```
Run: `npm test --workspace packages/domain -- ActivarMiembroDesdePadron` → FAIL (módulo inexistente).

- [ ] **Paso 3: Implementar el caso de uso**

`ActivarMiembroDesdePadron.ts`:
```ts
import { IMemberRepository } from "../ports/IMemberRepository";
import { IMiembroReferenciaRepository } from "../ports/IMiembroReferenciaRepository";
import { IPlanRepository } from "../ports/IPlanRepository";
import { ISuscripcionRepository } from "../ports/ISuscripcionRepository";
import type { Miembro } from "../entities/Miembro";

const MS_POR_DIA = 24 * 60 * 60 * 1000;

export interface ActivarMiembroDeps {
  miembros: IMemberRepository;
  referencias: IMiembroReferenciaRepository;
  planes: IPlanRepository;
  suscripciones: ISuscripcionRepository;
}

export interface ActivarMiembroInput {
  organizacionId: string;
  sucursalId: string;
  cedula: string;
}

// Activación bajo demanda: si la cédula no es miembro pero está en el padrón de ESTA sede, crea el
// Miembro (por regularizar) y su Suscripción a partir del Excel. Nunca crea un Pago. Devuelve el
// miembro (existente o recién creado) o null si no hay nada que activar. Punto único de entrada para
// el kiosco y el panel; el llamador decide si lo envuelve en una transacción.
export async function activarMiembroPorCedula(deps: ActivarMiembroDeps, input: ActivarMiembroInput): Promise<Miembro | null> {
  const existente = await deps.miembros.buscarPorOrganizacionYCedula(input.organizacionId, input.cedula);
  if (existente) return existente;

  const referencia = await deps.referencias.buscarPorCedula(input.organizacionId, input.cedula);
  if (!referencia || referencia.sucursalId !== input.sucursalId) return null;

  const plan = referencia.planNombre
    ? ((await deps.planes.listarPorOrganizacion(input.organizacionId)).find((p) => p.nombre === referencia.planNombre) ?? null)
    : null;

  const miembro = await deps.miembros.crear({
    organizacionId: input.organizacionId,
    sucursalId: referencia.sucursalId,
    nombre: referencia.nombre,
    cedula: referencia.cedula,
    fechaInscripcion: null,
    fechaNacimiento: referencia.fechaNacimiento,
    celular: referencia.celular,
    fotoUrl: null,
    entrenadorId: null,
    planId: plan?.id ?? null,
    precioPlan: referencia.precioPlanUSD ?? plan?.precioUSD ?? 0,
    fechaUltimoPago: referencia.fechaUltimoPago,
    fechaVencimiento: referencia.fechaVencimiento,
    porRegularizar: true,
  });

  if (plan && referencia.fechaVencimiento) {
    await deps.suscripciones.crear({
      miembroId: miembro.id,
      planId: plan.id,
      inicio: new Date(referencia.fechaVencimiento.getTime() - plan.diasCiclo * MS_POR_DIA),
      fin: referencia.fechaVencimiento,
      fechaLimiteAbono: null,
    });
  }

  return miembro;
}
```
Run: `npm test --workspace packages/domain -- ActivarMiembroDesdePadron` → PASS.

- [ ] **Paso 4: Repositorio Prisma**

`PrismaMiembroReferenciaRepository.ts`:
```ts
import type { PrismaClientOrTx } from "./PrismaClientOrTx";
import type { IMiembroReferenciaRepository } from "@gym-app/domain/ports/IMiembroReferenciaRepository";
import type { MiembroReferencia } from "@gym-app/domain/entities/MiembroReferencia";

type FilaReferencia = Omit<MiembroReferencia, "precioPlanUSD"> & { precioPlanUSD: { toNumber(): number } | null };

export function mapearReferencia(fila: FilaReferencia): MiembroReferencia {
  return { ...fila, precioPlanUSD: fila.precioPlanUSD?.toNumber() ?? null };
}

export class PrismaMiembroReferenciaRepository implements IMiembroReferenciaRepository {
  constructor(private readonly prisma: PrismaClientOrTx) {}

  async buscarPorCedula(organizacionId: string, cedula: string): Promise<MiembroReferencia | null> {
    const fila = await this.prisma.miembroReferencia.findUnique({
      where: { organizacionId_cedula: { organizacionId, cedula } },
    });
    return fila ? mapearReferencia(fila) : null;
  }

  async existeParaSucursal(organizacionId: string, sucursalId: string): Promise<boolean> {
    const fila = await this.prisma.miembroReferencia.findFirst({ where: { organizacionId, sucursalId }, select: { id: true } });
    return fila !== null;
  }
}
```

- [ ] **Paso 5: Verificar y commit**

Run: `npx tsc --noEmit -p apps/web-admin/tsconfig.json && npm test --workspace packages/domain` → sin errores.
```bash
git add packages/domain packages/infrastructure
git commit -m "agrega el caso de uso de activación de miembros desde el padrón y su repositorio"
git push origin main
```

---

## Tarea 5: Activación en el check-in del kiosco

**Archivos:**
- Modificar: `packages/domain/use-cases/RegistrarCheckIn.ts`
- Modificar: `packages/domain/use-cases/RegistrarCheckIn.test.ts`
- Crear: `apps/web-admin/lib/activacion.ts`
- Modificar: `apps/web-admin/app/api/checkin/route.ts`

**Interfaces:**
- Consume: `activarMiembroPorCedula`, `ActivarMiembroInput` (Tarea 4); `PrismaMemberRepository`, `PrismaMiembroReferenciaRepository`, `PrismaPlanRepository`, `PrismaSuscripcionRepository` (todos aceptan `PrismaClientOrTx`).
- Produce: `RegistrarCheckInDeps.activarDesdePadron?: (input: ActivarMiembroInput) => Promise<Miembro | null>`; `activarMiembroEnTransaccion(input: ActivarMiembroInput): Promise<Miembro | null>` en `apps/web-admin/lib/activacion.ts` (la usa también la Tarea 6).

- [ ] **Paso 1: Tests que fallan**

Agregar a `RegistrarCheckIn.test.ts`:
```ts
describe("registrarCheckIn — activación desde el padrón", () => {
  function depsSinMiembro(activar?: (i: { organizacionId: string; sucursalId: string; cedula: string }) => Promise<Partial<Miembro> | null>) {
    return {
      miembros: { buscarPorOrganizacionYCedula: async () => null },
      checkIns: { buscarRecientePorMiembroYSucursal: async () => ({ estadoAlMomento: "vencido" }) },
      suscripciones: {},
      sucursales: { buscarPorId: async () => ({ diasGracia: 0, nombre: "Sede Principal", direccion: null }) },
      activarDesdePadron: activar,
    } as unknown as Parameters<typeof registrarCheckIn>[0];
  }

  test("si no es miembro pero el padrón lo activa, sigue el flujo normal con ese miembro", async () => {
    const llamadas: unknown[] = [];
    const deps = depsSinMiembro(async (i) => {
      llamadas.push(i);
      return { id: "nuevo", nombre: "Ana Pérez", fotoUrl: null, entrenadorNombre: null, fechaVencimiento: null, sucursalId: null, fechaNacimiento: null, genero: null };
    });
    const resultado = await registrarCheckIn(deps, input);
    expect(resultado.nombre).toBe("Ana Pérez");
    expect(llamadas).toEqual([input]);
  });

  test("si tampoco está en el padrón lanza MiembroNoEncontradoError", async () => {
    await expect(registrarCheckIn(depsSinMiembro(async () => null), input)).rejects.toBeInstanceOf(MiembroNoEncontradoError);
  });

  test("sin dependencia de activación (otro contexto) sigue lanzando MiembroNoEncontradoError", async () => {
    await expect(registrarCheckIn(depsSinMiembro(undefined), input)).rejects.toBeInstanceOf(MiembroNoEncontradoError);
  });
});
```
Cambiar el import de la cabecera a `import { registrarCheckIn, MiembroNoEncontradoError } from "./RegistrarCheckIn";`.
Run: `npm test --workspace packages/domain -- RegistrarCheckIn` → FAIL (las dos primeras).

- [ ] **Paso 2: Implementar en `RegistrarCheckIn.ts`**

Importar `import type { Miembro } from "../entities/Miembro";` junto al import existente de `Genero` (unificar: `import type { Genero, Miembro } from "../entities/Miembro";`) y `import type { ActivarMiembroInput } from "./ActivarMiembroDesdePadron";`. En `RegistrarCheckInDeps` agregar:
```ts
  // Si la cédula no es miembro, intenta activarla desde el padrón de la sede (null = no hay nada que activar).
  activarDesdePadron?: (input: ActivarMiembroInput) => Promise<Miembro | null>;
```
Reemplazar el inicio de `registrarCheckIn`:
```ts
  const miembro =
    (await deps.miembros.buscarPorOrganizacionYCedula(input.organizacionId, input.cedula)) ??
    (deps.activarDesdePadron ? await deps.activarDesdePadron(input) : null);
```
(el resto de la función queda igual; `RegistrarCheckInInput` ya tiene `organizacionId`, `sucursalId`, `cedula`, compatibles con `ActivarMiembroInput`).
Run: `npm test --workspace packages/domain -- RegistrarCheckIn` → PASS.

- [ ] **Paso 3: Helper transaccional y ruta**

`apps/web-admin/lib/activacion.ts`:
```ts
import { prisma } from "@/lib/prisma";
import { PrismaMemberRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMemberRepository";
import { PrismaMiembroReferenciaRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMiembroReferenciaRepository";
import { PrismaPlanRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPlanRepository";
import { PrismaSuscripcionRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSuscripcionRepository";
import { activarMiembroPorCedula, type ActivarMiembroInput } from "@gym-app/domain/use-cases/ActivarMiembroDesdePadron";
import type { Miembro } from "@gym-app/domain/entities/Miembro";

// Miembro + Suscripción se crean en una sola transacción. Si dos peticiones activan la misma cédula a
// la vez, la unicidad (organizacionId, cedula) hace fallar a la segunda: se relee y se devuelve el que
// ya existe en vez de propagar el error.
export async function activarMiembroEnTransaccion(input: ActivarMiembroInput): Promise<Miembro | null> {
  try {
    return await prisma.$transaction((tx) =>
      activarMiembroPorCedula(
        {
          miembros: new PrismaMemberRepository(tx),
          referencias: new PrismaMiembroReferenciaRepository(tx),
          planes: new PrismaPlanRepository(tx),
          suscripciones: new PrismaSuscripcionRepository(tx),
        },
        input
      )
    );
  } catch (error) {
    const existente = await new PrismaMemberRepository(prisma).buscarPorOrganizacionYCedula(input.organizacionId, input.cedula);
    if (existente) return existente;
    throw error;
  }
}
```
En `app/api/checkin/route.ts`: `import { activarMiembroEnTransaccion } from "@/lib/activacion";` y añadir `activarDesdePadron: activarMiembroEnTransaccion,` al objeto de dependencias de `registrarCheckIn`.

- [ ] **Paso 4: Verificar y commit**

Run: `npx tsc --noEmit -p apps/web-admin/tsconfig.json && npm test --workspace packages/domain` → sin errores.
```bash
git add packages/domain apps/web-admin/lib/activacion.ts apps/web-admin/app/api/checkin/route.ts
git commit -m "activa al miembro desde el padrón cuando la cédula no existe en el check-in del kiosco"
git push origin main
```

---

## Tarea 6: "Activar desde Excel" en el panel de Miembros

**Archivos:**
- Modificar: `apps/web-admin/app/(panel)/miembros/actions.ts`
- Crear: `apps/web-admin/app/(panel)/miembros/ActivarDesdeExcel.tsx`
- Modificar: `apps/web-admin/app/(panel)/miembros/page.tsx`

**Interfaces:**
- Consume: `activarMiembroEnTransaccion` (Tarea 5), `PrismaMiembroReferenciaRepository.existeParaSucursal` (Tarea 4), `AuthorizationService.tienePermiso(usuarioId, "MIEMBROS", "CREAR")`.
- Produce: `activarDesdeExcelAction(cedula: string): Promise<void>` (server action; redirige a la ficha).

- [ ] **Paso 1: Server action**

En `miembros/actions.ts`, añadir imports (`activarMiembroEnTransaccion` de `@/lib/activacion`) y, junto a `eliminarMiembroAction`:
```ts
// Activa (o abre, si ya existe) al miembro de esa cédula desde el padrón de la sede y lleva a su ficha.
// Los errores (en español) se dejan propagar para que el cliente los muestre con useFeedback.
export async function activarDesdeExcelAction(cedula: string): Promise<void> {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario, sucursalActivaId } = sesion;

  const autorizado = await new AuthorizationService(new PrismaPermisoRepository(prisma)).tienePermiso(usuario.id, "MIEMBROS", "CREAR");
  if (!autorizado) throw new Error("Tu rol no tiene permiso para activar miembros.");

  const cedulaLimpia = cedula.trim();
  if (!cedulaLimpia) throw new Error("Escribe la cédula.");

  const yaExistia = await new PrismaMemberRepository(prisma).buscarPorOrganizacionYCedula(usuario.organizacionId, cedulaLimpia);
  const miembro = await activarMiembroEnTransaccion({ organizacionId: usuario.organizacionId, sucursalId: sucursalActivaId, cedula: cedulaLimpia });
  if (!miembro) throw new Error("No hay ninguna persona con esa cédula en el Excel de esta sede.");

  revalidatePath("/miembros");
  redirect(
    yaExistia
      ? `/miembros/${miembro.id}`
      : conMensajeOk(`/miembros/${miembro.id}`, "Miembro activado desde el Excel. Revisa sus datos y regularízalo.")
  );
}
```

- [ ] **Paso 2: Componente cliente**

`ActivarDesdeExcel.tsx`:
```tsx
"use client";

import { useState, useTransition } from "react";
import { Input } from "@gym-app/ui/components/Input";
import { Button } from "@gym-app/ui/components/Button";
import { useFeedback } from "@gym-app/ui/components/FeedbackOverlay";
import { activarDesdeExcelAction } from "./actions";

export function ActivarDesdeExcel() {
  const [cedula, setCedula] = useState("");
  const [activando, iniciarTransicion] = useTransition();
  const { mostrarError } = useFeedback();

  function activar() {
    iniciarTransicion(async () => {
      try {
        await activarDesdeExcelAction(cedula);
      } catch (error) {
        // redirect() de Next lanza una excepción especial: se deja pasar para que navegue.
        if (error instanceof Error && error.message === "NEXT_REDIRECT") throw error;
        mostrarError(error instanceof Error ? error.message : "No se pudo activar al miembro.");
      }
    });
  }

  return (
    <div className="mb-6 flex flex-wrap items-end gap-3 print:hidden">
      <Input label="¿No aparece? Activar desde Excel por cédula" type="text" inputMode="numeric" value={cedula} onChange={(e) => setCedula(e.target.value)} />
      <Button type="button" onClick={activar} disabled={activando || cedula.trim() === ""}>
        Activar desde Excel
      </Button>
    </div>
  );
}
```
> Antes de dar por buena la captura de `NEXT_REDIRECT`, comparar con `BotonQuitarMiembro.tsx`, que llama a una acción que también hace `redirect` dentro de `try/catch` sin esa guarda; si ese patrón funciona en producción, imitarlo tal cual y quitar la línea de `NEXT_REDIRECT`. En Next.js moderno `redirect` lanza un error con `digest` que empieza por `NEXT_REDIRECT`; usar `isRedirectError` de `next/dist/client/components/redirect-error` si el tipo está disponible.

- [ ] **Paso 3: Montarlo en `page.tsx`**

En `miembros/page.tsx`, calcular y renderizar encima de `<ListaMiembros>`:
```tsx
import { PrismaMiembroReferenciaRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMiembroReferenciaRepository";
import { PrismaPermisoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPermisoRepository";
import { AuthorizationService } from "@gym-app/domain/services/AuthorizationService";
import { ActivarDesdeExcel } from "./ActivarDesdeExcel";
// ...dentro de PaginaMiembros, tras obtener la sesión:
const puedeActivarDesdeExcel =
  (await new PrismaMiembroReferenciaRepository(prisma).existeParaSucursal(usuario.organizacionId, sucursalActivaId)) &&
  (await new AuthorizationService(new PrismaPermisoRepository(prisma)).tienePermiso(usuario.id, "MIEMBROS", "CREAR"));
// ...y justo antes de <ListaMiembros ... />:
{puedeActivarDesdeExcel && <ActivarDesdeExcel />}
```

- [ ] **Paso 4: Verificar y commit**

Run: `npx tsc --noEmit -p apps/web-admin/tsconfig.json && npm run lint --workspace apps/web-admin` → sin errores.
Verificación manual (después del deploy y del import): en `/miembros` con la Sede Principal activa aparece el campo; una cédula del padrón abre la ficha con el aviso "Por regularizar"; una inexistente muestra "No hay ninguna persona con esa cédula en el Excel de esta sede."; en otra sede el campo no aparece.
```bash
git add "apps/web-admin/app/(panel)/miembros"
git commit -m "agrega Activar desde Excel en el panel de miembros"
git push origin main
```

---

## Tarea 7: Menú "Excel" — consulta con filtros y visor de estado

**Archivos:**
- Modificar: `packages/domain/entities/MiembroReferencia.ts`, `ports/IMiembroReferenciaRepository.ts`, `packages/infrastructure/persistence/prisma/PrismaMiembroReferenciaRepository.ts`
- Crear: `apps/web-admin/app/(panel)/excel/page.tsx`
- Modificar: `apps/web-admin/app/(panel)/layout.tsx`, `NavegacionMobile.tsx`, `MasSheet.tsx`

**Interfaces:**
- Produce:
  - `FiltrosReferencia { cedula?: string; nombre?: string; status?: string; plan?: string; venceDesde?: Date; venceHasta?: Date; estadoEnSistema?: "todos" | "no_miembro" | "miembro"; pagina: number; porPagina: number }`
  - `FilaReferenciaConEstado = MiembroReferencia & { miembroId: string | null }`
  - `IMiembroReferenciaRepository.listar(organizacionId, sucursalId, filtros): Promise<{ filas: FilaReferenciaConEstado[]; total: number }>`

- [ ] **Paso 1: Tipos y puerto**

Agregar a `entities/MiembroReferencia.ts` los tipos `FiltrosReferencia` y `FilaReferenciaConEstado` (como arriba) y al puerto:
```ts
  listar(organizacionId: string, sucursalId: string, filtros: FiltrosReferencia): Promise<{ filas: FilaReferenciaConEstado[]; total: number }>;
```

- [ ] **Paso 2: Implementación Prisma**

En `PrismaMiembroReferenciaRepository` añadir (importar `type { Prisma } from "@gym-app/db/generated/prisma/client"`):
```ts
  async listar(organizacionId: string, sucursalId: string, f: FiltrosReferencia) {
    const y: Prisma.MiembroReferenciaWhereInput[] = [];
    if (f.cedula) y.push({ cedula: { contains: f.cedula } });
    if (f.nombre) y.push({ nombre: { contains: f.nombre, mode: "insensitive" } });
    if (f.status) y.push({ status: { contains: f.status, mode: "insensitive" } });
    if (f.plan) y.push({ plan: { contains: f.plan, mode: "insensitive" } });
    if (f.venceDesde) y.push({ fechaVencimiento: { gte: f.venceDesde } });
    if (f.venceHasta) y.push({ fechaVencimiento: { lte: f.venceHasta } });
    if (f.estadoEnSistema === "miembro" || f.estadoEnSistema === "no_miembro") {
      const cedulas = (await this.prisma.miembro.findMany({ where: { organizacionId }, select: { cedula: true } })).map((m) => m.cedula);
      y.push({ cedula: f.estadoEnSistema === "miembro" ? { in: cedulas } : { notIn: cedulas } });
    }
    const where: Prisma.MiembroReferenciaWhereInput = { organizacionId, sucursalId, AND: y };

    const [filas, total] = await Promise.all([
      this.prisma.miembroReferencia.findMany({ where, orderBy: { numeroFila: "asc" }, skip: (f.pagina - 1) * f.porPagina, take: f.porPagina }),
      this.prisma.miembroReferencia.count({ where }),
    ]);
    const miembros = await this.prisma.miembro.findMany({
      where: { organizacionId, cedula: { in: filas.map((r) => r.cedula) } },
      select: { id: true, cedula: true },
    });
    const idPorCedula = new Map(miembros.map((m) => [m.cedula, m.id]));
    return { filas: filas.map((r) => ({ ...mapearReferencia(r), miembroId: idPorCedula.get(r.cedula) ?? null })), total };
  }
```

- [ ] **Paso 3: Página `excel/page.tsx`**

Server component (firma con `searchParams: Promise<...>` como `pagos/page.tsx`). Redirigir a `/miembros` si no hay sesión de panel, si la sede activa no tiene padrón (`existeParaSucursal`) o si no tiene permiso `MIEMBROS`/`VER` (`AuthorizationService`). Calcular también `puedeEditar` (permiso `MIEMBROS`/`EDITAR`). Leer filtros de `searchParams` (`cedula`, `nombre`, `status`, `plan`, `desde`, `hasta` en `aaaa-mm-dd`, `estado`, `pagina`), llamar a `listar` con `porPagina: 50`, y renderizar: título "Excel" con subtítulo "Datos espejo del archivo; las filas de quien aún no es miembro se pueden ajustar"; un `<form method="get">` con los filtros (`Input` para cédula/nombre/status/plan, `type="date"` para vence desde/hasta, `<select name="estado">` con Todos / No es miembro / Ya es miembro) y botones "Filtrar"/"Limpiar" (enlace a `/excel`); una tabla con columnas **N° fila, Cédula, Nombre, Status, F. nacimiento, Celular, F. venc., Fecha pago, Plan, Estado**, con `overflow-x-auto` para móvil. Columna **Estado** (visor): "No es miembro" o "Ya es miembro" con `Link` a `/miembros/{miembroId}` y la leyenda "Ajusta sus datos en la ficha del miembro" (esas filas son de solo lectura); si `camposEditados.length > 0`, un `Badge` "Editado" con los campos tocados. Paginación Anterior/Siguiente que conserva los filtros y muestra "Mostrando X–Y de N". Estilos con las variables `--gx-*` y componentes `Input`/`Button`/`Card`/`Badge` como en `miembros/ListaMiembros.tsx`. Las filas se renderizan en una función `FilaSoloLectura` local (la Tarea 8 la reemplaza por el componente editable). Helper local `normalizarFechaFiltro(texto?: string): Date | undefined` que acepta solo `^\d{4}-\d{2}-\d{2}$` y devuelve `new Date(\`${texto}T00:00:00Z\`)` (`venceHasta` con `T23:59:59.999Z`).

- [ ] **Paso 4: Navegación**

En `layout.tsx` (junto a `puedeVerEnSala`):
```tsx
const puedeVerExcel =
  (await new PrismaMiembroReferenciaRepository(prisma).existeParaSucursal(usuario.organizacionId, sucursalActivaId)) &&
  (await new AuthorizationService(new PrismaPermisoRepository(prisma)).tienePermiso(usuario.id, "MIEMBROS", "VER"));
```
Agregar al `items` del `Sidebar`, tras "Miembros": `...(puedeVerExcel ? [{ href: "/excel", label: "Excel" }] : []),` y pasar `puedeVerExcel` a `<NavegacionMobile ... />`. En `NavegacionMobile.tsx` aceptar la prop `puedeVerExcel: boolean` y reenviarla a `<MasSheet ... puedeVerExcel={puedeVerExcel} />`; en `MasSheet.tsx` aceptar `puedeVerExcel: boolean` y agregar a `enlaces`: `...(puedeVerExcel ? [{ href: "/excel", label: "Excel" }] : []),`.

- [ ] **Paso 5: Verificar y commit**

Run: `npx tsc --noEmit -p apps/web-admin/tsconfig.json && npm run lint --workspace apps/web-admin` → sin errores.
Verificación manual (tras deploy e import): el ítem "Excel" solo aparece con la Sede Principal activa; buscar una cédula parcial muestra filas con todas las columnas; el filtro "No es miembro" excluye a los 216 ya migrados; la fila de un miembro activado enlaza a su ficha y dice que se ajusta allí; en otra sede `/excel` redirige a `/miembros`.
```bash
git add packages "apps/web-admin"
git commit -m "agrega el menú Excel de consulta del padrón con filtros por cédula"
git push origin main
```

---

## Tarea 8: Edición de filas del padrón (microajustes)

**Archivos:**
- Crear: `packages/domain/use-cases/EditarMiembroReferencia.ts` y `EditarMiembroReferencia.test.ts`
- Modificar: `packages/domain/ports/IMiembroReferenciaRepository.ts`, `packages/infrastructure/persistence/prisma/PrismaMiembroReferenciaRepository.ts`
- Crear: `apps/web-admin/app/(panel)/excel/actions.ts`, `apps/web-admin/app/(panel)/excel/FilaPadronEditable.tsx`
- Modificar: `apps/web-admin/app/(panel)/excel/page.tsx`

**Interfaces:**
- Consume: `CAMPOS_EDITABLES_PADRON`, `CambiosCrudosPadron`, `fechaDesdeTextoPadron`, `normalizarCamposPadron`, `NormalizadosPadron` (Tarea 2); `IMemberRepository.buscarPorOrganizacionYCedula`; `IAuthorizationService.tienePermiso`.
- Produce:
  - Puerto: `actualizarEdicion(id: string, datos: { crudos: CambiosCrudosPadron; normalizados: NormalizadosPadron; camposEditados: string[]; editadoPor: string }): Promise<MiembroReferencia>`
  - `editarMiembroReferencia(deps: { referencias; miembros; autorizacion }, input: { organizacionId; sucursalId; cedula; usuarioId; usuarioNombre; cambios: CambiosCrudosPadron }): Promise<MiembroReferencia>`
  - Errores de dominio (en español): `RolNoAutorizadoError`, `ReferenciaNoEncontradaError`, `MiembroYaActivadoError`, `EdicionInvalidaError`
  - Server action `editarFilaPadronAction(cedula: string, cambios: CambiosCrudosPadron): Promise<void>`

- [ ] **Paso 1: Tests que fallan** — `EditarMiembroReferencia.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import {
  editarMiembroReferencia, EdicionInvalidaError, MiembroYaActivadoError, ReferenciaNoEncontradaError, RolNoAutorizadoError,
  type EditarMiembroReferenciaDeps,
} from "./EditarMiembroReferencia";
import type { MiembroReferencia } from "../entities/MiembroReferencia";

const base: MiembroReferencia = {
  id: "r1", organizacionId: "org", sucursalId: "principal", cedula: "123", numeroFila: 5, nombre: "Ana Pérez",
  status: "ACTIVO", fNacimiento: null, celular: "0414", fVenc: "2026-10-01", fechaPago: null, plan: "30",
  fechaVencimiento: new Date("2026-10-01T00:00:00Z"), fechaUltimoPago: null, fechaNacimiento: null,
  planNombre: "Mensual con entrenador", precioPlanUSD: 30, archivoOrigen: "x.xlsm", importadoAt: new Date(),
  camposEditados: [], editadoAt: null, editadoPor: null,
};
const input = { organizacionId: "org", sucursalId: "principal", cedula: "123", usuarioId: "u1", usuarioNombre: "Jorge", cambios: {} };

function crearDeps(opciones: { permitido?: boolean; referencia?: Partial<MiembroReferencia> | null; esMiembro?: boolean } = {}) {
  const escrituras: unknown[] = [];
  const deps = {
    autorizacion: { tienePermiso: async () => opciones.permitido ?? true },
    miembros: { buscarPorOrganizacionYCedula: async () => (opciones.esMiembro ? { id: "m1" } : null) },
    referencias: {
      buscarPorCedula: async () => (opciones.referencia === null ? null : { ...base, ...opciones.referencia }),
      actualizarEdicion: async (id: string, datos: unknown) => {
        escrituras.push({ id, datos });
        return { ...base, ...(datos as object) } as MiembroReferencia;
      },
    },
  } as unknown as EditarMiembroReferenciaDeps;
  return { deps, escrituras };
}

describe("editarMiembroReferencia", () => {
  test("sin permiso MIEMBROS/EDITAR", async () => {
    await expect(editarMiembroReferencia(crearDeps({ permitido: false }).deps, input)).rejects.toBeInstanceOf(RolNoAutorizadoError);
  });
  test("no existe o es de otra sede", async () => {
    await expect(editarMiembroReferencia(crearDeps({ referencia: null }).deps, input)).rejects.toBeInstanceOf(ReferenciaNoEncontradaError);
    await expect(editarMiembroReferencia(crearDeps().deps, { ...input, sucursalId: "otra" })).rejects.toBeInstanceOf(ReferenciaNoEncontradaError);
  });
  test("si ya es miembro se bloquea y se manda a la ficha", async () => {
    const error = await editarMiembroReferencia(crearDeps({ esMiembro: true }).deps, { ...input, cambios: { celular: "1" } }).catch((e) => e);
    expect(error).toBeInstanceOf(MiembroYaActivadoError);
    expect(error.message).toContain("ficha");
  });
  test("nombre vacío y fechas inválidas se rechazan", async () => {
    const { deps } = crearDeps();
    await expect(editarMiembroReferencia(deps, { ...input, cambios: { nombre: "  " } })).rejects.toBeInstanceOf(EdicionInvalidaError);
    await expect(editarMiembroReferencia(deps, { ...input, cambios: { fVenc: "mañana" } })).rejects.toBeInstanceOf(EdicionInvalidaError);
    await expect(editarMiembroReferencia(deps, { ...input, cambios: { fNacimiento: "31-02-2026" } })).rejects.toBeInstanceOf(EdicionInvalidaError);
  });
  test("edita, recalcula las normalizadas y registra quién y qué campos", async () => {
    const { deps, escrituras } = crearDeps();
    await editarMiembroReferencia(deps, { ...input, cambios: { fVenc: "01-12-2026", plan: "25", celular: "  0416  " } });
    const { id, datos } = escrituras[0] as { id: string; datos: any };
    expect(id).toBe("r1");
    expect(datos.crudos).toEqual({ fVenc: "01-12-2026", plan: "25", celular: "0416" });
    expect(datos.normalizados.fechaVencimiento).toEqual(new Date("2026-12-01T00:00:00Z"));
    expect(datos.normalizados.planNombre).toBe("Mensual sin entrenador");
    expect(datos.camposEditados.sort()).toEqual(["celular", "fVenc", "plan"]);
    expect(datos.editadoPor).toBe("Jorge");
  });
  test("vaciar la fecha de vencimiento la deja en null; los campos editados previos se conservan", async () => {
    const { deps, escrituras } = crearDeps({ referencia: { camposEditados: ["status"] } });
    await editarMiembroReferencia(deps, { ...input, cambios: { fVenc: "" } });
    const { datos } = escrituras[0] as { datos: any };
    expect(datos.crudos).toEqual({ fVenc: null });
    expect(datos.normalizados.fechaVencimiento).toBeNull();
    expect(datos.camposEditados.sort()).toEqual(["fVenc", "status"]);
  });
  test("sin cambios reales no escribe", async () => {
    const { deps, escrituras } = crearDeps();
    await editarMiembroReferencia(deps, { ...input, cambios: { celular: "0414", nombre: "Ana Pérez" } });
    expect(escrituras).toEqual([]);
  });
});
```
Run: `npm test --workspace packages/domain -- EditarMiembroReferencia` → FAIL.

- [ ] **Paso 2: Implementar el caso de uso**

`EditarMiembroReferencia.ts`:
```ts
import { IMemberRepository } from "../ports/IMemberRepository";
import { IMiembroReferenciaRepository } from "../ports/IMiembroReferenciaRepository";
import { IAuthorizationService } from "../ports/IAuthorizationService";
import type { MiembroReferencia } from "../entities/MiembroReferencia";
import {
  CAMPOS_EDITABLES_PADRON,
  fechaDesdeTextoPadron,
  normalizarCamposPadron,
  type CambiosCrudosPadron,
  type CampoEditablePadron,
  type CamposCrudosPadron,
} from "../utils/padronExcel";

export class RolNoAutorizadoError extends Error {
  constructor() {
    super("Tu rol no tiene permiso para editar el Excel.");
  }
}
export class ReferenciaNoEncontradaError extends Error {
  constructor() {
    super("No hay ninguna persona con esa cédula en el Excel de esta sede.");
  }
}
export class MiembroYaActivadoError extends Error {
  constructor() {
    super("Esta persona ya es miembro del sistema: ajusta sus datos en su ficha.");
  }
}
export class EdicionInvalidaError extends Error {}

export interface EditarMiembroReferenciaDeps {
  referencias: IMiembroReferenciaRepository;
  miembros: IMemberRepository;
  autorizacion: IAuthorizationService;
}

export interface EditarMiembroReferenciaInput {
  organizacionId: string;
  sucursalId: string;
  cedula: string;
  usuarioId: string;
  usuarioNombre: string;
  cambios: CambiosCrudosPadron;
}

const ETIQUETAS: Record<CampoEditablePadron, string> = {
  nombre: "nombre", status: "status", fNacimiento: "fecha de nacimiento", celular: "celular",
  fVenc: "fecha de vencimiento", fechaPago: "fecha de pago", plan: "plan",
};

// Microajuste de una fila del padrón (solo si la persona aún no es miembro). La cédula no se edita.
// Guarda qué campos se tocaron para que reimportar el Excel respete la edición.
export async function editarMiembroReferencia(
  deps: EditarMiembroReferenciaDeps,
  input: EditarMiembroReferenciaInput
): Promise<MiembroReferencia> {
  if (!(await deps.autorizacion.tienePermiso(input.usuarioId, "MIEMBROS", "EDITAR"))) throw new RolNoAutorizadoError();

  const referencia = await deps.referencias.buscarPorCedula(input.organizacionId, input.cedula);
  if (!referencia || referencia.sucursalId !== input.sucursalId) throw new ReferenciaNoEncontradaError();
  if (await deps.miembros.buscarPorOrganizacionYCedula(input.organizacionId, input.cedula)) throw new MiembroYaActivadoError();

  const cambiados: Record<string, string | null> = {};
  for (const campo of CAMPOS_EDITABLES_PADRON) {
    if (!(campo in input.cambios)) continue;
    const bruto = input.cambios[campo];
    const valor = bruto === undefined || bruto === null || bruto.trim() === "" ? null : bruto.trim();
    if (campo === "nombre" && valor === null) throw new EdicionInvalidaError("El nombre no puede quedar vacío.");
    if ((campo === "fNacimiento" || campo === "fVenc") && valor !== null && fechaDesdeTextoPadron(valor) === null) {
      throw new EdicionInvalidaError(`Fecha inválida en ${ETIQUETAS[campo]}: usa aaaa-mm-dd o dd-mm-aaaa.`);
    }
    if (valor !== referencia[campo]) cambiados[campo] = valor;
  }

  const tocados = Object.keys(cambiados);
  if (tocados.length === 0) return referencia;

  const crudosFinales: CamposCrudosPadron = {
    nombre: referencia.nombre, status: referencia.status, fNacimiento: referencia.fNacimiento, celular: referencia.celular,
    fVenc: referencia.fVenc, fechaPago: referencia.fechaPago, plan: referencia.plan,
    ...cambiados,
  } as CamposCrudosPadron;

  return deps.referencias.actualizarEdicion(referencia.id, {
    crudos: cambiados as CambiosCrudosPadron,
    normalizados: normalizarCamposPadron(crudosFinales),
    camposEditados: [...new Set([...referencia.camposEditados, ...tocados])],
    editadoPor: input.usuarioNombre,
  });
}
```
Run: `npm test --workspace packages/domain -- EditarMiembroReferencia` → PASS.

- [ ] **Paso 3: Puerto y repositorio Prisma**

Puerto (`IMiembroReferenciaRepository`):
```ts
  // Guarda una edición manual (crudos cambiados + normalizadas recalculadas) y la deja registrada.
  actualizarEdicion(
    id: string,
    datos: { crudos: CambiosCrudosPadron; normalizados: NormalizadosPadron; camposEditados: string[]; editadoPor: string }
  ): Promise<MiembroReferencia>;
```
(importar `CambiosCrudosPadron`, `NormalizadosPadron` de `../utils/padronExcel`). Repo Prisma:
```ts
  async actualizarEdicion(id: string, datos: { crudos: CambiosCrudosPadron; normalizados: NormalizadosPadron; camposEditados: string[]; editadoPor: string }) {
    const fila = await this.prisma.miembroReferencia.update({
      where: { id },
      data: { ...datos.crudos, ...datos.normalizados, camposEditados: datos.camposEditados, editadoAt: new Date(), editadoPor: datos.editadoPor },
    });
    return mapearReferencia(fila);
  }
```

- [ ] **Paso 4: Server action** — `excel/actions.ts`:
```ts
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaMemberRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMemberRepository";
import { PrismaMiembroReferenciaRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMiembroReferenciaRepository";
import { PrismaPermisoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPermisoRepository";
import { AuthorizationService } from "@gym-app/domain/services/AuthorizationService";
import { editarMiembroReferencia } from "@gym-app/domain/use-cases/EditarMiembroReferencia";
import type { CambiosCrudosPadron } from "@gym-app/domain/utils/padronExcel";

// Los errores de dominio (en español) se dejan propagar para que el cliente los muestre con useFeedback.
export async function editarFilaPadronAction(cedula: string, cambios: CambiosCrudosPadron): Promise<void> {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario, sucursalActivaId } = sesion;

  await editarMiembroReferencia(
    {
      referencias: new PrismaMiembroReferenciaRepository(prisma),
      miembros: new PrismaMemberRepository(prisma),
      autorizacion: new AuthorizationService(new PrismaPermisoRepository(prisma)),
    },
    { organizacionId: usuario.organizacionId, sucursalId: sucursalActivaId, cedula, usuarioId: usuario.id, usuarioNombre: usuario.nombre, cambios }
  );

  revalidatePath("/excel");
}
```

- [ ] **Paso 5: Fila editable en la tabla**

`FilaPadronEditable.tsx` (client): recibe `fila` serializable `{ cedula, numeroFila, nombre, status, fNacimiento, celular, fVenc, fechaPago, plan, camposEditados: string[], miembroId: string | null }` y `puedeEditar: boolean`. Estado `editando` y `borrador` (los 7 campos editables como strings). Modo lectura: las 10 celdas de la Tarea 7; las celdas de campos en `camposEditados` se resaltan (fondo ámbar suave con variables `--gx-*`); botón "Editar" solo si `puedeEditar && miembroId === null`; si `miembroId !== null`, la celda Estado muestra "Ya es miembro" con `Link` a `/miembros/{miembroId}` y la leyenda "Ajusta sus datos en la ficha del miembro" (sin botón). Modo edición: cada campo editable pasa a `<input>` (`type="date"` para `fNacimiento` y `fVenc` solo si el valor actual es `aaaa-mm-dd` o vacío; en otro caso `type="text"` para poder corregir un valor mal escrito), cédula y N° fila fijos, botones "Guardar" y "Cancelar". "Guardar" envía solo los campos que difieren del original a `editarFilaPadronAction(fila.cedula, cambios)` dentro de `useTransition`; ante error `mostrarError(error.message)` (de `useFeedback`) y la fila queda en edición; al éxito sale de edición (la página se revalida sola). Mismo estilo que `BotonQuitarMiembro.tsx` / `ListaMiembros.tsx`.

En `excel/page.tsx`, reemplazar `FilaSoloLectura` por `<FilaPadronEditable fila={...} puedeEditar={puedeEditar} />` (pasar objetos planos, sin `Date`).

- [ ] **Paso 6: Verificar y commit**

Run: `npx tsc --noEmit -p apps/web-admin/tsconfig.json && npm run lint --workspace apps/web-admin && npm test --workspace packages/domain` → sin errores.
Verificación manual (tras deploy e import): editar el vencimiento de una fila "No es miembro" la deja marcada "Editado"; abrir `/kiosco` con esa cédula usa el vencimiento editado; una fila "Ya es miembro" no tiene botón Editar; sin permiso `MIEMBROS`/`EDITAR` no aparece "Editar"; reimportar (`db:importar-padron` dry-run) lista la edición como conflicto y no la pisa.
```bash
git add packages "apps/web-admin"
git commit -m "permite editar filas del padrón desde el menú Excel con ediciones respetadas al reimportar"
git push origin main
```

---

## Tarea 9: Retirar el pipeline viejo y actualizar la documentación

**Archivos:**
- Eliminar: `packages/db/migrarExcelAdrenalina.ts`, `packages/db/limpiarMigracionExcelPrueba.ts`, `packages/db/migracion-excel/{clasificarFila.ts,clasificarFila.test.ts,config.ts,config.test.ts,mapeo-plan.json,reglas-cedula.json}`, y los scripts `db:migrar-excel-adrenalina*`/`db:limpiar-migracion-excel-prueba` de `packages/db/package.json`.
- Conservar: `leerExcel.ts`, `normalizarFila.ts` (+test), `tipos.ts` (recortar lo que ya nadie use), `padron.ts`, `limpiarOrganizacionParaMigracion.ts`, `marcarAjustarFecha.ts`.
- Modificar: `CLAUDE.md` (sección "Excel migration pipeline"), `handoff.md`, y marcar como reemplazada la spec vieja.

- [ ] **Paso 1: Confirmar que nada depende de lo que se borra**

Run: `grep -rnE "clasificarFila|migracion-excel/config|mapeo-plan|reglas-cedula|migrarExcelAdrenalina|limpiarMigracionExcelPrueba" apps packages --include=*.ts --include=*.tsx --include=*.json -l | grep -v "node_modules\|generated\|\.next"`
Expected: solo los propios archivos a borrar (y `package.json` de `packages/db`). Si `tipos.ts` o `normalizarFila.ts` importan tipos que solo usaba `clasificarFila` (`MapeoPlanEntry`, `ReglasCedula`, `FilaClasificada`, …), eliminarlos de `tipos.ts` tras el borrado.

- [ ] **Paso 2: Borrar y verificar**

```bash
git rm packages/db/migrarExcelAdrenalina.ts packages/db/limpiarMigracionExcelPrueba.ts \
  packages/db/migracion-excel/clasificarFila.ts packages/db/migracion-excel/clasificarFila.test.ts \
  packages/db/migracion-excel/config.ts packages/db/migracion-excel/config.test.ts \
  packages/db/migracion-excel/mapeo-plan.json packages/db/migracion-excel/reglas-cedula.json
```
Editar `packages/db/package.json` quitando los 3 scripts viejos. Run: `npx tsc --noEmit -p apps/web-admin/tsconfig.json && npm test --workspace packages/db && npm test --workspace packages/domain` → sin errores.

- [ ] **Paso 3: Documentación**

- `CLAUDE.md`: reemplazar la sección "Excel migration pipeline (in progress)" por una "Padrón Excel y activación bajo demanda" (qué es `MiembroReferencia`, `importarPadronExcel.ts` con dry-run/`--confirm`, `activarMiembroPorCedula`, menú "Excel", y que `Miembro.porRegularizar` reemplazó a `ajustarFecha`); actualizar la mención de scripts `db:migrar-excel-*`.
- `handoff.md` (5 secciones, sin borrar "Intentos fallidos"): estado, archivos, y **Próximos pasos de despliegue**: (1) respaldo de BD en Easypanel; (2) deploy de web-admin (aplica `20261009000000_miembro_por_regularizar` y `20261009100000_miembro_referencia` al arrancar); (3) `npm run db:importar-padron --workspace packages/db -- --org=gym-demo --sucursal="Sede Principal"` (dry-run) y revisar el reporte; (4) mismo comando con `:confirm`; (5) deploy del kiosco; (6) probar check-in con una cédula solo del padrón.
- Añadir al inicio de `docs/superpowers/specs/2026-09-28-migracion-excel-adrenalina-design.md` y del plan `2026-09-28-migracion-excel-adrenalina.md` una línea: `> **Reemplazado** por 2026-10-08-padron-excel-activacion-bajo-demanda.`

- [ ] **Paso 4: Commit**

```bash
git add -A
git commit -m "retira el pipeline de migración masiva y documenta el padrón y la activación"
git push origin main
```

---

## Autorrevisión (cobertura de la spec)

- §3.1 padrón → Tarea 3 (modelo) y Tarea 2 (normalización). §3.2 `porRegularizar` → Tarea 1.
- §4 importador (dry-run, upsert, reporte, sin tocar `Miembro`, sin tope de filas) → Tareas 2 y 3. Retiro del pipeline → Tarea 9.
- §5 activación (existente, otra sede, plan inexistente, sin vencimiento, carrera) → Tareas 4 y 5.
- §6 kiosco → Tarea 5; panel → Tarea 6. §7 menú "Excel" (consulta, visor de estado y bloqueo de quien ya es miembro) → Tarea 7; edición con `camposEditados` y reimportación que la respeta → Tareas 2, 3 y 8. §8 (216 intactos, PLACEHOLDER fuera de alcance) → restricciones globales. §10 pruebas y despliegue → tests por tarea + pasos de despliegue en el handoff (Tarea 9).
- Desviación menor respecto de la spec §6: el panel ofrece un campo propio "Activar desde Excel" encima de la lista (no se acopla al buscador de `ListaMiembros`, que es un filtro cliente sobre miembros ya cargados). Misma función, mismo permiso.
- Consistencia de nombres: `porRegularizar`, `DatosPadron`, `prepararPadron`, `reconciliarPadron`, `normalizarCamposPadron`, `camposEditados`, `editarMiembroReferencia`, `actualizarEdicion`, `MiembroReferencia`, `IMiembroReferenciaRepository`, `activarMiembroPorCedula`, `ActivarMiembroInput`, `activarMiembroEnTransaccion`, `activarDesdePadron` se usan igual en todas las tareas.
