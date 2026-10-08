# Rediseño del kiosco — Fase 2 (saludo y cumpleaños) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que recepción pueda definir cómo saluda el kiosco a cada miembro (campo `saludo`) y cargar su fecha de nacimiento, y que la ficha real salude con frases por género y con un saludo especial el día del cumpleaños.

**Architecture:** Un campo nuevo `Miembro.saludo` (enum) con migración; el caso de uso `registrarCheckIn` devuelve `saludo` y `esCumpleanos` (calculado en servidor con la fecha de Caracas, sin enviar la fecha de nacimiento al TV); `/api/checkin` los expone de forma aditiva. El formulario de miembros en web-admin gana dos campos (saludo y fecha de nacimiento). El kiosco elige el texto del saludo con una función pura (`textoSaludo`) y una bolsa barajada de frases.

**Tech Stack:** Prisma 7 (Postgres) en `packages/db`; dominio puro con Vitest en `packages/domain`; Next.js (web-admin y kiosk); Vitest en `apps/kiosk`.

**Spec:** `docs/superpowers/specs/2026-10-08-rediseno-kiosco-design.md` (§2 decisiones, §6 frases, §7 API, §10 F2). Este plan cubre **solo la Fase 2** y **sin campaña**: el kiosco NO pregunta "¿Cómo te saludamos?" (el usuario la descartó). Tampoco existen `saludoPreguntas`, `POST /api/checkin/saludo`, `preguntarSaludo` ni las teclas `*`/`-`/`+`.

## Global Constraints

- **Nunca correr `prisma migrate` (ni `migrate dev`/`deploy`) contra la base remota** — la base de `.env` es la de producción. Solo se escribe el archivo de migración y se corre `npm run generate --workspace packages/db` (regenera el cliente, no toca la base). La migración se aplica sola al arrancar el contenedor tras el deploy (`docker-entrypoint.sh`).
- Todo cambio al API es aditivo/opcional: un kiosco viejo debe seguir funcionando con el API nuevo, y el kiosco nuevo con un API viejo (campos `saludo`/`esCumpleanos` ausentes = "sin definir"/"no es cumpleaños").
- Enum `Saludo`: `MASCULINO` ("Campeón"), `FEMENINO` ("Campeona"), `NEUTRO` ("Adrenaliner"); `null` = sin definir.
- Saludo con `saludo = null`: **"¡BIENVENID@, ADRENALINER!"** (única frase con `@`). Con cumpleaños: `¡FELIZ CUMPLEAÑOS, CAMPEÓN!` / `¡FELIZ CUMPLEAÑOS, CAMPEONA!` / `¡FELIZ CUMPLEAÑOS, ADRENALINER!` (con `saludo = null`, la neutra, sin `@`).
- La fecha de nacimiento **no** viaja al kiosco: solo el booleano `esCumpleanos`, calculado en servidor con el día calendario de `America/Caracas`.
- `fechaNacimiento` se guarda como `new Date(\`${yyyy-mm-dd}T00:00:00\`)` (igual que `fechaInscripcion`) y se lee con getters locales.
- Frases por género: las 8 de `FRASES_FICHA` del spec §6; ninguna con `@`.
- Commits: **un solo renglón en español, sin firma ni trailers** (CLAUDE.md). Tras cada tarea: commit y `git push origin main` (preferencia guardada del usuario).
- `AGENTS.md` de `apps/web-admin` y `apps/kiosk` avisa de cambios incompatibles de Next.js: usar solo patrones ya presentes en esos archivos.
- Mismas restricciones de F1 en el kiosco: sin `color-mix()`, `:has`, `backdrop-filter`, blur; solo `transform`/`opacity` se animan.

## Review Focus

1. **Miembros ya existentes (216 migrados, todos con `saludo` y `fechaNacimiento` nulos):** la ficha debe verse exactamente como hoy ("¡BIENVENID@, ADRENALINER!"), sin errores (Task 4 `textoSaludo`).
2. **Kiosco nuevo contra API viejo** (sin `saludo`/`esCumpleanos` en la respuesta, valores `undefined`): fallback sin romper (Task 4 tests con `undefined`).
3. **Cumpleaños en el límite horario Caracas/UTC:** a las 22:00 del 8 de octubre en Caracas ya es 9 de octubre en UTC; el cumpleaños del día 8 debe seguir marcándose y el del día 9 no (Task 1 tests).
4. **Editar y vaciar:** dejar el saludo en "Sin definir" o borrar la fecha de nacimiento al editar un miembro debe guardar `null` (no ignorar el campo), y un valor de `saludo` inválido en el formulario debe tratarse como `null` (Task 1 `parsearSaludo`, Task 3 test de `actualizarMiembro` con `null`).
5. **29 de febrero:** un miembro nacido el 29/02 solo recibe el saludo de cumpleaños los años bisiestos; se acepta y se documenta (no se maneja).

---

### Task 1: Dominio — tipo `Saludo`, `parsearSaludo` y `esCumpleanos`

**Files:**
- Modify: `packages/domain/entities/Miembro.ts`
- Modify: `packages/domain/utils/fechaCaracas.ts`
- Create: `packages/domain/entities/Miembro.test.ts`
- Create: `packages/domain/utils/fechaCaracas.test.ts` (si ya existe, añadir el `describe` al final)

**Interfaces:**
- Produces (usados en Tasks 2, 3, 4):
  - `SALUDOS: readonly ["MASCULINO", "FEMENINO", "NEUTRO"]`, `type Saludo`, `parsearSaludo(valor: unknown): Saludo | null` (en `entities/Miembro.ts`)
  - `Miembro.saludo: Saludo | null`, `DatosNuevoMiembro.saludo?: Saludo | null`, `CambiosMiembro.saludo?: Saludo | null`
  - `esCumpleanos(fechaNacimiento: Date | null, ahora: Date): boolean` (en `utils/fechaCaracas.ts`)

- [ ] **Step 1: Escribir los tests que fallan**

`packages/domain/entities/Miembro.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { parsearSaludo, SALUDOS } from "./Miembro";

describe("parsearSaludo", () => {
  test("acepta los tres valores válidos", () => {
    for (const saludo of SALUDOS) expect(parsearSaludo(saludo)).toBe(saludo);
  });

  test("cualquier otra cosa es null (vacío, desconocido, minúsculas, no texto)", () => {
    expect(parsearSaludo("")).toBeNull();
    expect(parsearSaludo("OTRO")).toBeNull();
    expect(parsearSaludo("masculino")).toBeNull();
    expect(parsearSaludo(null)).toBeNull();
    expect(parsearSaludo(undefined)).toBeNull();
    expect(parsearSaludo(5)).toBeNull();
  });
});
```

En `packages/domain/utils/fechaCaracas.test.ts` (crear con este contenido si no existe; si existe, añadir el `import { esCumpleanos }` al import actual y este bloque al final):

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
Expected: FAIL — `parsearSaludo`/`SALUDOS`/`esCumpleanos` no exportados.

- [ ] **Step 3: Implementar el tipo y `parsearSaludo`**

En `packages/domain/entities/Miembro.ts`, justo antes de `export interface Miembro {` añadir:

```ts
// Cómo saluda el kiosco al miembro: "Campeón", "Campeona" o "Adrenaliner". null = sin definir.
export const SALUDOS = ["MASCULINO", "FEMENINO", "NEUTRO"] as const;
export type Saludo = (typeof SALUDOS)[number];

export function parsearSaludo(valor: unknown): Saludo | null {
  return SALUDOS.find((saludo) => saludo === valor) ?? null;
}

```

Y añadir los campos: en `interface Miembro`, después de `ajustarFecha: boolean; ...` añadir `saludo: Saludo | null; // cómo lo saluda el kiosco; null = sin definir`; en `interface DatosNuevoMiembro`, después de `precioPlan: number;` añadir `saludo?: Saludo | null;`; en `interface CambiosMiembro`, después de `ajustarFecha?: boolean;` añadir `saludo?: Saludo | null;`.

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
En cada archivo de **test** (`*.test.ts`) que construya un literal tipado `Miembro` con `ajustarFecha:`, añadir `saludo: null,` al literal (por ejemplo `packages/domain/use-cases/CambiarPlanConPago.test.ts`). No tocar código de producción en este paso (el mapper del repositorio se actualiza en la Task 2).

- [ ] **Step 6: Verificar que pasan**

Run: `npm test --workspace packages/domain`
Expected: PASS (los tests anteriores más los nuevos).

- [ ] **Step 7: Commit**

```bash
git add packages/domain
git commit -m "agrega el tipo Saludo, parsearSaludo y esCumpleanos al dominio"
git push origin main
```

---

### Task 2: Schema, migración, repositorio y check-in

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/20261008000000_miembro_saludo/migration.sql`
- Modify: `packages/infrastructure/persistence/prisma/PrismaMemberRepository.ts`
- Modify: `packages/domain/use-cases/RegistrarCheckIn.ts`
- Create: `packages/domain/use-cases/RegistrarCheckIn.test.ts`
- Modify: `apps/web-admin/app/api/checkin/route.ts`

**Interfaces:**
- Consumes: `Saludo`, `esCumpleanos` (Task 1).
- Produces: `Miembro.saludo` leído desde la base; `RegistrarCheckInResultado.saludo: Saludo | null` y `RegistrarCheckInResultado.esCumpleanos: boolean`; la respuesta JSON de `POST /api/checkin` suma `saludo` y `esCumpleanos`.

- [ ] **Step 1: Escribir el test que falla**

`packages/domain/use-cases/RegistrarCheckIn.test.ts` (usa la ruta de "check-in repetido" que no consulta suscripciones, para aislar el saludo y el cumpleaños):

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
        saludo: null,
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

describe("registrarCheckIn — saludo y cumpleaños", () => {
  test("devuelve el saludo del miembro", async () => {
    const resultado = await registrarCheckIn(crearDeps({ saludo: "FEMENINO" }), input);
    expect(resultado.saludo).toBe("FEMENINO");
  });

  test("devuelve saludo null cuando el miembro no lo tiene definido", async () => {
    const resultado = await registrarCheckIn(crearDeps({ saludo: null }), input);
    expect(resultado.saludo).toBeNull();
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
Expected: FAIL — `resultado.saludo` es `undefined` (la propiedad todavía no existe en el resultado).

- [ ] **Step 3: Implementar en el caso de uso**

En `packages/domain/use-cases/RegistrarCheckIn.ts`:
- Añadir imports: `import type { Saludo } from "../entities/Miembro";` y `import { esCumpleanos } from "../utils/fechaCaracas";`.
- En `interface RegistrarCheckInResultado`, después de `tieneGraciaConfigurada: boolean;` añadir:

```ts
  // Preferencia de saludo del miembro (null = sin definir) y si hoy (día de Caracas) es su cumpleaños.
  // La fecha de nacimiento nunca sale del servidor: el kiosco solo recibe este booleano.
  saludo: Saludo | null;
  esCumpleanos: boolean;
```
- En el objeto `const base = { ... }`, después de `sucursalAsignadaDireccion: sucursalAsignada?.direccion ?? null,` añadir:

```ts
    saludo: miembro.saludo,
    esCumpleanos: esCumpleanos(miembro.fechaNacimiento, new Date()),
```
(`base` se esparce en las dos rutas de retorno: check-in repetido y nuevo, así que ambas lo incluyen.)

- [ ] **Step 4: Schema y migración**

En `packages/db/prisma/schema.prisma`: justo antes de `model Miembro {` añadir

```prisma
enum Saludo {
  MASCULINO // "Campeón"
  FEMENINO // "Campeona"
  NEUTRO // "Adrenaliner"
}

```

y en `model Miembro`, después de la línea `ajustarFecha Boolean ...` añadir

```prisma
  saludo           Saludo? // cómo lo saluda el kiosco; null = sin definir (usa "¡BIENVENID@, ADRENALINER!")
```

Crear `packages/db/prisma/migrations/20261008000000_miembro_saludo/migration.sql`:

```sql
-- CreateEnum
CREATE TYPE "Saludo" AS ENUM ('MASCULINO', 'FEMENINO', 'NEUTRO');

-- AlterTable
ALTER TABLE "Miembro" ADD COLUMN "saludo" "Saludo";
```

Run: `npm run generate --workspace packages/db`
Expected: "Generated Prisma Client". (NO ejecutar `migrate`: ver Global Constraints.)

- [ ] **Step 5: Repositorio**

En `packages/infrastructure/persistence/prisma/PrismaMemberRepository.ts`:
- Import: `import type { Miembro, DatosNuevoMiembro, CambiosMiembro, Saludo } from "@gym-app/domain/entities/Miembro";` (ampliar el import existente).
- En `type FilaMiembro`, después de `ajustarFecha: boolean;` añadir `saludo: Saludo | null;`.
- En `mapear`, después de `ajustarFecha: miembro.ajustarFecha,` añadir `saludo: miembro.saludo,`.
(`crear` y `actualizar` ya pasan `datos`/`cambios` directo a Prisma: no necesitan cambios.)

- [ ] **Step 6: Respuesta de `/api/checkin`**

En `apps/web-admin/app/api/checkin/route.ts`, dentro del objeto de la respuesta 200, después de `tieneGraciaConfigurada: resultado.tieneGraciaConfigurada,` añadir:

```ts
        saludo: resultado.saludo,
        esCumpleanos: resultado.esCumpleanos,
```

- [ ] **Step 7: Verificar**

Run: `npm test --workspace packages/domain` → Expected: PASS (incluye los 4 tests nuevos).
Run: `npx tsc --noEmit -p apps/web-admin` → Expected: sin errores.
Run: `npm test --workspace packages/db` → Expected: PASS (si falla por algo que no tiene que ver con este cambio, reportarlo sin arreglarlo).

- [ ] **Step 8: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations/20261008000000_miembro_saludo packages/infrastructure/persistence/prisma/PrismaMemberRepository.ts packages/domain/use-cases/RegistrarCheckIn.ts packages/domain/use-cases/RegistrarCheckIn.test.ts apps/web-admin/app/api/checkin/route.ts
git commit -m "agrega el campo saludo al miembro y devuelve saludo y cumpleaños en el check-in"
git push origin main
```

---

### Task 3: Web-admin — saludo y fecha de nacimiento en la ficha del miembro

**Files:**
- Modify: `apps/web-admin/app/(panel)/miembros/FormularioMiembro.tsx`
- Modify: `apps/web-admin/app/(panel)/miembros/actions.ts`
- Modify: `apps/web-admin/app/(panel)/miembros/[id]/page.tsx`
- Test: `packages/domain/use-cases/ActualizarMiembro.test.ts`

**Interfaces:**
- Consumes: `SALUDOS`, `Saludo`, `parsearSaludo` (Task 1); `CambiosMiembro.saludo`/`fechaNacimiento`.
- Produces: el formulario envía `saludo` ("" | MASCULINO | FEMENINO | NEUTRO) y `fechaNacimiento` (yyyy-mm-dd o ""); las acciones de crear y actualizar los guardan (`null` si vienen vacíos o inválidos).

- [ ] **Step 1: Test que pina que `null` llega al repositorio**

En `packages/domain/use-cases/ActualizarMiembro.test.ts`, añadir al final (usa los helpers `crearDeps` y `base` ya definidos en ese archivo; si `describe`/`test` ya están importados no repetir el import):

```ts
describe("actualizarMiembro — saludo y fecha de nacimiento", () => {
  test("pasa saludo y fechaNacimiento null al repositorio (vaciar un valor no se ignora)", async () => {
    const { deps, cambiosGuardados } = crearDeps(false);
    await actualizarMiembro(deps, { ...base, cambios: { saludo: null, fechaNacimiento: null } });
    expect(cambiosGuardados[0]).toEqual({ saludo: null, fechaNacimiento: null });
  });

  test("pasa un saludo y una fecha de nacimiento definidos", async () => {
    const { deps, cambiosGuardados } = crearDeps(false);
    const nacimiento = new Date(1990, 9, 8);
    await actualizarMiembro(deps, { ...base, cambios: { saludo: "FEMENINO", fechaNacimiento: nacimiento } });
    expect(cambiosGuardados[0]).toEqual({ saludo: "FEMENINO", fechaNacimiento: nacimiento });
  });
});
```

Run: `npm test --workspace packages/domain -- ActualizarMiembro`
Expected: PASS ya con el código actual (el caso de uso pasa `cambios` tal cual); este test fija ese contrato para que un cambio futuro no lo rompa. Si FALLA, reportarlo como BLOCKED: significaría que el caso de uso filtra campos y habría que ajustarlo.

- [ ] **Step 2: Acciones — leer y guardar los campos**

En `apps/web-admin/app/(panel)/miembros/actions.ts`:
- Añadir al import del dominio de miembro (o crear la línea): `import { parsearSaludo } from "@gym-app/domain/entities/Miembro";`
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
        saludo: parsearSaludo(formData.get("saludo")),
```

- En `actualizarMiembroAction`, dentro de `cambios: { ... }`, después de la línea `celular: formData.get("celular")?.toString() || null,` añadir:

```ts
          fechaNacimiento: leerFecha(formData.get("fechaNacimiento")),
          saludo: parsearSaludo(formData.get("saludo")),
```

(En edición el formulario siempre envía ambos campos, así que vaciarlos los pone en `null`.)

- [ ] **Step 3: Página de edición — valores iniciales**

En `apps/web-admin/app/(panel)/miembros/[id]/page.tsx`, dentro de `valoresIniciales={{ ... }}`, después de la línea `fechaInscripcion: ...` añadir:

```tsx
          fechaNacimiento: miembro.fechaNacimiento ? formatearFechaISO(miembro.fechaNacimiento) : "",
          saludo: miembro.saludo ?? "",
```

- [ ] **Step 4: Formulario — estado, cambios sin guardar y campos**

En `apps/web-admin/app/(panel)/miembros/FormularioMiembro.tsx`:
1. Import: `import { SALUDOS, type Saludo } from "@gym-app/domain/entities/Miembro";`
2. En `interface ValoresFormularioMiembro`, después de `fechaInscripcion: string; // yyyy-mm-dd` añadir:

```ts
  fechaNacimiento: string; // yyyy-mm-dd, "" si no tiene
  saludo: Saludo | ""; // "" = sin definir
```
3. Junto a `ETIQUETA_FRECUENCIA` añadir:

```ts
const ETIQUETA_SALUDO: Record<Saludo, string> = {
  MASCULINO: "Campeón",
  FEMENINO: "Campeona",
  NEUTRO: "Adrenaliner",
};
```
4. Junto a los otros `useState` de datos personales (después de `const [fechaInscripcion, ...]`) añadir:

```ts
  const [fechaNacimiento, setFechaNacimiento] = useState(valoresIniciales?.fechaNacimiento ?? "");
  const [saludo, setSaludo] = useState<Saludo | "">(valoresIniciales?.saludo ?? "");
```
5. En `hayCambiosSinGuardar`, después de la línea `fechaInscripcion !== valoresIniciales.fechaInscripcion ||` añadir:

```ts
      fechaNacimiento !== valoresIniciales.fechaNacimiento ||
      saludo !== valoresIniciales.saludo ||
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
                Saludo en el kiosco
                <select
                  name="saludo"
                  value={saludo}
                  onChange={(e) => setSaludo(e.target.value as Saludo | "")}
                  className="min-h-11 rounded-lg border px-3 outline-none focus:border-[var(--gx-accent)]"
                  style={{ background: "var(--gx-surface-2)", borderColor: "var(--gx-edge)", color: "var(--gx-ink)" }}
                >
                  <option value="">Sin definir</option>
                  {SALUDOS.map((opcion) => (
                    <option key={opcion} value={opcion}>
                      {ETIQUETA_SALUDO[opcion]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
```

- [ ] **Step 5: Verificar**

Run: `npx tsc --noEmit -p apps/web-admin` → Expected: sin errores.
Run: `npm run lint --workspace apps/web-admin 2>&1 | tail -15` y comparar con la línea base: antes de editar (`git stash` o leyendo el estado previo) `FormularioMiembro.tsx` ya tenía 2 errores de lint conocidos (handoff sección 3, "Foto de perfil"); el cambio **no debe añadir errores nuevos** (reportar el conteo antes/después de ese archivo).
Run: `npm test --workspace packages/domain` → Expected: PASS.
No hay forma de probar el formulario contra la base hasta que se despliegue la migración; reportar que no se ejercitó en vivo.

- [ ] **Step 6: Commit**

```bash
git add "apps/web-admin/app/(panel)/miembros/FormularioMiembro.tsx" "apps/web-admin/app/(panel)/miembros/actions.ts" "apps/web-admin/app/(panel)/miembros/[id]/page.tsx" packages/domain/use-cases/ActualizarMiembro.test.ts
git commit -m "agrega el saludo y la fecha de nacimiento a la ficha del miembro en web-admin"
git push origin main
```

---

### Task 4: Kiosco — frases por género, saludo y cumpleaños en la ficha

**Files:**
- Modify: `apps/kiosk/lib/frases.ts`
- Create: `apps/kiosk/lib/saludo.ts`
- Test: `apps/kiosk/lib/saludo.test.ts`
- Modify: `apps/kiosk/lib/api.ts`
- Modify: `apps/kiosk/lib/estadoPantalla.ts`
- Modify: `apps/kiosk/app/page.tsx`
- Modify: `apps/kiosk/components/AccessCard.tsx`

**Interfaces:**
- Consumes: `crearBolsa` (F1, `lib/bolsaFrases.ts`), `FRASE_BIENVENIDA_NEUTRA` (F1, `lib/frases.ts`), campos `saludo`/`esCumpleanos` de `POST /api/checkin` (Task 2).
- Produces:
  - `interface FraseConGenero { m: string; f: string; n: string }`, `FRASES_FICHA: readonly FraseConGenero[]` (8), `FRASE_CUMPLEANOS: FraseConGenero` (en `lib/frases.ts`)
  - `type Saludo = "MASCULINO" | "FEMENINO" | "NEUTRO"`, `textoSaludo(saludo: Saludo | null | undefined, esCumpleanos: boolean | undefined, siguienteFrase: () => FraseConGenero): string` (en `lib/saludo.ts`)
  - `ResultadoCheckIn.saludo?: Saludo | null`, `ResultadoCheckIn.esCumpleanos?: boolean`
  - `Ficha` (variante `resultado`) gana `saludo: string` (texto ya resuelto); `AccessCard` recibe la prop `saludo: string`.

- [ ] **Step 1: Escribir los tests que fallan**

`apps/kiosk/lib/saludo.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { FRASES_FICHA, FRASE_BIENVENIDA_NEUTRA, FRASE_CUMPLEANOS, type FraseConGenero } from "./frases";
import { textoSaludo } from "./saludo";

const FRASE: FraseConGenero = { m: "¡VAMOS, CAMPEÓN!", f: "¡VAMOS, CAMPEONA!", n: "¡VAMOS, ADRENALINER!" };

describe("textoSaludo", () => {
  it("con saludo null o undefined (miembros ya existentes o API viejo) usa la bienvenida neutra y no gasta la bolsa", () => {
    const siguiente = vi.fn(() => FRASE);
    expect(textoSaludo(null, false, siguiente)).toBe(FRASE_BIENVENIDA_NEUTRA);
    expect(textoSaludo(undefined, undefined, siguiente)).toBe(FRASE_BIENVENIDA_NEUTRA);
    expect(siguiente).not.toHaveBeenCalled();
  });

  it("elige la columna según el saludo", () => {
    expect(textoSaludo("MASCULINO", false, () => FRASE)).toBe("¡VAMOS, CAMPEÓN!");
    expect(textoSaludo("FEMENINO", false, () => FRASE)).toBe("¡VAMOS, CAMPEONA!");
    expect(textoSaludo("NEUTRO", false, () => FRASE)).toBe("¡VAMOS, ADRENALINER!");
  });

  it("el cumpleaños manda sobre la frase normal y respeta el saludo", () => {
    const siguiente = vi.fn(() => FRASE);
    expect(textoSaludo("MASCULINO", true, siguiente)).toBe("¡FELIZ CUMPLEAÑOS, CAMPEÓN!");
    expect(textoSaludo("FEMENINO", true, siguiente)).toBe("¡FELIZ CUMPLEAÑOS, CAMPEONA!");
    expect(textoSaludo("NEUTRO", true, siguiente)).toBe("¡FELIZ CUMPLEAÑOS, ADRENALINER!");
    expect(siguiente).not.toHaveBeenCalled();
  });

  it("el cumpleaños sin saludo definido usa la versión neutra (sin @)", () => {
    expect(textoSaludo(null, true, () => FRASE)).toBe("¡FELIZ CUMPLEAÑOS, ADRENALINER!");
    expect(textoSaludo(undefined, true, () => FRASE)).toBe("¡FELIZ CUMPLEAÑOS, ADRENALINER!");
  });
});

describe("frases de la ficha", () => {
  it("hay 8 frases con las tres columnas llenas", () => {
    expect(FRASES_FICHA).toHaveLength(8);
    for (const frase of FRASES_FICHA) {
      expect(frase.m).not.toBe("");
      expect(frase.f).not.toBe("");
      expect(frase.n).not.toBe("");
    }
  });

  it("la @ solo existe en la bienvenida neutra", () => {
    const textos = [...FRASES_FICHA, FRASE_CUMPLEANOS].flatMap((frase) => [frase.m, frase.f, frase.n]);
    expect(textos.some((texto) => texto.includes("@"))).toBe(false);
    expect(FRASE_BIENVENIDA_NEUTRA).toContain("@");
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test --workspace apps/kiosk -- saludo`
Expected: FAIL — no se puede resolver `./saludo` ni `FRASES_FICHA`.

- [ ] **Step 3: Añadir las frases**

Al final de `apps/kiosk/lib/frases.ts` añadir (el archivo ya exporta `FRASES_REPOSO` y `FRASE_BIENVENIDA_NEUTRA`; no tocarlos):

```ts

// Frase de la ficha real con una variante por saludo del miembro: m = Campeón, f = Campeona,
// n = Adrenaliner. Spec §6. Sin "@" en ninguna.
export interface FraseConGenero {
  m: string;
  f: string;
  n: string;
}

export const FRASES_FICHA: readonly FraseConGenero[] = [
  { m: "¡VAMOS, CAMPEÓN!", f: "¡VAMOS, CAMPEONA!", n: "¡VAMOS, ADRENALINER!" },
  { m: "¡BIENVENIDO, GUERRERO!", f: "¡BIENVENIDA, GUERRERA!", n: "¡QUÉ BUENO VERTE, ADRENALINER!" },
  { m: "¡HOY ERES IMPARABLE, CAMPEÓN!", f: "¡HOY ERES IMPARABLE, CAMPEONA!", n: "¡HOY ERES IMPARABLE, ADRENALINER!" },
  { m: "¡DALE CON TODO, FIERA!", f: "¡DALE CON TODO, FIERA!", n: "¡DALE CON TODO, ADRENALINER!" },
  { m: "¡A ENTRENAR, CRACK!", f: "¡A ENTRENAR, CRACK!", n: "¡A ENTRENAR, ADRENALINER!" },
  { m: "¡ESE ES EL ESPÍRITU, CAMPEÓN!", f: "¡ESE ES EL ESPÍRITU, CAMPEONA!", n: "¡ESE ES EL ESPÍRITU, ADRENALINER!" },
  { m: "¡TU CONSTANCIA INSPIRA, CAMPEÓN!", f: "¡TU CONSTANCIA INSPIRA, CAMPEONA!", n: "¡TU CONSTANCIA INSPIRA, ADRENALINER!" },
  { m: "¡SIGUE ASÍ, GUERRERO!", f: "¡SIGUE ASÍ, GUERRERA!", n: "¡SIGUE ASÍ, ADRENALINER!" },
];

export const FRASE_CUMPLEANOS: FraseConGenero = {
  m: "¡FELIZ CUMPLEAÑOS, CAMPEÓN!",
  f: "¡FELIZ CUMPLEAÑOS, CAMPEONA!",
  n: "¡FELIZ CUMPLEAÑOS, ADRENALINER!",
};
```

- [ ] **Step 4: Implementar `saludo.ts`**

`apps/kiosk/lib/saludo.ts`:

```ts
import { FRASE_BIENVENIDA_NEUTRA, FRASE_CUMPLEANOS, type FraseConGenero } from "./frases";

// Mismos valores que el enum `Saludo` del servidor (el kiosco no importa paquetes de dominio).
export type Saludo = "MASCULINO" | "FEMENINO" | "NEUTRO";

const COLUMNA = { MASCULINO: "m", FEMENINO: "f", NEUTRO: "n" } as const;

// Texto con que la ficha real saluda al miembro. `saludo` y `esCumpleanos` pueden faltar (miembros sin
// saludo definido o un API viejo que no los envía): en ese caso se saluda en neutro. `siguienteFrase`
// solo se consume cuando hay saludo definido y no es cumpleaños, para no gastar la bolsa en vano.
export function textoSaludo(
  saludo: Saludo | null | undefined,
  esCumpleanos: boolean | undefined,
  siguienteFrase: () => FraseConGenero
): string {
  if (esCumpleanos) return FRASE_CUMPLEANOS[saludo ? COLUMNA[saludo] : "n"];
  if (!saludo) return FRASE_BIENVENIDA_NEUTRA;
  return siguienteFrase()[COLUMNA[saludo]];
}
```

- [ ] **Step 5: Verificar que pasan**

Run: `npm test --workspace apps/kiosk`
Expected: PASS (los tests de F1 más los nuevos).

- [ ] **Step 6: Tipos del API y de la ficha**

En `apps/kiosk/lib/api.ts`:
- Añadir al principio, junto a los otros imports/constantes: `import type { Saludo } from "./saludo";`
- En `interface ResultadoCheckIn`, después de `tieneGraciaConfigurada: boolean;` añadir:

```ts
  // Opcionales: un API viejo no los envía (el kiosco los trata como "sin definir" / "no es cumpleaños").
  saludo?: Saludo | null;
  esCumpleanos?: boolean;
```

En `apps/kiosk/lib/estadoPantalla.ts`, en la variante `resultado` de `Ficha`, añadir el campo `saludo: string;` (junto a `hora`, `cara`, etc.) con el comentario `// texto del saludo ya resuelto (frase por género o de cumpleaños)`.

- [ ] **Step 7: `page.tsx` y `AccessCard.tsx`**

Antes de tocar nada, lee ambos archivos (el `page.tsx` y el `AccessCard.tsx` actuales incluyen las correcciones de la revisión final de F1: `fotoOk`, el `try/finally` de `enviar`, etc.) y haz **solo** estos cambios:

En `apps/kiosk/app/page.tsx`:
- Imports: `import { crearBolsa } from "@/lib/bolsaFrases";`, `import { FRASES_FICHA, FRASES_REPOSO } from "@/lib/frases";` (ampliar el import existente de `FRASES_REPOSO`) y `import { textoSaludo } from "@/lib/saludo";`.
- A nivel de módulo, junto a las otras constantes (`DURACION_FICHA_MS`, etc.): `const siguienteFraseFicha = crearBolsa(FRASES_FICHA);`
- En `enviar`, donde se construye la ficha `{ tipo: "resultado", ... }` tras `registrarCheckIn`, añadir el campo: `saludo: textoSaludo(resultado.saludo, resultado.esCumpleanos, siguienteFraseFicha),`
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
git commit -m "saluda en la ficha con frases por género y saludo de cumpleaños"
git push origin main
```

---

### Task 5: Documentación y cierre

**Files:**
- Modify: `handoff.md`

- [ ] **Step 1: Verificación de punta a punta (checklist para el usuario; lo automatizable ya corrió en las tareas)**

Escribir en `handoff.md` estos pasos, sin ejecutarlos:
1. Desplegar **primero** `apps/web-admin` (al arrancar el contenedor aplica la migración `20261008000000_miembro_saludo`; antes de desplegar, revisar `pg_stat_activity` por sesiones `idle in transaction`, como en las migraciones anteriores) y **después** `apps/kiosk`.
2. En web-admin, editar un miembro de prueba: poner "Saludo en el kiosco" = Campeona y una fecha de nacimiento = hoy; guardar, recargar la ficha y comprobar que se conservan; luego vaciar ambos campos, guardar y comprobar que vuelven a "Sin definir" / vacío.
3. En el kiosco, check-in con ese miembro: la ficha debe decir "¡FELIZ CUMPLEAÑOS, CAMPEONA!" el día del cumpleaños y, otro día, una frase femenina de la lista; con un miembro sin saludo debe decir "¡BIENVENID@, ADRENALINER!".
4. Probar un kiosco con la versión anterior contra el API nuevo (o ignorar `saludo` en la respuesta): sigue funcionando.

- [ ] **Step 2: Actualizar `handoff.md`**

Con los 5 apartados de CLAUDE.md: en "Estado actual", añadir la Fase 2 implementada (sin campaña, con fecha de nacimiento editable) y qué falta (despliegue + checklist); en "Archivos y cambios", listar los archivos de este plan; en "Intentos fallidos" **añadir** (sin borrar nada) lo que no haya funcionado durante la ejecución y la decisión de descartar la campaña; en "Próximos pasos", el despliegue en el orden indicado y el plan de la Fase 3 (APK). Actualizar también la mención de F2 en la entrada del rediseño (quitar "campaña con `*`/`-`/`+`").

- [ ] **Step 3: Commit**

```bash
git add handoff.md
git commit -m "actualiza el handoff con la fase 2 del rediseño del kiosco"
git push origin main
```

---

## Self-Review (hecha al escribir el plan)

- **Cobertura del spec F2 (§10, ya sin campaña):** `Miembro.saludo` + migración → Task 2; `saludo`/`esCumpleanos` en `/api/checkin` → Task 2; selector de saludo y fecha de nacimiento en web-admin → Task 3; frases por género y cumpleaños en la ficha → Task 4. Lo descartado (campaña, `saludoPreguntas`, `POST /api/checkin/saludo`, `preguntarSaludo`) no aparece en ninguna tarea.
- **Sin marcadores pendientes:** cada paso de código lleva el código o la instrucción exacta con su ancla; los pasos que dependen del estado actual de `page.tsx`/`AccessCard.tsx` (corregidos en la revisión final de F1) piden leerlos primero y limitan el cambio a líneas concretas.
- **Consistencia de tipos:** `Saludo`/`SALUDOS`/`parsearSaludo` (Task 1) se usan igual en Tasks 2 y 3; `esCumpleanos` (Task 1) en Task 2; `FraseConGenero`/`textoSaludo`/`Saludo` del kiosco (Task 4) son independientes de los del dominio a propósito (el kiosco no importa paquetes de dominio); `Ficha.resultado.saludo: string` (Task 4) coincide con la prop `saludo: string` de `AccessCard`.
- **Riesgos:** la base remota es producción (no se ejecutan migraciones desde aquí); el formulario no se puede probar contra la base hasta que se aplique la migración; web-admin tiene errores de lint previos en `FormularioMiembro.tsx` que no deben aumentar.
