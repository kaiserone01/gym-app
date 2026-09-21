# Caja: un solo usuario a la vez por sucursal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un turno de caja abierto pertenece a quien lo abrió. Otro usuario (incluido un SOCIO, que ve todas las sucursales) nunca debe poder operar esa caja como si fuera suya: la ve en modo lectura con el nombre de quién la tiene abierta, y si intenta abrir turno en esa sucursal recibe un aviso con ese nombre en vez de silenciosamente compartir el turno.

**Architecture:** La regla "una sola caja abierta por sucursal" ya está bien aplicada a nivel de datos (`Turno.estado`, `TurnoYaAbiertoError`). El bug es de UI/sesión: `obtenerTurnoAbiertoParaUsuario` devuelve el turno abierto de la sucursal sin comparar `turno.usuarioId` contra el usuario actual, así que un SOCIO termina "usando" el turno de otro. Se cambia esa función para devolver también si el turno es del usuario actual (`esPropio`), se agrega el nombre del dueño (`Turno.usuarioNombre`) a las búsquedas de turno abierto, `/caja` deja de mostrar los formularios de operación cuando `esPropio` es `false` (modo lectura), y tanto `AbrirTurno` como el aviso de Miembros muestran quién tiene la caja abierta.

**Tech Stack:** Next.js App Router (Server Components + Server Actions), Prisma (driver adapter `@prisma/adapter-pg`), TypeScript, arquitectura hexagonal (`packages/domain` sin dependencias de framework).

**Spec:** No hay spec formal — tarea bounded, diseño acordado en chat (ver mensajes previos de esta conversación). Este plan es la única referencia escrita.

## Global Constraints

- No hay framework de tests configurado en el repo (sin `vitest`/`jest`, sin archivos `*.test.ts` existentes) — cada tarea se verifica con un script `tsx` de un solo uso contra la base real (mismo patrón usado en la investigación previa de esta sesión), documentado inline en el paso de verificación, y se borra al terminar la tarea.
- No agregar dependencias nuevas.
- `packages/domain` no puede importar nada de `apps/web-admin` (regla de arquitectura hexagonal ya documentada en el repo).
- Mensajes de usuario en español, mismo tono que el resto del código (ver mensajes de error existentes en `AbrirTurno.ts`, `AvisoCajaCerrada.tsx`).
- Seguir el patrón de comentarios del repo: explicar el *por qué*, no el *qué*, en cambios no obvios.
- Commits en español, formato `tipo: descripción breve en minúsculas`, sin líneas de atribución (Co-Authored-By) — instrucción vigente del usuario para esta sesión, aplica a partir de ahora.

---

### Task 1: `Turno.usuarioNombre` en las búsquedas de turno abierto

**Files:**
- Modify: `packages/infrastructure/persistence/prisma/PrismaTurnoRepository.ts:52-65` (`buscarAbiertoPorSucursal`, `buscarAbiertoEntreSucursales`)

**Interfaces:**
- Consumes: `Turno` (ya tiene el campo opcional `usuarioNombre?: string`, ver `packages/domain/entities/Turno.ts:13`); `PrismaClient.turno.findFirst` con `include: { usuario: true }`.
- Produces: `buscarAbiertoPorSucursal(sucursalId): Promise<Turno | null>` y `buscarAbiertoEntreSucursales(sucursalIds): Promise<Turno | null>` ahora devuelven `Turno` con `usuarioNombre` siempre poblado cuando hay turno. Las tareas 2 y 4 dependen de este campo estando presente.

- [ ] **Step 1: Escribir el script de verificación (antes del cambio, para confirmar el estado actual)**

Crear `packages/db/_verificar-usuarionombre.ts`:

```typescript
import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";
import path from "node:path";

config({ path: path.resolve(__dirname, "../../.env") });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const { PrismaTurnoRepository } = await import(
    "../infrastructure/persistence/prisma/PrismaTurnoRepository"
  );
  const repo = new PrismaTurnoRepository(prisma);

  const abierto = await prisma.turno.findFirst({ where: { estado: "ABIERTO" } });
  if (!abierto) {
    console.log("No hay ningún turno ABIERTO en la base — abrí uno para probar esto.");
    return;
  }

  const porSucursal = await repo.buscarAbiertoPorSucursal(abierto.sucursalId);
  console.log("buscarAbiertoPorSucursal ->", porSucursal?.usuarioNombre);

  const entreSucursales = await repo.buscarAbiertoEntreSucursales([abierto.sucursalId]);
  console.log("buscarAbiertoEntreSucursales ->", entreSucursales?.usuarioNombre);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Correr el script y confirmar que falla (usuarioNombre es undefined)**

Run: `cd packages/db && npx tsx _verificar-usuarionombre.ts`
Expected: si hay un turno abierto, ambas líneas imprimen `-> undefined`. Si no hay ninguno, abrir un turno de prueba desde `/caja` antes de continuar (o anotar el resultado como "sin turno abierto, verificar después del cambio").

- [ ] **Step 3: Implementar el include y mapeo de usuarioNombre**

En `packages/infrastructure/persistence/prisma/PrismaTurnoRepository.ts`, modificar `buscarAbiertoPorSucursal` y `buscarAbiertoEntreSucursales`:

```typescript
  async buscarAbiertoPorSucursal(sucursalId: string): Promise<Turno | null> {
    const turno = await this.prisma.turno.findFirst({
      where: { sucursalId, estado: "ABIERTO" },
      include: { usuario: true },
    });
    return turno ? { ...mapear(turno), usuarioNombre: turno.usuario.nombre } : null;
  }

  async buscarAbiertoEntreSucursales(sucursalIds: string[]): Promise<Turno | null> {
    if (sucursalIds.length === 0) return null;
    const turno = await this.prisma.turno.findFirst({
      where: { sucursalId: { in: sucursalIds }, estado: "ABIERTO" },
      include: { usuario: true },
    });
    return turno ? { ...mapear(turno), usuarioNombre: turno.usuario.nombre } : null;
  }
```

Nota: `mapear()` sigue recibiendo el objeto con la relación `usuario` incluida — TypeScript lo acepta porque `FilaTurno` es un subconjunto estructural de lo que Prisma devuelve; no hace falta tocar el tipo `FilaTurno`.

- [ ] **Step 4: Correr el script y confirmar que pasa**

Run: `cd packages/db && npx tsx _verificar-usuarionombre.ts`
Expected: ambas líneas imprimen el nombre real del usuario dueño del turno (ej. `-> admin`).

- [ ] **Step 5: Borrar el script de verificación**

Run: `rm packages/db/_verificar-usuarionombre.ts`

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit -p apps/web-admin/tsconfig.json`
Expected: sin errores nuevos.

- [ ] **Step 7: Commit**

```bash
git add packages/infrastructure/persistence/prisma/PrismaTurnoRepository.ts
git commit -m "feat: incluye el nombre del dueño al buscar el turno abierto de una sucursal"
```

---

### Task 2: `obtenerTurnoAbiertoParaUsuario` distingue turno propio de ajeno

**Files:**
- Modify: `apps/web-admin/app/(panel)/caja/obtenerTurnoAbiertoParaUsuario.ts`

**Interfaces:**
- Consumes: `Turno` (con `usuarioNombre`, de Task 1); `UsuarioAdmin.id`.
- Produces: nuevo tipo `TurnoAbiertoParaUsuario = { turno: Turno; esPropio: boolean } | null` y función `obtenerTurnoAbiertoParaUsuario(usuario): Promise<TurnoAbiertoParaUsuario>`. Las tareas 3, 5 y 6 consumen este tipo — la forma `{ turno, esPropio }` (no `Turno` directo) es la que deben esperar todos los call sites.

- [ ] **Step 1: Escribir el script de verificación**

Crear `packages/db/_verificar-espropio.ts`:

```typescript
import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";
import path from "node:path";

config({ path: path.resolve(__dirname, "../../.env") });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const { obtenerTurnoAbiertoParaUsuario } = await import(
    "../../apps/web-admin/app/(panel)/caja/obtenerTurnoAbiertoParaUsuario"
  );

  const abierto = await prisma.turno.findFirst({ where: { estado: "ABIERTO" } });
  if (!abierto) {
    console.log("No hay ningún turno ABIERTO — abrí uno para probar esto.");
    return;
  }

  const dueño = await prisma.usuarioAdmin.findUniqueOrThrow({ where: { id: abierto.usuarioId } });
  const otro = await prisma.usuarioAdmin.findFirstOrThrow({
    where: { organizacionId: dueño.organizacionId, id: { not: dueño.id }, rol: "SOCIO" },
  });

  const comoDueño = await obtenerTurnoAbiertoParaUsuario(dueño as any);
  console.log("dueño ->", comoDueño?.esPropio);

  const comoOtro = await obtenerTurnoAbiertoParaUsuario(otro as any);
  console.log("otro (SOCIO) ->", comoOtro?.esPropio, "turno.usuarioNombre:", comoOtro?.turno.usuarioNombre);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

(Requiere que exista al menos un usuario `SOCIO` distinto del dueño del turno en la misma organización — si no existe, crear uno de prueba o ajustar el filtro de rol al de un usuario real disponible.)

- [ ] **Step 2: Correr el script y confirmar que falla**

Run: `cd packages/db && npx tsx _verificar-espropio.ts`
Expected: error de TypeScript/runtime porque `esPropio` no existe todavía en el tipo devuelto (la función hoy devuelve `Turno | null` directo).

- [ ] **Step 3: Implementar el cambio**

Reemplazar el contenido completo de `apps/web-admin/app/(panel)/caja/obtenerTurnoAbiertoParaUsuario.ts`:

```typescript
import { prisma } from "@/lib/prisma";
import { PrismaTurnoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaTurnoRepository";
import type { Turno } from "@gym-app/domain/entities/Turno";
import type { UsuarioAdmin } from "@gym-app/domain/entities/UsuarioAdmin";
import { obtenerSucursalesVisiblesParaTurno } from "./obtenerSucursalesVisiblesParaTurno";

// El turno abierto visible para este usuario, con una bandera explícita de
// si es SUYO (turno.usuarioId === usuario.id) o de otra persona. Antes esta
// función devolvía el turno abierto de la sucursal sin esa distinción: un
// SOCIO (ve todas las sucursales) terminaba "usando" como propio el turno
// que otro usuario tenía abierto, pudiendo registrar pagos/egresos/cerrar
// una caja que no era suya (ver caso de uso: un solo usuario a la vez por
// caja). Gerente/Recepción tienen sucursalId fijo: basta buscar ahí, y ahí
// el turno encontrado siempre es de ellos mismos (regla de "una caja
// abierta por sucursal" a nivel de datos, ver TurnoYaAbiertoError)  salvo
// que hayan dos usuarios con la misma sucursalId fija, caso cubierto igual
// por la comparación de usuarioId. Un SOCIO no tiene sucursalId fijo — hay
// que buscar entre todas las que puede ver.
export interface TurnoAbiertoParaUsuario {
  turno: Turno;
  esPropio: boolean;
}

export async function obtenerTurnoAbiertoParaUsuario(
  usuario: UsuarioAdmin
): Promise<TurnoAbiertoParaUsuario | null> {
  const turnoRepo = new PrismaTurnoRepository(prisma);

  const turno = usuario.sucursalId
    ? await turnoRepo.buscarAbiertoPorSucursal(usuario.sucursalId)
    : await turnoRepo.buscarAbiertoEntreSucursales(
        (await obtenerSucursalesVisiblesParaTurno(usuario)).map((s) => s.id)
      );

  if (!turno) return null;

  return { turno, esPropio: turno.usuarioId === usuario.id };
}
```

- [ ] **Step 4: Correr el script y confirmar que pasa**

Run: `cd packages/db && npx tsx _verificar-espropio.ts`
Expected: `dueño -> true` y `otro (SOCIO) -> false` con el nombre real del dueño impreso.

- [ ] **Step 5: Borrar el script de verificación**

Run: `rm packages/db/_verificar-espropio.ts`

- [ ] **Step 6: Typecheck (se esperan errores en los call sites — no arreglarlos en esta tarea)**

Run: `npx tsc --noEmit -p apps/web-admin/tsconfig.json`
Expected: errores en `caja/page.tsx`, `miembros/page.tsx`, `miembros/nuevo/page.tsx`, `miembros/[id]/page.tsx` porque siguen usando `turnoAbierto` como si fuera `Turno` directo — se resuelven en las tareas 3, 5 y 6. Confirmar que **no** hay errores en ningún otro archivo.

- [ ] **Step 7: Commit**

```bash
git add "apps/web-admin/app/(panel)/caja/obtenerTurnoAbiertoParaUsuario.ts"
git commit -m "feat: obtenerTurnoAbiertoParaUsuario distingue si el turno es del usuario o de otro"
```

---

### Task 3: `/caja` en modo lectura cuando la caja es de otro usuario

**Files:**
- Modify: `apps/web-admin/app/(panel)/caja/page.tsx`
- Create: `apps/web-admin/app/(panel)/caja/AvisoCajaAjena.tsx`

**Interfaces:**
- Consumes: `TurnoAbiertoParaUsuario` (Task 2); `ResumenTurno` (`obtenerResumenTurno`, sin cambios).
- Produces: `AvisoCajaAjena` — componente que recibe `{ usuarioNombre: string; abiertoEn: Date }` y renderiza el aviso de solo-lectura. `PaginaCaja` ahora resuelve `turnoAbierto: TurnoAbiertoParaUsuario | null` y usa `turnoAbierto.turno.id` en vez de `turnoAbierto.id`.

- [ ] **Step 1: Crear el componente de aviso de solo lectura**

Crear `apps/web-admin/app/(panel)/caja/AvisoCajaAjena.tsx`:

```tsx
import { Card } from "@gym-app/ui/components/Card";

// Se muestra en vez de los formularios de operación (Registrar pago,
// Egreso, Arqueo) cuando la caja abierta de esta sucursal es de OTRO
// usuario — hoy esto le pasa sobre todo a un SOCIO, que ve todas las
// sucursales y antes terminaba operando la caja de otra persona como si
// fuera suya (ver caso de uso: un solo usuario a la vez por caja). Un
// SOCIO sí puede ver el estado/resumen de la caja (bajado en page.tsx),
// pero no registrar pagos, egresos ni cerrarla.
export function AvisoCajaAjena({ usuarioNombre, abiertoEn }: { usuarioNombre: string; abiertoEn: Date }) {
  return (
    <Card
      className="text-sm"
      style={{ borderColor: "var(--gx-warn)", background: "color-mix(in srgb, var(--gx-warn) 12%, transparent)" }}
    >
      <p style={{ color: "var(--gx-ink)" }}>
        Esta caja está abierta por <strong>{usuarioNombre}</strong> desde{" "}
        {abiertoEn.toLocaleString("es-VE")}. Solo podés ver el resumen — para registrar pagos, egresos o cerrarla
        tiene que hacerlo esa persona.
      </p>
    </Card>
  );
}
```

- [ ] **Step 2: Adaptar `page.tsx` al nuevo tipo y agregar el modo lectura**

En `apps/web-admin/app/(panel)/caja/page.tsx`:

Reemplazar:
```typescript
  const turnoAbierto = await obtenerTurnoAbiertoParaUsuario(usuario);

  // La sucursal "real" del turno encontrado — para un SOCIO puede diferir
  // de usuario.sucursalId (que es null), así que el resto de la página usa
  // esta en vez de usuario.sucursalId directamente.
  const sucursalId = turnoAbierto ? turnoAbierto.sucursalId : usuario.sucursalId;

  if (turnoAbierto) {
```
por:
```typescript
  const turnoAbierto = await obtenerTurnoAbiertoParaUsuario(usuario);

  // La sucursal "real" del turno encontrado — para un SOCIO puede diferir
  // de usuario.sucursalId (que es null), así que el resto de la página usa
  // esta en vez de usuario.sucursalId directamente.
  const sucursalId = turnoAbierto ? turnoAbierto.turno.sucursalId : usuario.sucursalId;

  if (turnoAbierto) {
    const esPropio = turnoAbierto.esPropio;
```

Reemplazar todas las referencias a `turnoAbierto.id` dentro de ese bloque (usadas al llamar `obtenerResumenTurno`) por `turnoAbierto.turno.id`.

Envolver el bloque de formularios de operación — `Registrar pago` (`FormularioPago`), `FormularioEgreso` y `FormularioArqueo` — en `{esPropio && (...)}`, y agregar `AvisoCajaAjena` cuando `!esPropio`. Concretamente, reemplazar:

```tsx
          <Card className="text-sm lg:col-span-2 lg:row-span-2">
            <h2 className="mb-3 font-semibold" style={{ color: "var(--gx-ink)" }}>
              Registrar pago
            </h2>
            <FormularioPago
              accion={registrarPagoAction}
              miembros={miembrosActivos}
              miembrosConPlan={miembrosActivos}
              planes={planesActivos}
              metodosPago={metodosPago}
              sucursalesVisibles={sucursalDelTurno}
              sucursalesOrganizacion={sucursalDelTurno}
              sucursalIdDefault={sucursalId}
              origen="caja"
            />
          </Card>
```
por:
```tsx
          {esPropio ? (
            <Card className="text-sm lg:col-span-2 lg:row-span-2">
              <h2 className="mb-3 font-semibold" style={{ color: "var(--gx-ink)" }}>
                Registrar pago
              </h2>
              <FormularioPago
                accion={registrarPagoAction}
                miembros={miembrosActivos}
                miembrosConPlan={miembrosActivos}
                planes={planesActivos}
                metodosPago={metodosPago}
                sucursalesVisibles={sucursalDelTurno}
                sucursalesOrganizacion={sucursalDelTurno}
                sucursalIdDefault={sucursalId}
                origen="caja"
              />
            </Card>
          ) : (
            <div className="lg:col-span-2 lg:row-span-2">
              <AvisoCajaAjena usuarioNombre={resumen.turno.usuarioNombre ?? "otro usuario"} abiertoEn={resumen.turno.abiertoEn} />
            </div>
          )}
```

Y envolver `FormularioEgreso` y `FormularioArqueo` (los dos bloques `<div className="lg:col-span-2">`/`<div className="lg:col-span-3">` que los contienen) en `{esPropio && (...)}` — sin reemplazo visual, simplemente no se renderizan para quien no es dueño del turno (el aviso ya está arriba, no hace falta repetirlo).

Agregar el import al principio del archivo:
```typescript
import { AvisoCajaAjena } from "./AvisoCajaAjena";
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p apps/web-admin/tsconfig.json`
Expected: sin errores en `caja/page.tsx`. Pueden persistir errores en `miembros/*` (se resuelven en tareas 5-6).

- [ ] **Step 4: Verificación manual con `/run`**

Con dos usuarios de prueba en la misma organización (uno dueño de un turno abierto, otro con rol SOCIO):
1. Loguear como el dueño del turno → confirmar que `/caja` se ve igual que antes (formularios completos).
2. Loguear como el SOCIO → confirmar que `/caja` muestra el resumen (Abierto desde, Fondo inicial, Resumen por método) pero en vez de "Registrar pago" aparece `AvisoCajaAjena` con el nombre correcto, y no aparecen `FormularioEgreso` ni `FormularioArqueo`.

- [ ] **Step 5: Commit**

```bash
git add "apps/web-admin/app/(panel)/caja/page.tsx" "apps/web-admin/app/(panel)/caja/AvisoCajaAjena.tsx"
git commit -m "feat: /caja muestra la caja de otro usuario en modo lectura en vez de dejar operarla"
```

---

### Task 4: Aviso con nombre al intentar abrir una caja ya abierta por otro

**Files:**
- Modify: `packages/domain/use-cases/AbrirTurno.ts`
- Modify: `apps/web-admin/app/(panel)/caja/actions.ts` (`abrirTurnoAction`)
- Modify: `apps/web-admin/app/(panel)/caja/FormularioAbrirTurno.tsx`

**Interfaces:**
- Consumes: `Turno.usuarioNombre` (Task 1); `ITurnoRepository.buscarAbiertoPorSucursal` (ya devuelve `usuarioNombre` desde Task 1).
- Produces: `TurnoYaAbiertoError` ahora expone `usuarioNombre: string` y un mensaje que lo incluye. `abrirTurnoAction` propaga ese mensaje sin cambios estructurales (ya usa `error.message`).

- [ ] **Step 1: Escribir el script de verificación**

Crear `packages/db/_verificar-mensaje-turnoyaabierto.ts`:

```typescript
import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";
import path from "node:path";

config({ path: path.resolve(__dirname, "../../.env") });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const { PrismaTurnoRepository } = await import(
    "../infrastructure/persistence/prisma/PrismaTurnoRepository"
  );
  const { PrismaSucursalRepository } = await import(
    "../infrastructure/persistence/prisma/PrismaSucursalRepository"
  );
  const { AuthorizationService } = await import("../domain/services/AuthorizationService");
  const { PrismaPermisoRepository } = await import(
    "../infrastructure/persistence/prisma/PrismaPermisoRepository"
  );
  const { abrirTurno } = await import("../domain/use-cases/AbrirTurno");

  const abierto = await prisma.turno.findFirst({ where: { estado: "ABIERTO" } });
  if (!abierto) {
    console.log("No hay ningún turno ABIERTO — abrí uno para probar esto.");
    return;
  }
  const otro = await prisma.usuarioAdmin.findFirstOrThrow({
    where: { organizacionId: abierto.organizacionId, id: { not: abierto.usuarioId } },
  });

  try {
    await abrirTurno(
      {
        turnos: new PrismaTurnoRepository(prisma),
        sucursales: new PrismaSucursalRepository(prisma),
        autorizacion: new AuthorizationService(new PrismaPermisoRepository(prisma)),
      },
      {
        organizacionId: abierto.organizacionId,
        sucursalId: abierto.sucursalId,
        usuarioId: otro.id,
        rolUsuario: otro.rol as any,
        fondoInicialEfectivoUSD: 0,
        fondoInicialEfectivoBs: 0,
      }
    );
    console.log("ERROR: no lanzó TurnoYaAbiertoError");
  } catch (e: any) {
    console.log("mensaje:", e.message);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Correr el script y confirmar el mensaje actual (sin nombre)**

Run: `cd packages/db && npx tsx _verificar-mensaje-turnoyaabierto.ts`
Expected: `mensaje: Ya hay un turno abierto en esta sucursal.` (sin nombre — este es el estado a mejorar).

- [ ] **Step 3: Implementar el cambio en `TurnoYaAbiertoError` y `abrirTurno`**

En `packages/domain/use-cases/AbrirTurno.ts`, reemplazar:

```typescript
export class TurnoYaAbiertoError extends Error {
  constructor() {
    super("Ya hay un turno abierto en esta sucursal.");
  }
}
```

por:

```typescript
export class TurnoYaAbiertoError extends Error {
  constructor(public readonly usuarioNombre: string) {
    super(`Ya hay una caja abierta en esta sucursal por ${usuarioNombre}.`);
  }
}
```

Y reemplazar:

```typescript
  const abierto = await deps.turnos.buscarAbiertoPorSucursal(input.sucursalId);
  if (abierto) {
    throw new TurnoYaAbiertoError();
  }
```

por:

```typescript
  const abierto = await deps.turnos.buscarAbiertoPorSucursal(input.sucursalId);
  if (abierto) {
    throw new TurnoYaAbiertoError(abierto.usuarioNombre ?? "otro usuario");
  }
```

- [ ] **Step 4: Correr el script y confirmar que pasa**

Run: `cd packages/db && npx tsx _verificar-mensaje-turnoyaabierto.ts`
Expected: `mensaje: Ya hay una caja abierta en esta sucursal por <nombre real>.`

- [ ] **Step 5: Borrar el script de verificación**

Run: `rm packages/db/_verificar-mensaje-turnoyaabierto.ts`

- [ ] **Step 6: Confirmar que `abrirTurnoAction` y `FormularioAbrirTurno` ya muestran el mensaje como pop-up sin cambios**

`abrirTurnoAction` (`apps/web-admin/app/(panel)/caja/actions.ts:58-67`) ya captura `TurnoYaAbiertoError` por `instanceof` y devuelve `{ error: error.message }` — el cambio del constructor no rompe ese `instanceof`, así que no requiere modificación.

`FormularioAbrirTurno.tsx:36-39` ya muestra `estado.error` vía `mostrarError(estado.error)` (toast/pop-up de `useFeedback`) — tampoco requiere cambios.

Confirmar leyendo ambos archivos que efectivamente no necesitan tocarse (no hacer una edición vacía).

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit -p apps/web-admin/tsconfig.json`
Expected: sin errores nuevos relacionados a `TurnoYaAbiertoError` (sigue siendo compatible allí donde se usa `new TurnoYaAbiertoError()` sin argumento — buscar otros usos).

Run: `grep -rn "new TurnoYaAbiertoError" apps packages --include="*.ts" --include="*.tsx"`
Expected: solo aparece el `throw` modificado en `AbrirTurno.ts`. Si aparece en algún otro lugar (ej. tests o seeds), actualizar esa llamada para pasar un nombre.

- [ ] **Step 8: Verificación manual con `/run`**

Con un turno ya abierto por el usuario A en la sucursal X: loguear como usuario B (con acceso a la sucursal X) e intentar abrir turno ahí. Confirmar que aparece el pop-up de error con el texto "Ya hay una caja abierta en esta sucursal por A."

- [ ] **Step 9: Commit**

```bash
git add packages/domain/use-cases/AbrirTurno.ts
git commit -m "feat: el aviso de caja ya abierta muestra el nombre de quien la tiene abierta"
```

---

### Task 5: Adaptar `miembros/page.tsx` al nuevo tipo (sin cambio de mensaje)

**Files:**
- Modify: `apps/web-admin/app/(panel)/miembros/page.tsx`

**Interfaces:**
- Consumes: `TurnoAbiertoParaUsuario` (Task 2).

- [ ] **Step 1: Adaptar el uso de `turnoAbierto`**

En `apps/web-admin/app/(panel)/miembros/page.tsx`, reemplazar:

```tsx
          {turnoAbierto ? (
            <Link href="/miembros/nuevo">
              <Button>Nuevo miembro</Button>
            </Link>
          ) : (
            <Button disabled title="Abrí la caja para poder inscribir un miembro">
              Nuevo miembro
            </Button>
          )}
        </div>
      </div>

      {!turnoAbierto && (
        <div className="mb-6 print:hidden">
          <AvisoCajaCerrada />
        </div>
      )}
```

por:

```tsx
          {turnoAbierto?.esPropio ? (
            <Link href="/miembros/nuevo">
              <Button>Nuevo miembro</Button>
            </Link>
          ) : (
            <Button
              disabled
              title={
                turnoAbierto
                  ? `La caja la tiene abierta ${turnoAbierto.turno.usuarioNombre ?? "otro usuario"}`
                  : "Abrí la caja para poder inscribir un miembro"
              }
            >
              Nuevo miembro
            </Button>
          )}
        </div>
      </div>

      {!turnoAbierto?.esPropio && (
        <div className="mb-6 print:hidden">
          <AvisoCajaCerrada
            mensaje={
              turnoAbierto
                ? `No podés inscribir miembros ni registrar pagos: la caja está abierta por ${turnoAbierto.turno.usuarioNombre ?? "otro usuario"}.`
                : undefined
            }
          />
        </div>
      )}
```

Nota: cuando `turnoAbierto` existe pero no es propio, el botón "Abrí la caja" de `AvisoCajaCerrada` (que enlaza a `/caja`) sigue siendo útil — al entrar a `/caja` el usuario verá el modo lectura de Task 3, no el formulario de abrir turno, lo cual es coherente.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p apps/web-admin/tsconfig.json`
Expected: sin errores en `miembros/page.tsx`.

- [ ] **Step 3: Verificación manual con `/run`**

Con un turno abierto por el usuario A: loguear como SOCIO B → en `/miembros`, confirmar que el botón "Nuevo miembro" está deshabilitado con tooltip mencionando a A, y que aparece el aviso con el mensaje "...la caja está abierta por A."

- [ ] **Step 4: Commit**

```bash
git add "apps/web-admin/app/(panel)/miembros/page.tsx"
git commit -m "feat: en Miembros el aviso de caja dice quien la tiene abierta si no es del usuario actual"
```

---

### Task 6: Adaptar `miembros/nuevo/page.tsx` y `miembros/[id]/page.tsx` al nuevo tipo

**Files:**
- Modify: `apps/web-admin/app/(panel)/miembros/nuevo/page.tsx`
- Modify: `apps/web-admin/app/(panel)/miembros/[id]/page.tsx`

**Interfaces:**
- Consumes: `TurnoAbiertoParaUsuario` (Task 2).

- [ ] **Step 1: Adaptar `miembros/nuevo/page.tsx`**

Reemplazar:

```tsx
  const turnoAbierto = await obtenerTurnoAbiertoParaUsuario(usuario);

  // Inscribir un miembro es una operación de caja (ver diseño acordado:
  // hay que abrir turno antes de inscribir o cobrar) — en vez del
  // formulario se muestra el aviso con acceso directo a Abrir turno.
  if (!turnoAbierto) {
    return (
      <div className="max-w-4xl p-6 lg:p-8">
        <div className="mb-6">
          <PageHeader>Nuevo miembro</PageHeader>
        </div>
        <AvisoCajaCerrada mensaje="Para inscribir un miembro primero tenés que abrir la caja." />
      </div>
    );
  }
```

por:

```tsx
  const turnoAbierto = await obtenerTurnoAbiertoParaUsuario(usuario);

  // Inscribir un miembro es una operación de caja (ver diseño acordado:
  // hay que abrir turno antes de inscribir o cobrar) — en vez del
  // formulario se muestra el aviso con acceso directo a Abrir turno. Si ya
  // hay una caja abierta pero es de OTRO usuario (típicamente un SOCIO
  // viendo la caja de otra sucursal), tampoco se deja operar — se avisa
  // quién la tiene abierta en vez de decir "abrí la caja" (ya está
  // abierta, solo que no por este usuario).
  if (!turnoAbierto?.esPropio) {
    return (
      <div className="max-w-4xl p-6 lg:p-8">
        <div className="mb-6">
          <PageHeader>Nuevo miembro</PageHeader>
        </div>
        <AvisoCajaCerrada
          mensaje={
            turnoAbierto
              ? `No podés inscribir miembros: la caja está abierta por ${turnoAbierto.turno.usuarioNombre ?? "otro usuario"}.`
              : "Para inscribir un miembro primero tenés que abrir la caja."
          }
        />
      </div>
    );
  }
```

- [ ] **Step 2: Adaptar `miembros/[id]/page.tsx`**

Localizar el uso de `turnoAbierto` en ese archivo (línea ~143, condicional de `AvisoCajaCerrada`) y aplicar el mismo patrón: reemplazar la condición `!turnoAbierto` por `!turnoAbierto?.esPropio`, y el `mensaje` fijo `"Para registrar un pago primero tenés que abrir la caja."` por la misma lógica condicional de Step 1 (adaptando el texto a "registrar un pago" en vez de "inscribir miembros").

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p apps/web-admin/tsconfig.json`
Expected: sin errores en ningún archivo del proyecto (todos los call sites de `obtenerTurnoAbiertoParaUsuario` ya están adaptados).

- [ ] **Step 4: Verificación manual con `/run`**

Con un turno abierto por el usuario A: loguear como SOCIO B → intentar entrar a `/miembros/nuevo` y a la ficha de un miembro existente (`/miembros/[id]`) → confirmar en ambos que aparece el aviso mencionando a A en vez del genérico "abrí la caja".

- [ ] **Step 5: Commit**

```bash
git add "apps/web-admin/app/(panel)/miembros/nuevo/page.tsx" "apps/web-admin/app/(panel)/miembros/[id]/page.tsx"
git commit -m "feat: los avisos de caja cerrada en Miembros dicen quien tiene la caja abierta"
```

---

## Self-Review Notes

- **Cobertura de los 4 puntos del caso de uso:**
  1. "Una sola caja abierta por sucursal" — ya estaba cubierto por `TurnoYaAbiertoError` a nivel de datos; no requiere tarea nueva, solo se confirma en Task 4.
  2. "Dos usuarios no pueden tener la misma caja en uso" — cubierto por Task 2 (distinción `esPropio`) + Task 3 (modo lectura en `/caja`, bloquea operar).
  3. "socio@gymdemo.com y admin@gymdemo.com controlando la misma caja" — root cause y fix en Task 2.
  4. "Pop-up con quién tiene la caja abierta al intentar abrirla" + "mensaje en Miembros con el nombre" — Task 4 (pop-up al abrir) + Tasks 5-6 (mensaje en Miembros).
- **Placeholders:** ninguno — cada paso tiene código completo, no hay "TODO" ni "similar a la tarea N" sin contenido repetido.
- **Consistencia de tipos:** `TurnoAbiertoParaUsuario` se define una sola vez (Task 2) y se consume igual en Tasks 3, 5, 6 (`turnoAbierto.turno`, `turnoAbierto.esPropio`). `TurnoYaAbiertoError` cambia su constructor en Task 4; Task 4 Step 7 incluye un grep para asegurar que no queda ningún otro `new TurnoYaAbiertoError()` sin argumento.
