# Turnos, Arqueo y Egresos de Caja Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el "cierre de caja" global diario por un flujo real de turnos por cajero/sucursal, con fondo inicial declarado, egresos, y arqueo (conciliación) por método de pago con nota obligatoria ante diferencias.

**Architecture:** Arquitectura hexagonal existente (entidades de dominio + puertos + casos de uso puros + adaptadores Prisma), con Server Components/Actions en `apps/web-admin` invocando los casos de uso directamente. Se agregan 3 modelos nuevos (`Turno`, `Egreso`, `ArqueoLinea`), se modifica `Pago`, y se elimina `CierreCaja`.

**Tech Stack:** Next.js 16 App Router, React 19 (`useActionState`), Prisma ORM sobre PostgreSQL, Turborepo monorepo (`packages/domain`, `packages/infrastructure`, `packages/db`, `apps/web-admin`).

**Spec:** `docs/superpowers/specs/2026-09-18-turnos-caja-design.md`

## Global Constraints

- Un solo `Turno` en estado `ABIERTO` por `sucursalId` a la vez — aplicado en el caso de uso `AbrirTurno`, no como constraint de base de datos.
- `organizacionId`, `sucursalId` y `registradoPorId`/`usuarioId` en cualquier caso de uso o Server Action SIEMPRE se derivan de `obtenerUsuarioDeSesionActual()` server-side — nunca de `formData` ni de parámetros de ruta del cliente.
- ENTRENADOR no puede abrir/cerrar turno, registrar egreso, ni registrar pago. Solo DUEÑO/GERENTE pueden anular un pago. Cada caso de uso que lo requiera recibe `rolUsuario`/`rolAnulador` como parte de su input y lo valida — no basta con la verificación en la Server Action.
- Un `Pago` nunca se borra ni se edita su monto/método una vez creado; una corrección se modela como anulación (`anuladoEn/anuladoPorId/motivoAnulacion`), nunca como `UPDATE` destructivo.
- `Decimal(14, 2)` para montos en bolívares (`fondoInicialBs`, `Egreso.monto`, `ArqueoLinea.montoEsperado/montoContado/diferencia`); `Decimal(10, 2)` se mantiene para montos en USD, igual que hoy en `Pago.monto`.
- Los `CierreCaja` y `Pago` existentes en producción son datos de prueba — se eliminan sin lógica de migración de compatibilidad (Tarea 1).
- Nombres en español siguiendo la convención existente: entidades/casos de uso (`Turno`, `Egreso`, `AbrirTurno`, `CerrarTurno`), errores como clases (`TurnoYaAbiertoError`, etc.), campos (`organizacionId`, `sucursalId`, `fondoInicialUSD`).

---

### Task 1: Limpiar datos de prueba y preparar el schema

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/limpiarCajaPrueba.ts`

**Interfaces:**
- Consumes: nada (script standalone, como `packages/db/limpiarMiembros.ts` existente).
- Produces: base de datos sin filas en `Pago` ni `CierreCaja`, lista para la migración de schema de la Tarea 2.

- [ ] **Step 1: Crear el script de limpieza**

Archivo `packages/db/limpiarCajaPrueba.ts`:

```ts
import { PrismaClient } from "./generated/prisma/client";

const prisma = new PrismaClient();

async function main() {
  const pagos = await prisma.pago.deleteMany({});
  const cierres = await prisma.cierreCaja.deleteMany({});
  console.log(`Eliminados ${pagos.count} pagos y ${cierres.count} cierres de caja de prueba.`);
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

- [ ] **Step 2: Ejecutar el script contra la base de datos de desarrollo**

Run: `cd packages/db && npx tsx limpiarCajaPrueba.ts`
Expected: imprime `Eliminados N pagos y M cierres de caja de prueba.` sin errores.

- [ ] **Step 3: Commit**

```bash
git add packages/db/limpiarCajaPrueba.ts
git commit -m "chore: agrega script para limpiar pagos y cierres de caja de prueba"
```

---

### Task 2: Migración de schema — Turno, Egreso, ArqueoLinea, y modificación de Pago

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

**Interfaces:**
- Consumes: nada.
- Produces: modelos Prisma `Turno`, `Egreso`, `ArqueoLinea`; `Pago` con `sucursalId`, `turnoId`, `registradoPorId`, `anuladoEn`, `anuladoPorId`, `motivoAnulacion`; relaciones inversas en `Organizacion`, `Sucursal`, `UsuarioAdmin`. Eliminación de `CierreCaja` y de la relación `Organizacion.cierresCaja`.

- [ ] **Step 1: Eliminar el modelo `CierreCaja` y su relación**

En `packages/db/prisma/schema.prisma`, quitar la línea `cierresCaja   CierreCaja[]` del modelo `Organizacion` (línea 27) y eliminar por completo el modelo `CierreCaja` (líneas 169-179).

- [ ] **Step 2: Modificar el modelo `Pago`**

Reemplazar el modelo `Pago` actual por:

```prisma
model Pago {
  id              String   @id @default(cuid())
  miembroId       String
  miembro         Miembro  @relation(fields: [miembroId], references: [id])
  sucursalId      String
  sucursal        Sucursal @relation(fields: [sucursalId], references: [id])
  turnoId         String?
  turno           Turno?   @relation(fields: [turnoId], references: [id])
  registradoPorId String
  registradoPor   UsuarioAdmin @relation("PagosRegistrados", fields: [registradoPorId], references: [id])

  monto           Decimal  @db.Decimal(10, 2)
  metodo          String
  numeroOperacion String?
  tasaCambio      Decimal? @db.Decimal(10, 2)
  fechaPago       DateTime @default(now())

  anuladoEn       DateTime?
  anuladoPorId    String?
  anuladoPor      UsuarioAdmin? @relation("PagosAnulados", fields: [anuladoPorId], references: [id])
  motivoAnulacion String?
}
```

- [ ] **Step 3: Agregar los modelos `Turno`, `Egreso`, `ArqueoLinea` y sus enums**

Agregar después del modelo `Pago`:

```prisma
enum EstadoTurno {
  ABIERTO
  CERRADO
}

model Turno {
  id             String       @id @default(cuid())
  organizacionId String
  organizacion   Organizacion @relation(fields: [organizacionId], references: [id])
  sucursalId     String
  sucursal       Sucursal     @relation(fields: [sucursalId], references: [id])
  usuarioId      String
  usuario        UsuarioAdmin @relation(fields: [usuarioId], references: [id])

  fondoInicialUSD Decimal @db.Decimal(10, 2)
  fondoInicialBs  Decimal @db.Decimal(14, 2)

  abiertoEn DateTime    @default(now())
  cerradoEn DateTime?
  estado    EstadoTurno @default(ABIERTO)

  pagos   Pago[]
  egresos Egreso[]
  arqueo  ArqueoLinea[]

  @@index([sucursalId, estado])
}

enum MonedaEgreso {
  USD
  BS
}

model Egreso {
  id           String       @id @default(cuid())
  turnoId      String
  turno        Turno        @relation(fields: [turnoId], references: [id])
  monto        Decimal      @db.Decimal(14, 2)
  moneda       MonedaEgreso
  metodo       String
  motivo       String
  registradoEn DateTime     @default(now())
}

model ArqueoLinea {
  id            String  @id @default(cuid())
  turnoId       String
  turno         Turno   @relation(fields: [turnoId], references: [id])
  metodo        String
  montoEsperado Decimal @db.Decimal(14, 2)
  montoContado  Decimal @db.Decimal(14, 2)
  diferencia    Decimal @db.Decimal(14, 2)
  nota          String?

  @@unique([turnoId, metodo])
}
```

- [ ] **Step 4: Agregar las relaciones inversas en `Organizacion`, `Sucursal` y `UsuarioAdmin`**

En `Organizacion` (reemplazar la línea eliminada en el Step 1):
```prisma
  turnos        Turno[]
```

En `Sucursal`, agregar dentro del bloque de relaciones (junto a `usuariosAdmin`, `entrenadores`, etc.):
```prisma
  pagos  Pago[]
  turnos Turno[]
```

En `UsuarioAdmin`, agregar dentro del bloque de relaciones (junto a `registrosAuditoria`, `sesiones`):
```prisma
  turnos          Turno[]
  pagosRegistrados Pago[] @relation("PagosRegistrados")
  pagosAnulados    Pago[] @relation("PagosAnulados")
```

- [ ] **Step 5: Generar y aplicar la migración**

Run: `cd packages/db && npx prisma migrate dev --name turnos_caja_arqueo`
Expected: la migración se crea y aplica sin errores; el prompt de Prisma sobre pérdida de datos en `Pago`/eliminación de `CierreCaja` se acepta (los datos ya fueron limpiados en la Tarea 1).

- [ ] **Step 6: Regenerar el cliente Prisma**

Run: `cd packages/db && npx prisma generate`
Expected: sin errores, tipos actualizados en `packages/db/generated/prisma`.

- [ ] **Step 7: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations
git commit -m "feat: agrega modelos Turno, Egreso y ArqueoLinea; extiende Pago con turno/sucursal/anulación"
```

---

### Task 3: Entidades de dominio — Turno, Egreso, ArqueoLinea; actualizar Pago

**Files:**
- Create: `packages/domain/entities/Turno.ts`
- Create: `packages/domain/entities/Egreso.ts`
- Create: `packages/domain/entities/ArqueoLinea.ts`
- Modify: `packages/domain/entities/Pago.ts`
- Delete: `packages/domain/entities/CierreCaja.ts`

**Interfaces:**
- Consumes: nada.
- Produces: tipos `Turno`, `DatosNuevoTurno`, `Egreso`, `DatosNuevoEgreso`, `ArqueoLinea`, `DatosNuevaArqueoLinea` — consumidos por las Tareas 4-8.

- [ ] **Step 1: Crear `packages/domain/entities/Turno.ts`**

```ts
export type EstadoTurno = "ABIERTO" | "CERRADO";

export interface Turno {
  id: string;
  organizacionId: string;
  sucursalId: string;
  usuarioId: string;
  fondoInicialUSD: number;
  fondoInicialBs: number;
  abiertoEn: Date;
  cerradoEn: Date | null;
  estado: EstadoTurno;
}

export interface DatosNuevoTurno {
  organizacionId: string;
  sucursalId: string;
  usuarioId: string;
  fondoInicialUSD: number;
  fondoInicialBs: number;
}
```

- [ ] **Step 2: Crear `packages/domain/entities/Egreso.ts`**

```ts
export type MonedaEgreso = "USD" | "BS";

export interface Egreso {
  id: string;
  turnoId: string;
  monto: number;
  moneda: MonedaEgreso;
  metodo: string;
  motivo: string;
  registradoEn: Date;
}

export interface DatosNuevoEgreso {
  turnoId: string;
  monto: number;
  moneda: MonedaEgreso;
  metodo: string;
  motivo: string;
}
```

- [ ] **Step 3: Crear `packages/domain/entities/ArqueoLinea.ts`**

```ts
export interface ArqueoLinea {
  id: string;
  turnoId: string;
  metodo: string;
  montoEsperado: number;
  montoContado: number;
  diferencia: number;
  nota: string | null;
}

export interface DatosNuevaArqueoLinea {
  turnoId: string;
  metodo: string;
  montoEsperado: number;
  montoContado: number;
  diferencia: number;
  nota: string | null;
}
```

- [ ] **Step 4: Modificar `packages/domain/entities/Pago.ts`**

Reemplazar el contenido completo por:

```ts
export interface Pago {
  id: string;
  miembroId: string;
  miembroNombre?: string;
  miembroPrecioPlan?: number;
  sucursalId: string;
  turnoId: string | null;
  registradoPorId: string;
  monto: number;
  metodo: string;
  numeroOperacion: string | null;
  tasaCambio: number | null;
  fechaPago: Date;
  anuladoEn: Date | null;
  anuladoPorId: string | null;
  motivoAnulacion: string | null;
}

export interface DatosNuevoPago {
  miembroId: string;
  sucursalId: string;
  turnoId: string | null;
  registradoPorId: string;
  monto: number;
  metodo: string;
  numeroOperacion: string | null;
  tasaCambio: number | null;
}
```

- [ ] **Step 5: Eliminar `packages/domain/entities/CierreCaja.ts`**

```bash
git rm packages/domain/entities/CierreCaja.ts
```

- [ ] **Step 6: Verificar que el paquete compila (errores esperados en consumidores, se resuelven en tareas siguientes)**

Run: `cd packages/domain && npx tsc --noEmit`
Expected: errores en `use-cases/RegistrarPago.ts`, `use-cases/CerrarCaja.ts`, `use-cases/ObtenerReporteCaja.ts`, `ports/ICierreCajaRepository.ts` (se resuelven en Tareas 4-6) — ningún otro error inesperado.

- [ ] **Step 7: Commit**

```bash
git add packages/domain/entities
git commit -m "feat: agrega entidades Turno, Egreso, ArqueoLinea; extiende Pago con turno/sucursal/anulación"
```

---

### Task 4: Puertos de dominio — ITurnoRepository, IEgresoRepository, IArqueoRepository; actualizar IPagoRepository

**Files:**
- Create: `packages/domain/ports/ITurnoRepository.ts`
- Create: `packages/domain/ports/IEgresoRepository.ts`
- Create: `packages/domain/ports/IArqueoRepository.ts`
- Modify: `packages/domain/ports/IPagoRepository.ts`
- Delete: `packages/domain/ports/ICierreCajaRepository.ts`

**Interfaces:**
- Consumes: `Turno`, `DatosNuevoTurno` de `../entities/Turno`; `Egreso`, `DatosNuevoEgreso` de `../entities/Egreso`; `ArqueoLinea`, `DatosNuevaArqueoLinea` de `../entities/ArqueoLinea`; `Pago`, `DatosNuevoPago` de `../entities/Pago` (Tarea 3).
- Produces: contratos de repositorio consumidos por los casos de uso (Tareas 5-6) y los adaptadores Prisma (Tarea 7).

- [ ] **Step 1: Crear `packages/domain/ports/ITurnoRepository.ts`**

```ts
import { Turno, DatosNuevoTurno } from "../entities/Turno";

export interface ITurnoRepository {
  crear(datos: DatosNuevoTurno): Promise<Turno>;
  buscarPorId(id: string): Promise<Turno | null>;
  buscarAbiertoPorSucursal(sucursalId: string): Promise<Turno | null>;
  cerrar(id: string, cerradoEn: Date): Promise<Turno>;
  listarPorOrganizacionYRango(organizacionId: string, desde: Date, hasta: Date): Promise<Turno[]>;
}
```

- [ ] **Step 2: Crear `packages/domain/ports/IEgresoRepository.ts`**

```ts
import { Egreso, DatosNuevoEgreso } from "../entities/Egreso";

export interface IEgresoRepository {
  crear(datos: DatosNuevoEgreso): Promise<Egreso>;
  listarPorTurno(turnoId: string): Promise<Egreso[]>;
}
```

- [ ] **Step 3: Crear `packages/domain/ports/IArqueoRepository.ts`**

```ts
import { ArqueoLinea, DatosNuevaArqueoLinea } from "../entities/ArqueoLinea";

export interface IArqueoRepository {
  crearLineas(lineas: DatosNuevaArqueoLinea[]): Promise<ArqueoLinea[]>;
  listarPorTurno(turnoId: string): Promise<ArqueoLinea[]>;
}
```

- [ ] **Step 4: Modificar `packages/domain/ports/IPagoRepository.ts`**

```ts
import { Pago, DatosNuevoPago } from "../entities/Pago";

export interface IPagoRepository {
  crear(datos: DatosNuevoPago): Promise<Pago>;
  listarPorMiembro(miembroId: string): Promise<Pago[]>;
  listarPorOrganizacion(organizacionId: string): Promise<Pago[]>;
  listarPorOrganizacionYRango(organizacionId: string, desde: Date, hasta: Date): Promise<Pago[]>;
  listarPorTurno(turnoId: string): Promise<Pago[]>;
  buscarPorId(id: string): Promise<Pago | null>;
  anular(id: string, anuladoPorId: string, motivo: string, anuladoEn: Date): Promise<Pago>;
}
```

- [ ] **Step 5: Eliminar `packages/domain/ports/ICierreCajaRepository.ts`**

```bash
git rm packages/domain/ports/ICierreCajaRepository.ts
```

- [ ] **Step 6: Commit**

```bash
git add packages/domain/ports
git commit -m "feat: agrega puertos ITurnoRepository, IEgresoRepository, IArqueoRepository; extiende IPagoRepository"
```

---

### Task 5: Casos de uso — AbrirTurno, RegistrarEgreso, ObtenerResumenTurno

**Files:**
- Create: `packages/domain/use-cases/AbrirTurno.ts`
- Create: `packages/domain/use-cases/RegistrarEgreso.ts`
- Create: `packages/domain/use-cases/ObtenerResumenTurno.ts`

**Interfaces:**
- Consumes: `ITurnoRepository`, `IEgresoRepository`, `IPagoRepository` (Tarea 4); `RolUsuario` de `../entities/UsuarioAdmin` (ya existe); `METODOS_EFECTIVO` — NUEVO array exportado por este task en `ObtenerResumenTurno.ts` (ver Step 3) para no depender de `apps/web-admin/app/(panel)/metodosPago.ts`, que domain no puede importar (domain no depende de apps).
- Produces: `abrirTurno`, `TurnoYaAbiertoError`, `RolNoAutorizadoError` (de `AbrirTurno.ts` — reexportado también por `RegistrarEgreso.ts` y `CerrarTurno.ts` en la Tarea 6, cada uno define su propia clase con el mismo nombre; no hay un módulo compartido de errores en este dominio, sigue el patrón existente donde cada caso de uso declara sus propios errores); `registrarEgreso`, `TurnoCerradoError`, `MotivoRequeridoError`; `obtenerResumenTurno`, `ResumenTurno`.

- [ ] **Step 1: Crear `packages/domain/use-cases/AbrirTurno.ts`**

```ts
import { ITurnoRepository } from "../ports/ITurnoRepository";
import { Turno } from "../entities/Turno";
import { RolUsuario } from "../entities/UsuarioAdmin";

export class RolNoAutorizadoError extends Error {
  constructor() {
    super("Tu rol no tiene permiso para realizar esta acción.");
  }
}

export class TurnoYaAbiertoError extends Error {
  constructor() {
    super("Ya hay un turno abierto en esta sucursal.");
  }
}

export interface DatosAbrirTurno {
  organizacionId: string;
  sucursalId: string;
  usuarioId: string;
  rolUsuario: RolUsuario;
  fondoInicialUSD: number;
  fondoInicialBs: number;
}

export async function abrirTurno(
  deps: { turnos: ITurnoRepository },
  input: DatosAbrirTurno
): Promise<Turno> {
  if (input.rolUsuario === "ENTRENADOR") {
    throw new RolNoAutorizadoError();
  }

  const abierto = await deps.turnos.buscarAbiertoPorSucursal(input.sucursalId);
  if (abierto) {
    throw new TurnoYaAbiertoError();
  }

  return deps.turnos.crear({
    organizacionId: input.organizacionId,
    sucursalId: input.sucursalId,
    usuarioId: input.usuarioId,
    fondoInicialUSD: input.fondoInicialUSD,
    fondoInicialBs: input.fondoInicialBs,
  });
}
```

- [ ] **Step 2: Crear `packages/domain/use-cases/RegistrarEgreso.ts`**

```ts
import { ITurnoRepository } from "../ports/ITurnoRepository";
import { IEgresoRepository } from "../ports/IEgresoRepository";
import { Egreso, MonedaEgreso } from "../entities/Egreso";
import { RolUsuario } from "../entities/UsuarioAdmin";

export class RolNoAutorizadoError extends Error {
  constructor() {
    super("Tu rol no tiene permiso para realizar esta acción.");
  }
}

export class TurnoCerradoError extends Error {
  constructor() {
    super("No se pueden registrar egresos en un turno cerrado.");
  }
}

export class MotivoRequeridoError extends Error {
  constructor() {
    super("El motivo del egreso es requerido.");
  }
}

export interface DatosRegistrarEgreso {
  turnoId: string;
  rolUsuario: RolUsuario;
  monto: number;
  moneda: MonedaEgreso;
  metodo: string;
  motivo: string;
}

export async function registrarEgreso(
  deps: { turnos: ITurnoRepository; egresos: IEgresoRepository },
  input: DatosRegistrarEgreso
): Promise<Egreso> {
  if (input.rolUsuario === "ENTRENADOR") {
    throw new RolNoAutorizadoError();
  }

  const turno = await deps.turnos.buscarPorId(input.turnoId);
  if (!turno || turno.estado === "CERRADO") {
    throw new TurnoCerradoError();
  }

  if (!input.motivo.trim()) {
    throw new MotivoRequeridoError();
  }

  return deps.egresos.crear({
    turnoId: input.turnoId,
    monto: input.monto,
    moneda: input.moneda,
    metodo: input.metodo,
    motivo: input.motivo.trim(),
  });
}
```

- [ ] **Step 3: Crear `packages/domain/use-cases/ObtenerResumenTurno.ts`**

```ts
import { ITurnoRepository } from "../ports/ITurnoRepository";
import { IPagoRepository } from "../ports/IPagoRepository";
import { IEgresoRepository } from "../ports/IEgresoRepository";
import { Turno } from "../entities/Turno";
import { Pago } from "../entities/Pago";
import { Egreso } from "../entities/Egreso";

// Métodos de efectivo físico — únicos que arrancan con el fondo inicial del
// turno. Duplicado deliberado de METODOS_EN_BS/efectivo_usd en
// apps/web-admin/app/(panel)/metodosPago.ts: domain no puede importar de
// apps (regla de la arquitectura hexagonal de este repo).
export const METODOS_EFECTIVO = ["efectivo_usd", "efectivo_bs"];

export class TurnoNoEncontradoError extends Error {
  constructor() {
    super("No se encontró el turno.");
  }
}

export interface LineaResumenMetodo {
  metodo: string;
  totalPagos: number;
  totalEgresos: number;
  montoEsperado: number;
}

export interface ResumenTurno {
  turno: Turno;
  pagos: Pago[];
  egresos: Egreso[];
  lineas: LineaResumenMetodo[];
}

export async function obtenerResumenTurno(
  deps: { turnos: ITurnoRepository; pagos: IPagoRepository; egresos: IEgresoRepository },
  input: { turnoId: string }
): Promise<ResumenTurno> {
  const turno = await deps.turnos.buscarPorId(input.turnoId);
  if (!turno) {
    throw new TurnoNoEncontradoError();
  }

  const [pagos, egresos] = await Promise.all([
    deps.pagos.listarPorTurno(input.turnoId),
    deps.egresos.listarPorTurno(input.turnoId),
  ]);

  const metodos = new Set<string>([
    ...METODOS_EFECTIVO,
    ...pagos.map((p) => p.metodo),
    ...egresos.map((e) => e.metodo),
  ]);

  const lineas: LineaResumenMetodo[] = [...metodos].map((metodo) => {
    const totalPagos = pagos
      .filter((p) => p.metodo === metodo && !p.anuladoEn)
      .reduce((suma, p) => suma + p.monto, 0);
    const totalEgresos = egresos
      .filter((e) => e.metodo === metodo)
      .reduce((suma, e) => suma + e.monto, 0);

    const fondoInicial =
      metodo === "efectivo_usd"
        ? turno.fondoInicialUSD
        : metodo === "efectivo_bs"
          ? turno.fondoInicialBs
          : 0;

    return {
      metodo,
      totalPagos,
      totalEgresos,
      montoEsperado: fondoInicial + totalPagos - totalEgresos,
    };
  });

  return { turno, pagos, egresos, lineas };
}
```

- [ ] **Step 4: Verificar que domain compila**

Run: `cd packages/domain && npx tsc --noEmit`
Expected: sin errores nuevos relacionados a estos 3 archivos (los errores de `CerrarCaja.ts`/`RegistrarPago.ts`/`ObtenerReporteCaja.ts` persisten hasta la Tarea 6).

- [ ] **Step 5: Commit**

```bash
git add packages/domain/use-cases/AbrirTurno.ts packages/domain/use-cases/RegistrarEgreso.ts packages/domain/use-cases/ObtenerResumenTurno.ts
git commit -m "feat: agrega casos de uso AbrirTurno, RegistrarEgreso y ObtenerResumenTurno"
```

---

### Task 6: Casos de uso — CerrarTurno, AnularPago; actualizar RegistrarPago; reemplazar ObtenerReporteCaja; eliminar CerrarCaja

**Files:**
- Create: `packages/domain/use-cases/CerrarTurno.ts`
- Create: `packages/domain/use-cases/AnularPago.ts`
- Modify: `packages/domain/use-cases/RegistrarPago.ts`
- Modify: `packages/domain/use-cases/ObtenerReporteCaja.ts`
- Delete: `packages/domain/use-cases/CerrarCaja.ts`

**Interfaces:**
- Consumes: `ITurnoRepository`, `IArqueoRepository`, `IPagoRepository`, `METODOS_EFECTIVO`+`obtenerResumenTurno` de `./ObtenerResumenTurno` (Tarea 5); `RolUsuario` de `../entities/UsuarioAdmin`.
- Produces: `cerrarTurno`, `TurnoYaCerradoError`, `NotaRequeridaError`; `anularPago`, `RolNoAutorizadoError`, `PagoNoEncontradoError`, `PagoYaAnuladoError`; `registrarPago` con nuevo input; `obtenerReporteCaja` reescrito para turnos.

- [ ] **Step 1: Crear `packages/domain/use-cases/CerrarTurno.ts`**

```ts
import { ITurnoRepository } from "../ports/ITurnoRepository";
import { IArqueoRepository } from "../ports/IArqueoRepository";
import { IPagoRepository } from "../ports/IPagoRepository";
import { IEgresoRepository } from "../ports/IEgresoRepository";
import { ArqueoLinea } from "../entities/ArqueoLinea";
import { RolUsuario } from "../entities/UsuarioAdmin";
import { obtenerResumenTurno } from "./ObtenerResumenTurno";

export class RolNoAutorizadoError extends Error {
  constructor() {
    super("Tu rol no tiene permiso para realizar esta acción.");
  }
}

export class TurnoYaCerradoError extends Error {
  constructor() {
    super("Este turno ya fue cerrado.");
  }
}

export class NotaRequeridaError extends Error {
  constructor(public readonly metodo: string) {
    super(`Hay una diferencia en "${metodo}" — se requiere una nota explicando el motivo.`);
  }
}

export interface LineaArqueoInput {
  metodo: string;
  montoContado: number;
  nota?: string;
}

export interface DatosCerrarTurno {
  turnoId: string;
  rolUsuario: RolUsuario;
  lineas: LineaArqueoInput[];
}

export async function cerrarTurno(
  deps: { turnos: ITurnoRepository; arqueo: IArqueoRepository; pagos: IPagoRepository; egresos: IEgresoRepository },
  input: DatosCerrarTurno
): Promise<ArqueoLinea[]> {
  if (input.rolUsuario === "ENTRENADOR") {
    throw new RolNoAutorizadoError();
  }

  const resumen = await obtenerResumenTurno(deps, { turnoId: input.turnoId });
  if (resumen.turno.estado === "CERRADO") {
    throw new TurnoYaCerradoError();
  }

  const esperadoPorMetodo = new Map(resumen.lineas.map((l) => [l.metodo, l.montoEsperado]));

  const datosLineas = input.lineas.map((linea) => {
    const montoEsperado = esperadoPorMetodo.get(linea.metodo) ?? 0;
    const diferencia = linea.montoContado - montoEsperado;

    if (diferencia !== 0 && !linea.nota?.trim()) {
      throw new NotaRequeridaError(linea.metodo);
    }

    return {
      turnoId: input.turnoId,
      metodo: linea.metodo,
      montoEsperado,
      montoContado: linea.montoContado,
      diferencia,
      nota: linea.nota?.trim() || null,
    };
  });

  const lineasCreadas = await deps.arqueo.crearLineas(datosLineas);
  await deps.turnos.cerrar(input.turnoId, new Date());

  return lineasCreadas;
}
```

- [ ] **Step 2: Crear `packages/domain/use-cases/AnularPago.ts`**

```ts
import { IPagoRepository } from "../ports/IPagoRepository";
import { Pago } from "../entities/Pago";
import { RolUsuario } from "../entities/UsuarioAdmin";

export class RolNoAutorizadoError extends Error {
  constructor() {
    super("Solo el dueño o un gerente pueden anular un pago.");
  }
}

export class PagoNoEncontradoError extends Error {
  constructor() {
    super("No se encontró el pago.");
  }
}

export class PagoYaAnuladoError extends Error {
  constructor() {
    super("Este pago ya fue anulado.");
  }
}

export class MotivoRequeridoError extends Error {
  constructor() {
    super("El motivo de la anulación es requerido.");
  }
}

export interface DatosAnularPago {
  pagoId: string;
  anuladoPorId: string;
  rolAnulador: RolUsuario;
  motivo: string;
}

export async function anularPago(
  deps: { pagos: IPagoRepository },
  input: DatosAnularPago
): Promise<Pago> {
  if (input.rolAnulador !== "DUENO" && input.rolAnulador !== "GERENTE") {
    throw new RolNoAutorizadoError();
  }

  if (!input.motivo.trim()) {
    throw new MotivoRequeridoError();
  }

  const pago = await deps.pagos.buscarPorId(input.pagoId);
  if (!pago) {
    throw new PagoNoEncontradoError();
  }
  if (pago.anuladoEn) {
    throw new PagoYaAnuladoError();
  }

  return deps.pagos.anular(input.pagoId, input.anuladoPorId, input.motivo.trim(), new Date());
}
```

- [ ] **Step 3: Modificar `packages/domain/use-cases/RegistrarPago.ts`**

Reemplazar el contenido completo por:

```ts
import { IPagoRepository } from "../ports/IPagoRepository";
import { ISuscripcionRepository } from "../ports/ISuscripcionRepository";
import { IMemberRepository } from "../ports/IMemberRepository";
import { IPlanRepository } from "../ports/IPlanRepository";
import { ITurnoRepository } from "../ports/ITurnoRepository";
import { Pago } from "../entities/Pago";
import { RolUsuario } from "../entities/UsuarioAdmin";

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

export class RolNoAutorizadoError extends Error {
  constructor() {
    super("Tu rol no tiene permiso para registrar pagos.");
  }
}

export interface RegistrarPagoDeps {
  pagos: IPagoRepository;
  suscripciones: ISuscripcionRepository;
  miembros: IMemberRepository;
  planes: IPlanRepository;
  turnos: ITurnoRepository;
}

export interface DatosRegistrarPago {
  organizacionId: string;
  miembroId: string;
  planId: string;
  monto: number;
  metodo: string;
  numeroOperacion: string | null;
  tasaCambio: number | null;
  sucursalId: string;
  registradoPorId: string;
  rolUsuario: RolUsuario;
}

export async function registrarPago(deps: RegistrarPagoDeps, input: DatosRegistrarPago): Promise<Pago> {
  if (input.rolUsuario === "ENTRENADOR") {
    throw new RolNoAutorizadoError();
  }

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

  const turnoAbierto = await deps.turnos.buscarAbiertoPorSucursal(input.sucursalId);

  return deps.pagos.crear({
    miembroId: input.miembroId,
    sucursalId: input.sucursalId,
    turnoId: turnoAbierto?.id ?? null,
    registradoPorId: input.registradoPorId,
    monto: input.monto,
    metodo: input.metodo,
    numeroOperacion: input.numeroOperacion,
    tasaCambio: input.tasaCambio,
  });
}
```

- [ ] **Step 4: Modificar `packages/domain/use-cases/ObtenerReporteCaja.ts`**

Reemplazar el contenido completo por:

```ts
import { ITurnoRepository } from "../ports/ITurnoRepository";
import { IPagoRepository } from "../ports/IPagoRepository";
import { IEgresoRepository } from "../ports/IEgresoRepository";
import { IArqueoRepository } from "../ports/IArqueoRepository";
import { Turno } from "../entities/Turno";
import { Pago } from "../entities/Pago";
import { Egreso } from "../entities/Egreso";
import { ArqueoLinea } from "../entities/ArqueoLinea";

export interface FilaReporteTurno {
  turno: Turno;
  pagos: Pago[];
  egresos: Egreso[];
  arqueo: ArqueoLinea[];
  totalUSD: number;
}

export interface ReporteCaja {
  turnos: FilaReporteTurno[];
  ajustesFueraDeTurno: Pago[];
  totalUSD: number;
}

export async function obtenerReporteCaja(
  deps: { turnos: ITurnoRepository; pagos: IPagoRepository; egresos: IEgresoRepository; arqueo: IArqueoRepository },
  input: { organizacionId: string; desde: Date; hasta: Date }
): Promise<ReporteCaja> {
  const [turnos, todosLosPagos] = await Promise.all([
    deps.turnos.listarPorOrganizacionYRango(input.organizacionId, input.desde, input.hasta),
    deps.pagos.listarPorOrganizacionYRango(input.organizacionId, input.desde, input.hasta),
  ]);

  const filasTurno: FilaReporteTurno[] = await Promise.all(
    turnos.map(async (turno) => {
      const [pagos, egresos, arqueo] = await Promise.all([
        deps.pagos.listarPorTurno(turno.id),
        deps.egresos.listarPorTurno(turno.id),
        deps.arqueo.listarPorTurno(turno.id),
      ]);
      const totalUSD = pagos.filter((p) => !p.anuladoEn).reduce((suma, p) => suma + p.monto, 0);
      return { turno, pagos, egresos, arqueo, totalUSD };
    })
  );

  const ajustesFueraDeTurno = todosLosPagos.filter((p) => !p.turnoId);
  const totalUSD = todosLosPagos.filter((p) => !p.anuladoEn).reduce((suma, p) => suma + p.monto, 0);

  return { turnos: filasTurno, ajustesFueraDeTurno, totalUSD };
}
```

- [ ] **Step 5: Eliminar `packages/domain/use-cases/CerrarCaja.ts`**

```bash
git rm packages/domain/use-cases/CerrarCaja.ts
```

- [ ] **Step 6: Verificar que domain compila limpio**

Run: `cd packages/domain && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add packages/domain/use-cases
git commit -m "feat: agrega CerrarTurno y AnularPago; reescribe RegistrarPago y ObtenerReporteCaja para turnos"
```

---

### Task 7: Adaptadores Prisma — PrismaTurnoRepository, PrismaEgresoRepository, PrismaArqueoRepository; actualizar PrismaPagoRepository

**Files:**
- Create: `packages/infrastructure/persistence/prisma/PrismaTurnoRepository.ts`
- Create: `packages/infrastructure/persistence/prisma/PrismaEgresoRepository.ts`
- Create: `packages/infrastructure/persistence/prisma/PrismaArqueoRepository.ts`
- Modify: `packages/infrastructure/persistence/prisma/PrismaPagoRepository.ts`
- Delete: `packages/infrastructure/persistence/prisma/PrismaCierreCajaRepository.ts`

**Interfaces:**
- Consumes: `ITurnoRepository`, `IEgresoRepository`, `IArqueoRepository`, `IPagoRepository` (Tarea 4); `Turno`/`DatosNuevoTurno`, `Egreso`/`DatosNuevoEgreso`, `ArqueoLinea`/`DatosNuevaArqueoLinea`, `Pago`/`DatosNuevoPago` (Tarea 3); `PrismaClient` de `@gym-app/db/generated/prisma/client` (patrón existente en `PrismaPagoRepository.ts`).
- Produces: implementaciones concretas usadas por las Server Actions (Tarea 8).

- [ ] **Step 1: Crear `packages/infrastructure/persistence/prisma/PrismaTurnoRepository.ts`**

```ts
import type { PrismaClient } from "@gym-app/db/generated/prisma/client";
import type { ITurnoRepository } from "@gym-app/domain/ports/ITurnoRepository";
import type { Turno, DatosNuevoTurno } from "@gym-app/domain/entities/Turno";

type FilaTurno = {
  id: string;
  organizacionId: string;
  sucursalId: string;
  usuarioId: string;
  fondoInicialUSD: { toNumber(): number };
  fondoInicialBs: { toNumber(): number };
  abiertoEn: Date;
  cerradoEn: Date | null;
  estado: "ABIERTO" | "CERRADO";
};

function mapear(fila: FilaTurno): Turno {
  return {
    id: fila.id,
    organizacionId: fila.organizacionId,
    sucursalId: fila.sucursalId,
    usuarioId: fila.usuarioId,
    fondoInicialUSD: fila.fondoInicialUSD.toNumber(),
    fondoInicialBs: fila.fondoInicialBs.toNumber(),
    abiertoEn: fila.abiertoEn,
    cerradoEn: fila.cerradoEn,
    estado: fila.estado,
  };
}

export class PrismaTurnoRepository implements ITurnoRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async crear(datos: DatosNuevoTurno): Promise<Turno> {
    const turno = await this.prisma.turno.create({
      data: {
        organizacionId: datos.organizacionId,
        sucursalId: datos.sucursalId,
        usuarioId: datos.usuarioId,
        fondoInicialUSD: datos.fondoInicialUSD,
        fondoInicialBs: datos.fondoInicialBs,
      },
    });
    return mapear(turno);
  }

  async buscarPorId(id: string): Promise<Turno | null> {
    const turno = await this.prisma.turno.findUnique({ where: { id } });
    return turno ? mapear(turno) : null;
  }

  async buscarAbiertoPorSucursal(sucursalId: string): Promise<Turno | null> {
    const turno = await this.prisma.turno.findFirst({
      where: { sucursalId, estado: "ABIERTO" },
    });
    return turno ? mapear(turno) : null;
  }

  async cerrar(id: string, cerradoEn: Date): Promise<Turno> {
    const turno = await this.prisma.turno.update({
      where: { id },
      data: { estado: "CERRADO", cerradoEn },
    });
    return mapear(turno);
  }

  async listarPorOrganizacionYRango(organizacionId: string, desde: Date, hasta: Date): Promise<Turno[]> {
    const turnos = await this.prisma.turno.findMany({
      where: { organizacionId, abiertoEn: { gte: desde, lte: hasta } },
      orderBy: { abiertoEn: "desc" },
    });
    return turnos.map(mapear);
  }
}
```

- [ ] **Step 2: Crear `packages/infrastructure/persistence/prisma/PrismaEgresoRepository.ts`**

```ts
import type { PrismaClient } from "@gym-app/db/generated/prisma/client";
import type { IEgresoRepository } from "@gym-app/domain/ports/IEgresoRepository";
import type { Egreso, DatosNuevoEgreso } from "@gym-app/domain/entities/Egreso";

type FilaEgreso = {
  id: string;
  turnoId: string;
  monto: { toNumber(): number };
  moneda: "USD" | "BS";
  metodo: string;
  motivo: string;
  registradoEn: Date;
};

function mapear(fila: FilaEgreso): Egreso {
  return {
    id: fila.id,
    turnoId: fila.turnoId,
    monto: fila.monto.toNumber(),
    moneda: fila.moneda,
    metodo: fila.metodo,
    motivo: fila.motivo,
    registradoEn: fila.registradoEn,
  };
}

export class PrismaEgresoRepository implements IEgresoRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async crear(datos: DatosNuevoEgreso): Promise<Egreso> {
    const egreso = await this.prisma.egreso.create({
      data: {
        turnoId: datos.turnoId,
        monto: datos.monto,
        moneda: datos.moneda,
        metodo: datos.metodo,
        motivo: datos.motivo,
      },
    });
    return mapear(egreso);
  }

  async listarPorTurno(turnoId: string): Promise<Egreso[]> {
    const egresos = await this.prisma.egreso.findMany({
      where: { turnoId },
      orderBy: { registradoEn: "asc" },
    });
    return egresos.map(mapear);
  }
}
```

- [ ] **Step 3: Crear `packages/infrastructure/persistence/prisma/PrismaArqueoRepository.ts`**

```ts
import type { PrismaClient } from "@gym-app/db/generated/prisma/client";
import type { IArqueoRepository } from "@gym-app/domain/ports/IArqueoRepository";
import type { ArqueoLinea, DatosNuevaArqueoLinea } from "@gym-app/domain/entities/ArqueoLinea";

type FilaArqueo = {
  id: string;
  turnoId: string;
  metodo: string;
  montoEsperado: { toNumber(): number };
  montoContado: { toNumber(): number };
  diferencia: { toNumber(): number };
  nota: string | null;
};

function mapear(fila: FilaArqueo): ArqueoLinea {
  return {
    id: fila.id,
    turnoId: fila.turnoId,
    metodo: fila.metodo,
    montoEsperado: fila.montoEsperado.toNumber(),
    montoContado: fila.montoContado.toNumber(),
    diferencia: fila.diferencia.toNumber(),
    nota: fila.nota,
  };
}

export class PrismaArqueoRepository implements IArqueoRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async crearLineas(lineas: DatosNuevaArqueoLinea[]): Promise<ArqueoLinea[]> {
    await this.prisma.arqueoLinea.createMany({
      data: lineas.map((l) => ({
        turnoId: l.turnoId,
        metodo: l.metodo,
        montoEsperado: l.montoEsperado,
        montoContado: l.montoContado,
        diferencia: l.diferencia,
        nota: l.nota,
      })),
    });
    return this.listarPorTurno(lineas[0]?.turnoId ?? "");
  }

  async listarPorTurno(turnoId: string): Promise<ArqueoLinea[]> {
    const lineas = await this.prisma.arqueoLinea.findMany({ where: { turnoId } });
    return lineas.map(mapear);
  }
}
```

- [ ] **Step 4: Modificar `packages/infrastructure/persistence/prisma/PrismaPagoRepository.ts`**

Reemplazar el contenido completo por:

```ts
import type { PrismaClient } from "@gym-app/db/generated/prisma/client";
import type { IPagoRepository } from "@gym-app/domain/ports/IPagoRepository";
import type { Pago, DatosNuevoPago } from "@gym-app/domain/entities/Pago";

type FilaPago = {
  id: string;
  miembroId: string;
  sucursalId: string;
  turnoId: string | null;
  registradoPorId: string;
  monto: { toNumber(): number };
  metodo: string;
  numeroOperacion: string | null;
  tasaCambio: { toNumber(): number } | null;
  fechaPago: Date;
  anuladoEn: Date | null;
  anuladoPorId: string | null;
  motivoAnulacion: string | null;
};

function mapear(pago: FilaPago): Pago {
  return {
    id: pago.id,
    miembroId: pago.miembroId,
    sucursalId: pago.sucursalId,
    turnoId: pago.turnoId,
    registradoPorId: pago.registradoPorId,
    monto: pago.monto.toNumber(),
    metodo: pago.metodo,
    numeroOperacion: pago.numeroOperacion,
    tasaCambio: pago.tasaCambio ? pago.tasaCambio.toNumber() : null,
    fechaPago: pago.fechaPago,
    anuladoEn: pago.anuladoEn,
    anuladoPorId: pago.anuladoPorId,
    motivoAnulacion: pago.motivoAnulacion,
  };
}

export class PrismaPagoRepository implements IPagoRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async crear(datos: DatosNuevoPago): Promise<Pago> {
    const pago = await this.prisma.pago.create({
      data: {
        miembroId: datos.miembroId,
        sucursalId: datos.sucursalId,
        turnoId: datos.turnoId,
        registradoPorId: datos.registradoPorId,
        monto: datos.monto,
        metodo: datos.metodo,
        numeroOperacion: datos.numeroOperacion,
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

  async listarPorOrganizacionYRango(organizacionId: string, desde: Date, hasta: Date): Promise<Pago[]> {
    const pagos = await this.prisma.pago.findMany({
      where: { miembro: { organizacionId }, fechaPago: { gte: desde, lte: hasta } },
      include: { miembro: { select: { nombre: true, precioPlan: true } } },
      orderBy: { fechaPago: "asc" },
    });
    return pagos.map((pago) => ({
      ...mapear(pago),
      miembroNombre: pago.miembro.nombre,
      miembroPrecioPlan: pago.miembro.precioPlan.toNumber(),
    }));
  }

  async listarPorTurno(turnoId: string): Promise<Pago[]> {
    const pagos = await this.prisma.pago.findMany({
      where: { turnoId },
      include: { miembro: { select: { nombre: true } } },
      orderBy: { fechaPago: "asc" },
    });
    return pagos.map((pago) => ({ ...mapear(pago), miembroNombre: pago.miembro.nombre }));
  }

  async buscarPorId(id: string): Promise<Pago | null> {
    const pago = await this.prisma.pago.findUnique({
      where: { id },
      include: { miembro: { select: { nombre: true } } },
    });
    return pago ? { ...mapear(pago), miembroNombre: pago.miembro.nombre } : null;
  }

  async anular(id: string, anuladoPorId: string, motivo: string, anuladoEn: Date): Promise<Pago> {
    const pago = await this.prisma.pago.update({
      where: { id },
      data: { anuladoEn, anuladoPorId, motivoAnulacion: motivo },
    });
    return mapear(pago);
  }
}
```

- [ ] **Step 5: Eliminar `packages/infrastructure/persistence/prisma/PrismaCierreCajaRepository.ts`**

```bash
git rm packages/infrastructure/persistence/prisma/PrismaCierreCajaRepository.ts
```

- [ ] **Step 6: Verificar que infrastructure compila**

Run: `cd packages/infrastructure && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add packages/infrastructure/persistence/prisma
git commit -m "feat: agrega adaptadores Prisma para Turno, Egreso y Arqueo; extiende PrismaPagoRepository"
```

---

### Task 8: Server Actions de Caja — abrir turno, registrar egreso, cerrar turno, anular pago

**Files:**
- Create: `apps/web-admin/app/(panel)/caja/actions.ts` (reescribe el archivo existente por completo)
- Create: `apps/web-admin/app/(panel)/fechas.ts`

**Interfaces:**
- Consumes: `abrirTurno`/`RolNoAutorizadoError`/`TurnoYaAbiertoError` de `@gym-app/domain/use-cases/AbrirTurno`; `registrarEgreso`/`TurnoCerradoError`/`MotivoRequeridoError` de `@gym-app/domain/use-cases/RegistrarEgreso`; `cerrarTurno`/`TurnoYaCerradoError`/`NotaRequeridaError` de `@gym-app/domain/use-cases/CerrarTurno`; `anularPago`/`PagoNoEncontradoError`/`PagoYaAnuladoError` de `@gym-app/domain/use-cases/AnularPago`; `PrismaTurnoRepository`, `PrismaEgresoRepository`, `PrismaArqueoRepository`, `PrismaPagoRepository` (Tarea 7); `obtenerUsuarioDeSesionActual` de `@/lib/sesion`; `METODOS_PAGO` de `../metodosPago`.
- Produces: `abrirTurnoAction`, `registrarEgresoAction`, `cerrarTurnoAction`, `anularPagoAction` — consumidos por la Tarea 9 (pantallas); `inicioDelDia`, `finDelDia`, `inicioDeSemana`, `finDeSemana`, `inicioDeMes`, `finDeMes`, `formatearFechaISO` en `fechas.ts` — consumidos por la Tarea 9 (reemplazan las copias locales en `page.tsx`).

- [ ] **Step 1: Crear `apps/web-admin/app/(panel)/fechas.ts`**

Extrae los helpers duplicados de `caja/page.tsx` (líneas 18-57 del archivo actual) a un módulo compartido:

```ts
// OJO: nunca usar fecha.toISOString() acá — convierte a UTC primero, y de
// noche (pasadas las 8pm en Venezuela, UTC-4) eso salta al día siguiente.
// Se arma el string a mano con los componentes locales de la fecha.
export function formatearFechaISO(fecha: Date): string {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}

export function inicioDelDia(fecha: Date): Date {
  const d = new Date(fecha);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function finDelDia(fecha: Date): Date {
  const d = new Date(fecha);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function inicioDeSemana(fecha: Date): Date {
  const d = inicioDelDia(fecha);
  const dia = d.getDay();
  const diff = dia === 0 ? 6 : dia - 1;
  d.setDate(d.getDate() - diff);
  return d;
}

export function finDeSemana(fecha: Date): Date {
  const d = inicioDeSemana(fecha);
  d.setDate(d.getDate() + 6);
  return finDelDia(d);
}

export function inicioDeMes(fecha: Date): Date {
  return new Date(fecha.getFullYear(), fecha.getMonth(), 1);
}

export function finDeMes(fecha: Date): Date {
  return finDelDia(new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0));
}
```

- [ ] **Step 2: Reescribir `apps/web-admin/app/(panel)/caja/actions.ts`**

```ts
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaTurnoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaTurnoRepository";
import { PrismaEgresoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaEgresoRepository";
import { PrismaArqueoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaArqueoRepository";
import { PrismaPagoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPagoRepository";
import { abrirTurno, RolNoAutorizadoError as RolNoAutorizadoAbrir, TurnoYaAbiertoError } from "@gym-app/domain/use-cases/AbrirTurno";
import { registrarEgreso, RolNoAutorizadoError as RolNoAutorizadoEgreso, TurnoCerradoError, MotivoRequeridoError } from "@gym-app/domain/use-cases/RegistrarEgreso";
import { cerrarTurno, RolNoAutorizadoError as RolNoAutorizadoCerrar, TurnoYaCerradoError, NotaRequeridaError } from "@gym-app/domain/use-cases/CerrarTurno";
import { anularPago, RolNoAutorizadoError as RolNoAutorizadoAnular, PagoNoEncontradoError, PagoYaAnuladoError, MotivoRequeridoError as MotivoRequeridoAnular } from "@gym-app/domain/use-cases/AnularPago";
import { METODOS_PAGO } from "../metodosPago";

export interface EstadoAbrirTurno {
  error?: string;
}

export async function abrirTurnoAction(
  _estadoPrevio: EstadoAbrirTurno,
  formData: FormData
): Promise<EstadoAbrirTurno> {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const sucursalId = usuario.sucursalId ?? formData.get("sucursalId")?.toString();
  if (!sucursalId) {
    return { error: "Debés seleccionar una sucursal para abrir el turno." };
  }

  const fondoInicialUSD = Number(formData.get("fondoInicialUSD"));
  const fondoInicialBs = Number(formData.get("fondoInicialBs"));
  if (Number.isNaN(fondoInicialUSD) || Number.isNaN(fondoInicialBs)) {
    return { error: "El fondo inicial en USD y en Bs son requeridos." };
  }

  try {
    await abrirTurno(
      { turnos: new PrismaTurnoRepository(prisma) },
      {
        organizacionId: usuario.organizacionId,
        sucursalId,
        usuarioId: usuario.id,
        rolUsuario: usuario.rol,
        fondoInicialUSD,
        fondoInicialBs,
      }
    );
  } catch (error) {
    if (error instanceof TurnoYaAbiertoError || error instanceof RolNoAutorizadoAbrir) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/caja");
  return {};
}

export interface EstadoRegistrarEgreso {
  error?: string;
}

export async function registrarEgresoAction(
  _estadoPrevio: EstadoRegistrarEgreso,
  formData: FormData
): Promise<EstadoRegistrarEgreso> {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const turnoId = formData.get("turnoId")?.toString();
  const monto = Number(formData.get("monto"));
  const moneda = formData.get("moneda")?.toString();
  const metodo = formData.get("metodo")?.toString();
  const motivo = formData.get("motivo")?.toString() ?? "";

  if (!turnoId || Number.isNaN(monto) || (moneda !== "USD" && moneda !== "BS") || !metodo) {
    return { error: "Monto, moneda y método son requeridos." };
  }

  try {
    await registrarEgreso(
      { turnos: new PrismaTurnoRepository(prisma), egresos: new PrismaEgresoRepository(prisma) },
      { turnoId, rolUsuario: usuario.rol, monto, moneda, metodo, motivo }
    );
  } catch (error) {
    if (
      error instanceof TurnoCerradoError ||
      error instanceof MotivoRequeridoError ||
      error instanceof RolNoAutorizadoEgreso
    ) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/caja");
  return {};
}

export interface EstadoCerrarTurno {
  error?: string;
}

export async function cerrarTurnoAction(
  _estadoPrevio: EstadoCerrarTurno,
  formData: FormData
): Promise<EstadoCerrarTurno> {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const turnoId = formData.get("turnoId")?.toString();
  if (!turnoId) redirect("/caja");

  const lineas = METODOS_PAGO.map((m) => {
    const montoContadoTexto = formData.get(`montoContado_${m.value}`)?.toString();
    if (montoContadoTexto === undefined || montoContadoTexto === "") return null;
    return {
      metodo: m.value,
      montoContado: Number(montoContadoTexto),
      nota: formData.get(`nota_${m.value}`)?.toString() || undefined,
    };
  }).filter((l): l is { metodo: string; montoContado: number; nota?: string } => l !== null);

  try {
    await cerrarTurno(
      {
        turnos: new PrismaTurnoRepository(prisma),
        arqueo: new PrismaArqueoRepository(prisma),
        pagos: new PrismaPagoRepository(prisma),
        egresos: new PrismaEgresoRepository(prisma),
      },
      { turnoId, rolUsuario: usuario.rol, lineas }
    );
  } catch (error) {
    if (
      error instanceof TurnoYaCerradoError ||
      error instanceof NotaRequeridaError ||
      error instanceof RolNoAutorizadoCerrar
    ) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/caja");
  return {};
}

export interface EstadoAnularPago {
  error?: string;
}

export async function anularPagoAction(
  _estadoPrevio: EstadoAnularPago,
  formData: FormData
): Promise<EstadoAnularPago> {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const pagoId = formData.get("pagoId")?.toString();
  const motivo = formData.get("motivo")?.toString() ?? "";
  if (!pagoId) {
    return { error: "Pago inválido." };
  }

  try {
    await anularPago(
      { pagos: new PrismaPagoRepository(prisma) },
      { pagoId, anuladoPorId: usuario.id, rolAnulador: usuario.rol, motivo }
    );
  } catch (error) {
    if (
      error instanceof RolNoAutorizadoAnular ||
      error instanceof PagoNoEncontradoError ||
      error instanceof PagoYaAnuladoError ||
      error instanceof MotivoRequeridoAnular
    ) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/caja");
  return {};
}
```

- [ ] **Step 3: Verificar que web-admin compila (errores esperados en `page.tsx`, se resuelven en la Tarea 9)**

Run: `cd apps/web-admin && npx tsc --noEmit`
Expected: errores solo en `app/(panel)/caja/page.tsx` y `app/(panel)/pagos/actions.ts` (se resuelven en Tareas 9-10) — ningún otro error inesperado.

- [ ] **Step 4: Commit**

```bash
git add "apps/web-admin/app/(panel)/caja/actions.ts" "apps/web-admin/app/(panel)/fechas.ts"
git commit -m "feat: agrega Server Actions de turno (abrir/cerrar), egreso y anulación de pago"
```

---

### Task 9: Pantallas de Caja — abrir turno, turno activo, arqueo de cierre, reporte histórico

**Files:**
- Create: `apps/web-admin/app/(panel)/caja/page.tsx` (reescribe el archivo existente por completo)
- Create: `apps/web-admin/app/(panel)/caja/FormularioAbrirTurno.tsx`
- Create: `apps/web-admin/app/(panel)/caja/FormularioEgreso.tsx`
- Create: `apps/web-admin/app/(panel)/caja/FormularioArqueo.tsx`

**Interfaces:**
- Consumes: `abrirTurnoAction`, `registrarEgresoAction`, `cerrarTurnoAction`, `anularPagoAction`, `EstadoAbrirTurno`, `EstadoRegistrarEgreso`, `EstadoCerrarTurno`, `EstadoAnularPago` (Tarea 8, `./actions`); `obtenerResumenTurno`, `ResumenTurno`, `METODOS_EFECTIVO` de `@gym-app/domain/use-cases/ObtenerResumenTurno`; `obtenerReporteCaja`, `ReporteCaja` de `@gym-app/domain/use-cases/ObtenerReporteCaja`; `PrismaTurnoRepository`, `PrismaPagoRepository`, `PrismaEgresoRepository`, `PrismaArqueoRepository` (Tarea 7); helpers de `../fechas` (Tarea 8); `Button`, `Input` de `@gym-app/ui/components/*`; `METODOS_PAGO` de `../metodosPago`; `TASA_BCV_FIJA`, `formatearBs` de `../tasaBcvFija`.
- Produces: pantalla `/caja` completa — no consumida por otras tareas.

- [ ] **Step 1: Crear `apps/web-admin/app/(panel)/caja/FormularioAbrirTurno.tsx`**

```tsx
"use client";

import { useActionState } from "react";
import { Button } from "@gym-app/ui/components/Button";
import { Input } from "@gym-app/ui/components/Input";
import type { EstadoAbrirTurno } from "./actions";

export function FormularioAbrirTurno({
  accion,
  requiereSucursal,
  sucursales,
}: {
  accion: (estado: EstadoAbrirTurno, formData: FormData) => Promise<EstadoAbrirTurno>;
  requiereSucursal: boolean;
  sucursales: Array<{ id: string; nombre: string }>;
}) {
  const [estado, enviar, enviando] = useActionState(accion, {});

  return (
    <form action={enviar} className="flex max-w-md flex-col gap-4 rounded-xl border border-neutral-200 p-6">
      <h2 className="text-lg font-semibold text-neutral-900">Abrir turno</h2>

      {estado.error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{estado.error}</p>}

      {requiereSucursal && (
        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          Sucursal
          <select name="sucursalId" required className="rounded border border-neutral-300 px-3 py-2">
            <option value="">Seleccioná una sucursal</option>
            {sucursales.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        </label>
      )}

      <Input name="fondoInicialUSD" label="Fondo inicial (USD)" type="number" step="0.01" required defaultValue="0" />
      <Input name="fondoInicialBs" label="Fondo inicial (Bs)" type="number" step="0.01" required defaultValue="0" />

      <Button type="submit" disabled={enviando}>
        {enviando ? "Abriendo..." : "Abrir turno"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: Crear `apps/web-admin/app/(panel)/caja/FormularioEgreso.tsx`**

```tsx
"use client";

import { useActionState, useState } from "react";
import { Button } from "@gym-app/ui/components/Button";
import { Input } from "@gym-app/ui/components/Input";
import type { EstadoRegistrarEgreso } from "./actions";

const METODOS_EGRESO = [
  { value: "efectivo_usd", label: "Efectivo (USD)", moneda: "USD" as const },
  { value: "efectivo_bs", label: "Efectivo (Bs)", moneda: "BS" as const },
];

export function FormularioEgreso({
  accion,
  turnoId,
}: {
  accion: (estado: EstadoRegistrarEgreso, formData: FormData) => Promise<EstadoRegistrarEgreso>;
  turnoId: string;
}) {
  const [estado, enviar, enviando] = useActionState(accion, {});
  const [metodo, setMetodo] = useState(METODOS_EGRESO[0].value);
  const moneda = METODOS_EGRESO.find((m) => m.value === metodo)?.moneda ?? "USD";

  return (
    <form action={enviar} className="flex flex-col gap-3 rounded-xl border border-neutral-200 p-5">
      <h3 className="text-sm font-semibold text-neutral-900">Registrar egreso</h3>

      {estado.error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{estado.error}</p>}

      <input type="hidden" name="turnoId" value={turnoId} />
      <input type="hidden" name="moneda" value={moneda} />

      <label className="flex flex-col gap-1 text-sm text-neutral-700">
        Método
        <select
          name="metodo"
          value={metodo}
          onChange={(e) => setMetodo(e.target.value)}
          className="rounded border border-neutral-300 px-3 py-2"
        >
          {METODOS_EGRESO.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </label>

      <Input name="monto" label={`Monto (${moneda})`} type="number" step="0.01" required />
      <Input name="motivo" label="Motivo" required />

      <Button type="submit" disabled={enviando}>
        {enviando ? "Registrando..." : "Registrar egreso"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 3: Crear `apps/web-admin/app/(panel)/caja/FormularioArqueo.tsx`**

```tsx
"use client";

import { useActionState, useState } from "react";
import { Button } from "@gym-app/ui/components/Button";
import { Input } from "@gym-app/ui/components/Input";
import type { EstadoCerrarTurno } from "./actions";
import { METODOS_PAGO } from "../metodosPago";

export interface LineaEsperada {
  metodo: string;
  montoEsperado: number;
}

export function FormularioArqueo({
  accion,
  turnoId,
  lineas,
}: {
  accion: (estado: EstadoCerrarTurno, formData: FormData) => Promise<EstadoCerrarTurno>;
  turnoId: string;
  lineas: LineaEsperada[];
}) {
  const [estado, enviar, enviando] = useActionState(accion, {});
  const [contados, setContados] = useState<Record<string, string>>({});

  function nombreMetodo(valor: string): string {
    return METODOS_PAGO.find((m) => m.value === valor)?.label ?? valor;
  }

  return (
    <form action={enviar} className="flex flex-col gap-4 rounded-xl border border-neutral-200 p-6">
      <h2 className="text-lg font-semibold text-neutral-900">Arqueo de cierre</h2>

      {estado.error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{estado.error}</p>}

      <input type="hidden" name="turnoId" value={turnoId} />

      {lineas.map((linea) => {
        const contado = contados[linea.metodo];
        const contadoNumero = Number(contado);
        const hayDiferencia = contado !== undefined && contado !== "" && contadoNumero !== linea.montoEsperado;

        return (
          <div key={linea.metodo} className="flex flex-col gap-2 border-b border-neutral-100 pb-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-neutral-900">{nombreMetodo(linea.metodo)}</span>
              <span className="text-neutral-500">Esperado: {linea.montoEsperado.toFixed(2)}</span>
            </div>
            <Input
              name={`montoContado_${linea.metodo}`}
              label="Monto contado"
              type="number"
              step="0.01"
              required
              value={contado ?? ""}
              onChange={(e) => setContados((prev) => ({ ...prev, [linea.metodo]: e.target.value }))}
            />
            {hayDiferencia && (
              <Input name={`nota_${linea.metodo}`} label="Nota (diferencia detectada, obligatoria)" required />
            )}
          </div>
        );
      })}

      <Button type="submit" disabled={enviando}>
        {enviando ? "Cerrando..." : "Cerrar turno"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: Reescribir `apps/web-admin/app/(panel)/caja/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaTurnoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaTurnoRepository";
import { PrismaPagoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPagoRepository";
import { PrismaEgresoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaEgresoRepository";
import { PrismaArqueoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaArqueoRepository";
import { obtenerResumenTurno } from "@gym-app/domain/use-cases/ObtenerResumenTurno";
import { obtenerReporteCaja } from "@gym-app/domain/use-cases/ObtenerReporteCaja";
import { Button } from "@gym-app/ui/components/Button";
import { METODOS_PAGO } from "../metodosPago";
import { BotonImprimir } from "../BotonImprimir";
import { TASA_BCV_FIJA, formatearBs } from "../tasaBcvFija";
import { inicioDelDia, finDelDia, inicioDeSemana, finDeSemana, inicioDeMes, finDeMes, formatearFechaISO } from "../fechas";
import { FormularioAbrirTurno } from "./FormularioAbrirTurno";
import { FormularioEgreso } from "./FormularioEgreso";
import { FormularioArqueo } from "./FormularioArqueo";
import { abrirTurnoAction, registrarEgresoAction, cerrarTurnoAction } from "./actions";

function nombreMetodo(valor: string): string {
  return METODOS_PAGO.find((m) => m.value === valor)?.label ?? valor;
}

export default async function PaginaCaja({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string; periodo?: string }>;
}) {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const sucursalId = usuario.sucursalId;
  const turnoRepo = new PrismaTurnoRepository(prisma);
  const turnoAbierto = sucursalId ? await turnoRepo.buscarAbiertoPorSucursal(sucursalId) : null;

  if (turnoAbierto) {
    const resumen = await obtenerResumenTurno(
      {
        turnos: turnoRepo,
        pagos: new PrismaPagoRepository(prisma),
        egresos: new PrismaEgresoRepository(prisma),
      },
      { turnoId: turnoAbierto.id }
    );

    return (
      <div className="flex flex-col gap-6 p-8">
        <h1 className="text-2xl font-semibold">Turno activo</h1>
        <div className="rounded-xl border border-neutral-200 p-5 text-sm">
          <div className="flex justify-between">
            <span className="text-neutral-500">Abierto desde</span>
            <span className="font-medium text-neutral-900">
              {resumen.turno.abiertoEn.toLocaleString("es-VE")}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-500">Fondo inicial</span>
            <span className="font-medium text-neutral-900">
              ${resumen.turno.fondoInicialUSD.toFixed(2)} / Bs. {formatearBs(resumen.turno.fondoInicialBs)}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 p-5 text-sm">
          <h2 className="mb-3 font-semibold text-neutral-900">Resumen por método</h2>
          {resumen.lineas.map((linea) => (
            <div key={linea.metodo} className="flex justify-between border-b border-neutral-100 py-2">
              <span>{nombreMetodo(linea.metodo)}</span>
              <span className="font-medium text-neutral-900">{linea.montoEsperado.toFixed(2)} esperado</span>
            </div>
          ))}
        </div>

        <FormularioEgreso accion={registrarEgresoAction} turnoId={resumen.turno.id} />

        {resumen.egresos.length > 0 && (
          <div className="rounded-xl border border-neutral-200 p-5 text-sm">
            <h2 className="mb-3 font-semibold text-neutral-900">Egresos del turno</h2>
            {resumen.egresos.map((egreso) => (
              <div key={egreso.id} className="flex justify-between border-b border-neutral-100 py-2">
                <span>{egreso.motivo}</span>
                <span>{egreso.monto.toFixed(2)} {egreso.moneda}</span>
              </div>
            ))}
          </div>
        )}

        <FormularioArqueo accion={cerrarTurnoAction} turnoId={resumen.turno.id} lineas={resumen.lineas} />
      </div>
    );
  }

  const { fecha: fechaTexto, periodo = "dia" } = await searchParams;
  const fechaBase = fechaTexto ? new Date(`${fechaTexto}T00:00:00`) : new Date();

  const { desde, hasta } =
    periodo === "semana"
      ? { desde: inicioDeSemana(fechaBase), hasta: finDeSemana(fechaBase) }
      : periodo === "mes"
        ? { desde: inicioDeMes(fechaBase), hasta: finDeMes(fechaBase) }
        : { desde: inicioDelDia(fechaBase), hasta: finDelDia(fechaBase) };

  const reporte = await obtenerReporteCaja(
    {
      turnos: turnoRepo,
      pagos: new PrismaPagoRepository(prisma),
      egresos: new PrismaEgresoRepository(prisma),
      arqueo: new PrismaArqueoRepository(prisma),
    },
    { organizacionId: usuario.organizacionId, desde, hasta }
  );

  return (
    <div className="flex flex-col gap-6 p-8">
      <div className="flex items-center justify-between print:hidden">
        <h1 className="text-2xl font-semibold">Cierre de Caja</h1>
        <BotonImprimir />
      </div>

      <FormularioAbrirTurno
        accion={abrirTurnoAction}
        requiereSucursal={!sucursalId}
        sucursales={[]}
      />

      <form method="get" className="flex flex-wrap items-end gap-4 print:hidden">
        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          Fecha
          <input
            type="date"
            name="fecha"
            defaultValue={formatearFechaISO(fechaBase)}
            className="rounded border border-neutral-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          Período
          <select name="periodo" defaultValue={periodo} className="rounded border border-neutral-300 px-3 py-2">
            <option value="dia">Día</option>
            <option value="semana">Semana</option>
            <option value="mes">Mes</option>
          </select>
        </label>
        <Button type="submit">Ver</Button>
      </form>

      <div className="flex items-center gap-3 text-sm text-neutral-500">
        <span>
          {formatearFechaISO(desde)} — {formatearFechaISO(hasta)}
        </span>
        <span className="ml-auto text-base font-semibold text-neutral-900">
          Total: ${reporte.totalUSD.toFixed(2)}
        </span>
      </div>

      {reporte.turnos.map((fila) => (
        <div key={fila.turno.id} className="rounded-xl border border-neutral-200 p-5 text-sm">
          <div className="mb-2 flex justify-between font-medium text-neutral-900">
            <span>Turno {fila.turno.abiertoEn.toLocaleString("es-VE")}</span>
            <span>${fila.totalUSD.toFixed(2)}</span>
          </div>
          {fila.arqueo.map((linea) => (
            <div key={linea.metodo} className="flex justify-between text-neutral-500">
              <span>{nombreMetodo(linea.metodo)}</span>
              <span>
                {linea.montoContado.toFixed(2)} contado ({linea.diferencia === 0 ? "sin diferencia" : `dif. ${linea.diferencia.toFixed(2)}`})
              </span>
            </div>
          ))}
        </div>
      ))}

      {reporte.ajustesFueraDeTurno.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm">
          <h2 className="mb-3 font-semibold text-amber-900">Ajustes fuera de turno</h2>
          {reporte.ajustesFueraDeTurno.map((pago) => (
            <div key={pago.id} className="flex justify-between border-b border-amber-100 py-2">
              <span>{pago.miembroNombre ?? pago.miembroId} — {nombreMetodo(pago.metodo)}</span>
              <span>${pago.monto.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}

      {reporte.turnos.length === 0 && reporte.ajustesFueraDeTurno.length === 0 && (
        <p className="text-neutral-500">Sin turnos en este período.</p>
      )}
    </div>
  );
}
```

Nota para el implementador: `TASA_BCV_FIJA` queda importado pero sin uso visible en esta versión mínima de la pantalla de reporte histórico (el desglose ahora se basa en `ArqueoLinea`, no en filas de pago individuales convertidas a Bs). Si `tsc`/`eslint` reportan el import como no usado, quitarlo — no es un requisito funcional de esta tarea, era parte del archivo original.

- [ ] **Step 5: Verificar que web-admin compila limpio**

Run: `cd apps/web-admin && npx tsc --noEmit`
Expected: sin errores (los de `pagos/actions.ts` se resuelven en la Tarea 10).

- [ ] **Step 6: Commit**

```bash
git add "apps/web-admin/app/(panel)/caja"
git commit -m "feat: reescribe la pantalla de Caja con flujo de turnos, egresos y arqueo"
```

---

### Task 10: Actualizar TODOS los consumidores de registrarPago para turno/sucursal/rol

**Nota de alcance (ruling post-Task 9):** el plan original solo cubría `pagos/actions.ts`. Durante la Tarea 9 se confirmó que `registrarPago` tiene 3 consumidores en el repo: `apps/web-admin/app/(panel)/pagos/actions.ts`, `apps/web-admin/app/(panel)/miembros/actions.ts` (alta de miembro con pago inicial), y `apps/web-admin/app/api/pagos/route.ts` (API REST externa). Los 3 deben actualizarse con el mismo patrón o el build fallará.

**Files:**
- Modify: `apps/web-admin/app/(panel)/pagos/actions.ts`
- Modify: `apps/web-admin/app/(panel)/miembros/actions.ts`
- Modify: `apps/web-admin/app/api/pagos/route.ts`
- Modify: `apps/web-admin/app/(panel)/pagos/FormularioPago.tsx` (sin cambios de contrato — ver Step 4)

**Interfaces:**
- Consumes: `registrarPago`, `MiembroNoEncontradoError`, `PlanNoEncontradoError`, `PlanInactivoError`, `RolNoAutorizadoError` de `@gym-app/domain/use-cases/RegistrarPago` (Tarea 6, firma nueva); `PrismaTurnoRepository` (Tarea 7).
- Produces: `registrarPagoAction` (pagos), `crearMiembroAction` (miembros), y el handler `POST` de `/api/pagos` — los 3 compatibles con la nueva firma de `registrarPago`.

- [ ] **Step 1: Modificar `apps/web-admin/app/(panel)/pagos/actions.ts`**

Agregar el import de `PrismaTurnoRepository` y `RolNoAutorizadoError`, y pasar los nuevos campos al invocar `registrarPago`:

```ts
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaPagoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPagoRepository";
import { PrismaSuscripcionRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSuscripcionRepository";
import { PrismaMemberRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMemberRepository";
import { PrismaPlanRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPlanRepository";
import { PrismaTurnoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaTurnoRepository";
import {
  registrarPago,
  MiembroNoEncontradoError,
  PlanNoEncontradoError,
  PlanInactivoError,
  RolNoAutorizadoError,
} from "@gym-app/domain/use-cases/RegistrarPago";
import { METODOS_BANCARIOS } from "../metodosPago";

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
  const origen = formData.get("origen")?.toString();
  const numeroOperacion = formData.get("numeroOperacion")?.toString().trim() || null;
  const sucursalId = usuario.sucursalId ?? formData.get("sucursalId")?.toString();

  if (!miembroId || !planId || !metodo || Number.isNaN(monto)) {
    return { error: "Miembro, plan, método y monto son requeridos." };
  }
  if (!sucursalId) {
    return { error: "Debés seleccionar una sucursal para registrar el pago." };
  }

  if (METODOS_BANCARIOS.includes(metodo) && !numeroOperacion) {
    return { error: "El número de operación es requerido para pagos por banco." };
  }

  try {
    await registrarPago(
      {
        pagos: new PrismaPagoRepository(prisma),
        suscripciones: new PrismaSuscripcionRepository(prisma),
        miembros: new PrismaMemberRepository(prisma),
        planes: new PrismaPlanRepository(prisma),
        turnos: new PrismaTurnoRepository(prisma),
      },
      {
        organizacionId: usuario.organizacionId,
        miembroId,
        planId,
        monto,
        metodo,
        numeroOperacion,
        tasaCambio: tasaCambioRaw ? Number(tasaCambioRaw) : null,
        sucursalId,
        registradoPorId: usuario.id,
        rolUsuario: usuario.rol,
      }
    );
  } catch (error) {
    if (
      error instanceof MiembroNoEncontradoError ||
      error instanceof PlanNoEncontradoError ||
      error instanceof PlanInactivoError ||
      error instanceof RolNoAutorizadoError
    ) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/pagos");
  revalidatePath(`/miembros/${miembroId}`);
  revalidatePath(`/miembros/${miembroId}/pagos`);

  if (origen !== "miembro") {
    redirect(`/miembros/${miembroId}`);
  }

  return {};
}
```

- [ ] **Step 2: Modificar `apps/web-admin/app/(panel)/miembros/actions.ts`**

En `crearMiembroAction`, agregar el import de `PrismaTurnoRepository` y `RolNoAutorizadoError` (aliasado, ya que el archivo ya importa `MiembroNoEncontradoError` de `ActualizarMiembro` y de `RegistrarPago` con alias `PagoMiembroNoEncontradoError`), y pasar los nuevos campos:

```ts
import { PrismaTurnoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaTurnoRepository";
import {
  registrarPago,
  MiembroNoEncontradoError as PagoMiembroNoEncontradoError,
  PlanNoEncontradoError,
  PlanInactivoError,
  RolNoAutorizadoError as PagoRolNoAutorizadoError,
} from "@gym-app/domain/use-cases/RegistrarPago";
```

En la llamada a `registrarPago` dentro de `crearMiembroAction` (agregar `sucursalId`, `registradoPorId`, `rolUsuario`; `sucursalId` requiere el mismo fallback que en `pagos/actions.ts` — si `usuario.sucursalId` es null, devolver el error de "Debés seleccionar una sucursal" antes de intentar el pago inicial, ya que crear el miembro sin sucursal fija y sin selector en este formulario no tiene forma de resolverse en esta tarea):

```ts
  if (!usuario.sucursalId) {
    return { error: "El miembro se creó, pero no se pudo registrar el pago inicial: debés tener una sucursal asignada." };
  }

  try {
    const planId = await obtenerOCrearPlan(usuario.organizacionId, planNombre, precioPlan);

    await registrarPago(
      {
        pagos: new PrismaPagoRepository(prisma),
        suscripciones: new PrismaSuscripcionRepository(prisma),
        miembros: new PrismaMemberRepository(prisma),
        planes: new PrismaPlanRepository(prisma),
        turnos: new PrismaTurnoRepository(prisma),
      },
      {
        organizacionId: usuario.organizacionId,
        miembroId: miembro.id,
        planId,
        monto: precioPlan,
        metodo,
        numeroOperacion,
        tasaCambio: tasaCambioRaw ? Number(tasaCambioRaw) : null,
        sucursalId: usuario.sucursalId,
        registradoPorId: usuario.id,
        rolUsuario: usuario.rol,
      }
    );
  } catch (error) {
    if (
      error instanceof PagoMiembroNoEncontradoError ||
      error instanceof PlanNoEncontradoError ||
      error instanceof PlanInactivoError ||
      error instanceof PagoRolNoAutorizadoError
    ) {
      return { error: `El miembro se creó, pero no se pudo registrar el pago inicial: ${error.message}` };
    }
    throw error;
  }
```

Nota: el chequeo `if (!usuario.sucursalId)` va DESPUÉS de que el miembro ya fue creado (mismo bloque try/catch que ya envuelve el registro del pago, siguiendo el comentario existente en el archivo de que "el miembro ya quedó creado en este punto"), no antes — para no cambiar el comportamiento ya existente de "miembro creado sin pago si algo falla después".

- [ ] **Step 3: Modificar `apps/web-admin/app/api/pagos/route.ts`**

Agregar el import de `PrismaTurnoRepository`, actualizar el alias de `RolNoAutorizadoError`, y pasar los nuevos campos. Este archivo usa `obtenerUsuarioDeSesion(req)` (patrón NextRequest, no `obtenerUsuarioDeSesionActual()`), pero la fuente de `organizacionId`/`sucursalId`/`rol` sigue siendo siempre el `usuario` de sesión, nunca el body:

```ts
import { PrismaTurnoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaTurnoRepository";
import {
  registrarPago,
  MiembroNoEncontradoError as RegistrarPagoMiembroNoEncontradoError,
  PlanNoEncontradoError as RegistrarPagoPlanNoEncontradoError,
  PlanInactivoError,
  RolNoAutorizadoError,
} from "@gym-app/domain/use-cases/RegistrarPago";
```

Dentro de `POST`, después de validar el body y antes de llamar `registrarPago`:

```ts
    if (!usuario.sucursalId) {
      return NextResponse.json(
        { error: "El usuario no tiene una sucursal asignada para registrar pagos." },
        { status: 400 }
      );
    }

    const pago = await registrarPago(
      {
        pagos: new PrismaPagoRepository(prisma),
        suscripciones: new PrismaSuscripcionRepository(prisma),
        miembros: new PrismaMemberRepository(prisma),
        planes: new PrismaPlanRepository(prisma),
        turnos: new PrismaTurnoRepository(prisma),
      },
      {
        organizacionId: usuario.organizacionId,
        miembroId: body.miembroId,
        planId: body.planId,
        monto: body.monto,
        metodo: body.metodo,
        numeroOperacion: body.numeroOperacion ?? null,
        tasaCambio: body.tasaCambio ?? null,
        sucursalId: usuario.sucursalId,
        registradoPorId: usuario.id,
        rolUsuario: usuario.rol,
      }
    );
```

Y en el catch, agregar el manejo de `RolNoAutorizadoError`:

```ts
  } catch (error) {
    if (error instanceof RegistrarPagoMiembroNoEncontradoError || error instanceof RegistrarPagoPlanNoEncontradoError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
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
```

- [ ] **Step 4: Verificar `apps/web-admin/app/(panel)/pagos/FormularioPago.tsx` — sin cambios de contrato necesarios**

`FormularioPago.tsx` no requiere modificación: `sucursalId` se resuelve server-side en la action (de `usuario.sucursalId`), no es un campo que el formulario deba enviar salvo el caso DUEÑO-sin-sucursal-fija, que queda fuera del alcance de esta tarea (mismo patrón ya aceptado para `abrirTurnoAction` en la Tarea 8 — un DUEÑO multi-sede sin sucursal fija recibirá el mensaje de error "Debés seleccionar una sucursal" hasta que una tarea futura agregue el selector; no bloquea el flujo normal de RECEPCION/GERENTE con sucursal fija). No se requiere ningún Step de edición en este archivo — se deja como referencia explícita de que fue revisado y no necesita cambios.

- [ ] **Step 5: Verificar que web-admin compila limpio end-to-end**

Run: `cd apps/web-admin && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add "apps/web-admin/app/(panel)/pagos/actions.ts"
git commit -m "feat: registrarPagoAction deriva sucursal/turno/rol del usuario de sesión"
```

---

### Task 11: Build completo y verificación manual

**Files:**
- No se crean ni modifican archivos — tarea de verificación.

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: confirmación de que el monorepo compila y arranca.

- [ ] **Step 1: Build completo del monorepo**

Run: `cd /c/dev/gym-app && npx turbo run build --filter=web-admin`
Expected: build exitoso, sin errores de tipo ni de build. Rutas esperadas: `/`, `/login`, `/miembros`, `/miembros/[id]`, `/miembros/nuevo`, `/pagos`, `/pagos/nuevo`, `/planes`, `/planes/[id]`, `/planes/nuevo`, `/caja`.

- [ ] **Step 2: Arrancar en modo desarrollo y probar manualmente el flujo completo**

Run: `cd apps/web-admin && npm run dev`

Probar en el navegador (con un usuario RECEPCION o GERENTE con `sucursalId` fijo):
1. Ir a `/caja` sin turno abierto → debe mostrar "Abrir turno".
2. Abrir turno con fondo inicial USD/Bs → debe pasar a "Turno activo".
3. Ir a `/pagos/nuevo` y registrar un pago → debe asociarse al turno (verificar en "Turno activo" que aparece en el resumen).
4. Registrar un egreso desde `/caja` → debe reflejarse en el resumen y restar del esperado en efectivo.
5. Intentar abrir un segundo turno en la misma sucursal → debe fallar con el mensaje de "ya hay un turno abierto".
6. Cerrar el turno: si el monto contado coincide exactamente con el esperado en todos los métodos, debe cerrar sin pedir nota; si se ingresa un monto distinto en algún método, debe exigir la nota antes de permitir el cierre.
7. Volver a `/caja` → debe mostrar la pantalla de "Abrir turno" de nuevo (turno anterior ya cerrado) y el turno recién cerrado debe aparecer en el reporte histórico con su arqueo.
8. Con un usuario DUEÑO o GERENTE, intentar anular un pago (una vez se exponga el botón de anulación en la UI — si no quedó expuesto en esta pantalla mínima, verificar al menos que `anularPagoAction` funciona invocándola manualmente o que quede documentado como pendiente de UI en el hallazgo de la Tarea 11).
9. Confirmar que un usuario ENTRENADOR no puede abrir turno ni registrar pagos (debe recibir el mensaje de rol no autorizado).

Expected: cada paso se comporta como se describe, sin errores no controlados (pantallas rotas, 500) en ningún punto.

- [ ] **Step 3: Documentar hallazgos de la verificación manual**

Si algún paso del Step 2 no se comporta como se espera, o si la UI de anulación de pagos quedó fuera del alcance de las pantallas mínimas construidas en la Tarea 9 (es un caso de uso completo — `anularPagoAction` — sin un botón visible en el reporte histórico), anotarlo en `docs/ROADMAP.md` bajo una nueva sección "Plan 11 — Turnos de Caja" como pendiente explícito, no como bug bloqueante.

- [ ] **Step 4: Actualizar `docs/ROADMAP.md` y `handoff.md`**

Agregar una sección resumiendo el Plan 11 (Turnos, Arqueo y Egresos) como completo, listando lo entregado y cualquier pendiente detectado en el Step 3 (ej. UI de anulación de pagos, selector de sucursal para DUEÑO multi-sede).

- [ ] **Step 5: Commit**

```bash
git add docs/ROADMAP.md handoff.md
git commit -m "docs: registra el Plan 11 (Turnos, Arqueo y Egresos de Caja) como completo"
```

## Verification

1. `cd packages/domain && npx tsc --noEmit` — sin errores (Tareas 3-6).
2. `cd packages/infrastructure && npx tsc --noEmit` — sin errores (Tarea 7).
3. `cd apps/web-admin && npx tsc --noEmit` — sin errores (Tareas 8-10).
4. `cd /c/dev/gym-app && npx turbo run build --filter=web-admin` — build exitoso (Tarea 11).
5. Prueba manual end-to-end del flujo de turno descrita en la Tarea 11, Step 2.
