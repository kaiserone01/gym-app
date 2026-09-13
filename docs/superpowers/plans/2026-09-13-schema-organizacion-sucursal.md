# Migración de Schema a Organización/Sucursal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar `schema.prisma` del modelo single-tenant (`Gym`) al modelo SaaS multi-tenant `Organizacion → Sucursal → Miembro` con `Plan`/`Suscripcion`/`PlanSucursalAcceso`, `RolUsuario`, `RegistroAuditoria` y `TemaOrganizacion` (ADR-001 v1 sección 6 + v2 sección 13, todos aprobados por el usuario), moviendo el schema a `packages/db` (v1 sección 5) y corrigiendo la topología de `packages/*` creada con una suposición incorrecta en el plan anterior.

**Architecture:** `packages/db` pasa a ser el único dueño de `schema.prisma` y del cliente Prisma generado — ningún otro paquete corre `prisma generate`. `apps/web-admin` consume `@gym-app/db` como dependencia de workspace. La capa de dominio hexagonal (`entities`/`use-cases`/`ports`/adaptadores, incluyendo `RegistrarCheckIn` como caso de uso real y `ValidarAccesoSucursalPorPlan`) queda **fuera de este plan** — es un subsistema independiente con sus propias decisiones de contratos de puertos (v1 pregunta abierta #5, sección 10, nunca cerrada por la v2). Este plan solo hace el mínimo cambio en `app/api/checkin/route.ts` para que siga compilando contra el nuevo schema y aplica la corrección de idempotencia ya aprobada (query de existencia, sin caso de uso todavía).

**Tech Stack:** Prisma 7 (`@prisma/adapter-pg`, generator `prisma-client`), PostgreSQL, Next.js 16 App Router, npm workspaces, Turborepo.

**Spec:** `docs/adr/ADR-001-gym-app-sesion.md` (v1, secciones 5, 6, 7) y `docs/adr/ADR-001-gym-app-sesion-v2.md` (v2, secciones 13–16). Decisiones de la Tarea 7 del plan anterior, confirmadas por el usuario:

| Pregunta (ADR v2 §16) | Decisión |
|---|---|
| Doble check-in en la ventana de idempotencia | Responder con el existente (no crear duplicado) |
| Entrenador ↔ Sucursal | Entrenador pertenece a una Sucursal fija |
| TemaOrganizacion override por Sucursal | No — una marca por Organización (regla dura) |
| Permisos de GERENTE sobre RECEPCION | Exclusivo de DUEÑO (se aplicará en el plan de dominio/autorización, no hay enforcement en este plan) |
| Modelos Plan/Suscripcion/PlanSucursalAcceso (§13.1) | Aprobado tal cual |
| Enum RolUsuario (§13.2) | Aprobado tal cual |
| RegistroAuditoria (§13.3) | Aprobado tal cual |
| Fuente API BCV (§13.5) | Categoría "API no oficial" (pydolarve/dolarapi) — la integración real (`BcvApiAdapter`) es del plan de dominio, no de este |

## Global Constraints

- Modificar únicamente `schema.prisma` para cambios de datos; correr `npx prisma format` y `npx prisma validate` antes de migrar; migrar con `npx prisma migrate dev --name <nombre_descriptivo>`; nunca tocar el motor de base de datos a mano (regla del proyecto).
- `packages/db`: "solo schema.prisma + cliente generado (sin lógica)" (ADR v1 §5) — no lleva código de dominio ni singleton con adaptador; eso sigue en `apps/web-admin/lib/prisma.ts`.
- No se implementa en este plan: `ValidarAccesoSucursalPorPlan` como caso de uso real, ni la redefinición de `estadoAlMomento` en función de `Suscripcion` — el check-in sigue calculando `estadoAlMomento` comparando `Miembro.fechaVencimiento`, exactamente como hoy, hasta el plan de dominio hexagonal.
- No se implementa en este plan la validación de sesión/token del kiosco (hallazgo 🔴 crítico del ADR v1 §3.1: `sucursalId` seguirá viajando en el body del request) — es trabajo de `IKioskAuthValidator`/`packages/infrastructure/auth`, explícitamente fuera de alcance aquí. Se documenta como riesgo abierto en el handoff de cierre.
- Nunca ejecutar `git commit`/`git push`/PR automáticamente — el working tree queda con los cambios; se sugieren mensajes de commit en Conventional Commits (español) al final.

---

## Pre-flight: estado verificado del repo antes de este plan

- `apps/web-admin/prisma/schema.prisma` sigue en el modelo `Gym` single-tenant (sin migrar) — confirmado.
- `packages/database`, `packages/domain`, `packages/ui` existen pero **no coinciden** con la topología real de la v1 §5 (creados con una suposición sin acceso al documento v1). Este plan los corrige en la Tarea 1.
- `apps/web-admin/lib/prisma.ts` y `apps/web-admin/prisma/seed.ts` importan `PrismaClient` desde `../app/generated/prisma/client` — ambos cambian de ruta de import en este plan (Tareas 3 y 6).
- `apps/web-admin/prisma/seed.ts` usa el modelo viejo (`gym`, `gymId`, `rol: "dueño"` como string) — se reescribe completo en la Tarea 6.

---

### Task 1: Corregir la topología de `packages/*` para igualar la v1 exacta

**Files:**
- Move: `packages/database/` → `packages/db/` (contenido temporal, se sobreescribe en Tarea 2)
- Modify: `packages/domain/package.json` (sin cambios de contenido, solo se agregan subcarpetas)
- Create: `packages/domain/entities/.gitkeep`, `packages/domain/use-cases/.gitkeep`, `packages/domain/ports/.gitkeep`
- Create: `packages/domain-custom/.gitkeep`
- Create: `packages/infrastructure/package.json`, `packages/infrastructure/exchange-rate/.gitkeep`, `packages/infrastructure/persistence/prisma/.gitkeep`, `packages/infrastructure/auth/.gitkeep`
- Create: `packages/design-system/package.json`, `packages/design-system/.gitkeep`
- Create: `packages/theming/package.json`, `packages/theming/.gitkeep`
- Create: `packages/config/package.json`, `packages/config/.gitkeep`

**Interfaces:**
- Consumes: `workspaces: ["apps/*", "packages/*"]` (ya existe en `package.json` raíz).
- Produces: `packages/db` como workspace vacío listo para la Tarea 2; el resto de paquetes quedan como placeholders vacíos (sin código) para planes futuros — ninguno se consume en este plan.

- [ ] **Step 1: Mover `packages/database` a `packages/db`**

```bash
git mv packages/database packages/db
```

- [ ] **Step 2: Crear las subcarpetas vacías de `packages/domain`**

```bash
mkdir -p packages/domain/entities packages/domain/use-cases packages/domain/ports
touch packages/domain/entities/.gitkeep packages/domain/use-cases/.gitkeep packages/domain/ports/.gitkeep
```

- [ ] **Step 3: Crear `packages/domain-custom` (namespace vacío, sin `package.json` — no es un workspace en sí, es el contenedor de sub-paquetes por cliente que se agregarán cuando exista un cliente real)**

```bash
mkdir -p packages/domain-custom
touch packages/domain-custom/.gitkeep
```

- [ ] **Step 4: Crear `packages/infrastructure` con sus subcarpetas**

```bash
mkdir -p packages/infrastructure/exchange-rate packages/infrastructure/persistence/prisma packages/infrastructure/auth
touch packages/infrastructure/exchange-rate/.gitkeep packages/infrastructure/persistence/prisma/.gitkeep packages/infrastructure/auth/.gitkeep
```

`packages/infrastructure/package.json`:
```json
{
  "name": "@gym-app/infrastructure",
  "version": "0.0.0",
  "private": true
}
```

- [ ] **Step 5: Crear `packages/design-system`, `packages/theming`, `packages/config`**

```bash
mkdir -p packages/design-system packages/theming packages/config
touch packages/design-system/.gitkeep packages/theming/.gitkeep packages/config/.gitkeep
```

`packages/design-system/package.json`:
```json
{
  "name": "@gym-app/design-system",
  "version": "0.0.0",
  "private": true
}
```

`packages/theming/package.json`:
```json
{
  "name": "@gym-app/theming",
  "version": "0.0.0",
  "private": true
}
```

`packages/config/package.json`:
```json
{
  "name": "@gym-app/config",
  "version": "0.0.0",
  "private": true
}
```

- [ ] **Step 6: Reinstalar para que npm registre los nuevos workspaces**

Run: `npm install`
Expected: exit code 0, sin errores de workspace duplicado o inválido.

- [ ] **Step 7: Commit**

```bash
git add packages
git commit -m "chore: corrige topología de packages/* para igualar ADR-001 v1 sección 5"
```

---

### Task 2: Mover `prisma/` de `apps/web-admin` a `packages/db`

**Files:**
- Move: `apps/web-admin/prisma/` → `packages/db/prisma/`
- Move: `apps/web-admin/prisma7.config.ts` → `packages/db/prisma7.config.ts`
- Modify: `packages/db/package.json` (reemplaza el placeholder de la Tarea 1)
- Modify: `apps/web-admin/package.json` (agrega dependencia de workspace `@gym-app/db`, quita `prisma`/`@prisma/client`/`@prisma/adapter-pg` que ahora vive en `packages/db`)

**Interfaces:**
- Consumes: `packages/db` vacío de la Tarea 1.
- Produces: `@gym-app/db` como paquete instalable desde `apps/web-admin` (resuelto vía symlink de npm workspaces); `packages/db/prisma/schema.prisma` es el único schema del monorepo, consumido por la Tarea 3.

- [ ] **Step 1: Mover el directorio `prisma/` y el config**

```bash
git mv apps/web-admin/prisma packages/db/prisma
git mv apps/web-admin/prisma7.config.ts packages/db/prisma7.config.ts
```

- [ ] **Step 2: Actualizar `packages/db/prisma7.config.ts` para cargar `.env` desde la raíz del repo (antes cargaba desde el cwd de `apps/web-admin`; ahora el cwd al correr `prisma` será `packages/db`, dos niveles más profundo que la raíz)**

```typescript
// This file was generated by Prisma, and assumes you have installed the following:
// npm install --save-dev prisma dotenv
import { config } from "dotenv";
import path from "node:path";
import { defineConfig } from "prisma/config";

config({ path: path.resolve(__dirname, "../../.env") });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
```

- [ ] **Step 3: Reemplazar `packages/db/package.json`**

```json
{
  "name": "@gym-app/db",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "generate": "prisma generate",
    "migrate:dev": "prisma migrate dev",
    "db:seed": "prisma db seed"
  },
  "dependencies": {
    "@prisma/client": "^7.10.0",
    "@prisma/adapter-pg": "^7.10.0"
  },
  "devDependencies": {
    "prisma": "^7.10.0",
    "dotenv": "^17.4.2",
    "tsx": "^4.23.13",
    "bcryptjs": "^3.0.3",
    "@types/bcryptjs": "^2.4.6"
  }
}
```

(`bcryptjs` se necesita aquí porque `prisma/seed.ts`, reescrito en la Tarea 6, sigue hasheando el password del admin de prueba.)

- [ ] **Step 4: Quitar de `apps/web-admin/package.json` las dependencias que ahora vive en `@gym-app/db`, y agregar la dependencia de workspace**

Reemplazar el bloque `dependencies` de `apps/web-admin/package.json`:

```json
{
  "dependencies": {
    "@gym-app/db": "*",
    "dotenv": "^17.4.2",
    "next": "16.3.4",
    "react": "19.2.8",
    "react-dom": "19.2.8"
  }
}
```

(Sale `@prisma/adapter-pg`, `@prisma/client`, `bcryptjs`, `prisma` — entran a `@gym-app/db`. `bcryptjs` sigue siendo necesario en `apps/web-admin` si el login del panel admin lo usa directamente; **no se toca `bcryptjs` de `apps/web-admin/devDependencies`** — solo se quita de `dependencies` si estaba duplicado. Verificar con `grep bcryptjs apps/web-admin/package.json` antes de este paso y ajustar según lo que exista realmente, sin asumir.)

- [ ] **Step 5: Reinstalar desde la raíz**

Run: `npm install`
Expected: exit code 0; `node_modules/@gym-app/db` existe como symlink a `packages/db`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: mueve prisma/ de apps/web-admin a packages/db"
```

---

### Task 3: Escribir el `schema.prisma` completo con los modelos aprobados

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

**Interfaces:**
- Consumes: nada de tareas anteriores (es el archivo que se reescribe).
- Produces: todos los modelos/enums que las Tareas 4–8 consumen: `Organizacion`, `Sucursal`, `UsuarioAdmin`, `RolUsuario`, `Entrenador`, `Miembro`, `PlanTipo`, `Plan`, `TipoAccesoPlan`, `PlanSucursalAcceso`, `Suscripcion`, `EstadoSuscripcion`, `Pago`, `CheckIn`, `TasaCambio`, `TemaOrganizacion`, `RegistroAuditoria`.

- [ ] **Step 1: Reemplazar el contenido completo de `packages/db/prisma/schema.prisma`**

```prisma
// This is your Prisma schema file,
// learn more about it in the docs: https://pris.ly/d/prisma-schema

generator client {
  provider = "prisma-client"
  output   = "../generated/prisma"
}

datasource db {
  provider = "postgresql"
}

// ── gym-app: modelos SaaS multi-tenant (ADR-001 v1 §6 + v2 §13) ──────────

model Organizacion {
  id        String   @id @default(cuid())
  nombre    String
  slug      String   @unique
  plan      String   @default("basico")
  createdAt DateTime @default(now())

  sucursales    Sucursal[]
  usuariosAdmin UsuarioAdmin[]
  miembros      Miembro[]
  planes        Plan[]
  tema          TemaOrganizacion?
}

model Sucursal {
  id             String       @id @default(cuid())
  organizacionId String
  organizacion   Organizacion @relation(fields: [organizacionId], references: [id])
  nombre         String
  direccion      String?
  diasGracia     Int          @default(0) // días después del vencimiento antes de marcar "vencido"
  tasaCambioUSD  Decimal?     @db.Decimal(10, 2) // fallback manual si la API BCV falla (ver ADR v1 §7)
  createdAt      DateTime     @default(now())

  usuariosAdmin UsuarioAdmin[]
  entrenadores  Entrenador[]
  checkIns      CheckIn[]
  planesAcceso  PlanSucursalAcceso[]
}

enum RolUsuario {
  DUENO      // acceso total a la Organización, todas las sucursales
  GERENTE    // administra 1+ sucursales asignadas
  RECEPCION  // solo check-in, cobros y consulta de estado de miembros
  ENTRENADOR // acceso de solo lectura a su cartera de miembros asignados
}

model UsuarioAdmin {
  id             String       @id @default(cuid())
  organizacionId String
  organizacion   Organizacion @relation(fields: [organizacionId], references: [id])
  sucursalId     String?      // null = acceso a toda la organización (dueño/gerente general)
  sucursal       Sucursal?    @relation(fields: [sucursalId], references: [id])
  rol            RolUsuario
  email          String       @unique
  passwordHash   String
  createdAt      DateTime     @default(now())

  registrosAuditoria RegistroAuditoria[]
}

model Entrenador {
  id         String   @id @default(cuid())
  sucursalId String   // Entrenador pertenece a una Sucursal fija (decisión aprobada, ADR v2 §16)
  sucursal   Sucursal @relation(fields: [sucursalId], references: [id])
  nombre     String
  telefono   String?
  activo     Boolean  @default(true)

  miembros Miembro[]
}

enum PlanTipo {
  SIN_ENTRENADOR
  CON_ENTRENADOR
}

model Miembro {
  id               String    @id @default(cuid())
  organizacionId   String    // el Miembro cuelga de la Organización, no de una Sucursal (ADR v1 §4.1)
  organizacion     Organizacion @relation(fields: [organizacionId], references: [id])
  nombre           String
  cedula           String    // única POR organización (ver @@unique abajo)
  fechaNacimiento  DateTime?
  celular          String?
  fotoUrl          String?
  entrenadorId     String?
  entrenador       Entrenador? @relation(fields: [entrenadorId], references: [id])
  planTipo         PlanTipo  @default(SIN_ENTRENADOR) // recargo por entrenador personal — independiente del Plan/Suscripcion de acceso a sucursales
  precioPlan       Decimal   @db.Decimal(10, 2)
  fechaUltimoPago  DateTime?
  fechaVencimiento DateTime?
  activo           Boolean   @default(true) // baja lógica del miembro
  createdAt        DateTime  @default(now())

  pagos         Pago[]
  checkIns      CheckIn[]
  suscripciones Suscripcion[]

  @@unique([organizacionId, cedula])
}

enum TipoAccesoPlan {
  SEDE_UNICA           // acceso a 1 sola sucursal, definida en PlanSucursalAcceso
  LISTA_CERRADA        // acceso a un subconjunto explícito de sucursales
  TODA_LA_ORGANIZACION // "VIP Multi-sede": acceso a todas las sucursales actuales y futuras
}

model Plan {
  id             String   @id @default(cuid())
  organizacionId String
  organizacion   Organizacion @relation(fields: [organizacionId], references: [id])
  nombre         String   // "Sede Única", "VIP Multi-sede"
  tipoAcceso     TipoAccesoPlan
  precioUSD      Decimal  @db.Decimal(10, 2)
  activo         Boolean  @default(true)

  suscripciones    Suscripcion[]
  sucursalesAcceso PlanSucursalAcceso[] // solo relevante si tipoAcceso = SEDE_UNICA o LISTA_CERRADA
}

model PlanSucursalAcceso {
  planId     String
  sucursalId String
  plan       Plan     @relation(fields: [planId], references: [id])
  sucursal   Sucursal @relation(fields: [sucursalId], references: [id])

  @@id([planId, sucursalId])
}

enum EstadoSuscripcion {
  ACTIVA
  VENCIDA
  CANCELADA
  PAUSADA
}

model Suscripcion {
  id        String   @id @default(cuid())
  miembroId String
  miembro   Miembro  @relation(fields: [miembroId], references: [id])
  planId    String
  plan      Plan     @relation(fields: [planId], references: [id])
  inicio    DateTime
  fin       DateTime
  estado    EstadoSuscripcion @default(ACTIVA)
  createdAt DateTime @default(now())
}

model Pago {
  id        String   @id @default(cuid())
  miembroId String
  miembro   Miembro  @relation(fields: [miembroId], references: [id])
  monto     Decimal  @db.Decimal(10, 2)
  metodo    String   // "efectivo_usd" | "efectivo_bs" | "pago_movil" | etc.
  tasaCambio Decimal? @db.Decimal(10, 2) // tasa usada si fue pago en bolívares
  fechaPago DateTime @default(now())
}

model CheckIn {
  id              String   @id @default(cuid())
  sucursalId      String   // el CheckIn siempre queda atado a la Sucursal física (ADR v1 §4.1)
  sucursal        Sucursal @relation(fields: [sucursalId], references: [id])
  miembroId       String
  miembro         Miembro  @relation(fields: [miembroId], references: [id])
  fechaHora       DateTime @default(now())
  estadoAlMomento String   // "activo" | "vencido" — snapshot histórico, no cambia si luego el miembro paga
}

model TasaCambio {
  id        String   @id @default(cuid())
  fecha     DateTime @unique // día calendario
  valor     Decimal  @db.Decimal(12, 4)
  fuente    String   // "BCV" | "BINANCE_P2P" | "MANUAL"
  createdAt DateTime @default(now())
}

model TemaOrganizacion {
  organizacionId  String       @id
  organizacion    Organizacion @relation(fields: [organizacionId], references: [id])
  colorPrimario   String
  colorSecundario String?
  logoUrl         String?
  fuenteId        String       @default("inter") // catálogo curado, no texto libre
  layoutPreset    String       @default("clasico") // "clasico" | "moderno" | "compacto"
}

model RegistroAuditoria {
  id            String       @id @default(cuid())
  entidad       String       // "Suscripcion", "Miembro", etc.
  entidadId     String
  campo         String       // "fin", "estado"
  valorAnterior String
  valorNuevo    String
  motivo        String
  usuarioId     String
  usuario       UsuarioAdmin @relation(fields: [usuarioId], references: [id])
  createdAt     DateTime     @default(now())
}
```

- [ ] **Step 2: Formatear y validar**

Run: `cd packages/db && npx prisma format && npx prisma validate`
Expected: `prisma format` reescribe el archivo con alineación consistente (sin error); `prisma validate` imprime `The schema at prisma/schema.prisma is valid 🚀`.

- [ ] **Step 3: Commit**

```bash
git add packages/db/prisma/schema.prisma
git commit -m "feat: migra schema.prisma a Organizacion/Sucursal/Plan/Suscripcion/RolUsuario/RegistroAuditoria"
```

---

### Task 4: Generar el cliente Prisma y correr la migración

**Files:**
- Create (generado, no versionado): `packages/db/generated/prisma/**`
- Create (generado por Prisma): `packages/db/prisma/migrations/<timestamp>_organizacion_sucursal/migration.sql`

**Interfaces:**
- Consumes: `packages/db/prisma/schema.prisma` de la Tarea 3.
- Produces: cliente `PrismaClient` en `packages/db/generated/prisma` que la Tarea 5 importa; tabla de migraciones actualizada en la base de datos configurada por `DATABASE_URL`.

- [ ] **Step 1: Confirmar que `DATABASE_URL` está disponible**

Run: `cd packages/db && node -e "require('dotenv').config({path:'../../.env'}); console.log(process.env.DATABASE_URL ? 'OK' : 'FALTA')"`
Expected: imprime `OK`. Si imprime `FALTA`, detenerse aquí y pedir la variable al usuario antes de continuar — **no seguir sin `DATABASE_URL` real**, migrar contra una base equivocada no es recuperable con un rollback simple.

- [ ] **Step 2: Generar el cliente**

Run: `cd packages/db && npx prisma generate`
Expected: `✔ Generated Prisma Client (7.10.0) to ./generated/prisma`.

- [ ] **Step 3: Crear y aplicar la migración**

Run: `cd packages/db && npx prisma migrate dev --name organizacion_sucursal_plan_suscripcion`
Expected: Prisma detecta el drift respecto a la migración `20260908121026_init` existente, pide confirmación para resetear la base de desarrollo (dado que el modelo cambia de raíz — `Gym` deja de existir), y al confirmar aplica la nueva migración limpia. **Esto borra los datos de la base de desarrollo actual** — si hay datos que preservar, exportarlos antes de este paso (fuera de alcance de este plan; avisar al usuario si la base tiene datos reales, no solo de prueba).

- [ ] **Step 4: No hay commit de código en esta tarea** (los archivos generados en `packages/db/generated/` no se versionan — confirmar que `.gitignore` ya los cubre con el patrón `**/app/generated/prisma` heredado del plan anterior; si no cubre `packages/db/generated`, agregar `**/generated/prisma` a `.gitignore` en un commit separado antes de continuar). Sí hay commit del archivo de migración SQL generado:

```bash
git add packages/db/prisma/migrations .gitignore
git commit -m "feat: agrega migración organizacion_sucursal_plan_suscripcion"
```

---

### Task 5: Actualizar `apps/web-admin/lib/prisma.ts` para importar desde `@gym-app/db`

**Files:**
- Modify: `apps/web-admin/lib/prisma.ts`

**Interfaces:**
- Consumes: `PrismaClient` generado por `@gym-app/db` (Tarea 4).
- Produces: `prisma` (instancia singleton) que la Tarea 7 sigue consumiendo sin cambios de contrato.

- [ ] **Step 1: Cambiar el import**

```typescript
// lib/prisma.ts
// Cliente único de Prisma, reutilizado en toda la app (evita múltiples conexiones en desarrollo)

import { PrismaClient } from "@gym-app/db/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

(`@prisma/adapter-pg` debe quedar también en `apps/web-admin/package.json` `dependencies` si `lib/prisma.ts` lo importa directamente aquí — confirmar que la Tarea 2 Step 4 no lo quitó por error; si lo quitó, restaurarlo.)

- [ ] **Step 2: Verificar que TypeScript resuelve el import**

Run: `cd apps/web-admin && npx tsc --noEmit`
Expected: exit code 0, sin error `Cannot find module '@gym-app/db/generated/prisma/client'`.

- [ ] **Step 3: Commit**

```bash
git add apps/web-admin/lib/prisma.ts apps/web-admin/package.json
git commit -m "refactor: lib/prisma.ts importa el cliente generado desde @gym-app/db"
```

---

### Task 6: Reescribir `packages/db/prisma/seed.ts` para el nuevo modelo

**Files:**
- Modify: `packages/db/prisma/seed.ts`

**Interfaces:**
- Consumes: todos los modelos de la Tarea 3; `PrismaClient` de `../generated/prisma/client` (ruta relativa, ya que el seed vive dentro de `packages/db`).
- Produces: datos de prueba que la Tarea 8 usa para probar `/api/checkin` manualmente.

- [ ] **Step 1: Reemplazar el contenido completo de `packages/db/prisma/seed.ts`**

```typescript
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  // 1. Organización + Sucursal de prueba
  const organizacion = await prisma.organizacion.create({
    data: { nombre: "Gym Demo", slug: "gym-demo" },
  });
  console.log("✅ Organización creada:", organizacion.nombre);

  const sucursal = await prisma.sucursal.create({
    data: {
      organizacionId: organizacion.id,
      nombre: "Sede Principal",
      diasGracia: 3,
      tasaCambioUSD: 40.5,
    },
  });
  console.log("✅ Sucursal creada:", sucursal.nombre);

  await prisma.temaOrganizacion.create({
    data: {
      organizacionId: organizacion.id,
      colorPrimario: "#1D4ED8",
      logoUrl: null,
    },
  });
  console.log("✅ TemaOrganizacion creado");

  // 2. Usuario admin (dueño)
  const passwordHash = await bcrypt.hash("admin1234", 10);
  const admin = await prisma.usuarioAdmin.create({
    data: {
      organizacionId: organizacion.id,
      email: "admin@gymdemo.com",
      passwordHash,
      rol: "DUENO",
    },
  });
  console.log("✅ Admin creado:", admin.email, "(password: admin1234)");

  // 3. Entrenador (pertenece a la Sucursal, decisión aprobada)
  const entrenador = await prisma.entrenador.create({
    data: {
      sucursalId: sucursal.id,
      nombre: "Carlos Fitness",
      telefono: "0414-1234567",
    },
  });
  console.log("✅ Entrenador creado:", entrenador.nombre);

  // 4. Plan "Sede Única" con acceso a esta sucursal, y una Suscripcion activa
  const planSedeUnica = await prisma.plan.create({
    data: {
      organizacionId: organizacion.id,
      nombre: "Sede Única",
      tipoAcceso: "SEDE_UNICA",
      precioUSD: 25.0,
      sucursalesAcceso: {
        create: { sucursalId: sucursal.id },
      },
    },
  });
  console.log("✅ Plan creado:", planSedeUnica.nombre);

  // 5. Miembros de prueba (mismos casos que antes: activo, vencido, sin entrenador)
  const hoy = new Date();
  const en20Dias = new Date(hoy);
  en20Dias.setDate(hoy.getDate() + 20);
  const hace10Dias = new Date(hoy);
  hace10Dias.setDate(hoy.getDate() - 10);

  const miembroActivo = await prisma.miembro.create({
    data: {
      organizacionId: organizacion.id,
      nombre: "Rayza Aray",
      cedula: "19141319",
      celular: "0424-3332331",
      entrenadorId: entrenador.id,
      planTipo: "CON_ENTRENADOR",
      precioPlan: 30.0,
      fechaUltimoPago: hoy,
      fechaVencimiento: en20Dias,
    },
  });
  await prisma.suscripcion.create({
    data: {
      miembroId: miembroActivo.id,
      planId: planSedeUnica.id,
      inicio: hoy,
      fin: en20Dias,
      estado: "ACTIVA",
    },
  });
  console.log("✅ Miembro activo creado:", miembroActivo.nombre);

  const miembroVencido = await prisma.miembro.create({
    data: {
      organizacionId: organizacion.id,
      nombre: "Julio César Bastidas",
      cedula: "13264442",
      celular: "0424-5302270",
      planTipo: "SIN_ENTRENADOR",
      precioPlan: 25.0,
      fechaUltimoPago: hace10Dias,
      fechaVencimiento: hace10Dias,
    },
  });
  console.log("✅ Miembro vencido creado:", miembroVencido.nombre);

  const miembroSinEntrenador = await prisma.miembro.create({
    data: {
      organizacionId: organizacion.id,
      nombre: "Rodrigo Lara",
      cedula: "9275030",
      celular: "0424-9275030",
      planTipo: "SIN_ENTRENADOR",
      precioPlan: 25.0,
      fechaUltimoPago: hoy,
      fechaVencimiento: en20Dias,
    },
  });
  console.log("✅ Miembro sin entrenador creado:", miembroSinEntrenador.nombre);

  console.log("\n🎉 Seed completado con éxito.");
  console.log(`   sucursalId de prueba para /api/checkin: ${sucursal.id}`);
}

main()
  .catch((e) => {
    console.error("❌ Error en el seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 2: Correr el seed**

Run: `cd packages/db && npx prisma db seed`
Expected: imprime los 8 mensajes `✅`/`🎉` de arriba sin errores, termina con la línea `sucursalId de prueba para /api/checkin: <id>` — **anotar ese id**, se usa en la Tarea 8.

- [ ] **Step 3: Commit**

```bash
git add packages/db/prisma/seed.ts
git commit -m "feat: reescribe seed.ts para Organizacion/Sucursal/Plan/Suscripcion"
```

---

### Task 7: Actualizar `app/api/checkin/route.ts` — compilar contra el nuevo schema + idempotencia aprobada

**Files:**
- Modify: `apps/web-admin/app/api/checkin/route.ts`

**Interfaces:**
- Consumes: `prisma` de `apps/web-admin/lib/prisma.ts` (Tarea 5); modelos `Sucursal`, `Miembro`, `CheckIn` (Tarea 3).
- Produces: mismo contrato de respuesta JSON que antes (`nombre`, `fotoUrl`, `fechaVencimiento`, `entrenador`, `planTipo`, `estado`) — compatible con cualquier cliente del kiosco existente.

**Nota de alcance (ver Global Constraints):** este cambio es el mínimo necesario para compilar + la corrección de idempotencia ya aprobada. No implementa `ValidarAccesoSucursalPorPlan` ni valida el `sucursalId` contra un token del kiosco — ambos quedan para el plan de dominio hexagonal.

- [ ] **Step 1: Reemplazar el contenido completo del archivo**

```typescript
// app/api/checkin/route.ts
// Endpoint de check-in: recibe una cédula y el id de la sucursal física, busca al
// miembro dentro de la organización dueña de esa sucursal, calcula si está al día,
// registra el CheckIn (o responde con uno reciente ya existente) y devuelve los
// datos para mostrar en pantalla.
//
// Regla de estado: si hoy es posterior a fechaVencimiento, el miembro está "vencido".
// (Nota: esta regla usa Miembro.fechaVencimiento sin cambios; la validación de acceso
// por Plan/Suscripcion —ValidarAccesoSucursalPorPlan— es trabajo del plan de dominio
// hexagonal, no de este cambio.)
//
// Idempotencia (ADR-001 v2 §13.4, aprobada): si ya existe un CheckIn del mismo
// miembro en esta sucursal dentro de la ventana, se responde con ese registro en
// vez de crear uno nuevo.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const VENTANA_IDEMPOTENCIA_MINUTOS = 2;

export async function POST(req: NextRequest) {
  try {
    const { cedula, sucursalId } = await req.json();

    if (!cedula || !sucursalId) {
      return NextResponse.json(
        { error: "Cédula y sucursalId son requeridos." },
        { status: 400 }
      );
    }

    // 1. Resolver la Sucursal → su Organización (el tenant nunca viene directo del body)
    const sucursal = await prisma.sucursal.findUnique({
      where: { id: sucursalId },
    });

    if (!sucursal) {
      return NextResponse.json(
        { error: "Sucursal no encontrada." },
        { status: 404 }
      );
    }

    // 2. Buscar al miembro por cédula dentro de esa organización
    const miembro = await prisma.miembro.findUnique({
      where: {
        organizacionId_cedula: {
          organizacionId: sucursal.organizacionId,
          cedula,
        },
      },
      include: {
        entrenador: true,
      },
    });

    if (!miembro) {
      return NextResponse.json(
        { error: "No se encontró ningún miembro con esa cédula." },
        { status: 404 }
      );
    }

    // 3. Idempotencia: ¿ya hay un CheckIn reciente de este miembro en esta sucursal?
    const desde = new Date(Date.now() - VENTANA_IDEMPOTENCIA_MINUTOS * 60_000);
    const checkInExistente = await prisma.checkIn.findFirst({
      where: {
        miembroId: miembro.id,
        sucursalId: sucursal.id,
        fechaHora: { gte: desde },
      },
      orderBy: { fechaHora: "desc" },
    });

    if (checkInExistente) {
      return NextResponse.json({
        nombre: miembro.nombre,
        fotoUrl: miembro.fotoUrl,
        fechaVencimiento: miembro.fechaVencimiento,
        entrenador: miembro.entrenador?.nombre ?? null,
        planTipo: miembro.planTipo,
        estado: checkInExistente.estadoAlMomento,
      });
    }

    // 4. Calcular si está al día (comparación directa, sin días de gracia)
    const hoy = new Date();
    let estaAlDia = true;

    if (miembro.fechaVencimiento) {
      estaAlDia = hoy <= new Date(miembro.fechaVencimiento);
    } else {
      estaAlDia = false;
    }

    const estadoAlMomento = estaAlDia ? "activo" : "vencido";

    // 5. Registrar el CheckIn (historial de entradas)
    await prisma.checkIn.create({
      data: {
        sucursalId: sucursal.id,
        miembroId: miembro.id,
        estadoAlMomento,
      },
    });

    // 6. Responder con los datos que la pantalla del kiosco necesita mostrar
    return NextResponse.json({
      nombre: miembro.nombre,
      fotoUrl: miembro.fotoUrl,
      fechaVencimiento: miembro.fechaVencimiento,
      entrenador: miembro.entrenador?.nombre ?? null,
      planTipo: miembro.planTipo,
      estado: estadoAlMomento,
    });
  } catch (error) {
    console.error("Error en check-in:", error);
    return NextResponse.json(
      { error: "Error interno al procesar el check-in." },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web-admin/app/api/checkin/route.ts
git commit -m "fix: adapta /api/checkin a Sucursal/Organizacion y agrega idempotencia"
```

---

### Task 8: Validar build + prueba manual de `/api/checkin`

**Files:** ninguno — tarea de verificación.

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: confirmación de que el monorepo compila y el endpoint responde correctamente contra los datos del seed.

- [ ] **Step 1: Build completo vía Turborepo**

Run: `npx turbo run build`
Expected: exit code 0; `@gym-app/db` no tiene script `build` (se omite, no falla); `web-admin#build` compila sin errores de tipos.

- [ ] **Step 2: Levantar el servidor de desarrollo**

Run: `npm run dev` (en background o en otra terminal)
Expected: Next.js arranca en `http://localhost:3000` sin errores.

- [ ] **Step 3: Probar el check-in con un miembro activo (usar el `sucursalId` impreso por el seed en la Tarea 6)**

```bash
curl -s -X POST http://localhost:3000/api/checkin \
  -H "Content-Type: application/json" \
  -d '{"cedula":"19141319","sucursalId":"<sucursalId-del-seed>"}'
```

Expected: JSON con `"estado":"activo"`, `"nombre":"Rayza Aray"`, `"entrenador":"Carlos Fitness"`.

- [ ] **Step 4: Repetir la misma llamada inmediatamente (probar idempotencia)**

Run: el mismo `curl` del Step 3, sin esperar.

Expected: misma respuesta (200), y en la base de datos solo existe **un** `CheckIn` para ese miembro (verificar con `npx prisma studio` desde `packages/db`, o `SELECT count(*) FROM "CheckIn" WHERE "miembroId" = '<id>'` — debe dar 1, no 2).

- [ ] **Step 5: Probar con un miembro vencido**

```bash
curl -s -X POST http://localhost:3000/api/checkin \
  -H "Content-Type: application/json" \
  -d '{"cedula":"13264442","sucursalId":"<sucursalId-del-seed>"}'
```

Expected: `"estado":"vencido"`.

- [ ] **Step 6: Probar con una sucursal inexistente**

```bash
curl -s -X POST http://localhost:3000/api/checkin \
  -H "Content-Type: application/json" \
  -d '{"cedula":"19141319","sucursalId":"no-existe"}'
```

Expected: `404`, `{"error":"Sucursal no encontrada."}`.

- [ ] **Step 7: No hay commit en esta tarea** — es solo verificación. Si algún paso falla, volver a la tarea correspondiente, corregir, y solo entonces continuar.

---

## Fuera de alcance de este plan (explícitamente diferido)

- `ValidarAccesoSucursalPorPlan` como caso de uso real y la redefinición de `estadoAlMomento` en función de `Suscripcion` en vez de `Miembro.fechaVencimiento`.
- Validación de sesión/token del kiosco (`IKioskAuthValidator`) — `sucursalId` sigue viajando sin firmar en el body (hallazgo 🔴 crítico del ADR v1 §3.1, no cerrado por este plan).
- Capa de dominio hexagonal completa: `entities`, `use-cases`, `ports`, adaptadores (`packages/domain`, `packages/infrastructure` quedan con la estructura de carpetas de la Tarea 1, pero vacíos de código).
- Integración real de la API BCV (`BcvApiAdapter`, `apps/worker`, `ActualizarTasaDiaria`) — la tabla `TasaCambio` existe en el schema pero no hay ningún proceso que la llene todavía.
- Enforcement de que `GERENTE` no pueda crear `UsuarioAdmin` de rol `RECEPCION` — es una regla de autorización (`IAuthorizationService`), no de schema; no hay endpoint todavía que cree `UsuarioAdmin` fuera del seed.
- Login del panel admin (`bcryptjs` ya está en las dependencias correctas, pero no existe ninguna ruta de login).

## Execution Handoff

Dos opciones de ejecución:

**1. Subagent-Driven (recomendado)** — un subagente fresco por tarea, revisión entre tareas, iteración rápida.

**2. Inline Execution** — ejecutar las tareas en esta misma sesión usando executing-plans, por lotes con checkpoints.

¿Cuál prefieres?
