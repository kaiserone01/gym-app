# Compartimentación de miembros por sucursal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ningún usuario ve ni puede operar miembros de una sucursal que no sea su `sucursalActivaId` (salvo miembros multisede), en listado, acceso directo por URL, edición, alta y registro de pagos.

**Architecture:** Un único punto de validación por caso de uso de dominio (`packages/domain`), no repetido en cada page/action/route de `apps/web-admin`. `listarMiembros` filtra en memoria; `obtenerMiembro`/`actualizarMiembro`/`registrarPago` lanzan un nuevo error de dominio (`MiembroFueraDeSucursalError`) cuando el miembro no pertenece a la sucursal activa. El formulario de alta/edición deja de ofrecer un selector de sedes específicas — la sede queda fija a la activa, con un toggle "Ambas sedes" solo si el plan lo permite. Se elimina el selector "Sede del pago" (contradecía la regla de que el pago siempre va a la sucursal activa).

**Tech Stack:** Next.js App Router (Server Components/Actions/Route Handlers), TypeScript, arquitectura hexagonal (`packages/domain` sin dependencias de framework).

**Spec:** `docs/superpowers/specs/2026-09-21-compartimentacion-miembros-sucursal-design.md`

## Global Constraints

- Ningún caso de uso de dominio existente cambia de comportamiento salvo lo descrito acá — cambios mínimos (CLAUDE.md regla 1).
- No hay framework de tests en este repo — verificación por `npx tsc --noEmit -p apps/web-admin/tsconfig.json` tras cada tarea, más scripts `tsx` one-off contra la base real cuando se indique, borrados después de usarse.
- Commits: mensaje único en español, sin body, sin firmas/atribución (CLAUDE.md regla 3).
- `RegistrarCheckIn` NO se toca — usa `buscarPorOrganizacionYCedula`, no `buscarPorId`, y ya valida sucursal contra el kiosco.
- Caja/Turno NO se toca — ya está separado por sucursal desde el plan anterior.
- Métodos de pago por sucursal quedan fuera de alcance.
- El pago de un miembro (multisede o no) se registra SIEMPRE en `sucursalActivaId` de quien cobra — sin excepción.

---

### Task 1: `MiembroFueraDeSucursalError` y `obtenerMiembro` scopeado

**Files:**
- Modify: `packages/domain/use-cases/ObtenerMiembro.ts`

**Interfaces:**
- Produces: `MiembroFueraDeSucursalError` (exportado desde `ObtenerMiembro.ts`), con el nombre de la sucursal correcta en el mensaje.
- Produces: `obtenerMiembro(deps, input)` ahora exige `input.sucursalActivaId: string` y `deps.sucursales: ISucursalRepository`.
- Consume: `ISucursalRepository.buscarPorId(organizacionId, id): Promise<Sucursal | null>` (puerto ya existente, `packages/domain/ports/ISucursalRepository.ts`).

- [ ] **Step 1: Reescribir `ObtenerMiembro.ts`**

```typescript
import { IMemberRepository } from "../ports/IMemberRepository";
import { ISucursalRepository } from "../ports/ISucursalRepository";
import { Miembro } from "../entities/Miembro";

export class MiembroNoEncontradoError extends Error {
  constructor() {
    super("No se encontró el miembro.");
  }
}

export class MiembroFueraDeSucursalError extends Error {
  constructor(public readonly sucursalNombre: string) {
    super(`Este miembro pertenece a ${sucursalNombre}. Inicia sesión en esa sucursal para verlo o editarlo.`);
  }
}

export async function obtenerMiembro(
  deps: { miembros: IMemberRepository; sucursales: ISucursalRepository },
  input: { organizacionId: string; id: string; sucursalActivaId: string }
): Promise<Miembro> {
  const miembro = await deps.miembros.buscarPorId(input.organizacionId, input.id);

  if (!miembro) {
    throw new MiembroNoEncontradoError();
  }

  // null = "Ambas" (multisede) — visible desde cualquier sucursal.
  if (miembro.sucursalId !== null && miembro.sucursalId !== input.sucursalActivaId) {
    const sucursal = await deps.sucursales.buscarPorId(input.organizacionId, miembro.sucursalId);
    throw new MiembroFueraDeSucursalError(sucursal?.nombre ?? "otra sucursal");
  }

  return miembro;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p apps/web-admin/tsconfig.json`
Expected: nuevos errores SOLO en los 3 call sites de `obtenerMiembro` (se arreglan en Tasks 4-6) — ningún error dentro de `packages/domain`.

- [ ] **Step 3: Commit**

```bash
git add packages/domain/use-cases/ObtenerMiembro.ts
git commit -m "feat: obtenerMiembro valida que el miembro pertenezca a la sucursal activa"
```

---

### Task 2: `actualizarMiembro` scopeado

**Files:**
- Modify: `packages/domain/use-cases/ActualizarMiembro.ts`

**Interfaces:**
- Consumes: `MiembroFueraDeSucursalError` de `ObtenerMiembro.ts` (Task 1) — se reexporta desde acá para no duplicar la clase.
- Produces: `actualizarMiembro(deps, input)` ahora exige `input.sucursalActivaId: string` y `deps.sucursales: ISucursalRepository`.

- [ ] **Step 1: Modificar `ActualizarMiembro.ts`**

```typescript
import { IMemberRepository } from "../ports/IMemberRepository";
import { IPlanRepository } from "../ports/IPlanRepository";
import { ISuscripcionRepository } from "../ports/ISuscripcionRepository";
import { ISucursalRepository } from "../ports/ISucursalRepository";
import { Miembro, CambiosMiembro } from "../entities/Miembro";
import { prorratearVencimiento } from "./CalcularVencimientoPlan";
import { MiembroFueraDeSucursalError } from "./ObtenerMiembro";

export { MiembroFueraDeSucursalError };

export class MiembroNoEncontradoError extends Error {
  constructor() {
    super("No se encontró el miembro.");
  }
}

export class PlanNoEncontradoError extends Error {
  constructor() {
    super("No se encontró el plan.");
  }
}

export async function actualizarMiembro(
  deps: {
    miembros: IMemberRepository;
    planes: IPlanRepository;
    suscripciones: ISuscripcionRepository;
    sucursales: ISucursalRepository;
  },
  input: { organizacionId: string; id: string; sucursalActivaId: string; cambios: CambiosMiembro }
): Promise<Miembro> {
  const antes = await deps.miembros.buscarPorId(input.organizacionId, input.id);
  if (!antes) {
    throw new MiembroNoEncontradoError();
  }

  if (antes.sucursalId !== null && antes.sucursalId !== input.sucursalActivaId) {
    const sucursal = await deps.sucursales.buscarPorId(input.organizacionId, antes.sucursalId);
    throw new MiembroFueraDeSucursalError(sucursal?.nombre ?? "otra sucursal");
  }

  const cambiaDePlan =
    input.cambios.planId !== undefined && input.cambios.planId !== null && input.cambios.planId !== antes.planId;

  const actualizado = await deps.miembros.actualizar(input.organizacionId, input.id, input.cambios);
  if (!actualizado) {
    throw new MiembroNoEncontradoError();
  }

  if (cambiaDePlan && antes.planId) {
    const ahora = new Date();
    const activa = await deps.suscripciones.buscarActivaVigentePorMiembroYPlan(input.id, antes.planId, ahora);

    if (activa) {
      const [planViejo, planNuevo] = await Promise.all([
        deps.planes.buscarPorId(input.organizacionId, antes.planId),
        deps.planes.buscarPorId(input.organizacionId, input.cambios.planId as string),
      ]);

      if (!planNuevo) {
        throw new PlanNoEncontradoError();
      }

      if (planViejo) {
        const nuevoFin = prorratearVencimiento(activa.inicio, ahora, planViejo.frecuencia, planNuevo.frecuencia);
        await deps.suscripciones.extenderFin(activa.id, nuevoFin);
      }
    }
  }

  return actualizado;
}
```

Nota: el chequeo usa `antes.sucursalId` (el estado ANTES de aplicar `cambios`), no lo que venga en `cambios.sucursalId` — así, aunque el cliente mande un `sucursalId` distinto en el body (ver Task 6, ese valor de todas formas se resuelve server-side y nunca es una sede puntual ajena), la validación de acceso es sobre el miembro que YA existe, coherente con la regla "hace falta estar en su sucursal para tocarlo".

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p apps/web-admin/tsconfig.json`
Expected: nuevos errores en los 4 call sites de `actualizarMiembro` (Task 6).

- [ ] **Step 3: Commit**

```bash
git add packages/domain/use-cases/ActualizarMiembro.ts
git commit -m "feat: actualizarMiembro valida que el miembro pertenezca a la sucursal activa"
```

---

### Task 3: `registrarPago` scopeado

**Files:**
- Modify: `packages/domain/use-cases/RegistrarPago.ts`

**Interfaces:**
- Consumes: `MiembroFueraDeSucursalError` de `ObtenerMiembro.ts` (Task 1).
- Produces: `registrarPago(deps, input)` sigue recibiendo `input.sucursalId` (la sede del pago, ya existente — ahora se usa también como sucursal activa contra la que se valida el miembro) y ahora exige `deps.sucursales: ISucursalRepository`.

- [ ] **Step 1: Modificar `RegistrarPago.ts`**

Agregar el import y el puerto:

```typescript
import { ISucursalRepository } from "../ports/ISucursalRepository";
import { MiembroFueraDeSucursalError } from "./ObtenerMiembro";

export { MiembroFueraDeSucursalError };
```

Agregar `sucursales: ISucursalRepository;` a `RegistrarPagoDeps`.

Insertar el chequeo justo después de resolver `miembro` (antes de resolver `plan`):

```typescript
  const miembro = await deps.miembros.buscarPorId(input.organizacionId, input.miembroId);
  if (!miembro) {
    throw new MiembroNoEncontradoError();
  }

  if (miembro.sucursalId !== null && miembro.sucursalId !== input.sucursalId) {
    const sucursal = await deps.sucursales.buscarPorId(input.organizacionId, miembro.sucursalId);
    throw new MiembroFueraDeSucursalError(sucursal?.nombre ?? "otra sucursal");
  }
```

`input.sucursalId` en `DatosRegistrarPago` ya es, en todos los call sites actuales, la `sucursalActivaId` de la sesión (ver `pagos/actions.ts`, `miembros/actions.ts`, `api/pagos/route.ts` — los tres ya lo resuelven así) — no hace falta agregar un campo nuevo al input, solo usar el que ya llega.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p apps/web-admin/tsconfig.json`
Expected: nuevos errores en los 3 call sites de `registrarPago` (Tasks 6-7) por falta de `sucursales` en `deps`.

- [ ] **Step 3: Commit**

```bash
git add packages/domain/use-cases/RegistrarPago.ts
git commit -m "feat: registrarPago valida que el miembro pertenezca a la sucursal del pago"
```

---

### Task 4: `listarMiembros` filtrado por sucursal activa

**Files:**
- Modify: `packages/domain/use-cases/ListarMiembros.ts`

**Interfaces:**
- Produces: `listarMiembros(deps, organizacionId, sucursalActivaId)` — nueva firma, agrega el tercer parámetro obligatorio.

- [ ] **Step 1: Reescribir `ListarMiembros.ts`**

```typescript
import { IMemberRepository } from "../ports/IMemberRepository";
import { Miembro } from "../entities/Miembro";

export async function listarMiembros(
  deps: { miembros: IMemberRepository },
  organizacionId: string,
  sucursalActivaId: string
): Promise<Miembro[]> {
  const todos = await deps.miembros.listarPorOrganizacion(organizacionId);
  return todos.filter((m) => m.sucursalId === null || m.sucursalId === sucursalActivaId);
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p apps/web-admin/tsconfig.json`
Expected: nuevos errores en los 4 call sites (`/miembros`, `/caja`, `/pagos/nuevo`, `/api/miembros` GET) por falta del tercer argumento.

- [ ] **Step 3: Commit**

```bash
git add packages/domain/use-cases/ListarMiembros.ts
git commit -m "feat: listarMiembros filtra por sucursal activa, incluye miembros multisede"
```

---

### Task 5: Página de error dedicada para `/miembros/[id]` fuera de sucursal

**Files:**
- Create: `apps/web-admin/app/(panel)/miembros/[id]/MiembroFueraDeSucursal.tsx`
- Modify: `apps/web-admin/app/(panel)/miembros/[id]/page.tsx`

**Interfaces:**
- Consumes: `MiembroFueraDeSucursalError` de `@gym-app/domain/use-cases/ObtenerMiembro` (Task 1), `obtenerMiembro` con la nueva firma (Task 1).

- [ ] **Step 1: Crear el componente de error**

```typescript
// apps/web-admin/app/(panel)/miembros/[id]/MiembroFueraDeSucursal.tsx
import Link from "next/link";
import { Card } from "@gym-app/ui/components/Card";
import { Button } from "@gym-app/ui/components/Button";

export function MiembroFueraDeSucursal({ mensaje }: { mensaje: string }) {
  return (
    <div className="max-w-lg p-6 lg:p-8">
      <Card className="flex flex-col items-start gap-4">
        <p style={{ color: "var(--gx-ink)" }}>{mensaje}</p>
        <Link href="/miembros">
          <Button variant="secundario">Volver a miembros</Button>
        </Link>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Modificar `[id]/page.tsx` para distinguir los dos errores y pasar `sucursalActivaId`**

Reemplazar el bloque de `obtenerMiembro` y su `catch`:

```typescript
import { obtenerMiembro, MiembroNoEncontradoError, MiembroFueraDeSucursalError } from "@gym-app/domain/use-cases/ObtenerMiembro";
import { PrismaSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSucursalRepository";
import { MiembroFueraDeSucursal } from "./MiembroFueraDeSucursal";
```

(`PrismaSucursalRepository` ya está importado en este archivo — no duplicar el import.)

```typescript
  let miembro;
  try {
    miembro = await obtenerMiembro(
      { miembros: new PrismaMemberRepository(prisma), sucursales: new PrismaSucursalRepository(prisma) },
      { organizacionId: usuario.organizacionId, id, sucursalActivaId }
    );
  } catch (error) {
    if (error instanceof MiembroNoEncontradoError) notFound();
    if (error instanceof MiembroFueraDeSucursalError) {
      return <MiembroFueraDeSucursal mensaje={error.message} />;
    }
    throw error;
  }
```

Esto reemplaza el `.catch()` encadenado y el `if (!miembro) notFound();` que había antes.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p apps/web-admin/tsconfig.json`
Expected: sin errores nuevos en este archivo (puede seguir habiendo errores en otros call sites aún no migrados).

- [ ] **Step 4: Commit**

```bash
git add "apps/web-admin/app/(panel)/miembros/[id]/MiembroFueraDeSucursal.tsx" "apps/web-admin/app/(panel)/miembros/[id]/page.tsx"
git commit -m "feat: pagina de editar miembro muestra aviso cuando el miembro es de otra sucursal"
```

---

### Task 6: Migrar los `Server Actions` de miembros (crear, actualizar, baja, reactivar, pago)

**Files:**
- Modify: `apps/web-admin/app/(panel)/miembros/actions.ts`
- Modify: `apps/web-admin/app/(panel)/pagos/actions.ts`

**Interfaces:**
- Consumes: `actualizarMiembro`/`registrarPago` con las nuevas firmas (Tasks 2-3), `resolverSucursalId` (ya existe en `miembros/actions.ts`).

- [ ] **Step 1: `miembros/actions.ts` — agregar `sucursales` a los 3 call sites de `actualizarMiembro` y a `registrarPago`, y `sucursalActivaId` a los inputs**

En `actualizarMiembroAction` (agregar `sucursalActivaId` a la destructuración de sesión, y a `deps`/`input`):

```typescript
  const { usuario, sucursalActivaId } = sesion;
  // ...
  try {
    await actualizarMiembro(
      {
        miembros: new PrismaMemberRepository(prisma),
        planes: new PrismaPlanRepository(prisma),
        suscripciones: new PrismaSuscripcionRepository(prisma),
        sucursales: new PrismaSucursalRepository(prisma),
      },
      {
        organizacionId: usuario.organizacionId,
        id,
        sucursalActivaId,
        cambios: {
          nombre,
          sucursalId: resolverSucursalId(sucursalId),
          // ... resto igual
        },
      }
    );
```

En `darDeBajaAction` y `reactivarAction` (mismo patrón: agregar `sucursalActivaId` a la destructuración, `sucursales` a deps, `sucursalActivaId` al input):

```typescript
export async function darDeBajaAction(id: string): Promise<void> {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario, sucursalActivaId } = sesion;

  await actualizarMiembro(
    {
      miembros: new PrismaMemberRepository(prisma),
      planes: new PrismaPlanRepository(prisma),
      suscripciones: new PrismaSuscripcionRepository(prisma),
      sucursales: new PrismaSucursalRepository(prisma),
    },
    { organizacionId: usuario.organizacionId, id, sucursalActivaId, cambios: { activo: false } }
  );

  revalidatePath("/miembros");
}
```

(mismo cambio en `reactivarAction`, con `cambios: { activo: true }`).

En `crearMiembroAction`, el `registrarPago` interno pasa a incluir `sucursales`:

```typescript
    await registrarPago(
      {
        pagos: new PrismaPagoRepository(prisma),
        suscripciones: new PrismaSuscripcionRepository(prisma),
        miembros: new PrismaMemberRepository(prisma),
        planes: new PrismaPlanRepository(prisma),
        turnos: new PrismaTurnoRepository(prisma),
        sucursales: new PrismaSucursalRepository(prisma),
        autorizacion: new AuthorizationService(new PrismaPermisoRepository(prisma)),
      },
```

Agregar el import de `PrismaSucursalRepository` al inicio del archivo:

```typescript
import { PrismaSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSucursalRepository";
```

Nota: `crearMiembroAction` crea el miembro y de inmediato le registra el pago inicial en la MISMA sucursal (`sucursalIdPago` ya se resuelve a `sucursalActivaId` cuando no viene de un selector — y tras Task 7 ya no va a venir de ningún selector) — el chequeo de `registrarPago` nunca debería disparar ahí en la práctica, pero queda como defensa uniforme.

- [ ] **Step 2: `pagos/actions.ts` — agregar `sucursales` al `registrarPago` de `registrarPagoAction`**

```typescript
import { PrismaSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSucursalRepository";
```

```typescript
  try {
    await registrarPago(
      {
        pagos: new PrismaPagoRepository(prisma),
        suscripciones: new PrismaSuscripcionRepository(prisma),
        miembros: new PrismaMemberRepository(prisma),
        planes: new PrismaPlanRepository(prisma),
        turnos: new PrismaTurnoRepository(prisma),
        sucursales: new PrismaSucursalRepository(prisma),
        autorizacion: new AuthorizationService(new PrismaPermisoRepository(prisma)),
      },
```

- [ ] **Step 3: Manejar `MiembroFueraDeSucursalError` en ambos `catch`**

En `miembros/actions.ts`, `actualizarMiembroAction` ya tiene un `catch` que devuelve `{ error: error.message }` para `MiembroNoEncontradoError`/`ActualizarPlanNoEncontradoError` — agregar `MiembroFueraDeSucursalError` a esa misma condición (el mensaje del error ya es user-facing, ver Task 1):

```typescript
import {
  actualizarMiembro,
  MiembroNoEncontradoError,
  MiembroFueraDeSucursalError,
  PlanNoEncontradoError as ActualizarPlanNoEncontradoError,
} from "@gym-app/domain/use-cases/ActualizarMiembro";
```

```typescript
  } catch (error) {
    if (
      error instanceof MiembroNoEncontradoError ||
      error instanceof MiembroFueraDeSucursalError ||
      error instanceof ActualizarPlanNoEncontradoError
    ) {
      return { error: error.message };
    }
    throw error;
  }
```

En `miembros/actions.ts`, `crearMiembroAction` (el `catch` del `registrarPago` interno) y en `pagos/actions.ts` `registrarPagoAction`, agregar `MiembroFueraDeSucursalError` (importado de `RegistrarPago`, ver Task 3) a la lista de errores esperables que ya manejan:

```typescript
// miembros/actions.ts, import de RegistrarPago:
import {
  registrarPago,
  MiembroNoEncontradoError as PagoMiembroNoEncontradoError,
  MiembroFueraDeSucursalError,
  PlanNoEncontradoError,
  PlanInactivoError,
  RolNoAutorizadoError as PagoRolNoAutorizadoError,
} from "@gym-app/domain/use-cases/RegistrarPago";
```

```typescript
  } catch (error) {
    if (
      error instanceof PagoMiembroNoEncontradoError ||
      error instanceof MiembroFueraDeSucursalError ||
      error instanceof PlanNoEncontradoError ||
      error instanceof PlanInactivoError ||
      error instanceof PagoRolNoAutorizadoError
    ) {
      return { error: `El miembro se creó, pero no se pudo registrar el pago inicial: ${error.message}` };
    }
    throw error;
  }
```

```typescript
// pagos/actions.ts, import de RegistrarPago:
import {
  registrarPago,
  MiembroNoEncontradoError,
  MiembroFueraDeSucursalError,
  PlanNoEncontradoError,
  PlanInactivoError,
  RolNoAutorizadoError,
} from "@gym-app/domain/use-cases/RegistrarPago";
```

```typescript
  } catch (error) {
    if (
      error instanceof MiembroNoEncontradoError ||
      error instanceof MiembroFueraDeSucursalError ||
      error instanceof PlanNoEncontradoError ||
      error instanceof PlanInactivoError ||
      error instanceof RolNoAutorizadoError
    ) {
      return { error: error.message };
    }
    throw error;
  }
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p apps/web-admin/tsconfig.json`
Expected: sin errores nuevos en `miembros/actions.ts` ni `pagos/actions.ts`.

- [ ] **Step 5: Commit**

```bash
git add "apps/web-admin/app/(panel)/miembros/actions.ts" "apps/web-admin/app/(panel)/pagos/actions.ts"
git commit -m "feat: acciones de miembros y pagos propagan sucursalActivaId a los casos de uso"
```

---

### Task 7: Migrar las rutas API de miembros y pagos

**Files:**
- Modify: `apps/web-admin/app/api/miembros/route.ts`
- Modify: `apps/web-admin/app/api/miembros/[id]/route.ts`
- Modify: `apps/web-admin/app/api/pagos/route.ts`

**Interfaces:**
- Consumes: `listarMiembros`, `obtenerMiembro`, `actualizarMiembro`, `registrarPago` con las nuevas firmas.

- [ ] **Step 1: `api/miembros/route.ts` GET — filtrar por sucursal activa**

```typescript
export async function GET(req: NextRequest) {
  const sesion = await obtenerUsuarioDeSesion(req);

  if (!sesion) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  const { usuario, sucursalActivaId } = sesion;

  const miembros = await listarMiembros(
    { miembros: new PrismaMemberRepository(prisma) },
    usuario.organizacionId,
    sucursalActivaId
  );

  return NextResponse.json({ miembros });
}
```

- [ ] **Step 2: `api/miembros/[id]/route.ts` GET y PATCH — validar sucursal**

Import:

```typescript
import {
  obtenerMiembro,
  MiembroNoEncontradoError as ObtenerMiembroNoEncontradoError,
  MiembroFueraDeSucursalError as ObtenerMiembroFueraDeSucursalError,
} from "@gym-app/domain/use-cases/ObtenerMiembro";
import {
  actualizarMiembro,
  MiembroNoEncontradoError as ActualizarMiembroNoEncontradoError,
  MiembroFueraDeSucursalError as ActualizarMiembroFueraDeSucursalError,
} from "@gym-app/domain/use-cases/ActualizarMiembro";
import { PrismaSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSucursalRepository";
```

GET:

```typescript
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await obtenerUsuarioDeSesion(req);

  if (!sesion) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  const { usuario, sucursalActivaId } = sesion;

  const { id } = await params;

  try {
    const miembro = await obtenerMiembro(
      { miembros: new PrismaMemberRepository(prisma), sucursales: new PrismaSucursalRepository(prisma) },
      { organizacionId: usuario.organizacionId, id, sucursalActivaId }
    );

    return NextResponse.json(miembro);
  } catch (error) {
    if (error instanceof ObtenerMiembroNoEncontradoError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof ObtenerMiembroFueraDeSucursalError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("Error al obtener miembro:", error);
    return NextResponse.json(
      { error: "Error interno al obtener el miembro." },
      { status: 500 }
    );
  }
}
```

PATCH — agregar `sucursalActivaId` a la destructuración de sesión, `sucursales` a deps, `sucursalActivaId` al input, y el nuevo catch:

```typescript
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await obtenerUsuarioDeSesion(req);

  if (!sesion) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  const { usuario, sucursalActivaId } = sesion;

  const { id } = await params;
  const body = await req.json();

  const cambios: CambiosMiembro = {};
  if (body.nombre !== undefined) cambios.nombre = body.nombre;
  if (body.sucursalId !== undefined) cambios.sucursalId = body.sucursalId;
  if (body.fechaInscripcion !== undefined) {
    cambios.fechaInscripcion = body.fechaInscripcion ? new Date(body.fechaInscripcion) : null;
  }
  if (body.fechaNacimiento !== undefined) {
    cambios.fechaNacimiento = body.fechaNacimiento ? new Date(body.fechaNacimiento) : null;
  }
  if (body.celular !== undefined) cambios.celular = body.celular;
  if (body.fotoUrl !== undefined) cambios.fotoUrl = body.fotoUrl;
  if (body.entrenadorId !== undefined) cambios.entrenadorId = body.entrenadorId;
  if (body.planId !== undefined) cambios.planId = body.planId;
  if (body.precioPlan !== undefined) cambios.precioPlan = body.precioPlan;
  if (body.activo !== undefined) cambios.activo = body.activo;

  try {
    const miembro = await actualizarMiembro(
      {
        miembros: new PrismaMemberRepository(prisma),
        planes: new PrismaPlanRepository(prisma),
        suscripciones: new PrismaSuscripcionRepository(prisma),
        sucursales: new PrismaSucursalRepository(prisma),
      },
      { organizacionId: usuario.organizacionId, id, sucursalActivaId, cambios }
    );

    return NextResponse.json(miembro);
  } catch (error) {
    if (error instanceof ActualizarMiembroNoEncontradoError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof ActualizarMiembroFueraDeSucursalError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("Error al actualizar miembro:", error);
    return NextResponse.json(
      { error: "Error interno al actualizar el miembro." },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 3: `api/pagos/route.ts` POST — agregar `sucursales` a `registrarPago` y manejar el nuevo error**

Import:

```typescript
import {
  registrarPago,
  MiembroNoEncontradoError as RegistrarPagoMiembroNoEncontradoError,
  MiembroFueraDeSucursalError,
  PlanNoEncontradoError as RegistrarPagoPlanNoEncontradoError,
  PlanInactivoError,
  RolNoAutorizadoError,
} from "@gym-app/domain/use-cases/RegistrarPago";
import { PrismaSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSucursalRepository";
```

```typescript
    const pago = await registrarPago(
      {
        pagos: new PrismaPagoRepository(prisma),
        suscripciones: new PrismaSuscripcionRepository(prisma),
        miembros: new PrismaMemberRepository(prisma),
        planes: new PrismaPlanRepository(prisma),
        turnos: new PrismaTurnoRepository(prisma),
        sucursales: new PrismaSucursalRepository(prisma),
        autorizacion: new AuthorizationService(new PrismaPermisoRepository(prisma)),
      },
      {
        organizacionId: usuario.organizacionId,
        miembroId: body.miembroId,
        planId: body.planId,
        monto: body.monto,
        metodo: body.metodo,
        metodoPagoId: body.metodoPagoId ?? null,
        numeroOperacion: body.numeroOperacion ?? null,
        tasaCambio: body.tasaCambio ?? null,
        sucursalId: sucursalActivaId,
        registradoPorId: usuario.id,
        rolUsuario: usuario.rol,
      }
    );

    return NextResponse.json(pago, { status: 201 });
  } catch (error) {
    if (error instanceof RegistrarPagoMiembroNoEncontradoError || error instanceof RegistrarPagoPlanNoEncontradoError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof MiembroFueraDeSucursalError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof PlanInactivoError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof RolNoAutorizadoError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("Error al registrar pago:", error);
    return NextResponse.json({ error: "Error interno al registrar el pago." }, { status: 500 });
  }
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p apps/web-admin/tsconfig.json`
Expected: sin errores nuevos en las 3 rutas modificadas.

- [ ] **Step 5: Commit**

```bash
git add apps/web-admin/app/api/miembros/route.ts "apps/web-admin/app/api/miembros/[id]/route.ts" apps/web-admin/app/api/pagos/route.ts
git commit -m "feat: rutas API de miembros y pagos filtran y validan por sucursal activa"
```

---

### Task 8: Migrar `/miembros`, `/caja`, `/pagos/nuevo`, `/miembros/[id]/pagos` (páginas que llaman `listarMiembros`/`obtenerMiembro`)

**Files:**
- Modify: `apps/web-admin/app/(panel)/miembros/page.tsx`
- Modify: `apps/web-admin/app/(panel)/caja/page.tsx`
- Modify: `apps/web-admin/app/(panel)/pagos/nuevo/page.tsx`
- Modify: `apps/web-admin/app/(panel)/miembros/[id]/pagos/page.tsx`

**Interfaces:**
- Consumes: `listarMiembros(deps, organizacionId, sucursalActivaId)` (Task 4), `obtenerMiembro` con la nueva firma (Task 1).

- [ ] **Step 1: `miembros/page.tsx` — pasar `sucursalActivaId` a `listarMiembros`**

```typescript
  const [miembros, planes, sucursales, turnoAbierto] = await Promise.all([
    listarMiembros({ miembros: new PrismaMemberRepository(prisma) }, usuario.organizacionId, sucursalActivaId),
    listarPlanes({ planes: new PrismaPlanRepository(prisma) }, usuario.organizacionId),
    listarSucursales({ sucursales: new PrismaSucursalRepository(prisma) }, usuario.organizacionId),
    obtenerTurnoAbiertoParaUsuario(sucursalActivaId, usuario.id),
  ]);
```

- [ ] **Step 2: `caja/page.tsx` — pasar `sucursalActivaId` a `listarMiembros`**

```typescript
      listarMiembros({ miembros: new PrismaMemberRepository(prisma) }, usuario.organizacionId, sucursalActivaId),
```

(dentro del `Promise.all` existente, sin cambiar el resto de esa lista).

- [ ] **Step 3: `pagos/nuevo/page.tsx` — pasar `sucursalActivaId` a `listarMiembros`**

```typescript
  const [miembros, planes, metodosPago, sucursalesVisibles, sucursalesOrganizacion] = await Promise.all([
    listarMiembros({ miembros: new PrismaMemberRepository(prisma) }, usuario.organizacionId, sucursalActivaId),
    listarPlanes({ planes: new PrismaPlanRepository(prisma) }, usuario.organizacionId),
    listarMetodosPagoActivos({ metodosPago: new PrismaMetodoPagoRepository(prisma) }, usuario.organizacionId),
    obtenerSucursalesVisiblesParaMiembro(usuario),
    listarSucursales({ sucursales: new PrismaSucursalRepository(prisma) }, usuario.organizacionId),
  ]);
```

- [ ] **Step 4: `miembros/[id]/pagos/page.tsx` — pasar `sucursalActivaId` a `obtenerMiembro` y manejar el nuevo error**

```typescript
import { obtenerMiembro, MiembroNoEncontradoError, MiembroFueraDeSucursalError } from "@gym-app/domain/use-cases/ObtenerMiembro";
import { PrismaSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSucursalRepository";
import { MiembroFueraDeSucursal } from "../MiembroFueraDeSucursal";
```

```typescript
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario, sucursalActivaId } = sesion;

  const { id } = await params;

  let miembro;
  try {
    miembro = await obtenerMiembro(
      { miembros: new PrismaMemberRepository(prisma), sucursales: new PrismaSucursalRepository(prisma) },
      { organizacionId: usuario.organizacionId, id, sucursalActivaId }
    );
  } catch (error) {
    if (error instanceof MiembroNoEncontradoError) notFound();
    if (error instanceof MiembroFueraDeSucursalError) {
      return <MiembroFueraDeSucursal mensaje={error.message} />;
    }
    throw error;
  }
```

(reemplaza el `.catch()` encadenado y el `if (!miembro) notFound();` que había antes; reusa el componente creado en Task 5).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p apps/web-admin/tsconfig.json`
Expected: sin errores nuevos en estos 4 archivos.

- [ ] **Step 6: Commit**

```bash
git add "apps/web-admin/app/(panel)/miembros/page.tsx" "apps/web-admin/app/(panel)/caja/page.tsx" "apps/web-admin/app/(panel)/pagos/nuevo/page.tsx" "apps/web-admin/app/(panel)/miembros/[id]/pagos/page.tsx"
git commit -m "feat: paginas de miembros pagos y caja filtran listado por sucursal activa"
```

---

### Task 9: `FormularioMiembro.tsx` — sede fija a la activa, sin selector de sedes específicas

**Files:**
- Modify: `apps/web-admin/app/(panel)/miembros/FormularioMiembro.tsx`
- Modify: `apps/web-admin/app/(panel)/miembros/nuevo/page.tsx`
- Modify: `apps/web-admin/app/(panel)/miembros/[id]/page.tsx`

**Interfaces:**
- Produces: `FormularioMiembro` deja de recibir `sucursales: SucursalResumen[]` para poblar un selector — en su lugar recibe `sucursalActivaNombre: string` (para mostrarla como texto fijo) y sigue recibiendo `sucursalIdDefault: string | null` (ya existía, es `sucursalActivaId`).
- El campo `sucursalId` que se envía en el `FormData` sigue siendo `sucursalActivaId` o `ID_AMBAS_SEDES` — el server-side (`crearMiembroAction`/`actualizarMiembroAction`, ya migrados en Task 6) sigue resolviendo con `resolverSucursalId`, sin cambios ahí.

- [ ] **Step 1: `FormularioMiembro.tsx` — reemplazar el `<select>` de sede por un valor fijo + toggle multisede**

Cambiar la firma de props: quitar `sucursales: SucursalResumen[]` y `sucursalesOrganizacion: SucursalResumen[]` de los parámetros que ya no las necesiten para poblar el selector de sede (mantener `sucursalesOrganizacion`/`sucursales` SOLO si siguen usadas para otra cosa — ver `entrenadoresPorSucursal`, que sigue indexado por sucursal, así que `sucursales`/`sucursalesConActual` se necesitan igual para calcular `entrenadoresDeLaSede`; no se elimina esa parte). Agregar `sucursalActivaNombre: string`.

```typescript
export function FormularioMiembro({
  accion,
  entrenadoresPorSucursal,
  sucursales,
  sucursalActivaNombre,
  sucursalIdDefault,
  planes,
  metodosPago,
  miembroId,
  ultimosCiclos,
  valoresIniciales,
  panelLateral,
}: {
  accion: (estado: EstadoFormularioMiembro, formData: FormData) => Promise<EstadoFormularioMiembro>;
  entrenadoresPorSucursal: Record<string, EntrenadorResumen[]>;
  // Se sigue usando para resolver entrenadoresDeLaSede y para mostrar el
  // nombre cuando sucursalId === ID_AMBAS_SEDES; ya NO se usa para poblar
  // un <select> de sedes.
  sucursales: SucursalResumen[];
  // Nombre de la sucursal activa de la sesión — se muestra como texto fijo
  // en vez de ofrecer un selector (ver diseño acordado: crear/editar un
  // miembro siempre lo asigna a la sede activa, salvo "Ambas").
  sucursalActivaNombre: string;
  sucursalIdDefault: string | null;
  planes: Plan[];
  metodosPago: MetodoPago[];
  miembroId: string | null;
  ultimosCiclos: { id: string; fechaInicioCiclo: Date | null; fechaFinCiclo: Date | null }[];
  valoresIniciales?: ValoresFormularioMiembro;
  panelLateral?: React.ReactNode;
}) {
```

Quitar el prop `sucursalesOrganizacion` de la firma (ya no se pasa a `SelectorMetodoPago`, ver Task 10) — buscar su único uso restante (pasarlo a `<SelectorMetodoPago>`) y eliminarlo ahí también en este mismo Step.

Reemplazar el estado inicial de `sucursalId` — ya no depende de `sucursales[0]?.id`:

```typescript
  const [sucursalId, setSucursalId] = useState(
    valoresIniciales ? (valoresIniciales.sucursalId ?? ID_AMBAS_SEDES) : sucursalIdDefault ?? ""
  );
```

Reemplazar el bloque completo que hoy renderiza `<select name="sucursalId">` (líneas actuales ~439-489, entre el bloque de "Sede asignada" de solo lectura y el `<select>` editable) por:

```typescript
          <div className="mb-4 rounded-lg border p-4" style={{ borderColor: "var(--gx-edge)" }}>
            <input type="hidden" name="sucursalId" value={sucursalId} />
            <div className="flex justify-between text-sm">
              <span style={{ color: "var(--gx-muted)" }}>Sede asignada</span>
              <span className="font-medium" style={{ color: "var(--gx-ink)" }}>
                {sucursalId === ID_AMBAS_SEDES ? "Ambas" : sucursalActivaNombre}
              </span>
            </div>
            {planPermiteMultisede && (
              <label className="mt-3 flex min-h-11 items-center gap-2 text-sm" style={{ color: "var(--gx-muted)" }}>
                <input
                  type="checkbox"
                  checked={sucursalId === ID_AMBAS_SEDES}
                  onChange={(e) => setSucursalId(e.target.checked ? ID_AMBAS_SEDES : sucursalIdDefault ?? "")}
                  className="h-5 w-5 accent-[var(--gx-accent)]"
                />
                Disponible en ambas sedes
              </label>
            )}
            <span className="mt-2 block text-xs" style={{ color: "var(--gx-muted-dim)" }}>
              {sucursalId === ID_AMBAS_SEDES
                ? "Puede hacer check-in en cualquier sucursal de la organización."
                : "Determina en qué sucursal puede hacer check-in."}
            </span>
          </div>
```

Esto reemplaza TANTO el bloque de solo-lectura (`esEdicion && !editandoSede`) COMO el `<select>` editable (`editandoSede || !esEdicion`) por un único bloque: ya no hay "Cambiar sede" como acción separada (no tiene sentido — la única alternativa a la sede activa es el toggle multisede). Junto con esto:

- Eliminar el estado `editandoSede`/`setEditandoSede` (ya no se usa).
- Eliminar el botón "Cambiar sede" del bloque de botones en el header de la Card "Plan de membresía" (`{esEdicion && !editandoSede && (<Button ...>Cambiar sede</Button>)}`).
- Eliminar `sucursalIdOriginal` y el botón "Cancelar cambio de sede" (ya no aplican sin el modo edición de sede).
- En `manejarCambioPlan`, el fallback cuando el nuevo plan no permite multisede pasa a usar `sucursalIdDefault` en vez de `sucursales[0]?.id`:

```typescript
    if (!permiteMultisede && sucursalId === ID_AMBAS_SEDES) {
      setSucursalId(sucursalIdDefault ?? "");
    }
```

- `sucursalesConActual` deja de ser necesario para poblar un `<select>`, pero sigue haciendo falta tal cual está para el fallback de `entrenadoresPorSucursal` cuando `sucursalId === ID_AMBAS_SEDES` — no se toca esa parte.
- En el resumen final ("Sede", dentro del ticket de confirmación), cambiar la búsqueda en `sucursales` por el nombre fijo:

```typescript
              <Fila
                label="Sede"
                valor={sucursalId === ID_AMBAS_SEDES ? "Ambas" : sucursalActivaNombre}
              />
```

- En `<SelectorMetodoPago>` (dentro del bloque `!esEdicion`), quitar los props `sucursalesVisibles`/`sucursalesOrganizacion`/`sucursalIdDefault`/`planEsMultisede` relacionados al selector de sede — ver Task 10, que redefine la firma de `SelectorMetodoPago` sin selector de sede. Dejar únicamente:

```typescript
              <SelectorMetodoPago
                metodos={metodosPago}
                monto={precioActual}
                onCambio={setSeleccionMetodo}
                idFormulario={idFormulario}
              />
```

- El hidden `sucursalIdPago` que arma este formulario (`<input type="hidden" name="sucursalIdPago" value={seleccionMetodo.sucursalId ?? ""} />`) deja de tener sentido porque `SelectorMetodoPago` ya no expone `sucursalId` en su `onCambio` (Task 10) — eliminar ese `<input type="hidden">` y el campo `sucursalId` del tipo de estado `seleccionMetodo`.

- [ ] **Step 2: `miembros/nuevo/page.tsx` — pasar `sucursalActivaNombre`, quitar `sucursalesOrganizacion`**

`sucursales` (= `obtenerSucursalesVisiblesParaMiembro(usuario)`) sigue haciendo falta tal cual está — alimenta `obtenerEntrenadoresPorSucursal`. `sucursalesOrganizacion` (= `listarSucursales`, org-wide) en cambio, confirmado por grep, solo se usaba para el prop que se está eliminando de `FormularioMiembro` — se quita junto con su import de `listarSucursales`/`PrismaSucursalRepository`.

```typescript
import { PrismaPlanRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPlanRepository";
import { PrismaMetodoPagoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMetodoPagoRepository";
import { listarPlanes } from "@gym-app/domain/use-cases/ListarPlanes";
import { listarMetodosPagoActivos } from "@gym-app/domain/use-cases/ListarMetodosPago";
import { obtenerSucursalesVisiblesParaMiembro } from "../obtenerSucursalesVisibles";
import { obtenerEntrenadoresPorSucursal } from "../obtenerEntrenadoresPorSucursal";
```

(quitar los imports de `PrismaSucursalRepository` y `listarSucursales`, que ya no se usan en este archivo).

```typescript
  const [planes, sucursales, metodosPago] = await Promise.all([
    listarPlanes({ planes: new PrismaPlanRepository(prisma) }, usuario.organizacionId),
    obtenerSucursalesVisiblesParaMiembro(usuario),
    listarMetodosPagoActivos({ metodosPago: new PrismaMetodoPagoRepository(prisma) }, usuario.organizacionId),
  ]);
  const entrenadoresPorSucursal = await obtenerEntrenadoresPorSucursal(usuario.organizacionId, sucursales);
  const sucursalActiva = sucursales.find((s) => s.id === sucursalActivaId);
```

```typescript
      <FormularioMiembro
        accion={crearMiembroAction}
        entrenadoresPorSucursal={entrenadoresPorSucursal}
        planes={planes}
        sucursales={sucursales}
        sucursalActivaNombre={sucursalActiva?.nombre ?? "—"}
        sucursalIdDefault={sucursalActivaId}
        metodosPago={metodosPago}
        miembroId={null}
        ultimosCiclos={[]}
      />
```

- [ ] **Step 3: `miembros/[id]/page.tsx` — pasar `sucursalActivaNombre`, quitar `sucursalesOrganizacion`**

Confirmado por grep: `sucursalesOrganizacion` (= `listarSucursales`, org-wide) en este archivo se usa en exactamente 2 lugares, ambos props que se eliminan (uno en `FormularioMiembro`, ver Task 9 Step 1; otro en `FormularioPago` dentro de `panelLateral`, ver Task 10 Step 3) — al quitar los dos, la query completa queda sin consumidor.

```typescript
  const [pagos, planes, sucursales, metodosPago, turnoAbierto] = await Promise.all([
    listarPagos(
      { pagos: new PrismaPagoRepository(prisma), miembros: new PrismaMemberRepository(prisma) },
      { organizacionId: usuario.organizacionId, miembroId: id }
    ),
    listarPlanes({ planes: new PrismaPlanRepository(prisma) }, usuario.organizacionId),
    obtenerSucursalesVisiblesParaMiembro(usuario),
    listarMetodosPagoActivos({ metodosPago: new PrismaMetodoPagoRepository(prisma) }, usuario.organizacionId),
    obtenerTurnoAbiertoParaUsuario(sucursalActivaId, usuario.id),
  ]);
```

(quitar `listarSucursales({ sucursales: new PrismaSucursalRepository(prisma) }, usuario.organizacionId)` del `Promise.all` y sus imports `listarSucursales`/`PrismaSucursalRepository` del encabezado — OJO: `PrismaSucursalRepository` se vuelve a importar en este mismo archivo en Task 5 Step 2 para `obtenerMiembro`; no quitar ese import, solo la llamada a `listarSucursales` y, si aplica, dejar el import de `PrismaSucursalRepository` porque Task 5 lo necesita).

```typescript
      <FormularioMiembro
        accion={actualizarMiembroAction.bind(null, id)}
        entrenadoresPorSucursal={entrenadoresPorSucursal}
        planes={planes}
        sucursales={sucursales}
        sucursalActivaNombre={sucursales.find((s) => s.id === sucursalActivaId)?.nombre ?? "—"}
        sucursalIdDefault={sucursalActivaId}
        metodosPago={metodosPago}
        miembroId={id}
        ultimosCiclos={ultimosCiclos}
        valoresIniciales={{
          nombre: miembro.nombre,
          cedula: miembro.cedula,
          celular: miembro.celular ?? "",
          fechaInscripcion: formatearFechaISO(miembro.fechaInscripcion ?? miembro.createdAt),
          sucursalId: miembro.sucursalId,
          planId: miembro.planId,
          precioPlan: miembro.precioPlan,
          entrenadorId: miembro.entrenadorId,
          fotoUrl: miembro.fotoUrl,
        }}
        panelLateral={
          <div className="flex flex-col gap-6">
            <Link
              href={`/miembros/${id}/pagos`}
              className="block min-h-11 content-center rounded-lg px-4 text-center text-sm font-medium transition-colors duration-150 active:scale-95"
              style={{ background: "var(--gx-surface-2)", color: "var(--gx-ink)" }}
            >
              Ver historial de pagos ({pagos.length})
            </Link>

            {turnoAbierto?.esPropio ? (
              <Card>
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--gx-muted)" }}>
                  Registrar pago
                </h2>
                <FormularioPago
                  accion={registrarPagoAction}
                  miembros={[]}
                  planes={planesActivos}
                  metodosPago={metodosPago}
                  miembroIdFijo={id}
                  planFijo={
                    miembro.planId
                      ? {
                          id: miembro.planId,
                          nombre: planes.find((p) => p.id === miembro.planId)?.nombre ?? "Plan actual",
                          precioUSD: miembro.precioPlan,
                          multisede: planes.find((p) => p.id === miembro.planId)?.multisede ?? false,
                        }
                      : undefined
                  }
                  origen="miembro"
                />
              </Card>
            ) : (
              <AvisoCajaCerrada
                mensaje={
                  turnoAbierto
                    ? `No puedes registrar pagos: la caja está abierta por ${turnoAbierto.turno.usuarioNombre ?? "otro usuario"}.`
                    : "Para registrar un pago primero tenés que abrir la caja."
                }
              />
            )}
          </div>
        }
      />
```

(este bloque ya no pasa `sucursalesVisibles`/`sucursalesOrganizacion`/`sucursalIdDefault` a `FormularioPago` — ver Task 10 Step 3. De paso se corrige "No podés" → "No puedes" en el mensaje de aviso de caja ajena, igual que ya se hizo en `/miembros` — el "primero tenés que abrir la caja" del caso sin turno queda igual porque no fue parte de lo pedido por el usuario, se puede homogeneizar en un cambio aparte si se pide explícitamente).

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p apps/web-admin/tsconfig.json`
Expected: errores esperables en `SelectorMetodoPago`/`FormularioPago` (props que todavía no se actualizaron en su definición — se resuelve en Task 10). Ningún error en `FormularioMiembro.tsx` propiamente ni en la lógica de sede de estas 3 páginas.

- [ ] **Step 5: Commit**

```bash
git add "apps/web-admin/app/(panel)/miembros/FormularioMiembro.tsx" "apps/web-admin/app/(panel)/miembros/nuevo/page.tsx" "apps/web-admin/app/(panel)/miembros/[id]/page.tsx"
git commit -m "feat: formulario de miembro fija la sede a la activa con toggle de ambas sedes"
```

---

### Task 10: Eliminar el selector "Sede del pago" de `SelectorMetodoPago`/`FormularioPago`

**Files:**
- Modify: `apps/web-admin/app/(panel)/pagos/SelectorMetodoPago.tsx`
- Modify: `apps/web-admin/app/(panel)/pagos/FormularioPago.tsx`
- Modify: `apps/web-admin/app/(panel)/pagos/nuevo/page.tsx`
- Modify: `apps/web-admin/app/(panel)/caja/page.tsx`
- Modify: `apps/web-admin/app/(panel)/miembros/[id]/page.tsx`

**Interfaces:**
- Produces: `SelectorMetodoPago` ya no recibe `sucursalesVisibles`/`sucursalesOrganizacion`/`sucursalIdDefault`/`planEsMultisede`, y su `onCambio` ya no incluye `sucursalId` en el objeto de selección.
- Produces: `FormularioPago` ya no recibe `sucursalesVisibles`/`sucursalesOrganizacion`.

- [ ] **Step 1: `SelectorMetodoPago.tsx` — quitar el selector de sede**

Quitar de la firma de props: `sucursalesVisibles`, `sucursalesOrganizacion`, `sucursalIdDefault`, `planEsMultisede` (y sus tipos/comentarios asociados). Quitar el import de `SucursalResumen` si queda sin uso.

Quitar `opcionesSede` y el estado `sucursalId`/`setSucursalId`.

Quitar `sucursalId` del objeto que arma `onCambio`:

```typescript
  onCambio: (seleccion: {
    metodoPagoId: string | null;
    metodo: string;
    tasaCambio: number | null;
    numeroOperacion: string;
  }) => void;
```

```typescript
  useEffect(() => {
    const tasaCambio = esEnBs ? tasa : null;
    onCambio({
      metodoPagoId: metodo?.id ?? null,
      metodo: metodo ? construirNombreMetodo(metodo) : "",
      tasaCambio,
      numeroOperacion,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onCambio se reconstruye cada render en el padre, no debe disparar el efecto
  }, [metodo, esEnBs, tasa, numeroOperacion]);
```

Quitar el bloque completo `{opcionesSede.length > 1 && (<label>Sede del pago...</label>)}` (JSX, líneas actuales ~198-214).

De paso, aprovechar para corregir la copia en español latinoamericano en `ModalErrorTasa` (ya identificado, no tocado en la sesión anterior a propósito — ahora que se toca este archigo igual, se corrige en el mismo commit por estar en la misma línea que se está tocando; si no se quiere mezclar, dejarlo para un commit aparte):

```typescript
        Puede ser un problema temporal, o puedes ingresar la tasa manualmente consultándola en el BCV.
```

- [ ] **Step 2: `FormularioPago.tsx` — quitar `sucursalesVisibles`/`sucursalesOrganizacion`/`sucursalIdDefault` de su firma y de la llamada a `SelectorMetodoPago`**

Confirmado por grep: los 3 props (`sucursalesVisibles`, `sucursalesOrganizacion`, `sucursalIdDefault`) no tienen otro uso en este archivo más que forwardearlos a `SelectorMetodoPago` y sembrar el `sucursalId` inicial de `seleccionMetodo` (que también se elimina, ver abajo) — se quitan los 3 de la firma de props sin dejar residuos.

Quitar de la firma de props (`sucursalesVisibles: SucursalResumen[]`, `sucursalesOrganizacion: SucursalResumen[]`, `sucursalIdDefault: string | null`) y del destructuring de parámetros. Si el import de `SucursalResumen` queda sin otro uso en el archivo, quitarlo también.

Quitar `sucursalId` del tipo y del valor inicial de `seleccionMetodo`:

```typescript
  const [seleccionMetodo, setSeleccionMetodo] = useState<{
    metodoPagoId: string | null;
    metodo: string;
    tasaCambio: number | null;
    numeroOperacion: string;
  }>({ metodoPagoId: null, metodo: "", tasaCambio: null, numeroOperacion: "" });
```

Y en la llamada a `<SelectorMetodoPago>`:

```typescript
      <SelectorMetodoPago
        metodos={metodosPago}
        monto={montoNumero}
        onCambio={setSeleccionMetodo}
        idFormulario={idFormulario}
      />
```

(mantener los demás props que ya tenía esa llamada, como `monto`/`onCambio`/`idFormulario` — solo se quitan los 3 relacionados a sede).

- [ ] **Step 3: Actualizar los 3 call sites de `FormularioPago`/`SelectorMetodoPago` que quedan con props obsoletos**

`pagos/nuevo/page.tsx`:

Confirmado por grep: `sucursalesVisibles`/`sucursalesOrganizacion` en este archivo no tienen otro uso más que pasarse a `FormularioPago` — al quitarlos, `obtenerSucursalesVisiblesParaMiembro` y `listarSucursales`/`PrismaSucursalRepository` quedan sin ningún consumidor en el archivo. Reescribir el archivo completo (parte a partir de Task 8 Step 3, que ya le agregó `sucursalActivaId` a `listarMiembros`):

```typescript
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaMemberRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMemberRepository";
import { PrismaPlanRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPlanRepository";
import { PrismaMetodoPagoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMetodoPagoRepository";
import { listarMiembros } from "@gym-app/domain/use-cases/ListarMiembros";
import { listarPlanes } from "@gym-app/domain/use-cases/ListarPlanes";
import { listarMetodosPagoActivos } from "@gym-app/domain/use-cases/ListarMetodosPago";
import { FormularioPago } from "../FormularioPago";
import { registrarPagoAction } from "../actions";
import { PageHeader } from "@gym-app/ui/components/PageHeader";

export default async function PaginaNuevoPago() {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario, sucursalActivaId } = sesion;

  const [miembros, planes, metodosPago] = await Promise.all([
    listarMiembros({ miembros: new PrismaMemberRepository(prisma) }, usuario.organizacionId, sucursalActivaId),
    listarPlanes({ planes: new PrismaPlanRepository(prisma) }, usuario.organizacionId),
    listarMetodosPagoActivos({ metodosPago: new PrismaMetodoPagoRepository(prisma) }, usuario.organizacionId),
  ]);

  const planesActivos = planes.filter((plan) => plan.activo);
  const miembrosActivos = miembros.filter((m) => m.activo);

  return (
    <div className="max-w-lg p-6 lg:p-8">
      <div className="mb-6">
        <PageHeader>Registrar pago</PageHeader>
      </div>
      <FormularioPago
        accion={registrarPagoAction}
        miembros={miembrosActivos}
        planes={planesActivos}
        metodosPago={metodosPago}
      />
    </div>
  );
}
```

`caja/page.tsx`:

```typescript
              <FormularioPago
                accion={registrarPagoAction}
                miembros={miembrosActivos}
                miembrosConPlan={miembrosActivos}
                planes={planesActivos}
                metodosPago={metodosPago}
                origen="caja"
              />
```

Confirmado por grep: `todasLasSucursales`, `listarSucursales` y su import de `PrismaSucursalRepository` en este archivo no tienen otro uso más que calcular `sucursalDelTurno`, que a su vez solo alimentaba `sucursalesVisibles`/`sucursalesOrganizacion` — se eliminan los 4 juntos:

- Quitar del `Promise.all` la entrada `listarSucursales({ sucursales: new PrismaSucursalRepository(prisma) }, usuario.organizacionId)` y `todasLasSucursales` de la lista de variables desestructuradas.
- Quitar la línea `const sucursalDelTurno = todasLasSucursales.filter((s) => s.id === sucursalId);` y su comentario.
- Quitar los imports `PrismaSucursalRepository` y `listarSucursales` del encabezado del archivo.
- `sucursalId` (= `sucursalActivaId`, ya declarado más arriba en el archivo) sigue haciendo falta para otras cosas (`obtenerUltimoCierrePorSucursal`, etc.) — no se toca esa parte.

`miembros/[id]/page.tsx` (dentro de `panelLateral`):

```typescript
                <FormularioPago
                  accion={registrarPagoAction}
                  miembros={[]}
                  planes={planesActivos}
                  metodosPago={metodosPago}
                  miembroIdFijo={id}
                  planFijo={
                    miembro.planId
                      ? {
                          id: miembro.planId,
                          nombre: planes.find((p) => p.id === miembro.planId)?.nombre ?? "Plan actual",
                          precioUSD: miembro.precioPlan,
                          multisede: planes.find((p) => p.id === miembro.planId)?.multisede ?? false,
                        }
                      : undefined
                  }
                  origen="miembro"
                />
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p apps/web-admin/tsconfig.json`
Expected: 0 errores en todo el proyecto.

- [ ] **Step 5: Grep final de verificación**

```bash
grep -rn "sucursalesOrganizacion\|opcionesSede" apps/web-admin --include="*.tsx" --include="*.ts"
```

Expected: sin resultados (si queda alguno, es una referencia que se pasó por alto — corregirla antes de continuar).

- [ ] **Step 6: Commit**

```bash
git add "apps/web-admin/app/(panel)/pagos/SelectorMetodoPago.tsx" "apps/web-admin/app/(panel)/pagos/FormularioPago.tsx" "apps/web-admin/app/(panel)/pagos/nuevo/page.tsx" "apps/web-admin/app/(panel)/caja/page.tsx" "apps/web-admin/app/(panel)/miembros/[id]/page.tsx"
git commit -m "refactor: elimina el selector de sede del pago, siempre es la sucursal activa"
```

---

### Task 11: Verificación end-to-end con datos reales (script `tsx` one-off)

**Files:**
- Create (temporal, se borra al final): `packages/db/scripts/verificar-compartimentacion-miembros.ts`

**Interfaces:**
- Consumes: `listarMiembros`, `obtenerMiembro`, `actualizarMiembro`, `registrarPago` — las 4 firmas finales de este plan.

- [ ] **Step 1: Escribir el script de verificación**

```typescript
// packages/db/scripts/verificar-compartimentacion-miembros.ts
// Script one-off — verifica el comportamiento de compartimentación por
// sucursal contra la base real. Borrar este archivo después de correrlo.
import { PrismaClient } from "../generated/prisma/client";
import { PrismaMemberRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMemberRepository";
import { PrismaSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSucursalRepository";
import { listarMiembros } from "@gym-app/domain/use-cases/ListarMiembros";
import { obtenerMiembro, MiembroFueraDeSucursalError } from "@gym-app/domain/use-cases/ObtenerMiembro";

const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organizacion.findFirst();
  if (!org) throw new Error("No hay organización en la base — correr contra una base con datos de demo.");

  const sucursales = await prisma.sucursal.findMany({ where: { organizacionId: org.id } });
  if (sucursales.length < 2) throw new Error("Hace falta al menos 2 sucursales para esta verificación.");

  const [sedeA, sedeB] = sucursales;

  const miembros = new PrismaMemberRepository(prisma);
  const sucursalesRepo = new PrismaSucursalRepository(prisma);

  console.log(`Sede A: ${sedeA.nombre} (${sedeA.id})`);
  console.log(`Sede B: ${sedeB.nombre} (${sedeB.id})`);

  const listaA = await listarMiembros({ miembros }, org.id, sedeA.id);
  const listaB = await listarMiembros({ miembros }, org.id, sedeB.id);

  const fugaAenB = listaB.filter((m) => m.sucursalId === sedeA.id);
  const fugaBenA = listaA.filter((m) => m.sucursalId === sedeB.id);
  console.log(`Miembros de sede A visibles en sede B (debe ser 0): ${fugaAenB.length}`);
  console.log(`Miembros de sede B visibles en sede A (debe ser 0): ${fugaBenA.length}`);

  const multisedeEnA = listaA.filter((m) => m.sucursalId === null);
  const multisedeEnB = listaB.filter((m) => m.sucursalId === null);
  console.log(`Miembros multisede visibles en A: ${multisedeEnA.length}, en B: ${multisedeEnB.length} (deben coincidir)`);

  const miembroDeA = listaA.find((m) => m.sucursalId === sedeA.id);
  if (miembroDeA) {
    try {
      await obtenerMiembro({ miembros, sucursales: sucursalesRepo }, { organizacionId: org.id, id: miembroDeA.id, sucursalActivaId: sedeB.id });
      console.log("FALLO: se pudo obtener un miembro de sede A estando en sede B.");
    } catch (error) {
      if (error instanceof MiembroFueraDeSucursalError) {
        console.log(`OK: bloqueado con mensaje "${error.message}"`);
      } else {
        throw error;
      }
    }
  } else {
    console.log("No hay miembro no-multisede en sede A para probar el bloqueo — omitido.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Correr el script**

Run: `cd packages/db && npx tsx scripts/verificar-compartimentacion-miembros.ts`
Expected: las 3 verificaciones en "OK"/"0" — si alguna falla, volver a Phase 1 de systematic-debugging antes de continuar (no parchear a ciegas).

- [ ] **Step 3: Borrar el script**

```bash
rm packages/db/scripts/verificar-compartimentacion-miembros.ts
```

No se commitea — es un script one-off de verificación, no parte del código de producción (ver Global Constraints).

- [ ] **Step 4: Typecheck final del proyecto completo**

Run: `npx tsc --noEmit -p apps/web-admin/tsconfig.json`
Expected: 0 errores.

No hay commit en esta tarea (el script nunca se agrega a git; el typecheck final ya pasó en Task 10).
