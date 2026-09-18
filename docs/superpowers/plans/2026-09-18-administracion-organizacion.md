# Administración de Organización: Sucursales, Usuarios y Permisos Granulares Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir gestión completa de Sucursales y Usuarios desde el panel admin, con una matriz de permisos granular (módulo × acción) que reemplaza los checks de rol dispersos hoy en el dominio.

**Architecture:** Arquitectura hexagonal existente. Nuevos modelos `PermisoUsuario` (permiso = fila presente) y `UsuarioSucursal` (N:N). `UsuarioAdmin.sucursalId` se conserva con significado reducido a "sucursal por defecto". Los 5 casos de uso existentes que hoy comparan `rol === "X"` migran a consultar `IAuthorizationService.tienePermiso(...)`.

**Tech Stack:** Next.js 16 App Router, React 19 (`useActionState`), Prisma/PostgreSQL, Turborepo monorepo.

**Spec:** `docs/superpowers/specs/2026-09-18-administracion-organizacion-design.md`

## Global Constraints

- Solo `rolSolicitante === "DUENO"` puede crear usuarios, asignar sucursales/permisos, o dar de baja/reactivar usuarios — validado en el caso de uso de dominio (fuente de verdad) y también en la Server Action (defensa en profundidad), igual patrón que el resto del sistema.
- `PermisoUsuario`: la presencia de una fila `(usuarioId, modulo, accion)` es el único estado — no existe "denegado" explícito.
- `UsuarioSucursal` vacío para un usuario = acceso a toda la organización (misma semántica que hoy tiene `sucursalId = null`).
- Rol y email de un `UsuarioAdmin` no son editables después de creado — solo `nombre`, `activo`, sucursales asignadas y permisos.
- `Sucursal.tasaCambioUSD` y `Sucursal.apiKey` nunca aparecen en el formulario de edición como campos editables; `apiKey` se muestra solo lectura con botón de copiar. `CambiosSucursal` excluye ambos estructuralmente (mismo patrón de inmutabilidad-por-tipo que `CambiosPlan`).
- Los 5 casos de uso migrados (`AbrirTurno`, `CerrarTurno`, `RegistrarPago`, `RegistrarEgreso`, `AnularPago`) preservan su tipo de excepción `RolNoAutorizadoError` y su mensaje — solo cambia la fuente de la decisión (de comparar `rol` a consultar `tienePermiso`).
- Nombres en español siguiendo la convención existente: `ModuloPermiso`, `AccionPermiso`, `PermisoUsuario`, `UsuarioSucursal`, `CrearSucursal`, `ActualizarUsuarioAdmin`, etc.

---

### Task 1: Migración de schema — PermisoUsuario, UsuarioSucursal, campos nuevos en UsuarioAdmin y Sucursal

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/backfillPermisosYSucursales.ts`

**Interfaces:**
- Consumes: nada.
- Produces: modelos Prisma `PermisoUsuario`, `UsuarioSucursal`, enums `ModuloPermiso`/`AccionPermiso`; `UsuarioAdmin.nombre`/`activo`; `Sucursal.activo` — consumidos por las Tareas 2-9.

- [ ] **Step 1: Agregar los enums y modelos nuevos al schema**

En `packages/db/prisma/schema.prisma`, agregar después del modelo `UsuarioAdmin`:

```prisma
enum ModuloPermiso {
  MIEMBROS
  PAGOS
  PLANES
  CAJA
  USUARIOS
  SUCURSALES
}

enum AccionPermiso {
  VER
  CREAR
  EDITAR
  ELIMINAR
}

model PermisoUsuario {
  id        String        @id @default(cuid())
  usuarioId String
  usuario   UsuarioAdmin  @relation(fields: [usuarioId], references: [id])
  modulo    ModuloPermiso
  accion    AccionPermiso

  @@unique([usuarioId, modulo, accion])
}

model UsuarioSucursal {
  usuarioId  String
  sucursalId String
  usuario    UsuarioAdmin @relation(fields: [usuarioId], references: [id])
  sucursal   Sucursal     @relation(fields: [sucursalId], references: [id])

  @@id([usuarioId, sucursalId])
}
```

- [ ] **Step 2: Modificar `UsuarioAdmin`**

Reemplazar el modelo actual por:

```prisma
model UsuarioAdmin {
  id             String       @id @default(cuid())
  organizacionId String
  organizacion   Organizacion @relation(fields: [organizacionId], references: [id])
  sucursalId     String? // sucursal por defecto para operar (preselección) — NO es la fuente de acceso, ver UsuarioSucursal
  sucursal       Sucursal?    @relation(fields: [sucursalId], references: [id])
  nombre         String       @default("")
  rol            RolUsuario
  email          String       @unique
  passwordHash   String
  activo         Boolean      @default(true)
  createdAt      DateTime     @default(now())

  registrosAuditoria RegistroAuditoria[]
  sesiones           Sesion[]
  turnos             Turno[]
  pagosRegistrados   Pago[] @relation("PagosRegistrados")
  pagosAnulados      Pago[] @relation("PagosAnulados")
  permisos           PermisoUsuario[]
  sucursales         UsuarioSucursal[]
}
```

- [ ] **Step 3: Modificar `Sucursal`**

Agregar `activo Boolean @default(true)` y la relación inversa dentro del modelo `Sucursal` existente:

```prisma
model Sucursal {
  id             String       @id @default(cuid())
  organizacionId String
  organizacion   Organizacion @relation(fields: [organizacionId], references: [id])
  nombre         String
  direccion      String?
  diasGracia     Int          @default(0)
  tasaCambioUSD  Decimal?     @db.Decimal(10, 2)
  activo         Boolean      @default(true)
  createdAt      DateTime     @default(now())
  apiKey         String       @unique @default(uuid())

  usuariosAdmin     UsuarioAdmin[]
  entrenadores      Entrenador[]
  checkIns          CheckIn[]
  planesAcceso      PlanSucursalAcceso[]
  pagos             Pago[]
  turnos            Turno[]
  usuariosConAcceso UsuarioSucursal[]
}
```

- [ ] **Step 4: Generar y aplicar la migración**

Run: `cd packages/db && npx prisma migrate dev --name administracion_organizacion`
Expected: la migración se crea y aplica sin errores. No hay pérdida de datos (todos los campos nuevos son opcionales o tienen default).

- [ ] **Step 5: Crear el script de backfill**

Archivo `packages/db/backfillPermisosYSucursales.ts` — puebla `UsuarioSucursal` y `PermisoUsuario` para los usuarios ya existentes, según su `sucursalId` actual y la matriz de defaults por rol:

```ts
import { PrismaClient } from "./generated/prisma/client";

const prisma = new PrismaClient();

const PERMISOS_POR_ROL: Record<string, Array<{ modulo: string; accion: string }>> = {
  DUENO: [
    ...["MIEMBROS", "PAGOS", "PLANES", "CAJA", "USUARIOS", "SUCURSALES"].flatMap((modulo) =>
      ["VER", "CREAR", "EDITAR", "ELIMINAR"].map((accion) => ({ modulo, accion }))
    ),
  ],
  GERENTE: [
    ...["MIEMBROS", "PAGOS", "CAJA"].flatMap((modulo) =>
      ["VER", "CREAR", "EDITAR", "ELIMINAR"].map((accion) => ({ modulo, accion }))
    ),
    { modulo: "PLANES", accion: "VER" },
    { modulo: "PLANES", accion: "CREAR" },
    { modulo: "PLANES", accion: "EDITAR" },
    { modulo: "USUARIOS", accion: "VER" },
    { modulo: "SUCURSALES", accion: "VER" },
  ],
  RECEPCION: [
    { modulo: "MIEMBROS", accion: "VER" },
    { modulo: "MIEMBROS", accion: "CREAR" },
    { modulo: "MIEMBROS", accion: "EDITAR" },
    { modulo: "PAGOS", accion: "VER" },
    { modulo: "PAGOS", accion: "CREAR" },
    { modulo: "PLANES", accion: "VER" },
    { modulo: "CAJA", accion: "VER" },
    { modulo: "CAJA", accion: "CREAR" },
  ],
  ENTRENADOR: [
    { modulo: "MIEMBROS", accion: "VER" },
    { modulo: "PAGOS", accion: "VER" },
    { modulo: "PLANES", accion: "VER" },
  ],
};

async function main() {
  const usuarios = await prisma.usuarioAdmin.findMany();
  let sucursalesCreadas = 0;
  let permisosCreados = 0;

  for (const usuario of usuarios) {
    if (usuario.sucursalId) {
      await prisma.usuarioSucursal.upsert({
        where: { usuarioId_sucursalId: { usuarioId: usuario.id, sucursalId: usuario.sucursalId } },
        create: { usuarioId: usuario.id, sucursalId: usuario.sucursalId },
        update: {},
      });
      sucursalesCreadas++;
    }

    const permisos = PERMISOS_POR_ROL[usuario.rol] ?? [];
    for (const permiso of permisos) {
      await prisma.permisoUsuario.upsert({
        where: {
          usuarioId_modulo_accion: {
            usuarioId: usuario.id,
            modulo: permiso.modulo as never,
            accion: permiso.accion as never,
          },
        },
        create: { usuarioId: usuario.id, modulo: permiso.modulo as never, accion: permiso.accion as never },
        update: {},
      });
      permisosCreados++;
    }
  }

  console.log(`Backfill completo: ${sucursalesCreadas} asignaciones de sucursal, ${permisosCreados} permisos (upsert, incluye ya existentes).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 6: Ejecutar el backfill y regenerar el cliente Prisma**

Run: `cd packages/db && npx tsx backfillPermisosYSucursales.ts && npx prisma generate`
Expected: imprime el resumen del backfill sin errores; el cliente Prisma queda regenerado con los tipos nuevos.

- [ ] **Step 7: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations packages/db/backfillPermisosYSucursales.ts
git commit -m "feat: agrega PermisoUsuario, UsuarioSucursal y campos nuevos en UsuarioAdmin/Sucursal"
```

---

### Task 2: Entidades y puertos de dominio — Permiso, UsuarioSucursal, y extensión de UsuarioAdmin/Sucursal

**Files:**
- Create: `packages/domain/entities/Permiso.ts`
- Modify: `packages/domain/entities/UsuarioAdmin.ts`
- Modify: `packages/domain/entities/Sucursal.ts`
- Modify: `packages/domain/ports/IUsuarioAdminRepository.ts`
- Modify: `packages/domain/ports/ISucursalRepository.ts`
- Create: `packages/domain/ports/IPermisoRepository.ts`
- Modify: `packages/domain/ports/IAuthorizationService.ts`

**Interfaces:**
- Consumes: nada.
- Produces: tipos `ModuloPermiso`, `AccionPermiso`, `Permiso`; `UsuarioAdmin` con `nombre`/`activo`; `Sucursal` con `activo`, `CambiosSucursal`; puertos extendidos — consumidos por las Tareas 3-9.

- [ ] **Step 1: Crear `packages/domain/entities/Permiso.ts`**

```ts
export type ModuloPermiso = "MIEMBROS" | "PAGOS" | "PLANES" | "CAJA" | "USUARIOS" | "SUCURSALES";
export type AccionPermiso = "VER" | "CREAR" | "EDITAR" | "ELIMINAR";

export interface Permiso {
  modulo: ModuloPermiso;
  accion: AccionPermiso;
}
```

- [ ] **Step 2: Modificar `packages/domain/entities/UsuarioAdmin.ts`**

```ts
export type RolUsuario = "DUENO" | "GERENTE" | "RECEPCION" | "ENTRENADOR";

export interface UsuarioAdmin {
  id: string;
  organizacionId: string;
  sucursalId: string | null;
  nombre: string;
  rol: RolUsuario;
  email: string;
  activo: boolean;
}

export interface CambiosUsuarioAdmin {
  nombre?: string;
  activo?: boolean;
}
```

- [ ] **Step 3: Modificar `packages/domain/entities/Sucursal.ts`**

```ts
export interface Sucursal {
  id: string;
  organizacionId: string;
  nombre: string;
  direccion: string | null;
  diasGracia: number;
  activo: boolean;
  apiKey: string;
}

export interface CambiosSucursal {
  nombre?: string;
  direccion?: string | null;
  diasGracia?: number;
  activo?: boolean;
}

export interface DatosNuevaSucursal {
  organizacionId: string;
  nombre: string;
  direccion: string | null;
  diasGracia: number;
}
```

- [ ] **Step 4: Modificar `packages/domain/entities/SucursalResumen.ts`**

```ts
export interface SucursalResumen {
  id: string;
  nombre: string;
  activo: boolean;
}
```

- [ ] **Step 5: Modificar `packages/domain/ports/IUsuarioAdminRepository.ts`**

```ts
import { UsuarioAdmin, CambiosUsuarioAdmin, RolUsuario } from "../entities/UsuarioAdmin";

export interface IUsuarioAdminRepository {
  crear(datos: {
    organizacionId: string;
    sucursalId: string | null;
    nombre: string;
    email: string;
    passwordHash: string;
    rol: RolUsuario;
  }): Promise<UsuarioAdmin>;
  buscarPorId(organizacionId: string, id: string): Promise<UsuarioAdmin | null>;
  buscarCredencialesPorEmail(
    email: string
  ): Promise<{ usuario: UsuarioAdmin; passwordHash: string } | null>;
  listarPorOrganizacion(organizacionId: string): Promise<UsuarioAdmin[]>;
  actualizar(organizacionId: string, id: string, cambios: CambiosUsuarioAdmin): Promise<UsuarioAdmin | null>;
}
```

Nota: `buscarPorId` cambia de `(id)` a `(organizacionId, id)` — mismo patrón de scoping por organización que ya se aplicó a `ITurnoRepository`/`IPagoRepository` en el plan de Caja, por la misma razón de seguridad (nunca confiar en un ID de cliente sin verificar tenencia).

- [ ] **Step 6: Modificar `packages/domain/ports/ISucursalRepository.ts`**

```ts
import { Sucursal, CambiosSucursal, DatosNuevaSucursal } from "../entities/Sucursal";
import { SucursalResumen } from "../entities/SucursalResumen";

export interface ISucursalRepository {
  buscarPorApiKey(apiKey: string): Promise<Sucursal | null>;
  buscarPorId(organizacionId: string, id: string): Promise<Sucursal | null>;
  listarPorOrganizacion(organizacionId: string): Promise<SucursalResumen[]>;
  crear(datos: DatosNuevaSucursal): Promise<Sucursal>;
  actualizar(organizacionId: string, id: string, cambios: CambiosSucursal): Promise<Sucursal | null>;
}
```

- [ ] **Step 7: Crear `packages/domain/ports/IPermisoRepository.ts`**

```ts
import { Permiso, ModuloPermiso, AccionPermiso } from "../entities/Permiso";

export interface IPermisoRepository {
  tiene(usuarioId: string, modulo: ModuloPermiso, accion: AccionPermiso): Promise<boolean>;
  listarPorUsuario(usuarioId: string): Promise<Permiso[]>;
  reemplazarTodos(usuarioId: string, permisos: Permiso[]): Promise<void>;
}
```

- [ ] **Step 8: Modificar `packages/domain/ports/IAuthorizationService.ts`**

```ts
import { RolUsuario } from "../entities/UsuarioAdmin";
import { ModuloPermiso, AccionPermiso } from "../entities/Permiso";

export interface IAuthorizationService {
  puedeCrearUsuarioConRol(rolSolicitante: RolUsuario, rolACrear: RolUsuario): boolean;
  tienePermiso(usuarioId: string, modulo: ModuloPermiso, accion: AccionPermiso): Promise<boolean>;
}
```

- [ ] **Step 9: Commit**

```bash
git add packages/domain/entities packages/domain/ports
git commit -m "feat: agrega entidades Permiso y extiende UsuarioAdmin/Sucursal con nombre/activo y CambiosX"
```

---

### Task 3: IPermisoRepository e IUsuarioSucursalRepository — adaptadores Prisma; extensión de PrismaSucursalRepository/PrismaUsuarioAdminRepository

**Files:**
- Create: `packages/infrastructure/persistence/prisma/PrismaPermisoRepository.ts`
- Create: `packages/domain/ports/IUsuarioSucursalRepository.ts`
- Create: `packages/infrastructure/persistence/prisma/PrismaUsuarioSucursalRepository.ts`
- Modify: `packages/infrastructure/persistence/prisma/PrismaSucursalRepository.ts`
- Modify: `packages/infrastructure/persistence/prisma/PrismaUsuarioAdminRepository.ts`
- Modify: `packages/infrastructure/AuthorizationService` — Modify: `packages/domain/services/AuthorizationService.ts`

**Interfaces:**
- Consumes: `IPermisoRepository`, `IUsuarioSucursalRepository`, `ISucursalRepository`, `IUsuarioAdminRepository`, `IAuthorizationService` (Tarea 2); `Permiso`, `Sucursal`, `CambiosSucursal`, `DatosNuevaSucursal`, `SucursalResumen`, `UsuarioAdmin`, `CambiosUsuarioAdmin` (Tarea 2).
- Produces: implementaciones concretas usadas por las Server Actions (Tareas 5-9) y por los 5 casos de uso migrados (Tarea 4).

- [ ] **Step 1: Crear `packages/domain/ports/IUsuarioSucursalRepository.ts`**

```ts
export interface IUsuarioSucursalRepository {
  listarSucursalIdsPorUsuario(usuarioId: string): Promise<string[]>;
  reemplazarTodas(usuarioId: string, sucursalIds: string[]): Promise<void>;
}
```

- [ ] **Step 2: Crear `packages/infrastructure/persistence/prisma/PrismaPermisoRepository.ts`**

```ts
import type { PrismaClient } from "@gym-app/db/generated/prisma/client";
import type { IPermisoRepository } from "@gym-app/domain/ports/IPermisoRepository";
import type { Permiso, ModuloPermiso, AccionPermiso } from "@gym-app/domain/entities/Permiso";

export class PrismaPermisoRepository implements IPermisoRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async tiene(usuarioId: string, modulo: ModuloPermiso, accion: AccionPermiso): Promise<boolean> {
    const permiso = await this.prisma.permisoUsuario.findUnique({
      where: { usuarioId_modulo_accion: { usuarioId, modulo, accion } },
    });
    return permiso !== null;
  }

  async listarPorUsuario(usuarioId: string): Promise<Permiso[]> {
    const permisos = await this.prisma.permisoUsuario.findMany({ where: { usuarioId } });
    return permisos.map((p) => ({ modulo: p.modulo, accion: p.accion }));
  }

  async reemplazarTodos(usuarioId: string, permisos: Permiso[]): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.permisoUsuario.deleteMany({ where: { usuarioId } }),
      this.prisma.permisoUsuario.createMany({
        data: permisos.map((p) => ({ usuarioId, modulo: p.modulo, accion: p.accion })),
      }),
    ]);
  }
}
```

- [ ] **Step 3: Crear `packages/infrastructure/persistence/prisma/PrismaUsuarioSucursalRepository.ts`**

```ts
import type { PrismaClient } from "@gym-app/db/generated/prisma/client";
import type { IUsuarioSucursalRepository } from "@gym-app/domain/ports/IUsuarioSucursalRepository";

export class PrismaUsuarioSucursalRepository implements IUsuarioSucursalRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listarSucursalIdsPorUsuario(usuarioId: string): Promise<string[]> {
    const filas = await this.prisma.usuarioSucursal.findMany({ where: { usuarioId } });
    return filas.map((f) => f.sucursalId);
  }

  async reemplazarTodas(usuarioId: string, sucursalIds: string[]): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.usuarioSucursal.deleteMany({ where: { usuarioId } }),
      this.prisma.usuarioSucursal.createMany({
        data: sucursalIds.map((sucursalId) => ({ usuarioId, sucursalId })),
      }),
    ]);
  }
}
```

- [ ] **Step 4: Modificar `packages/infrastructure/persistence/prisma/PrismaSucursalRepository.ts`**

```ts
import type { PrismaClient } from "@gym-app/db/generated/prisma/client";
import type { ISucursalRepository } from "@gym-app/domain/ports/ISucursalRepository";
import type { Sucursal, CambiosSucursal, DatosNuevaSucursal } from "@gym-app/domain/entities/Sucursal";
import type { SucursalResumen } from "@gym-app/domain/entities/SucursalResumen";

function mapear(sucursal: {
  id: string;
  organizacionId: string;
  nombre: string;
  direccion: string | null;
  diasGracia: number;
  activo: boolean;
  apiKey: string;
}): Sucursal {
  return {
    id: sucursal.id,
    organizacionId: sucursal.organizacionId,
    nombre: sucursal.nombre,
    direccion: sucursal.direccion,
    diasGracia: sucursal.diasGracia,
    activo: sucursal.activo,
    apiKey: sucursal.apiKey,
  };
}

export class PrismaSucursalRepository implements ISucursalRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async buscarPorApiKey(apiKey: string): Promise<Sucursal | null> {
    const sucursal = await this.prisma.sucursal.findUnique({ where: { apiKey } });
    return sucursal ? mapear(sucursal) : null;
  }

  async buscarPorId(organizacionId: string, id: string): Promise<Sucursal | null> {
    const sucursal = await this.prisma.sucursal.findFirst({ where: { id, organizacionId } });
    return sucursal ? mapear(sucursal) : null;
  }

  async listarPorOrganizacion(organizacionId: string): Promise<SucursalResumen[]> {
    return this.prisma.sucursal.findMany({
      where: { organizacionId },
      select: { id: true, nombre: true, activo: true },
      orderBy: { nombre: "asc" },
    });
  }

  async crear(datos: DatosNuevaSucursal): Promise<Sucursal> {
    const sucursal = await this.prisma.sucursal.create({
      data: {
        organizacionId: datos.organizacionId,
        nombre: datos.nombre,
        direccion: datos.direccion,
        diasGracia: datos.diasGracia,
      },
    });
    return mapear(sucursal);
  }

  async actualizar(organizacionId: string, id: string, cambios: CambiosSucursal): Promise<Sucursal | null> {
    const existente = await this.prisma.sucursal.findFirst({ where: { id, organizacionId } });
    if (!existente) return null;

    const sucursal = await this.prisma.sucursal.update({ where: { id }, data: cambios });
    return mapear(sucursal);
  }
}
```

- [ ] **Step 5: Modificar `packages/infrastructure/persistence/prisma/PrismaUsuarioAdminRepository.ts`**

```ts
import type { PrismaClient } from "@gym-app/db/generated/prisma/client";
import type { IUsuarioAdminRepository } from "@gym-app/domain/ports/IUsuarioAdminRepository";
import type { UsuarioAdmin, CambiosUsuarioAdmin } from "@gym-app/domain/entities/UsuarioAdmin";

function mapear(usuario: {
  id: string;
  organizacionId: string;
  sucursalId: string | null;
  nombre: string;
  rol: UsuarioAdmin["rol"];
  email: string;
  activo: boolean;
}): UsuarioAdmin {
  return {
    id: usuario.id,
    organizacionId: usuario.organizacionId,
    sucursalId: usuario.sucursalId,
    nombre: usuario.nombre,
    rol: usuario.rol,
    email: usuario.email,
    activo: usuario.activo,
  };
}

export class PrismaUsuarioAdminRepository implements IUsuarioAdminRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async crear(datos: {
    organizacionId: string;
    sucursalId: string | null;
    nombre: string;
    email: string;
    passwordHash: string;
    rol: UsuarioAdmin["rol"];
  }): Promise<UsuarioAdmin> {
    const usuario = await this.prisma.usuarioAdmin.create({ data: datos });
    return mapear(usuario);
  }

  async buscarPorId(organizacionId: string, id: string): Promise<UsuarioAdmin | null> {
    const usuario = await this.prisma.usuarioAdmin.findFirst({ where: { id, organizacionId } });
    return usuario ? mapear(usuario) : null;
  }

  async buscarCredencialesPorEmail(
    email: string
  ): Promise<{ usuario: UsuarioAdmin; passwordHash: string } | null> {
    const usuario = await this.prisma.usuarioAdmin.findUnique({ where: { email } });
    if (!usuario) return null;
    return { usuario: mapear(usuario), passwordHash: usuario.passwordHash };
  }

  async listarPorOrganizacion(organizacionId: string): Promise<UsuarioAdmin[]> {
    const usuarios = await this.prisma.usuarioAdmin.findMany({
      where: { organizacionId },
      orderBy: { nombre: "asc" },
    });
    return usuarios.map(mapear);
  }

  async actualizar(organizacionId: string, id: string, cambios: CambiosUsuarioAdmin): Promise<UsuarioAdmin | null> {
    const existente = await this.prisma.usuarioAdmin.findFirst({ where: { id, organizacionId } });
    if (!existente) return null;

    const usuario = await this.prisma.usuarioAdmin.update({ where: { id }, data: cambios });
    return mapear(usuario);
  }
}
```

- [ ] **Step 6: Modificar `packages/domain/services/AuthorizationService.ts`**

```ts
import { IAuthorizationService } from "../ports/IAuthorizationService";
import { IPermisoRepository } from "../ports/IPermisoRepository";
import { RolUsuario } from "../entities/UsuarioAdmin";
import { ModuloPermiso, AccionPermiso } from "../entities/Permiso";

export class AuthorizationService implements IAuthorizationService {
  constructor(private readonly permisos: IPermisoRepository) {}

  puedeCrearUsuarioConRol(rolSolicitante: RolUsuario, _rolACrear: RolUsuario): boolean {
    return rolSolicitante === "DUENO";
  }

  async tienePermiso(usuarioId: string, modulo: ModuloPermiso, accion: AccionPermiso): Promise<boolean> {
    return this.permisos.tiene(usuarioId, modulo, accion);
  }
}
```

Nota para el implementador: `AuthorizationService` gana un constructor con dependencia — todos los lugares que hoy hacen `new AuthorizationService()` sin argumentos (ej. `api/usuarios/route.ts`) quedarán rotos hasta la Tarea 5, que los actualiza. No los toques en esta tarea.

- [ ] **Step 7: Commit**

```bash
git add packages/infrastructure/persistence/prisma packages/domain/ports/IUsuarioSucursalRepository.ts packages/domain/services/AuthorizationService.ts
git commit -m "feat: agrega adaptadores Prisma para Permiso/UsuarioSucursal; extiende Sucursal/UsuarioAdmin/AuthorizationService"
```

---

### Task 4: Migrar los 5 casos de uso existentes de chequeo de rol directo a tienePermiso

**Files:**
- Modify: `packages/domain/use-cases/AbrirTurno.ts`
- Modify: `packages/domain/use-cases/CerrarTurno.ts`
- Modify: `packages/domain/use-cases/RegistrarPago.ts`
- Modify: `packages/domain/use-cases/RegistrarEgreso.ts`
- Modify: `packages/domain/use-cases/AnularPago.ts`

**Interfaces:**
- Consumes: `IAuthorizationService.tienePermiso` (Tarea 2/3).
- Produces: los 5 casos de uso ganan `autorizacion: IAuthorizationService` en sus `deps` — consumidos por las Server Actions de Caja/Pagos (Tarea 8, que instancia `AuthorizationService(new PrismaPermisoRepository(prisma))` en cada invocación).

- [ ] **Step 1: Modificar `packages/domain/use-cases/AbrirTurno.ts`**

Reemplazar el chequeo de rol. Antes:
```ts
  if (input.rolUsuario === "ENTRENADOR") {
    throw new RolNoAutorizadoError();
  }
```
Después (agregar `autorizacion: IAuthorizationService` a `deps`, agregar el import, y usar `input.usuarioId` que ya existe en `DatosAbrirTurno`):
```ts
  if (!(await deps.autorizacion.tienePermiso(input.usuarioId, "CAJA", "CREAR"))) {
    throw new RolNoAutorizadoError();
  }
```
Agregar `import { IAuthorizationService } from "../ports/IAuthorizationService";` y actualizar la firma de `deps` en la función `abrirTurno` para incluir `autorizacion: IAuthorizationService`.

- [ ] **Step 2: Modificar `packages/domain/use-cases/CerrarTurno.ts`**

Mismo patrón. Antes:
```ts
  if (input.rolUsuario === "ENTRENADOR") {
    throw new RolNoAutorizadoError();
  }
```
Después (input ya trae acceso al usuario vía el turno resuelto — usar `input.usuarioIdSolicitante`, nuevo campo que se agrega a `DatosCerrarTurno`):
```ts
export interface DatosCerrarTurno {
  organizacionId: string;
  sucursalIdUsuario: string | null;
  usuarioIdSolicitante: string;
  turnoId: string;
  rolUsuario: RolUsuario;
  lineas: LineaArqueoInput[];
}
```
```ts
  if (!(await deps.autorizacion.tienePermiso(input.usuarioIdSolicitante, "CAJA", "EDITAR"))) {
    throw new RolNoAutorizadoError();
  }
```
Agregar `autorizacion: IAuthorizationService` a la firma de `deps` de `cerrarTurno`.

- [ ] **Step 3: Modificar `packages/domain/use-cases/RegistrarPago.ts`**

Antes:
```ts
  if (input.rolUsuario === "ENTRENADOR") {
    throw new RolNoAutorizadoError();
  }
```
Después (usar `input.registradoPorId`, que ya existe):
```ts
  if (!(await deps.autorizacion.tienePermiso(input.registradoPorId, "PAGOS", "CREAR"))) {
    throw new RolNoAutorizadoError();
  }
```
Agregar `autorizacion: IAuthorizationService` a `RegistrarPagoDeps`.

- [ ] **Step 4: Modificar `packages/domain/use-cases/RegistrarEgreso.ts`**

Agregar `usuarioIdSolicitante: string` a `DatosRegistrarEgreso`. Antes:
```ts
  if (input.rolUsuario === "ENTRENADOR") {
    throw new RolNoAutorizadoError();
  }
```
Después:
```ts
  if (!(await deps.autorizacion.tienePermiso(input.usuarioIdSolicitante, "CAJA", "CREAR"))) {
    throw new RolNoAutorizadoError();
  }
```
Agregar `autorizacion: IAuthorizationService` a los `deps` de `registrarEgreso`.

- [ ] **Step 5: Modificar `packages/domain/use-cases/AnularPago.ts`**

Antes:
```ts
  if (input.rolAnulador !== "DUENO" && input.rolAnulador !== "GERENTE") {
    throw new RolNoAutorizadoError();
  }
```
Después (usar `input.anuladoPorId`, que ya existe):
```ts
  if (!(await deps.autorizacion.tienePermiso(input.anuladoPorId, "PAGOS", "ELIMINAR"))) {
    throw new RolNoAutorizadoError();
  }
```
Agregar `autorizacion: IAuthorizationService` a los `deps` de `anularPago`.

- [ ] **Step 6: Commit**

```bash
git add packages/domain/use-cases/AbrirTurno.ts packages/domain/use-cases/CerrarTurno.ts packages/domain/use-cases/RegistrarPago.ts packages/domain/use-cases/RegistrarEgreso.ts packages/domain/use-cases/AnularPago.ts
git commit -m "refactor: migra AbrirTurno/CerrarTurno/RegistrarPago/RegistrarEgreso/AnularPago a tienePermiso"
```

---

### Task 5: Casos de uso de Sucursal — CrearSucursal, ActualizarSucursal (con permiso)

**Files:**
- Create: `packages/domain/use-cases/CrearSucursal.ts`
- Create: `packages/domain/use-cases/ActualizarSucursal.ts`
- Modify: `packages/domain/use-cases/ListarSucursales.ts`

**Interfaces:**
- Consumes: `ISucursalRepository`, `IAuthorizationService` (Tarea 2/3); `Sucursal`, `CambiosSucursal`, `DatosNuevaSucursal` (Tarea 2).
- Produces: `crearSucursal`, `actualizarSucursal`, `RolNoAutorizadoError`, `SucursalNoEncontradaError` — consumidos por las Server Actions de la Tarea 6.

- [ ] **Step 1: Crear `packages/domain/use-cases/CrearSucursal.ts`**

```ts
import { ISucursalRepository } from "../ports/ISucursalRepository";
import { IAuthorizationService } from "../ports/IAuthorizationService";
import { Sucursal } from "../entities/Sucursal";

export class RolNoAutorizadoError extends Error {
  constructor() {
    super("No tenés permiso para crear sucursales.");
  }
}

export interface DatosCrearSucursal {
  organizacionId: string;
  usuarioIdSolicitante: string;
  nombre: string;
  direccion: string | null;
  diasGracia: number;
}

export async function crearSucursal(
  deps: { sucursales: ISucursalRepository; autorizacion: IAuthorizationService },
  input: DatosCrearSucursal
): Promise<Sucursal> {
  if (!(await deps.autorizacion.tienePermiso(input.usuarioIdSolicitante, "SUCURSALES", "CREAR"))) {
    throw new RolNoAutorizadoError();
  }

  return deps.sucursales.crear({
    organizacionId: input.organizacionId,
    nombre: input.nombre,
    direccion: input.direccion,
    diasGracia: input.diasGracia,
  });
}
```

- [ ] **Step 2: Crear `packages/domain/use-cases/ActualizarSucursal.ts`**

```ts
import { ISucursalRepository } from "../ports/ISucursalRepository";
import { IAuthorizationService } from "../ports/IAuthorizationService";
import { Sucursal, CambiosSucursal } from "../entities/Sucursal";

export class RolNoAutorizadoError extends Error {
  constructor() {
    super("No tenés permiso para editar sucursales.");
  }
}

export class SucursalNoEncontradaError extends Error {
  constructor() {
    super("No se encontró la sucursal.");
  }
}

export async function actualizarSucursal(
  deps: { sucursales: ISucursalRepository; autorizacion: IAuthorizationService },
  input: { organizacionId: string; usuarioIdSolicitante: string; id: string; cambios: CambiosSucursal }
): Promise<Sucursal> {
  const accion = input.cambios.activo !== undefined ? "ELIMINAR" : "EDITAR";
  if (!(await deps.autorizacion.tienePermiso(input.usuarioIdSolicitante, "SUCURSALES", accion))) {
    throw new RolNoAutorizadoError();
  }

  const actualizada = await deps.sucursales.actualizar(input.organizacionId, input.id, input.cambios);
  if (!actualizada) {
    throw new SucursalNoEncontradaError();
  }

  return actualizada;
}
```

Nota: usar el permiso `ELIMINAR` cuando el cambio es solo `{ activo }` (dar de baja/reactivar) refleja la matriz de la spec, donde "eliminar" en un módulo con baja lógica se mapea a esa acción; el resto de campos usa `EDITAR`.

- [ ] **Step 3: Modificar `packages/domain/use-cases/ListarSucursales.ts`**

Leer el archivo actual y confirmar que sigue delegando a `sucursales.listarPorOrganizacion(organizacionId)` sin cambios — el tipo de retorno ya se amplía solo (ahora `SucursalResumen` incluye `activo`, definido en la Tarea 2). Si el archivo no requiere ningún cambio de código, este Step es una verificación, no una edición.

- [ ] **Step 4: Commit**

```bash
git add packages/domain/use-cases/CrearSucursal.ts packages/domain/use-cases/ActualizarSucursal.ts
git commit -m "feat: agrega casos de uso CrearSucursal y ActualizarSucursal"
```

---

### Task 6: Pantallas de Sucursales — `/sucursales`, `/sucursales/nuevo`, `/sucursales/[id]`

**Files:**
- Create: `apps/web-admin/app/(panel)/sucursales/actions.ts`
- Create: `apps/web-admin/app/(panel)/sucursales/FormularioSucursal.tsx`
- Create: `apps/web-admin/app/(panel)/sucursales/page.tsx`
- Create: `apps/web-admin/app/(panel)/sucursales/nuevo/page.tsx`
- Create: `apps/web-admin/app/(panel)/sucursales/[id]/page.tsx`
- Modify: `apps/web-admin/app/(panel)/layout.tsx`

**Interfaces:**
- Consumes: `crearSucursal`, `actualizarSucursal`, `RolNoAutorizadoError`, `SucursalNoEncontradaError` (Tarea 5); `ListarSucursales`; `PrismaSucursalRepository`, `PrismaPermisoRepository`, `AuthorizationService` (Tareas 2/3); `Button`, `Input`, `Badge` de `@gym-app/ui/components/*`.
- Produces: pantalla `/sucursales` completa — no consumida por otras tareas.

- [ ] **Step 1: Crear `apps/web-admin/app/(panel)/sucursales/actions.ts`**

```ts
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSucursalRepository";
import { PrismaPermisoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPermisoRepository";
import { AuthorizationService } from "@gym-app/domain/services/AuthorizationService";
import { crearSucursal, RolNoAutorizadoError as RolNoAutorizadoCrear } from "@gym-app/domain/use-cases/CrearSucursal";
import {
  actualizarSucursal,
  RolNoAutorizadoError as RolNoAutorizadoActualizar,
  SucursalNoEncontradaError,
} from "@gym-app/domain/use-cases/ActualizarSucursal";

export interface EstadoFormularioSucursal {
  error?: string;
}

function deps() {
  return {
    sucursales: new PrismaSucursalRepository(prisma),
    autorizacion: new AuthorizationService(new PrismaPermisoRepository(prisma)),
  };
}

export async function crearSucursalAction(
  _estadoPrevio: EstadoFormularioSucursal,
  formData: FormData
): Promise<EstadoFormularioSucursal> {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const nombre = formData.get("nombre")?.toString().trim();
  const direccion = formData.get("direccion")?.toString().trim() || null;
  const diasGracia = Number(formData.get("diasGracia"));

  if (!nombre || Number.isNaN(diasGracia)) {
    return { error: "Nombre y días de gracia son requeridos." };
  }

  try {
    await crearSucursal(deps(), {
      organizacionId: usuario.organizacionId,
      usuarioIdSolicitante: usuario.id,
      nombre,
      direccion,
      diasGracia,
    });
  } catch (error) {
    if (error instanceof RolNoAutorizadoCrear) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/sucursales");
  redirect("/sucursales");
}

export async function actualizarSucursalAction(
  id: string,
  _estadoPrevio: EstadoFormularioSucursal,
  formData: FormData
): Promise<EstadoFormularioSucursal> {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const nombre = formData.get("nombre")?.toString().trim();
  const direccion = formData.get("direccion")?.toString().trim() || null;
  const diasGracia = Number(formData.get("diasGracia"));

  if (!nombre || Number.isNaN(diasGracia)) {
    return { error: "Nombre y días de gracia son requeridos." };
  }

  try {
    await actualizarSucursal(deps(), {
      organizacionId: usuario.organizacionId,
      usuarioIdSolicitante: usuario.id,
      id,
      cambios: { nombre, direccion, diasGracia },
    });
  } catch (error) {
    if (error instanceof RolNoAutorizadoActualizar || error instanceof SucursalNoEncontradaError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/sucursales");
  redirect("/sucursales");
}

export async function darDeBajaSucursalAction(id: string): Promise<void> {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  await actualizarSucursal(deps(), {
    organizacionId: usuario.organizacionId,
    usuarioIdSolicitante: usuario.id,
    id,
    cambios: { activo: false },
  });

  revalidatePath("/sucursales");
}

export async function reactivarSucursalAction(id: string): Promise<void> {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  await actualizarSucursal(deps(), {
    organizacionId: usuario.organizacionId,
    usuarioIdSolicitante: usuario.id,
    id,
    cambios: { activo: true },
  });

  revalidatePath("/sucursales");
}
```

- [ ] **Step 2: Crear `apps/web-admin/app/(panel)/sucursales/FormularioSucursal.tsx`**

```tsx
"use client";

import { useActionState, useState } from "react";
import { Button } from "@gym-app/ui/components/Button";
import { Input } from "@gym-app/ui/components/Input";
import type { EstadoFormularioSucursal } from "./actions";

export interface ValoresFormularioSucursal {
  nombre: string;
  direccion: string | null;
  diasGracia: number;
  apiKey?: string;
}

export function FormularioSucursal({
  accion,
  valoresIniciales,
}: {
  accion: (estado: EstadoFormularioSucursal, formData: FormData) => Promise<EstadoFormularioSucursal>;
  valoresIniciales?: ValoresFormularioSucursal;
}) {
  const [estado, enviar, enviando] = useActionState(accion, {});
  const [copiado, setCopiado] = useState(false);

  async function copiarApiKey() {
    if (!valoresIniciales?.apiKey) return;
    await navigator.clipboard.writeText(valoresIniciales.apiKey);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <form action={enviar} className="flex flex-col gap-4">
      {estado.error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{estado.error}</p>}

      <Input name="nombre" label="Nombre" required defaultValue={valoresIniciales?.nombre} />
      <Input name="direccion" label="Dirección" defaultValue={valoresIniciales?.direccion ?? ""} />
      <Input
        name="diasGracia"
        label="Días de gracia"
        type="number"
        required
        defaultValue={valoresIniciales?.diasGracia ?? 0}
      />

      {valoresIniciales?.apiKey && (
        <div className="flex flex-col gap-1 text-sm text-neutral-700">
          API Key del kiosco
          <div className="flex gap-2">
            <input
              readOnly
              value={valoresIniciales.apiKey}
              className="flex-1 rounded border border-neutral-300 bg-neutral-50 px-3 py-2 text-neutral-500"
            />
            <Button type="button" onClick={copiarApiKey}>
              {copiado ? "Copiado" : "Copiar"}
            </Button>
          </div>
        </div>
      )}

      <Button type="submit" disabled={enviando}>
        {enviando ? "Guardando..." : "Guardar"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 3: Crear `apps/web-admin/app/(panel)/sucursales/page.tsx`**

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSucursalRepository";
import { PrismaPermisoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPermisoRepository";
import { listarSucursales } from "@gym-app/domain/use-cases/ListarSucursales";
import { Button } from "@gym-app/ui/components/Button";
import { Badge } from "@gym-app/ui/components/Badge";

export default async function PaginaSucursales() {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const permisos = new PrismaPermisoRepository(prisma);
  const puedeVer = await permisos.tiene(usuario.id, "SUCURSALES", "VER");
  if (!puedeVer) redirect("/miembros");

  const puedeCrear = await permisos.tiene(usuario.id, "SUCURSALES", "CREAR");
  const sucursales = await listarSucursales(
    { sucursales: new PrismaSucursalRepository(prisma) },
    usuario.organizacionId
  );

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Sucursales</h1>
        {puedeCrear && (
          <Link href="/sucursales/nuevo">
            <Button>Nueva sucursal</Button>
          </Link>
        )}
      </div>

      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b text-sm text-neutral-500">
            <th className="py-2">Nombre</th>
            <th className="py-2">Dirección</th>
            <th className="py-2">Días de gracia</th>
            <th className="py-2">Estado</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {sucursales.map((sucursal) => (
            <tr key={sucursal.id} className="border-b">
              <td className="py-2">{sucursal.nombre}</td>
              <td className="py-2">—</td>
              <td className="py-2">—</td>
              <td className="py-2">
                <Badge tono={sucursal.activo ? "verde" : "gris"}>
                  {sucursal.activo ? "Activa" : "Inactiva"}
                </Badge>
              </td>
              <td className="py-2">
                <Link href={`/sucursales/${sucursal.id}`} className="text-sm font-medium text-blue-600 hover:underline">
                  Editar
                </Link>
              </td>
            </tr>
          ))}

          {sucursales.length === 0 && (
            <tr>
              <td colSpan={5} className="py-8 text-center text-neutral-500">
                Todavía no hay sucursales. Creá la primera.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
```

Nota para el implementador: la tabla muestra "—" en Dirección/Días de gracia porque `SucursalResumen` (usado por `ListarSucursales`) no expone esos campos — solo `id`/`nombre`/`activo` (definido en la Tarea 2). Si se quiere mostrar dirección/días de gracia en el listado, sería una ampliación de `SucursalResumen`/`listarPorOrganizacion`, fuera del alcance de esta tarea; dejarlo así es la implementación correcta según el contrato ya definido.

- [ ] **Step 4: Crear `apps/web-admin/app/(panel)/sucursales/nuevo/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaPermisoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPermisoRepository";
import { FormularioSucursal } from "../FormularioSucursal";
import { crearSucursalAction } from "../actions";

export default async function PaginaNuevaSucursal() {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const permisos = new PrismaPermisoRepository(prisma);
  const puedeCrear = await permisos.tiene(usuario.id, "SUCURSALES", "CREAR");
  if (!puedeCrear) redirect("/sucursales");

  return (
    <div className="p-8">
      <h1 className="mb-6 text-2xl font-semibold">Nueva sucursal</h1>
      <FormularioSucursal accion={crearSucursalAction} />
    </div>
  );
}
```

- [ ] **Step 5: Crear `apps/web-admin/app/(panel)/sucursales/[id]/page.tsx`**

```tsx
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSucursalRepository";
import { PrismaPermisoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPermisoRepository";
import { FormularioSucursal } from "../FormularioSucursal";
import { actualizarSucursalAction, darDeBajaSucursalAction, reactivarSucursalAction } from "../actions";
import { Button } from "@gym-app/ui/components/Button";

export default async function PaginaEditarSucursal({ params }: { params: Promise<{ id: string }> }) {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const permisos = new PrismaPermisoRepository(prisma);
  const puedeEditar = await permisos.tiene(usuario.id, "SUCURSALES", "EDITAR");
  if (!puedeEditar) redirect("/sucursales");

  const { id } = await params;
  const sucursal = await new PrismaSucursalRepository(prisma).buscarPorId(usuario.organizacionId, id);
  if (!sucursal) notFound();

  const accion = actualizarSucursalAction.bind(null, id);

  return (
    <div className="p-8">
      <h1 className="mb-6 text-2xl font-semibold">Editar sucursal</h1>
      <FormularioSucursal
        accion={accion}
        valoresIniciales={{
          nombre: sucursal.nombre,
          direccion: sucursal.direccion,
          diasGracia: sucursal.diasGracia,
          apiKey: sucursal.apiKey,
        }}
      />

      <form action={sucursal.activo ? darDeBajaSucursalAction.bind(null, id) : reactivarSucursalAction.bind(null, id)} className="mt-4">
        <Button type="submit">{sucursal.activo ? "Dar de baja" : "Reactivar"}</Button>
      </form>
    </div>
  );
}
```

- [ ] **Step 6: Modificar `apps/web-admin/app/(panel)/layout.tsx`**

Agregar los links "Usuarios" y "Sucursales" al arreglo `items` del `Sidebar`:

```tsx
      <Sidebar
        items={[
          { href: "/miembros", label: "Miembros" },
          { href: "/pagos", label: "Pagos" },
          { href: "/planes", label: "Planes" },
          { href: "/caja", label: "Caja" },
          { href: "/usuarios", label: "Usuarios" },
          { href: "/sucursales", label: "Sucursales" },
        ]}
      />
```

- [ ] **Step 7: Commit**

```bash
git add "apps/web-admin/app/(panel)/sucursales" "apps/web-admin/app/(panel)/layout.tsx"
git commit -m "feat: agrega la pantalla de gestión de Sucursales"
```

---

### Task 7: Casos de uso de Usuario — ListarUsuariosAdmin, ObtenerUsuarioAdmin, ActualizarUsuarioAdmin, altas/bajas, permisos y sucursales

**Files:**
- Create: `packages/domain/use-cases/ListarUsuariosAdmin.ts`
- Create: `packages/domain/use-cases/ObtenerUsuarioAdmin.ts`
- Create: `packages/domain/use-cases/ActualizarUsuarioAdmin.ts`
- Create: `packages/domain/use-cases/AsignarSucursalesAUsuario.ts`
- Create: `packages/domain/use-cases/ActualizarPermisosUsuario.ts`
- Modify: `packages/domain/use-cases/CrearUsuarioAdmin.ts`

**Interfaces:**
- Consumes: `IUsuarioAdminRepository`, `IUsuarioSucursalRepository`, `IPermisoRepository`, `IAuthorizationService` (Tareas 2/3); `UsuarioAdmin`, `CambiosUsuarioAdmin`, `Permiso` (Tarea 2).
- Produces: `listarUsuariosAdmin`, `obtenerUsuarioAdmin`, `actualizarUsuarioAdmin`, `asignarSucursalesAUsuario`, `actualizarPermisosUsuario`, `RolNoAutorizadoError`, `UsuarioNoEncontradoError` — consumidos por las Server Actions de la Tarea 9.

- [ ] **Step 1: Crear `packages/domain/use-cases/ListarUsuariosAdmin.ts`**

```ts
import { IUsuarioAdminRepository } from "../ports/IUsuarioAdminRepository";
import { UsuarioAdmin } from "../entities/UsuarioAdmin";

export async function listarUsuariosAdmin(
  deps: { usuarios: IUsuarioAdminRepository },
  organizacionId: string
): Promise<UsuarioAdmin[]> {
  return deps.usuarios.listarPorOrganizacion(organizacionId);
}
```

- [ ] **Step 2: Crear `packages/domain/use-cases/ObtenerUsuarioAdmin.ts`**

```ts
import { IUsuarioAdminRepository } from "../ports/IUsuarioAdminRepository";
import { IUsuarioSucursalRepository } from "../ports/IUsuarioSucursalRepository";
import { IPermisoRepository } from "../ports/IPermisoRepository";
import { UsuarioAdmin } from "../entities/UsuarioAdmin";
import { Permiso } from "../entities/Permiso";

export class UsuarioNoEncontradoError extends Error {
  constructor() {
    super("No se encontró el usuario.");
  }
}

export interface DetalleUsuarioAdmin {
  usuario: UsuarioAdmin;
  sucursalIds: string[];
  permisos: Permiso[];
}

export async function obtenerUsuarioAdmin(
  deps: { usuarios: IUsuarioAdminRepository; usuarioSucursales: IUsuarioSucursalRepository; permisos: IPermisoRepository },
  input: { organizacionId: string; id: string }
): Promise<DetalleUsuarioAdmin> {
  const usuario = await deps.usuarios.buscarPorId(input.organizacionId, input.id);
  if (!usuario) {
    throw new UsuarioNoEncontradoError();
  }

  const [sucursalIds, permisos] = await Promise.all([
    deps.usuarioSucursales.listarSucursalIdsPorUsuario(input.id),
    deps.permisos.listarPorUsuario(input.id),
  ]);

  return { usuario, sucursalIds, permisos };
}
```

- [ ] **Step 3: Crear `packages/domain/use-cases/ActualizarUsuarioAdmin.ts`**

```ts
import { IUsuarioAdminRepository } from "../ports/IUsuarioAdminRepository";
import { IAuthorizationService } from "../ports/IAuthorizationService";
import { UsuarioAdmin, CambiosUsuarioAdmin, RolUsuario } from "../entities/UsuarioAdmin";

export class RolNoAutorizadoError extends Error {
  constructor() {
    super("Solo el dueño puede administrar usuarios.");
  }
}

export class UsuarioNoEncontradoError extends Error {
  constructor() {
    super("No se encontró el usuario.");
  }
}

export async function actualizarUsuarioAdmin(
  deps: { usuarios: IUsuarioAdminRepository },
  input: { organizacionId: string; rolSolicitante: RolUsuario; id: string; cambios: CambiosUsuarioAdmin }
): Promise<UsuarioAdmin> {
  if (input.rolSolicitante !== "DUENO") {
    throw new RolNoAutorizadoError();
  }

  const actualizado = await deps.usuarios.actualizar(input.organizacionId, input.id, input.cambios);
  if (!actualizado) {
    throw new UsuarioNoEncontradoError();
  }

  return actualizado;
}
```

- [ ] **Step 4: Crear `packages/domain/use-cases/AsignarSucursalesAUsuario.ts`**

```ts
import { IUsuarioAdminRepository } from "../ports/IUsuarioAdminRepository";
import { IUsuarioSucursalRepository } from "../ports/IUsuarioSucursalRepository";
import { RolUsuario } from "../entities/UsuarioAdmin";

export class RolNoAutorizadoError extends Error {
  constructor() {
    super("Solo el dueño puede administrar usuarios.");
  }
}

export class UsuarioNoEncontradoError extends Error {
  constructor() {
    super("No se encontró el usuario.");
  }
}

export async function asignarSucursalesAUsuario(
  deps: { usuarios: IUsuarioAdminRepository; usuarioSucursales: IUsuarioSucursalRepository },
  input: { organizacionId: string; rolSolicitante: RolUsuario; usuarioId: string; sucursalIds: string[] }
): Promise<void> {
  if (input.rolSolicitante !== "DUENO") {
    throw new RolNoAutorizadoError();
  }

  const existente = await deps.usuarios.buscarPorId(input.organizacionId, input.usuarioId);
  if (!existente) {
    throw new UsuarioNoEncontradoError();
  }

  await deps.usuarioSucursales.reemplazarTodas(input.usuarioId, input.sucursalIds);
}
```

- [ ] **Step 5: Crear `packages/domain/use-cases/ActualizarPermisosUsuario.ts`**

```ts
import { IUsuarioAdminRepository } from "../ports/IUsuarioAdminRepository";
import { IPermisoRepository } from "../ports/IPermisoRepository";
import { RolUsuario } from "../entities/UsuarioAdmin";
import { Permiso } from "../entities/Permiso";

export class RolNoAutorizadoError extends Error {
  constructor() {
    super("Solo el dueño puede administrar permisos.");
  }
}

export class UsuarioNoEncontradoError extends Error {
  constructor() {
    super("No se encontró el usuario.");
  }
}

export async function actualizarPermisosUsuario(
  deps: { usuarios: IUsuarioAdminRepository; permisos: IPermisoRepository },
  input: { organizacionId: string; rolSolicitante: RolUsuario; usuarioId: string; permisos: Permiso[] }
): Promise<void> {
  if (input.rolSolicitante !== "DUENO") {
    throw new RolNoAutorizadoError();
  }

  const existente = await deps.usuarios.buscarPorId(input.organizacionId, input.usuarioId);
  if (!existente) {
    throw new UsuarioNoEncontradoError();
  }

  await deps.permisos.reemplazarTodos(input.usuarioId, input.permisos);
}
```

- [ ] **Step 6: Modificar `packages/domain/use-cases/CrearUsuarioAdmin.ts`**

Reemplazar el contenido completo por:

```ts
import { IUsuarioAdminRepository } from "../ports/IUsuarioAdminRepository";
import { IAuthorizationService } from "../ports/IAuthorizationService";
import { IPermisoRepository } from "../ports/IPermisoRepository";
import { IUsuarioSucursalRepository } from "../ports/IUsuarioSucursalRepository";
import { RolUsuario, UsuarioAdmin } from "../entities/UsuarioAdmin";
import { Permiso, ModuloPermiso, AccionPermiso } from "../entities/Permiso";

export interface CrearUsuarioAdminDeps {
  usuarios: IUsuarioAdminRepository;
  autorizacion: IAuthorizationService;
  permisos: IPermisoRepository;
  usuarioSucursales: IUsuarioSucursalRepository;
}

export interface CrearUsuarioAdminInput {
  solicitante: { rol: RolUsuario };
  organizacionId: string;
  sucursalId: string | null;
  sucursalIds: string[];
  nombre: string;
  email: string;
  passwordHash: string;
  rol: RolUsuario;
}

export class NoAutorizadoError extends Error {
  constructor(rolSolicitante: RolUsuario, rolACrear: RolUsuario) {
    super(`El rol ${rolSolicitante} no puede crear usuarios con rol ${rolACrear}.`);
  }
}

const MODULOS: ModuloPermiso[] = ["MIEMBROS", "PAGOS", "PLANES", "CAJA", "USUARIOS", "SUCURSALES"];
const ACCIONES: AccionPermiso[] = ["VER", "CREAR", "EDITAR", "ELIMINAR"];

const PERMISOS_POR_ROL: Record<RolUsuario, Permiso[]> = {
  DUENO: MODULOS.flatMap((modulo) => ACCIONES.map((accion) => ({ modulo, accion }))),
  GERENTE: [
    ...(["MIEMBROS", "PAGOS", "CAJA"] as ModuloPermiso[]).flatMap((modulo) =>
      ACCIONES.map((accion) => ({ modulo, accion }))
    ),
    { modulo: "PLANES", accion: "VER" },
    { modulo: "PLANES", accion: "CREAR" },
    { modulo: "PLANES", accion: "EDITAR" },
    { modulo: "USUARIOS", accion: "VER" },
    { modulo: "SUCURSALES", accion: "VER" },
  ],
  RECEPCION: [
    { modulo: "MIEMBROS", accion: "VER" },
    { modulo: "MIEMBROS", accion: "CREAR" },
    { modulo: "MIEMBROS", accion: "EDITAR" },
    { modulo: "PAGOS", accion: "VER" },
    { modulo: "PAGOS", accion: "CREAR" },
    { modulo: "PLANES", accion: "VER" },
    { modulo: "CAJA", accion: "VER" },
    { modulo: "CAJA", accion: "CREAR" },
  ],
  ENTRENADOR: [
    { modulo: "MIEMBROS", accion: "VER" },
    { modulo: "PAGOS", accion: "VER" },
    { modulo: "PLANES", accion: "VER" },
  ],
};

export async function crearUsuarioAdmin(
  deps: CrearUsuarioAdminDeps,
  input: CrearUsuarioAdminInput
): Promise<UsuarioAdmin> {
  if (!deps.autorizacion.puedeCrearUsuarioConRol(input.solicitante.rol, input.rol)) {
    throw new NoAutorizadoError(input.solicitante.rol, input.rol);
  }

  const creado = await deps.usuarios.crear({
    organizacionId: input.organizacionId,
    sucursalId: input.sucursalId,
    nombre: input.nombre,
    email: input.email,
    passwordHash: input.passwordHash,
    rol: input.rol,
  });

  await deps.permisos.reemplazarTodos(creado.id, PERMISOS_POR_ROL[input.rol]);
  if (input.sucursalIds.length > 0) {
    await deps.usuarioSucursales.reemplazarTodas(creado.id, input.sucursalIds);
  }

  return creado;
}
```

Nota: `PERMISOS_POR_ROL` duplica la matriz del script de backfill de la Tarea 1 (`packages/db/backfillPermisosYSucursales.ts`) — es una duplicación deliberada, ya que `packages/db` (scripts standalone) no puede importar de `packages/domain` sin invertir la dirección de dependencia del monorepo. Si la matriz cambia en el futuro, hay que actualizar ambos lugares; se documenta con un comentario en el código.

- [ ] **Step 7: Commit**

```bash
git add packages/domain/use-cases
git commit -m "feat: agrega casos de uso de gestión de Usuario (listar/obtener/actualizar/sucursales/permisos)"
```

---

### Task 8: Actualizar consumidores existentes de AuthorizationService/CrearUsuarioAdmin — API route y Server Actions de Caja/Pagos

**Files:**
- Modify: `apps/web-admin/app/api/usuarios/route.ts`
- Modify: `apps/web-admin/app/(panel)/caja/actions.ts`
- Modify: `apps/web-admin/app/(panel)/pagos/actions.ts`
- Modify: `apps/web-admin/app/(panel)/miembros/actions.ts`

**Interfaces:**
- Consumes: `AuthorizationService` (nuevo constructor, Tarea 3); `PrismaPermisoRepository` (Tarea 3); las nuevas firmas de `abrirTurno`/`cerrarTurno`/`registrarPago`/`registrarEgreso`/`anularPago` (con `autorizacion` en deps, Tarea 4); `crearUsuarioAdmin` (nueva firma, Tarea 7).
- Produces: todos los consumidores existentes compilando contra las firmas nuevas — sin cambios de contrato hacia la UI que ya los invoca (Tareas 8 y 9 previas del plan de Caja).

- [ ] **Step 1: Modificar `apps/web-admin/app/api/usuarios/route.ts`**

Reemplazar el contenido completo por:

```ts
// app/api/usuarios/route.ts
// Crea un UsuarioAdmin nuevo — protegido por sesión. La regla de quién puede
// crear a quién vive en AuthorizationService (packages/domain), no aquí.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesion } from "@/lib/sesion";
import { PrismaUsuarioAdminRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaUsuarioAdminRepository";
import { PrismaPermisoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPermisoRepository";
import { PrismaUsuarioSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaUsuarioSucursalRepository";
import { BcryptPasswordHasher } from "@gym-app/infrastructure/auth/BcryptPasswordHasher";
import { AuthorizationService } from "@gym-app/domain/services/AuthorizationService";
import { crearUsuarioAdmin, NoAutorizadoError } from "@gym-app/domain/use-cases/CrearUsuarioAdmin";
import { listarUsuariosAdmin } from "@gym-app/domain/use-cases/ListarUsuariosAdmin";

export async function GET(req: NextRequest) {
  const usuario = await obtenerUsuarioDeSesion(req);
  if (!usuario) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const usuarios = await listarUsuariosAdmin(
    { usuarios: new PrismaUsuarioAdminRepository(prisma) },
    usuario.organizacionId
  );

  return NextResponse.json({ usuarios });
}

export async function POST(req: NextRequest) {
  try {
    const solicitante = await obtenerUsuarioDeSesion(req);

    if (!solicitante) {
      return NextResponse.json({ error: "No autenticado." }, { status: 401 });
    }

    const { nombre, email, password, rol, sucursalId, sucursalIds } = await req.json();

    if (!nombre || !email || !password || !rol) {
      return NextResponse.json(
        { error: "nombre, email, password y rol son requeridos." },
        { status: 400 }
      );
    }

    const hasher = new BcryptPasswordHasher();
    const passwordHash = await hasher.hash(password);

    const creado = await crearUsuarioAdmin(
      {
        usuarios: new PrismaUsuarioAdminRepository(prisma),
        autorizacion: new AuthorizationService(new PrismaPermisoRepository(prisma)),
        permisos: new PrismaPermisoRepository(prisma),
        usuarioSucursales: new PrismaUsuarioSucursalRepository(prisma),
      },
      {
        solicitante: { rol: solicitante.rol },
        organizacionId: solicitante.organizacionId,
        sucursalId: sucursalId ?? null,
        sucursalIds: sucursalIds ?? [],
        nombre,
        email,
        passwordHash,
        rol,
      }
    );

    return NextResponse.json(
      { id: creado.id, nombre: creado.nombre, email: creado.email, rol: creado.rol },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof NoAutorizadoError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("Error al crear usuario admin:", error);
    return NextResponse.json(
      { error: "Error interno al crear el usuario." },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Modificar `apps/web-admin/app/(panel)/caja/actions.ts`**

En cada una de las 4 Server Actions (`abrirTurnoAction`, `registrarEgresoAction`, `cerrarTurnoAction`, `anularPagoAction`), agregar `PrismaPermisoRepository` y `AuthorizationService` a los deps instanciados, y agregar `usuarioIdSolicitante`/`usuarioId` a los inputs donde la Tarea 4 los agregó. Por ejemplo, en `abrirTurnoAction`:

```ts
import { PrismaPermisoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPermisoRepository";
import { AuthorizationService } from "@gym-app/domain/services/AuthorizationService";
```

```ts
    await abrirTurno(
      {
        turnos: new PrismaTurnoRepository(prisma),
        sucursales: new PrismaSucursalRepository(prisma),
        autorizacion: new AuthorizationService(new PrismaPermisoRepository(prisma)),
      },
      {
        organizacionId: usuario.organizacionId,
        sucursalId,
        usuarioId: usuario.id,
        rolUsuario: usuario.rol,
        fondoInicialUSD,
        fondoInicialBs,
      }
    );
```

Repetir el mismo patrón (agregar `autorizacion: new AuthorizationService(new PrismaPermisoRepository(prisma))` a los deps) en `registrarEgresoAction` (agregando también `usuarioIdSolicitante: usuario.id` al input de `registrarEgreso`), `cerrarTurnoAction` (agregando `usuarioIdSolicitante: usuario.id` al input de `cerrarTurno`), y `anularPagoAction` (sin cambio de input adicional, ya usa `anuladoPorId: usuario.id`, que la Tarea 4 reutiliza).

- [ ] **Step 3: Modificar `apps/web-admin/app/(panel)/pagos/actions.ts`**

Agregar `autorizacion: new AuthorizationService(new PrismaPermisoRepository(prisma))` a los deps de `registrarPago` en `registrarPagoAction`, con los imports correspondientes.

- [ ] **Step 4: Modificar `apps/web-admin/app/(panel)/miembros/actions.ts`**

Mismo cambio en la llamada a `registrarPago` dentro de `crearMiembroAction` (agregar `autorizacion: new AuthorizationService(new PrismaPermisoRepository(prisma))` a los deps).

- [ ] **Step 5: Verificar que web-admin compila**

Run: `cd apps/web-admin && npx tsc --noEmit`
Expected: errores solo en `apps/web-admin/app/(panel)/usuarios/` (no existe todavía, se crea en la Tarea 9) — ningún otro error inesperado.

- [ ] **Step 6: Commit**

```bash
git add "apps/web-admin/app/api/usuarios/route.ts" "apps/web-admin/app/(panel)/caja/actions.ts" "apps/web-admin/app/(panel)/pagos/actions.ts" "apps/web-admin/app/(panel)/miembros/actions.ts"
git commit -m "refactor: actualiza consumidores de AuthorizationService/CrearUsuarioAdmin a las nuevas firmas"
```

---

### Task 9: Pantallas de Usuarios — `/usuarios`, `/usuarios/nuevo`, `/usuarios/[id]` con editor de permisos

**Files:**
- Create: `apps/web-admin/app/(panel)/usuarios/actions.ts`
- Create: `apps/web-admin/app/(panel)/usuarios/FormularioUsuario.tsx`
- Create: `apps/web-admin/app/(panel)/usuarios/FormularioPermisos.tsx`
- Create: `apps/web-admin/app/(panel)/usuarios/page.tsx`
- Create: `apps/web-admin/app/(panel)/usuarios/nuevo/page.tsx`
- Create: `apps/web-admin/app/(panel)/usuarios/[id]/page.tsx`

**Interfaces:**
- Consumes: todos los casos de uso de la Tarea 7; `ListarSucursales` (Plan 10); `PrismaUsuarioAdminRepository`, `PrismaUsuarioSucursalRepository`, `PrismaPermisoRepository`, `PrismaSucursalRepository`, `AuthorizationService`, `BcryptPasswordHasher` de `packages/infrastructure`; `Button`, `Input`, `Badge` de `@gym-app/ui/components/*`.
- Produces: pantalla `/usuarios` completa — no consumida por otras tareas.

- [ ] **Step 1: Crear `apps/web-admin/app/(panel)/usuarios/actions.ts`**

```ts
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaUsuarioAdminRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaUsuarioAdminRepository";
import { PrismaUsuarioSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaUsuarioSucursalRepository";
import { PrismaPermisoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPermisoRepository";
import { AuthorizationService } from "@gym-app/domain/services/AuthorizationService";
import { BcryptPasswordHasher } from "@gym-app/infrastructure/auth/BcryptPasswordHasher";
import { crearUsuarioAdmin, NoAutorizadoError } from "@gym-app/domain/use-cases/CrearUsuarioAdmin";
import {
  actualizarUsuarioAdmin,
  RolNoAutorizadoError as RolNoAutorizadoActualizar,
  UsuarioNoEncontradoError as UsuarioNoEncontradoActualizar,
} from "@gym-app/domain/use-cases/ActualizarUsuarioAdmin";
import {
  asignarSucursalesAUsuario,
  RolNoAutorizadoError as RolNoAutorizadoSucursales,
} from "@gym-app/domain/use-cases/AsignarSucursalesAUsuario";
import {
  actualizarPermisosUsuario,
  RolNoAutorizadoError as RolNoAutorizadoPermisos,
} from "@gym-app/domain/use-cases/ActualizarPermisosUsuario";
import type { ModuloPermiso, AccionPermiso } from "@gym-app/domain/entities/Permiso";
import type { RolUsuario } from "@gym-app/domain/entities/UsuarioAdmin";

export interface EstadoFormularioUsuario {
  error?: string;
}

const MODULOS: ModuloPermiso[] = ["MIEMBROS", "PAGOS", "PLANES", "CAJA", "USUARIOS", "SUCURSALES"];
const ACCIONES: AccionPermiso[] = ["VER", "CREAR", "EDITAR", "ELIMINAR"];

export async function crearUsuarioAction(
  _estadoPrevio: EstadoFormularioUsuario,
  formData: FormData
): Promise<EstadoFormularioUsuario> {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const nombre = formData.get("nombre")?.toString().trim();
  const email = formData.get("email")?.toString().trim();
  const password = formData.get("password")?.toString();
  const rol = formData.get("rol")?.toString() as RolUsuario | undefined;
  const sucursalIds = formData.getAll("sucursalIds").map((v) => v.toString());

  if (!nombre || !email || !password || !rol) {
    return { error: "Nombre, email, contraseña y rol son requeridos." };
  }

  try {
    const hasher = new BcryptPasswordHasher();
    const passwordHash = await hasher.hash(password);

    await crearUsuarioAdmin(
      {
        usuarios: new PrismaUsuarioAdminRepository(prisma),
        autorizacion: new AuthorizationService(new PrismaPermisoRepository(prisma)),
        permisos: new PrismaPermisoRepository(prisma),
        usuarioSucursales: new PrismaUsuarioSucursalRepository(prisma),
      },
      {
        solicitante: { rol: usuario.rol },
        organizacionId: usuario.organizacionId,
        sucursalId: sucursalIds[0] ?? null,
        sucursalIds,
        nombre,
        email,
        passwordHash,
        rol,
      }
    );
  } catch (error) {
    if (error instanceof NoAutorizadoError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/usuarios");
  redirect("/usuarios");
}

export async function actualizarUsuarioAction(
  id: string,
  _estadoPrevio: EstadoFormularioUsuario,
  formData: FormData
): Promise<EstadoFormularioUsuario> {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const nombre = formData.get("nombre")?.toString().trim();
  if (!nombre) {
    return { error: "El nombre es requerido." };
  }

  try {
    await actualizarUsuarioAdmin(
      { usuarios: new PrismaUsuarioAdminRepository(prisma) },
      { organizacionId: usuario.organizacionId, rolSolicitante: usuario.rol, id, cambios: { nombre } }
    );
  } catch (error) {
    if (error instanceof RolNoAutorizadoActualizar || error instanceof UsuarioNoEncontradoActualizar) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath(`/usuarios/${id}`);
  return {};
}

export async function actualizarSucursalesUsuarioAction(id: string, formData: FormData): Promise<void> {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const sucursalIds = formData.getAll("sucursalIds").map((v) => v.toString());

  await asignarSucursalesAUsuario(
    { usuarios: new PrismaUsuarioAdminRepository(prisma), usuarioSucursales: new PrismaUsuarioSucursalRepository(prisma) },
    { organizacionId: usuario.organizacionId, rolSolicitante: usuario.rol, usuarioId: id, sucursalIds }
  );

  revalidatePath(`/usuarios/${id}`);
}

export async function actualizarPermisosUsuarioAction(id: string, formData: FormData): Promise<void> {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const permisos = MODULOS.flatMap((modulo) =>
    ACCIONES.filter((accion) => formData.get(`permiso_${modulo}_${accion}`) === "on").map((accion) => ({
      modulo,
      accion,
    }))
  );

  await actualizarPermisosUsuario(
    { usuarios: new PrismaUsuarioAdminRepository(prisma), permisos: new PrismaPermisoRepository(prisma) },
    { organizacionId: usuario.organizacionId, rolSolicitante: usuario.rol, usuarioId: id, permisos }
  );

  revalidatePath(`/usuarios/${id}`);
}

export async function darDeBajaUsuarioAction(id: string): Promise<void> {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  await actualizarUsuarioAdmin(
    { usuarios: new PrismaUsuarioAdminRepository(prisma) },
    { organizacionId: usuario.organizacionId, rolSolicitante: usuario.rol, id, cambios: { activo: false } }
  );

  revalidatePath("/usuarios");
}

export async function reactivarUsuarioAction(id: string): Promise<void> {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  await actualizarUsuarioAdmin(
    { usuarios: new PrismaUsuarioAdminRepository(prisma) },
    { organizacionId: usuario.organizacionId, rolSolicitante: usuario.rol, id, cambios: { activo: true } }
  );

  revalidatePath("/usuarios");
}
```

Nota: los errores `RolNoAutorizadoSucursales`/`RolNoAutorizadoPermisos` quedan importados para el tipo pero las actions `actualizarSucursalesUsuarioAction`/`actualizarPermisosUsuarioAction` no los atrapan explícitamente (son `void`, invocadas desde un `<form>` simple sin `useActionState`, siguiendo el mismo patrón que `darDeBajaPlanAction` en Planes) — si el caso de uso lanza, el error se propaga como error 500 de Next.js, aceptable porque solo un DUEÑO llega a esta pantalla y el botón nunca se muestra a otro rol.

- [ ] **Step 2: Crear `apps/web-admin/app/(panel)/usuarios/FormularioUsuario.tsx`**

```tsx
"use client";

import { useActionState } from "react";
import { Button } from "@gym-app/ui/components/Button";
import { Input } from "@gym-app/ui/components/Input";
import type { EstadoFormularioUsuario } from "./actions";
import type { SucursalResumen } from "@gym-app/domain/entities/SucursalResumen";

export function FormularioUsuario({
  accion,
  sucursales,
}: {
  accion: (estado: EstadoFormularioUsuario, formData: FormData) => Promise<EstadoFormularioUsuario>;
  sucursales: SucursalResumen[];
}) {
  const [estado, enviar, enviando] = useActionState(accion, {});

  return (
    <form action={enviar} className="flex flex-col gap-4">
      {estado.error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{estado.error}</p>}

      <Input name="nombre" label="Nombre" required />
      <Input name="email" label="Email" type="email" required />
      <Input name="password" label="Contraseña" type="password" required />

      <label className="flex flex-col gap-1 text-sm text-neutral-700">
        Rol
        <select name="rol" required className="rounded border border-neutral-300 px-3 py-2">
          <option value="">Seleccioná un rol</option>
          <option value="DUENO">Dueño</option>
          <option value="GERENTE">Gerente</option>
          <option value="RECEPCION">Recepción</option>
          <option value="ENTRENADOR">Entrenador</option>
        </select>
      </label>

      <fieldset className="flex flex-col gap-2 rounded border border-neutral-300 p-3">
        <legend className="px-1 text-sm text-neutral-700">Sucursales asignadas (vacío = toda la organización)</legend>
        {sucursales.map((sucursal) => (
          <label key={sucursal.id} className="flex items-center gap-2 text-sm text-neutral-700">
            <input type="checkbox" name="sucursalIds" value={sucursal.id} />
            {sucursal.nombre}
          </label>
        ))}
      </fieldset>

      <Button type="submit" disabled={enviando}>
        {enviando ? "Creando..." : "Crear usuario"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 3: Crear `apps/web-admin/app/(panel)/usuarios/FormularioPermisos.tsx`**

```tsx
"use client";

import { Button } from "@gym-app/ui/components/Button";
import type { ModuloPermiso, AccionPermiso, Permiso } from "@gym-app/domain/entities/Permiso";

const MODULOS: { valor: ModuloPermiso; etiqueta: string }[] = [
  { valor: "MIEMBROS", etiqueta: "Miembros" },
  { valor: "PAGOS", etiqueta: "Pagos" },
  { valor: "PLANES", etiqueta: "Planes" },
  { valor: "CAJA", etiqueta: "Caja" },
  { valor: "USUARIOS", etiqueta: "Usuarios" },
  { valor: "SUCURSALES", etiqueta: "Sucursales" },
];

const ACCIONES: { valor: AccionPermiso; etiqueta: string }[] = [
  { valor: "VER", etiqueta: "Ver" },
  { valor: "CREAR", etiqueta: "Crear" },
  { valor: "EDITAR", etiqueta: "Editar" },
  { valor: "ELIMINAR", etiqueta: "Eliminar" },
];

export function FormularioPermisos({
  accion,
  permisosActuales,
}: {
  accion: (formData: FormData) => Promise<void>;
  permisosActuales: Permiso[];
}) {
  const tiene = (modulo: ModuloPermiso, acc: AccionPermiso) =>
    permisosActuales.some((p) => p.modulo === modulo && p.accion === acc);

  return (
    <form action={accion} className="flex flex-col gap-4">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b text-neutral-500">
            <th className="py-2">Módulo</th>
            {ACCIONES.map((a) => (
              <th key={a.valor} className="py-2 text-center">
                {a.etiqueta}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MODULOS.map((m) => (
            <tr key={m.valor} className="border-b">
              <td className="py-2">{m.etiqueta}</td>
              {ACCIONES.map((a) => (
                <td key={a.valor} className="py-2 text-center">
                  <input
                    type="checkbox"
                    name={`permiso_${m.valor}_${a.valor}`}
                    defaultChecked={tiene(m.valor, a.valor)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <Button type="submit">Guardar permisos</Button>
    </form>
  );
}
```

- [ ] **Step 4: Crear `apps/web-admin/app/(panel)/usuarios/page.tsx`**

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaUsuarioAdminRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaUsuarioAdminRepository";
import { PrismaPermisoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPermisoRepository";
import { listarUsuariosAdmin } from "@gym-app/domain/use-cases/ListarUsuariosAdmin";
import { Button } from "@gym-app/ui/components/Button";
import { Badge } from "@gym-app/ui/components/Badge";

export default async function PaginaUsuarios() {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const permisos = new PrismaPermisoRepository(prisma);
  const puedeVer = await permisos.tiene(usuario.id, "USUARIOS", "VER");
  if (!puedeVer) redirect("/miembros");

  const puedeCrear = await permisos.tiene(usuario.id, "USUARIOS", "CREAR");
  const usuarios = await listarUsuariosAdmin(
    { usuarios: new PrismaUsuarioAdminRepository(prisma) },
    usuario.organizacionId
  );

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Usuarios</h1>
        {puedeCrear && (
          <Link href="/usuarios/nuevo">
            <Button>Nuevo usuario</Button>
          </Link>
        )}
      </div>

      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b text-sm text-neutral-500">
            <th className="py-2">Nombre</th>
            <th className="py-2">Email</th>
            <th className="py-2">Rol</th>
            <th className="py-2">Estado</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {usuarios.map((u) => (
            <tr key={u.id} className="border-b">
              <td className="py-2">{u.nombre || "—"}</td>
              <td className="py-2">{u.email}</td>
              <td className="py-2">{u.rol}</td>
              <td className="py-2">
                <Badge tono={u.activo ? "verde" : "gris"}>{u.activo ? "Activo" : "Inactivo"}</Badge>
              </td>
              <td className="py-2">
                <Link href={`/usuarios/${u.id}`} className="text-sm font-medium text-blue-600 hover:underline">
                  Editar
                </Link>
              </td>
            </tr>
          ))}

          {usuarios.length === 0 && (
            <tr>
              <td colSpan={5} className="py-8 text-center text-neutral-500">
                Todavía no hay usuarios.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 5: Crear `apps/web-admin/app/(panel)/usuarios/nuevo/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaPermisoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPermisoRepository";
import { PrismaSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSucursalRepository";
import { listarSucursales } from "@gym-app/domain/use-cases/ListarSucursales";
import { FormularioUsuario } from "../FormularioUsuario";
import { crearUsuarioAction } from "../actions";

export default async function PaginaNuevoUsuario() {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const permisos = new PrismaPermisoRepository(prisma);
  const puedeCrear = await permisos.tiene(usuario.id, "USUARIOS", "CREAR");
  if (!puedeCrear) redirect("/usuarios");

  const sucursales = await listarSucursales(
    { sucursales: new PrismaSucursalRepository(prisma) },
    usuario.organizacionId
  );

  return (
    <div className="p-8">
      <h1 className="mb-6 text-2xl font-semibold">Nuevo usuario</h1>
      <FormularioUsuario accion={crearUsuarioAction} sucursales={sucursales} />
    </div>
  );
}
```

- [ ] **Step 6: Crear `apps/web-admin/app/(panel)/usuarios/[id]/page.tsx`**

```tsx
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaUsuarioAdminRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaUsuarioAdminRepository";
import { PrismaUsuarioSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaUsuarioSucursalRepository";
import { PrismaPermisoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPermisoRepository";
import { PrismaSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSucursalRepository";
import { obtenerUsuarioAdmin, UsuarioNoEncontradoError } from "@gym-app/domain/use-cases/ObtenerUsuarioAdmin";
import { listarSucursales } from "@gym-app/domain/use-cases/ListarSucursales";
import { FormularioPermisos } from "../FormularioPermisos";
import {
  actualizarUsuarioAction,
  actualizarSucursalesUsuarioAction,
  actualizarPermisosUsuarioAction,
  darDeBajaUsuarioAction,
  reactivarUsuarioAction,
} from "../actions";
import { Button } from "@gym-app/ui/components/Button";
import { Input } from "@gym-app/ui/components/Input";

export default async function PaginaEditarUsuario({ params }: { params: Promise<{ id: string }> }) {
  const usuarioSesion = await obtenerUsuarioDeSesionActual();
  if (!usuarioSesion) redirect("/login");

  const permisos = new PrismaPermisoRepository(prisma);
  const puedeVer = await permisos.tiene(usuarioSesion.id, "USUARIOS", "VER");
  if (!puedeVer) redirect("/usuarios");

  const { id } = await params;

  let detalle;
  try {
    detalle = await obtenerUsuarioAdmin(
      {
        usuarios: new PrismaUsuarioAdminRepository(prisma),
        usuarioSucursales: new PrismaUsuarioSucursalRepository(prisma),
        permisos,
      },
      { organizacionId: usuarioSesion.organizacionId, id }
    );
  } catch (error) {
    if (error instanceof UsuarioNoEncontradoError) notFound();
    throw error;
  }

  const sucursales = await listarSucursales(
    { sucursales: new PrismaSucursalRepository(prisma) },
    usuarioSesion.organizacionId
  );

  const accionActualizar = actualizarUsuarioAction.bind(null, id);
  const accionSucursales = actualizarSucursalesUsuarioAction.bind(null, id);
  const accionPermisos = actualizarPermisosUsuarioAction.bind(null, id);

  return (
    <div className="flex flex-col gap-8 p-8">
      <h1 className="text-2xl font-semibold">Editar usuario</h1>

      <form action={accionActualizar} className="flex max-w-md flex-col gap-4">
        <Input name="nombre" label="Nombre" required defaultValue={detalle.usuario.nombre} />
        <p className="text-sm text-neutral-500">
          Email: {detalle.usuario.email} · Rol: {detalle.usuario.rol}
        </p>
        <Button type="submit">Guardar nombre</Button>
      </form>

      <form action={accionSucursales} className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-neutral-900">Sucursales asignadas</h2>
        {sucursales.map((sucursal) => (
          <label key={sucursal.id} className="flex items-center gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              name="sucursalIds"
              value={sucursal.id}
              defaultChecked={detalle.sucursalIds.includes(sucursal.id)}
            />
            {sucursal.nombre}
          </label>
        ))}
        <Button type="submit">Guardar sucursales</Button>
      </form>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-neutral-900">Permisos</h2>
        <FormularioPermisos accion={accionPermisos} permisosActuales={detalle.permisos} />
      </div>

      <form action={detalle.usuario.activo ? darDeBajaUsuarioAction.bind(null, id) : reactivarUsuarioAction.bind(null, id)}>
        <Button type="submit">{detalle.usuario.activo ? "Dar de baja" : "Reactivar"}</Button>
      </form>
    </div>
  );
}
```

- [ ] **Step 7: Verificar que web-admin compila limpio**

Run: `cd apps/web-admin && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 8: Commit**

```bash
git add "apps/web-admin/app/(panel)/usuarios"
git commit -m "feat: agrega la pantalla de gestión de Usuarios con editor de permisos y sucursales"
```

---

### Task 10: Build completo, verificación manual y documentación

**Files:**
- No se crean ni modifican archivos de código — tarea de verificación y documentación.

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: confirmación de que el monorepo compila y arranca; `docs/ROADMAP.md`/`docs/adr/handoff.md` actualizados.

- [ ] **Step 1: Build completo del monorepo**

Run: `cd /c/dev/gym-app && npx turbo run build --filter=web-admin`
Expected: build exitoso, sin errores de tipo. Rutas nuevas esperadas: `/sucursales`, `/sucursales/nuevo`, `/sucursales/[id]`, `/usuarios`, `/usuarios/nuevo`, `/usuarios/[id]`, además de todas las ya existentes.

- [ ] **Step 2: Prueba manual end-to-end (responsabilidad del usuario)**

Con un usuario DUEÑO logueado en el navegador:
1. Ir a `/sucursales` → crear una sucursal nueva, editarla, dar de baja y reactivar.
2. Ir a `/usuarios` → crear un usuario RECEPCION asignado a una sola sucursal, confirmar que sus permisos por defecto coinciden con la matriz (Miembros ver/crear/editar, Pagos ver/crear, Planes ver, Caja ver/crear).
3. Editar los permisos de ese usuario desde `/usuarios/[id]` — quitarle "Crear" en Pagos, guardar, y confirmar (logueándose como ese usuario o revisando el caso de uso) que ya no puede registrar pagos.
4. Crear un usuario GERENTE con 2 sucursales asignadas, confirmar en la base de datos (o en la pantalla) que `UsuarioSucursal` tiene 2 filas para ese usuario.
5. Con un usuario RECEPCION/ENTRENADOR (sin permiso `USUARIOS.VER`), confirmar que al entrar a `/usuarios` es redirigido a `/miembros`.
6. Dar de baja un usuario y confirmar que ya no puede iniciar sesión (verificar el flujo de login existente, sin cambios en esta fase salvo que ahora `activo: false` debería bloquear el acceso — **nota:** si `ValidarSesion`/`IniciarSesion` no chequean `activo` hoy, este es un gap a señalar como pendiente, no a corregir en este plan).

Expected: cada paso se comporta como se describe; documentar cualquier discrepancia.

- [ ] **Step 3: Documentar hallazgos**

Si el Step 2.6 revela que dar de baja un usuario no bloquea su login (`ValidarSesion` no chequea `UsuarioAdmin.activo`), anotarlo en `docs/ROADMAP.md` como pendiente explícito — es un gap real pero fuera del alcance de "gestión de usuarios" tal como se definió en la spec (que no mencionó login/sesión).

- [ ] **Step 4: Actualizar `docs/ROADMAP.md` y `docs/adr/handoff.md`**

Agregar una sección "Plan 14 — Administración de Organización (Sucursales, Usuarios, Permisos granulares)" resumiendo lo entregado y cualquier pendiente detectado en el Step 3.

- [ ] **Step 5: Commit**

```bash
git add docs/ROADMAP.md docs/adr/handoff.md
git commit -m "docs: registra el Plan 14 (Administración de Organización) como completo"
```

## Verification

1. `cd apps/web-admin && npx tsc --noEmit` — sin errores (Tareas 8-9).
2. `cd /c/dev/gym-app && npx turbo run build --filter=web-admin` — build exitoso (Tarea 10).
3. Prueba manual end-to-end descrita en la Tarea 10, Step 2.
4. Revisión final de todo el branch (integración cruzada) antes de dar el plan por cerrado — mismo patrón que el Plan 13, dado que este plan también toca autorización/seguridad de forma transversal (5 casos de uso migrados + 2 pantallas nuevas con control de acceso).
