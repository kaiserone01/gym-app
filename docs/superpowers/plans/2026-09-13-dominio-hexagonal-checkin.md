# Dominio Hexagonal — Check-in y Autorización Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar la capa de dominio hexagonal (`packages/domain`, `packages/infrastructure`) para el flujo de check-in, reemplazando la lógica inline de `app/api/checkin/route.ts` por el caso de uso `RegistrarCheckIn` (con `ValidarAccesoSucursalPorPlan` real, basado en `Suscripcion`/`Plan`), y cerrar el hallazgo 🔴 crítico del ADR (sucursalId sin validar) con autenticación por API key de sucursal. Incluye también `CrearUsuarioAdmin` + `IAuthorizationService` para la regla ya aprobada (crear `UsuarioAdmin` es exclusivo de `DUENO`).

**Architecture:** `packages/domain` (entidades planas + puertos + casos de uso, cero imports de Prisma/Next.js) consumido por `packages/infrastructure` (adaptadores Prisma + validador de API key del kiosco) y por `apps/web-admin` (route handlers delgados que inyectan los adaptadores concretos). Ni `packages/domain` ni `packages/infrastructure` tienen paso de build propio — Next.js las transpila vía `transpilePackages`, igual que el resto del monorepo no tiene compilación separada por paquete.

**Tech Stack:** TypeScript (sin clases de dominio con estado — funciones + interfaces), Prisma 7 (solo en los adaptadores), Next.js App Router.

**Spec:** `docs/adr/ADR-001-gym-app-sesion.md` (v1 §4.2, §4.5, §5) y `docs/adr/ADR-001-gym-app-sesion-v2.md` (v2 §13.1, §13.2, §16). Decisiones de esta sesión:

| Pregunta | Decisión |
|---|---|
| Autenticación del kiosco | Campo `apiKey String @unique` en `Sucursal`, enviado por el kiosco en el header `X-Kiosk-Api-Key`. El `sucursalId` deja de venir del body — se resuelve server-side a partir de la API key. |
| Fuente de `estadoAlMomento` | Se migra de `Miembro.fechaVencimiento` a `Suscripcion`/`Plan` (ADR v2 §13.1) — `ValidarAccesoSucursalPorPlan` pasa a ser la única fuente de verdad. |
| Alcance | Incluye también `IAuthorizationService` + `CrearUsuarioAdmin` (regla: crear `UsuarioAdmin` es exclusivo de `DUENO` — no se modela una matriz de permisos más granular, per ADR v1 §13.2, hasta que un segundo caso de uso real lo exija). |

## Global Constraints

- `packages/domain` no importa nada de `packages/infrastructure`, `next`, ni `@prisma/client`/`@gym-app/db` — solo tipos propios (regla arquitectónica dura, ADR v1 §5).
- Los casos de uso son funciones async que reciben sus dependencias (puertos) como primer parámetro — no clases con estado, no un contenedor de DI. Es el patrón más simple que satisface la regla de inversión de dependencias sin herramientas nuevas.
- `packages/domain`/`packages/infrastructure` no tienen `devDependencies.typescript` propio ni paso de `tsc` independiente — se verifican a través de `apps/web-admin` (que sí los transpila) y de los scripts en `packages/db` que los importan directamente.
- **Decisión de diseño explícita (no preguntada, revisar en el self-review):** si hay una `Suscripcion` `ACTIVA` vigente pero su `Plan` no cubre la `Sucursal` del check-in (`SEDE_UNICA`/`LISTA_CERRADA` sin esa sucursal en `PlanSucursalAcceso`), el resultado es `"vencido"` — igual que no tener ninguna suscripción activa. No existe un tercer estado ("sin acceso") porque `CheckIn.estadoAlMomento` sigue siendo `String` de 2 valores; la ADR v2 §13.1 no especifica este caso exacto, así que se trata como "no tiene acceso válido aquí ahora mismo" = vencido, consistente con la regla de no bloquear la operación física.
- La respuesta de `/api/checkin` deja de incluir `fechaVencimiento` (ya no es la fuente del estado) — es un cambio de contrato de la API; no hay ningún cliente de kiosco real construido todavía, así que el riesgo es bajo, pero queda documentado aquí.
- Nunca ejecutar `git commit`/`git push` automáticamente salvo instrucción explícita del usuario (como en el resto de esta sesión, donde sí se pidió commitear/pushear a `main`).

---

## Pre-flight: lo que ya existe y no se toca

- `packages/domain/{entities,use-cases,ports}` y `packages/infrastructure/{exchange-rate,persistence/prisma,auth}` ya existen vacíos (Tarea 1 del plan de schema) — este plan los llena.
- `apps/web-admin/app/api/checkin/route.ts` actual (con `sucursalId` en el body, sin autenticación) sigue funcionando hasta la Tarea 10 de este plan, que lo reemplaza.
- `packages/db/prisma/seed.ts` actual ya crea `Rayza Aray` con una `Suscripcion` `ACTIVA` vigente sobre `planSedeUnica` (con acceso a la sucursal de prueba) y a `Julio César Bastidas` sin ninguna `Suscripcion` — bajo la lógica nueva, ambos ya producen el resultado esperado (`activo`/`vencido`) sin cambios. Solo `Rodrigo Lara` (hoy sin `Suscripcion`, pensado como caso "activo sin entrenador") necesita una `Suscripcion` nueva en la Tarea 11 para no convertirse accidentalmente en "vencido".

---

### Task 1: Agregar `apiKey` a `Sucursal` y migrar

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

**Interfaces:**
- Produces: `Sucursal.apiKey` (String, único, autogenerado), consumido por `KioskTokenValidator` en la Tarea 8.

- [ ] **Step 1: Agregar el campo al modelo `Sucursal`**

En `packages/db/prisma/schema.prisma`, dentro de `model Sucursal`, agregar después de `createdAt`:

```prisma
  apiKey         String       @unique @default(uuid()) // el kiosco se autentica con esto (header X-Kiosk-Api-Key), nunca manda sucursalId directo (ADR v1 §4.2)
```

- [ ] **Step 2: Formatear y validar**

Run: `cd packages/db && npx prisma format && npx prisma validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 3: Generar el cliente (no requiere DB)**

Run: `npx prisma generate`
Expected: `✔ Generated Prisma Client...`

- [ ] **Step 4: Commit**

```bash
git add packages/db/prisma/schema.prisma
git commit -m "feat: agrega apiKey a Sucursal para autenticar el kiosco"
```

**Nota:** aplicar esta migración contra la base real (`npx prisma migrate dev --name sucursal_api_key`) requiere red hacia `31.220.56.1:5456` — lo corre el usuario, como en el plan anterior. Se hace al final, en la Tarea 12, junto con el resto de la verificación contra datos reales, para no bloquear el resto del plan (Tareas 2–11 no tocan la base de datos).

---

### Task 2: Entidades de dominio

**Files:**
- Create: `packages/domain/entities/Sucursal.ts`
- Create: `packages/domain/entities/Miembro.ts`
- Create: `packages/domain/entities/Suscripcion.ts`
- Create: `packages/domain/entities/CheckIn.ts`
- Create: `packages/domain/entities/UsuarioAdmin.ts`

**Interfaces:**
- Produces: los tipos que todos los puertos y casos de uso de las Tareas 3–6 usan.

- [ ] **Step 1: `packages/domain/entities/Sucursal.ts`**

```typescript
export interface Sucursal {
  id: string;
  organizacionId: string;
  nombre: string;
  apiKey: string;
}
```

- [ ] **Step 2: `packages/domain/entities/Miembro.ts`**

```typescript
export type PlanTipo = "SIN_ENTRENADOR" | "CON_ENTRENADOR";

export interface Miembro {
  id: string;
  organizacionId: string;
  nombre: string;
  cedula: string;
  fotoUrl: string | null;
  entrenadorNombre: string | null;
  planTipo: PlanTipo;
}
```

- [ ] **Step 3: `packages/domain/entities/Suscripcion.ts`**

```typescript
export type TipoAccesoPlan = "SEDE_UNICA" | "LISTA_CERRADA" | "TODA_LA_ORGANIZACION";
export type EstadoSuscripcion = "ACTIVA" | "VENCIDA" | "CANCELADA" | "PAUSADA";

export interface Plan {
  id: string;
  organizacionId: string;
  tipoAcceso: TipoAccesoPlan;
}

export interface Suscripcion {
  id: string;
  miembroId: string;
  plan: Plan;
  inicio: Date;
  fin: Date;
  estado: EstadoSuscripcion;
}
```

- [ ] **Step 4: `packages/domain/entities/CheckIn.ts`**

```typescript
export type EstadoCheckIn = "activo" | "vencido";

export interface CheckIn {
  id: string;
  sucursalId: string;
  miembroId: string;
  fechaHora: Date;
  estadoAlMomento: EstadoCheckIn;
}
```

- [ ] **Step 5: `packages/domain/entities/UsuarioAdmin.ts`**

```typescript
export type RolUsuario = "DUENO" | "GERENTE" | "RECEPCION" | "ENTRENADOR";

export interface UsuarioAdmin {
  id: string;
  organizacionId: string;
  sucursalId: string | null;
  rol: RolUsuario;
  email: string;
}
```

- [ ] **Step 6: Commit**

```bash
git add packages/domain/entities
git commit -m "feat: agrega entidades de dominio (Sucursal, Miembro, Suscripcion, CheckIn, UsuarioAdmin)"
```

---

### Task 3: Puertos de dominio

**Files:**
- Create: `packages/domain/ports/IMemberRepository.ts`
- Create: `packages/domain/ports/ISucursalRepository.ts`
- Create: `packages/domain/ports/ISuscripcionRepository.ts`
- Create: `packages/domain/ports/ICheckInRepository.ts`
- Create: `packages/domain/ports/IUsuarioAdminRepository.ts`
- Create: `packages/domain/ports/IKioskAuthValidator.ts`
- Create: `packages/domain/ports/IAuthorizationService.ts`

**Interfaces:**
- Consumes: entidades de la Tarea 2.
- Produces: contratos que los adaptadores (Tareas 7–8) implementan y los casos de uso (Tareas 4–6) consumen.

- [ ] **Step 1: `packages/domain/ports/IMemberRepository.ts`**

```typescript
import { Miembro } from "../entities/Miembro";

export interface IMemberRepository {
  buscarPorOrganizacionYCedula(organizacionId: string, cedula: string): Promise<Miembro | null>;
}
```

- [ ] **Step 2: `packages/domain/ports/ISucursalRepository.ts`**

```typescript
import { Sucursal } from "../entities/Sucursal";

export interface ISucursalRepository {
  buscarPorApiKey(apiKey: string): Promise<Sucursal | null>;
}
```

- [ ] **Step 3: `packages/domain/ports/ISuscripcionRepository.ts`**

```typescript
import { Suscripcion } from "../entities/Suscripcion";

export interface ISuscripcionRepository {
  buscarActivaVigentePorMiembro(miembroId: string, fecha: Date): Promise<Suscripcion | null>;
  tieneAccesoASucursal(planId: string, sucursalId: string): Promise<boolean>;
}
```

- [ ] **Step 4: `packages/domain/ports/ICheckInRepository.ts`**

```typescript
import { CheckIn, EstadoCheckIn } from "../entities/CheckIn";

export interface ICheckInRepository {
  buscarRecientePorMiembroYSucursal(
    miembroId: string,
    sucursalId: string,
    desde: Date
  ): Promise<CheckIn | null>;
  crear(datos: { sucursalId: string; miembroId: string; estadoAlMomento: EstadoCheckIn }): Promise<CheckIn>;
}
```

- [ ] **Step 5: `packages/domain/ports/IUsuarioAdminRepository.ts`**

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
}
```

- [ ] **Step 6: `packages/domain/ports/IKioskAuthValidator.ts`**

```typescript
import { Sucursal } from "../entities/Sucursal";

export interface IKioskAuthValidator {
  validar(apiKey: string): Promise<Sucursal | null>;
}
```

- [ ] **Step 7: `packages/domain/ports/IAuthorizationService.ts`**

```typescript
import { RolUsuario } from "../entities/UsuarioAdmin";

export interface IAuthorizationService {
  puedeCrearUsuarioConRol(rolSolicitante: RolUsuario, rolACrear: RolUsuario): boolean;
}
```

- [ ] **Step 8: Commit**

```bash
git add packages/domain/ports
git commit -m "feat: agrega puertos de dominio (repositorios, auth del kiosco, autorización)"
```

---

### Task 4: Caso de uso `ValidarAccesoSucursalPorPlan`

**Files:**
- Create: `packages/domain/use-cases/ValidarAccesoSucursalPorPlan.ts`

**Interfaces:**
- Consumes: `ISuscripcionRepository` (Tarea 3).
- Produces: `validarAccesoSucursalPorPlan`, consumido por `RegistrarCheckIn` (Tarea 5).

- [ ] **Step 1: Implementar la regla del ADR v2 §13.1**

```typescript
// packages/domain/use-cases/ValidarAccesoSucursalPorPlan.ts
import { ISuscripcionRepository } from "../ports/ISuscripcionRepository";
import { EstadoCheckIn } from "../entities/CheckIn";

export interface ValidarAccesoSucursalPorPlanDeps {
  suscripciones: ISuscripcionRepository;
}

export async function validarAccesoSucursalPorPlan(
  deps: ValidarAccesoSucursalPorPlanDeps,
  miembroId: string,
  sucursalId: string,
  ahora: Date = new Date()
): Promise<EstadoCheckIn> {
  const suscripcion = await deps.suscripciones.buscarActivaVigentePorMiembro(miembroId, ahora);

  // Sin suscripción activa vigente: se registra igual el check-in (no bloquear
  // la operación física), pero como "vencido" (ADR v2 §13.1, regla 3).
  if (!suscripcion) {
    return "vencido";
  }

  if (suscripcion.plan.tipoAcceso === "TODA_LA_ORGANIZACION") {
    return "activo";
  }

  // SEDE_UNICA o LISTA_CERRADA: válido solo si esta Sucursal está en
  // PlanSucursalAcceso (ADR v2 §13.1, regla 2). Si no, se trata igual que
  // "vencido" — ver Global Constraints de este plan.
  const tieneAcceso = await deps.suscripciones.tieneAccesoASucursal(suscripcion.plan.id, sucursalId);
  return tieneAcceso ? "activo" : "vencido";
}
```

- [ ] **Step 2: Verificación manual (sin framework de tests en el repo — se prueba end-to-end en la Tarea 12)**

No hay paso ejecutable aquí todavía: este archivo no tiene consumidores hasta la Tarea 5. `tsc` lo valida sintácticamente en la Tarea 9.

- [ ] **Step 3: Commit**

```bash
git add packages/domain/use-cases/ValidarAccesoSucursalPorPlan.ts
git commit -m "feat: agrega caso de uso ValidarAccesoSucursalPorPlan"
```

---

### Task 5: Caso de uso `RegistrarCheckIn`

**Files:**
- Create: `packages/domain/use-cases/RegistrarCheckIn.ts`

**Interfaces:**
- Consumes: `IMemberRepository`, `ICheckInRepository`, `ISuscripcionRepository` (Tarea 3), `validarAccesoSucursalPorPlan` (Tarea 4).
- Produces: `registrarCheckIn` y `MiembroNoEncontradoError`, consumidos por `app/api/checkin/route.ts` (Tarea 10).

- [ ] **Step 1: Implementar el caso de uso**

```typescript
// packages/domain/use-cases/RegistrarCheckIn.ts
import { IMemberRepository } from "../ports/IMemberRepository";
import { ICheckInRepository } from "../ports/ICheckInRepository";
import { ISuscripcionRepository } from "../ports/ISuscripcionRepository";
import { PlanTipo } from "../entities/Miembro";
import { EstadoCheckIn } from "../entities/CheckIn";
import { validarAccesoSucursalPorPlan } from "./ValidarAccesoSucursalPorPlan";

const VENTANA_IDEMPOTENCIA_MINUTOS = 2;

export interface RegistrarCheckInDeps {
  miembros: IMemberRepository;
  checkIns: ICheckInRepository;
  suscripciones: ISuscripcionRepository;
}

export interface RegistrarCheckInInput {
  organizacionId: string;
  sucursalId: string;
  cedula: string;
}

export interface RegistrarCheckInResultado {
  nombre: string;
  fotoUrl: string | null;
  entrenadorNombre: string | null;
  planTipo: PlanTipo;
  estado: EstadoCheckIn;
}

export class MiembroNoEncontradoError extends Error {
  constructor() {
    super("No se encontró ningún miembro con esa cédula.");
  }
}

export async function registrarCheckIn(
  deps: RegistrarCheckInDeps,
  input: RegistrarCheckInInput
): Promise<RegistrarCheckInResultado> {
  const miembro = await deps.miembros.buscarPorOrganizacionYCedula(input.organizacionId, input.cedula);

  if (!miembro) {
    throw new MiembroNoEncontradoError();
  }

  const desde = new Date(Date.now() - VENTANA_IDEMPOTENCIA_MINUTOS * 60_000);
  const existente = await deps.checkIns.buscarRecientePorMiembroYSucursal(
    miembro.id,
    input.sucursalId,
    desde
  );

  const base = {
    nombre: miembro.nombre,
    fotoUrl: miembro.fotoUrl,
    entrenadorNombre: miembro.entrenadorNombre,
    planTipo: miembro.planTipo,
  };

  if (existente) {
    return { ...base, estado: existente.estadoAlMomento };
  }

  const estado = await validarAccesoSucursalPorPlan(
    { suscripciones: deps.suscripciones },
    miembro.id,
    input.sucursalId
  );

  await deps.checkIns.crear({
    sucursalId: input.sucursalId,
    miembroId: miembro.id,
    estadoAlMomento: estado,
  });

  return { ...base, estado };
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/domain/use-cases/RegistrarCheckIn.ts
git commit -m "feat: agrega caso de uso RegistrarCheckIn (idempotencia + acceso por plan)"
```

---

### Task 6: `AuthorizationService` + caso de uso `CrearUsuarioAdmin`

**Files:**
- Create: `packages/domain/services/AuthorizationService.ts`
- Create: `packages/domain/use-cases/CrearUsuarioAdmin.ts`

**Interfaces:**
- Consumes: `IAuthorizationService`, `IUsuarioAdminRepository` (Tarea 3).
- Produces: `crearUsuarioAdmin`, `NoAutorizadoError`, `AuthorizationService`, consumidos por el script de verificación (Tarea 11).

- [ ] **Step 1: `packages/domain/services/AuthorizationService.ts`**

```typescript
import { IAuthorizationService } from "../ports/IAuthorizationService";
import { RolUsuario } from "../entities/UsuarioAdmin";

export class AuthorizationService implements IAuthorizationService {
  puedeCrearUsuarioConRol(rolSolicitante: RolUsuario, _rolACrear: RolUsuario): boolean {
    // Única regla aprobada hasta ahora (ADR-001 v2 §16): crear UsuarioAdmin es
    // exclusivo de DUENO. No se modela una matriz de permisos por rol/acción
    // hasta que un segundo caso de uso real lo exija (ADR-001 v1 §13.2).
    return rolSolicitante === "DUENO";
  }
}
```

- [ ] **Step 2: `packages/domain/use-cases/CrearUsuarioAdmin.ts`**

```typescript
import { IUsuarioAdminRepository } from "../ports/IUsuarioAdminRepository";
import { IAuthorizationService } from "../ports/IAuthorizationService";
import { RolUsuario, UsuarioAdmin } from "../entities/UsuarioAdmin";

export interface CrearUsuarioAdminDeps {
  usuarios: IUsuarioAdminRepository;
  autorizacion: IAuthorizationService;
}

export interface CrearUsuarioAdminInput {
  solicitante: { rol: RolUsuario };
  organizacionId: string;
  sucursalId: string | null;
  email: string;
  passwordHash: string;
  rol: RolUsuario;
}

export class NoAutorizadoError extends Error {
  constructor(rolSolicitante: RolUsuario, rolACrear: RolUsuario) {
    super(`El rol ${rolSolicitante} no puede crear usuarios con rol ${rolACrear}.`);
  }
}

export async function crearUsuarioAdmin(
  deps: CrearUsuarioAdminDeps,
  input: CrearUsuarioAdminInput
): Promise<UsuarioAdmin> {
  if (!deps.autorizacion.puedeCrearUsuarioConRol(input.solicitante.rol, input.rol)) {
    throw new NoAutorizadoError(input.solicitante.rol, input.rol);
  }

  return deps.usuarios.crear({
    organizacionId: input.organizacionId,
    sucursalId: input.sucursalId,
    email: input.email,
    passwordHash: input.passwordHash,
    rol: input.rol,
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/domain/services packages/domain/use-cases/CrearUsuarioAdmin.ts
git commit -m "feat: agrega AuthorizationService y caso de uso CrearUsuarioAdmin"
```

---

### Task 7: Adaptadores Prisma de persistencia

**Files:**
- Modify: `packages/infrastructure/package.json` (agregar dependencias)
- Create: `packages/infrastructure/persistence/prisma/PrismaMemberRepository.ts`
- Create: `packages/infrastructure/persistence/prisma/PrismaSuscripcionRepository.ts`
- Create: `packages/infrastructure/persistence/prisma/PrismaCheckInRepository.ts`
- Create: `packages/infrastructure/persistence/prisma/PrismaUsuarioAdminRepository.ts`

**Interfaces:**
- Consumes: `PrismaClient` de `@gym-app/db` (inyectado por quien instancia el adaptador, nunca un singleton propio); puertos de la Tarea 3.
- Produces: implementaciones concretas que `route.ts` (Tarea 10) y el script de verificación (Tarea 11) instancian.

- [ ] **Step 1: Agregar dependencias a `packages/infrastructure/package.json`**

```json
{
  "name": "@gym-app/infrastructure",
  "version": "0.0.0",
  "private": true,
  "dependencies": {
    "@gym-app/db": "*",
    "@gym-app/domain": "*"
  }
}
```

- [ ] **Step 2: `packages/infrastructure/persistence/prisma/PrismaMemberRepository.ts`**

```typescript
import type { PrismaClient } from "@gym-app/db/generated/prisma/client";
import type { IMemberRepository } from "@gym-app/domain/ports/IMemberRepository";
import type { Miembro } from "@gym-app/domain/entities/Miembro";

export class PrismaMemberRepository implements IMemberRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async buscarPorOrganizacionYCedula(organizacionId: string, cedula: string): Promise<Miembro | null> {
    const miembro = await this.prisma.miembro.findUnique({
      where: { organizacionId_cedula: { organizacionId, cedula } },
      include: { entrenador: true },
    });

    if (!miembro) return null;

    return {
      id: miembro.id,
      organizacionId: miembro.organizacionId,
      nombre: miembro.nombre,
      cedula: miembro.cedula,
      fotoUrl: miembro.fotoUrl,
      entrenadorNombre: miembro.entrenador?.nombre ?? null,
      planTipo: miembro.planTipo,
    };
  }
}
```

- [ ] **Step 3: `packages/infrastructure/persistence/prisma/PrismaSuscripcionRepository.ts`**

```typescript
import type { PrismaClient } from "@gym-app/db/generated/prisma/client";
import type { ISuscripcionRepository } from "@gym-app/domain/ports/ISuscripcionRepository";
import type { Suscripcion } from "@gym-app/domain/entities/Suscripcion";

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

    return {
      id: suscripcion.id,
      miembroId: suscripcion.miembroId,
      plan: { id: suscripcion.plan.id, organizacionId: suscripcion.plan.organizacionId, tipoAcceso: suscripcion.plan.tipoAcceso },
      inicio: suscripcion.inicio,
      fin: suscripcion.fin,
      estado: suscripcion.estado,
    };
  }

  async tieneAccesoASucursal(planId: string, sucursalId: string): Promise<boolean> {
    const acceso = await this.prisma.planSucursalAcceso.findUnique({
      where: { planId_sucursalId: { planId, sucursalId } },
    });
    return acceso !== null;
  }
}
```

- [ ] **Step 4: `packages/infrastructure/persistence/prisma/PrismaCheckInRepository.ts`**

```typescript
import type { PrismaClient } from "@gym-app/db/generated/prisma/client";
import type { ICheckInRepository } from "@gym-app/domain/ports/ICheckInRepository";
import type { CheckIn, EstadoCheckIn } from "@gym-app/domain/entities/CheckIn";

export class PrismaCheckInRepository implements ICheckInRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async buscarRecientePorMiembroYSucursal(
    miembroId: string,
    sucursalId: string,
    desde: Date
  ): Promise<CheckIn | null> {
    const checkIn = await this.prisma.checkIn.findFirst({
      where: { miembroId, sucursalId, fechaHora: { gte: desde } },
      orderBy: { fechaHora: "desc" },
    });

    if (!checkIn) return null;

    return {
      id: checkIn.id,
      sucursalId: checkIn.sucursalId,
      miembroId: checkIn.miembroId,
      fechaHora: checkIn.fechaHora,
      estadoAlMomento: checkIn.estadoAlMomento as EstadoCheckIn,
    };
  }

  async crear(datos: { sucursalId: string; miembroId: string; estadoAlMomento: EstadoCheckIn }): Promise<CheckIn> {
    const checkIn = await this.prisma.checkIn.create({ data: datos });
    return {
      id: checkIn.id,
      sucursalId: checkIn.sucursalId,
      miembroId: checkIn.miembroId,
      fechaHora: checkIn.fechaHora,
      estadoAlMomento: checkIn.estadoAlMomento as EstadoCheckIn,
    };
  }
}
```

- [ ] **Step 5: `packages/infrastructure/persistence/prisma/PrismaUsuarioAdminRepository.ts`**

```typescript
import type { PrismaClient } from "@gym-app/db/generated/prisma/client";
import type { IUsuarioAdminRepository } from "@gym-app/domain/ports/IUsuarioAdminRepository";
import type { UsuarioAdmin } from "@gym-app/domain/entities/UsuarioAdmin";

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
    return {
      id: usuario.id,
      organizacionId: usuario.organizacionId,
      sucursalId: usuario.sucursalId,
      rol: usuario.rol,
      email: usuario.email,
    };
  }
}
```

- [ ] **Step 6: Reinstalar para que npm resuelva las nuevas dependencias del workspace**

Run: `npm install` (desde la raíz)
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add packages/infrastructure/package.json packages/infrastructure/persistence package-lock.json
git commit -m "feat: agrega adaptadores Prisma de persistencia (Miembro, Suscripcion, CheckIn, UsuarioAdmin)"
```

---

### Task 8: Adaptador `KioskTokenValidator`

**Files:**
- Create: `packages/infrastructure/auth/KioskTokenValidator.ts`

**Interfaces:**
- Consumes: `PrismaClient`, `IKioskAuthValidator` (Tarea 3).
- Produces: `KioskTokenValidator`, consumido por `route.ts` (Tarea 10).

- [ ] **Step 1: Implementar**

```typescript
// packages/infrastructure/auth/KioskTokenValidator.ts
import type { PrismaClient } from "@gym-app/db/generated/prisma/client";
import type { IKioskAuthValidator } from "@gym-app/domain/ports/IKioskAuthValidator";
import type { Sucursal } from "@gym-app/domain/entities/Sucursal";

export class KioskTokenValidator implements IKioskAuthValidator {
  constructor(private readonly prisma: PrismaClient) {}

  async validar(apiKey: string): Promise<Sucursal | null> {
    const sucursal = await this.prisma.sucursal.findUnique({ where: { apiKey } });
    if (!sucursal) return null;

    return {
      id: sucursal.id,
      organizacionId: sucursal.organizacionId,
      nombre: sucursal.nombre,
      apiKey: sucursal.apiKey,
    };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/infrastructure/auth/KioskTokenValidator.ts
git commit -m "feat: agrega KioskTokenValidator (autenticación del kiosco por apiKey de sucursal)"
```

---

### Task 9: Dependencias de workspace + `transpilePackages`

**Files:**
- Modify: `apps/web-admin/package.json`
- Modify: `apps/web-admin/next.config.ts`

**Interfaces:**
- Consumes: `@gym-app/domain`, `@gym-app/infrastructure` como paquetes de workspace.
- Produces: resolución de módulos e instrucción de transpilado que la Tarea 10 necesita para compilar.

- [ ] **Step 1: Agregar las dependencias de workspace**

En `apps/web-admin/package.json`, agregar a `dependencies`:

```json
    "@gym-app/domain": "*",
    "@gym-app/infrastructure": "*",
```

- [ ] **Step 2: Configurar `transpilePackages` en `apps/web-admin/next.config.ts`**

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Genera un server.js autocontenido (apps/web-admin/.next/standalone)
  // con solo las dependencias de producción realmente usadas — necesario
  // para una imagen Docker liviana en un monorepo npm workspaces.
  output: "standalone",
  // @gym-app/domain y @gym-app/infrastructure son paquetes internos sin
  // build propio (solo .ts fuente) — Next.js necesita transpilarlos
  // explícitamente, a diferencia de @gym-app/db (ya es JS compilado por
  // `prisma generate`).
  transpilePackages: ["@gym-app/domain", "@gym-app/infrastructure"],
};

export default nextConfig;
```

- [ ] **Step 3: Reinstalar**

Run: `npm install` (desde la raíz)
Expected: exit 0; `node_modules/@gym-app/domain` y `node_modules/@gym-app/infrastructure` son symlinks.

- [ ] **Step 4: Commit**

```bash
git add apps/web-admin/package.json apps/web-admin/next.config.ts package-lock.json
git commit -m "chore: agrega @gym-app/domain y @gym-app/infrastructure como dependencias de web-admin"
```

---

### Task 10: Reescribir `app/api/checkin/route.ts` (delgado, con autenticación de kiosco)

**Files:**
- Modify: `apps/web-admin/app/api/checkin/route.ts`

**Interfaces:**
- Consumes: `registrarCheckIn`, `MiembroNoEncontradoError` (Tarea 5); `KioskTokenValidator`, `PrismaMemberRepository`, `PrismaCheckInRepository`, `PrismaSuscripcionRepository` (Tareas 7–8); `prisma` de `@/lib/prisma`.
- Produces: el endpoint HTTP real que la Tarea 12 prueba manualmente.

- [ ] **Step 1: Reemplazar el contenido completo del archivo**

```typescript
// app/api/checkin/route.ts
// Endpoint de check-in: el kiosco se autentica con su apiKey de Sucursal
// (header X-Kiosk-Api-Key, ADR-001 v1 §4.2 — el sucursalId ya NO viaja en
// el body). Este handler solo valida entrada/salida HTTP; toda la lógica
// de negocio vive en el caso de uso RegistrarCheckIn (packages/domain).

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { KioskTokenValidator } from "@gym-app/infrastructure/auth/KioskTokenValidator";
import { PrismaMemberRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMemberRepository";
import { PrismaCheckInRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaCheckInRepository";
import { PrismaSuscripcionRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSuscripcionRepository";
import { registrarCheckIn, MiembroNoEncontradoError } from "@gym-app/domain/use-cases/RegistrarCheckIn";

export async function POST(req: NextRequest) {
  try {
    const apiKey = req.headers.get("x-kiosk-api-key");

    if (!apiKey) {
      return NextResponse.json(
        { error: "Falta el header X-Kiosk-Api-Key." },
        { status: 401 }
      );
    }

    const kioskAuth = new KioskTokenValidator(prisma);
    const sucursal = await kioskAuth.validar(apiKey);

    if (!sucursal) {
      return NextResponse.json(
        { error: "API key de sucursal inválida." },
        { status: 401 }
      );
    }

    const { cedula } = await req.json();

    if (!cedula) {
      return NextResponse.json(
        { error: "Cédula es requerida." },
        { status: 400 }
      );
    }

    const resultado = await registrarCheckIn(
      {
        miembros: new PrismaMemberRepository(prisma),
        checkIns: new PrismaCheckInRepository(prisma),
        suscripciones: new PrismaSuscripcionRepository(prisma),
      },
      { organizacionId: sucursal.organizacionId, sucursalId: sucursal.id, cedula }
    );

    return NextResponse.json({
      nombre: resultado.nombre,
      fotoUrl: resultado.fotoUrl,
      entrenador: resultado.entrenadorNombre,
      planTipo: resultado.planTipo,
      estado: resultado.estado,
    });
  } catch (error) {
    if (error instanceof MiembroNoEncontradoError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error("Error en check-in:", error);
    return NextResponse.json(
      { error: "Error interno al procesar el check-in." },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Verificar tipos**

Run: `cd apps/web-admin && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/web-admin/app/api/checkin/route.ts
git commit -m "refactor: app/api/checkin/route.ts delgado, usa RegistrarCheckIn + auth por apiKey"
```

---

### Task 11: Actualizar `seed.ts` + script de verificación de autorización

**Files:**
- Modify: `packages/db/prisma/seed.ts`
- Modify: `packages/db/package.json` (agregar `@gym-app/domain`/`@gym-app/infrastructure`)
- Create: `packages/db/prisma/verificar-autorizacion.ts`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: datos de seed coherentes con la nueva lógica de `estadoAlMomento`, y una prueba manual real (no HTTP) de `CrearUsuarioAdmin`/`AuthorizationService`.

- [ ] **Step 1: Agregar dependencias a `packages/db/package.json`**

```json
    "@gym-app/domain": "*",
    "@gym-app/infrastructure": "*",
```

(agregar dentro de `dependencies`, junto a `@prisma/client` y `@prisma/adapter-pg`).

- [ ] **Step 2: Agregar una `Suscripcion` para Rodrigo Lara en `seed.ts`**

Inmediatamente después del bloque que crea `miembroSinEntrenador`, agregar:

```typescript
  await prisma.suscripcion.create({
    data: {
      miembroId: miembroSinEntrenador.id,
      planId: planSedeUnica.id,
      inicio: hoy,
      fin: en20Dias,
      estado: "ACTIVA",
    },
  });
```

(Sin esto, bajo la nueva lógica basada en `Suscripcion`, Rodrigo Lara pasaría de "activo" a "vencido" — dejaría de servir como caso de prueba de "miembro activo sin entrenador".)

- [ ] **Step 3: Imprimir la `apiKey` de la sucursal en vez de (o junto a) su id**

Reemplazar la línea final de `main()`:

```typescript
  console.log(`   sucursalId de prueba para /api/checkin: ${sucursal.id}`);
```

por:

```typescript
  console.log(`   apiKey de prueba para el header X-Kiosk-Api-Key: ${sucursal.apiKey}`);
```

- [ ] **Step 4: Crear `packages/db/prisma/verificar-autorizacion.ts`**

```typescript
// Script manual (no hay framework de tests en el repo todavía) para verificar
// AuthorizationService + CrearUsuarioAdmin contra datos reales: corre
// `npx tsx prisma/verificar-autorizacion.ts` desde packages/db.
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { PrismaUsuarioAdminRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaUsuarioAdminRepository";
import { AuthorizationService } from "@gym-app/domain/services/AuthorizationService";
import { crearUsuarioAdmin, NoAutorizadoError } from "@gym-app/domain/use-cases/CrearUsuarioAdmin";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const organizacion = await prisma.organizacion.findUnique({ where: { slug: "gym-demo" } });
  if (!organizacion) {
    throw new Error("No se encontró la organización 'gym-demo' — corre `npx prisma db seed` primero.");
  }

  const usuarios = new PrismaUsuarioAdminRepository(prisma);
  const autorizacion = new AuthorizationService();
  const passwordHash = await bcrypt.hash("recepcion1234", 10);

  // Caso 1: DUENO crea un RECEPCION — debe funcionar.
  try {
    const creado = await crearUsuarioAdmin(
      { usuarios, autorizacion },
      {
        solicitante: { rol: "DUENO" },
        organizacionId: organizacion.id,
        sucursalId: null,
        email: `recepcion-${Date.now()}@gymdemo.com`,
        passwordHash,
        rol: "RECEPCION",
      }
    );
    console.log("✅ DUENO creó un usuario RECEPCION:", creado.email);
  } catch (e) {
    console.error("❌ Falló el caso 1 (DUENO → RECEPCION), debía funcionar:", e);
    process.exitCode = 1;
  }

  // Caso 2: GERENTE intenta crear un RECEPCION — debe rechazarse.
  try {
    await crearUsuarioAdmin(
      { usuarios, autorizacion },
      {
        solicitante: { rol: "GERENTE" },
        organizacionId: organizacion.id,
        sucursalId: null,
        email: `no-deberia-crearse-${Date.now()}@gymdemo.com`,
        passwordHash,
        rol: "RECEPCION",
      }
    );
    console.error("❌ Falló el caso 2 (GERENTE → RECEPCION): se creó el usuario, debía rechazarse.");
    process.exitCode = 1;
  } catch (e) {
    if (e instanceof NoAutorizadoError) {
      console.log("✅ GERENTE fue rechazado correctamente al intentar crear RECEPCION:", e.message);
    } else {
      console.error("❌ Falló el caso 2 con un error inesperado:", e);
      process.exitCode = 1;
    }
  }
}

main()
  .catch((e) => {
    console.error("❌ Error en la verificación:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 5: Reinstalar**

Run: `npm install` (desde la raíz)
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/db/prisma/seed.ts packages/db/prisma/verificar-autorizacion.ts packages/db/package.json package-lock.json
git commit -m "feat: actualiza seed.ts (Suscripcion de Rodrigo Lara, apiKey) y agrega script de verificación de autorización"
```

**Nota:** correr el seed y el script de verificación contra la base real es parte de la Tarea 12 (requiere red hacia la DB — lo corre el usuario).

---

### Task 12: Migrar, sembrar y probar contra la base real (requiere red — lo corre el usuario)

**Files:** ninguno — tarea de verificación.

- [ ] **Step 1: Migrar el campo `apiKey` (Tarea 1, pendiente de aplicar)**

```powershell
cd packages\db
npx prisma migrate dev --name sucursal_api_key
```

Expected: sin drift (solo se agrega una columna), no debería pedir reset esta vez.

- [ ] **Step 2: Re-sembrar** (el seed anterior ya corrió una vez; correrlo de nuevo crea una segunda Organización — está bien para esta prueba, o resetea con `npx prisma migrate reset --force` primero si prefieres datos limpios)

```powershell
npx prisma db seed
```

Anotar la nueva `apiKey de prueba` impresa (reemplaza al `sucursalId` que usábamos antes).

- [ ] **Step 3: Verificación de autorización**

```powershell
npx tsx prisma/verificar-autorizacion.ts
```

Expected: los dos ✅ del script.

- [ ] **Step 4: Build completo**

```powershell
cd ..\..
npm run dev
```

(o `npx turbo run build --filter=web-admin` para build de producción)

- [ ] **Step 5: Probar el check-in con el nuevo contrato (header en vez de body)**

```powershell
curl.exe -X POST http://localhost:3000/api/checkin -H "Content-Type: application/json" -H "X-Kiosk-Api-Key: <apiKey-del-seed>" -d '{\"cedula\":\"19141319\"}'
```

Expected: `estado: activo` (Rayza Aray, tiene Suscripcion ACTIVA vigente con acceso a la sucursal).

- [ ] **Step 6: Probar sin API key**

```powershell
curl.exe -X POST http://localhost:3000/api/checkin -H "Content-Type: application/json" -d '{\"cedula\":\"19141319\"}'
```

Expected: `401`, `{"error":"Falta el header X-Kiosk-Api-Key."}`.

- [ ] **Step 7: Probar con API key inválida**

```powershell
curl.exe -X POST http://localhost:3000/api/checkin -H "Content-Type: application/json" -H "X-Kiosk-Api-Key: no-es-valida" -d '{\"cedula\":\"19141319\"}'
```

Expected: `401`, `{"error":"API key de sucursal inválida."}`.

- [ ] **Step 8: Probar idempotencia y el caso vencido** (igual que en el plan anterior, con el header en vez del `sucursalId` en el body)

- [ ] **Step 9: No hay commit en esta tarea** — es solo verificación.

---

## Fuera de alcance de este plan (explícitamente diferido)

- Integración real de la API BCV (`BcvApiAdapter`, `apps/worker`, `ActualizarTasaDiaria`) — la tabla `TasaCambio` sigue sin ningún proceso que la llene.
- Endpoint HTTP para `CrearUsuarioAdmin` — se implementa el caso de uso y se verifica con un script manual, pero no se expone por HTTP todavía porque no existe login/sesión en el panel admin (expondría una ruta capaz de crear administradores sin ninguna protección).
- Matriz de permisos granular más allá de "crear UsuarioAdmin es exclusivo de DUENO" — graduar solo cuando un segundo caso de uso real lo exija (ADR v1 §13.2).
- Rotación/regeneración de `apiKey` de una `Sucursal` ya creada — hoy solo se genera al crear la fila.

## Execution Handoff

Dos opciones de ejecución:

**1. Subagent-Driven (recomendado)** — un subagente fresco por tarea, revisión entre tareas.

**2. Inline Execution** — ejecuto las Tareas 1–11 yo mismo en esta sesión (no requieren red hacia la DB), y la Tarea 12 la corres tú.

¿Cuál prefieres?
