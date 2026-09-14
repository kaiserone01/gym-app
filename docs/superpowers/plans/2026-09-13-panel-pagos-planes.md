# Panel Admin — Pagos y Planes (UI real) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir las pantallas de `Plan` y `Pago` en el panel admin (`apps/web-admin`) — listado/alta/edición de `Plan`, listado/alta global de `Pago`, y un historial de pagos + alta inline dentro de la ficha de un `Miembro` — cerrando los dos enlaces del sidebar (Pagos/Planes) que hoy dan 404.

**Architecture:** Mismo patrón del Plan 9 (Miembros): Server Components + Server Actions que llaman **directo** a los casos de uso de `packages/domain` (sin pasar por `/api/*`, que se extiende aparte para consumidores externos). Dos piezas de dominio nuevas/extendidas: `ListarSucursales` (no existía) y `ListarPagos` (se extiende para listar sin `miembroId`).

**Tech Stack:** Next.js 16 Server Components + Server Actions, `useActionState` de React 19. Sin librerías nuevas.

**Spec:** `docs/superpowers/specs/2026-09-13-panel-pagos-planes-design.md`

## Global Constraints

- **`organizacionId` siempre de la sesión server-side** (`obtenerUsuarioDeSesionActual()`) — las Server Actions y las páginas nunca reciben ni confían en un `organizacionId` del cliente.
- **`tipoAcceso` y las sucursales de un `Plan` son inmutables** tras la creación — el formulario de edición los muestra deshabilitados/solo lectura, nunca los envía en el `PATCH`.
- **`SucursalResumen` nunca incluye `apiKey`** — es una entidad separada de `Sucursal`, no un subconjunto de esa interfaz. El repositorio hace un `select` explícito de Prisma (`{ id: true, nombre: true }`), no un mapeo manual que podría "olvidar" copiar el campo si alguien lo edita después.
- **El selector de Plan en "Registrar pago" solo lista planes activos** — el dominio ya rechaza pagos contra un plan inactivo (`PlanInactivoError`, 400).
- **El campo `metodo` sigue siendo un `string` libre en el dominio** — la UI restringe los valores con un `<select>` de opciones fijas (`efectivo_usd`, `efectivo_bs`, `transferencia`, `zelle`, `binance_usdt`, `pago_movil`, tomados del comentario del schema de Prisma), pero el dominio no valida contra un enum.
- **`GET /api/pagos` sigue aceptando `?miembroId=`** — se extiende para también aceptar la ausencia de ese parámetro (listado global), sin romper el contrato existente.
- Nunca ejecutar `git commit`/`git push` automáticamente salvo instrucción explícita del usuario.

---

## Pre-flight: lo que ya existe y se reutiliza

- `packages/domain/entities/{Plan,Pago,Sucursal}.ts`, `packages/domain/use-cases/{CrearPlan,ListarPlanes,ActualizarPlan,RegistrarPago}.ts`, `packages/infrastructure/persistence/prisma/{PrismaPlanRepository,PrismaPagoRepository,PrismaSuscripcionRepository}.ts` (Plan 6) — se reutilizan sin cambios salvo donde una tarea dice explícitamente "Modify".
- `apps/web-admin/lib/sesion.ts` (`obtenerUsuarioDeSesionActual`), `apps/web-admin/lib/prisma.ts` (Plan 4/9) — sin cambios.
- `packages/ui/components/{Button,Input,Badge}.tsx` (Plan 9) — se reutilizan tal cual, sin componentes nuevos en `packages/ui`.
- `apps/web-admin/app/(panel)/layout.tsx` (Plan 9) — el sidebar ya tiene los links a `/pagos` y `/planes`, no se toca.
- `apps/web-admin/app/(panel)/miembros/{FormularioMiembro.tsx,actions.ts,[id]/page.tsx}` (Plan 9) — sirven de plantilla de patrón para este plan, no se modifican salvo la Tarea 8.
- **Confirmado en el spec:** `ISucursalRepository.buscarPorApiKey` no tiene ninguna implementación en el repo hoy (la autenticación real del kiosco usa `IKioskAuthValidator`/`KioskTokenValidator`, puerto y adaptador distintos). Este plan crea `PrismaSucursalRepository.ts` desde cero.

---

### Task 1: Entidad `SucursalResumen` + extensión de `ISucursalRepository`

**Files:**
- Create: `packages/domain/entities/SucursalResumen.ts`
- Modify: `packages/domain/ports/ISucursalRepository.ts`

**Interfaces:**
- Produces: `SucursalResumen` — consumido por la Tarea 2 (`ListarSucursales`), la Tarea 3 (`PrismaSucursalRepository`), y la Tarea 9 (`FormularioPlan`).
- Produces: `ISucursalRepository.listarPorOrganizacion` — consumido por la Tarea 2 y la Tarea 3.

- [ ] **Step 1: `packages/domain/entities/SucursalResumen.ts`**

```typescript
export interface SucursalResumen {
  id: string;
  nombre: string;
}
```

- [ ] **Step 2: Reemplazar el contenido completo de `packages/domain/ports/ISucursalRepository.ts`**

```typescript
import { Sucursal } from "../entities/Sucursal";
import { SucursalResumen } from "../entities/SucursalResumen";

export interface ISucursalRepository {
  buscarPorApiKey(apiKey: string): Promise<Sucursal | null>;
  listarPorOrganizacion(organizacionId: string): Promise<SucursalResumen[]>;
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/domain/entities/SucursalResumen.ts packages/domain/ports/ISucursalRepository.ts
git commit -m "feat: agrega SucursalResumen y extiende ISucursalRepository con listarPorOrganizacion"
```

---

### Task 2: Caso de uso `ListarSucursales`

**Files:**
- Create: `packages/domain/use-cases/ListarSucursales.ts`

**Interfaces:**
- Consumes: `ISucursalRepository.listarPorOrganizacion`, `SucursalResumen` (Tarea 1).
- Produces: `listarSucursales(deps, organizacionId)` — consumido por la Tarea 9 (`FormularioPlan`, vía la página que lo renderiza).

- [ ] **Step 1: `packages/domain/use-cases/ListarSucursales.ts`**

```typescript
import { ISucursalRepository } from "../ports/ISucursalRepository";
import { SucursalResumen } from "../entities/SucursalResumen";

export async function listarSucursales(
  deps: { sucursales: ISucursalRepository },
  organizacionId: string
): Promise<SucursalResumen[]> {
  return deps.sucursales.listarPorOrganizacion(organizacionId);
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/domain/use-cases/ListarSucursales.ts
git commit -m "feat: agrega el caso de uso ListarSucursales"
```

---

### Task 3: `PrismaSucursalRepository`

**Files:**
- Create: `packages/infrastructure/persistence/prisma/PrismaSucursalRepository.ts`

**Interfaces:**
- Consumes: `ISucursalRepository` (Tarea 1).
- Produces: `PrismaSucursalRepository` — consumido por la Tarea 9 (página que lista sucursales para `FormularioPlan`).

- [ ] **Step 1: `packages/infrastructure/persistence/prisma/PrismaSucursalRepository.ts`**

```typescript
import type { PrismaClient } from "@gym-app/db/generated/prisma/client";
import type { ISucursalRepository } from "@gym-app/domain/ports/ISucursalRepository";
import type { Sucursal } from "@gym-app/domain/entities/Sucursal";
import type { SucursalResumen } from "@gym-app/domain/entities/SucursalResumen";

export class PrismaSucursalRepository implements ISucursalRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async buscarPorApiKey(apiKey: string): Promise<Sucursal | null> {
    const sucursal = await this.prisma.sucursal.findUnique({ where: { apiKey } });

    if (!sucursal) return null;

    return {
      id: sucursal.id,
      organizacionId: sucursal.organizacionId,
      nombre: sucursal.nombre,
      apiKey: sucursal.apiKey,
    };
  }

  async listarPorOrganizacion(organizacionId: string): Promise<SucursalResumen[]> {
    return this.prisma.sucursal.findMany({
      where: { organizacionId },
      select: { id: true, nombre: true },
      orderBy: { nombre: "asc" },
    });
  }
}
```

**Nota:** este archivo es independiente de `packages/infrastructure/.../KioskTokenValidator.ts` (implementa `IKioskAuthValidator`, un puerto distinto, y sigue siendo el mecanismo real de autenticación del kiosco) — no se toca ni se fusiona con él.

- [ ] **Step 2: Commit**

```bash
git add packages/infrastructure/persistence/prisma/PrismaSucursalRepository.ts
git commit -m "feat: agrega PrismaSucursalRepository (listarPorOrganizacion + buscarPorApiKey)"
```

---

### Task 4: Extender `Pago`, `IPagoRepository` y `ListarPagos`

**Files:**
- Modify: `packages/domain/entities/Pago.ts`
- Modify: `packages/domain/ports/IPagoRepository.ts`
- Modify: `packages/domain/use-cases/ListarPagos.ts`

**Interfaces:**
- Produces: `Pago.miembroNombre` (opcional), `IPagoRepository.listarPorOrganizacion` — consumidos por la Tarea 5 (`PrismaPagoRepository`) y la Tarea 12 (página `/pagos`).
- Produces: `listarPagos` con `miembroId` opcional — consumido por la Tarea 12 (`/pagos`, sin `miembroId`) y reutilizado sin cambios por la ruta API existente y por la Tarea 14 (`/miembros/[id]`, con `miembroId`).

- [ ] **Step 1: Reemplazar el contenido completo de `packages/domain/entities/Pago.ts`**

```typescript
export interface Pago {
  id: string;
  miembroId: string;
  // Solo poblado por listarPorOrganizacion (denormalizado, igual que
  // Miembro.entrenadorNombre) — listarPorMiembro no lo necesita porque
  // el llamador ya sabe de qué miembro se trata.
  miembroNombre?: string;
  monto: number;
  metodo: string;
  tasaCambio: number | null;
  fechaPago: Date;
}

export interface DatosNuevoPago {
  miembroId: string;
  monto: number;
  metodo: string;
  tasaCambio: number | null;
}
```

- [ ] **Step 2: Reemplazar el contenido completo de `packages/domain/ports/IPagoRepository.ts`**

```typescript
import { Pago, DatosNuevoPago } from "../entities/Pago";

export interface IPagoRepository {
  crear(datos: DatosNuevoPago): Promise<Pago>;
  listarPorMiembro(miembroId: string): Promise<Pago[]>;
  listarPorOrganizacion(organizacionId: string): Promise<Pago[]>;
}
```

- [ ] **Step 3: Reemplazar el contenido completo de `packages/domain/use-cases/ListarPagos.ts`**

```typescript
import { IPagoRepository } from "../ports/IPagoRepository";
import { IMemberRepository } from "../ports/IMemberRepository";
import { Pago } from "../entities/Pago";

export class MiembroNoEncontradoError extends Error {
  constructor() {
    super("No se encontró el miembro.");
  }
}

export async function listarPagos(
  deps: { pagos: IPagoRepository; miembros: IMemberRepository },
  input: { organizacionId: string; miembroId?: string }
): Promise<Pago[]> {
  if (!input.miembroId) {
    return deps.pagos.listarPorOrganizacion(input.organizacionId);
  }

  const miembro = await deps.miembros.buscarPorId(input.organizacionId, input.miembroId);
  if (!miembro) {
    throw new MiembroNoEncontradoError();
  }

  return deps.pagos.listarPorMiembro(input.miembroId);
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/domain/entities/Pago.ts packages/domain/ports/IPagoRepository.ts packages/domain/use-cases/ListarPagos.ts
git commit -m "feat: extiende Pago/IPagoRepository/ListarPagos para soportar listado global"
```

---

### Task 5: Extender `PrismaPagoRepository`

**Files:**
- Modify: `packages/infrastructure/persistence/prisma/PrismaPagoRepository.ts`

**Interfaces:**
- Consumes: `IPagoRepository` extendido (Tarea 4).
- Produces: `PrismaPagoRepository.listarPorOrganizacion` — consumido por la Tarea 12 (página `/pagos`) y la ruta API extendida (Tarea 6).

- [ ] **Step 1: Reemplazar el contenido completo de `packages/infrastructure/persistence/prisma/PrismaPagoRepository.ts`**

```typescript
import type { PrismaClient } from "@gym-app/db/generated/prisma/client";
import type { IPagoRepository } from "@gym-app/domain/ports/IPagoRepository";
import type { Pago, DatosNuevoPago } from "@gym-app/domain/entities/Pago";

type FilaPago = {
  id: string;
  miembroId: string;
  monto: { toNumber(): number };
  metodo: string;
  tasaCambio: { toNumber(): number } | null;
  fechaPago: Date;
};

function mapear(pago: FilaPago): Pago {
  return {
    id: pago.id,
    miembroId: pago.miembroId,
    monto: pago.monto.toNumber(),
    metodo: pago.metodo,
    tasaCambio: pago.tasaCambio ? pago.tasaCambio.toNumber() : null,
    fechaPago: pago.fechaPago,
  };
}

export class PrismaPagoRepository implements IPagoRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async crear(datos: DatosNuevoPago): Promise<Pago> {
    const pago = await this.prisma.pago.create({
      data: {
        miembroId: datos.miembroId,
        monto: datos.monto,
        metodo: datos.metodo,
        tasaCambio: datos.tasaCambio,
      },
    });

    return mapear(pago);
  }

  async listarPorMiembro(miembroId: string): Promise<Pago[]> {
    const pagos = await this.prisma.pago.findMany({
      where: { miembroId },
      orderBy: { fechaPago: "desc" },
    });

    return pagos.map(mapear);
  }

  async listarPorOrganizacion(organizacionId: string): Promise<Pago[]> {
    const pagos = await this.prisma.pago.findMany({
      where: { miembro: { organizacionId } },
      include: { miembro: { select: { nombre: true } } },
      orderBy: { fechaPago: "desc" },
    });

    return pagos.map((pago) => ({ ...mapear(pago), miembroNombre: pago.miembro.nombre }));
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/infrastructure/persistence/prisma/PrismaPagoRepository.ts
git commit -m "feat: agrega PrismaPagoRepository.listarPorOrganizacion (con miembroNombre denormalizado)"
```

---

### Task 6: Extender `GET /api/pagos` para aceptar listado global

**Files:**
- Modify: `apps/web-admin/app/api/pagos/route.ts`

**Interfaces:**
- Consumes: `listarPagos` con `miembroId` opcional (Tarea 4).

- [ ] **Step 1: Reemplazar la función `GET` en `apps/web-admin/app/api/pagos/route.ts`**

Reemplazar únicamente la función `GET` existente (dejar `POST` intacto):

```typescript
export async function GET(req: NextRequest) {
  const usuario = await obtenerUsuarioDeSesion(req);

  if (!usuario) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const miembroId = req.nextUrl.searchParams.get("miembroId") ?? undefined;

  try {
    const pagos = await listarPagos(
      { pagos: new PrismaPagoRepository(prisma), miembros: new PrismaMemberRepository(prisma) },
      { organizacionId: usuario.organizacionId, miembroId }
    );

    return NextResponse.json({ pagos });
  } catch (error) {
    if (error instanceof ListarPagosMiembroNoEncontradoError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error("Error al listar pagos:", error);
    return NextResponse.json({ error: "Error interno al listar los pagos." }, { status: 500 });
  }
}
```

También actualizar el comentario de cabecera del archivo (primeras 2 líneas), de:
```typescript
// POST /api/pagos            — registra un pago; crea/extiende la Suscripcion ACTIVA del Plan indicado.
// GET  /api/pagos?miembroId= — lista el historial de pagos de ese miembro.
```
a:
```typescript
// POST /api/pagos            — registra un pago; crea/extiende la Suscripcion ACTIVA del Plan indicado.
// GET  /api/pagos            — lista todos los pagos de la organización (más reciente primero).
// GET  /api/pagos?miembroId= — lista el historial de pagos de ese miembro.
```

- [ ] **Step 2: Commit**

```bash
git add apps/web-admin/app/api/pagos/route.ts
git commit -m "feat: GET /api/pagos acepta listar sin miembroId (historial global)"
```

---

### Task 7: Server Actions de `Plan`

**Files:**
- Create: `apps/web-admin/app/(panel)/planes/actions.ts`

**Interfaces:**
- Consumes: `crearPlan`/`SucursalesRequeridasError`/`SucursalInvalidaError`, `actualizarPlan`/`PlanNoEncontradoError` (Plan 6), `obtenerUsuarioDeSesionActual`.
- Produces: `crearPlanAction`, `actualizarPlanAction`, `EstadoFormularioPlan` — consumidos por la Tarea 9 (`FormularioPlan`), Tarea 10 (`/planes/nuevo`), Tarea 11 (`/planes/[id]`).

- [ ] **Step 1: `apps/web-admin/app/(panel)/planes/actions.ts`**

```typescript
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaPlanRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPlanRepository";
import { crearPlan, SucursalesRequeridasError, SucursalInvalidaError } from "@gym-app/domain/use-cases/CrearPlan";
import { actualizarPlan, PlanNoEncontradoError } from "@gym-app/domain/use-cases/ActualizarPlan";
import type { TipoAccesoPlan } from "@gym-app/domain/entities/Plan";

export interface EstadoFormularioPlan {
  error?: string;
}

export async function crearPlanAction(
  _estadoPrevio: EstadoFormularioPlan,
  formData: FormData
): Promise<EstadoFormularioPlan> {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const nombre = formData.get("nombre")?.toString().trim();
  const tipoAcceso = formData.get("tipoAcceso")?.toString() as TipoAccesoPlan | undefined;
  const precioUSD = Number(formData.get("precioUSD"));
  const sucursalIds = formData.getAll("sucursalIds").map((valor) => valor.toString());

  if (!nombre || !tipoAcceso || Number.isNaN(precioUSD)) {
    return { error: "Nombre, tipo de acceso y precio son requeridos." };
  }

  try {
    await crearPlan(
      { planes: new PrismaPlanRepository(prisma) },
      {
        organizacionId: usuario.organizacionId,
        nombre,
        tipoAcceso,
        precioUSD,
        sucursalIds,
      }
    );
  } catch (error) {
    if (error instanceof SucursalesRequeridasError || error instanceof SucursalInvalidaError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/planes");
  redirect("/planes");
}

export async function actualizarPlanAction(
  id: string,
  _estadoPrevio: EstadoFormularioPlan,
  formData: FormData
): Promise<EstadoFormularioPlan> {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const nombre = formData.get("nombre")?.toString().trim();
  const precioUSD = Number(formData.get("precioUSD"));

  if (!nombre || Number.isNaN(precioUSD)) {
    return { error: "Nombre y precio son requeridos." };
  }

  try {
    await actualizarPlan(
      { planes: new PrismaPlanRepository(prisma) },
      { organizacionId: usuario.organizacionId, id, cambios: { nombre, precioUSD } }
    );
  } catch (error) {
    if (error instanceof PlanNoEncontradoError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/planes");
  redirect("/planes");
}

export async function darDeBajaPlanAction(id: string): Promise<void> {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  await actualizarPlan(
    { planes: new PrismaPlanRepository(prisma) },
    { organizacionId: usuario.organizacionId, id, cambios: { activo: false } }
  );

  revalidatePath("/planes");
}

export async function reactivarPlanAction(id: string): Promise<void> {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  await actualizarPlan(
    { planes: new PrismaPlanRepository(prisma) },
    { organizacionId: usuario.organizacionId, id, cambios: { activo: true } }
  );

  revalidatePath("/planes");
}
```

**Nota:** `actualizarPlanAction` nunca lee ni envía `tipoAcceso` ni `sucursalIds` en `cambios` — `CambiosPlan` (Plan 6) ni siquiera tiene esos campos, así que es estructuralmente imposible violar la inmutabilidad desde acá, igual que `CambiosMiembro` no tiene `cedula`.

- [ ] **Step 2: Commit**

```bash
git add "apps/web-admin/app/(panel)/planes/actions.ts"
git commit -m "feat: agrega las Server Actions de Plan (crear/actualizar/dar de baja/reactivar)"
```

---

### Task 8: Página que provee sucursales — helper compartido

**Files:**
- Create: `apps/web-admin/app/(panel)/planes/obtenerSucursales.ts`

**Interfaces:**
- Consumes: `listarSucursales` (Tarea 2), `PrismaSucursalRepository` (Tarea 3), `obtenerUsuarioDeSesionActual`.
- Produces: `obtenerSucursalesDeLaOrganizacion()` — consumido por la Tarea 10 (`/planes/nuevo`) y la Tarea 11 (`/planes/[id]`, para mostrar los nombres de las sucursales ya asignadas).

Este helper evita duplicar la instanciación de `PrismaSucursalRepository` + llamada a `listarSucursales` en dos páginas distintas — no es un caso de uso de dominio (no tiene lógica de negocio), es un adaptador delgado específico de esta app, igual de razonable que cualquier función en `lib/`.

- [ ] **Step 1: `apps/web-admin/app/(panel)/planes/obtenerSucursales.ts`**

```typescript
import { prisma } from "@/lib/prisma";
import { PrismaSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSucursalRepository";
import { listarSucursales } from "@gym-app/domain/use-cases/ListarSucursales";
import type { SucursalResumen } from "@gym-app/domain/entities/SucursalResumen";

export async function obtenerSucursalesDeLaOrganizacion(organizacionId: string): Promise<SucursalResumen[]> {
  return listarSucursales({ sucursales: new PrismaSucursalRepository(prisma) }, organizacionId);
}
```

- [ ] **Step 2: Commit**

```bash
git add "apps/web-admin/app/(panel)/planes/obtenerSucursales.ts"
git commit -m "feat: agrega el helper obtenerSucursalesDeLaOrganizacion"
```

---

### Task 9: Formulario compartido `FormularioPlan`

**Files:**
- Create: `apps/web-admin/app/(panel)/planes/FormularioPlan.tsx`

**Interfaces:**
- Consumes: `Button`, `Input` (Plan 9), `EstadoFormularioPlan` (Tarea 7), `SucursalResumen` (Tarea 1).
- Produces: `FormularioPlan` — consumido por la Tarea 10 (`/planes/nuevo`) y la Tarea 11 (`/planes/[id]`).

- [ ] **Step 1: `apps/web-admin/app/(panel)/planes/FormularioPlan.tsx`**

```tsx
"use client";

import { useActionState, useState } from "react";
import { Button } from "@gym-app/ui/components/Button";
import { Input } from "@gym-app/ui/components/Input";
import type { EstadoFormularioPlan } from "./actions";
import type { SucursalResumen } from "@gym-app/domain/entities/SucursalResumen";

export interface ValoresFormularioPlan {
  nombre: string;
  tipoAcceso: "SEDE_UNICA" | "LISTA_CERRADA" | "TODA_LA_ORGANIZACION";
  precioUSD: number;
  sucursalesAsignadas: SucursalResumen[];
}

export function FormularioPlan({
  accion,
  sucursales,
  valoresIniciales,
}: {
  accion: (estado: EstadoFormularioPlan, formData: FormData) => Promise<EstadoFormularioPlan>;
  sucursales: SucursalResumen[];
  valoresIniciales?: ValoresFormularioPlan;
}) {
  const [estado, enviar, enviando] = useActionState(accion, {});
  const esEdicion = !!valoresIniciales;
  const [tipoAcceso, setTipoAcceso] = useState(valoresIniciales?.tipoAcceso ?? "TODA_LA_ORGANIZACION");
  const idsAsignados = new Set(valoresIniciales?.sucursalesAsignadas.map((s) => s.id) ?? []);

  return (
    <form action={enviar} className="flex flex-col gap-4">
      {estado.error && (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{estado.error}</p>
      )}

      <Input name="nombre" label="Nombre" required defaultValue={valoresIniciales?.nombre} />

      <label className="flex flex-col gap-1 text-sm text-neutral-700">
        Tipo de acceso
        <select
          name="tipoAcceso"
          disabled={esEdicion}
          value={tipoAcceso}
          onChange={(e) => setTipoAcceso(e.target.value as typeof tipoAcceso)}
          className="rounded border border-neutral-300 px-3 py-2 disabled:bg-neutral-100 disabled:text-neutral-500"
        >
          <option value="TODA_LA_ORGANIZACION">Toda la organización</option>
          <option value="SEDE_UNICA">Sede única</option>
          <option value="LISTA_CERRADA">Lista cerrada de sedes</option>
        </select>
      </label>

      {tipoAcceso !== "TODA_LA_ORGANIZACION" && (
        <fieldset className="flex flex-col gap-2 rounded border border-neutral-300 p-3">
          <legend className="px-1 text-sm text-neutral-700">Sucursales con acceso</legend>
          {sucursales.length === 0 && (
            <p className="text-sm text-neutral-500">No hay sucursales creadas todavía.</p>
          )}
          {sucursales.map((sucursal) => (
            <label key={sucursal.id} className="flex items-center gap-2 text-sm text-neutral-700">
              <input
                type="checkbox"
                name="sucursalIds"
                value={sucursal.id}
                disabled={esEdicion}
                defaultChecked={idsAsignados.has(sucursal.id)}
              />
              {sucursal.nombre}
            </label>
          ))}
        </fieldset>
      )}

      <Input
        name="precioUSD"
        label="Precio (USD)"
        type="number"
        step="0.01"
        required
        defaultValue={valoresIniciales?.precioUSD}
      />

      <Button type="submit" disabled={enviando}>
        {enviando ? "Guardando..." : "Guardar"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "apps/web-admin/app/(panel)/planes/FormularioPlan.tsx"
git commit -m "feat: agrega el formulario compartido de alta/edición de Plan"
```

---

### Task 10: Página `/planes/nuevo` (alta)

**Files:**
- Create: `apps/web-admin/app/(panel)/planes/nuevo/page.tsx`

**Interfaces:**
- Consumes: `FormularioPlan` (Tarea 9), `crearPlanAction` (Tarea 7), `obtenerSucursalesDeLaOrganizacion` (Tarea 8).

- [ ] **Step 1: `apps/web-admin/app/(panel)/planes/nuevo/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { obtenerSucursalesDeLaOrganizacion } from "../obtenerSucursales";
import { FormularioPlan } from "../FormularioPlan";
import { crearPlanAction } from "../actions";

export default async function PaginaNuevoPlan() {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const sucursales = await obtenerSucursalesDeLaOrganizacion(usuario.organizacionId);

  return (
    <div className="max-w-lg p-8">
      <h1 className="mb-6 text-2xl font-semibold">Nuevo plan</h1>
      <FormularioPlan accion={crearPlanAction} sucursales={sucursales} />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "apps/web-admin/app/(panel)/planes/nuevo/page.tsx"
git commit -m "feat: agrega la página de alta de Plan"
```

---

### Task 11: Página `/planes/[id]` (edición)

**Files:**
- Create: `apps/web-admin/app/(panel)/planes/[id]/page.tsx`

**Interfaces:**
- Consumes: `PrismaPlanRepository`/`Plan.buscarPorId` (Plan 6), `FormularioPlan` (Tarea 9), `actualizarPlanAction`/`darDeBajaPlanAction`/`reactivarPlanAction` (Tarea 7), `obtenerSucursalesDeLaOrganizacion` (Tarea 8).

`buscarPorId` de `PrismaPlanRepository` (Plan 6) devuelve `Plan | null`, no lanza una excepción de dominio propia (a diferencia de `obtenerMiembro`) — esta página maneja el `null` directo con `notFound()`, sin necesitar un `.catch()`.

Para saber qué sucursales están asignadas a este plan y mostrarlas marcadas en el formulario de edición, se necesita el detalle de `PlanSucursalAcceso` — pero `IPlanRepository`/`PrismaPlanRepository` (Plan 6) no expone esa relación. Para no ampliar el dominio del Plan 6 en este plan, esta página consulta esa tabla directamente vía Prisma (un caso de lectura simple, específico de esta página, igual de razonable que cómo `obtenerSucursalesDeLaOrganizacion` ya hace lecturas fuera del dominio para un propósito puntual de UI).

- [ ] **Step 1: `apps/web-admin/app/(panel)/planes/[id]/page.tsx`**

```tsx
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaPlanRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPlanRepository";
import { obtenerSucursalesDeLaOrganizacion } from "../obtenerSucursales";
import { FormularioPlan } from "../FormularioPlan";
import { actualizarPlanAction, darDeBajaPlanAction, reactivarPlanAction } from "../actions";
import { Button } from "@gym-app/ui/components/Button";

export default async function PaginaEditarPlan({ params }: { params: Promise<{ id: string }> }) {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const { id } = await params;

  const plan = await new PrismaPlanRepository(prisma).buscarPorId(usuario.organizacionId, id);
  if (!plan) notFound();

  const [sucursales, accesos] = await Promise.all([
    obtenerSucursalesDeLaOrganizacion(usuario.organizacionId),
    prisma.planSucursalAcceso.findMany({ where: { planId: id }, select: { sucursalId: true } }),
  ]);

  const idsAsignados = new Set(accesos.map((a) => a.sucursalId));
  const sucursalesAsignadas = sucursales.filter((s) => idsAsignados.has(s.id));

  return (
    <div className="max-w-lg p-8">
      <h1 className="mb-6 text-2xl font-semibold">Editar plan</h1>

      <FormularioPlan
        accion={actualizarPlanAction.bind(null, id)}
        sucursales={sucursales}
        valoresIniciales={{
          nombre: plan.nombre,
          tipoAcceso: plan.tipoAcceso,
          precioUSD: plan.precioUSD,
          sucursalesAsignadas,
        }}
      />

      {plan.activo ? (
        <form action={darDeBajaPlanAction.bind(null, id)} className="mt-6">
          <Button variant="peligro" type="submit">
            Dar de baja
          </Button>
        </form>
      ) : (
        <form action={reactivarPlanAction.bind(null, id)} className="mt-6">
          <Button variant="secundario" type="submit">
            Reactivar
          </Button>
        </form>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "apps/web-admin/app/(panel)/planes/[id]/page.tsx"
git commit -m "feat: agrega la página de edición de Plan"
```

---

### Task 12: Página `/planes` (listado)

**Files:**
- Create: `apps/web-admin/app/(panel)/planes/page.tsx`

**Interfaces:**
- Consumes: `listarPlanes` (Plan 6), `obtenerUsuarioDeSesionActual`, `Button`, `Badge`.

- [ ] **Step 1: `apps/web-admin/app/(panel)/planes/page.tsx`**

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaPlanRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPlanRepository";
import { listarPlanes } from "@gym-app/domain/use-cases/ListarPlanes";
import { Button } from "@gym-app/ui/components/Button";
import { Badge } from "@gym-app/ui/components/Badge";

const ETIQUETA_TIPO_ACCESO: Record<string, string> = {
  TODA_LA_ORGANIZACION: "Toda la organización",
  SEDE_UNICA: "Sede única",
  LISTA_CERRADA: "Lista cerrada",
};

export default async function PaginaPlanes() {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const planes = await listarPlanes({ planes: new PrismaPlanRepository(prisma) }, usuario.organizacionId);

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Planes</h1>
        <Link href="/planes/nuevo">
          <Button>Nuevo plan</Button>
        </Link>
      </div>

      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b text-sm text-neutral-500">
            <th className="py-2">Nombre</th>
            <th className="py-2">Tipo de acceso</th>
            <th className="py-2">Precio (USD)</th>
            <th className="py-2">Estado</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {planes.map((plan) => (
            <tr key={plan.id} className="border-b">
              <td className="py-2">{plan.nombre}</td>
              <td className="py-2">{ETIQUETA_TIPO_ACCESO[plan.tipoAcceso]}</td>
              <td className="py-2">${plan.precioUSD.toFixed(2)}</td>
              <td className="py-2">
                <Badge tono={plan.activo ? "verde" : "gris"}>{plan.activo ? "Activo" : "Inactivo"}</Badge>
              </td>
              <td className="py-2">
                <Link href={`/planes/${plan.id}`} className="text-sm font-medium text-blue-600 hover:underline">
                  Editar
                </Link>
              </td>
            </tr>
          ))}

          {planes.length === 0 && (
            <tr>
              <td colSpan={5} className="py-8 text-center text-neutral-500">
                Todavía no hay planes. Creá el primero.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "apps/web-admin/app/(panel)/planes/page.tsx"
git commit -m "feat: agrega la página de listado de Planes"
```

---

### Task 13: Server Action de `Pago` y `FormularioPago` compartido

**Files:**
- Create: `apps/web-admin/app/(panel)/pagos/actions.ts`
- Create: `apps/web-admin/app/(panel)/pagos/FormularioPago.tsx`

**Interfaces:**
- Consumes: `registrarPago`/`MiembroNoEncontradoError`/`PlanNoEncontradoError`/`PlanInactivoError` (Plan 6), `obtenerUsuarioDeSesionActual`, `Button`, `Input` (Plan 9).
- Produces: `registrarPagoAction`, `EstadoFormularioPago`, `FormularioPago` — consumidos por la Tarea 15 (`/pagos/nuevo`) y la Tarea 16 (`/miembros/[id]`, con `miembroIdFijo`).

`registrarPagoAction` revalida tanto `/pagos` (el listado global) como `/miembros/[miembroId]` (el historial dentro de la ficha) — sin importar desde cuál de las dos pantallas se haya invocado, ambas vistas quedan al día.

- [ ] **Step 1: `apps/web-admin/app/(panel)/pagos/actions.ts`**

```typescript
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaPagoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPagoRepository";
import { PrismaSuscripcionRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSuscripcionRepository";
import { PrismaMemberRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMemberRepository";
import { PrismaPlanRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPlanRepository";
import {
  registrarPago,
  MiembroNoEncontradoError,
  PlanNoEncontradoError,
  PlanInactivoError,
} from "@gym-app/domain/use-cases/RegistrarPago";

export interface EstadoFormularioPago {
  error?: string;
}

export async function registrarPagoAction(
  _estadoPrevio: EstadoFormularioPago,
  formData: FormData
): Promise<EstadoFormularioPago> {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const miembroId = formData.get("miembroId")?.toString();
  const planId = formData.get("planId")?.toString();
  const monto = Number(formData.get("monto"));
  const metodo = formData.get("metodo")?.toString();
  const tasaCambioRaw = formData.get("tasaCambio")?.toString();

  if (!miembroId || !planId || !metodo || Number.isNaN(monto)) {
    return { error: "Miembro, plan, método y monto son requeridos." };
  }

  try {
    await registrarPago(
      {
        pagos: new PrismaPagoRepository(prisma),
        suscripciones: new PrismaSuscripcionRepository(prisma),
        miembros: new PrismaMemberRepository(prisma),
        planes: new PrismaPlanRepository(prisma),
      },
      {
        organizacionId: usuario.organizacionId,
        miembroId,
        planId,
        monto,
        metodo,
        tasaCambio: tasaCambioRaw ? Number(tasaCambioRaw) : null,
      }
    );
  } catch (error) {
    if (
      error instanceof MiembroNoEncontradoError ||
      error instanceof PlanNoEncontradoError ||
      error instanceof PlanInactivoError
    ) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/pagos");
  revalidatePath(`/miembros/${miembroId}`);
  redirect(`/miembros/${miembroId}`);
}
```

- [ ] **Step 2: `apps/web-admin/app/(panel)/pagos/FormularioPago.tsx`**

```tsx
"use client";

import { useActionState } from "react";
import { Button } from "@gym-app/ui/components/Button";
import { Input } from "@gym-app/ui/components/Input";
import type { EstadoFormularioPago } from "./actions";

export interface MiembroParaSelector {
  id: string;
  nombre: string;
}

export interface PlanParaSelector {
  id: string;
  nombre: string;
}

const METODOS_PAGO: Array<{ value: string; label: string }> = [
  { value: "efectivo_usd", label: "Efectivo (USD)" },
  { value: "efectivo_bs", label: "Efectivo (Bs)" },
  { value: "transferencia", label: "Transferencia" },
  { value: "zelle", label: "Zelle" },
  { value: "binance_usdt", label: "Binance / USDT" },
  { value: "pago_movil", label: "Pago móvil" },
];

export function FormularioPago({
  accion,
  miembros,
  planes,
  miembroIdFijo,
}: {
  accion: (estado: EstadoFormularioPago, formData: FormData) => Promise<EstadoFormularioPago>;
  miembros: MiembroParaSelector[];
  planes: PlanParaSelector[];
  miembroIdFijo?: string;
}) {
  const [estado, enviar, enviando] = useActionState(accion, {});

  return (
    <form action={enviar} className="flex flex-col gap-4">
      {estado.error && (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{estado.error}</p>
      )}

      {miembroIdFijo ? (
        <input type="hidden" name="miembroId" value={miembroIdFijo} />
      ) : (
        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          Miembro
          <select name="miembroId" required className="rounded border border-neutral-300 px-3 py-2">
            <option value="">Seleccioná un miembro</option>
            {miembros.map((miembro) => (
              <option key={miembro.id} value={miembro.id}>
                {miembro.nombre}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="flex flex-col gap-1 text-sm text-neutral-700">
        Plan
        <select name="planId" required className="rounded border border-neutral-300 px-3 py-2">
          <option value="">Seleccioná un plan</option>
          {planes.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.nombre}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm text-neutral-700">
        Método de pago
        <select name="metodo" required className="rounded border border-neutral-300 px-3 py-2">
          <option value="">Seleccioná un método</option>
          {METODOS_PAGO.map((metodo) => (
            <option key={metodo.value} value={metodo.value}>
              {metodo.label}
            </option>
          ))}
        </select>
      </label>

      <Input name="monto" label="Monto (USD)" type="number" step="0.01" required />

      <Input name="tasaCambio" label="Tasa de cambio (opcional, si el pago fue en Bs)" type="number" step="0.0001" />

      <Button type="submit" disabled={enviando}>
        {enviando ? "Registrando..." : "Registrar pago"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add "apps/web-admin/app/(panel)/pagos/actions.ts" "apps/web-admin/app/(panel)/pagos/FormularioPago.tsx"
git commit -m "feat: agrega registrarPagoAction y el formulario compartido FormularioPago"
```

---

### Task 14: Página `/pagos/nuevo` (alta)

**Files:**
- Create: `apps/web-admin/app/(panel)/pagos/nuevo/page.tsx`

**Interfaces:**
- Consumes: `FormularioPago` (Tarea 13), `registrarPagoAction` (Tarea 13), `listarMiembros` (Plan 5), `listarPlanes` (Plan 6).

Solo se listan planes `activo: true` para el selector — el dominio (`registrarPago`) igual valida esto en el servidor, pero no tiene sentido ofrecer en la UI una opción que sabemos que va a fallar con `PlanInactivoError`.

- [ ] **Step 1: `apps/web-admin/app/(panel)/pagos/nuevo/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaMemberRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMemberRepository";
import { PrismaPlanRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPlanRepository";
import { listarMiembros } from "@gym-app/domain/use-cases/ListarMiembros";
import { listarPlanes } from "@gym-app/domain/use-cases/ListarPlanes";
import { FormularioPago } from "../FormularioPago";
import { registrarPagoAction } from "../actions";

export default async function PaginaNuevoPago() {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const [miembros, planes] = await Promise.all([
    listarMiembros({ miembros: new PrismaMemberRepository(prisma) }, usuario.organizacionId),
    listarPlanes({ planes: new PrismaPlanRepository(prisma) }, usuario.organizacionId),
  ]);

  const planesActivos = planes.filter((plan) => plan.activo);

  return (
    <div className="max-w-lg p-8">
      <h1 className="mb-6 text-2xl font-semibold">Registrar pago</h1>
      <FormularioPago accion={registrarPagoAction} miembros={miembros} planes={planesActivos} />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "apps/web-admin/app/(panel)/pagos/nuevo/page.tsx"
git commit -m "feat: agrega la página de alta de Pago"
```

---

### Task 15: Página `/pagos` (listado global)

**Files:**
- Create: `apps/web-admin/app/(panel)/pagos/page.tsx`

**Interfaces:**
- Consumes: `listarPagos` sin `miembroId` (Tarea 4), `obtenerUsuarioDeSesionActual`, `Button`.

- [ ] **Step 1: `apps/web-admin/app/(panel)/pagos/page.tsx`**

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaPagoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPagoRepository";
import { PrismaMemberRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMemberRepository";
import { listarPagos } from "@gym-app/domain/use-cases/ListarPagos";
import { Button } from "@gym-app/ui/components/Button";

export default async function PaginaPagos() {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const pagos = await listarPagos(
    { pagos: new PrismaPagoRepository(prisma), miembros: new PrismaMemberRepository(prisma) },
    { organizacionId: usuario.organizacionId }
  );

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Pagos</h1>
        <Link href="/pagos/nuevo">
          <Button>Registrar pago</Button>
        </Link>
      </div>

      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b text-sm text-neutral-500">
            <th className="py-2">Fecha</th>
            <th className="py-2">Miembro</th>
            <th className="py-2">Monto (USD)</th>
            <th className="py-2">Método</th>
          </tr>
        </thead>
        <tbody>
          {pagos.map((pago) => (
            <tr key={pago.id} className="border-b">
              <td className="py-2">{new Date(pago.fechaPago).toLocaleDateString("es-VE")}</td>
              <td className="py-2">
                <Link href={`/miembros/${pago.miembroId}`} className="text-blue-600 hover:underline">
                  {pago.miembroNombre ?? pago.miembroId}
                </Link>
              </td>
              <td className="py-2">${pago.monto.toFixed(2)}</td>
              <td className="py-2">{pago.metodo}</td>
            </tr>
          ))}

          {pagos.length === 0 && (
            <tr>
              <td colSpan={4} className="py-8 text-center text-neutral-500">
                Todavía no hay pagos registrados.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "apps/web-admin/app/(panel)/pagos/page.tsx"
git commit -m "feat: agrega la página de listado global de Pagos"
```

---

### Task 16: Extender `/miembros/[id]` con historial de pagos + alta inline

**Files:**
- Modify: `apps/web-admin/app/(panel)/miembros/[id]/page.tsx`

**Interfaces:**
- Consumes: `listarPagos` con `miembroId` (Tarea 4), `PrismaPagoRepository` (Plan 6/Tarea 5), `listarPlanes` (Plan 6), `FormularioPago`/`registrarPagoAction` (Tarea 13).

Esta es la única tarea que modifica un archivo del Plan 9 en vez de crear uno nuevo — se agrega una sección nueva al final del JSX existente, sin tocar el formulario de datos del miembro ni los botones de baja/reactivación ya presentes.

- [ ] **Step 1: Reemplazar el contenido completo de `apps/web-admin/app/(panel)/miembros/[id]/page.tsx`**

```tsx
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaMemberRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMemberRepository";
import { PrismaPagoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPagoRepository";
import { PrismaPlanRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPlanRepository";
import { obtenerMiembro, MiembroNoEncontradoError } from "@gym-app/domain/use-cases/ObtenerMiembro";
import { listarPagos } from "@gym-app/domain/use-cases/ListarPagos";
import { listarPlanes } from "@gym-app/domain/use-cases/ListarPlanes";
import { FormularioMiembro } from "../FormularioMiembro";
import { actualizarMiembroAction, darDeBajaAction, reactivarAction } from "../actions";
import { FormularioPago } from "../../pagos/FormularioPago";
import { registrarPagoAction } from "../../pagos/actions";
import { Button } from "@gym-app/ui/components/Button";

export default async function PaginaEditarMiembro({ params }: { params: Promise<{ id: string }> }) {
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

  const [pagos, planes] = await Promise.all([
    listarPagos(
      { pagos: new PrismaPagoRepository(prisma), miembros: new PrismaMemberRepository(prisma) },
      { organizacionId: usuario.organizacionId, miembroId: id }
    ),
    listarPlanes({ planes: new PrismaPlanRepository(prisma) }, usuario.organizacionId),
  ]);

  const planesActivos = planes.filter((plan) => plan.activo);

  return (
    <div className="max-w-lg p-8">
      <h1 className="mb-6 text-2xl font-semibold">Editar miembro</h1>

      <FormularioMiembro
        accion={actualizarMiembroAction.bind(null, id)}
        valoresIniciales={{
          nombre: miembro.nombre,
          cedula: miembro.cedula,
          celular: miembro.celular ?? "",
          planTipo: miembro.planTipo,
          precioPlan: miembro.precioPlan,
        }}
      />

      {miembro.activo ? (
        <form action={darDeBajaAction.bind(null, id)} className="mt-6">
          <Button variant="peligro" type="submit">
            Dar de baja
          </Button>
        </form>
      ) : (
        <form action={reactivarAction.bind(null, id)} className="mt-6">
          <Button variant="secundario" type="submit">
            Reactivar
          </Button>
        </form>
      )}

      <hr className="my-8 border-neutral-200" />

      <h2 className="mb-4 text-xl font-semibold">Pagos</h2>

      <table className="mb-6 w-full border-collapse text-left">
        <thead>
          <tr className="border-b text-sm text-neutral-500">
            <th className="py-2">Fecha</th>
            <th className="py-2">Monto (USD)</th>
            <th className="py-2">Método</th>
          </tr>
        </thead>
        <tbody>
          {pagos.map((pago) => (
            <tr key={pago.id} className="border-b">
              <td className="py-2">{new Date(pago.fechaPago).toLocaleDateString("es-VE")}</td>
              <td className="py-2">${pago.monto.toFixed(2)}</td>
              <td className="py-2">{pago.metodo}</td>
            </tr>
          ))}

          {pagos.length === 0 && (
            <tr>
              <td colSpan={3} className="py-6 text-center text-neutral-500">
                Todavía no hay pagos registrados para este miembro.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <h3 className="mb-4 text-lg font-semibold">Registrar pago</h3>
      <FormularioPago
        accion={registrarPagoAction}
        miembros={[]}
        planes={planesActivos}
        miembroIdFijo={id}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "apps/web-admin/app/(panel)/miembros/[id]/page.tsx"
git commit -m "feat: agrega historial de pagos y alta inline en la ficha de Miembro"
```

---

### Task 17: Build + verificación de tipos (sin DB)

**Files:** ninguno — tarea de verificación.

- [ ] **Step 1: Verificar tipos**

Run: `cd apps/web-admin && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 2: Build completo**

Run: `cd /c/dev/gym-app && npx turbo run build --filter=web-admin`
Expected: exit 0. Deberían aparecer `/planes`, `/planes/nuevo`, `/planes/[id]`, `/pagos`, `/pagos/nuevo` en el resumen de rutas, junto con las ya existentes de Miembros.

- [ ] **Step 3: Lint**

Run: `npx turbo run lint --filter=web-admin`
Expected: exit 0.

- [ ] **Step 4: No hay commit en esta tarea** — solo verificación.

---

### Task 18: Probar en el navegador contra la base real (requiere red — lo corre el usuario)

**Files:** ninguno — tarea de verificación. No hay migración en este plan (todos los modelos ya existen desde el Plan 2).

- [ ] **Step 1: Levantar el servidor**

```powershell
npm run dev
```

- [ ] **Step 2: Ver el listado de Planes**

Ir a `/planes`. Expected: aparece "Sede Única" y cualquier otro plan del seed/pruebas anteriores, con su tipo de acceso, precio y estado.

- [ ] **Step 3: Crear un plan `TODA_LA_ORGANIZACION`**

Click en "Nuevo plan", completar nombre/precio, dejar tipo de acceso en "Toda la organización" (no debe pedir sucursales), guardar. Expected: vuelve a `/planes`, el nuevo plan aparece en la lista.

- [ ] **Step 4: Crear un plan `SEDE_UNICA` sin marcar ninguna sucursal (debe rechazar)**

Crear otro plan, elegir "Sede única", no marcar ninguna checkbox, guardar. Expected: la página no navega, muestra "Un plan que no es TODA_LA_ORGANIZACION necesita al menos una sucursal asignada."

- [ ] **Step 5: Editar un plan**

Click en "Editar" de cualquier plan, confirmar que "Tipo de acceso" y las sucursales aparecen deshabilitadas (no editables), cambiar el precio, guardar. Expected: vuelve a `/planes`, el precio se actualizó.

- [ ] **Step 6: Dar de baja y reactivar un plan**

En la pantalla de edición, dar de baja un plan (badge pasa a "Inactivo" en el listado), volver a entrar y reactivarlo (badge vuelve a "Activo").

- [ ] **Step 7: Ver el listado global de Pagos**

Ir a `/pagos`. Expected: aparecen los pagos existentes del seed/pruebas anteriores, con fecha, nombre del miembro (no su id), monto y método.

- [ ] **Step 8: Registrar un pago desde `/pagos/nuevo`**

Click en "Registrar pago", elegir un miembro y un plan activo, un método de pago, un monto, guardar. Expected: redirige a la ficha de ese miembro (`/miembros/[id]`), donde el pago recién creado aparece en la sección "Pagos".

- [ ] **Step 9: Confirmar que el selector de plan solo muestra planes activos**

En `/pagos/nuevo` (o en el formulario dentro de la ficha de un miembro), dar de baja un plan primero y confirmar que ya no aparece en el `<select>` de planes al recargar la página.

- [ ] **Step 10: Registrar un pago desde la ficha del miembro**

Ir a `/miembros/[id]` de cualquier miembro, bajar hasta "Registrar pago" (sin selector de miembro, va directo), completar plan/método/monto, guardar. Expected: la página se queda en `/miembros/[id]` (no redirige a otro lado) y el nuevo pago aparece en la tabla de historial de esa misma ficha.

- [ ] **Step 11: Confirmar que el listado global en `/pagos` refleja el pago recién creado**

Ir a `/pagos` después del Step 10. Expected: el pago registrado en la ficha del miembro también aparece acá.

- [ ] **Step 12: Probar `GET /api/pagos` sin `miembroId` (requiere sesión, vía curl o el navegador)**

```powershell
curl.exe -b cookies.txt http://localhost:3000/api/pagos
```

Expected: `200`, `{"pagos":[...]}` con todos los pagos de la organización (mismo contenido que ve `/pagos`).

- [ ] **Step 13: No hay commit en esta tarea** — es solo verificación.

---

## Fuera de alcance de este plan (explícitamente diferido)

- Editar/cancelar un `Pago` ya registrado — el dominio no lo soporta, no se agrega acá.
- Dashboard/resumen financiero (totales, gráficos) — esto es un listado simple.
- Filtros/búsqueda/paginación en `/pagos` o `/planes`.
- Conversión USD↔VES en el formulario de pago (`ConvertirMontoUSDaVES` existe desde el Plan 7 pero sin consumidor real todavía).
- Theming/dark mode completo — sigue diferido a `packages/theming` (mismo ruling que el Plan 9).
- Rotación de `apiKey` de `Sucursal` — sin relación con este plan salvo que `SucursalResumen` cuidadosamente nunca la expone.

## Execution Handoff

Dos opciones de ejecución:

**1. Subagent-Driven (recomendado)** — un subagente fresco por tarea, revisión entre tareas.

**2. Inline Execution** — ejecuto las Tareas 1–17 yo mismo en esta sesión (no requieren la base de datos real), y la Tarea 18 la corres tú.

¿Cuál prefieres?
