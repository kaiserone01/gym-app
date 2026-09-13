# Gestión de Pago/Suscripción/Plan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar `RegistrarPago` (crea/extiende la `Suscripcion` `ACTIVA` del `Plan` pagado y sincroniza los campos legacy de `Miembro`), listar el historial de pagos de un miembro, y el CRUD de `Plan` (el modelo de acceso a sucursales, no el `planTipo` de entrenador) — cierra el último bloqueador 🔴 de `docs/ROADMAP.md`.

**Architecture:** Mismo patrón hexagonal. `packages/domain` gana las entidades `Plan`/`Pago`, los puertos `IPlanRepository`/`IPagoRepository`, extiende `ISuscripcionRepository`/`IMemberRepository`, y los casos de uso `CrearPlan`/`ListarPlanes`/`ActualizarPlan`/`RegistrarPago`/`ListarPagos`. `packages/infrastructure` gana `PrismaPlanRepository`/`PrismaPagoRepository` y extiende `PrismaSuscripcionRepository`/`PrismaMemberRepository`. `apps/web-admin` gana 3 rutas (`/api/planes`, `/api/planes/[id]`, `/api/pagos`), todas protegidas con el helper de sesión existente.

**Tech Stack:** Sin dependencias nuevas.

**Spec:** `docs/ROADMAP.md` (último bloqueador 🔴), decisiones de esta sesión:

| Decisión | Resultado |
|---|---|
| Duración de la Suscripcion por pago | 30 días fijos (convención mensual). No configurable por Plan en este plan. |
| Si ya hay una Suscripcion ACTIVA vigente para el mismo Plan | Se extiende sumando 30 días desde `max(fin actual, hoy)` — no se pierden días ya pagados. Si no hay ninguna vigente (o es de otro Plan), se crea una nueva. |
| Campos legacy `Miembro.fechaUltimoPago`/`fechaVencimiento` | Se mantienen sincronizados en cada pago (siguen sin usarse para autorizar — eso ya vive en `Suscripcion`, desde el Plan 3). |
| Alcance de `Plan` | CRUD completo: crear (con las sucursales de acceso si `tipoAcceso` no es `TODA_LA_ORGANIZACION`), listar, editar `nombre`/`precioUSD`/`activo`. `tipoAcceso` y las sucursales asignadas son inmutables tras crear (mismo criterio que `cedula` en `Miembro` — evita el caso borde de reasignar accesos a mitad de ciclo). |
| Alcance de `Pago` | Registrar (`RegistrarPago`) y listar historial por miembro (`GET /api/pagos?miembroId=`). Sin edición ni borrado de pagos — un pago registrado es un hecho histórico. |
| Autorización | Cualquier `UsuarioAdmin` autenticado, mismo criterio que Plan 5 (una sola regla de rol real hoy: crear `UsuarioAdmin` es exclusiva de `DUENO`). |

## Global Constraints

- **Todo el scoping es por `organizacionId` del usuario en sesión** — `RegistrarPago`, `CrearPlan`, `ActualizarPlan` y `ListarPagos` verifican que `Miembro`/`Plan` pertenezcan a la organización del solicitante antes de tocar cualquier dato (mismo principio del Plan 5).
- **`tipoAcceso` de un `Plan` es inmutable** tras crearlo — no forma parte de `CambiosPlan`/`PATCH /api/planes/[id]`.
- **Las sucursales de acceso de un `Plan`** (`PlanSucursalAcceso`) se fijan solo al crear — este plan no agrega un endpoint para modificarlas después.
- **Un `Plan` con `sucursalIds` debe pertenecer todas a la misma organización** — nunca se confía en un `sucursalId` del body sin verificar (`IPlanRepository.sucursalesValidas`), mismo principio que evitó el hallazgo crítico del `apiKey` en el Plan 3.
- **No se puede registrar un pago contra un `Plan` con `activo: false`.**
- No hay `DELETE` para `Plan` ni `Pago` — "dar de baja" un `Plan` es `PATCH {"activo": false}` (baja lógica, igual que `Miembro`).
- Duración fija de la `Suscripcion` por pago: 30 días (constante `DURACION_SUSCRIPCION_DIAS`).
- Nunca ejecutar `git commit`/`git push` automáticamente salvo instrucción explícita del usuario.

---

## Pre-flight: lo que ya existe y se reutiliza

- `apps/web-admin/lib/sesion.ts` (`obtenerUsuarioDeSesion`) — se reutiliza sin cambios.
- `packages/domain/entities/Suscripcion.ts` — **no se toca**. Ya define un `Plan` embebido mínimo (`id`, `organizacionId`, `tipoAcceso`) usado solo por `ValidarAccesoSucursalPorPlan` (check-in). La entidad `Plan` completa de este plan vive en un archivo nuevo (`entities/Plan.ts`) — son tipos distintos con el mismo nombre en módulos distintos, no colisionan porque todo se importa por path completo (`@gym-app/domain/entities/Plan` vs `@gym-app/domain/entities/Suscripcion`), sin barrel `index.ts` en el paquete.
- `packages/domain/ports/ISuscripcionRepository.ts` / `packages/infrastructure/persistence/prisma/PrismaSuscripcionRepository.ts` ya existen con `buscarActivaVigentePorMiembro`/`tieneAccesoASucursal` (usados por check-in) — este plan les agrega métodos nuevos sin tocar esos dos.
- `packages/domain/ports/IMemberRepository.ts` / `PrismaMemberRepository.ts` ya tienen todo el CRUD del Plan 5 — este plan les agrega un solo método (`actualizarFechasPago`), sin tocar los existentes.
- Modelos `Plan`, `Suscripcion`, `Pago`, `PlanSucursalAcceso` ya existen en `schema.prisma` desde el Plan 2 — **no hay migración en este plan**.

---

### Task 1: Entidades `Plan` y `Pago`

**Files:**
- Create: `packages/domain/entities/Plan.ts`
- Create: `packages/domain/entities/Pago.ts`

**Interfaces:**
- Produces: `Plan`, `DatosNuevoPlan`, `CambiosPlan`, `Pago`, `DatosNuevoPago` — consumidos por los puertos (Tarea 2), casos de uso (Tareas 4-5) y rutas (Tarea 6).

- [ ] **Step 1: `packages/domain/entities/Plan.ts`**

```typescript
export type TipoAccesoPlan = "SEDE_UNICA" | "LISTA_CERRADA" | "TODA_LA_ORGANIZACION";

export interface Plan {
  id: string;
  organizacionId: string;
  nombre: string;
  tipoAcceso: TipoAccesoPlan;
  precioUSD: number;
  activo: boolean;
}

export interface DatosNuevoPlan {
  organizacionId: string;
  nombre: string;
  tipoAcceso: TipoAccesoPlan;
  precioUSD: number;
  // Ignorado si tipoAcceso es TODA_LA_ORGANIZACION. Requerido (no vacío) en
  // cualquier otro caso — CrearPlan lo valida antes de llegar aquí.
  sucursalIds: string[];
}

export interface CambiosPlan {
  nombre?: string;
  precioUSD?: number;
  activo?: boolean;
}
```

- [ ] **Step 2: `packages/domain/entities/Pago.ts`**

```typescript
export interface Pago {
  id: string;
  miembroId: string;
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

- [ ] **Step 3: Commit**

```bash
git add packages/domain/entities/Plan.ts packages/domain/entities/Pago.ts
git commit -m "feat: agrega las entidades Plan y Pago"
```

---

### Task 2: Extender `IMemberRepository` con `actualizarFechasPago`

**Files:**
- Modify: `packages/domain/ports/IMemberRepository.ts`
- Modify: `packages/infrastructure/persistence/prisma/PrismaMemberRepository.ts`

**Interfaces:**
- Produces: `actualizarFechasPago(id, fechaUltimoPago, fechaVencimiento): Promise<void>` — consumido por `RegistrarPago` (Tarea 5).

- [ ] **Step 1: Agregar el método a la interfaz**

En `packages/domain/ports/IMemberRepository.ts`, agregar esta línea dentro de `IMemberRepository` (no se toca nada más del archivo):

```typescript
  actualizarFechasPago(id: string, fechaUltimoPago: Date, fechaVencimiento: Date): Promise<void>;
```

El archivo completo queda así:

```typescript
import { Miembro, DatosNuevoMiembro, CambiosMiembro } from "../entities/Miembro";

export interface IMemberRepository {
  buscarPorOrganizacionYCedula(organizacionId: string, cedula: string): Promise<Miembro | null>;
  buscarPorId(organizacionId: string, id: string): Promise<Miembro | null>;
  listarPorOrganizacion(organizacionId: string): Promise<Miembro[]>;
  crear(datos: DatosNuevoMiembro): Promise<Miembro>;
  actualizar(organizacionId: string, id: string, cambios: CambiosMiembro): Promise<Miembro | null>;
  actualizarFechasPago(id: string, fechaUltimoPago: Date, fechaVencimiento: Date): Promise<void>;
}
```

- [ ] **Step 2: Implementar el método**

Agregar este método dentro de la clase `PrismaMemberRepository` en `packages/infrastructure/persistence/prisma/PrismaMemberRepository.ts` (después de `actualizar`, sin tocar el resto del archivo):

```typescript
  async actualizarFechasPago(id: string, fechaUltimoPago: Date, fechaVencimiento: Date): Promise<void> {
    await this.prisma.miembro.update({
      where: { id },
      data: { fechaUltimoPago, fechaVencimiento },
    });
  }
```

No valida `organizacionId` aquí porque quien la llama (`RegistrarPago`) ya verificó la pertenencia del `Miembro` antes de invocarla.

- [ ] **Step 3: Commit**

```bash
git add packages/domain/ports/IMemberRepository.ts packages/infrastructure/persistence/prisma/PrismaMemberRepository.ts
git commit -m "feat: agrega IMemberRepository.actualizarFechasPago"
```

(No hay `tsconfig.json` propio en `packages/domain`/`packages/infrastructure` — la verificación de tipos de todo el árbol se hace una sola vez, en la Tarea 9, vía `apps/web-admin` que sí tiene su `tsconfig.json` y arrastra ambos paquetes.)

---

### Task 3: Extender `ISuscripcionRepository`

**Files:**
- Modify: `packages/domain/ports/ISuscripcionRepository.ts`
- Modify: `packages/infrastructure/persistence/prisma/PrismaSuscripcionRepository.ts`

**Interfaces:**
- Consumes: `Suscripcion` (existente, sin cambios).
- Produces: `buscarActivaVigentePorMiembroYPlan`, `extenderFin`, `crear` — consumidos por `RegistrarPago` (Tarea 5).

- [ ] **Step 1: Reemplazar el contenido completo de `ISuscripcionRepository.ts`**

```typescript
import { Suscripcion } from "../entities/Suscripcion";

export interface ISuscripcionRepository {
  buscarActivaVigentePorMiembro(miembroId: string, fecha: Date): Promise<Suscripcion | null>;
  tieneAccesoASucursal(planId: string, sucursalId: string): Promise<boolean>;
  buscarActivaVigentePorMiembroYPlan(miembroId: string, planId: string, fecha: Date): Promise<Suscripcion | null>;
  extenderFin(id: string, nuevoFin: Date): Promise<Suscripcion>;
  crear(datos: { miembroId: string; planId: string; inicio: Date; fin: Date }): Promise<Suscripcion>;
}
```

- [ ] **Step 2: Reemplazar el contenido completo de `PrismaSuscripcionRepository.ts`**

```typescript
import type { PrismaClient } from "@gym-app/db/generated/prisma/client";
import type { ISuscripcionRepository } from "@gym-app/domain/ports/ISuscripcionRepository";
import type { Suscripcion } from "@gym-app/domain/entities/Suscripcion";

type FilaSuscripcion = {
  id: string;
  miembroId: string;
  plan: { id: string; organizacionId: string; tipoAcceso: Suscripcion["plan"]["tipoAcceso"] };
  inicio: Date;
  fin: Date;
  estado: Suscripcion["estado"];
};

function mapear(suscripcion: FilaSuscripcion): Suscripcion {
  return {
    id: suscripcion.id,
    miembroId: suscripcion.miembroId,
    plan: {
      id: suscripcion.plan.id,
      organizacionId: suscripcion.plan.organizacionId,
      tipoAcceso: suscripcion.plan.tipoAcceso,
    },
    inicio: suscripcion.inicio,
    fin: suscripcion.fin,
    estado: suscripcion.estado,
  };
}

export class PrismaSuscripcionRepository implements ISuscripcionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async buscarActivaVigentePorMiembro(miembroId: string, fecha: Date): Promise<Suscripcion | null> {
    const suscripcion = await this.prisma.suscripcion.findFirst({
      where: {
        miembroId,
        estado: "ACTIVA",
        inicio: { lte: fecha },
        fin: { gte: fecha },
      },
      include: { plan: true },
      orderBy: { fin: "desc" },
    });

    if (!suscripcion) return null;

    return mapear(suscripcion);
  }

  async tieneAccesoASucursal(planId: string, sucursalId: string): Promise<boolean> {
    const acceso = await this.prisma.planSucursalAcceso.findUnique({
      where: { planId_sucursalId: { planId, sucursalId } },
    });
    return acceso !== null;
  }

  async buscarActivaVigentePorMiembroYPlan(miembroId: string, planId: string, fecha: Date): Promise<Suscripcion | null> {
    const suscripcion = await this.prisma.suscripcion.findFirst({
      where: {
        miembroId,
        planId,
        estado: "ACTIVA",
        fin: { gte: fecha },
      },
      include: { plan: true },
      orderBy: { fin: "desc" },
    });

    if (!suscripcion) return null;

    return mapear(suscripcion);
  }

  async extenderFin(id: string, nuevoFin: Date): Promise<Suscripcion> {
    const suscripcion = await this.prisma.suscripcion.update({
      where: { id },
      data: { fin: nuevoFin },
      include: { plan: true },
    });

    return mapear(suscripcion);
  }

  async crear(datos: { miembroId: string; planId: string; inicio: Date; fin: Date }): Promise<Suscripcion> {
    const suscripcion = await this.prisma.suscripcion.create({
      data: {
        miembroId: datos.miembroId,
        planId: datos.planId,
        inicio: datos.inicio,
        fin: datos.fin,
        estado: "ACTIVA",
      },
      include: { plan: true },
    });

    return mapear(suscripcion);
  }
}
```

**Nota:** `ValidarAccesoSucursalPorPlan.ts` no se toca — sigue llamando solo a `buscarActivaVigentePorMiembro`/`tieneAccesoASucursal`, que mantienen la misma firma.

- [ ] **Step 3: Commit**

```bash
git add packages/domain/ports/ISuscripcionRepository.ts packages/infrastructure/persistence/prisma/PrismaSuscripcionRepository.ts
git commit -m "feat: extiende ISuscripcionRepository con buscarActivaVigentePorMiembroYPlan/extenderFin/crear"
```

---

### Task 4: Puertos `IPlanRepository` e `IPagoRepository`

**Files:**
- Create: `packages/domain/ports/IPlanRepository.ts`
- Create: `packages/domain/ports/IPagoRepository.ts`

**Interfaces:**
- Consumes: `Plan`, `DatosNuevoPlan`, `CambiosPlan`, `Pago`, `DatosNuevoPago` (Tarea 1).
- Produces: contratos que la Tarea 6 implementa y las Tareas 7-8 consumen.

- [ ] **Step 1: `packages/domain/ports/IPlanRepository.ts`**

```typescript
import { Plan, DatosNuevoPlan, CambiosPlan } from "../entities/Plan";

export interface IPlanRepository {
  listarPorOrganizacion(organizacionId: string): Promise<Plan[]>;
  buscarPorId(organizacionId: string, id: string): Promise<Plan | null>;
  // true solo si CADA id en sucursalIds existe y pertenece a organizacionId.
  sucursalesValidas(organizacionId: string, sucursalIds: string[]): Promise<boolean>;
  crear(datos: DatosNuevoPlan): Promise<Plan>;
  actualizar(organizacionId: string, id: string, cambios: CambiosPlan): Promise<Plan | null>;
}
```

- [ ] **Step 2: `packages/domain/ports/IPagoRepository.ts`**

```typescript
import { Pago, DatosNuevoPago } from "../entities/Pago";

export interface IPagoRepository {
  crear(datos: DatosNuevoPago): Promise<Pago>;
  listarPorMiembro(miembroId: string): Promise<Pago[]>;
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/domain/ports/IPlanRepository.ts packages/domain/ports/IPagoRepository.ts
git commit -m "feat: agrega los puertos IPlanRepository e IPagoRepository"
```

---

### Task 5: Casos de uso `CrearPlan`, `ListarPlanes`, `ActualizarPlan`

**Files:**
- Create: `packages/domain/use-cases/CrearPlan.ts`
- Create: `packages/domain/use-cases/ListarPlanes.ts`
- Create: `packages/domain/use-cases/ActualizarPlan.ts`

**Interfaces:**
- Consumes: `IPlanRepository` (Tarea 4).
- Produces: funciones consumidas por las rutas (Tarea 8).

- [ ] **Step 1: `packages/domain/use-cases/CrearPlan.ts`**

```typescript
import { IPlanRepository } from "../ports/IPlanRepository";
import { Plan, DatosNuevoPlan } from "../entities/Plan";

export class SucursalesRequeridasError extends Error {
  constructor() {
    super("Un plan que no es TODA_LA_ORGANIZACION necesita al menos una sucursal asignada.");
  }
}

export class SucursalInvalidaError extends Error {
  constructor() {
    super("Una o más sucursales indicadas no pertenecen a esta organización.");
  }
}

export async function crearPlan(deps: { planes: IPlanRepository }, input: DatosNuevoPlan): Promise<Plan> {
  if (input.tipoAcceso !== "TODA_LA_ORGANIZACION") {
    if (input.sucursalIds.length === 0) {
      throw new SucursalesRequeridasError();
    }

    const valido = await deps.planes.sucursalesValidas(input.organizacionId, input.sucursalIds);
    if (!valido) {
      throw new SucursalInvalidaError();
    }
  }

  return deps.planes.crear(input);
}
```

- [ ] **Step 2: `packages/domain/use-cases/ListarPlanes.ts`**

```typescript
import { IPlanRepository } from "../ports/IPlanRepository";
import { Plan } from "../entities/Plan";

export async function listarPlanes(deps: { planes: IPlanRepository }, organizacionId: string): Promise<Plan[]> {
  return deps.planes.listarPorOrganizacion(organizacionId);
}
```

- [ ] **Step 3: `packages/domain/use-cases/ActualizarPlan.ts`**

```typescript
import { IPlanRepository } from "../ports/IPlanRepository";
import { Plan, CambiosPlan } from "../entities/Plan";

export class PlanNoEncontradoError extends Error {
  constructor() {
    super("No se encontró el plan.");
  }
}

export async function actualizarPlan(
  deps: { planes: IPlanRepository },
  input: { organizacionId: string; id: string; cambios: CambiosPlan }
): Promise<Plan> {
  const actualizado = await deps.planes.actualizar(input.organizacionId, input.id, input.cambios);

  if (!actualizado) {
    throw new PlanNoEncontradoError();
  }

  return actualizado;
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/domain/use-cases/CrearPlan.ts packages/domain/use-cases/ListarPlanes.ts packages/domain/use-cases/ActualizarPlan.ts
git commit -m "feat: agrega casos de uso CrearPlan, ListarPlanes, ActualizarPlan"
```

---

### Task 6: Adaptadores `PrismaPlanRepository` y `PrismaPagoRepository`

**Files:**
- Create: `packages/infrastructure/persistence/prisma/PrismaPlanRepository.ts`
- Create: `packages/infrastructure/persistence/prisma/PrismaPagoRepository.ts`

**Interfaces:**
- Consumes: `IPlanRepository`, `IPagoRepository` (Tarea 4).
- Produces: implementaciones que las rutas (Tarea 8) instancian.

- [ ] **Step 1: `packages/infrastructure/persistence/prisma/PrismaPlanRepository.ts`**

```typescript
import type { PrismaClient } from "@gym-app/db/generated/prisma/client";
import type { IPlanRepository } from "@gym-app/domain/ports/IPlanRepository";
import type { Plan, DatosNuevoPlan, CambiosPlan } from "@gym-app/domain/entities/Plan";

type FilaPlan = {
  id: string;
  organizacionId: string;
  nombre: string;
  tipoAcceso: Plan["tipoAcceso"];
  precioUSD: { toNumber(): number };
  activo: boolean;
};

function mapear(plan: FilaPlan): Plan {
  return {
    id: plan.id,
    organizacionId: plan.organizacionId,
    nombre: plan.nombre,
    tipoAcceso: plan.tipoAcceso,
    precioUSD: plan.precioUSD.toNumber(),
    activo: plan.activo,
  };
}

export class PrismaPlanRepository implements IPlanRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listarPorOrganizacion(organizacionId: string): Promise<Plan[]> {
    const planes = await this.prisma.plan.findMany({
      where: { organizacionId },
      orderBy: { nombre: "asc" },
    });

    return planes.map(mapear);
  }

  async buscarPorId(organizacionId: string, id: string): Promise<Plan | null> {
    const plan = await this.prisma.plan.findUnique({ where: { id } });

    if (!plan || plan.organizacionId !== organizacionId) return null;

    return mapear(plan);
  }

  async sucursalesValidas(organizacionId: string, sucursalIds: string[]): Promise<boolean> {
    const cantidad = await this.prisma.sucursal.count({
      where: { id: { in: sucursalIds }, organizacionId },
    });

    return cantidad === sucursalIds.length;
  }

  async crear(datos: DatosNuevoPlan): Promise<Plan> {
    const plan = await this.prisma.plan.create({
      data: {
        organizacionId: datos.organizacionId,
        nombre: datos.nombre,
        tipoAcceso: datos.tipoAcceso,
        precioUSD: datos.precioUSD,
        ...(datos.tipoAcceso !== "TODA_LA_ORGANIZACION"
          ? { sucursalesAcceso: { create: datos.sucursalIds.map((sucursalId) => ({ sucursalId })) } }
          : {}),
      },
    });

    return mapear(plan);
  }

  async actualizar(organizacionId: string, id: string, cambios: CambiosPlan): Promise<Plan | null> {
    const actual = await this.prisma.plan.findUnique({ where: { id } });

    if (!actual || actual.organizacionId !== organizacionId) {
      return null;
    }

    const plan = await this.prisma.plan.update({ where: { id }, data: cambios });

    return mapear(plan);
  }
}
```

- [ ] **Step 2: `packages/infrastructure/persistence/prisma/PrismaPagoRepository.ts`**

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
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/infrastructure/persistence/prisma/PrismaPlanRepository.ts packages/infrastructure/persistence/prisma/PrismaPagoRepository.ts
git commit -m "feat: agrega PrismaPlanRepository y PrismaPagoRepository"
```

---

### Task 7: Casos de uso `RegistrarPago` y `ListarPagos`

**Files:**
- Create: `packages/domain/use-cases/RegistrarPago.ts`
- Create: `packages/domain/use-cases/ListarPagos.ts`

**Interfaces:**
- Consumes: `IPagoRepository` (Tarea 4), `ISuscripcionRepository` extendido (Tarea 3), `IMemberRepository` extendido (Tarea 2), `IPlanRepository` (Tarea 4).
- Produces: funciones consumidas por las rutas (Tarea 8).

- [ ] **Step 1: `packages/domain/use-cases/RegistrarPago.ts`**

```typescript
import { IPagoRepository } from "../ports/IPagoRepository";
import { ISuscripcionRepository } from "../ports/ISuscripcionRepository";
import { IMemberRepository } from "../ports/IMemberRepository";
import { IPlanRepository } from "../ports/IPlanRepository";
import { Pago } from "../entities/Pago";

const DURACION_SUSCRIPCION_DIAS = 30;

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

export class PlanInactivoError extends Error {
  constructor() {
    super("No se puede registrar un pago contra un plan inactivo.");
  }
}

export interface RegistrarPagoDeps {
  pagos: IPagoRepository;
  suscripciones: ISuscripcionRepository;
  miembros: IMemberRepository;
  planes: IPlanRepository;
}

export interface DatosRegistrarPago {
  organizacionId: string;
  miembroId: string;
  planId: string;
  monto: number;
  metodo: string;
  tasaCambio: number | null;
}

export async function registrarPago(deps: RegistrarPagoDeps, input: DatosRegistrarPago): Promise<Pago> {
  const miembro = await deps.miembros.buscarPorId(input.organizacionId, input.miembroId);
  if (!miembro) {
    throw new MiembroNoEncontradoError();
  }

  const plan = await deps.planes.buscarPorId(input.organizacionId, input.planId);
  if (!plan) {
    throw new PlanNoEncontradoError();
  }
  if (!plan.activo) {
    throw new PlanInactivoError();
  }

  const ahora = new Date();
  const activa = await deps.suscripciones.buscarActivaVigentePorMiembroYPlan(input.miembroId, input.planId, ahora);

  const base = activa && activa.fin > ahora ? activa.fin : ahora;
  const fin = new Date(base);
  fin.setDate(fin.getDate() + DURACION_SUSCRIPCION_DIAS);

  if (activa) {
    await deps.suscripciones.extenderFin(activa.id, fin);
  } else {
    await deps.suscripciones.crear({ miembroId: input.miembroId, planId: input.planId, inicio: ahora, fin });
  }

  await deps.miembros.actualizarFechasPago(input.miembroId, ahora, fin);

  return deps.pagos.crear({
    miembroId: input.miembroId,
    monto: input.monto,
    metodo: input.metodo,
    tasaCambio: input.tasaCambio,
  });
}
```

- [ ] **Step 2: `packages/domain/use-cases/ListarPagos.ts`**

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
  input: { organizacionId: string; miembroId: string }
): Promise<Pago[]> {
  const miembro = await deps.miembros.buscarPorId(input.organizacionId, input.miembroId);
  if (!miembro) {
    throw new MiembroNoEncontradoError();
  }

  return deps.pagos.listarPorMiembro(input.miembroId);
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/domain/use-cases/RegistrarPago.ts packages/domain/use-cases/ListarPagos.ts
git commit -m "feat: agrega casos de uso RegistrarPago y ListarPagos"
```

---

### Task 8: Rutas `/api/planes`, `/api/planes/[id]`, `/api/pagos`

**Files:**
- Create: `apps/web-admin/app/api/planes/route.ts`
- Create: `apps/web-admin/app/api/planes/[id]/route.ts`
- Create: `apps/web-admin/app/api/pagos/route.ts`

**Interfaces:**
- Consumes: casos de uso (Tareas 5 y 7), `PrismaPlanRepository`/`PrismaPagoRepository` (Tarea 6), `PrismaMemberRepository`/`PrismaSuscripcionRepository` (Tareas 2-3), `obtenerUsuarioDeSesion` (Plan 4).

- [ ] **Step 1: `apps/web-admin/app/api/planes/route.ts`**

```typescript
// GET  /api/planes — lista los planes de acceso de la organización del usuario en sesión.
// POST /api/planes — crea un plan nuevo (con sus sucursales de acceso, si aplica).
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesion } from "@/lib/sesion";
import { PrismaPlanRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPlanRepository";
import { listarPlanes } from "@gym-app/domain/use-cases/ListarPlanes";
import { crearPlan, SucursalesRequeridasError, SucursalInvalidaError } from "@gym-app/domain/use-cases/CrearPlan";

export async function GET(req: NextRequest) {
  const usuario = await obtenerUsuarioDeSesion(req);

  if (!usuario) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const planes = await listarPlanes({ planes: new PrismaPlanRepository(prisma) }, usuario.organizacionId);

  return NextResponse.json({ planes });
}

export async function POST(req: NextRequest) {
  try {
    const usuario = await obtenerUsuarioDeSesion(req);

    if (!usuario) {
      return NextResponse.json({ error: "No autenticado." }, { status: 401 });
    }

    const body = await req.json();

    if (!body.nombre || !body.tipoAcceso || body.precioUSD === undefined) {
      return NextResponse.json(
        { error: "nombre, tipoAcceso y precioUSD son requeridos." },
        { status: 400 }
      );
    }

    const plan = await crearPlan(
      { planes: new PrismaPlanRepository(prisma) },
      {
        organizacionId: usuario.organizacionId,
        nombre: body.nombre,
        tipoAcceso: body.tipoAcceso,
        precioUSD: body.precioUSD,
        sucursalIds: body.sucursalIds ?? [],
      }
    );

    return NextResponse.json(plan, { status: 201 });
  } catch (error) {
    if (error instanceof SucursalesRequeridasError || error instanceof SucursalInvalidaError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Error al crear plan:", error);
    return NextResponse.json({ error: "Error interno al crear el plan." }, { status: 500 });
  }
}
```

- [ ] **Step 2: `apps/web-admin/app/api/planes/[id]/route.ts`**

```typescript
// PATCH /api/planes/[id] — edita nombre/precioUSD, o da de baja lógica con {"activo": false}.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesion } from "@/lib/sesion";
import { PrismaPlanRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPlanRepository";
import { actualizarPlan, PlanNoEncontradoError } from "@gym-app/domain/use-cases/ActualizarPlan";
import type { CambiosPlan } from "@gym-app/domain/entities/Plan";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const usuario = await obtenerUsuarioDeSesion(req);

  if (!usuario) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();

  const cambios: CambiosPlan = {};
  if (body.nombre !== undefined) cambios.nombre = body.nombre;
  if (body.precioUSD !== undefined) cambios.precioUSD = body.precioUSD;
  if (body.activo !== undefined) cambios.activo = body.activo;

  try {
    const plan = await actualizarPlan(
      { planes: new PrismaPlanRepository(prisma) },
      { organizacionId: usuario.organizacionId, id, cambios }
    );

    return NextResponse.json(plan);
  } catch (error) {
    if (error instanceof PlanNoEncontradoError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error("Error al actualizar plan:", error);
    return NextResponse.json({ error: "Error interno al actualizar el plan." }, { status: 500 });
  }
}
```

- [ ] **Step 3: `apps/web-admin/app/api/pagos/route.ts`**

```typescript
// POST /api/pagos            — registra un pago; crea/extiende la Suscripcion ACTIVA del Plan indicado.
// GET  /api/pagos?miembroId= — lista el historial de pagos de ese miembro.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesion } from "@/lib/sesion";
import { PrismaPagoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPagoRepository";
import { PrismaSuscripcionRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSuscripcionRepository";
import { PrismaMemberRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMemberRepository";
import { PrismaPlanRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPlanRepository";
import {
  registrarPago,
  MiembroNoEncontradoError as RegistrarPagoMiembroNoEncontradoError,
  PlanNoEncontradoError as RegistrarPagoPlanNoEncontradoError,
  PlanInactivoError,
} from "@gym-app/domain/use-cases/RegistrarPago";
import {
  listarPagos,
  MiembroNoEncontradoError as ListarPagosMiembroNoEncontradoError,
} from "@gym-app/domain/use-cases/ListarPagos";

export async function GET(req: NextRequest) {
  const usuario = await obtenerUsuarioDeSesion(req);

  if (!usuario) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const miembroId = req.nextUrl.searchParams.get("miembroId");
  if (!miembroId) {
    return NextResponse.json({ error: "El parámetro miembroId es requerido." }, { status: 400 });
  }

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

export async function POST(req: NextRequest) {
  try {
    const usuario = await obtenerUsuarioDeSesion(req);

    if (!usuario) {
      return NextResponse.json({ error: "No autenticado." }, { status: 401 });
    }

    const body = await req.json();

    if (!body.miembroId || !body.planId || body.monto === undefined || !body.metodo) {
      return NextResponse.json(
        { error: "miembroId, planId, monto y metodo son requeridos." },
        { status: 400 }
      );
    }

    const pago = await registrarPago(
      {
        pagos: new PrismaPagoRepository(prisma),
        suscripciones: new PrismaSuscripcionRepository(prisma),
        miembros: new PrismaMemberRepository(prisma),
        planes: new PrismaPlanRepository(prisma),
      },
      {
        organizacionId: usuario.organizacionId,
        miembroId: body.miembroId,
        planId: body.planId,
        monto: body.monto,
        metodo: body.metodo,
        tasaCambio: body.tasaCambio ?? null,
      }
    );

    return NextResponse.json(pago, { status: 201 });
  } catch (error) {
    if (error instanceof RegistrarPagoMiembroNoEncontradoError || error instanceof RegistrarPagoPlanNoEncontradoError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof PlanInactivoError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Error al registrar pago:", error);
    return NextResponse.json({ error: "Error interno al registrar el pago." }, { status: 500 });
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web-admin/app/api/planes apps/web-admin/app/api/pagos
git commit -m "feat: agrega rutas /api/planes, /api/planes/[id] y /api/pagos"
```

---

### Task 9: Build + verificación de tipos (sin DB)

**Files:** ninguno — tarea de verificación.

- [ ] **Step 1: Verificar tipos**

Run: `cd apps/web-admin && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 2: Build completo**

Run: `cd ../.. && npx turbo run build --filter=web-admin`
Expected: exit 0, sin advertencia de dependencia circular. Deberían aparecer las rutas `/api/planes`, `/api/planes/[id]` y `/api/pagos` en el resumen.

- [ ] **Step 3: Lint**

Run: `npx turbo run lint --filter=web-admin`
Expected: exit 0.

- [ ] **Step 4: No hay commit en esta tarea** — solo verificación.

---

### Task 10: Probar contra la base real (requiere red — lo corre el usuario)

**Files:** ninguno — tarea de verificación. No hay migración que subir en este plan.

- [ ] **Step 1: Regenerar el cliente por si acaso y levantar el servidor**

```powershell
cd packages\db
npx prisma generate
cd ..\..
npm run dev
```

- [ ] **Step 2: Login y guardar cookie**

```powershell
curl.exe -c cookies.txt -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{\"email\":\"admin@gymdemo.com\",\"password\":\"admin1234\"}'
```

- [ ] **Step 3: Listar los planes existentes del seed (debe incluir "Sede Única")**

```powershell
curl.exe -b cookies.txt http://localhost:3000/api/planes
```

Expected: `200`, `{"planes":[{"nombre":"Sede Única", "tipoAcceso":"SEDE_UNICA", ...}]}`. Anotar el `id` del plan para los pasos siguientes.

- [ ] **Step 4: Crear un plan "VIP Multi-sede" (TODA_LA_ORGANIZACION, sin sucursalIds)**

```powershell
curl.exe -b cookies.txt -X POST http://localhost:3000/api/planes -H "Content-Type: application/json" -d '{\"nombre\":\"VIP Multi-sede\",\"tipoAcceso\":\"TODA_LA_ORGANIZACION\",\"precioUSD\":40}'
```

Expected: `201` con el plan creado.

- [ ] **Step 5: Intentar crear un plan SEDE_UNICA sin sucursalIds (debe rechazar)**

```powershell
curl.exe -b cookies.txt -X POST http://localhost:3000/api/planes -H "Content-Type: application/json" -d '{\"nombre\":\"Sede Prueba\",\"tipoAcceso\":\"SEDE_UNICA\",\"precioUSD\":20}'
```

Expected: `400`, `{"error":"Un plan que no es TODA_LA_ORGANIZACION necesita al menos una sucursal asignada."}`.

- [ ] **Step 6: Editar el plan "VIP Multi-sede" (bajar el precio)**

```powershell
curl.exe -b cookies.txt -X PATCH http://localhost:3000/api/planes/<id-del-Step-4> -H "Content-Type: application/json" -d '{\"precioUSD\":35}'
```

Expected: `200` con `precioUSD: 35`.

- [ ] **Step 7: Registrar un pago para "Julio César Bastidas" (miembro vencido del seed) contra el plan "Sede Única"**

```powershell
curl.exe -b cookies.txt http://localhost:3000/api/miembros
```

Anotar el `id` de Julio César Bastidas y el `id` del plan "Sede Única" (Step 3).

```powershell
curl.exe -b cookies.txt -X POST http://localhost:3000/api/pagos -H "Content-Type: application/json" -d '{\"miembroId\":\"<id-julio>\",\"planId\":\"<id-sede-unica>\",\"monto\":25,\"metodo\":\"efectivo_usd\"}'
```

Expected: `201` con el pago creado.

- [ ] **Step 8: Verificar que el pago extendió la Suscripcion y sincronizó las fechas del Miembro**

```powershell
curl.exe -b cookies.txt http://localhost:3000/api/miembros/<id-julio>
```

Expected: `200`, `fechaUltimoPago` es la fecha de hoy y `fechaVencimiento` es hoy + 30 días.

- [ ] **Step 9: Listar el historial de pagos de ese miembro**

```powershell
curl.exe -b cookies.txt "http://localhost:3000/api/pagos?miembroId=<id-julio>"
```

Expected: `200`, `{"pagos":[{"monto":25,"metodo":"efectivo_usd",...}]}`.

- [ ] **Step 10: Registrar un segundo pago inmediato al mismo miembro/plan (debe extender, no crear otra Suscripcion)**

```powershell
curl.exe -b cookies.txt -X POST http://localhost:3000/api/pagos -H "Content-Type: application/json" -d '{\"miembroId\":\"<id-julio>\",\"planId\":\"<id-sede-unica>\",\"monto\":25,\"metodo\":\"pago_movil\"}'
```

Expected: `201`. Repetir el Step 8 — `fechaVencimiento` ahora debe ser hoy + 60 días (se sumó desde el `fin` anterior, no desde hoy).

- [ ] **Step 11: Intentar un pago con un plan inexistente (debe dar 404)**

```powershell
curl.exe -b cookies.txt -X POST http://localhost:3000/api/pagos -H "Content-Type: application/json" -d '{\"miembroId\":\"<id-julio>\",\"planId\":\"no-existe\",\"monto\":25,\"metodo\":\"efectivo_usd\"}'
```

Expected: `404`, `{"error":"No se encontró el plan."}`.

- [ ] **Step 12: No hay commit en esta tarea** — es solo verificación.

---

## Fuera de alcance de este plan (explícitamente diferido)

- Editar `tipoAcceso` o las sucursales de acceso de un `Plan` ya creado — decisión de esta sesión, evita el caso borde de reasignar accesos a mitad de ciclo.
- Editar o borrar un `Pago` ya registrado — es un hecho histórico.
- Restricciones por rol sobre estos endpoints (mismo criterio que Plan 5).
- Paginación/filtros en `GET /api/planes` o `GET /api/pagos`.
- Duración configurable por `Plan` (hoy es la constante fija `DURACION_SUSCRIPCION_DIAS = 30` en `RegistrarPago.ts`).
- Integración con la API BCV para `tasaCambio` automática — hoy el campo se recibe tal cual del body, sin validar contra `TasaCambio`.
- UI del panel admin (solo se prueba con `curl` en este plan).

## Execution Handoff

Dos opciones de ejecución:

**1. Subagent-Driven (recomendado)** — un subagente fresco por tarea, revisión entre tareas.

**2. Inline Execution** — ejecuto las Tareas 1–9 yo mismo en esta sesión (no requieren red hacia la DB), y la Tarea 10 la corres tú.

¿Cuál prefieres?
