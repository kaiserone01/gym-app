# Rediseño del kiosco — Fase 2 (género y cumpleaños) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que recepción pueda cargar el género y la fecha de nacimiento de cada miembro, y que la ficha real salude "¡BIENVENIDO, ADRENALINER!", "¡BIENVENIDA, ADRENALINER!" o "¡BIENVENID@, ADRENALINER!" según el género, y con "¡FELIZ CUMPLEAÑOS, ADRENALINER!" el día del cumpleaños.

**Architecture:** Un campo nuevo `Miembro.genero` (enum de dos valores, nulo = no definido) con migración; el caso de uso `registrarCheckIn` devuelve `genero` y `esCumpleanos` (calculado en servidor con el día de Caracas, sin enviar la fecha de nacimiento al TV); `/api/checkin` los expone de forma aditiva. El formulario de miembros en web-admin gana dos campos. El kiosco elige el texto con una función pura (`textoSaludo`).

**Tech Stack:** Prisma 7 (Postgres) en `packages/db`; dominio puro con Vitest en `packages/domain`; Next.js (web-admin y kiosk); Vitest en `apps/kiosk`.

**Spec:** `docs/superpowers/specs/2026-10-08-rediseno-kiosco-design.md` (§2 decisiones, §6 saludo, §7 API, §10 F2). Este plan cubre **solo la Fase 2**, ya simplificada por pedido del usuario: **sin saludos personalizados** (nada de frases por género tipo "Campeón/Campeona", ni bolsa de frases en la ficha) y **sin campaña** ("¿Cómo te saludamos?"). Ni `saludo`, ni `saludoPreguntas`, ni `POST /api/checkin/saludo`, ni `preguntarSaludo`, ni las teclas `*`/`-`/`+`. Esas funciones podrían retomarse más adelante.

## Global Constraints

- **Nunca correr `prisma migrate` (ni `migrate dev`/`deploy`) contra la base remota** — la base de `.env` es la de producción. Solo se escribe el archivo de migración y se corre `npm run generate --workspace packages/db` (regenera el cliente, no toca la base). La migración se aplica sola al arrancar el contenedor tras el deploy (`docker-entrypoint.sh`).
- Todo cambio al API es aditivo/opcional: un kiosco viejo debe seguir funcionando con el API nuevo, y el kiosco nuevo con un API viejo (campos `genero`/`esCumpleanos` ausentes = "no definido"/"no es cumpleaños").
- Enum `Genero`: `MASCULINO`, `FEMENINO`; `null` = no definido. No hay valor "neutro".
- Textos exactos de la ficha: `genero = MASCULINO` → `¡BIENVENIDO, ADRENALINER!`; `FEMENINO` → `¡BIENVENIDA, ADRENALINER!`; `null` → `¡BIENVENID@, ADRENALINER!` (única frase con `@`); cumpleaños (cualquier género) → `¡FELIZ CUMPLEAÑOS, ADRENALINER!`.
- La fecha de nacimiento **no** viaja al kiosco: solo el booleano `esCumpleanos`, calculado en servidor con el día calendario de `America/Caracas`.
- `fechaNacimiento` se guarda como `new Date(\`${yyyy-mm-dd}T00:00:00\`)` (igual que `fechaInscripcion`) y se lee con getters locales.
- Commits: **un solo renglón en español, sin firma ni trailers** (CLAUDE.md). Tras cada tarea: commit y `git push origin main` (preferencia guardada del usuario).
- `AGENTS.md` de `apps/web-admin` y `apps/kiosk` avisa de cambios incompatibles de Next.js: usar solo patrones ya presentes en esos archivos.
- Mismas restricciones de F1 en el kiosco: sin `color-mix()`, `:has`, `backdrop-filter`, blur; solo `transform`/`opacity` se animan.

## Review Focus

1. **Miembros ya existentes (216 migrados, todos con `genero` y `fechaNacimiento` nulos):** la ficha debe verse exactamente como hoy ("¡BIENVENID@, ADRENALINER!"), sin errores (Task 4 `textoSaludo`).
2. **Kiosco nuevo contra API viejo** (sin `genero`/`esCumpleanos` en la respuesta, valores `undefined`): fallback sin romper (Task 4 tests con `undefined`).
3. **Cumpleaños en el límite horario Caracas/UTC:** a las 22:00 del 8 de octubre en Caracas ya es 9 de octubre en UTC; el cumpleaños del día 8 debe seguir marcándose y el del día 9 no (Task 1 tests).
4. **Editar y vaciar:** dejar el género en "Sin definir" o borrar la fecha de nacimiento al editar un miembro debe guardar `null` (no ignorar el campo), y un valor de `genero` inválido en el formulario debe tratarse como `null` (Task 1 `parsearGenero`, Task 3 test de `actualizarMiembro` con `null`).
5. **29 de febrero:** un miembro nacido el 29/02 solo recibe el saludo de cumpleaños los años bisiestos; se acepta y se documenta (no se maneja).

---

### Task 1: Dominio — tipo `Genero`, `parsearGenero` y `esCumpleanos`

**Files:**
- Modify: `packages/domain/entities/Miembro.ts`
- Modify: `packages/domain/utils/fechaCaracas.ts`
- Create: `packages/domain/entities/Miembro.test.ts`
- Create: `packages/domain/utils/fechaCaracas.test.ts`

**Interfaces:**
- Produces (usados en Tasks 2, 3, 4):
  - `GENEROS: readonly ["MASCULINO", "FEMENINO"]`, `type Genero`, `parsearGenero(valor: unknown): Genero | null` (en `entities/Miembro.ts`)
  - `Miembro.genero: Genero | null`, `DatosNuevoMiembro.genero?: Genero | null`, `CambiosMiembro.genero?: Genero | null`
  - `esCumpleanos(fechaNacimiento: Date | null, ahora: Date): boolean` (en `utils/fechaCaracas.ts`)

- [ ] **Step 1: Escribir los tests que fallan**

`packages/domain/entities/Miembro.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { GENEROS, parsearGenero } from "./Miembro";

describe("parsearGenero", () => {
  test("acepta los dos valores válidos", () => {
    for (const genero of GENEROS) expect(parsearGenero(genero)).toBe(genero);
  });

  test("cualquier otra cosa es null (vacío, desconocido, minúsculas, no texto)", () => {
    expect(parsearGenero("")).toBeNull();
    expect(parsearGenero("NEUTRO")).toBeNull();
    expect(parsearGenero("masculino")).toBeNull();
    expect(parsearGenero(null)).toBeNull();
    expect(parsearGenero(undefined)).toBeNull();
    expect(parsearGenero(5)).toBeNull();
  });
});
```

`packages/domain/utils/fechaCaracas.test.ts` (el archivo no existe todavía):

```ts
import { describe, expect, test } from "vitest";
import { esCumpleanos } from "./fechaCaracas";

// fechaNacimiento se guarda como fecha local a las 00:00 (igual que fechaInscripcion): se crea con el
// constructor local para que el test no dependa de la zona horaria de la máquina.
const nacio = (mes: number, dia: number) => new Date(1990, mes - 1, dia);

describe("esCumpleanos", () => {
  test("sin fecha de nacimiento no es cumpleaños", () => {
    expect(esCumpleanos(null, new Date("2026-10-08T15:00:00Z"))).toBe(false);
  });

  test("true el día del cumpleaños en Caracas", () => {
    expect(esCumpleanos(nacio(10, 8), new Date("2026-10-08T15:00:00Z"))).toBe(true);
  });

  test("false otro día", () => {
    expect(esCumpleanos(nacio(10, 9), new Date("2026-10-08T15:00:00Z"))).toBe(false);
    expect(esCumpleanos(nacio(11, 8), new Date("2026-10-08T15:00:00Z"))).toBe(false);
  });

  test("de noche en Caracas (ya es el día siguiente en UTC) cuenta el día de Caracas", () => {
    // 22:00 del 8 de octubre en Caracas = 02:00 UTC del 9.
    const ahora = new Date("2026-10-09T02:00:00Z");
    expect(esCumpleanos(nacio(10, 8), ahora)).toBe(true);
    expect(esCumpleanos(nacio(10, 9), ahora)).toBe(false);
  });

  test("de madrugada en UTC todavía es el día anterior en Caracas", () => {
    // 23:00 del 7 de octubre en Caracas = 03:00 UTC del 8.
    const ahora = new Date("2026-10-08T03:00:00Z");
    expect(esCumpleanos(nacio(10, 7), ahora)).toBe(true);
    expect(esCumpleanos(nacio(10, 8), ahora)).toBe(false);
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test --workspace packages/domain`
Expected: FAIL — `parsearGenero`/`GENEROS`/`esCumpleanos` no exportados.

- [ ] **Step 3: Implementar el tipo y `parsearGenero`**

En `packages/domain/entities/Miembro.ts`, justo antes de `export interface Miembro {` añadir:

```ts
// Género del miembro, solo para saludarlo en el kiosco ("Bienvenido" / "Bienvenida"). null = no definido.
export const GENEROS = ["MASCULINO", "FEMENINO"] as const;
export type Genero = (typeof GENEROS)[number];

export function parsearGenero(valor: unknown): Genero | null {
  return GENEROS.find((genero) => genero === valor) ?? null;
}

```

Y añadir los campos: en `interface Miembro`, después de `ajustarFecha: boolean; ...` añadir `genero: Genero | null; // para el saludo del kiosco; null = no definido`; en `interface DatosNuevoMiembro`, después de `precioPlan: number;` añadir `genero?: Genero | null;`; en `interface CambiosMiembro`, después de `ajustarFecha?: boolean;` añadir `genero?: Genero | null;`.

- [ ] **Step 4: Implementar `esCumpleanos`**

Al final de `packages/domain/utils/fechaCaracas.ts` añadir:

```ts

// ¿Hoy (día calendario de Caracas) es el cumpleaños? fechaNacimiento se guarda como fecha local a las
// 00:00, igual que fechaInscripcion, y se lee con getters locales. Quien nació un 29 de febrero solo
// cumple los años bisiestos.
export function esCumpleanos(fechaNacimiento: Date | null, ahora: Date): boolean {
  if (!fechaNacimiento) return false;
  const hoy = diaCalendarioCaracas(ahora);
  return fechaNacimiento.getMonth() === hoy.getUTCMonth() && fechaNacimiento.getDate() === hoy.getUTCDate();
}
```

- [ ] **Step 5: Arreglar fixtures que construyen `Miembro` completos**

Run: `grep -rln "ajustarFecha:" packages apps --include=*.ts --include=*.tsx | grep -v "node_modules\|generated\|/out/\|.next"`
En cada archivo de **test** (`*.test.ts`) que construya un literal tipado `Miembro` con `ajustarFecha:`, añadir `genero: null,` al literal (por ejemplo `packages/domain/use-cases/CambiarPlanConPago.test.ts`). No tocar código de producción en este paso (el mapper del repositorio se actualiza en la Task 2).

- [ ] **Step 6: Verificar que pasan**

Run: `npm test --workspace packages/domain`
Expected: PASS (los tests anteriores más los nuevos).

- [ ] **Step 7: Commit**

```bash
git add packages/domain
git commit -m "agrega el tipo Genero, parsearGenero y esCumpleanos al dominio"
git push origin main
```

---

### Task 2: Schema, migración, repositorio y check-in

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/20261008000000_miembro_genero/migration.sql`
- Modify: `packages/infrastructure/persistence/prisma/PrismaMemberRepository.ts`
- Modify: `packages/domain/use-cases/RegistrarCheckIn.ts`
- Create: `packages/domain/use-cases/RegistrarCheckIn.test.ts`
- Modify: `apps/web-admin/app/api/checkin/route.ts`

**Interfaces:**
- Consumes: `Genero`, `esCumpleanos` (Task 1).
- Produces: `Miembro.genero` leído desde la base; `RegistrarCheckInResultado.genero: Genero | null` y `RegistrarCheckInResultado.esCumpleanos: boolean`; la respuesta JSON de `POST /api/checkin` suma `genero` y `esCumpleanos`.

- [ ] **Step 1: Escribir el test que falla**

`packages/domain/use-cases/RegistrarCheckIn.test.ts` (usa la ruta de "check-in repetido", que no consulta suscripciones, para aislar el género y el cumpleaños):

```ts
import { afterEach, describe, expect, test, vi } from "vitest";
import { registrarCheckIn } from "./RegistrarCheckIn";
import type { Miembro } from "../entities/Miembro";

function crearDeps(miembro: Partial<Miembro>) {
  return {
    miembros: {
      buscarPorOrganizacionYCedula: async () => ({
        id: "m1",
        nombre: "Camila Ledezma Barrios",
        fotoUrl: null,
        entrenadorNombre: null,
        fechaVencimiento: null,
        sucursalId: null,
        fechaNacimiento: null,
        genero: null,
        ...miembro,
      }),
    },
    // Un check-in reciente existente corta antes de validar la suscripción.
    checkIns: { buscarRecientePorMiembroYSucursal: async () => ({ estadoAlMomento: "activo" }) },
    suscripciones: {},
    sucursales: { buscarPorId: async () => ({ diasGracia: 0, nombre: "Sede Principal", direccion: null }) },
  } as unknown as Parameters<typeof registrarCheckIn>[0];
}

const input = { organizacionId: "org", sucursalId: "s1", cedula: "123" };

afterEach(() => vi.useRealTimers());

describe("registrarCheckIn — género y cumpleaños", () => {
  test("devuelve el género del miembro", async () => {
    const resultado = await registrarCheckIn(crearDeps({ genero: "FEMENINO" }), input);
    expect(resultado.genero).toBe("FEMENINO");
  });

  test("devuelve género null cuando el miembro no lo tiene definido", async () => {
    const resultado = await registrarCheckIn(crearDeps({ genero: null }), input);
    expect(resultado.genero).toBeNull();
  });

  test("esCumpleanos es true el día del cumpleaños en Caracas", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-08T15:00:00Z"));
    const resultado = await registrarCheckIn(crearDeps({ fechaNacimiento: new Date(1990, 9, 8) }), input);
    expect(resultado.esCumpleanos).toBe(true);
  });

  test("esCumpleanos es false otro día o sin fecha de nacimiento", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-08T15:00:00Z"));
    expect((await registrarCheckIn(crearDeps({ fechaNacimiento: new Date(1990, 9, 9) }), input)).esCumpleanos).toBe(false);
    expect((await registrarCheckIn(crearDeps({ fechaNacimiento: null }), input)).esCumpleanos).toBe(false);
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npm test --workspace packages/domain -- RegistrarCheckIn`
Expected: FAIL — `resultado.genero` es `undefined` (la propiedad todavía no existe en el resultado).

- [ ] **Step 3: Implementar en el caso de uso**

En `packages/domain/use-cases/RegistrarCheckIn.ts`:
- Añadir imports: `import type { Genero } from "../entities/Miembro";` y `import { esCumpleanos } from "../utils/fechaCaracas";`.
- En `interface RegistrarCheckInResultado`, después de `tieneGraciaConfigurada: boolean;` añadir:

```ts
  // Género del miembro (null = no definido) y si hoy (día de Caracas) es su cumpleaños. La fecha de
  // nacimiento nunca sale del servidor: el kiosco solo recibe este booleano.
  genero: Genero | null;
  esCumpleanos: boolean;
```
- En el objeto `const base = { ... }`, después de `sucursalAsignadaDireccion: sucursalAsignada?.direccion ?? null,` añadir:

```ts
    genero: miembro.genero,
    esCumpleanos: esCumpleanos(miembro.fechaNacimiento, new Date()),
```
(`base` se esparce en las dos rutas de retorno: check-in repetido y nuevo, así que ambas lo incluyen.)

- [ ] **Step 4: Schema y migración**

En `packages/db/prisma/schema.prisma`: justo antes de `model Miembro {` añadir

```prisma
enum Genero {
  MASCULINO
  FEMENINO
}

```

y en `model Miembro`, después de la línea `ajustarFecha Boolean ...` añadir

```prisma
  genero           Genero? // solo para saludar en el kiosco ("Bienvenido" / "Bienvenida"); null = no definido
```

Crear `packages/db/prisma/migrations/20261008000000_miembro_genero/migration.sql`:

```sql
-- CreateEnum
CREATE TYPE "Genero" AS ENUM ('MASCULINO', 'FEMENINO');

-- AlterTable
ALTER TABLE "Miembro" ADD COLUMN "genero" "Genero";
```

Run: `npm run generate --workspace packages/db`
Expected: "Generated Prisma Client". (NO ejecutar `migrate`: ver Global Constraints.)

- [ ] **Step 5: Repositorio**

En `packages/infrastructure/persistence/prisma/PrismaMemberRepository.ts`:
- Ampliar el import existente: `import type { Miembro, DatosNuevoMiembro, CambiosMiembro, Genero } from "@gym-app/domain/entities/Miembro";`
- En `type FilaMiembro`, después de `ajustarFecha: boolean;` añadir `genero: Genero | null;`.
- En `mapear`, después de `ajustarFecha: miembro.ajustarFecha,` añadir `genero: miembro.genero,`.
(`crear` y `actualizar` ya pasan `datos`/`cambios` directo a Prisma: no necesitan cambios.)

- [ ] **Step 6: Respuesta de `/api/checkin`**

En `apps/web-admin/app/api/checkin/route.ts`, dentro del objeto de la respuesta 200, después de `tieneGraciaConfigurada: resultado.tieneGraciaConfigurada,` añadir:

```ts
        genero: resultado.genero,
        esCumpleanos: resultado.esCumpleanos,
```

- [ ] **Step 7: Verificar**

Run: `npm test --workspace packages/domain` → Expected: PASS (incluye los 4 tests nuevos).
Run: `npx tsc --noEmit -p apps/web-admin` → Expected: sin errores.
Run: `npm test --workspace packages/db` → Expected: PASS (si falla por algo que no tiene que ver con este cambio, reportarlo sin arreglarlo).

- [ ] **Step 8: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations/20261008000000_miembro_genero packages/infrastructure/persistence/prisma/PrismaMemberRepository.ts packages/domain/use-cases/RegistrarCheckIn.ts packages/domain/use-cases/RegistrarCheckIn.test.ts apps/web-admin/app/api/checkin/route.ts
git commit -m "agrega el campo género al miembro y devuelve género y cumpleaños en el check-in"
git push origin main
```

---

### Task 3: Web-admin — género y fecha de nacimiento en la ficha del miembro

**Files:**
- Modify: `apps/web-admin/app/(panel)/miembros/FormularioMiembro.tsx`
- Modify: `apps/web-admin/app/(panel)/miembros/actions.ts`
- Modify: `apps/web-admin/app/(panel)/miembros/[id]/page.tsx`
- Test: `packages/domain/use-cases/ActualizarMiembro.test.ts`

**Interfaces:**
- Consumes: `GENEROS`, `Genero`, `parsearGenero` (Task 1); `CambiosMiembro.genero`/`fechaNacimiento`.
- Produces: el formulario envía `genero` ("" | MASCULINO | FEMENINO) y `fechaNacimiento` (yyyy-mm-dd o ""); las acciones de crear y actualizar los guardan (`null` si vienen vacíos o inválidos).

- [ ] **Step 1: Test que pina que `null` llega al repositorio**

En `packages/domain/use-cases/ActualizarMiembro.test.ts`, añadir al final (usa los helpers `crearDeps` y `base` ya definidos en ese archivo; `describe`/`test` ya están importados):

```ts
describe("actualizarMiembro — género y fecha de nacimiento", () => {
  test("pasa genero y fechaNacimiento null al repositorio (vaciar un valor no se ignora)", async () => {
    const { deps, cambiosGuardados } = crearDeps(false);
    await actualizarMiembro(deps, { ...base, cambios: { genero: null, fechaNacimiento: null } });
    expect(cambiosGuardados[0]).toEqual({ genero: null, fechaNacimiento: null });
  });

  test("pasa un género y una fecha de nacimiento definidos", async () => {
    const { deps, cambiosGuardados } = crearDeps(false);
    const nacimiento = new Date(1990, 9, 8);
    await actualizarMiembro(deps, { ...base, cambios: { genero: "FEMENINO", fechaNacimiento: nacimiento } });
    expect(cambiosGuardados[0]).toEqual({ genero: "FEMENINO", fechaNacimiento: nacimiento });
  });
});
```

Run: `npm test --workspace packages/domain -- ActualizarMiembro`
Expected: PASS ya con el código actual (el caso de uso pasa `cambios` tal cual); este test fija ese contrato para que un cambio futuro no lo rompa. Si FALLA, reportarlo como BLOCKED: significaría que el caso de uso filtra campos y habría que ajustarlo.

- [ ] **Step 2: Acciones — leer y guardar los campos**

En `apps/web-admin/app/(panel)/miembros/actions.ts`:
- Añadir el import: `import { parsearGenero } from "@gym-app/domain/entities/Miembro";`
- Añadir, junto a las otras funciones auxiliares de la parte superior (por ejemplo debajo de `resolverPlanId`):

```ts
// "yyyy-mm-dd" del <input type="date"> → fecha local a las 00:00 (igual que fechaInscripcion); vacío o
// inválido → null.
function leerFecha(valor: FormDataEntryValue | null): Date | null {
  const texto = valor?.toString();
  if (!texto) return null;
  const fecha = new Date(`${texto}T00:00:00`);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}
```

- En `crearMiembroAction`, dentro del objeto pasado a `crearMiembro`, reemplazar `fechaNacimiento: null,` por:

```ts
        fechaNacimiento: leerFecha(formData.get("fechaNacimiento")),
        genero: parsearGenero(formData.get("genero")),
```

- En `actualizarMiembroAction`, dentro de `cambios: { ... }`, después de la línea `celular: formData.get("celular")?.toString() || null,` añadir:

```ts
          fechaNacimiento: leerFecha(formData.get("fechaNacimiento")),
          genero: parsearGenero(formData.get("genero")),
```

(En edición el formulario siempre envía ambos campos, así que vaciarlos los pone en `null`.)

- [ ] **Step 3: Página de edición — valores iniciales**

En `apps/web-admin/app/(panel)/miembros/[id]/page.tsx`, dentro de `valoresIniciales={{ ... }}`, después de la línea `fechaInscripcion: ...` añadir:

```tsx
          fechaNacimiento: miembro.fechaNacimiento ? formatearFechaISO(miembro.fechaNacimiento) : "",
          genero: miembro.genero ?? "",
```

- [ ] **Step 4: Formulario — estado, cambios sin guardar y campos**

En `apps/web-admin/app/(panel)/miembros/FormularioMiembro.tsx`:
1. Import: `import { GENEROS, type Genero } from "@gym-app/domain/entities/Miembro";`
2. En `interface ValoresFormularioMiembro`, después de `fechaInscripcion: string; // yyyy-mm-dd` añadir:

```ts
  fechaNacimiento: string; // yyyy-mm-dd, "" si no tiene
  genero: Genero | ""; // "" = no definido
```
3. Junto a `ETIQUETA_FRECUENCIA` añadir:

```ts
const ETIQUETA_GENERO: Record<Genero, string> = {
  MASCULINO: "Masculino",
  FEMENINO: "Femenino",
};
```
4. Junto a los otros `useState` de datos personales (después de `const [fechaInscripcion, ...]`) añadir:

```ts
  const [fechaNacimiento, setFechaNacimiento] = useState(valoresIniciales?.fechaNacimiento ?? "");
  const [genero, setGenero] = useState<Genero | "">(valoresIniciales?.genero ?? "");
```
5. En `hayCambiosSinGuardar`, después de la línea `fechaInscripcion !== valoresIniciales.fechaInscripcion ||` añadir:

```ts
      fechaNacimiento !== valoresIniciales.fechaNacimiento ||
      genero !== valoresIniciales.genero ||
```
6. En el JSX de "Datos personales", justo después del `<Input name="fechaInscripcion" ... />` (el bloque termina en `onChange={(e) => setFechaInscripcion(e.target.value)}` + `/>`), y antes de cerrar el `</div>` contenedor, añadir:

```tsx
            <div className="grid grid-cols-2 gap-4">
              <Input
                name="fechaNacimiento"
                label="Fecha de nacimiento"
                type="date"
                value={fechaNacimiento}
                onChange={(e) => setFechaNacimiento(e.target.value)}
              />
              <label className="flex flex-col gap-1.5 text-sm" style={{ color: "var(--gx-muted)" }}>
                Género
                <select
                  name="genero"
                  value={genero}
                  onChange={(e) => setGenero(e.target.value as Genero | "")}
                  className="min-h-11 rounded-lg border px-3 outline-none focus:border-[var(--gx-accent)]"
                  style={{ background: "var(--gx-surface-2)", borderColor: "var(--gx-edge)", color: "var(--gx-ink)" }}
                >
                  <option value="">Sin definir</option>
                  {GENEROS.map((opcion) => (
                    <option key={opcion} value={opcion}>
                      {ETIQUETA_GENERO[opcion]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
```

- [ ] **Step 5: Verificar**

Run: `npx tsc --noEmit -p apps/web-admin` → Expected: sin errores.
Run: `npm run lint --workspace apps/web-admin 2>&1 | tail -15` y comparar con la línea base: `FormularioMiembro.tsx` ya tenía 2 errores de lint conocidos antes de este cambio (handoff, sección 3, "Foto de perfil"); el cambio **no debe añadir errores nuevos** (reportar el conteo de ese archivo antes/después).
Run: `npm test --workspace packages/domain` → Expected: PASS.
No hay forma de probar el formulario contra la base hasta que se despliegue la migración; reportar que no se ejercitó en vivo.

- [ ] **Step 6: Commit**

```bash
git add "apps/web-admin/app/(panel)/miembros/FormularioMiembro.tsx" "apps/web-admin/app/(panel)/miembros/actions.ts" "apps/web-admin/app/(panel)/miembros/[id]/page.tsx" packages/domain/use-cases/ActualizarMiembro.test.ts
git commit -m "agrega el género y la fecha de nacimiento a la ficha del miembro en web-admin"
git push origin main
```

---

### Task 4: Kiosco — saludo según género y de cumpleaños en la ficha

**Files:**
- Modify: `apps/kiosk/lib/frases.ts`
- Create: `apps/kiosk/lib/saludo.ts`
- Test: `apps/kiosk/lib/saludo.test.ts`
- Modify: `apps/kiosk/lib/api.ts`
- Modify: `apps/kiosk/lib/estadoPantalla.ts`
- Modify: `apps/kiosk/app/page.tsx`
- Modify: `apps/kiosk/components/AccessCard.tsx`

**Interfaces:**
- Consumes: `FRASE_BIENVENIDA_NEUTRA` (F1, `lib/frases.ts`, vale `"¡BIENVENID@, ADRENALINER!"`), campos `genero`/`esCumpleanos` de `POST /api/checkin` (Task 2).
- Produces:
  - En `lib/frases.ts`: `FRASE_BIENVENIDO` (`"¡BIENVENIDO, ADRENALINER!"`), `FRASE_BIENVENIDA` (`"¡BIENVENIDA, ADRENALINER!"`), `FRASE_CUMPLEANOS` (`"¡FELIZ CUMPLEAÑOS, ADRENALINER!"`)
  - En `lib/saludo.ts`: `type Genero = "MASCULINO" | "FEMENINO"`, `textoSaludo(genero: Genero | null | undefined, esCumpleanos: boolean | undefined): string`
  - `ResultadoCheckIn.genero?: Genero | null`, `ResultadoCheckIn.esCumpleanos?: boolean`
  - `Ficha` (variante `resultado`) gana `saludo: string` (texto ya resuelto); `AccessCard` recibe la prop `saludo: string`.

- [ ] **Step 1: Escribir los tests que fallan**

`apps/kiosk/lib/saludo.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { FRASE_BIENVENIDA, FRASE_BIENVENIDA_NEUTRA, FRASE_BIENVENIDO, FRASE_CUMPLEANOS } from "./frases";
import { textoSaludo } from "./saludo";

describe("textoSaludo", () => {
  it("sin género (miembros ya existentes o un API viejo que no lo envía) usa la bienvenida neutra", () => {
    expect(textoSaludo(null, false)).toBe("¡BIENVENID@, ADRENALINER!");
    expect(textoSaludo(undefined, undefined)).toBe("¡BIENVENID@, ADRENALINER!");
    expect(textoSaludo(null, false)).toBe(FRASE_BIENVENIDA_NEUTRA);
  });

  it("con género conocido saluda Bienvenido o Bienvenida", () => {
    expect(textoSaludo("MASCULINO", false)).toBe("¡BIENVENIDO, ADRENALINER!");
    expect(textoSaludo("FEMENINO", false)).toBe("¡BIENVENIDA, ADRENALINER!");
    expect(textoSaludo("MASCULINO", undefined)).toBe(FRASE_BIENVENIDO);
    expect(textoSaludo("FEMENINO", undefined)).toBe(FRASE_BIENVENIDA);
  });

  it("el cumpleaños manda sobre el saludo y es igual para todos", () => {
    expect(textoSaludo("MASCULINO", true)).toBe("¡FELIZ CUMPLEAÑOS, ADRENALINER!");
    expect(textoSaludo("FEMENINO", true)).toBe("¡FELIZ CUMPLEAÑOS, ADRENALINER!");
    expect(textoSaludo(null, true)).toBe(FRASE_CUMPLEANOS);
    expect(textoSaludo(undefined, true)).toBe(FRASE_CUMPLEANOS);
  });

  it("la @ solo existe en la bienvenida neutra", () => {
    expect(FRASE_BIENVENIDA_NEUTRA).toContain("@");
    expect([FRASE_BIENVENIDO, FRASE_BIENVENIDA, FRASE_CUMPLEANOS].some((frase) => frase.includes("@"))).toBe(false);
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test --workspace apps/kiosk -- saludo`
Expected: FAIL — no se puede resolver `./saludo` ni `FRASE_BIENVENIDO`.

- [ ] **Step 3: Añadir las frases**

Al final de `apps/kiosk/lib/frases.ts` añadir (el archivo ya exporta `FRASES_REPOSO` y `FRASE_BIENVENIDA_NEUTRA`; no tocarlos):

```ts

// Saludo de la ficha real según el género del miembro (Fase 2, simplificado: sin frases personalizadas).
// "@" solo existe en FRASE_BIENVENIDA_NEUTRA, que es la que se usa cuando no se conoce el género.
export const FRASE_BIENVENIDO = "¡BIENVENIDO, ADRENALINER!";
export const FRASE_BIENVENIDA = "¡BIENVENIDA, ADRENALINER!";
export const FRASE_CUMPLEANOS = "¡FELIZ CUMPLEAÑOS, ADRENALINER!";
```

- [ ] **Step 4: Implementar `saludo.ts`**

`apps/kiosk/lib/saludo.ts`:

```ts
import {
  FRASE_BIENVENIDA,
  FRASE_BIENVENIDA_NEUTRA,
  FRASE_BIENVENIDO,
  FRASE_CUMPLEANOS,
} from "./frases";

// Mismos valores que el enum `Genero` del servidor (el kiosco no importa paquetes de dominio).
export type Genero = "MASCULINO" | "FEMENINO";

// Texto con que la ficha real saluda al miembro. `genero` y `esCumpleanos` pueden faltar (miembros sin
// género definido o un API viejo que no los envía): en ese caso se saluda en neutro. El cumpleaños manda
// sobre el saludo y es igual para todos.
export function textoSaludo(genero: Genero | null | undefined, esCumpleanos: boolean | undefined): string {
  if (esCumpleanos) return FRASE_CUMPLEANOS;
  if (genero === "MASCULINO") return FRASE_BIENVENIDO;
  if (genero === "FEMENINO") return FRASE_BIENVENIDA;
  return FRASE_BIENVENIDA_NEUTRA;
}
```

- [ ] **Step 5: Verificar que pasan**

Run: `npm test --workspace apps/kiosk`
Expected: PASS (los tests de F1 más los nuevos).

- [ ] **Step 6: Tipos del API y de la ficha**

En `apps/kiosk/lib/api.ts`:
- Añadir al principio, junto a los otros imports/constantes: `import type { Genero } from "./saludo";`
- En `interface ResultadoCheckIn`, después de `tieneGraciaConfigurada: boolean;` añadir:

```ts
  // Opcionales: un API viejo no los envía (el kiosco los trata como "no definido" / "no es cumpleaños").
  genero?: Genero | null;
  esCumpleanos?: boolean;
```

En `apps/kiosk/lib/estadoPantalla.ts`, en la variante `resultado` de `Ficha`, añadir el campo `saludo: string;` (junto a `hora`, `cara`, etc.) con el comentario `// texto del saludo ya resuelto (bienvenida según género o cumpleaños)`.

- [ ] **Step 7: `page.tsx` y `AccessCard.tsx`**

Antes de tocar nada, lee ambos archivos (el `page.tsx` y el `AccessCard.tsx` actuales incluyen las correcciones de la revisión final de F1: `fotoOk`, el `try/finally` de `enviar`, etc.) y haz **solo** estos cambios:

En `apps/kiosk/app/page.tsx`:
- Import: `import { textoSaludo } from "@/lib/saludo";`
- En `enviar`, donde se construye la ficha `{ tipo: "resultado", ... }` tras `registrarCheckIn`, añadir el campo: `saludo: textoSaludo(resultado.genero, resultado.esCumpleanos),`
- En `contenidoFicha`, en el `<AccessCard ... />` del caso `resultado`, añadir la prop `saludo={ficha.saludo}`.

En `apps/kiosk/components/AccessCard.tsx`:
- Quitar `FRASE_BIENVENIDA_NEUTRA` del import de `@/lib/frases` (y el import completo si queda vacío).
- Añadir la prop `saludo: string` a las props del componente (y a su tipo).
- Reemplazar `{FRASE_BIENVENIDA_NEUTRA}` por `{saludo}` en el `<p>` del saludo (el que solo se muestra con `CARAS_CON_ACCESO`). No cambiar nada más.

- [ ] **Step 8: Verificar**

Run: `npm test --workspace apps/kiosk` → Expected: PASS.
Run: `npx tsc --noEmit -p apps/kiosk` → Expected: sin errores.
Run: `npm run lint --workspace apps/kiosk` → Expected: 0 errores (el aviso de fuentes en `app/layout.tsx` ya existía).
Run: `NEXT_PUBLIC_API_URL=http://localhost:3000 npm run build --workspace apps/kiosk` → Expected: build OK.

- [ ] **Step 9: Commit**

```bash
git add apps/kiosk/lib/frases.ts apps/kiosk/lib/saludo.ts apps/kiosk/lib/saludo.test.ts apps/kiosk/lib/api.ts apps/kiosk/lib/estadoPantalla.ts apps/kiosk/app/page.tsx apps/kiosk/components/AccessCard.tsx
git commit -m "saluda en la ficha según el género del miembro y en su cumpleaños"
git push origin main
```

---

### Task 5: Documentación y cierre

**Files:**
- Modify: `handoff.md`

- [ ] **Step 1: Escribir en `handoff.md` la lista de verificación (sin ejecutarla)**

1. Desplegar **primero** `apps/web-admin` (al arrancar el contenedor aplica la migración `20261008000000_miembro_genero`; antes de desplegar, revisar `pg_stat_activity` por sesiones `idle in transaction`, como en las migraciones anteriores) y **después** `apps/kiosk`.
2. En web-admin, editar un miembro de prueba: poner "Género" = Femenino y una fecha de nacimiento = hoy; guardar, recargar la ficha y comprobar que se conservan; luego vaciar ambos campos, guardar y comprobar que vuelven a "Sin definir" / vacío.
3. En el kiosco, check-in con ese miembro: la ficha debe decir "¡FELIZ CUMPLEAÑOS, ADRENALINER!" el día del cumpleaños y, otro día, "¡BIENVENIDA, ADRENALINER!"; con género Masculino "¡BIENVENIDO, ADRENALINER!"; con un miembro sin género "¡BIENVENID@, ADRENALINER!".
4. Probar un kiosco con la versión anterior contra el API nuevo: sigue funcionando.

- [ ] **Step 2: Actualizar `handoff.md`**

Con los 5 apartados de CLAUDE.md: en "Estado actual", añadir la Fase 2 implementada (sin saludos personalizados ni campaña, con género y fecha de nacimiento editables) y qué falta (despliegue + lista de verificación); en "Archivos y cambios", listar los archivos de este plan; en "Intentos fallidos" **añadir** (sin borrar nada) lo que no haya funcionado durante la ejecución y las decisiones de descartar la campaña, las frases por género y los saludos personalizados (a retomar más adelante si el cliente lo pide); en "Próximos pasos", el despliegue en el orden indicado y el plan de la Fase 3 (APK). Actualizar también la mención de F2 en la entrada del rediseño (quitar "frases por género" y "campaña con `*`/`-`/`+`").

- [ ] **Step 3: Commit**

```bash
git add handoff.md
git commit -m "actualiza el handoff con la fase 2 del rediseño del kiosco"
git push origin main
```

---

## Self-Review (hecha al escribir el plan)

- **Cobertura del spec F2 (§10, ya simplificado):** `Miembro.genero` + migración → Task 2; `genero`/`esCumpleanos` en `/api/checkin` → Task 2; selector de género y fecha de nacimiento en web-admin → Task 3; saludo según género y de cumpleaños en la ficha → Task 4. Lo descartado (campaña, `saludo`, frases por género, `saludoPreguntas`, `POST /api/checkin/saludo`, `preguntarSaludo`, bolsa de frases en la ficha) no aparece en ninguna tarea.
- **Sin marcadores pendientes:** cada paso de código lleva el código o la instrucción exacta con su ancla; los pasos que dependen del estado actual de `page.tsx`/`AccessCard.tsx` (corregidos en la revisión final de F1) piden leerlos primero y limitan el cambio a líneas concretas.
- **Consistencia de tipos:** `Genero`/`GENEROS`/`parsearGenero` (Task 1) se usan igual en Tasks 2 y 3; `esCumpleanos` (Task 1) en Task 2; `Genero`/`textoSaludo` del kiosco (Task 4) son independientes de los del dominio a propósito (el kiosco no importa paquetes de dominio); `Ficha.resultado.saludo: string` (Task 4) coincide con la prop `saludo: string` de `AccessCard`.
- **Riesgos:** la base remota es producción (no se ejecutan migraciones desde aquí); el formulario no se puede probar contra la base hasta que se aplique la migración; web-admin tiene errores de lint previos en `FormularioMiembro.tsx` que no deben aumentar.
