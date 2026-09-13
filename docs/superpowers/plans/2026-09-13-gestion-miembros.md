# Gestión de Miembros (CRUD) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el CRUD de `Miembro` (crear, listar, ver detalle, editar/dar de baja lógica) protegido por sesión, cerrando el tercer 🔴 bloqueador de `docs/ROADMAP.md`. `Pago` y `Suscripcion` quedan explícitamente fuera de este plan — mismo patrón de acotar que ya funcionó separando check-in de login.

**Architecture:** Mismo patrón hexagonal establecido. `packages/domain` gana los casos de uso `CrearMiembro`/`ListarMiembros`/`ObtenerMiembro`/`ActualizarMiembro` y extiende `IMemberRepository`/la entidad `Miembro`; `packages/infrastructure` extiende `PrismaMemberRepository`; `apps/web-admin` gana 2 rutas (`/api/miembros`, `/api/miembros/[id]`), ambas protegidas con el helper de sesión ya existente (Plan 4).

**Tech Stack:** Sin dependencias nuevas — reutiliza todo lo del Plan 3/4.

**Spec:** `docs/ROADMAP.md` (bloqueador #3), decisiones de esta sesión:

| Decisión | Resultado |
|---|---|
| Alcance | Solo `Miembro` (CRUD completo). `Pago`/`Suscripcion` quedan para un plan aparte. |
| Pago → acceso (para el plan siguiente, no implementado aquí) | `RegistrarPago` deberá crear/extender la `Suscripcion` `ACTIVA` del `Plan` indicado — es la decisión ya tomada, documentada aquí para no perderla. |
| Autorización | Cualquier `UsuarioAdmin` autenticado, sin restricción por rol todavía (una sola regla real existe hoy en `AuthorizationService`: crear `UsuarioAdmin` es exclusiva de `DUENO` — no se gradúa una matriz de permisos sin un segundo caso real). |

## Global Constraints

- **Todo el scoping es por `organizacionId` del usuario en sesión** — nunca se confía en un `organizacionId` del body/query del request (mismo principio de seguridad que `apiKey`/`sucursalId` en el Plan 3). `buscarPorId`/`actualizar` verifican que el `Miembro` pertenezca a la organización del solicitante antes de devolver o modificar cualquier dato.
- **`cedula` es inmutable** después de creado el `Miembro` — no forma parte de los campos editables de `PATCH /api/miembros/[id]`. Evita la complejidad de re-validar duplicados en una actualización; si algún día hace falta corregir una cédula mal cargada, es un caso de uso aparte, no parte de esta edición general.
- "Dar de baja" un miembro es simplemente `PATCH` con `{"activo": false}` — no hay un endpoint `DELETE` separado (baja lógica, nunca borrado físico).
- No hay migración de schema en este plan — todos los campos de `Miembro` ya existen desde el Plan 2.
- Nunca ejecutar `git commit`/`git push` automáticamente salvo instrucción explícita del usuario.

---

## Pre-flight: lo que ya existe y se reutiliza

- `apps/web-admin/lib/sesion.ts` (`obtenerUsuarioDeSesion`) — se reutiliza sin cambios para proteger las rutas nuevas.
- `packages/domain/entities/Miembro.ts` ya existe (usado por `RegistrarCheckIn`) con un subconjunto de campos (`id`, `organizacionId`, `nombre`, `cedula`, `fotoUrl`, `entrenadorNombre`, `planTipo`) — este plan lo **extiende** con los campos que faltan para administración; los campos existentes no cambian de nombre ni de tipo, así que `RegistrarCheckIn`/`ValidarAccesoSucursalPorPlan` siguen compilando sin tocarlos.
- `packages/infrastructure/persistence/prisma/PrismaMemberRepository.ts` ya implementa `buscarPorOrganizacionYCedula` — este plan le agrega los métodos nuevos sin tocar ese.
- `@@unique([organizacionId, cedula])` en `Miembro` (schema) ya impide duplicados a nivel de base — `CrearMiembro` agrega una verificación de dominio previa para dar un error de negocio claro en vez de dejar que se propague un error crudo de Prisma.

---

### Task 1: Extender la entidad `Miembro`

**Files:**
- Modify: `packages/domain/entities/Miembro.ts`

**Interfaces:**
- Produces: `Miembro` (extendida), `DatosNuevoMiembro`, `CambiosMiembro` — consumidos por el puerto (Tarea 2), los casos de uso (Tarea 3) y las rutas (Tarea 5).

- [ ] **Step 1: Reemplazar el contenido completo del archivo**

```typescript
export type PlanTipo = "SIN_ENTRENADOR" | "CON_ENTRENADOR";

export interface Miembro {
  id: string;
  organizacionId: string;
  nombre: string;
  cedula: string;
  fechaNacimiento: Date | null;
  celular: string | null;
  fotoUrl: string | null;
  entrenadorId: string | null;
  entrenadorNombre: string | null;
  planTipo: PlanTipo;
  precioPlan: number;
  fechaUltimoPago: Date | null;
  fechaVencimiento: Date | null;
  activo: boolean;
  createdAt: Date;
}

export interface DatosNuevoMiembro {
  organizacionId: string;
  nombre: string;
  cedula: string;
  fechaNacimiento: Date | null;
  celular: string | null;
  fotoUrl: string | null;
  entrenadorId: string | null;
  planTipo: PlanTipo;
  precioPlan: number;
}

export interface CambiosMiembro {
  nombre?: string;
  fechaNacimiento?: Date | null;
  celular?: string | null;
  fotoUrl?: string | null;
  entrenadorId?: string | null;
  planTipo?: PlanTipo;
  precioPlan?: number;
  activo?: boolean;
}
```

**Nota:** `RegistrarCheckIn.ts`/`ValidarAccesoSucursalPorPlan.ts` no se tocan — siguen leyendo el subconjunto de campos que ya usaban (`nombre`, `fotoUrl`, `entrenadorNombre`, `planTipo`), que sigue existiendo igual.

- [ ] **Step 2: Commit**

```bash
git add packages/domain/entities/Miembro.ts
git commit -m "feat: extiende la entidad Miembro con campos de administración"
```

---

### Task 2: Extender `IMemberRepository`

**Files:**
- Modify: `packages/domain/ports/IMemberRepository.ts`

**Interfaces:**
- Consumes: `Miembro`, `DatosNuevoMiembro`, `CambiosMiembro` (Tarea 1).
- Produces: contrato que la Tarea 4 implementa y la Tarea 3 consume.

- [ ] **Step 1: Reemplazar el contenido completo del archivo**

```typescript
import { Miembro, DatosNuevoMiembro, CambiosMiembro } from "../entities/Miembro";

export interface IMemberRepository {
  buscarPorOrganizacionYCedula(organizacionId: string, cedula: string): Promise<Miembro | null>;
  buscarPorId(organizacionId: string, id: string): Promise<Miembro | null>;
  listarPorOrganizacion(organizacionId: string): Promise<Miembro[]>;
  crear(datos: DatosNuevoMiembro): Promise<Miembro>;
  actualizar(organizacionId: string, id: string, cambios: CambiosMiembro): Promise<Miembro | null>;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/domain/ports/IMemberRepository.ts
git commit -m "feat: extiende IMemberRepository con listar/buscarPorId/crear/actualizar"
```

---

### Task 3: Casos de uso `CrearMiembro`, `ListarMiembros`, `ObtenerMiembro`, `ActualizarMiembro`

**Files:**
- Create: `packages/domain/use-cases/CrearMiembro.ts`
- Create: `packages/domain/use-cases/ListarMiembros.ts`
- Create: `packages/domain/use-cases/ObtenerMiembro.ts`
- Create: `packages/domain/use-cases/ActualizarMiembro.ts`

**Interfaces:**
- Consumes: `IMemberRepository` (Tarea 2).
- Produces: funciones consumidas por las rutas API (Tarea 5).

- [ ] **Step 1: `packages/domain/use-cases/CrearMiembro.ts`**

```typescript
import { IMemberRepository } from "../ports/IMemberRepository";
import { Miembro, DatosNuevoMiembro } from "../entities/Miembro";

export class CedulaDuplicadaError extends Error {
  constructor() {
    super("Ya existe un miembro con esa cédula en esta organización.");
  }
}

export async function crearMiembro(
  deps: { miembros: IMemberRepository },
  input: DatosNuevoMiembro
): Promise<Miembro> {
  const existente = await deps.miembros.buscarPorOrganizacionYCedula(input.organizacionId, input.cedula);

  if (existente) {
    throw new CedulaDuplicadaError();
  }

  return deps.miembros.crear(input);
}
```

- [ ] **Step 2: `packages/domain/use-cases/ListarMiembros.ts`**

```typescript
import { IMemberRepository } from "../ports/IMemberRepository";
import { Miembro } from "../entities/Miembro";

export async function listarMiembros(
  deps: { miembros: IMemberRepository },
  organizacionId: string
): Promise<Miembro[]> {
  return deps.miembros.listarPorOrganizacion(organizacionId);
}
```

- [ ] **Step 3: `packages/domain/use-cases/ObtenerMiembro.ts`**

```typescript
import { IMemberRepository } from "../ports/IMemberRepository";
import { Miembro } from "../entities/Miembro";

export class MiembroNoEncontradoError extends Error {
  constructor() {
    super("No se encontró el miembro.");
  }
}

export async function obtenerMiembro(
  deps: { miembros: IMemberRepository },
  input: { organizacionId: string; id: string }
): Promise<Miembro> {
  const miembro = await deps.miembros.buscarPorId(input.organizacionId, input.id);

  if (!miembro) {
    throw new MiembroNoEncontradoError();
  }

  return miembro;
}
```

- [ ] **Step 4: `packages/domain/use-cases/ActualizarMiembro.ts`**

```typescript
import { IMemberRepository } from "../ports/IMemberRepository";
import { Miembro, CambiosMiembro } from "../entities/Miembro";

export class MiembroNoEncontradoError extends Error {
  constructor() {
    super("No se encontró el miembro.");
  }
}

export async function actualizarMiembro(
  deps: { miembros: IMemberRepository },
  input: { organizacionId: string; id: string; cambios: CambiosMiembro }
): Promise<Miembro> {
  const actualizado = await deps.miembros.actualizar(input.organizacionId, input.id, input.cambios);

  if (!actualizado) {
    throw new MiembroNoEncontradoError();
  }

  return actualizado;
}
```

- [ ] **Step 5: Commit**

```bash
git add packages/domain/use-cases/CrearMiembro.ts packages/domain/use-cases/ListarMiembros.ts packages/domain/use-cases/ObtenerMiembro.ts packages/domain/use-cases/ActualizarMiembro.ts
git commit -m "feat: agrega casos de uso CrearMiembro, ListarMiembros, ObtenerMiembro, ActualizarMiembro"
```

---

### Task 4: Extender `PrismaMemberRepository`

**Files:**
- Modify: `packages/infrastructure/persistence/prisma/PrismaMemberRepository.ts`

**Interfaces:**
- Consumes: `IMemberRepository` extendido (Tarea 2).
- Produces: implementación completa que las rutas (Tarea 5) instancian.

- [ ] **Step 1: Reemplazar el contenido completo del archivo**

```typescript
import type { PrismaClient } from "@gym-app/db/generated/prisma/client";
import type { IMemberRepository } from "@gym-app/domain/ports/IMemberRepository";
import type { Miembro, PlanTipo, DatosNuevoMiembro, CambiosMiembro } from "@gym-app/domain/entities/Miembro";

type FilaMiembro = {
  id: string;
  organizacionId: string;
  nombre: string;
  cedula: string;
  fechaNacimiento: Date | null;
  celular: string | null;
  fotoUrl: string | null;
  entrenadorId: string | null;
  entrenador?: { nombre: string } | null;
  planTipo: PlanTipo;
  precioPlan: { toNumber(): number };
  fechaUltimoPago: Date | null;
  fechaVencimiento: Date | null;
  activo: boolean;
  createdAt: Date;
};

function mapear(miembro: FilaMiembro): Miembro {
  return {
    id: miembro.id,
    organizacionId: miembro.organizacionId,
    nombre: miembro.nombre,
    cedula: miembro.cedula,
    fechaNacimiento: miembro.fechaNacimiento,
    celular: miembro.celular,
    fotoUrl: miembro.fotoUrl,
    entrenadorId: miembro.entrenadorId,
    entrenadorNombre: miembro.entrenador?.nombre ?? null,
    planTipo: miembro.planTipo,
    precioPlan: miembro.precioPlan.toNumber(),
    fechaUltimoPago: miembro.fechaUltimoPago,
    fechaVencimiento: miembro.fechaVencimiento,
    activo: miembro.activo,
    createdAt: miembro.createdAt,
  };
}

export class PrismaMemberRepository implements IMemberRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async buscarPorOrganizacionYCedula(organizacionId: string, cedula: string): Promise<Miembro | null> {
    const miembro = await this.prisma.miembro.findUnique({
      where: { organizacionId_cedula: { organizacionId, cedula } },
      include: { entrenador: true },
    });

    if (!miembro) return null;

    return mapear(miembro);
  }

  async buscarPorId(organizacionId: string, id: string): Promise<Miembro | null> {
    const miembro = await this.prisma.miembro.findUnique({
      where: { id },
      include: { entrenador: true },
    });

    if (!miembro || miembro.organizacionId !== organizacionId) return null;

    return mapear(miembro);
  }

  async listarPorOrganizacion(organizacionId: string): Promise<Miembro[]> {
    const miembros = await this.prisma.miembro.findMany({
      where: { organizacionId },
      include: { entrenador: true },
      orderBy: { nombre: "asc" },
    });

    return miembros.map(mapear);
  }

  async crear(datos: DatosNuevoMiembro): Promise<Miembro> {
    const miembro = await this.prisma.miembro.create({
      data: datos,
      include: { entrenador: true },
    });

    return mapear(miembro);
  }

  async actualizar(organizacionId: string, id: string, cambios: CambiosMiembro): Promise<Miembro | null> {
    const actual = await this.prisma.miembro.findUnique({ where: { id } });

    if (!actual || actual.organizacionId !== organizacionId) {
      return null;
    }

    const miembro = await this.prisma.miembro.update({
      where: { id },
      data: cambios,
      include: { entrenador: true },
    });

    return mapear(miembro);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/infrastructure/persistence/prisma/PrismaMemberRepository.ts
git commit -m "feat: extiende PrismaMemberRepository con listar/buscarPorId/crear/actualizar"
```

---

### Task 5: Rutas `/api/miembros` y `/api/miembros/[id]`

**Files:**
- Create: `apps/web-admin/app/api/miembros/route.ts`
- Create: `apps/web-admin/app/api/miembros/[id]/route.ts`

**Interfaces:**
- Consumes: casos de uso (Tarea 3), `PrismaMemberRepository` (Tarea 4), `obtenerUsuarioDeSesion` (Plan 4, ya existente).

- [ ] **Step 1: `apps/web-admin/app/api/miembros/route.ts`**

```typescript
// GET  /api/miembros — lista los miembros de la organización del usuario en sesión.
// POST /api/miembros — crea un miembro nuevo en esa misma organización.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesion } from "@/lib/sesion";
import { PrismaMemberRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMemberRepository";
import { listarMiembros } from "@gym-app/domain/use-cases/ListarMiembros";
import { crearMiembro, CedulaDuplicadaError } from "@gym-app/domain/use-cases/CrearMiembro";

export async function GET(req: NextRequest) {
  const usuario = await obtenerUsuarioDeSesion(req);

  if (!usuario) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const miembros = await listarMiembros(
    { miembros: new PrismaMemberRepository(prisma) },
    usuario.organizacionId
  );

  return NextResponse.json({ miembros });
}

export async function POST(req: NextRequest) {
  try {
    const usuario = await obtenerUsuarioDeSesion(req);

    if (!usuario) {
      return NextResponse.json({ error: "No autenticado." }, { status: 401 });
    }

    const body = await req.json();

    if (!body.nombre || !body.cedula || !body.planTipo || body.precioPlan === undefined) {
      return NextResponse.json(
        { error: "nombre, cedula, planTipo y precioPlan son requeridos." },
        { status: 400 }
      );
    }

    const miembro = await crearMiembro(
      { miembros: new PrismaMemberRepository(prisma) },
      {
        organizacionId: usuario.organizacionId,
        nombre: body.nombre,
        cedula: body.cedula,
        fechaNacimiento: body.fechaNacimiento ? new Date(body.fechaNacimiento) : null,
        celular: body.celular ?? null,
        fotoUrl: body.fotoUrl ?? null,
        entrenadorId: body.entrenadorId ?? null,
        planTipo: body.planTipo,
        precioPlan: body.precioPlan,
      }
    );

    return NextResponse.json(miembro, { status: 201 });
  } catch (error) {
    if (error instanceof CedulaDuplicadaError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("Error al crear miembro:", error);
    return NextResponse.json(
      { error: "Error interno al crear el miembro." },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: `apps/web-admin/app/api/miembros/[id]/route.ts`**

```typescript
// GET   /api/miembros/[id] — detalle de un miembro (solo si pertenece a la
//                            organización del usuario en sesión).
// PATCH /api/miembros/[id] — edita campos, o da de baja lógica con {"activo": false}.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesion } from "@/lib/sesion";
import { PrismaMemberRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMemberRepository";
import {
  obtenerMiembro,
  MiembroNoEncontradoError as ObtenerMiembroNoEncontradoError,
} from "@gym-app/domain/use-cases/ObtenerMiembro";
import {
  actualizarMiembro,
  MiembroNoEncontradoError as ActualizarMiembroNoEncontradoError,
} from "@gym-app/domain/use-cases/ActualizarMiembro";
import type { CambiosMiembro } from "@gym-app/domain/entities/Miembro";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const usuario = await obtenerUsuarioDeSesion(req);

  if (!usuario) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const { id } = await params;

  try {
    const miembro = await obtenerMiembro(
      { miembros: new PrismaMemberRepository(prisma) },
      { organizacionId: usuario.organizacionId, id }
    );

    return NextResponse.json(miembro);
  } catch (error) {
    if (error instanceof ObtenerMiembroNoEncontradoError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error("Error al obtener miembro:", error);
    return NextResponse.json(
      { error: "Error interno al obtener el miembro." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const usuario = await obtenerUsuarioDeSesion(req);

  if (!usuario) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();

  const cambios: CambiosMiembro = {};
  if (body.nombre !== undefined) cambios.nombre = body.nombre;
  if (body.fechaNacimiento !== undefined) {
    cambios.fechaNacimiento = body.fechaNacimiento ? new Date(body.fechaNacimiento) : null;
  }
  if (body.celular !== undefined) cambios.celular = body.celular;
  if (body.fotoUrl !== undefined) cambios.fotoUrl = body.fotoUrl;
  if (body.entrenadorId !== undefined) cambios.entrenadorId = body.entrenadorId;
  if (body.planTipo !== undefined) cambios.planTipo = body.planTipo;
  if (body.precioPlan !== undefined) cambios.precioPlan = body.precioPlan;
  if (body.activo !== undefined) cambios.activo = body.activo;

  try {
    const miembro = await actualizarMiembro(
      { miembros: new PrismaMemberRepository(prisma) },
      { organizacionId: usuario.organizacionId, id, cambios }
    );

    return NextResponse.json(miembro);
  } catch (error) {
    if (error instanceof ActualizarMiembroNoEncontradoError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error("Error al actualizar miembro:", error);
    return NextResponse.json(
      { error: "Error interno al actualizar el miembro." },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web-admin/app/api/miembros
git commit -m "feat: agrega rutas /api/miembros y /api/miembros/[id] (CRUD protegido por sesión)"
```

---

### Task 6: Build + verificación de tipos (sin DB)

**Files:** ninguno — tarea de verificación.

- [ ] **Step 1: Verificar tipos**

Run: `cd apps/web-admin && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 2: Build completo**

Run: `cd ../.. && npx turbo run build --filter=web-admin`
Expected: exit 0, sin advertencia de dependencia circular. Deberían aparecer las rutas `/api/miembros` y `/api/miembros/[id]` en el resumen.

- [ ] **Step 3: Lint**

Run: `npx turbo run lint --filter=web-admin`
Expected: exit 0.

- [ ] **Step 4: No hay commit en esta tarea** — solo verificación.

---

### Task 7: Probar contra la base real (requiere red — lo corre el usuario)

**Files:** ninguno — tarea de verificación. No hay migración que subir en este plan.

- [ ] **Step 1: Regenerar el cliente por si acaso y levantar el servidor**

```powershell
cd packages\db
npx prisma generate
cd ..\..
npm run dev
```

- [ ] **Step 2: Login (reutiliza el admin del seed) y guardar cookie**

```powershell
curl.exe -c cookies.txt -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{\"email\":\"admin@gymdemo.com\",\"password\":\"admin1234\"}'
```

- [ ] **Step 3: Listar miembros sin sesión (debe rechazar)**

```powershell
curl.exe -X GET http://localhost:3000/api/miembros
```

Expected: `401`, `{"error":"No autenticado."}`.

- [ ] **Step 4: Listar miembros con sesión**

```powershell
curl.exe -b cookies.txt http://localhost:3000/api/miembros
```

Expected: `200`, `{"miembros":[...]}` con los miembros del seed (Rayza Aray, Julio César Bastidas, Rodrigo Lara).

- [ ] **Step 5: Crear un miembro nuevo**

```powershell
curl.exe -b cookies.txt -X POST http://localhost:3000/api/miembros -H "Content-Type: application/json" -d '{\"nombre\":\"Ana Torres\",\"cedula\":\"20123456\",\"planTipo\":\"SIN_ENTRENADOR\",\"precioPlan\":25}'
```

Expected: `201` con el miembro creado (anotar su `id` para los siguientes pasos).

- [ ] **Step 6: Intentar crear otro miembro con la misma cédula (debe rechazar)**

```powershell
curl.exe -b cookies.txt -X POST http://localhost:3000/api/miembros -H "Content-Type: application/json" -d '{\"nombre\":\"Otra Persona\",\"cedula\":\"20123456\",\"planTipo\":\"SIN_ENTRENADOR\",\"precioPlan\":25}'
```

Expected: `409`, `{"error":"Ya existe un miembro con esa cédula en esta organización."}`.

- [ ] **Step 7: Ver el detalle del miembro creado**

```powershell
curl.exe -b cookies.txt http://localhost:3000/api/miembros/<id-del-Step-5>
```

Expected: `200` con los datos completos.

- [ ] **Step 8: Editar el miembro (cambiar el celular)**

```powershell
curl.exe -b cookies.txt -X PATCH http://localhost:3000/api/miembros/<id-del-Step-5> -H "Content-Type: application/json" -d '{\"celular\":\"0412-9999999\"}'
```

Expected: `200` con `celular` actualizado.

- [ ] **Step 9: Dar de baja lógica**

```powershell
curl.exe -b cookies.txt -X PATCH http://localhost:3000/api/miembros/<id-del-Step-5> -H "Content-Type: application/json" -d '{\"activo\":false}'
```

Expected: `200` con `activo: false`.

- [ ] **Step 10: Pedir un id que no existe (debe dar 404)**

```powershell
curl.exe -b cookies.txt http://localhost:3000/api/miembros/no-existe
```

Expected: `404`, `{"error":"No se encontró el miembro."}`.

- [ ] **Step 11: No hay commit en esta tarea** — es solo verificación.

---

## Fuera de alcance de este plan (explícitamente diferido)

- `Pago` y `Suscripcion`: `RegistrarPago`, renovaciones, y su conexión con el acceso por sucursal — plan aparte. Decisión ya tomada (ver tabla al inicio): `RegistrarPago` deberá crear/extender la `Suscripcion` `ACTIVA` del `Plan` indicado.
- Restricciones por rol sobre estos endpoints (hoy cualquier `UsuarioAdmin` autenticado puede usarlos) — graduar cuando un caso real lo exija.
- Paginación/filtros/búsqueda en `GET /api/miembros` — hoy devuelve la lista completa de la organización sin paginar.
- Subida real de `fotoUrl` (hoy es un string libre que el cliente debe llenar con una URL ya existente, no hay endpoint de upload).
- UI del panel admin para este CRUD (solo se prueba con `curl` en este plan) — la página `/login` existente no gana ninguna pantalla nueva aquí.

## Execution Handoff

Dos opciones de ejecución:

**1. Subagent-Driven (recomendado)** — un subagente fresco por tarea, revisión entre tareas.

**2. Inline Execution** — ejecuto las Tareas 1–6 yo mismo en esta sesión (no requieren red hacia la DB), y la Tarea 7 la corres tú.

¿Cuál prefieres?
