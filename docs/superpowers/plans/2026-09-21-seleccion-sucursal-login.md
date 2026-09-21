# Selección de sucursal al iniciar sesión — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cualquier usuario que vea más de una sucursal elige con cuál trabaja en un segundo paso del login (botones, no `<select>`), esa elección queda fija en la sesión (`sucursalActivaId`), y **toda** la app (Miembros, Caja, Pagos) deja de leer `usuario.sucursalId` (columna fija del usuario) para pasar a leer siempre `sucursalActivaId` — un solo camino de código, sin excepciones, para que cualquier panel nuevo que se agregue después (ej. "Sala de entrenamiento") herede el mismo patrón sin tener que recordar nada especial.

**Architecture:** `obtenerUsuarioDeSesion`/`obtenerUsuarioDeSesionActual` — las dos funciones que ya llaman las 41 páginas/actions protegidas del panel — cambian su forma de retorno de `UsuarioAdmin | null` a `{ usuario: UsuarioAdmin; sucursalActivaId: string } | null`. Esto es una ruptura de tipo deliberada y total: rompe compilación en los 41 call sites, no solo en los ~9 que usan `sucursalId` — se corrige cada uno en este mismo plan (la mayoría con un cambio de una línea: `const usuario = ...` → `const { usuario } = ...`). El login se parte en dos pasos: `POST /api/auth/login` valida credenciales y, si el usuario ve más de una sucursal, responde con la lista (sin crear sesión todavía) en vez de loguear directo; un nuevo `POST /api/auth/login/sucursal` recibe la sucursal elegida (re-enviando las credenciales) y recién ahí crea la `Sesion` con `sucursalActivaId` puesto. La lógica de "sucursales visibles para este usuario" — hoy duplicada palabra por palabra en `obtenerSucursalesVisiblesParaTurno` (caja) y `obtenerSucursalesVisiblesParaMiembro` (miembros) — se consolida en un único caso de uso de dominio, reutilizado también por el login.

**Tech Stack:** Next.js App Router (Server Components + Server Actions + Route Handlers), Prisma (driver adapter `@prisma/adapter-pg`), TypeScript, arquitectura hexagonal (`packages/domain` sin dependencias de framework).

**Spec:** `docs/superpowers/specs/2026-09-21-seleccion-sucursal-login-design.md`

## Global Constraints

- Reglas de `CLAUDE.md` del repo (NO NEGOCIABLES, aplican a cada tarea):
  - Revisar el código existente antes de crear algo nuevo; cero redundancia (ver Task 2 — consolida dos funciones duplicadas en vez de crear una tercera).
  - Cambios mínimos: solo el código estrictamente necesario.
  - No usar Chrome DevTools MCP salvo pedido explícito — usar typecheck, scripts `tsx`, y `/run` para verificación.
  - Commits: SIN firmas/atribución de ningún tipo (ni Co-Authored-By ni nada similar), en español, SOLO una línea de resumen (sin cuerpo, sin líneas en blanco debajo).
- No hay framework de tests en el repo — cada tarea se verifica con scripts `tsx` de un solo uso contra la base real (se documentan y se borran al final), más typecheck, más verificación manual con `/run` donde haya UI.
- `packages/domain` no puede importar nada de `apps/web-admin`.
- Mensajes de usuario en español, mismo tono que el resto del código.
- Comentarios explican el *por qué*, no el *qué*.
- **Regla de ruptura total, no parcial:** ninguna tarea debe dejar una función con dos formas de retorno posibles según el caso (ej. "devuelve `Turno | null` si hay una sola sucursal, `{turno, sucursalActivaId}` si hay más de una"). Cada función cambia de forma una sola vez, para todos los casos, en la tarea que la toca.

---

### Task 1: Dominio — `Sesion.sucursalActivaId`, `ISesionRepository`, `IniciarSesion`, `ValidarSesion`

**Files:**
- Modify: `packages/domain/entities/Sesion.ts`
- Modify: `packages/domain/ports/ISesionRepository.ts`
- Modify: `packages/domain/use-cases/IniciarSesion.ts`
- Modify: `packages/domain/use-cases/ValidarSesion.ts`
- Modify: `packages/infrastructure/persistence/prisma/PrismaSesionRepository.ts`
- Create: migración de Prisma para la columna nueva

**Interfaces:**
- Consumes: nada de tareas anteriores (primera tarea del plan).
- Produces: `Sesion.sucursalActivaId: string`; `ISesionRepository.crear(datos: { usuarioId: string; token: string; expiraEn: Date; sucursalActivaId: string })`; `iniciarSesion()` recibe `sucursalActivaId` en su input y lo pasa al repositorio; `validarSesion()` devuelve `{ usuario: UsuarioAdmin; sucursalActivaId: string } | null` en vez de `UsuarioAdmin | null` — **esta es la forma que consumen las Tasks 3 y 4**, no cambia después.

- [ ] **Step 1: Migración de Prisma**

En `packages/db/prisma/schema.prisma`, modificar el modelo `Sesion`:

```prisma
model Sesion {
  id              String       @id @default(cuid())
  token           String       @unique
  usuarioId       String
  usuario         UsuarioAdmin @relation(fields: [usuarioId], references: [id])
  sucursalActivaId String?
  sucursalActiva  Sucursal?    @relation(fields: [sucursalActivaId], references: [id])
  expiraEn        DateTime
  createdAt       DateTime     @default(now())
}
```

(Nullable a nivel de columna únicamente por seguridad de migración — filas de `Sesion` ya existentes no tienen valor. El código de aplicación, desde el Step 3 de esta tarea en adelante, nunca crea una `Sesion` sin `sucursalActivaId`.)

En el modelo `Sucursal`, agregar la relación inversa (Prisma la exige si `Sesion.sucursalActiva` referencia `Sucursal`):

```prisma
  sesiones  Sesion[]
```

Run: `cd packages/db && npx prisma migrate dev --name sesion_sucursal_activa`
Expected: crea el archivo de migración y lo aplica contra la base de datos real (`DATABASE_URL` de `.env`), sin error. Confirmar que el archivo generado en `packages/db/prisma/migrations/` solo agrega la columna nullable y la FK — no debe tocar ninguna otra tabla.

- [ ] **Step 2: `Sesion` entity y `ISesionRepository`**

En `packages/domain/entities/Sesion.ts`:

```typescript
export interface Sesion {
  id: string;
  token: string;
  usuarioId: string;
  sucursalActivaId: string;
  expiraEn: Date;
}
```

En `packages/domain/ports/ISesionRepository.ts`:

```typescript
import { Sesion } from "../entities/Sesion";

export interface ISesionRepository {
  crear(datos: { usuarioId: string; token: string; expiraEn: Date; sucursalActivaId: string }): Promise<Sesion>;
  buscarPorToken(token: string): Promise<Sesion | null>;
  eliminarPorToken(token: string): Promise<void>;
}
```

- [ ] **Step 3: `PrismaSesionRepository`**

En `packages/infrastructure/persistence/prisma/PrismaSesionRepository.ts`, reemplazar el archivo completo:

```typescript
import type { PrismaClient } from "@gym-app/db/generated/prisma/client";
import type { ISesionRepository } from "@gym-app/domain/ports/ISesionRepository";
import type { Sesion } from "@gym-app/domain/entities/Sesion";

function mapear(fila: { id: string; token: string; usuarioId: string; sucursalActivaId: string | null; expiraEn: Date }): Sesion {
  // sucursalActivaId es NOT NULL a nivel de aplicación desde este plan en
  // adelante (la columna es nullable solo por la migración de filas
  // viejas) — el "!" es seguro para cualquier sesión creada por
  // ISesionRepository.crear(), que siempre lo exige.
  return { id: fila.id, token: fila.token, usuarioId: fila.usuarioId, sucursalActivaId: fila.sucursalActivaId!, expiraEn: fila.expiraEn };
}

export class PrismaSesionRepository implements ISesionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async crear(datos: { usuarioId: string; token: string; expiraEn: Date; sucursalActivaId: string }): Promise<Sesion> {
    const sesion = await this.prisma.sesion.create({ data: datos });
    return mapear(sesion);
  }

  async buscarPorToken(token: string): Promise<Sesion | null> {
    const sesion = await this.prisma.sesion.findUnique({ where: { token } });
    if (!sesion) return null;
    return mapear(sesion);
  }

  async eliminarPorToken(token: string): Promise<void> {
    // deleteMany en vez de delete: un logout de un token ya vencido/inexistente
    // no debe lanzar error (idempotente).
    await this.prisma.sesion.deleteMany({ where: { token } });
  }
}
```

- [ ] **Step 4: `IniciarSesion.ts`**

En `packages/domain/use-cases/IniciarSesion.ts`, modificar `IniciarSesionInput` y el cuerpo de `iniciarSesion`:

```typescript
export interface IniciarSesionInput {
  email: string;
  password: string;
  sucursalActivaId: string;
}
```

Y en el cuerpo de la función, reemplazar:

```typescript
  await deps.sesiones.crear({ usuarioId: credenciales.usuario.id, token, expiraEn });
```

por:

```typescript
  await deps.sesiones.crear({ usuarioId: credenciales.usuario.id, token, expiraEn, sucursalActivaId: input.sucursalActivaId });
```

- [ ] **Step 5: `ValidarSesion.ts`**

Reemplazar el archivo completo:

```typescript
import { ISesionRepository } from "../ports/ISesionRepository";
import { IUsuarioAdminRepository } from "../ports/IUsuarioAdminRepository";
import { UsuarioAdmin } from "../entities/UsuarioAdmin";

export interface ValidarSesionDeps {
  sesiones: ISesionRepository;
  usuarios: IUsuarioAdminRepository;
}

export interface SesionValidada {
  usuario: UsuarioAdmin;
  sucursalActivaId: string;
}

export async function validarSesion(deps: ValidarSesionDeps, token: string): Promise<SesionValidada | null> {
  const sesion = await deps.sesiones.buscarPorToken(token);

  if (!sesion) {
    return null;
  }

  if (sesion.expiraEn <= new Date()) {
    await deps.sesiones.eliminarPorToken(token);
    return null;
  }

  const usuario = await deps.usuarios.buscarPorIdSinOrganizacion(sesion.usuarioId);
  if (!usuario) {
    return null;
  }

  return { usuario, sucursalActivaId: sesion.sucursalActivaId };
}
```

- [ ] **Step 6: Escribir y correr el script de verificación**

Crear `packages/db/_verificar-sesion-sucursal.ts`:

```typescript
import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";
import path from "node:path";

config({ path: path.resolve(__dirname, "../../.env") });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const { PrismaSesionRepository } = await import("../infrastructure/persistence/prisma/PrismaSesionRepository");
  const { PrismaUsuarioAdminRepository } = await import("../infrastructure/persistence/prisma/PrismaUsuarioAdminRepository");
  const { iniciarSesion } = await import("../domain/use-cases/IniciarSesion");
  const { validarSesion } = await import("../domain/use-cases/ValidarSesion");
  const { BcryptPasswordHasher } = await import("../infrastructure/auth/BcryptPasswordHasher");

  const usuarioRepo = new PrismaUsuarioAdminRepository(prisma);
  const sesionRepo = new PrismaSesionRepository(prisma);

  const cualquiera = await prisma.usuarioAdmin.findFirstOrThrow();
  const sucursal = await prisma.sucursal.findFirstOrThrow({ where: { organizacionId: cualquiera.organizacionId } });

  // No conocemos la password en texto plano de un usuario real — probamos
  // directo contra el repositorio de sesiones en vez de pasar por
  // iniciarSesion() (que exige password), para no depender de datos de
  // prueba específicos.
  const token = "token-de-prueba-" + Date.now();
  await sesionRepo.crear({ usuarioId: cualquiera.id, token, expiraEn: new Date(Date.now() + 60_000), sucursalActivaId: sucursal.id });

  const resultado = await validarSesion({ sesiones: sesionRepo, usuarios: usuarioRepo }, token);
  console.log("sucursalActivaId ->", resultado?.sucursalActivaId, "esperado ->", sucursal.id);
  console.log("usuario.id ->", resultado?.usuario.id, "esperado ->", cualquiera.id);

  await sesionRepo.eliminarPorToken(token);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

Run: `cd packages/db && npx tsx --tsconfig ../../apps/web-admin/tsconfig.json _verificar-sesion-sucursal.ts`
Expected: `sucursalActivaId -> <id real> esperado -> <mismo id>` y `usuario.id -> <id real> esperado -> <mismo id>`.

- [ ] **Step 7: Borrar el script de verificación**

Run: `rm packages/db/_verificar-sesion-sucursal.ts`

- [ ] **Step 8: Typecheck (se esperan errores en `lib/sesion.ts` y en TODOS sus 41 consumidores — no arreglarlos acá)**

Run: `npx tsc --noEmit -p apps/web-admin/tsconfig.json`
Expected: errores en `apps/web-admin/lib/sesion.ts` (porque `validarSesion` ya no devuelve `UsuarioAdmin | null`) y en cascada en cada archivo que llama `obtenerUsuarioDeSesion`/`obtenerUsuarioDeSesionActual` — se corrigen en las Tasks 3-7. Confirmar que los únicos errores están en `packages/domain`/`packages/infrastructure` (ninguno) y en `apps/web-admin` (todos los que ya se esperaban).

- [ ] **Step 9: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations packages/domain/entities/Sesion.ts packages/domain/ports/ISesionRepository.ts packages/domain/use-cases/IniciarSesion.ts packages/domain/use-cases/ValidarSesion.ts packages/infrastructure/persistence/prisma/PrismaSesionRepository.ts
git commit -m "feat: agrega sucursalActivaId a la sesion, fijada al iniciar sesion"
```

---

### Task 2: Consolidar "sucursales visibles" en un caso de uso de dominio

**Files:**
- Create: `packages/domain/use-cases/ObtenerSucursalesVisiblesParaUsuario.ts`
- Modify: `apps/web-admin/app/(panel)/caja/obtenerSucursalesVisiblesParaTurno.ts` (pasa a ser wrapper)
- Modify: `apps/web-admin/app/(panel)/miembros/obtenerSucursalesVisibles.ts` (pasa a ser wrapper)

**Interfaces:**
- Consumes: `UsuarioAdmin` (sin cambios); `ISucursalRepository.listarPorOrganizacion`; `IUsuarioSucursalRepository.listarSucursalIdsPorUsuario`.
- Produces: `obtenerSucursalesVisiblesParaUsuario(deps: { sucursales: ISucursalRepository; usuarioSucursales: IUsuarioSucursalRepository }, usuario: UsuarioAdmin): Promise<SucursalResumen[]>` — **esta es la función que consume Task 3** (login) directamente desde domain. Los dos wrappers en `apps/web-admin` mantienen sus nombres y firmas actuales (`obtenerSucursalesVisiblesParaTurno(usuario)`, `obtenerSucursalesVisiblesParaMiembro(usuario)`) para no romper sus consumidores existentes (`caja/page.tsx`, `caja/obtenerTurnoAbiertoParaUsuario.ts`, `api/caja/ultimo-cierre/route.ts`, `pagos/nuevo/page.tsx`, `miembros/nuevo/page.tsx`, `miembros/[id]/page.tsx` — confirmado por grep antes de este plan).

- [ ] **Step 1: Crear el caso de uso de dominio**

Crear `packages/domain/use-cases/ObtenerSucursalesVisiblesParaUsuario.ts`:

```typescript
import { ISucursalRepository } from "../ports/ISucursalRepository";
import { IUsuarioSucursalRepository } from "../ports/IUsuarioSucursalRepository";
import { SucursalResumen } from "../entities/SucursalResumen";
import { UsuarioAdmin } from "../entities/UsuarioAdmin";

// Las sucursales que un usuario puede ver/operar: SOCIO ve todas las de la
// organización; el resto de roles, solo las que tiene asignadas
// (UsuarioSucursal). Antes esta lógica estaba duplicada palabra por
// palabra en apps/web-admin (obtenerSucursalesVisiblesParaTurno en caja/ y
// obtenerSucursalesVisiblesParaMiembro en miembros/) — se consolida acá
// porque login también la necesita (ver plan de selección de sucursal al
// iniciar sesión) y domain no puede importar de apps/web-admin.
export async function obtenerSucursalesVisiblesParaUsuario(
  deps: { sucursales: ISucursalRepository; usuarioSucursales: IUsuarioSucursalRepository },
  usuario: UsuarioAdmin
): Promise<SucursalResumen[]> {
  const todas = await deps.sucursales.listarPorOrganizacion(usuario.organizacionId);

  if (usuario.rol === "SOCIO") {
    return todas;
  }

  const idsAsignados = new Set(await deps.usuarioSucursales.listarSucursalIdsPorUsuario(usuario.id));

  return todas.filter((sucursal) => idsAsignados.has(sucursal.id));
}
```

Nota: `ISucursalRepository.listarPorOrganizacion` ya devuelve `SucursalResumen[]` (no `Sucursal[]`) — confirmado leyendo `packages/domain/ports/ISucursalRepository.ts` antes de este plan, así que no hace falta ningún caso de uso `listarSucursales` intermedio dentro de esta función (a diferencia de las dos implementaciones viejas en `apps/web-admin`, que sí pasaban por el caso de uso `ListarSucursales` — acá se llama al repositorio directo porque ya estamos en un caso de uso de dominio).

- [ ] **Step 2: Convertir `obtenerSucursalesVisiblesParaTurno.ts` en wrapper**

Reemplazar el archivo completo `apps/web-admin/app/(panel)/caja/obtenerSucursalesVisiblesParaTurno.ts`:

```typescript
import { prisma } from "@/lib/prisma";
import { PrismaSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSucursalRepository";
import { PrismaUsuarioSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaUsuarioSucursalRepository";
import { obtenerSucursalesVisiblesParaUsuario } from "@gym-app/domain/use-cases/ObtenerSucursalesVisiblesParaUsuario";
import type { SucursalResumen } from "@gym-app/domain/entities/SucursalResumen";
import type { UsuarioAdmin } from "@gym-app/domain/entities/UsuarioAdmin";

// Wrapper fino: arma los repositorios Prisma y delega al caso de uso de
// dominio (ver ObtenerSucursalesVisiblesParaUsuario — consolida lo que
// antes estaba duplicado acá y en miembros/obtenerSucursalesVisibles.ts).
// Se mantiene este archivo/nombre para no romper los imports existentes
// en caja/page.tsx, caja/obtenerTurnoAbiertoParaUsuario.ts y
// api/caja/ultimo-cierre/route.ts.
export async function obtenerSucursalesVisiblesParaTurno(usuario: UsuarioAdmin): Promise<SucursalResumen[]> {
  return obtenerSucursalesVisiblesParaUsuario(
    { sucursales: new PrismaSucursalRepository(prisma), usuarioSucursales: new PrismaUsuarioSucursalRepository(prisma) },
    usuario
  );
}
```

- [ ] **Step 3: Convertir `obtenerSucursalesVisibles.ts` (miembros) en wrapper**

Reemplazar el archivo completo `apps/web-admin/app/(panel)/miembros/obtenerSucursalesVisibles.ts`:

```typescript
import { prisma } from "@/lib/prisma";
import { PrismaSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSucursalRepository";
import { PrismaUsuarioSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaUsuarioSucursalRepository";
import { obtenerSucursalesVisiblesParaUsuario } from "@gym-app/domain/use-cases/ObtenerSucursalesVisiblesParaUsuario";
import type { SucursalResumen } from "@gym-app/domain/entities/SucursalResumen";
import type { UsuarioAdmin } from "@gym-app/domain/entities/UsuarioAdmin";

// Wrapper fino: ver caja/obtenerSucursalesVisiblesParaTurno.ts (mismo
// patrón, misma consolidación en ObtenerSucursalesVisiblesParaUsuario).
// Se mantiene este archivo/nombre para no romper los imports existentes
// en pagos/nuevo/page.tsx, miembros/nuevo/page.tsx y miembros/[id]/page.tsx.
export async function obtenerSucursalesVisiblesParaMiembro(usuario: UsuarioAdmin): Promise<SucursalResumen[]> {
  return obtenerSucursalesVisiblesParaUsuario(
    { sucursales: new PrismaSucursalRepository(prisma), usuarioSucursales: new PrismaUsuarioSucursalRepository(prisma) },
    usuario
  );
}
```

- [ ] **Step 4: Escribir y correr el script de verificación**

Crear `packages/db/_verificar-sucursales-visibles.ts`:

```typescript
import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";
import path from "node:path";

config({ path: path.resolve(__dirname, "../../.env") });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const { PrismaSucursalRepository } = await import("../infrastructure/persistence/prisma/PrismaSucursalRepository");
  const { PrismaUsuarioSucursalRepository } = await import("../infrastructure/persistence/prisma/PrismaUsuarioSucursalRepository");
  const { obtenerSucursalesVisiblesParaUsuario } = await import("../domain/use-cases/ObtenerSucursalesVisiblesParaUsuario");

  const socio = await prisma.usuarioAdmin.findFirstOrThrow({ where: { rol: "SOCIO" } });
  const noSocio = await prisma.usuarioAdmin.findFirstOrThrow({ where: { rol: { not: "SOCIO" }, organizacionId: socio.organizacionId } });

  const deps = { sucursales: new PrismaSucursalRepository(prisma), usuarioSucursales: new PrismaUsuarioSucursalRepository(prisma) };

  const visiblesSocio = await obtenerSucursalesVisiblesParaUsuario(deps, socio as any);
  const todas = await prisma.sucursal.count({ where: { organizacionId: socio.organizacionId } });
  console.log("SOCIO ve", visiblesSocio.length, "de", todas, "sucursales de la organizacion");

  const visiblesNoSocio = await obtenerSucursalesVisiblesParaUsuario(deps, noSocio as any);
  const asignadas = await prisma.usuarioSucursal.count({ where: { usuarioId: noSocio.id } });
  console.log("NO-SOCIO ve", visiblesNoSocio.length, "sucursales, tiene", asignadas, "asignadas");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

Run: `cd packages/db && npx tsx --tsconfig ../../apps/web-admin/tsconfig.json _verificar-sucursales-visibles.ts`
Expected: `SOCIO ve N de N sucursales` (mismo número — ve todas) y `NO-SOCIO ve M sucursales, tiene M asignadas` (mismo número).

- [ ] **Step 5: Borrar el script de verificación**

Run: `rm packages/db/_verificar-sucursales-visibles.ts`

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit -p apps/web-admin/tsconfig.json`
Expected: mismos errores que al final de la Task 1 (relacionados a `obtenerUsuarioDeSesion*`), ningún error nuevo en los archivos tocados por esta tarea.

- [ ] **Step 7: Commit**

```bash
git add packages/domain/use-cases/ObtenerSucursalesVisiblesParaUsuario.ts "apps/web-admin/app/(panel)/caja/obtenerSucursalesVisiblesParaTurno.ts" "apps/web-admin/app/(panel)/miembros/obtenerSucursalesVisibles.ts"
git commit -m "refactor: consolida las dos copias de sucursales visibles en un caso de uso de dominio"
```

---

### Task 3: `lib/sesion.ts` — nueva forma de retorno + login en dos pasos (backend)

**Files:**
- Modify: `apps/web-admin/lib/sesion.ts`
- Modify: `apps/web-admin/app/api/auth/login/route.ts`
- Create: `apps/web-admin/app/api/auth/login/sucursal/route.ts`

**Interfaces:**
- Consumes: `validarSesion` devolviendo `{ usuario, sucursalActivaId } | null` (Task 1); `obtenerSucursalesVisiblesParaUsuario` vía el nuevo caso de uso de dominio (Task 2, importado directo desde `@gym-app/domain/use-cases/ObtenerSucursalesVisiblesParaUsuario`, sin pasar por los wrappers de `apps/web-admin` porque el login no vive bajo `/caja` ni `/miembros`); `iniciarSesion` recibiendo `sucursalActivaId` (Task 1).
- Produces: `obtenerUsuarioDeSesion(req): Promise<{ usuario: UsuarioAdmin; sucursalActivaId: string } | null>`; `obtenerUsuarioDeSesionActual(): Promise<{ usuario: UsuarioAdmin; sucursalActivaId: string } | null>` — **esta es la forma que consumen TODAS las páginas/actions en las Tasks 4-7**, no cambia después. Respuesta JSON del login paso 1: `{ requiereSeleccion: false }` (con cookie ya seteada) o `{ requiereSeleccion: true, sucursales: Array<{ id: string; nombre: string; cajaAbiertaPor: string | null }> }` (sin cookie). El endpoint nuevo (`/api/auth/login/sucursal`) recibe `{ email, password, sucursalId }` y responde igual que el login de hoy (con cookie seteada).

- [ ] **Step 1: `lib/sesion.ts`**

Reemplazar el archivo completo:

```typescript
// lib/sesion.ts
// Helper para leer y validar la sesión del admin desde la cookie httpOnly.
// Cada ruta protegida llama a obtenerUsuarioDeSesion al inicio — no hay
// middleware.ts todavía (solo una ruta protegida por ahora, ver el plan).
import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "./prisma";
import { PrismaSesionRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSesionRepository";
import { PrismaUsuarioAdminRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaUsuarioAdminRepository";
import { validarSesion, SesionValidada } from "@gym-app/domain/use-cases/ValidarSesion";

export const NOMBRE_COOKIE_SESION = "sesion_token";

export async function obtenerUsuarioDeSesion(req: NextRequest): Promise<SesionValidada | null> {
  const token = req.cookies.get(NOMBRE_COOKIE_SESION)?.value;

  if (!token) {
    return null;
  }

  return validarSesion(
    {
      sesiones: new PrismaSesionRepository(prisma),
      usuarios: new PrismaUsuarioAdminRepository(prisma),
    },
    token
  );
}

// Igual que obtenerUsuarioDeSesion, pero para Server Components/Actions,
// que no reciben un NextRequest — leen la cookie con next/headers.
export async function obtenerUsuarioDeSesionActual(): Promise<SesionValidada | null> {
  const token = (await cookies()).get(NOMBRE_COOKIE_SESION)?.value;

  if (!token) {
    return null;
  }

  return validarSesion(
    {
      sesiones: new PrismaSesionRepository(prisma),
      usuarios: new PrismaUsuarioAdminRepository(prisma),
    },
    token
  );
}
```

- [ ] **Step 2: `app/api/auth/login/route.ts` — paso 1**

Reemplazar el archivo completo:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { NOMBRE_COOKIE_SESION } from "@/lib/sesion";
import { PrismaUsuarioAdminRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaUsuarioAdminRepository";
import { PrismaSesionRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSesionRepository";
import { PrismaSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSucursalRepository";
import { PrismaUsuarioSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaUsuarioSucursalRepository";
import { PrismaTurnoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaTurnoRepository";
import { BcryptPasswordHasher } from "@gym-app/infrastructure/auth/BcryptPasswordHasher";
import { iniciarSesion, CredencialesInvalidasError } from "@gym-app/domain/use-cases/IniciarSesion";
import { obtenerSucursalesVisiblesParaUsuario } from "@gym-app/domain/use-cases/ObtenerSucursalesVisiblesParaUsuario";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email y contraseña son requeridos." },
        { status: 400 }
      );
    }

    const hasher = new BcryptPasswordHasher();
    const usuarios = new PrismaUsuarioAdminRepository(prisma);

    // Se valida credenciales primero (reutilizando la lógica exacta de
    // iniciarSesion vía su propio caso de uso más abajo cuando ya se sabe
    // la sucursal) pero acá hace falta saber el usuario ANTES de decidir
    // si hace falta preguntar la sucursal — por eso se resuelven
    // credenciales acá, no dentro de iniciarSesion todavía.
    const credenciales = await usuarios.buscarCredencialesPorEmail(email);
    if (!credenciales || !(await hasher.comparar(password, credenciales.passwordHash))) {
      return NextResponse.json({ error: "Email o contraseña incorrectos." }, { status: 401 });
    }

    const sucursalesVisibles = await obtenerSucursalesVisiblesParaUsuario(
      { sucursales: new PrismaSucursalRepository(prisma), usuarioSucursales: new PrismaUsuarioSucursalRepository(prisma) },
      credenciales.usuario
    );

    if (sucursalesVisibles.length > 1) {
      // Más de una opción: no se loguea todavía (sin cookie) — se le pide
      // al cliente que elija sucursal (ver FormularioLogin/paso 2), que
      // reenvía las credenciales a /api/auth/login/sucursal (ver ese
      // archivo para por qué se reenvían en vez de usar un token
      // intermedio: evita agregar una entidad de "sesión temporal" solo
      // para cubrir un intervalo de segundos).
      const turnoRepo = new PrismaTurnoRepository(prisma);
      const sucursales = await Promise.all(
        sucursalesVisibles.map(async (s) => {
          const turnoAbierto = await turnoRepo.buscarAbiertoPorSucursal(s.id);
          return { id: s.id, nombre: s.nombre, cajaAbiertaPor: turnoAbierto?.usuarioNombre ?? null };
        })
      );
      return NextResponse.json({ requiereSeleccion: true, sucursales });
    }

    // Una sola sucursal visible (o ninguna, caso borde: usuario sin
    // sucursales asignadas todavía) — se loguea directo, sin preguntar.
    // sucursalesVisibles[0] no existe en el caso "ninguna"; se lo trata
    // como error explícito en vez de crear una sesión sin sucursal activa
    // válida (violaría la garantía de que sucursalActivaId siempre existe).
    if (sucursalesVisibles.length === 0) {
      return NextResponse.json(
        { error: "Tu usuario no tiene ninguna sucursal asignada. Contactá a un administrador." },
        { status: 403 }
      );
    }

    const resultado = await iniciarSesion(
      { usuarios, hasher, sesiones: new PrismaSesionRepository(prisma) },
      { email, password, sucursalActivaId: sucursalesVisibles[0].id }
    );

    const response = NextResponse.json({ requiereSeleccion: false });
    response.cookies.set(NOMBRE_COOKIE_SESION, resultado.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: resultado.expiraEn,
    });
    return response;
  } catch (error) {
    if (error instanceof CredencialesInvalidasError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("Error en login:", error);
    return NextResponse.json(
      { error: "Error interno al iniciar sesión." },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 3: `app/api/auth/login/sucursal/route.ts` — paso 2 (nuevo)**

Crear el archivo:

```typescript
// POST /api/auth/login/sucursal — paso 2 del login, solo cuando el paso 1
// (POST /api/auth/login) respondió requiereSeleccion: true. Recibe de
// nuevo email+password (no hay sesión ni token intermedio entre los dos
// pasos — ver la nota en api/auth/login/route.ts) más la sucursalId
// elegida, revalida credenciales y crea recién ahí la sesión.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { NOMBRE_COOKIE_SESION } from "@/lib/sesion";
import { PrismaUsuarioAdminRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaUsuarioAdminRepository";
import { PrismaSesionRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSesionRepository";
import { PrismaSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSucursalRepository";
import { PrismaUsuarioSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaUsuarioSucursalRepository";
import { BcryptPasswordHasher } from "@gym-app/infrastructure/auth/BcryptPasswordHasher";
import { iniciarSesion, CredencialesInvalidasError } from "@gym-app/domain/use-cases/IniciarSesion";
import { obtenerSucursalesVisiblesParaUsuario } from "@gym-app/domain/use-cases/ObtenerSucursalesVisiblesParaUsuario";

export async function POST(req: NextRequest) {
  try {
    const { email, password, sucursalId } = await req.json();

    if (!email || !password || !sucursalId) {
      return NextResponse.json(
        { error: "Email, contraseña y sucursal son requeridos." },
        { status: 400 }
      );
    }

    const hasher = new BcryptPasswordHasher();
    const usuarios = new PrismaUsuarioAdminRepository(prisma);
    const credenciales = await usuarios.buscarCredencialesPorEmail(email);
    if (!credenciales || !(await hasher.comparar(password, credenciales.passwordHash))) {
      return NextResponse.json({ error: "Email o contraseña incorrectos." }, { status: 401 });
    }

    // No confiar en el sucursalId que manda el cliente sin validar que
    // esté entre las que este usuario puede ver (mismo criterio que
    // /api/caja/ultimo-cierre) — evita que alguien fuerce una sucursal
    // ajena editando el body del POST.
    const sucursalesVisibles = await obtenerSucursalesVisiblesParaUsuario(
      { sucursales: new PrismaSucursalRepository(prisma), usuarioSucursales: new PrismaUsuarioSucursalRepository(prisma) },
      credenciales.usuario
    );
    if (!sucursalesVisibles.some((s) => s.id === sucursalId)) {
      return NextResponse.json({ error: "Sucursal no accesible." }, { status: 403 });
    }

    const resultado = await iniciarSesion(
      { usuarios, hasher, sesiones: new PrismaSesionRepository(prisma) },
      { email, password, sucursalActivaId: sucursalId }
    );

    const response = NextResponse.json({
      usuario: { id: resultado.usuario.id, email: resultado.usuario.email, rol: resultado.usuario.rol },
    });
    response.cookies.set(NOMBRE_COOKIE_SESION, resultado.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: resultado.expiraEn,
    });
    return response;
  } catch (error) {
    if (error instanceof CredencialesInvalidasError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("Error en login (paso sucursal):", error);
    return NextResponse.json(
      { error: "Error interno al iniciar sesión." },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p apps/web-admin/tsconfig.json`
Expected: sin errores en `lib/sesion.ts`, `api/auth/login/route.ts`, `api/auth/login/sucursal/route.ts`. Persisten errores en cada page/action que destructura `usuario` directo desde `obtenerUsuarioDeSesion*` (Tasks 4-7 los arreglan) — confirmar que la lista de archivos con error coincide con los 40 restantes (41 totales menos `lib/sesion.ts`, ya arreglado acá).

- [ ] **Step 5: Verificación manual con `/run`**

Con un usuario que tenga UNA sola sucursal asignada: loguear con email+password reales → confirmar que entra directo al panel (sin pantalla intermedia), y que la cookie de sesión quedó seteada (`document.cookie` en devtools del navegador, o simplemente confirmar que refrescar la página no vuelve a pedir login).

Con un usuario que tenga MÁS de una sucursal asignada (o un SOCIO): loguear con email+password reales → confirmar que la respuesta de `/api/auth/login` es `{ requiereSeleccion: true, sucursales: [...] }` (revisar la pestaña Network del navegador) y que NO se setea cookie en esa respuesta. Llamar manualmente `/api/auth/login/sucursal` con una de esas sucursales (ej. con `fetch` desde la consola del navegador) y confirmar que esa sí setea la cookie.

Si no tenés acceso a navegador en tu entorno, documentá este paso como pendiente para el controlador (mismo patrón que el plan anterior) — no lo des por hecho sin evidencia.

- [ ] **Step 6: Commit**

```bash
git add apps/web-admin/lib/sesion.ts "apps/web-admin/app/api/auth/login/route.ts" "apps/web-admin/app/api/auth/login/sucursal/route.ts"
git commit -m "feat: login en dos pasos, pide sucursal si el usuario ve mas de una"
```

---

### Task 4: Pantalla de login — botones de sucursal (frontend)

**Files:**
- Modify: `apps/web-admin/app/login/page.tsx`

**Interfaces:**
- Consumes: respuestas de `/api/auth/login` y `/api/auth/login/sucursal` (Task 3): `{ requiereSeleccion: false }` | `{ requiereSeleccion: true, sucursales: Array<{ id: string; nombre: string; cajaAbiertaPor: string | null }> }` | `{ error: string }`.
- Produces: nada que consuman otras tareas (es la última pieza del flujo de login).

- [ ] **Step 1: Reescribir `app/login/page.tsx` con el paso 2**

Reemplazar el archivo completo:

```tsx
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LogoBadge } from "@gym-app/ui/components/LogoBadge";

interface SucursalParaElegir {
  id: string;
  nombre: string;
  cajaAbiertaPor: string | null;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  // null = todavía en el paso 1 (credenciales); un array = paso 2 (elegir
  // sucursal) — las credenciales ya están validadas en ese punto, se
  // guardan acá mismo para reenviarlas al elegir botón (ver
  // /api/auth/login/sucursal: no hay sesión/token intermedio entre los
  // dos pasos, ver diseño acordado).
  const [sucursalesParaElegir, setSucursalesParaElegir] = useState<SucursalParaElegir[] | null>(null);

  async function manejarSubmitCredenciales(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    setCargando(false);

    if (!res.ok) {
      setError(data.error ?? "Error al iniciar sesión.");
      return;
    }

    if (data.requiereSeleccion) {
      setSucursalesParaElegir(data.sucursales);
      return;
    }

    router.push("/miembros");
  }

  async function elegirSucursal(sucursalId: string) {
    setError(null);
    setCargando(true);

    const res = await fetch("/api/auth/login/sucursal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, sucursalId }),
    });

    setCargando(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Error al iniciar sesión.");
      return;
    }

    router.push("/miembros");
  }

  return (
    <>
      <main
        className="flex min-h-screen items-center justify-center p-6"
        style={{ background: "var(--gx-ground)", color: "var(--gx-ink)" }}
      >
        <div
          className="grid w-full max-w-3xl overflow-hidden rounded-2xl border md:grid-cols-2"
          style={{ borderColor: "var(--gx-edge)", boxShadow: "0 40px 80px -40px rgba(0,0,0,0.75)" }}
        >
          <div className="flex flex-col items-center justify-center gap-6 p-10" style={{ background: "var(--gx-ground)" }}>
            <LogoBadge src="/branding/logo-adrenalina-gym.jpg" alt="Adrenalina Xtreme Gym" />
            <div className="text-center">
              <div className="text-3xl" style={{ fontFamily: '"Bebas Neue", sans-serif', letterSpacing: "0.04em" }}>
                ADRENALINA <span style={{ color: "var(--gx-accent)" }}>XTREME</span>
              </div>
              <div
                className="mt-1 text-xs uppercase"
                style={{
                  fontFamily: '"Barlow Condensed", sans-serif',
                  fontWeight: 700,
                  letterSpacing: "0.24em",
                  color: "var(--gx-muted-dim)",
                }}
              >
                Gym · Panel de administración
              </div>
            </div>
          </div>

          {sucursalesParaElegir === null ? (
            <form onSubmit={manejarSubmitCredenciales} className="flex flex-col gap-4 p-10" style={{ background: "var(--gx-surface)" }}>
              <h1 className="text-2xl" style={{ fontFamily: '"Bebas Neue", sans-serif', letterSpacing: "0.02em" }}>
                Iniciar sesión
              </h1>

              {error && (
                <p
                  className="rounded px-3 py-2 text-sm"
                  style={{ background: "color-mix(in srgb, var(--gx-bad) 15%, transparent)", color: "var(--gx-bad)" }}
                >
                  {error}
                </p>
              )}

              <label className="flex flex-col gap-1 text-sm" style={{ color: "var(--gx-muted)" }}>
                Email
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="rounded border px-3 py-2 outline-none"
                  style={{ background: "var(--gx-surface-2)", borderColor: "var(--gx-edge)", color: "var(--gx-ink)" }}
                />
              </label>

              <label className="flex flex-col gap-1 text-sm" style={{ color: "var(--gx-muted)" }}>
                Contraseña
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="rounded border px-3 py-2 outline-none"
                  style={{ background: "var(--gx-surface-2)", borderColor: "var(--gx-edge)", color: "var(--gx-ink)" }}
                />
              </label>

              <button
                type="submit"
                disabled={cargando}
                className="rounded px-5 py-2 font-semibold transition-opacity disabled:opacity-50"
                style={{ background: "var(--gx-accent)", color: "var(--gx-accent-ink)" }}
              >
                {cargando ? "Ingresando..." : "Ingresar"}
              </button>
            </form>
          ) : (
            <div className="flex flex-col gap-4 p-10" style={{ background: "var(--gx-surface)" }}>
              <h1 className="text-2xl" style={{ fontFamily: '"Bebas Neue", sans-serif', letterSpacing: "0.02em" }}>
                Elegí una sucursal
              </h1>

              {error && (
                <p
                  className="rounded px-3 py-2 text-sm"
                  style={{ background: "color-mix(in srgb, var(--gx-bad) 15%, transparent)", color: "var(--gx-bad)" }}
                >
                  {error}
                </p>
              )}

              <div className="flex flex-col gap-3">
                {sucursalesParaElegir.map((sucursal) => (
                  <button
                    key={sucursal.id}
                    type="button"
                    disabled={cargando}
                    onClick={() => elegirSucursal(sucursal.id)}
                    className="flex flex-col gap-1 rounded-lg border px-4 py-3 text-left transition-opacity disabled:opacity-50"
                    style={{ borderColor: "var(--gx-edge)", background: "var(--gx-surface-2)", color: "var(--gx-ink)" }}
                  >
                    <span className="font-semibold">{sucursal.nombre}</span>
                    {sucursal.cajaAbiertaPor && (
                      <span
                        className="rounded px-2 py-1 text-xs"
                        style={{ background: "color-mix(in srgb, var(--gx-warn) 15%, transparent)", color: "var(--gx-warn)", width: "fit-content" }}
                      >
                        Caja abierta por {sucursal.cajaAbiertaPor}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => {
                  setSucursalesParaElegir(null);
                  setError(null);
                }}
                className="text-sm font-medium hover:underline"
                style={{ color: "var(--gx-muted)" }}
              >
                ← Volver
              </button>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p apps/web-admin/tsconfig.json`
Expected: sin errores en `app/login/page.tsx`.

- [ ] **Step 3: Verificación manual con `/run`**

Loguear con un usuario de una sola sucursal → entra directo, sin ver la pantalla de botones.
Loguear con un usuario de más de una sucursal (o un SOCIO) → ver la pantalla "Elegí una sucursal" con un botón por sucursal, nombre visible, e indicador ámbar "Caja abierta por {nombre}" en la que corresponda (para probar esto, tené un turno abierto en una de esas sucursales de antemano). Click en un botón → entra al panel. Botón "← Volver" → regresa al formulario de credenciales sin recargar la página.

Si no hay acceso a navegador en tu entorno, documentar como pendiente (mismo patrón que tareas anteriores de plans previos).

- [ ] **Step 4: Commit**

```bash
git add "apps/web-admin/app/login/page.tsx"
git commit -m "feat: pantalla de login pide sucursal con botones si hay mas de una"
```

---

### Task 5: Migrar `/caja` — `obtenerTurnoAbiertoParaUsuario`, `page.tsx`, `actions.ts`

**Files:**
- Modify: `apps/web-admin/app/(panel)/caja/obtenerTurnoAbiertoParaUsuario.ts`
- Modify: `apps/web-admin/app/(panel)/caja/page.tsx`
- Modify: `apps/web-admin/app/(panel)/caja/actions.ts`

**Interfaces:**
- Consumes: `obtenerUsuarioDeSesionActual()` devolviendo `{ usuario, sucursalActivaId } | null` (Task 3).
- Produces: `obtenerTurnoAbiertoParaUsuario` cambia su firma de `(usuario: UsuarioAdmin) => Promise<TurnoAbiertoParaUsuario | null>` a `(sucursalActivaId: string, usuarioId: string) => Promise<TurnoAbiertoParaUsuario | null>` — más simple que antes (ya no necesita ramificar entre "tiene sucursalId fijo" vs "buscar entre todas las visibles", porque ahora siempre hay exactamente una sucursal activa conocida). `TurnoAbiertoParaUsuario` (`{ turno, esPropio }`) no cambia de forma.

- [ ] **Step 1: Simplificar `obtenerTurnoAbiertoParaUsuario.ts`**

Reemplazar el archivo completo:

```typescript
import { prisma } from "@/lib/prisma";
import { PrismaTurnoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaTurnoRepository";
import type { Turno } from "@gym-app/domain/entities/Turno";

// El turno abierto de la sucursal ACTIVA de esta sesión (ver
// sucursalActivaId, plan de selección de sucursal al iniciar sesión), con
// una bandera explícita de si es SUYO (turno.usuarioId === usuarioId) o de
// otra persona (ver caso de uso: un solo usuario a la vez por caja).
// Antes esta función recibía el UsuarioAdmin completo y ramificaba entre
// "tiene sucursalId fijo -> buscar ahí" vs "no tiene (SOCIO) -> buscar
// entre TODAS las sucursales visibles" — con sucursalActivaId siempre hay
// exactamente una sucursal conocida de antemano (elegida al loguearse),
// así que no hace falta esa rama ni conocer las sucursales visibles acá.
export interface TurnoAbiertoParaUsuario {
  turno: Turno;
  esPropio: boolean;
}

export async function obtenerTurnoAbiertoParaUsuario(
  sucursalActivaId: string,
  usuarioId: string
): Promise<TurnoAbiertoParaUsuario | null> {
  const turnoRepo = new PrismaTurnoRepository(prisma);
  const turno = await turnoRepo.buscarAbiertoPorSucursal(sucursalActivaId);

  if (!turno) return null;

  return { turno, esPropio: turno.usuarioId === usuarioId };
}
```

- [ ] **Step 2: `page.tsx`**

En `apps/web-admin/app/(panel)/caja/page.tsx`, reemplazar:

```typescript
export default async function PaginaCaja() {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const turnoRepo = new PrismaTurnoRepository(prisma);
  const turnoAbierto = await obtenerTurnoAbiertoParaUsuario(usuario);

  // La sucursal "real" del turno encontrado — para un SOCIO puede diferir
  // de usuario.sucursalId (que es null), así que el resto de la página usa
  // esta en vez de usuario.sucursalId directamente.
  const sucursalId = turnoAbierto ? turnoAbierto.turno.sucursalId : usuario.sucursalId;
```

por:

```typescript
export default async function PaginaCaja() {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario, sucursalActivaId } = sesion;

  const turnoRepo = new PrismaTurnoRepository(prisma);
  const turnoAbierto = await obtenerTurnoAbiertoParaUsuario(sucursalActivaId, usuario.id);

  // La sucursal activa de esta sesión (elegida al loguearse) — ya no hace
  // falta distinguir "la del turno" vs "la fija del usuario": son siempre
  // la misma, porque el turno que se busca es justamente el de
  // sucursalActivaId (ver obtenerTurnoAbiertoParaUsuario).
  const sucursalId = sucursalActivaId;
```

Buscar el resto del archivo por cualquier otra referencia a `usuario.sucursalId` (no debería haber ninguna más en este archivo, según el grep hecho antes de este plan) y confirmar que no queda ninguna.

- [ ] **Step 3: `actions.ts`**

En `apps/web-admin/app/(panel)/caja/actions.ts`, hay tres funciones a tocar: `abrirTurnoAction`, `registrarEgresoAction`, `cerrarTurnoAction`. El patrón es el mismo en las tres — reemplazar:

```typescript
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");
```

por:

```typescript
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario, sucursalActivaId } = sesion;
```

Y en `abrirTurnoAction` específicamente, reemplazar:

```typescript
  const sucursalId = usuario.sucursalId ?? formData.get("sucursalId")?.toString();
  if (!sucursalId) {
    return { error: "Debés seleccionar una sucursal para abrir el turno." };
  }
```

por:

```typescript
  // sucursalActivaId siempre existe (garantizado por Sesion, ver Task 1
  // del plan de selección de sucursal) — ya no hace falta el fallback al
  // <select> del formulario, ni el error de "sucursal requerida": la
  // sucursal ya está decidida por la sesión, no por lo que el operador
  // haya elegido en un campo del formulario de abrir turno.
  const sucursalId = sucursalActivaId;
```

En `registrarEgresoAction` y `cerrarTurnoAction`, buscar el campo `sucursalIdUsuario: usuario.sucursalId` (usado al llamar a `registrarEgreso`/`cerrarTurno`) y reemplazarlo por `sucursalIdUsuario: sucursalActivaId`.

Confirmar con grep dentro de este archivo que no queda ningún `usuario.sucursalId`.

- [ ] **Step 4: Buscar y confirmar otros consumidores de `obtenerTurnoAbiertoParaUsuario`**

Este caso de uso también lo llaman `apps/web-admin/app/(panel)/miembros/nuevo/page.tsx`, `apps/web-admin/app/(panel)/miembros/[id]/page.tsx` y `apps/web-admin/app/(panel)/miembros/page.tsx` (confirmado por grep antes de este plan) — con la firma vieja `obtenerTurnoAbiertoParaUsuario(usuario)`. Esos tres archivos los actualiza la Task 6 (que ya toca esos mismos archivos para migrar `obtenerUsuarioDeSesion*`), así que en ESTA tarea NO hace falta tocarlos — alcanza con dejar documentado en el reporte de esta tarea que quedan con el error de tipos esperado hasta la Task 6, para que quien la implemente no se sorprenda.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p apps/web-admin/tsconfig.json`
Expected: sin errores en `caja/obtenerTurnoAbiertoParaUsuario.ts`, `caja/page.tsx`, `caja/actions.ts`. Persisten errores en `miembros/*` (Task 6) y en el resto de los 40 archivos aún no migrados (Task 7).

- [ ] **Step 6: Verificación manual con `/run`**

Con un usuario de sucursal única: loguear, ir a `/caja`, abrir un turno (sin campo de selección de sucursal visible, ya que no hace falta) y confirmar que el turno queda abierto en la sucursal correcta. Registrar un egreso y cerrar el turno, confirmar que todo sigue funcionando igual que antes del cambio.

Si no hay acceso a navegador, documentar como pendiente.

- [ ] **Step 7: Commit**

```bash
git add "apps/web-admin/app/(panel)/caja/obtenerTurnoAbiertoParaUsuario.ts" "apps/web-admin/app/(panel)/caja/page.tsx" "apps/web-admin/app/(panel)/caja/actions.ts"
git commit -m "refactor: caja usa sucursalActivaId de la sesion en vez de usuario.sucursalId"
```

---

### Task 6: Migrar Miembros y Pagos (los que usan `sucursalId` para scoping/default)

**Files:**
- Modify: `apps/web-admin/app/(panel)/miembros/page.tsx`
- Modify: `apps/web-admin/app/(panel)/miembros/nuevo/page.tsx`
- Modify: `apps/web-admin/app/(panel)/miembros/[id]/page.tsx`
- Modify: `apps/web-admin/app/(panel)/miembros/actions.ts`
- Modify: `apps/web-admin/app/(panel)/pagos/actions.ts`
- Modify: `apps/web-admin/app/(panel)/pagos/nuevo/page.tsx`
- Modify: `apps/web-admin/app/api/pagos/route.ts`

**Interfaces:**
- Consumes: `obtenerUsuarioDeSesionActual()`/`obtenerUsuarioDeSesion()` devolviendo `{ usuario, sucursalActivaId } | null` (Task 3); `obtenerTurnoAbiertoParaUsuario(sucursalActivaId, usuarioId)` (Task 5, nueva firma).

- [ ] **Step 1: `miembros/page.tsx`**

Reemplazar:

```typescript
  const [miembros, planes, sucursales, turnoAbierto] = await Promise.all([
    listarMiembros({ miembros: new PrismaMemberRepository(prisma) }, usuario.organizacionId),
    listarPlanes({ planes: new PrismaPlanRepository(prisma) }, usuario.organizacionId),
    listarSucursales({ sucursales: new PrismaSucursalRepository(prisma) }, usuario.organizacionId),
    obtenerTurnoAbiertoParaUsuario(usuario),
  ]);
```

por (el resto del archivo, incluida la sección `{turnoAbierto?.esPropio ? ... : ...}` del plan anterior, no cambia — solo cambian los dos puntos de arriba):

```typescript
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario, sucursalActivaId } = sesion;

  const [miembros, planes, sucursales, turnoAbierto] = await Promise.all([
    listarMiembros({ miembros: new PrismaMemberRepository(prisma) }, usuario.organizacionId),
    listarPlanes({ planes: new PrismaPlanRepository(prisma) }, usuario.organizacionId),
    listarSucursales({ sucursales: new PrismaSucursalRepository(prisma) }, usuario.organizacionId),
    obtenerTurnoAbiertoParaUsuario(sucursalActivaId, usuario.id),
  ]);
```

(La línea `const usuario = await obtenerUsuarioDeSesionActual(); if (!usuario) redirect("/login");` original queda reemplazada por las tres líneas de arriba — no quedan dos declaraciones de `usuario`.)

- [ ] **Step 2: `miembros/nuevo/page.tsx`**

Reemplazar:

```typescript
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const turnoAbierto = await obtenerTurnoAbiertoParaUsuario(usuario);
```

por:

```typescript
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario, sucursalActivaId } = sesion;

  const turnoAbierto = await obtenerTurnoAbiertoParaUsuario(sucursalActivaId, usuario.id);
```

Y más abajo en el mismo archivo, reemplazar `sucursalIdDefault={usuario.sucursalId}` por `sucursalIdDefault={sucursalActivaId}`.

- [ ] **Step 3: `miembros/[id]/page.tsx`**

Reemplazar:

```typescript
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");
```

por:

```typescript
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario, sucursalActivaId } = sesion;
```

Buscar en el mismo archivo la llamada `obtenerTurnoAbiertoParaUsuario(usuario)` dentro del `Promise.all` y reemplazarla por `obtenerTurnoAbiertoParaUsuario(sucursalActivaId, usuario.id)`.

Reemplazar las DOS ocurrencias de `sucursalIdDefault={usuario.sucursalId}` (una en `FormularioMiembro`, otra en `FormularioPago` dentro del panel lateral — confirmado por grep antes de este plan) por `sucursalIdDefault={sucursalActivaId}`.

- [ ] **Step 4: `miembros/actions.ts`**

Localizar la función que usa `usuario.sucursalId` (línea con `const sucursalIdPago = formData.get("sucursalIdPago")?.toString() || usuario.sucursalId;`). Aplicar el patrón de destructuring (`const { usuario, sucursalActivaId } = sesion;` donde hoy dice `const usuario = await obtenerUsuarioDeSesionActual(); if (!usuario) redirect("/login");`) y reemplazar `|| usuario.sucursalId` por `|| sucursalActivaId`.

- [ ] **Step 5: `pagos/actions.ts`**

Mismo patrón que el Step 4: localizar `const sucursalIdPago = formData.get("sucursalIdPago")?.toString() || usuario.sucursalId;` en `registrarPagoAction`, aplicar destructuring, reemplazar por `|| sucursalActivaId`.

- [ ] **Step 6: `pagos/nuevo/page.tsx`**

Reemplazar:

```typescript
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");
```

por:

```typescript
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario, sucursalActivaId } = sesion;
```

Y reemplazar `sucursalIdDefault={usuario.sucursalId}` por `sucursalIdDefault={sucursalActivaId}`.

- [ ] **Step 7: `api/pagos/route.ts`**

Localizar el patrón `const usuario = await obtenerUsuarioDeSesion(req); if (!usuario) {...}` y aplicar destructuring. Reemplazar:

```typescript
    if (!usuario.sucursalId) {
      return NextResponse.json(
        { error: "El usuario no tiene una sucursal asignada para registrar pagos." },
        { status: 400 }
      );
    }
```

por:

```typescript
    // sucursalActivaId siempre existe para una sesión válida (garantizado
    // por Sesion.sucursalActivaId, ver plan de selección de sucursal al
    // iniciar sesión) — este chequeo queda como guardia defensiva de tipos,
    // no debería ser alcanzable en la práctica.
    if (!sucursalActivaId) {
      return NextResponse.json(
        { error: "El usuario no tiene una sucursal asignada para registrar pagos." },
        { status: 400 }
      );
    }
```

Y más abajo, reemplazar `sucursalId: usuario.sucursalId,` (dentro del objeto que se pasa a `registrarPago`) por `sucursalId: sucursalActivaId,`.

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit -p apps/web-admin/tsconfig.json`
Expected: sin errores en ninguno de los 7 archivos de esta tarea. Persisten errores en los ~33 archivos restantes que solo destructuran `usuario` sin usar `sucursalId` (Task 7).

- [ ] **Step 9: Verificación manual con `/run`**

Con un usuario de sucursal única: inscribir un miembro nuevo desde `/miembros/nuevo`, confirmar que la sucursal default en el formulario es la correcta. Registrar un pago desde `/pagos/nuevo` y desde la ficha de un miembro (`/miembros/[id]`), confirmar que ambos funcionan y quedan asociados a la sucursal correcta.

Si no hay acceso a navegador, documentar como pendiente.

- [ ] **Step 10: Commit**

```bash
git add "apps/web-admin/app/(panel)/miembros/page.tsx" "apps/web-admin/app/(panel)/miembros/nuevo/page.tsx" "apps/web-admin/app/(panel)/miembros/[id]/page.tsx" "apps/web-admin/app/(panel)/miembros/actions.ts" "apps/web-admin/app/(panel)/pagos/actions.ts" "apps/web-admin/app/(panel)/pagos/nuevo/page.tsx" "apps/web-admin/app/api/pagos/route.ts"
git commit -m "refactor: miembros y pagos usan sucursalActivaId de la sesion en vez de usuario.sucursalId"
```

---

### Task 7: Migrar el resto de los call sites (destructuring mecánico, sin lógica nueva)

**Files (todos Modify, mismo patrón mecánico en cada uno):**
- `apps/web-admin/app/(panel)/cambiar-password/actions.ts`
- `apps/web-admin/app/(panel)/cambiar-password/page.tsx`
- `apps/web-admin/app/(panel)/configuraciones/actions.ts`
- `apps/web-admin/app/(panel)/configuraciones/layout.tsx`
- `apps/web-admin/app/(panel)/configuraciones/metodos-pago/nuevo/page.tsx`
- `apps/web-admin/app/(panel)/configuraciones/metodos-pago/page.tsx`
- `apps/web-admin/app/(panel)/configuraciones/metodos-pago/[id]/page.tsx`
- `apps/web-admin/app/(panel)/configuraciones/page.tsx`
- `apps/web-admin/app/(panel)/estadisticas/page.tsx`
- `apps/web-admin/app/(panel)/layout.tsx`
- `apps/web-admin/app/(panel)/miembros/[id]/pagos/page.tsx`
- `apps/web-admin/app/(panel)/pagos/page.tsx`
- `apps/web-admin/app/(panel)/planes/actions.ts`
- `apps/web-admin/app/(panel)/planes/nuevo/page.tsx`
- `apps/web-admin/app/(panel)/planes/page.tsx`
- `apps/web-admin/app/(panel)/planes/[id]/page.tsx`
- `apps/web-admin/app/(panel)/sucursales/actions.ts`
- `apps/web-admin/app/(panel)/sucursales/nuevo/page.tsx`
- `apps/web-admin/app/(panel)/sucursales/page.tsx`
- `apps/web-admin/app/(panel)/sucursales/[id]/page.tsx`
- `apps/web-admin/app/(panel)/usuarios/actions.ts`
- `apps/web-admin/app/(panel)/usuarios/nuevo/page.tsx`
- `apps/web-admin/app/(panel)/usuarios/page.tsx`
- `apps/web-admin/app/(panel)/usuarios/[id]/page.tsx`
- `apps/web-admin/app/api/caja/ultimo-cierre/route.ts`
- `apps/web-admin/app/api/miembros/route.ts`
- `apps/web-admin/app/api/miembros/[id]/route.ts`
- `apps/web-admin/app/api/planes/route.ts`
- `apps/web-admin/app/api/planes/[id]/route.ts`
- `apps/web-admin/app/api/tasa-cambio/route.ts`
- `apps/web-admin/app/api/usuarios/route.ts`
- `apps/web-admin/app/page.tsx`

**Interfaces:**
- Consumes: `obtenerUsuarioDeSesion()`/`obtenerUsuarioDeSesionActual()` devolviendo `{ usuario, sucursalActivaId } | null` (Task 3). Ninguno de estos 31 archivos usa `sucursalActivaId` — solo necesitan seguir teniendo `usuario` con su forma de siempre.
- Produces: nada — es la última tarea que consume la forma nueva de sesión; después de esta tarea, cero archivos en `apps/web-admin` llaman `obtenerUsuarioDeSesion*` esperando la forma vieja.

Estos 31 archivos NO usan `sucursalId` para nada (confirmado por grep antes de este plan: ninguno aparece en la lista de call sites que leen `usuario.sucursalId`) — el único cambio que necesitan es puramente mecánico, mismo patrón en los 31:

- Donde diga `const usuario = await obtenerUsuarioDeSesion(req);` → `const sesion = await obtenerUsuarioDeSesion(req); const usuario = sesion?.usuario ?? null;` (o el patrón equivalente con `if (!usuario)` que ya tenga cada archivo — ver el Step 1 para el patrón exacto recomendado).
- Donde diga `const usuario = await obtenerUsuarioDeSesionActual();` seguido de `if (!usuario) redirect("/login");` → `const sesion = await obtenerUsuarioDeSesionActual(); if (!sesion) redirect("/login"); const { usuario } = sesion;`.
- El resto del archivo NO cambia — cada uso posterior de `usuario.algo` sigue funcionando igual, porque `usuario` sigue siendo un `UsuarioAdmin` completo, solo que ahora se extrae de `sesion.usuario` en vez de ser el valor devuelto directo.

- [ ] **Step 1: Aplicar el patrón mecánico en los 31 archivos**

Para cada archivo de la lista de arriba: abrirlo, localizar la llamada a `obtenerUsuarioDeSesion`/`obtenerUsuarioDeSesionActual`, y aplicar EXACTAMENTE uno de estos dos reemplazos según el patrón que ya tenga (algunos usan `redirect`, las rutas API usan `NextResponse.json` con status 401 — mantener el patrón de manejo de "no autenticado" que cada archivo ya tenía, sin cambiarlo):

**Patrón Server Component/Action (con `redirect`):**
```typescript
// Antes:
const usuario = await obtenerUsuarioDeSesionActual();
if (!usuario) redirect("/login");

// Después:
const sesion = await obtenerUsuarioDeSesionActual();
if (!sesion) redirect("/login");
const { usuario } = sesion;
```

**Patrón Route Handler (con respuesta 401, ej. `if (!usuario) { return NextResponse.json({ error: "No autenticado." }, { status: 401 }); }`):**
```typescript
// Antes:
const usuario = await obtenerUsuarioDeSesion(req);
if (!usuario) {
  return NextResponse.json({ error: "No autenticado." }, { status: 401 });
}

// Después:
const sesion = await obtenerUsuarioDeSesion(req);
if (!sesion) {
  return NextResponse.json({ error: "No autenticado." }, { status: 401 });
}
const { usuario } = sesion;
```

Cada archivo puede tener el mensaje de error ligeramente distinto (ej. "No autenticado.", "No autorizado.") — mantener el texto exacto que ya tenía cada uno, solo envolver la asignación como se muestra arriba.

Nota especial para `apps/web-admin/app/(panel)/layout.tsx`: confirmado leyendo el archivo antes de este plan que su único uso de `usuario` es `usuario.rol`, `usuario.nombre`, `usuario.email`, `usuario.fotoUrl` — ninguno relacionado a sucursal. Aplica el mismo patrón mecánico.

Nota especial para `apps/web-admin/app/api/caja/ultimo-cierre/route.ts`: este archivo SÍ usa `obtenerSucursalesVisiblesParaTurno(usuario)` (para validar que el `sucursalId` del query param sea uno visible) — esa llamada sigue recibiendo `usuario` (el objeto `UsuarioAdmin`, no la sesión completa), así que después de destructurar `const { usuario } = sesion;` esa línea no necesita ningún otro cambio.

- [ ] **Step 2: Typecheck (debe quedar en cero)**

Run: `npx tsc --noEmit -p apps/web-admin/tsconfig.json`
Expected: **0 errores en todo el proyecto**. Esta es la tarea que cierra la migración completa — si queda algún error, es porque algún archivo de la lista de arriba no se tocó o el patrón se aplicó mal.

- [ ] **Step 3: Grep de confirmación**

Run: `grep -rn "usuario\.sucursalId" apps/web-admin --include="*.ts" --include="*.tsx" | grep -v node_modules`
Expected: **sin resultados**. Si aparece alguno, es un call site que quedó sin migrar (ya sea de esta tarea o de una anterior) — investigar y corregir antes de dar la tarea por terminada.

- [ ] **Step 4: Verificación manual con `/run`**

Navegar por el panel completo con un usuario de sucursal única: `/miembros`, `/caja`, `/pagos`, `/estadisticas`, `/configuraciones` (si el usuario es SOCIO), `/cambiar-password`. Confirmar que no hay errores de runtime ni páginas rotas — el objetivo de esta verificación es detectar cualquier lugar donde el patrón mecánico se haya aplicado mal (ej. un `usuario` no definido).

Si no hay acceso a navegador, documentar como pendiente.

- [ ] **Step 5: Commit**

```bash
git add apps/web-admin
git commit -m "refactor: el resto del panel adapta la nueva forma de sesion con sucursal activa"
```

---

## Self-Review Notes

- **Cobertura de la spec:**
  - Sesión con `sucursalActivaId`, no sobreescribir `usuario.sucursalId` → Task 1.
  - Login en dos pasos, sin exponer sucursales antes de autenticar → Task 3.
  - Botones (no `<select>`), un solo camino de código para cualquier rol → Task 4 (UI), Task 2/3 (backend generalizado, no exclusivo de SOCIO).
  - Indicador de caja abierta + nombre en los botones → Task 3 Step 2 (cálculo), Task 4 Step 1 (render).
  - Sesión fija hasta logout, sin selector en el panel → ninguna tarea agrega ese selector (fuera de alcance, confirmado en la spec).
  - Un solo camino de código, `usuario.sucursalId` deja de leerse para scoping → Tasks 5, 6, 7 (grep de confirmación final en Task 7 Step 3).
  - `obtenerUsuarioDeSesion*` devuelven la sucursal activa junto con el usuario → Task 3 Step 1.
- **Placeholders:** ninguno — cada paso tiene código completo o instrucciones de búsqueda/reemplazo con el patrón exacto mostrado, no hay "TODO" ni pasos sin contenido accionable.
- **Consistencia de tipos:** `SesionValidada` (`{ usuario, sucursalActivaId }`) se define una sola vez en Task 1/3 y se consume igual en Tasks 5, 6, 7. `obtenerTurnoAbiertoParaUsuario` cambia de firma una sola vez (Task 5) y todos sus consumidores (Tasks 5 y 6) usan la firma nueva `(sucursalActivaId, usuarioId)` consistentemente. `ISesionRepository.crear` exige `sucursalActivaId` desde Task 1 en adelante — ningún caller posterior lo omite.
- **Blast radius confirmado:** 41 archivos consumen `obtenerUsuarioDeSesion*` (Tasks 5, 6, 7 = 3 + 7 + 31 = 41 archivos tocados, coincide). El grep final de Task 7 Step 3 es la verificación de que no queda ningún cabo suelto.
