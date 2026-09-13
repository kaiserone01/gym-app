# Login y Sesión del Panel Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar login/logout para `UsuarioAdmin` con sesión persistida en base de datos (cookie httpOnly con token opaco), y exponer por HTTP el caso de uso `CrearUsuarioAdmin` (ya implementado en el plan de dominio hexagonal) protegido por esa sesión — cerrando el primer 🔴 bloqueador del `docs/ROADMAP.md`.

**Architecture:** Mismo patrón hexagonal ya establecido: `packages/domain` gana los casos de uso `IniciarSesion`/`CerrarSesion`/`ValidarSesion` y los puertos `IPasswordHasher`/`ISesionRepository` (más una extensión de `IUsuarioAdminRepository`); `packages/infrastructure` gana `BcryptPasswordHasher` y `PrismaSesionRepository`; `apps/web-admin` gana un helper de sesión (`lib/sesion.ts`), 3 rutas API y una página de login. Cada ruta protegida valida su propia sesión llamando al helper — no se introduce `middleware.ts` de Next.js todavía (solo hay una ruta protegida; graduar cuando haya más, mismo principio de no sobre-ingeniería del ADR).

**Tech Stack:** `bcryptjs` (ya en el repo), cookies httpOnly de Next.js (`NextResponse.cookies`/`NextRequest.cookies`), token de sesión opaco (`crypto.randomBytes`, no JWT).

**Spec:** `docs/ROADMAP.md` (bloqueador #1), decisiones de esta sesión:

| Decisión | Resultado |
|---|---|
| Mecanismo de sesión | Tabla `Sesion` en base de datos (token opaco + cookie httpOnly), revocable al borrar la fila |
| Alcance | Login + logout + proteger `CrearUsuarioAdmin` (ya existente) + página de login mínima |

## Global Constraints

- El password en texto plano solo viaja en el body HTTPS de `/api/auth/login` y `/api/usuarios` — nunca se persiste ni se loguea en texto plano.
- La cookie de sesión (`sesion_token`) es `httpOnly` + `secure` en producción + `sameSite: "lax"` — no accesible desde JavaScript del cliente.
- `CredencialesInvalidasError` se usa tanto si el email no existe como si el password no coincide — nunca se revela cuál de los dos falló.
- El usuario que crea `/api/usuarios` queda siempre en la **misma organización** que quien hace la petición — no se permite crear usuarios cross-organización desde este endpoint.
- El token de sesión se genera con `crypto.randomBytes(32).toString("hex")` en el propio caso de uso de dominio (operación pura, sin I/O — no requiere un puerto/adaptador, igual que la generación de IDs en otros casos de uso).
- Nunca ejecutar `git commit`/`git push` automáticamente salvo instrucción explícita del usuario (como en el resto de esta sesión).

---

## Pre-flight: lo que ya existe y se reutiliza

- `UsuarioAdmin.passwordHash` ya existe en el schema (se sembró con `bcrypt.hash` en `seed.ts`) — este plan no lo toca, solo lo consume.
- `packages/domain/use-cases/CrearUsuarioAdmin.ts` y `packages/domain/services/AuthorizationService.ts` ya existen (plan de dominio hexagonal) — este plan los expone por HTTP, no los reescribe.
- `packages/infrastructure/persistence/prisma/PrismaUsuarioAdminRepository.ts` ya existe con el método `crear` — este plan le agrega `buscarPorId` y `buscarCredencialesPorEmail`.
- `apps/web-admin/lib/prisma.ts` (singleton de Prisma) se reutiliza sin cambios.

---

### Task 1: Modelo `Sesion` en el schema

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

**Interfaces:**
- Produces: tabla `Sesion`, consumida por `PrismaSesionRepository` (Tarea 4).

- [ ] **Step 1: Agregar el modelo y la relación inversa en `UsuarioAdmin`**

Dentro de `model UsuarioAdmin`, agregar al final (junto a `registrosAuditoria`):

```prisma
  sesiones           Sesion[]
```

Agregar el modelo nuevo después de `RegistroAuditoria`:

```prisma
model Sesion {
  id        String       @id @default(cuid())
  token     String       @unique
  usuarioId String
  usuario   UsuarioAdmin @relation(fields: [usuarioId], references: [id])
  expiraEn  DateTime
  createdAt DateTime     @default(now())
}
```

- [ ] **Step 2: Formatear, validar y generar (sin DB)**

Run: `cd packages/db && npx prisma format && npx prisma validate && npx prisma generate`
Expected: `The schema at prisma/schema.prisma is valid 🚀` y `✔ Generated Prisma Client...`.

- [ ] **Step 3: Commit**

```bash
git add packages/db/prisma/schema.prisma
git commit -m "feat: agrega modelo Sesion para autenticación del panel admin"
```

**Nota:** aplicar esta migración contra la base real es la Tarea 10 (requiere red hacia la DB — la corre el usuario). Es una tabla nueva, sin filas existentes que backfillear — no debería repetir el problema del `apiKey` de la sesión anterior.

---

### Task 2: Entidad `Sesion` + puertos nuevos/extendidos

**Files:**
- Create: `packages/domain/entities/Sesion.ts`
- Create: `packages/domain/ports/IPasswordHasher.ts`
- Create: `packages/domain/ports/ISesionRepository.ts`
- Modify: `packages/domain/ports/IUsuarioAdminRepository.ts`

**Interfaces:**
- Produces: contratos que las Tareas 3–4 consumen.

- [ ] **Step 1: `packages/domain/entities/Sesion.ts`**

```typescript
export interface Sesion {
  id: string;
  token: string;
  usuarioId: string;
  expiraEn: Date;
}
```

- [ ] **Step 2: `packages/domain/ports/IPasswordHasher.ts`**

```typescript
export interface IPasswordHasher {
  hash(password: string): Promise<string>;
  comparar(password: string, hash: string): Promise<boolean>;
}
```

- [ ] **Step 3: `packages/domain/ports/ISesionRepository.ts`**

```typescript
import { Sesion } from "../entities/Sesion";

export interface ISesionRepository {
  crear(datos: { usuarioId: string; token: string; expiraEn: Date }): Promise<Sesion>;
  buscarPorToken(token: string): Promise<Sesion | null>;
  eliminarPorToken(token: string): Promise<void>;
}
```

- [ ] **Step 4: Extender `packages/domain/ports/IUsuarioAdminRepository.ts`**

Reemplazar el contenido completo del archivo:

```typescript
import { UsuarioAdmin, RolUsuario } from "../entities/UsuarioAdmin";

export interface IUsuarioAdminRepository {
  crear(datos: {
    organizacionId: string;
    sucursalId: string | null;
    email: string;
    passwordHash: string;
    rol: RolUsuario;
  }): Promise<UsuarioAdmin>;
  buscarPorId(id: string): Promise<UsuarioAdmin | null>;
  buscarCredencialesPorEmail(
    email: string
  ): Promise<{ usuario: UsuarioAdmin; passwordHash: string } | null>;
}
```

- [ ] **Step 5: Commit**

```bash
git add packages/domain/entities/Sesion.ts packages/domain/ports/IPasswordHasher.ts packages/domain/ports/ISesionRepository.ts packages/domain/ports/IUsuarioAdminRepository.ts
git commit -m "feat: agrega entidad Sesion y puertos IPasswordHasher/ISesionRepository"
```

---

### Task 3: Casos de uso `IniciarSesion`, `CerrarSesion`, `ValidarSesion`

**Files:**
- Create: `packages/domain/use-cases/IniciarSesion.ts`
- Create: `packages/domain/use-cases/CerrarSesion.ts`
- Create: `packages/domain/use-cases/ValidarSesion.ts`

**Interfaces:**
- Consumes: puertos de la Tarea 2.
- Produces: funciones consumidas por las rutas API (Tareas 6–7) y el helper de sesión (Tarea 5).

- [ ] **Step 1: `packages/domain/use-cases/IniciarSesion.ts`**

```typescript
import { randomBytes } from "node:crypto";
import { IUsuarioAdminRepository } from "../ports/IUsuarioAdminRepository";
import { IPasswordHasher } from "../ports/IPasswordHasher";
import { ISesionRepository } from "../ports/ISesionRepository";
import { UsuarioAdmin } from "../entities/UsuarioAdmin";

const DURACION_SESION_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

export interface IniciarSesionDeps {
  usuarios: IUsuarioAdminRepository;
  hasher: IPasswordHasher;
  sesiones: ISesionRepository;
}

export interface IniciarSesionInput {
  email: string;
  password: string;
}

export interface IniciarSesionResultado {
  token: string;
  expiraEn: Date;
  usuario: UsuarioAdmin;
}

export class CredencialesInvalidasError extends Error {
  constructor() {
    super("Email o contraseña incorrectos.");
  }
}

export async function iniciarSesion(
  deps: IniciarSesionDeps,
  input: IniciarSesionInput
): Promise<IniciarSesionResultado> {
  const credenciales = await deps.usuarios.buscarCredencialesPorEmail(input.email);

  if (!credenciales) {
    throw new CredencialesInvalidasError();
  }

  const passwordValido = await deps.hasher.comparar(input.password, credenciales.passwordHash);

  if (!passwordValido) {
    throw new CredencialesInvalidasError();
  }

  const token = randomBytes(32).toString("hex");
  const expiraEn = new Date(Date.now() + DURACION_SESION_MS);

  await deps.sesiones.crear({ usuarioId: credenciales.usuario.id, token, expiraEn });

  return { token, expiraEn, usuario: credenciales.usuario };
}
```

- [ ] **Step 2: `packages/domain/use-cases/CerrarSesion.ts`**

```typescript
import { ISesionRepository } from "../ports/ISesionRepository";

export interface CerrarSesionDeps {
  sesiones: ISesionRepository;
}

export async function cerrarSesion(deps: CerrarSesionDeps, token: string): Promise<void> {
  await deps.sesiones.eliminarPorToken(token);
}
```

- [ ] **Step 3: `packages/domain/use-cases/ValidarSesion.ts`**

```typescript
import { ISesionRepository } from "../ports/ISesionRepository";
import { IUsuarioAdminRepository } from "../ports/IUsuarioAdminRepository";
import { UsuarioAdmin } from "../entities/UsuarioAdmin";

export interface ValidarSesionDeps {
  sesiones: ISesionRepository;
  usuarios: IUsuarioAdminRepository;
}

export async function validarSesion(deps: ValidarSesionDeps, token: string): Promise<UsuarioAdmin | null> {
  const sesion = await deps.sesiones.buscarPorToken(token);

  if (!sesion) {
    return null;
  }

  if (sesion.expiraEn <= new Date()) {
    await deps.sesiones.eliminarPorToken(token);
    return null;
  }

  return deps.usuarios.buscarPorId(sesion.usuarioId);
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/domain/use-cases/IniciarSesion.ts packages/domain/use-cases/CerrarSesion.ts packages/domain/use-cases/ValidarSesion.ts
git commit -m "feat: agrega casos de uso IniciarSesion, CerrarSesion, ValidarSesion"
```

---

### Task 4: Adaptadores — `BcryptPasswordHasher`, `PrismaSesionRepository`, extender `PrismaUsuarioAdminRepository`

**Files:**
- Modify: `packages/infrastructure/package.json` (agregar `bcryptjs`)
- Create: `packages/infrastructure/auth/BcryptPasswordHasher.ts`
- Create: `packages/infrastructure/persistence/prisma/PrismaSesionRepository.ts`
- Modify: `packages/infrastructure/persistence/prisma/PrismaUsuarioAdminRepository.ts`

**Interfaces:**
- Consumes: puertos de la Tarea 2.
- Produces: implementaciones concretas que las rutas API (Tareas 6–7) instancian.

- [ ] **Step 1: Agregar `bcryptjs` a `packages/infrastructure/package.json`**

```json
{
  "name": "@gym-app/infrastructure",
  "version": "0.0.0",
  "private": true,
  "dependencies": {
    "@gym-app/db": "*",
    "@gym-app/domain": "*",
    "bcryptjs": "^3.0.3"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.6"
  }
}
```

- [ ] **Step 2: `packages/infrastructure/auth/BcryptPasswordHasher.ts`**

```typescript
import bcrypt from "bcryptjs";
import type { IPasswordHasher } from "@gym-app/domain/ports/IPasswordHasher";

const SALT_ROUNDS = 10;

export class BcryptPasswordHasher implements IPasswordHasher {
  async hash(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
  }

  async comparar(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
}
```

- [ ] **Step 3: `packages/infrastructure/persistence/prisma/PrismaSesionRepository.ts`**

```typescript
import type { PrismaClient } from "@gym-app/db/generated/prisma/client";
import type { ISesionRepository } from "@gym-app/domain/ports/ISesionRepository";
import type { Sesion } from "@gym-app/domain/entities/Sesion";

export class PrismaSesionRepository implements ISesionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async crear(datos: { usuarioId: string; token: string; expiraEn: Date }): Promise<Sesion> {
    const sesion = await this.prisma.sesion.create({ data: datos });
    return { id: sesion.id, token: sesion.token, usuarioId: sesion.usuarioId, expiraEn: sesion.expiraEn };
  }

  async buscarPorToken(token: string): Promise<Sesion | null> {
    const sesion = await this.prisma.sesion.findUnique({ where: { token } });
    if (!sesion) return null;
    return { id: sesion.id, token: sesion.token, usuarioId: sesion.usuarioId, expiraEn: sesion.expiraEn };
  }

  async eliminarPorToken(token: string): Promise<void> {
    // deleteMany en vez de delete: un logout de un token ya vencido/inexistente
    // no debe lanzar error (idempotente).
    await this.prisma.sesion.deleteMany({ where: { token } });
  }
}
```

- [ ] **Step 4: Extender `packages/infrastructure/persistence/prisma/PrismaUsuarioAdminRepository.ts`**

Reemplazar el contenido completo del archivo:

```typescript
import type { PrismaClient } from "@gym-app/db/generated/prisma/client";
import type { IUsuarioAdminRepository } from "@gym-app/domain/ports/IUsuarioAdminRepository";
import type { UsuarioAdmin } from "@gym-app/domain/entities/UsuarioAdmin";

function mapear(usuario: {
  id: string;
  organizacionId: string;
  sucursalId: string | null;
  rol: UsuarioAdmin["rol"];
  email: string;
}): UsuarioAdmin {
  return {
    id: usuario.id,
    organizacionId: usuario.organizacionId,
    sucursalId: usuario.sucursalId,
    rol: usuario.rol,
    email: usuario.email,
  };
}

export class PrismaUsuarioAdminRepository implements IUsuarioAdminRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async crear(datos: {
    organizacionId: string;
    sucursalId: string | null;
    email: string;
    passwordHash: string;
    rol: UsuarioAdmin["rol"];
  }): Promise<UsuarioAdmin> {
    const usuario = await this.prisma.usuarioAdmin.create({ data: datos });
    return mapear(usuario);
  }

  async buscarPorId(id: string): Promise<UsuarioAdmin | null> {
    const usuario = await this.prisma.usuarioAdmin.findUnique({ where: { id } });
    if (!usuario) return null;
    return mapear(usuario);
  }

  async buscarCredencialesPorEmail(
    email: string
  ): Promise<{ usuario: UsuarioAdmin; passwordHash: string } | null> {
    const usuario = await this.prisma.usuarioAdmin.findUnique({ where: { email } });
    if (!usuario) return null;
    return { usuario: mapear(usuario), passwordHash: usuario.passwordHash };
  }
}
```

- [ ] **Step 5: Reinstalar**

Run: `npm install` (desde la raíz)
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/infrastructure/package.json packages/infrastructure/auth/BcryptPasswordHasher.ts packages/infrastructure/persistence/prisma/PrismaSesionRepository.ts packages/infrastructure/persistence/prisma/PrismaUsuarioAdminRepository.ts package-lock.json
git commit -m "feat: agrega BcryptPasswordHasher, PrismaSesionRepository, extiende PrismaUsuarioAdminRepository"
```

---

### Task 5: Helper de sesión en `apps/web-admin`

**Files:**
- Create: `apps/web-admin/lib/sesion.ts`

**Interfaces:**
- Consumes: `validarSesion` (Tarea 3), `PrismaSesionRepository`/`PrismaUsuarioAdminRepository` (Tarea 4), `prisma` de `lib/prisma.ts`.
- Produces: `obtenerUsuarioDeSesion` y `NOMBRE_COOKIE_SESION`, consumidos por las Tareas 6–7.

- [ ] **Step 1: Implementar**

```typescript
// lib/sesion.ts
// Helper para leer y validar la sesión del admin desde la cookie httpOnly.
// Cada ruta protegida llama a obtenerUsuarioDeSesion al inicio — no hay
// middleware.ts todavía (solo una ruta protegida por ahora, ver el plan).
import { NextRequest } from "next/server";
import { prisma } from "./prisma";
import { PrismaSesionRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSesionRepository";
import { PrismaUsuarioAdminRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaUsuarioAdminRepository";
import { validarSesion } from "@gym-app/domain/use-cases/ValidarSesion";
import { UsuarioAdmin } from "@gym-app/domain/entities/UsuarioAdmin";

export const NOMBRE_COOKIE_SESION = "sesion_token";

export async function obtenerUsuarioDeSesion(req: NextRequest): Promise<UsuarioAdmin | null> {
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
```

- [ ] **Step 2: Commit**

```bash
git add apps/web-admin/lib/sesion.ts
git commit -m "feat: agrega helper obtenerUsuarioDeSesion"
```

---

### Task 6: Rutas `/api/auth/login` y `/api/auth/logout`

**Files:**
- Create: `apps/web-admin/app/api/auth/login/route.ts`
- Create: `apps/web-admin/app/api/auth/logout/route.ts`

**Interfaces:**
- Consumes: `iniciarSesion`/`cerrarSesion` (Tarea 3), adaptadores (Tarea 4), `NOMBRE_COOKIE_SESION` (Tarea 5).
- Produces: los endpoints que la página de login (Tarea 8) y las pruebas manuales (Tarea 10) usan.

- [ ] **Step 1: `apps/web-admin/app/api/auth/login/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { NOMBRE_COOKIE_SESION } from "@/lib/sesion";
import { PrismaUsuarioAdminRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaUsuarioAdminRepository";
import { PrismaSesionRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSesionRepository";
import { BcryptPasswordHasher } from "@gym-app/infrastructure/auth/BcryptPasswordHasher";
import { iniciarSesion, CredencialesInvalidasError } from "@gym-app/domain/use-cases/IniciarSesion";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email y contraseña son requeridos." },
        { status: 400 }
      );
    }

    const resultado = await iniciarSesion(
      {
        usuarios: new PrismaUsuarioAdminRepository(prisma),
        hasher: new BcryptPasswordHasher(),
        sesiones: new PrismaSesionRepository(prisma),
      },
      { email, password }
    );

    const response = NextResponse.json({
      usuario: {
        id: resultado.usuario.id,
        email: resultado.usuario.email,
        rol: resultado.usuario.rol,
      },
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
    console.error("Error en login:", error);
    return NextResponse.json(
      { error: "Error interno al iniciar sesión." },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: `apps/web-admin/app/api/auth/logout/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { NOMBRE_COOKIE_SESION } from "@/lib/sesion";
import { PrismaSesionRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSesionRepository";
import { cerrarSesion } from "@gym-app/domain/use-cases/CerrarSesion";

export async function POST(req: NextRequest) {
  const token = req.cookies.get(NOMBRE_COOKIE_SESION)?.value;

  if (token) {
    await cerrarSesion({ sesiones: new PrismaSesionRepository(prisma) }, token);
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.delete(NOMBRE_COOKIE_SESION);
  return response;
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web-admin/app/api/auth
git commit -m "feat: agrega rutas /api/auth/login y /api/auth/logout"
```

---

### Task 7: Ruta protegida `/api/usuarios` (expone `CrearUsuarioAdmin`)

**Files:**
- Create: `apps/web-admin/app/api/usuarios/route.ts`

**Interfaces:**
- Consumes: `obtenerUsuarioDeSesion` (Tarea 5), `crearUsuarioAdmin`/`AuthorizationService` (ya existentes del plan de dominio hexagonal), `BcryptPasswordHasher`/`PrismaUsuarioAdminRepository` (Tarea 4).

- [ ] **Step 1: Implementar**

```typescript
// app/api/usuarios/route.ts
// Crea un UsuarioAdmin nuevo — protegido por sesión. La regla de quién puede
// crear a quién vive en AuthorizationService (packages/domain), no aquí.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesion } from "@/lib/sesion";
import { PrismaUsuarioAdminRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaUsuarioAdminRepository";
import { BcryptPasswordHasher } from "@gym-app/infrastructure/auth/BcryptPasswordHasher";
import { AuthorizationService } from "@gym-app/domain/services/AuthorizationService";
import { crearUsuarioAdmin, NoAutorizadoError } from "@gym-app/domain/use-cases/CrearUsuarioAdmin";

export async function POST(req: NextRequest) {
  try {
    const solicitante = await obtenerUsuarioDeSesion(req);

    if (!solicitante) {
      return NextResponse.json({ error: "No autenticado." }, { status: 401 });
    }

    const { email, password, rol, sucursalId } = await req.json();

    if (!email || !password || !rol) {
      return NextResponse.json(
        { error: "email, password y rol son requeridos." },
        { status: 400 }
      );
    }

    const hasher = new BcryptPasswordHasher();
    const passwordHash = await hasher.hash(password);

    const creado = await crearUsuarioAdmin(
      {
        usuarios: new PrismaUsuarioAdminRepository(prisma),
        autorizacion: new AuthorizationService(),
      },
      {
        solicitante: { rol: solicitante.rol },
        organizacionId: solicitante.organizacionId,
        sucursalId: sucursalId ?? null,
        email,
        passwordHash,
        rol,
      }
    );

    return NextResponse.json(
      { id: creado.id, email: creado.email, rol: creado.rol },
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

- [ ] **Step 2: Commit**

```bash
git add apps/web-admin/app/api/usuarios
git commit -m "feat: agrega POST /api/usuarios (CrearUsuarioAdmin protegido por sesión)"
```

---

### Task 8: Página de login (UI mínima)

**Files:**
- Create: `apps/web-admin/app/login/page.tsx`

**Interfaces:**
- Consumes: `POST /api/auth/login` (Tarea 6).

- [ ] **Step 1: Implementar**

```tsx
// app/login/page.tsx
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function manejarSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    setCargando(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Error al iniciar sesión.");
      return;
    }

    router.push("/");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
      <form
        onSubmit={manejarSubmit}
        className="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-black/[.08] bg-white p-8 dark:border-white/[.145] dark:bg-zinc-900"
      >
        <h1 className="text-xl font-semibold text-black dark:text-zinc-50">Iniciar sesión</h1>

        {error && (
          <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}

        <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded border border-black/[.08] px-3 py-2 dark:border-white/[.145] dark:bg-zinc-800 dark:text-zinc-50"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
          Contraseña
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded border border-black/[.08] px-3 py-2 dark:border-white/[.145] dark:bg-zinc-800 dark:text-zinc-50"
          />
        </label>

        <button
          type="submit"
          disabled={cargando}
          className="rounded-full bg-foreground px-5 py-2 text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
        >
          {cargando ? "Ingresando..." : "Ingresar"}
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web-admin/app/login
git commit -m "feat: agrega página de login mínima"
```

---

### Task 9: Build + verificación de tipos (sin DB)

**Files:** ninguno — tarea de verificación.

- [ ] **Step 1: Verificar tipos**

Run: `cd apps/web-admin && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 2: Build completo**

Run: `cd ../.. && npx turbo run build --filter=web-admin`
Expected: exit 0, sin advertencia de dependencia circular.

- [ ] **Step 3: Lint**

Run: `npx turbo run lint --filter=web-admin`
Expected: exit 0.

- [ ] **Step 4: No hay commit en esta tarea** — solo verificación. Si algo falla, volver a la tarea correspondiente.

---

### Task 10: Migrar y probar contra la base real (requiere red — lo corre el usuario)

**Files:** ninguno — tarea de verificación.

- [ ] **Step 1: Migrar**

```powershell
cd packages\db
npx prisma migrate dev --name sesion_admin
```

Expected: al ser una tabla nueva sin filas que backfillear, debería aplicarse directo sin pedir reset.

- [ ] **Step 2: Subir la migración al repo**

```powershell
cd ..\..
git add packages/db/prisma/migrations
git commit -m "feat: agrega migración sesion_admin"
git push origin main
```

- [ ] **Step 3: Levantar el servidor**

```powershell
npm run dev
```

- [ ] **Step 4: Probar login con credenciales incorrectas**

```powershell
curl.exe -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{\"email\":\"admin@gymdemo.com\",\"password\":\"incorrecta\"}'
```

Expected: `401`, `{"error":"Email o contraseña incorrectos."}`.

- [ ] **Step 5: Probar login correcto** (usa el admin del seed: `admin@gymdemo.com` / `admin1234`) **y guardar la cookie**

```powershell
curl.exe -c cookies.txt -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{\"email\":\"admin@gymdemo.com\",\"password\":\"admin1234\"}'
```

Expected: `200`, `{"usuario":{"id":"...","email":"admin@gymdemo.com","rol":"DUENO"}}`, y se crea `cookies.txt` con la cookie de sesión.

- [ ] **Step 6: Probar `/api/usuarios` SIN sesión (debe rechazar)**

```powershell
curl.exe -X POST http://localhost:3000/api/usuarios -H "Content-Type: application/json" -d '{\"email\":\"nuevo@gymdemo.com\",\"password\":\"nuevo1234\",\"rol\":\"RECEPCION\"}'
```

Expected: `401`, `{"error":"No autenticado."}`.

- [ ] **Step 7: Probar `/api/usuarios` CON sesión (DUENO crea RECEPCION — debe funcionar)**

```powershell
curl.exe -b cookies.txt -X POST http://localhost:3000/api/usuarios -H "Content-Type: application/json" -d '{\"email\":\"nuevo@gymdemo.com\",\"password\":\"nuevo1234\",\"rol\":\"RECEPCION\"}'
```

Expected: `201`, `{"id":"...","email":"nuevo@gymdemo.com","rol":"RECEPCION"}`.

- [ ] **Step 8: Probar logout, y que la sesión ya no sirva**

```powershell
curl.exe -b cookies.txt -X POST http://localhost:3000/api/auth/logout
curl.exe -b cookies.txt -X POST http://localhost:3000/api/usuarios -H "Content-Type: application/json" -d '{\"email\":\"otro@gymdemo.com\",\"password\":\"otro1234\",\"rol\":\"RECEPCION\"}'
```

Expected: el logout responde `{"ok":true}`; el segundo `/api/usuarios` responde `401` (la sesión ya fue borrada de la base).

- [ ] **Step 9: Probar la página de login en el navegador**

Abrir `http://localhost:3000/login`, ingresar `admin@gymdemo.com` / `admin1234`, confirmar que redirige a `/` sin error.

- [ ] **Step 10: No hay commit en esta tarea** (salvo el de la migración en el Step 2) — el resto es solo verificación.

---

## Fuera de alcance de este plan (explícitamente diferido)

- Dashboard real del panel admin — tras el login, la app redirige a `/`, que sigue siendo la página default de Next.js. Construir la UI del panel es un plan aparte.
- Rate limiting / bloqueo de cuenta tras intentos fallidos de login.
- Recuperación de contraseña ("forgot password").
- `middleware.ts` de Next.js para proteger rutas por patrón automáticamente — se protege ruta por ruta mientras solo haya una; graduar cuando haya más (mismo principio anti-sobre-ingeniería del ADR).
- Expiración deslizante de sesión (hoy es fija: 7 días desde el login, no se extiende con el uso).
- "Cerrar todas mis sesiones" (hoy el logout borra solo la sesión del token actual).

## Execution Handoff

Dos opciones de ejecución:

**1. Subagent-Driven (recomendado)** — un subagente fresco por tarea, revisión entre tareas.

**2. Inline Execution** — ejecuto las Tareas 1–9 yo mismo en esta sesión (no requieren red hacia la DB), y la Tarea 10 la corres tú.

¿Cuál prefieres?
