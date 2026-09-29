# Productos fiados Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir fiar un producto a un miembro (deuda pendiente) desde "Vender producto" y cobrar todo lo que debe desde un botón "Cobrar deudas" en Caja.

**Architecture:** Tabla propia `DeudaProducto` (no se toca `Pago` hasta cobrar). Tres use-cases puros en `packages/domain` (`FiarProducto`, `CobrarDeudasMiembro`, `AnularDeuda`) más un listado agrupado; un repositorio Prisma; tres Server Actions en `caja/actions.ts`; dos piezas de UI (interruptor "Fiar" en `ModalVenderProducto` y un modal nuevo "Cobrar deudas"). El cobro corre en `prisma.$transaction` y crea filas `Pago` normales con `miembroId`.

**Tech Stack:** Next.js (App Router, Server Actions), Prisma 7 (`@prisma/adapter-pg`), Vitest 5, TypeScript.

**Spec:** `docs/superpowers/specs/2026-09-29-productos-fiados-design.md`

## Global Constraints

- Commits: una sola línea, en español, sin descripción, sin `Co-Authored-By` ni firmas (CLAUDE.md del proyecto).
- Los tests van junto al código como `*.test.ts`; se corren con `npm test --workspace packages/domain`.
- Fakes en memoria en los tests, no mocks de librería (patrón de `packages/domain/use-cases/VenderProducto.test.ts`).
- Errores de dominio: clases `extends Error` con mensaje en español.
- Reutilizar, no duplicar: `validarLineasDePago` (`entities/Pago.ts`), `validarTasaSiEsEnBs` (`apps/web-admin/lib/tasaBcv.ts`), `SelectorMetodoPago`, `BuscadorMiembro`, `SinTurnoAbiertoError` (`use-cases/VenderProducto.ts`).
- Totales siempre calculados en el servidor, redondeados a 2 decimales.
- **No aplicar la migración contra la base remota desde el agente** (política del entorno). La aplica el usuario o el arranque del contenedor. Antes, revisar `pg_stat_activity` por sesiones `idle in transaction`; nunca correr `prisma migrate deploy` en background con timeout (ver `handoff.md`, sección 4).
- `apps/web-admin/AGENTS.md` avisa que este Next.js tiene cambios incompatibles: los patrones nuevos se copian de código existente (`cambiarPlanAction`, `BotonRegistrarEgreso`), no de memoria.

## Review Focus

- Dos cajeros cobran al mismo miembro a la vez: el segundo recibe `DeudasYaCobradasError` y no se crea ningún pago (Task 3).
- Un miembro sin deudas pendientes abre "Cobrar": error claro, no un pago en $0 (Task 3).
- Aritmética de punto flotante: 3 × $0.10 debe dar exactamente $0.30 (Task 2 y Task 3).
- El precio del producto cambia o el producto se borra después de fiar: la deuda conserva precio y nombre copiados (Task 2 y Task 5, `onDelete: SetNull`).
- Cantidad que llega como texto no entero desde el FormData (`"1.5"`, `""`, `"abc"`): se rechaza con `CantidadInvalidaError` (Task 2).
- Cobrar sin turno abierto: falla antes de escribir nada (Task 3).

---

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `packages/db/prisma/schema.prisma` | enum `EstadoDeuda`, modelo `DeudaProducto`, relaciones inversas |
| `packages/db/prisma/migrations/20260929200000_agrega_deuda_producto/migration.sql` | SQL aditivo |
| `packages/domain/entities/DeudaProducto.ts` | tipos y helpers puros `totalDeudas`, `conceptoDeudas` |
| `packages/domain/ports/IDeudaProductoRepository.ts` | puerto |
| `packages/domain/use-cases/FiarProducto.ts` (+ test) | crear deuda |
| `packages/domain/use-cases/CobrarDeudasMiembro.ts` (+ test) | cobrar en bloque |
| `packages/domain/use-cases/AnularDeuda.ts` (+ test) | anular una deuda pendiente |
| `packages/domain/use-cases/ListarDeudasPendientes.ts` (+ test) | agrupar por miembro |
| `packages/infrastructure/persistence/prisma/PrismaDeudaProductoRepository.ts` | adaptador Prisma |
| `apps/web-admin/app/(panel)/caja/actions.ts` | `fiarProductoAction`, `cobrarDeudasAction`, `anularDeudaAction` |
| `apps/web-admin/app/(panel)/caja/ModalVenderProducto.tsx` | interruptor "Fiar a un miembro" |
| `apps/web-admin/app/(panel)/caja/BotonVenderProducto.tsx` | pasa props nuevas |
| `apps/web-admin/app/(panel)/caja/ModalCobrarDeudas.tsx`, `BotonCobrarDeudas.tsx` | UI de cobro |
| `apps/web-admin/app/(panel)/caja/page.tsx` | carga deudas y cablea los botones |

---

### Task 1: Esquema y migración

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/20260929200000_agrega_deuda_producto/migration.sql`

**Interfaces:**
- Produces: modelo Prisma `DeudaProducto` (cliente: `prisma.deudaProducto`) y enum `EstadoDeuda` (`"PENDIENTE" | "COBRADA" | "ANULADA"`), usados por Task 5.

- [ ] **Step 1: Agregar relaciones inversas en el schema**

En `packages/db/prisma/schema.prisma`, dentro de `model Organizacion` agregar la línea `deudasProducto        DeudaProducto[]` junto a `productos            Producto[]`. En `model Producto` agregar `deudas DeudaProducto[]` debajo de `pagos Pago[]`. En `model Miembro`, `model Sucursal` y `model UsuarioAdmin` agregar (al final de sus relaciones):

```prisma
  // model Miembro:
  deudasProducto DeudaProducto[]
  // model Sucursal:
  deudasProducto DeudaProducto[]
  // model UsuarioAdmin:
  deudasRegistradas DeudaProducto[] @relation("DeudasRegistradas")
  deudasCobradas    DeudaProducto[] @relation("DeudasCobradas")
  deudasAnuladas    DeudaProducto[] @relation("DeudasAnuladas")
```

- [ ] **Step 2: Agregar enum y modelo**

Agregar justo antes de `enum ModoCambioPlanAuditoria {`:

```prisma
enum EstadoDeuda {
  PENDIENTE
  COBRADA
  ANULADA
}

// Producto fiado a un miembro: se entrega ya, se cobra después en bloque
// (ver CobrarDeudasMiembro). No es un Pago hasta que se cobra: así el
// turno, el arqueo y el histórico no la ven mientras está pendiente.
model DeudaProducto {
  id                String       @id @default(cuid())
  organizacionId    String
  organizacion      Organizacion @relation(fields: [organizacionId], references: [id])
  sucursalId        String
  sucursal          Sucursal     @relation(fields: [sucursalId], references: [id])
  miembroId         String
  miembro           Miembro      @relation(fields: [miembroId], references: [id])
  productoId        String?
  producto          Producto?    @relation(fields: [productoId], references: [id], onDelete: SetNull)
  productoNombre    String // copia del nombre al fiar
  cantidad          Int
  precioUnitarioUSD Decimal      @db.Decimal(10, 2) // congelado al fiar; los Bs se calculan al cobrar
  estado            EstadoDeuda  @default(PENDIENTE)

  registradaPorId String
  registradaPor   UsuarioAdmin  @relation("DeudasRegistradas", fields: [registradaPorId], references: [id])
  creadaEn        DateTime      @default(now())
  cobradaEn       DateTime?
  cobradaPorId    String?
  cobradaPor      UsuarioAdmin? @relation("DeudasCobradas", fields: [cobradaPorId], references: [id])
  grupoPagoId     String? // grupo de Pagos que la cubrió
  anuladaEn       DateTime?
  anuladaPorId    String?
  anuladaPor      UsuarioAdmin? @relation("DeudasAnuladas", fields: [anuladaPorId], references: [id])

  @@index([organizacionId, estado])
  @@index([miembroId, estado])
}
```

- [ ] **Step 3: Escribir la migración a mano (aditiva)**

Crear `packages/db/prisma/migrations/20260929200000_agrega_deuda_producto/migration.sql`:

```sql
-- CreateEnum
CREATE TYPE "EstadoDeuda" AS ENUM ('PENDIENTE', 'COBRADA', 'ANULADA');

-- CreateTable
CREATE TABLE "DeudaProducto" (
    "id" TEXT NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "miembroId" TEXT NOT NULL,
    "productoId" TEXT,
    "productoNombre" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precioUnitarioUSD" DECIMAL(10,2) NOT NULL,
    "estado" "EstadoDeuda" NOT NULL DEFAULT 'PENDIENTE',
    "registradaPorId" TEXT NOT NULL,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cobradaEn" TIMESTAMP(3),
    "cobradaPorId" TEXT,
    "grupoPagoId" TEXT,
    "anuladaEn" TIMESTAMP(3),
    "anuladaPorId" TEXT,

    CONSTRAINT "DeudaProducto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeudaProducto_organizacionId_estado_idx" ON "DeudaProducto"("organizacionId", "estado");

-- CreateIndex
CREATE INDEX "DeudaProducto_miembroId_estado_idx" ON "DeudaProducto"("miembroId", "estado");

-- AddForeignKey
ALTER TABLE "DeudaProducto" ADD CONSTRAINT "DeudaProducto_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeudaProducto" ADD CONSTRAINT "DeudaProducto_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeudaProducto" ADD CONSTRAINT "DeudaProducto_miembroId_fkey" FOREIGN KEY ("miembroId") REFERENCES "Miembro"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeudaProducto" ADD CONSTRAINT "DeudaProducto_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeudaProducto" ADD CONSTRAINT "DeudaProducto_registradaPorId_fkey" FOREIGN KEY ("registradaPorId") REFERENCES "UsuarioAdmin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeudaProducto" ADD CONSTRAINT "DeudaProducto_cobradaPorId_fkey" FOREIGN KEY ("cobradaPorId") REFERENCES "UsuarioAdmin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeudaProducto" ADD CONSTRAINT "DeudaProducto_anuladaPorId_fkey" FOREIGN KEY ("anuladaPorId") REFERENCES "UsuarioAdmin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 4: Validar el schema y regenerar el cliente (sin tocar la base)**

Run (desde `c:\dev\gym-app\packages\db`): `npx prisma validate --config prisma7.config.ts` y luego `npm run generate`
Expected: `The schema at prisma\schema.prisma is valid` y el cliente generado en `generated/prisma`. `validate` y `generate` no se conectan a la base. Si `validate` protesta por una relación inversa faltante, agregar la línea que indique Prisma (mensaje "missing an opposite relation field").

- [ ] **Step 5: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations/20260929200000_agrega_deuda_producto
git commit -m "feat(productos-fiados): agregar modelo y migración de deuda de producto"
```

---

### Task 2: Entidad, puerto y `FiarProducto`

**Files:**
- Create: `packages/domain/entities/DeudaProducto.ts`
- Create: `packages/domain/ports/IDeudaProductoRepository.ts`
- Create: `packages/domain/use-cases/FiarProducto.ts`
- Test: `packages/domain/use-cases/FiarProducto.test.ts`

**Interfaces:**
- Produces (Task 3, 4, 5, 6 dependen de estos nombres exactos):
  - `type EstadoDeuda = "PENDIENTE" | "COBRADA" | "ANULADA"`
  - `interface DeudaProducto { id; organizacionId; sucursalId; miembroId; miembroNombre?: string; productoId: string | null; productoNombre: string; cantidad: number; precioUnitarioUSD: number; estado: EstadoDeuda; registradaPorId: string; creadaEn: Date; cobradaEn: Date | null; grupoPagoId: string | null }`
  - `interface DatosNuevaDeuda { organizacionId; sucursalId; miembroId; productoId: string; productoNombre: string; cantidad: number; precioUnitarioUSD: number; registradaPorId: string }`
  - `totalDeudas(deudas: Pick<DeudaProducto, "precioUnitarioUSD" | "cantidad">[]): number`
  - `conceptoDeudas(deudas: Pick<DeudaProducto, "productoNombre" | "cantidad">[]): string`
  - `interface IDeudaProductoRepository { crear(datos: DatosNuevaDeuda): Promise<DeudaProducto>; listarPendientesPorOrganizacion(organizacionId: string): Promise<DeudaProducto[]>; listarPendientesPorMiembro(organizacionId: string, miembroId: string): Promise<DeudaProducto[]>; marcarCobradas(ids: string[], cobradaPorId: string, cobradaEn: Date, grupoPagoId: string): Promise<number>; anular(organizacionId: string, id: string, anuladaPorId: string, anuladaEn: Date): Promise<number> }`
  - `fiarProducto(deps: FiarProductoDeps, input: DatosFiarProducto): Promise<DeudaProducto>`; errores `RolNoAutorizadoError`, `MiembroNoEncontradoError`.

- [ ] **Step 1: Escribir el test que falla**

Crear `packages/domain/use-cases/FiarProducto.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { fiarProducto, type FiarProductoDeps } from "./FiarProducto";
import { totalDeudas, conceptoDeudas, type DatosNuevaDeuda, type DeudaProducto } from "../entities/DeudaProducto";
import type { Producto } from "../entities/Producto";

function crearDeps(
  opciones: {
    permitido?: boolean;
    producto?: Partial<Producto> | null;
    miembro?: { sucursalId: string | null } | null;
  } = {}
) {
  const { permitido = true } = opciones;
  const producto: Producto | null =
    opciones.producto === null
      ? null
      : { id: "p1", organizacionId: "org", nombre: "Agua", descripcion: null, costoUSD: 1.5, fotoUrl: null, activo: true, ...opciones.producto };
  const miembro = opciones.miembro === null ? null : { id: "m1", sucursalId: "suc", ...opciones.miembro };
  const creadas: DatosNuevaDeuda[] = [];

  const deps = {
    deudas: {
      crear: async (datos: DatosNuevaDeuda) => {
        creadas.push(datos);
        return { id: "d1", estado: "PENDIENTE", ...datos } as unknown as DeudaProducto;
      },
    },
    productos: { buscarPorId: async () => producto },
    miembros: { buscarPorId: async () => miembro },
    sucursales: { buscarPorId: async () => ({ nombre: "Sede Norte" }) },
    autorizacion: { tienePermiso: async () => permitido },
  } as unknown as FiarProductoDeps;

  return { deps, creadas };
}

const base = { organizacionId: "org", miembroId: "m1", productoId: "p1", sucursalId: "suc", registradaPorId: "u1" };

describe("fiarProducto", () => {
  test("crea la deuda con nombre y precio copiados del producto", async () => {
    const { deps, creadas } = crearDeps();
    await fiarProducto(deps, { ...base, cantidad: 2 });

    expect(creadas).toEqual([
      {
        organizacionId: "org",
        sucursalId: "suc",
        miembroId: "m1",
        productoId: "p1",
        productoNombre: "Agua",
        cantidad: 2,
        precioUnitarioUSD: 1.5,
        registradaPorId: "u1",
      },
    ]);
  });

  test("rechaza sin permiso de caja", async () => {
    const { deps } = crearDeps({ permitido: false });
    await expect(fiarProducto(deps, { ...base, cantidad: 1 })).rejects.toThrow(/permiso/);
  });

  test("rechaza producto inactivo o inexistente", async () => {
    await expect(fiarProducto(crearDeps({ producto: { activo: false } }).deps, { ...base, cantidad: 1 })).rejects.toThrow(/inactivo/);
    await expect(fiarProducto(crearDeps({ producto: null }).deps, { ...base, cantidad: 1 })).rejects.toThrow(/producto/);
  });

  test.each([0, -1, 1.5, Number.NaN])("rechaza la cantidad inválida %s", async (cantidad) => {
    const { deps } = crearDeps();
    await expect(fiarProducto(deps, { ...base, cantidad })).rejects.toThrow(/cantidad/);
  });

  test("rechaza un miembro inexistente", async () => {
    const { deps } = crearDeps({ miembro: null });
    await expect(fiarProducto(deps, { ...base, cantidad: 1 })).rejects.toThrow(/miembro/);
  });

  test("rechaza un miembro de otra sucursal y acepta uno multisede (sucursalId null)", async () => {
    await expect(fiarProducto(crearDeps({ miembro: { sucursalId: "otra" } }).deps, { ...base, cantidad: 1 })).rejects.toThrow(/Sede Norte/);
    const { deps, creadas } = crearDeps({ miembro: { sucursalId: null } });
    await fiarProducto(deps, { ...base, cantidad: 1 });
    expect(creadas).toHaveLength(1);
  });
});

describe("helpers de DeudaProducto", () => {
  test("totalDeudas redondea a 2 decimales (3 × 0.10 = 0.30 exacto)", () => {
    expect(totalDeudas([{ precioUnitarioUSD: 0.1, cantidad: 3 }])).toBe(0.3);
    expect(totalDeudas([{ precioUnitarioUSD: 1.5, cantidad: 2 }, { precioUnitarioUSD: 2.25, cantidad: 1 }])).toBe(5.25);
    expect(totalDeudas([])).toBe(0);
  });

  test("conceptoDeudas lista nombres y agrega × solo si cantidad > 1", () => {
    expect(conceptoDeudas([{ productoNombre: "Agua", cantidad: 2 }, { productoNombre: "Gatorade", cantidad: 1 }])).toBe("Agua × 2, Gatorade");
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm test --workspace packages/domain`
Expected: FAIL — `Cannot find module './FiarProducto'` / `../entities/DeudaProducto`.

- [ ] **Step 3: Implementar entidad y puerto**

Crear `packages/domain/entities/DeudaProducto.ts`:

```ts
export type EstadoDeuda = "PENDIENTE" | "COBRADA" | "ANULADA";

export interface DeudaProducto {
  id: string;
  organizacionId: string;
  sucursalId: string;
  miembroId: string;
  // Solo lo resuelven los listados que hacen join con Miembro.
  miembroNombre?: string;
  productoId: string | null;
  productoNombre: string;
  cantidad: number;
  precioUnitarioUSD: number;
  estado: EstadoDeuda;
  registradaPorId: string;
  creadaEn: Date;
  cobradaEn: Date | null;
  grupoPagoId: string | null;
}

export interface DatosNuevaDeuda {
  organizacionId: string;
  sucursalId: string;
  miembroId: string;
  productoId: string;
  productoNombre: string;
  cantidad: number;
  precioUnitarioUSD: number;
  registradaPorId: string;
}

// Única fuente de verdad del total de un conjunto de deudas (la usan el
// servidor al cobrar y la UI para mostrarlo).
export function totalDeudas(deudas: Pick<DeudaProducto, "precioUnitarioUSD" | "cantidad">[]): number {
  const total = deudas.reduce((suma, d) => suma + Math.round(d.precioUnitarioUSD * d.cantidad * 100), 0);
  return total / 100;
}

// Texto que queda como concepto del Pago al cobrar: "Agua × 2, Gatorade".
export function conceptoDeudas(deudas: Pick<DeudaProducto, "productoNombre" | "cantidad">[]): string {
  return deudas.map((d) => (d.cantidad > 1 ? `${d.productoNombre} × ${d.cantidad}` : d.productoNombre)).join(", ");
}
```

Crear `packages/domain/ports/IDeudaProductoRepository.ts`:

```ts
import { DeudaProducto, DatosNuevaDeuda } from "../entities/DeudaProducto";

export interface IDeudaProductoRepository {
  crear(datos: DatosNuevaDeuda): Promise<DeudaProducto>;
  // Con miembroNombre resuelto, más antiguas primero.
  listarPendientesPorOrganizacion(organizacionId: string): Promise<DeudaProducto[]>;
  listarPendientesPorMiembro(organizacionId: string, miembroId: string): Promise<DeudaProducto[]>;
  // Solo afecta filas que siguen PENDIENTE; devuelve cuántas actualizó
  // (menos que ids.length = otra caja cobró a la vez).
  marcarCobradas(ids: string[], cobradaPorId: string, cobradaEn: Date, grupoPagoId: string): Promise<number>;
  // Solo si sigue PENDIENTE; devuelve 0 o 1.
  anular(organizacionId: string, id: string, anuladaPorId: string, anuladaEn: Date): Promise<number>;
}
```

- [ ] **Step 4: Implementar `FiarProducto`**

Crear `packages/domain/use-cases/FiarProducto.ts`:

```ts
import { IDeudaProductoRepository } from "../ports/IDeudaProductoRepository";
import { IProductoRepository } from "../ports/IProductoRepository";
import { IMemberRepository } from "../ports/IMemberRepository";
import { ISucursalRepository } from "../ports/ISucursalRepository";
import { IAuthorizationService } from "../ports/IAuthorizationService";
import { DeudaProducto } from "../entities/DeudaProducto";
import { MiembroFueraDeSucursalError } from "./ObtenerMiembro";
import { ProductoNoEncontradoError, ProductoInactivoError, CantidadInvalidaError } from "./VenderProducto";

export { MiembroFueraDeSucursalError, ProductoNoEncontradoError, ProductoInactivoError, CantidadInvalidaError };

export class RolNoAutorizadoError extends Error {
  constructor() {
    super("Tu rol no tiene permiso para fiar productos.");
  }
}

export class MiembroNoEncontradoError extends Error {
  constructor() {
    super("No se encontró el miembro.");
  }
}

export interface FiarProductoDeps {
  deudas: IDeudaProductoRepository;
  productos: IProductoRepository;
  miembros: IMemberRepository;
  sucursales: ISucursalRepository;
  autorizacion: IAuthorizationService;
}

export interface DatosFiarProducto {
  organizacionId: string;
  miembroId: string;
  productoId: string;
  cantidad: number;
  sucursalId: string;
  registradaPorId: string;
}

export async function fiarProducto(deps: FiarProductoDeps, input: DatosFiarProducto): Promise<DeudaProducto> {
  if (!(await deps.autorizacion.tienePermiso(input.registradaPorId, "CAJA", "CREAR"))) {
    throw new RolNoAutorizadoError();
  }

  if (!Number.isInteger(input.cantidad) || input.cantidad < 1) {
    throw new CantidadInvalidaError();
  }

  const miembro = await deps.miembros.buscarPorId(input.organizacionId, input.miembroId);
  if (!miembro) {
    throw new MiembroNoEncontradoError();
  }
  if (miembro.sucursalId !== null && miembro.sucursalId !== input.sucursalId) {
    const sucursal = await deps.sucursales.buscarPorId(input.organizacionId, miembro.sucursalId);
    throw new MiembroFueraDeSucursalError(sucursal?.nombre ?? "otra sucursal");
  }

  const producto = await deps.productos.buscarPorId(input.organizacionId, input.productoId);
  if (!producto) {
    throw new ProductoNoEncontradoError();
  }
  if (!producto.activo) {
    throw new ProductoInactivoError();
  }

  return deps.deudas.crear({
    organizacionId: input.organizacionId,
    sucursalId: input.sucursalId,
    miembroId: input.miembroId,
    productoId: producto.id,
    productoNombre: producto.nombre,
    cantidad: input.cantidad,
    precioUnitarioUSD: producto.costoUSD,
    registradaPorId: input.registradaPorId,
  });
}
```

- [ ] **Step 5: Correr los tests y verificar que pasan**

Run: `npm test --workspace packages/domain`
Expected: PASS (todos, incluidos los anteriores).

- [ ] **Step 6: Commit**

```bash
git add packages/domain/entities/DeudaProducto.ts packages/domain/ports/IDeudaProductoRepository.ts packages/domain/use-cases/FiarProducto.ts packages/domain/use-cases/FiarProducto.test.ts
git commit -m "feat(productos-fiados): agregar entidad, puerto y caso de uso para fiar productos"
```

---

### Task 3: `CobrarDeudasMiembro`

**Files:**
- Create: `packages/domain/use-cases/CobrarDeudasMiembro.ts`
- Test: `packages/domain/use-cases/CobrarDeudasMiembro.test.ts`

**Interfaces:**
- Consumes: `IDeudaProductoRepository`, `totalDeudas`, `conceptoDeudas` (Task 2); `validarLineasDePago`, `DatosLineaPago`, `Pago` de `../entities/Pago`; `IPagoRepository.crear`; `ITurnoRepository.buscarAbiertoPorSucursal`; `SinTurnoAbiertoError` de `./VenderProducto`.
- Produces: `cobrarDeudasMiembro(deps: CobrarDeudasMiembroDeps, input: DatosCobrarDeudas): Promise<Pago[]>`, errores `RolNoAutorizadoError`, `SinDeudasPendientesError`, `DeudasYaCobradasError`; reexporta `SinTurnoAbiertoError`, `LineasDePagoInvalidasError`, `MontoLineasNoCubreObjetivoError`.

- [ ] **Step 1: Escribir el test que falla**

Crear `packages/domain/use-cases/CobrarDeudasMiembro.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { cobrarDeudasMiembro, type CobrarDeudasMiembroDeps } from "./CobrarDeudasMiembro";
import type { DeudaProducto } from "../entities/DeudaProducto";
import type { DatosNuevoPago, Pago } from "../entities/Pago";

const deuda = (id: string, productoNombre: string, cantidad: number, precioUnitarioUSD: number): DeudaProducto => ({
  id,
  organizacionId: "org",
  sucursalId: "suc",
  miembroId: "m1",
  productoId: "p-" + id,
  productoNombre,
  cantidad,
  precioUnitarioUSD,
  estado: "PENDIENTE",
  registradaPorId: "u0",
  creadaEn: new Date("2026-09-01"),
  cobradaEn: null,
  grupoPagoId: null,
});

function crearDeps(
  opciones: { permitido?: boolean; turnoAbierto?: boolean; deudas?: DeudaProducto[]; cobradasPorLaBase?: number } = {}
) {
  const { permitido = true, turnoAbierto = true } = opciones;
  const deudas = opciones.deudas ?? [deuda("d1", "Agua", 2, 1.5), deuda("d2", "Gatorade", 1, 2.25)];
  const pagosCreados: DatosNuevoPago[] = [];
  const marcadas: { ids: string[]; grupoPagoId: string }[] = [];

  const deps = {
    deudas: {
      listarPendientesPorMiembro: async () => deudas,
      marcarCobradas: async (ids: string[], _por: string, _en: Date, grupoPagoId: string) => {
        marcadas.push({ ids, grupoPagoId });
        return opciones.cobradasPorLaBase ?? ids.length;
      },
    },
    pagos: {
      crear: async (datos: DatosNuevoPago) => {
        pagosCreados.push(datos);
        return { id: `pago-${pagosCreados.length}`, ...datos } as unknown as Pago;
      },
    },
    turnos: { buscarAbiertoPorSucursal: async () => (turnoAbierto ? { id: "turno1" } : null) },
    autorizacion: { tienePermiso: async () => permitido },
  } as unknown as CobrarDeudasMiembroDeps;

  return { deps, pagosCreados, marcadas };
}

const base = { organizacionId: "org", miembroId: "m1", sucursalId: "suc", registradoPorId: "u1" };
const linea = (monto: number, tasaCambio: number | null = null) => ({
  monto,
  metodo: "Efectivo (USD)",
  metodoPagoId: "mp1",
  numeroOperacion: null,
  tasaCambio,
});

describe("cobrarDeudasMiembro", () => {
  test("cobra el total: pagos a nombre del miembro con el concepto y deudas marcadas", async () => {
    const { deps, pagosCreados, marcadas } = crearDeps();
    await cobrarDeudasMiembro(deps, { ...base, lineas: [linea(5.25)] });

    expect(pagosCreados).toHaveLength(1);
    expect(pagosCreados[0]).toMatchObject({
      miembroId: "m1",
      turnoId: "turno1",
      monto: 5.25,
      productoId: null,
      productoNombre: "Agua × 2, Gatorade",
      cantidad: null,
      fechaInicioCiclo: null,
      fechaFinCiclo: null,
    });
    expect(marcadas).toHaveLength(1);
    expect(marcadas[0].ids).toEqual(["d1", "d2"]);
    expect(pagosCreados[0].grupoPagoId).toBe(marcadas[0].grupoPagoId);
  });

  test("pago combinado: mismo grupoPagoId en todas las líneas y montoBs por línea", async () => {
    const { deps, pagosCreados } = crearDeps();
    await cobrarDeudasMiembro(deps, { ...base, lineas: [linea(1.25), linea(4, 50)] });

    expect(pagosCreados).toHaveLength(2);
    expect(pagosCreados[0].grupoPagoId).toBe(pagosCreados[1].grupoPagoId);
    expect(pagosCreados[1].montoBs).toBe(200);
  });

  test("rechaza si la suma de las líneas no es el total que el servidor calcula", async () => {
    const { deps, pagosCreados } = crearDeps();
    await expect(cobrarDeudasMiembro(deps, { ...base, lineas: [linea(5)] })).rejects.toThrow(/no coincide/);
    expect(pagosCreados).toHaveLength(0);
  });

  test("total con decimales flotantes: 3 × 0.10 se cobra como 0.30", async () => {
    const { deps } = crearDeps({ deudas: [deuda("d1", "Chicle", 3, 0.1)] });
    await expect(cobrarDeudasMiembro(deps, { ...base, lineas: [linea(0.3)] })).resolves.toHaveLength(1);
  });

  test("rechaza sin deudas pendientes", async () => {
    const { deps } = crearDeps({ deudas: [] });
    await expect(cobrarDeudasMiembro(deps, { ...base, lineas: [linea(1)] })).rejects.toThrow(/pendientes/);
  });

  test("rechaza sin turno abierto y sin escribir nada", async () => {
    const { deps, pagosCreados, marcadas } = crearDeps({ turnoAbierto: false });
    await expect(cobrarDeudasMiembro(deps, { ...base, lineas: [linea(5.25)] })).rejects.toThrow(/turno/);
    expect(pagosCreados).toHaveLength(0);
    expect(marcadas).toHaveLength(0);
  });

  test("rechaza sin permiso de caja", async () => {
    const { deps } = crearDeps({ permitido: false });
    await expect(cobrarDeudasMiembro(deps, { ...base, lineas: [linea(5.25)] })).rejects.toThrow(/permiso/);
  });

  test("si otra caja cobró a la vez (menos filas actualizadas), falla sin crear pagos", async () => {
    const { deps, pagosCreados } = crearDeps({ cobradasPorLaBase: 1 });
    await expect(cobrarDeudasMiembro(deps, { ...base, lineas: [linea(5.25)] })).rejects.toThrow(/ya fueron cobradas/);
    expect(pagosCreados).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm test --workspace packages/domain`
Expected: FAIL — `Cannot find module './CobrarDeudasMiembro'`.

- [ ] **Step 3: Implementar**

Crear `packages/domain/use-cases/CobrarDeudasMiembro.ts`:

```ts
import { randomUUID } from "node:crypto";
import { IDeudaProductoRepository } from "../ports/IDeudaProductoRepository";
import { IPagoRepository } from "../ports/IPagoRepository";
import { ITurnoRepository } from "../ports/ITurnoRepository";
import { IAuthorizationService } from "../ports/IAuthorizationService";
import { conceptoDeudas, totalDeudas } from "../entities/DeudaProducto";
import { Pago, DatosLineaPago, validarLineasDePago, LineasDePagoInvalidasError, MontoLineasNoCubreObjetivoError } from "../entities/Pago";
import { SinTurnoAbiertoError } from "./VenderProducto";

export { SinTurnoAbiertoError, LineasDePagoInvalidasError, MontoLineasNoCubreObjetivoError };

export class RolNoAutorizadoError extends Error {
  constructor() {
    super("Tu rol no tiene permiso para cobrar deudas.");
  }
}

export class SinDeudasPendientesError extends Error {
  constructor() {
    super("Este miembro no tiene productos pendientes de cobro.");
  }
}

export class DeudasYaCobradasError extends Error {
  constructor() {
    super("Estas deudas ya fueron cobradas o anuladas desde otra caja. Actualiza la lista.");
  }
}

export interface CobrarDeudasMiembroDeps {
  deudas: IDeudaProductoRepository;
  pagos: IPagoRepository;
  turnos: ITurnoRepository;
  autorizacion: IAuthorizationService;
}

export interface DatosCobrarDeudas {
  organizacionId: string;
  miembroId: string;
  lineas: DatosLineaPago[];
  sucursalId: string;
  registradoPorId: string;
}

// Debe correr dentro de una transacción (ver cobrarDeudasAction): si falla
// después de marcar las deudas, se revierte todo.
export async function cobrarDeudasMiembro(deps: CobrarDeudasMiembroDeps, input: DatosCobrarDeudas): Promise<Pago[]> {
  if (!(await deps.autorizacion.tienePermiso(input.registradoPorId, "CAJA", "CREAR"))) {
    throw new RolNoAutorizadoError();
  }

  const deudas = await deps.deudas.listarPendientesPorMiembro(input.organizacionId, input.miembroId);
  if (deudas.length === 0) {
    throw new SinDeudasPendientesError();
  }

  // El total lo calcula el servidor; el cliente solo manda cómo lo paga.
  validarLineasDePago(input.lineas, "exacto", totalDeudas(deudas));

  const turnoAbierto = await deps.turnos.buscarAbiertoPorSucursal(input.sucursalId);
  if (!turnoAbierto) {
    throw new SinTurnoAbiertoError();
  }

  const grupoPagoId = randomUUID();
  const cobradas = await deps.deudas.marcarCobradas(
    deudas.map((d) => d.id),
    input.registradoPorId,
    new Date(),
    grupoPagoId
  );
  if (cobradas !== deudas.length) {
    throw new DeudasYaCobradasError();
  }

  const concepto = conceptoDeudas(deudas);
  const pagosCreados: Pago[] = [];
  for (const linea of input.lineas) {
    pagosCreados.push(
      await deps.pagos.crear({
        miembroId: input.miembroId,
        sucursalId: input.sucursalId,
        turnoId: turnoAbierto.id,
        registradoPorId: input.registradoPorId,
        monto: linea.monto,
        metodo: linea.metodo,
        metodoPagoId: linea.metodoPagoId,
        numeroOperacion: linea.numeroOperacion,
        tasaCambio: linea.tasaCambio,
        montoBs: linea.tasaCambio !== null ? linea.monto * linea.tasaCambio : null,
        fechaInicioCiclo: null,
        fechaFinCiclo: null,
        grupoPagoId,
        productoId: null,
        productoNombre: concepto,
        cantidad: null,
      })
    );
  }

  return pagosCreados;
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npm test --workspace packages/domain`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/use-cases/CobrarDeudasMiembro.ts packages/domain/use-cases/CobrarDeudasMiembro.test.ts
git commit -m "feat(productos-fiados): agregar cobro en bloque de las deudas de un miembro"
```

---

### Task 4: `AnularDeuda` y `ListarDeudasPendientes`

**Files:**
- Create: `packages/domain/use-cases/AnularDeuda.ts`, `packages/domain/use-cases/ListarDeudasPendientes.ts`
- Test: `packages/domain/use-cases/AnularDeuda.test.ts`, `packages/domain/use-cases/ListarDeudasPendientes.test.ts`

**Interfaces:**
- Consumes: `IDeudaProductoRepository.anular`, `.listarPendientesPorOrganizacion`, `totalDeudas`, `DeudaProducto` (Task 2).
- Produces: `anularDeuda(deps: { deudas; autorizacion }, input: { organizacionId; id; anuladaPorId }): Promise<void>` con errores `RolNoAutorizadoError`, `DeudaNoPendienteError`; `listarDeudasPendientes(deps: { deudas }, organizacionId): Promise<GrupoDeudasMiembro[]>` y `interface GrupoDeudasMiembro { miembroId: string; miembroNombre: string; totalUSD: number; deudas: DeudaProducto[] }`.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `packages/domain/use-cases/AnularDeuda.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { anularDeuda } from "./AnularDeuda";

function crearDeps(opciones: { permitido?: boolean; filasAfectadas?: number } = {}) {
  const { permitido = true, filasAfectadas = 1 } = opciones;
  const llamadas: { modulo: string; accion: string }[] = [];
  const deps = {
    deudas: { anular: async () => filasAfectadas },
    autorizacion: {
      tienePermiso: async (_u: string, modulo: string, accion: string) => {
        llamadas.push({ modulo, accion });
        return permitido;
      },
    },
  };
  return { deps: deps as unknown as Parameters<typeof anularDeuda>[0], llamadas };
}

const input = { organizacionId: "org", id: "d1", anuladaPorId: "u1" };

describe("anularDeuda", () => {
  test("anula una deuda pendiente exigiendo PAGOS/ELIMINAR", async () => {
    const { deps, llamadas } = crearDeps();
    await expect(anularDeuda(deps, input)).resolves.toBeUndefined();
    expect(llamadas).toEqual([{ modulo: "PAGOS", accion: "ELIMINAR" }]);
  });

  test("rechaza sin permiso", async () => {
    await expect(anularDeuda(crearDeps({ permitido: false }).deps, input)).rejects.toThrow(/permiso/);
  });

  test("rechaza si ya no está pendiente (0 filas afectadas)", async () => {
    await expect(anularDeuda(crearDeps({ filasAfectadas: 0 }).deps, input)).rejects.toThrow(/pendiente/);
  });
});
```

Crear `packages/domain/use-cases/ListarDeudasPendientes.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { listarDeudasPendientes } from "./ListarDeudasPendientes";
import type { DeudaProducto } from "../entities/DeudaProducto";

const deuda = (id: string, miembroId: string, miembroNombre: string, cantidad: number, precio: number): DeudaProducto => ({
  id,
  organizacionId: "org",
  sucursalId: "suc",
  miembroId,
  miembroNombre,
  productoId: null,
  productoNombre: "Agua",
  cantidad,
  precioUnitarioUSD: precio,
  estado: "PENDIENTE",
  registradaPorId: "u",
  creadaEn: new Date(),
  cobradaEn: null,
  grupoPagoId: null,
});

describe("listarDeudasPendientes", () => {
  test("agrupa por miembro con su total y ordena por nombre", async () => {
    const deps = {
      deudas: {
        listarPendientesPorOrganizacion: async () => [
          deuda("d1", "m2", "Zoe", 1, 1.5),
          deuda("d2", "m1", "Ana", 2, 1.5),
          deuda("d3", "m2", "Zoe", 1, 2),
        ],
      },
    } as unknown as Parameters<typeof listarDeudasPendientes>[0];

    const grupos = await listarDeudasPendientes(deps, "org");

    expect(grupos.map((g) => [g.miembroNombre, g.totalUSD, g.deudas.length])).toEqual([
      ["Ana", 3, 1],
      ["Zoe", 3.5, 2],
    ]);
  });

  test("sin deudas devuelve lista vacía", async () => {
    const deps = { deudas: { listarPendientesPorOrganizacion: async () => [] } } as unknown as Parameters<typeof listarDeudasPendientes>[0];
    await expect(listarDeudasPendientes(deps, "org")).resolves.toEqual([]);
  });
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `npm test --workspace packages/domain`
Expected: FAIL — módulos inexistentes.

- [ ] **Step 3: Implementar**

Crear `packages/domain/use-cases/AnularDeuda.ts`:

```ts
import { IDeudaProductoRepository } from "../ports/IDeudaProductoRepository";
import { IAuthorizationService } from "../ports/IAuthorizationService";

export class RolNoAutorizadoError extends Error {
  constructor() {
    super("Tu rol no tiene permiso para anular deudas.");
  }
}

export class DeudaNoPendienteError extends Error {
  constructor() {
    super("Esta deuda ya no está pendiente (fue cobrada o anulada).");
  }
}

export async function anularDeuda(
  deps: { deudas: IDeudaProductoRepository; autorizacion: IAuthorizationService },
  input: { organizacionId: string; id: string; anuladaPorId: string }
): Promise<void> {
  if (!(await deps.autorizacion.tienePermiso(input.anuladaPorId, "PAGOS", "ELIMINAR"))) {
    throw new RolNoAutorizadoError();
  }

  const afectadas = await deps.deudas.anular(input.organizacionId, input.id, input.anuladaPorId, new Date());
  if (afectadas === 0) {
    throw new DeudaNoPendienteError();
  }
}
```

Crear `packages/domain/use-cases/ListarDeudasPendientes.ts`:

```ts
import { IDeudaProductoRepository } from "../ports/IDeudaProductoRepository";
import { DeudaProducto, totalDeudas } from "../entities/DeudaProducto";

export interface GrupoDeudasMiembro {
  miembroId: string;
  miembroNombre: string;
  totalUSD: number;
  deudas: DeudaProducto[];
}

export async function listarDeudasPendientes(
  deps: { deudas: IDeudaProductoRepository },
  organizacionId: string
): Promise<GrupoDeudasMiembro[]> {
  const pendientes = await deps.deudas.listarPendientesPorOrganizacion(organizacionId);

  const porMiembro = new Map<string, GrupoDeudasMiembro>();
  for (const deuda of pendientes) {
    const grupo = porMiembro.get(deuda.miembroId) ?? {
      miembroId: deuda.miembroId,
      miembroNombre: deuda.miembroNombre ?? deuda.miembroId,
      totalUSD: 0,
      deudas: [],
    };
    grupo.deudas.push(deuda);
    porMiembro.set(deuda.miembroId, grupo);
  }

  return [...porMiembro.values()]
    .map((grupo) => ({ ...grupo, totalUSD: totalDeudas(grupo.deudas) }))
    .sort((a, b) => a.miembroNombre.localeCompare(b.miembroNombre, "es"));
}
```

- [ ] **Step 4: Correr y verificar que pasan**

Run: `npm test --workspace packages/domain`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/use-cases/AnularDeuda.ts packages/domain/use-cases/AnularDeuda.test.ts packages/domain/use-cases/ListarDeudasPendientes.ts packages/domain/use-cases/ListarDeudasPendientes.test.ts
git commit -m "feat(productos-fiados): agregar anulación y listado agrupado de deudas pendientes"
```

---

### Task 5: Repositorio Prisma

**Files:**
- Create: `packages/infrastructure/persistence/prisma/PrismaDeudaProductoRepository.ts`

**Interfaces:**
- Consumes: `IDeudaProductoRepository`, `DeudaProducto`, `DatosNuevaDeuda` (Task 2); `prisma.deudaProducto` (Task 1, cliente ya generado).
- Produces: `class PrismaDeudaProductoRepository implements IDeudaProductoRepository { constructor(prisma: PrismaClientOrTx) }`, usado en Task 6.

- [ ] **Step 1: Implementar el adaptador**

Crear `packages/infrastructure/persistence/prisma/PrismaDeudaProductoRepository.ts`:

```ts
import type { PrismaClientOrTx } from "./PrismaClientOrTx";
import type { IDeudaProductoRepository } from "@gym-app/domain/ports/IDeudaProductoRepository";
import type { DeudaProducto, DatosNuevaDeuda, EstadoDeuda } from "@gym-app/domain/entities/DeudaProducto";

type FilaDeuda = {
  id: string;
  organizacionId: string;
  sucursalId: string;
  miembroId: string;
  productoId: string | null;
  productoNombre: string;
  cantidad: number;
  precioUnitarioUSD: { toNumber(): number };
  estado: string;
  registradaPorId: string;
  creadaEn: Date;
  cobradaEn: Date | null;
  grupoPagoId: string | null;
};

function mapear(fila: FilaDeuda, miembroNombre?: string): DeudaProducto {
  return {
    id: fila.id,
    organizacionId: fila.organizacionId,
    sucursalId: fila.sucursalId,
    miembroId: fila.miembroId,
    miembroNombre,
    productoId: fila.productoId,
    productoNombre: fila.productoNombre,
    cantidad: fila.cantidad,
    precioUnitarioUSD: fila.precioUnitarioUSD.toNumber(),
    estado: fila.estado as EstadoDeuda,
    registradaPorId: fila.registradaPorId,
    creadaEn: fila.creadaEn,
    cobradaEn: fila.cobradaEn,
    grupoPagoId: fila.grupoPagoId,
  };
}

export class PrismaDeudaProductoRepository implements IDeudaProductoRepository {
  constructor(private readonly prisma: PrismaClientOrTx) {}

  async crear(datos: DatosNuevaDeuda): Promise<DeudaProducto> {
    return mapear(await this.prisma.deudaProducto.create({ data: datos }));
  }

  async listarPendientesPorOrganizacion(organizacionId: string): Promise<DeudaProducto[]> {
    const filas = await this.prisma.deudaProducto.findMany({
      where: { organizacionId, estado: "PENDIENTE" },
      include: { miembro: { select: { nombre: true } } },
      orderBy: { creadaEn: "asc" },
    });
    return filas.map((fila) => mapear(fila, fila.miembro.nombre));
  }

  async listarPendientesPorMiembro(organizacionId: string, miembroId: string): Promise<DeudaProducto[]> {
    const filas = await this.prisma.deudaProducto.findMany({
      where: { organizacionId, miembroId, estado: "PENDIENTE" },
      orderBy: { creadaEn: "asc" },
    });
    return filas.map((fila) => mapear(fila));
  }

  async marcarCobradas(ids: string[], cobradaPorId: string, cobradaEn: Date, grupoPagoId: string): Promise<number> {
    const resultado = await this.prisma.deudaProducto.updateMany({
      where: { id: { in: ids }, estado: "PENDIENTE" },
      data: { estado: "COBRADA", cobradaPorId, cobradaEn, grupoPagoId },
    });
    return resultado.count;
  }

  async anular(organizacionId: string, id: string, anuladaPorId: string, anuladaEn: Date): Promise<number> {
    const resultado = await this.prisma.deudaProducto.updateMany({
      where: { id, organizacionId, estado: "PENDIENTE" },
      data: { estado: "ANULADA", anuladaPorId, anuladaEn },
    });
    return resultado.count;
  }
}
```

- [ ] **Step 2: Verificar tipos**

Run (desde `c:\dev\gym-app`): `npx tsc --noEmit -p apps/web-admin`
Expected: solo el error preexistente `apps/web-admin/app/layout.tsx(18,50): error TS2304: Cannot find name 'LayoutProps'`. Si `deudaProducto` no existe en el cliente, repetir `npm run generate --workspace packages/db`.

- [ ] **Step 3: Commit**

```bash
git add packages/infrastructure/persistence/prisma/PrismaDeudaProductoRepository.ts
git commit -m "feat(productos-fiados): agregar repositorio Prisma de deudas de producto"
```

---

### Task 6: Server Actions

**Files:**
- Modify: `apps/web-admin/app/(panel)/caja/actions.ts` (agregar imports arriba y funciones al final)

**Interfaces:**
- Consumes: `fiarProducto`, `cobrarDeudasMiembro`, `anularDeuda` y sus errores (Task 2-4); `PrismaDeudaProductoRepository` (Task 5); `PrismaMemberRepository`, `PrismaSucursalRepository`, `PrismaPagoRepository`, `PrismaTurnoRepository`, `PrismaProductoRepository`, `AuthorizationService`, `PrismaPermisoRepository`, `validarTasaSiEsEnBs` (ya importados o existentes en este archivo).
- Produces (Task 7 y 8): 
  - `interface EstadoFiarProducto { error?: string; ok?: string }` y `fiarProductoAction(estado, formData)` (campos `miembroId`, `productoId`, `cantidad`).
  - `interface EstadoCobrarDeudas { error?: string; ok?: string; tasaNueva?: number; fallaTemporal?: boolean; tasaGuardada?: number }` y `cobrarDeudasAction(estado, formData)` (campos `miembroId`, `lineas` JSON).
  - `anularDeudaAction(id: string): Promise<{ error?: string; ok?: string }>`.

- [ ] **Step 1: Agregar imports**

En `apps/web-admin/app/(panel)/caja/actions.ts`, junto a los imports existentes (`PrismaMemberRepository` no está importado todavía en este archivo):

```ts
import { PrismaMemberRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMemberRepository";
import { PrismaDeudaProductoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaDeudaProductoRepository";
import {
  fiarProducto,
  RolNoAutorizadoError as RolNoAutorizadoFiar,
  MiembroNoEncontradoError,
  MiembroFueraDeSucursalError,
  ProductoNoEncontradoError as ProductoNoEncontradoFiar,
  ProductoInactivoError as ProductoInactivoFiar,
  CantidadInvalidaError as CantidadInvalidaFiar,
} from "@gym-app/domain/use-cases/FiarProducto";
import {
  cobrarDeudasMiembro,
  RolNoAutorizadoError as RolNoAutorizadoCobrar,
  SinDeudasPendientesError,
  DeudasYaCobradasError,
  SinTurnoAbiertoError as SinTurnoAbiertoCobrar,
} from "@gym-app/domain/use-cases/CobrarDeudasMiembro";
import {
  anularDeuda,
  RolNoAutorizadoError as RolNoAutorizadoAnularDeuda,
  DeudaNoPendienteError,
} from "@gym-app/domain/use-cases/AnularDeuda";
```

`PrismaSucursalRepository`, `PrismaPagoRepository`, `PrismaTurnoRepository`, `PrismaProductoRepository`, `PrismaPermisoRepository`, `AuthorizationService`, `LineasDePagoInvalidasError`, `MontoLineasNoCubreObjetivoError` y `validarTasaSiEsEnBs` ya están importados en el archivo (por `venderProductoAction` y las acciones anteriores); no duplicarlos.

- [ ] **Step 2: Agregar las tres acciones al final del archivo**

```ts
export interface EstadoFiarProducto {
  error?: string;
  ok?: string;
}

export async function fiarProductoAction(
  _estadoPrevio: EstadoFiarProducto,
  formData: FormData
): Promise<EstadoFiarProducto> {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario, sucursalActivaId } = sesion;

  const miembroId = formData.get("miembroId")?.toString();
  const productoId = formData.get("productoId")?.toString();
  if (!miembroId || !productoId) {
    return { error: "Elige el miembro y el producto." };
  }

  try {
    await fiarProducto(
      {
        deudas: new PrismaDeudaProductoRepository(prisma),
        productos: new PrismaProductoRepository(prisma),
        miembros: new PrismaMemberRepository(prisma),
        sucursales: new PrismaSucursalRepository(prisma),
        autorizacion: new AuthorizationService(new PrismaPermisoRepository(prisma)),
      },
      {
        organizacionId: usuario.organizacionId,
        miembroId,
        productoId,
        cantidad: Number(formData.get("cantidad")),
        sucursalId: sucursalActivaId,
        registradaPorId: usuario.id,
      }
    );
  } catch (error) {
    if (
      error instanceof RolNoAutorizadoFiar ||
      error instanceof MiembroNoEncontradoError ||
      error instanceof MiembroFueraDeSucursalError ||
      error instanceof ProductoNoEncontradoFiar ||
      error instanceof ProductoInactivoFiar ||
      error instanceof CantidadInvalidaFiar
    ) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/caja");
  return { ok: "Producto fiado." };
}

export interface EstadoCobrarDeudas {
  error?: string;
  ok?: string;
  // Mismo aviso de tasa que EstadoVenderProducto.
  tasaNueva?: number;
  fallaTemporal?: boolean;
  tasaGuardada?: number;
}

export async function cobrarDeudasAction(
  _estadoPrevio: EstadoCobrarDeudas,
  formData: FormData
): Promise<EstadoCobrarDeudas> {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario, sucursalActivaId } = sesion;

  const miembroId = formData.get("miembroId")?.toString();
  const lineasRaw = formData.get("lineas")?.toString();
  if (!miembroId || !lineasRaw) {
    return { error: "Elige un miembro y un método de pago." };
  }

  let lineas: Array<{
    monto: number;
    metodo: string;
    metodoPagoId: string | null;
    numeroOperacion: string | null;
    tasaCambio: number | null;
  }>;
  try {
    lineas = JSON.parse(lineasRaw);
  } catch {
    return { error: "No se pudo interpretar la información del pago." };
  }
  if (!Array.isArray(lineas) || lineas.length === 0 || lineas.some((linea) => !linea.metodoPagoId)) {
    return { error: "Cada línea del pago necesita un monto y un método." };
  }

  const lineasValidadas: typeof lineas = [];
  for (const linea of lineas) {
    const validacionTasa = await validarTasaSiEsEnBs(linea.tasaCambio !== null ? String(linea.tasaCambio) : undefined);
    if (!validacionTasa.ok) return validacionTasa.estado;
    lineasValidadas.push({ ...linea, tasaCambio: validacionTasa.tasaCambio });
  }

  try {
    // Transacción: si algo falla después de marcar las deudas como
    // cobradas, no queda ninguna a medio escribir (mismo patrón que
    // cambiarPlanAction en pagos/actions.ts).
    await prisma.$transaction((tx) =>
      cobrarDeudasMiembro(
        {
          deudas: new PrismaDeudaProductoRepository(tx),
          pagos: new PrismaPagoRepository(tx),
          turnos: new PrismaTurnoRepository(tx),
          autorizacion: new AuthorizationService(new PrismaPermisoRepository(tx)),
        },
        {
          organizacionId: usuario.organizacionId,
          miembroId,
          lineas: lineasValidadas,
          sucursalId: sucursalActivaId,
          registradoPorId: usuario.id,
        }
      )
    );
  } catch (error) {
    if (
      error instanceof RolNoAutorizadoCobrar ||
      error instanceof SinDeudasPendientesError ||
      error instanceof DeudasYaCobradasError ||
      error instanceof SinTurnoAbiertoCobrar ||
      error instanceof LineasDePagoInvalidasError ||
      error instanceof MontoLineasNoCubreObjetivoError
    ) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/caja");
  revalidatePath("/pagos");
  return { ok: "Deuda cobrada." };
}

// Devuelve el error en vez de lanzarlo: en producción Next oculta el
// mensaje de una excepción de Server Action, y acá el cajero necesita leerlo.
export async function anularDeudaAction(id: string): Promise<{ error?: string; ok?: string }> {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario } = sesion;

  try {
    await anularDeuda(
      {
        deudas: new PrismaDeudaProductoRepository(prisma),
        autorizacion: new AuthorizationService(new PrismaPermisoRepository(prisma)),
      },
      { organizacionId: usuario.organizacionId, id, anuladaPorId: usuario.id }
    );
  } catch (error) {
    if (error instanceof RolNoAutorizadoAnularDeuda || error instanceof DeudaNoPendienteError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/caja");
  return { ok: "Deuda anulada." };
}
```

- [ ] **Step 3: Verificar tipos y lint del archivo**

Run: `npx tsc --noEmit -p apps/web-admin` (desde la raíz) y `cd apps/web-admin && npx eslint "app/(panel)/caja/actions.ts"`
Expected: solo el error preexistente de `LayoutProps`; eslint sin errores.

- [ ] **Step 4: Commit**

```bash
git add "apps/web-admin/app/(panel)/caja/actions.ts"
git commit -m "feat(productos-fiados): agregar acciones de fiar, cobrar y anular deudas en caja"
```

---

### Task 7: Interruptor "Fiar a un miembro" en el modal de venta

**Files:**
- Modify: `apps/web-admin/app/(panel)/caja/ModalVenderProducto.tsx`
- Modify: `apps/web-admin/app/(panel)/caja/BotonVenderProducto.tsx`
- Modify: `apps/web-admin/app/(panel)/caja/page.tsx` (solo el uso de `BotonVenderProducto`)

**Interfaces:**
- Consumes: `fiarProductoAction`, `EstadoFiarProducto` (Task 6); `BuscadorMiembro`, `aMiembroConPlan`, `MiembroConPlan`, `PlanParaModal` de `./SelectorMiembroModal` (existentes: `BuscadorMiembro({ miembros: Miembro[], planes: PlanParaModal[], onSeleccionar: (m: MiembroConPlan) => void, grande?: boolean })`).
- Produces: `BotonVenderProducto` con props nuevas `accionFiar`, `miembros: Miembro[]`, `planes: PlanParaModal[]`.

- [ ] **Step 1: Editar `ModalVenderProducto.tsx`**

1. Imports nuevos: 

```tsx
import type { Miembro } from "@gym-app/domain/entities/Miembro";
import { BuscadorMiembro, type MiembroConPlan, type PlanParaModal } from "./SelectorMiembroModal";
import type { EstadoVenderProducto, EstadoFiarProducto } from "./actions";
```
(reemplaza el import actual de `EstadoVenderProducto`).

2. Props nuevas (agregar a la desestructuración y al tipo): `accionFiar: (estado: EstadoFiarProducto, formData: FormData) => Promise<EstadoFiarProducto>; miembros: Miembro[]; planes: PlanParaModal[];`.

3. Debajo de `const [estado, enviar, enviando] = useActionState(accion, {});` agregar:

```tsx
  const [estadoFiar, enviarFiar, fiando] = useActionState(accionFiar, {});
  const [fiar, setFiar] = useState(false);
  const [miembroFiado, setMiembroFiado] = useState<MiembroConPlan | null>(null);
```

4. Los dos `useEffect` de `estado.error` / `estado.ok` pasan a cubrir ambos estados. Reemplazar `estado.error` por `const error = estado.error ?? estadoFiar.error;` y `estado.ok` por `const ok = estado.ok ?? estadoFiar.ok;`, con dependencias `[error]` y `[ok]` (mantener los comentarios `eslint-disable-next-line` existentes).

5. `puedeEnviar`: 

```tsx
  const puedeEnviar = fiar
    ? producto !== null && miembroFiado !== null
    : producto !== null && seleccion.metodoPagoId !== null && numeroOperacionValido;
```

6. Formulario: `action={fiar ? enviarFiar : enviar}`; los hidden inputs pasan a:

```tsx
            <input type="hidden" name="productoId" value={productoId ?? ""} />
            <input type="hidden" name="cantidad" value={cantidad} />
            {fiar ? (
              <input type="hidden" name="miembroId" value={miembroFiado?.id ?? ""} />
            ) : (
              <input type="hidden" name="lineas" value={JSON.stringify(lineas)} />
            )}
```

7. Justo antes del bloque `{producto && (` (la cuadrícula ya se cerró), y dentro de él tras el bloque de cantidad y total, reemplazar el `<SelectorMetodoPago …/>` por:

```tsx
                <label className="flex min-h-11 items-center gap-2 text-sm" style={{ color: "var(--gx-muted)" }}>
                  <input
                    type="checkbox"
                    checked={fiar}
                    onChange={(e) => {
                      setFiar(e.target.checked);
                      setMiembroFiado(null);
                    }}
                    className="h-5 w-5 accent-[var(--gx-accent)]"
                  />
                  Fiar a un miembro (cobrar después)
                </label>

                {fiar ? (
                  miembroFiado ? (
                    <div className="flex items-center justify-between rounded-lg px-3 py-2 text-sm" style={{ background: "var(--gx-surface-2)" }}>
                      <span style={{ color: "var(--gx-ink)" }}>
                        {miembroFiado.nombre} · {miembroFiado.cedula}
                      </span>
                      <button type="button" className="font-medium hover:underline" style={{ color: "var(--gx-accent)" }} onClick={() => setMiembroFiado(null)}>
                        Cambiar
                      </button>
                    </div>
                  ) : (
                    <BuscadorMiembro miembros={miembros.filter((m) => m.activo)} planes={planes} onSeleccionar={setMiembroFiado} />
                  )
                ) : (
                  <SelectorMetodoPago
                    metodos={metodosPago}
                    monto={total}
                    idFormulario={ID_FORMULARIO}
                    onCambio={setSeleccion}
                    avisoServidor={{ tasaNueva: estado.tasaNueva, fallaTemporal: estado.fallaTemporal, tasaGuardada: estado.tasaGuardada }}
                  />
                )}
```

8. Botón final: `disabled={!puedeEnviar || enviando || fiando}` y texto:

```tsx
            {enviando || fiando ? "Registrando..." : fiar ? "Fiar" : "Registrar venta"}
```

- [ ] **Step 2: Editar `BotonVenderProducto.tsx`**

Agregar a los imports `import type { Miembro } from "@gym-app/domain/entities/Miembro";`, `import type { PlanParaModal } from "./SelectorMiembroModal";` y `import type { EstadoVenderProducto, EstadoFiarProducto } from "./actions";`. Agregar a las props `accionFiar`, `miembros`, `planes` (mismos tipos que en el modal) y pasarlos a `<ModalVenderProducto …/>`.

- [ ] **Step 3: Cablear en `caja/page.tsx`**

Cambiar el import a `import { abrirTurnoAction, registrarEgresoAction, cerrarTurnoAction, venderProductoAction, fiarProductoAction } from "./actions";` y el uso:

```tsx
              <BotonVenderProducto
                accion={venderProductoAction}
                accionFiar={fiarProductoAction}
                productos={productos.filter((p) => p.activo)}
                metodosPago={metodosPago}
                tasaActual={tasaActual}
                miembros={miembrosActivos}
                planes={planesActivos}
              />
```

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit -p apps/web-admin` (raíz) y `cd apps/web-admin && npx eslint "app/(panel)/caja/ModalVenderProducto.tsx" "app/(panel)/caja/BotonVenderProducto.tsx"`
Expected: solo el error preexistente de `LayoutProps`; eslint sin errores.

- [ ] **Step 5: Commit**

```bash
git add "apps/web-admin/app/(panel)/caja/ModalVenderProducto.tsx" "apps/web-admin/app/(panel)/caja/BotonVenderProducto.tsx" "apps/web-admin/app/(panel)/caja/page.tsx"
git commit -m "feat(productos-fiados): permitir fiar un producto a un miembro desde vender producto"
```

---

### Task 8: Modal y botón "Cobrar deudas"

**Files:**
- Create: `apps/web-admin/app/(panel)/caja/ModalCobrarDeudas.tsx`, `apps/web-admin/app/(panel)/caja/BotonCobrarDeudas.tsx`
- Modify: `apps/web-admin/app/(panel)/caja/page.tsx`

**Interfaces:**
- Consumes: `GrupoDeudasMiembro` y `listarDeudasPendientes` (Task 4); `PrismaDeudaProductoRepository` (Task 5); `cobrarDeudasAction`, `anularDeudaAction`, `EstadoCobrarDeudas` (Task 6); `SelectorMetodoPago` (existente, misma firma que en `ModalVenderProducto`); `totalDeudas` (Task 2); `formatearBs` (`../tasaBcvFija`).
- Produces: `BotonCobrarDeudas({ grupos, metodosPago, tasaActual, accionCobrar, accionAnular })`.

- [ ] **Step 1: Crear `ModalCobrarDeudas.tsx`**

```tsx
"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Button } from "@gym-app/ui/components/Button";
import { useFeedback } from "@gym-app/ui/components/FeedbackOverlay";
import type { MetodoPago } from "@gym-app/domain/entities/MetodoPago";
import type { GrupoDeudasMiembro } from "@gym-app/domain/use-cases/ListarDeudasPendientes";
import { totalDeudas } from "@gym-app/domain/entities/DeudaProducto";
import { SelectorMetodoPago } from "../pagos/SelectorMetodoPago";
import { formatearBs } from "../tasaBcvFija";
import type { EstadoCobrarDeudas } from "./actions";

const ID_FORMULARIO = "formulario-cobrar-deudas";

interface Seleccion {
  metodoPagoId: string | null;
  metodo: string;
  tasaCambio: number | null;
  numeroOperacion: string;
  requiereNumeroOperacion: boolean;
}

const SELECCION_VACIA: Seleccion = {
  metodoPagoId: null,
  metodo: "",
  tasaCambio: null,
  numeroOperacion: "",
  requiereNumeroOperacion: false,
};

export function ModalCobrarDeudas({
  grupos,
  metodosPago,
  tasaActual,
  accionCobrar,
  accionAnular,
  onCerrar,
}: {
  grupos: GrupoDeudasMiembro[];
  metodosPago: MetodoPago[];
  tasaActual: number | null;
  accionCobrar: (estado: EstadoCobrarDeudas, formData: FormData) => Promise<EstadoCobrarDeudas>;
  accionAnular: (id: string) => Promise<{ error?: string; ok?: string }>;
  onCerrar: () => void;
}) {
  const [estado, enviar, enviando] = useActionState(accionCobrar, {});
  const { mostrarExito, mostrarError } = useFeedback();
  const [anulando, iniciarTransicion] = useTransition();
  const [miembroId, setMiembroId] = useState<string | null>(null);
  const [seleccion, setSeleccion] = useState<Seleccion>(SELECCION_VACIA);

  useEffect(() => {
    if (estado.error) mostrarError(estado.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe reaccionar a un nuevo estado.error, no a mostrarError
  }, [estado.error]);

  useEffect(() => {
    if (estado.ok) {
      mostrarExito(estado.ok);
      onCerrar();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe reaccionar a un nuevo estado.ok, no a mostrarExito/onCerrar
  }, [estado.ok]);

  const grupo = grupos.find((g) => g.miembroId === miembroId) ?? null;
  const total = grupo ? totalDeudas(grupo.deudas) : 0;
  const numeroOperacionValido = !seleccion.requiereNumeroOperacion || /^\d{4}$/.test(seleccion.numeroOperacion);
  const puedeEnviar = grupo !== null && seleccion.metodoPagoId !== null && numeroOperacionValido;

  const lineas = [
    {
      monto: total,
      metodo: seleccion.metodo,
      metodoPagoId: seleccion.metodoPagoId,
      numeroOperacion: seleccion.requiereNumeroOperacion ? seleccion.numeroOperacion : null,
      tasaCambio: seleccion.tasaCambio,
    },
  ];

  function anular(id: string, nombre: string) {
    if (!window.confirm(`¿Anular "${nombre}"? Se quita de lo que debe el miembro.`)) return;
    iniciarTransicion(async () => {
      const resultado = await accionAnular(id);
      if (resultado.error) mostrarError(resultado.error);
      else if (resultado.ok) mostrarExito(resultado.ok);
    });
  }

  const bs = (usd: number) => (tasaActual !== null ? ` · Bs. ${formatearBs(usd * tasaActual)}` : "");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "color-mix(in srgb, black 60%, transparent)" }}
      onClick={onCerrar}
    >
      <div
        role="dialog"
        aria-label="Cobrar deudas"
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-y-auto rounded-2xl border-2 p-6"
        style={{ borderColor: "var(--gx-accent)", background: "var(--gx-surface)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold" style={{ color: "var(--gx-ink)" }}>
          Cobrar deudas
        </h3>

        {grupos.length === 0 ? (
          <p className="mt-4 text-sm" style={{ color: "var(--gx-muted)" }}>
            No hay productos pendientes de cobro.
          </p>
        ) : !grupo ? (
          <ul className="mt-4 flex flex-col gap-2">
            {grupos.map((g) => (
              <li key={g.miembroId}>
                <button
                  type="button"
                  onClick={() => setMiembroId(g.miembroId)}
                  className="flex w-full items-center justify-between rounded-xl border-2 px-3 py-3 text-left"
                  style={{ borderColor: "var(--gx-edge)", background: "var(--gx-surface-2)" }}
                >
                  <span className="font-medium" style={{ color: "var(--gx-ink)" }}>
                    {g.miembroNombre}
                  </span>
                  <span className="text-sm" style={{ color: "var(--gx-muted)" }}>
                    ${g.totalUSD.toFixed(2)}
                    {bs(g.totalUSD)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <form id={ID_FORMULARIO} action={enviar} className="mt-4 flex flex-col gap-4">
            <input type="hidden" name="miembroId" value={grupo.miembroId} />
            <input type="hidden" name="lineas" value={JSON.stringify(lineas)} />

            <div className="flex items-center justify-between">
              <span className="font-semibold" style={{ color: "var(--gx-ink)" }}>
                {grupo.miembroNombre}
              </span>
              <button type="button" className="text-sm font-medium hover:underline" style={{ color: "var(--gx-accent)" }} onClick={() => setMiembroId(null)}>
                Otro miembro
              </button>
            </div>

            <ul className="flex flex-col gap-1">
              {grupo.deudas.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm" style={{ background: "var(--gx-surface-2)" }}>
                  <span style={{ color: "var(--gx-ink)" }}>
                    {d.productoNombre}
                    {d.cantidad > 1 ? ` × ${d.cantidad}` : ""}
                  </span>
                  <span className="flex items-center gap-3">
                    <span style={{ color: "var(--gx-muted)" }}>${totalDeudas([d]).toFixed(2)}</span>
                    <button
                      type="button"
                      disabled={anulando}
                      onClick={() => anular(d.id, d.productoNombre)}
                      className="font-medium hover:underline disabled:opacity-50"
                      style={{ color: "var(--gx-bad)" }}
                    >
                      Anular
                    </button>
                  </span>
                </li>
              ))}
            </ul>

            <div className="flex justify-between rounded-lg px-3 py-2" style={{ background: "var(--gx-surface-2)" }}>
              <span className="font-semibold" style={{ color: "var(--gx-ink)" }}>
                Total ${total.toFixed(2)}
              </span>
              {tasaActual !== null && (
                <span className="text-sm" style={{ color: "var(--gx-muted)" }}>
                  Bs. {formatearBs(total * tasaActual)}
                </span>
              )}
            </div>

            <SelectorMetodoPago
              metodos={metodosPago}
              monto={total}
              idFormulario={ID_FORMULARIO}
              onCambio={setSeleccion}
              avisoServidor={{ tasaNueva: estado.tasaNueva, fallaTemporal: estado.fallaTemporal, tasaGuardada: estado.tasaGuardada }}
            />
          </form>
        )}

        <div className="mt-4 flex gap-3">
          <Button type="button" variant="secundario" className="flex-1" onClick={onCerrar}>
            Cerrar
          </Button>
          {grupo && (
            <Button type="submit" form={ID_FORMULARIO} className="flex-1" disabled={!puedeEnviar || enviando}>
              {enviando ? "Cobrando..." : "Cobrar"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
```

Nota: si al anular se vacía el grupo abierto, `grupos` (prop, refrescada por `revalidatePath`) ya no lo trae y `grupo` pasa a `null`, con lo que se vuelve a la lista.

- [ ] **Step 2: Crear `BotonCobrarDeudas.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Button } from "@gym-app/ui/components/Button";
import type { MetodoPago } from "@gym-app/domain/entities/MetodoPago";
import type { GrupoDeudasMiembro } from "@gym-app/domain/use-cases/ListarDeudasPendientes";
import { ModalCobrarDeudas } from "./ModalCobrarDeudas";
import type { EstadoCobrarDeudas } from "./actions";

export function BotonCobrarDeudas({
  grupos,
  metodosPago,
  tasaActual,
  accionCobrar,
  accionAnular,
}: {
  grupos: GrupoDeudasMiembro[];
  metodosPago: MetodoPago[];
  tasaActual: number | null;
  accionCobrar: (estado: EstadoCobrarDeudas, formData: FormData) => Promise<EstadoCobrarDeudas>;
  accionAnular: (id: string) => Promise<{ error?: string; ok?: string }>;
}) {
  const [modalAbierta, setModalAbierta] = useState(false);

  return (
    <>
      <Button variant="secundario" onClick={() => setModalAbierta(true)}>
        Cobrar deudas{grupos.length > 0 ? ` (${grupos.length})` : ""}
      </Button>
      {modalAbierta && (
        <ModalCobrarDeudas
          grupos={grupos}
          metodosPago={metodosPago}
          tasaActual={tasaActual}
          accionCobrar={accionCobrar}
          accionAnular={accionAnular}
          onCerrar={() => setModalAbierta(false)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 3: Cablear en `caja/page.tsx`**

Imports nuevos:

```tsx
import { PrismaDeudaProductoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaDeudaProductoRepository";
import { listarDeudasPendientes } from "@gym-app/domain/use-cases/ListarDeudasPendientes";
import { BotonCobrarDeudas } from "./BotonCobrarDeudas";
```
y `cobrarDeudasAction, anularDeudaAction` en el import de `./actions`.

En el `Promise.all`, agregar `deudasPendientes` a la desestructuración (después de `productos`) y el elemento correspondiente en la misma posición:

```tsx
      listarDeudasPendientes({ deudas: new PrismaDeudaProductoRepository(prisma) }, usuario.organizacionId),
```

En los botones, antes de `<BotonRegistrarEgreso …/>`:

```tsx
              <BotonCobrarDeudas
                grupos={deudasPendientes}
                metodosPago={metodosPago}
                tasaActual={tasaActual}
                accionCobrar={cobrarDeudasAction}
                accionAnular={anularDeudaAction}
              />
```

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit -p apps/web-admin` (raíz), `cd apps/web-admin && npx eslint "app/(panel)/caja/ModalCobrarDeudas.tsx" "app/(panel)/caja/BotonCobrarDeudas.tsx" "app/(panel)/caja/page.tsx"` y `npm test --workspace packages/domain` (raíz).
Expected: solo el error preexistente `LayoutProps`; eslint solo con los avisos que ya tenía `caja/page.tsx` (imports sin usar de `../fechas` y `sucursalId`), ningún error nuevo; todos los tests pasan.

- [ ] **Step 5: Commit**

```bash
git add "apps/web-admin/app/(panel)/caja/ModalCobrarDeudas.tsx" "apps/web-admin/app/(panel)/caja/BotonCobrarDeudas.tsx" "apps/web-admin/app/(panel)/caja/page.tsx"
git commit -m "feat(productos-fiados): agregar botón y modal para cobrar las deudas de un miembro"
```

---

### Task 9: Verificación final, handoff y push

**Files:**
- Modify: `handoff.md`

- [ ] **Step 1: Verificación completa**

Run (raíz): `npm test --workspace packages/domain`, `npx tsc --noEmit -p apps/web-admin`.
Expected: todos los tests pasan; solo el error preexistente de `LayoutProps`.

- [ ] **Step 2: Comprobar el estado de la base antes de la migración (solo lectura)**

Revisar `pg_stat_activity` por sesiones `idle in transaction` (consulta `select pid,state,now()-xact_start age from pg_stat_activity where datname=current_database() and state like 'idle in%'`). Si hay alguna, avisar al usuario y **no** continuar con el push hasta que se cierre.

- [ ] **Step 3: Actualizar `handoff.md`**

Agregar, siguiendo las 5 secciones fijas y sin borrar entradas de "Intentos fallidos": en Estado actual, "Productos fiados: código listo; migración `20260929200000_agrega_deuda_producto` pendiente de aplicar"; en Archivos y cambios, la tabla de File Structure de este plan; en Próximos pasos, aplicar la migración y probar en vivo (fiar → aparece en "Cobrar deudas" → cobrar con efectivo USD y con pago móvil en Bs → aparece en "Pagos del turno" con el nombre del producto → anular una deuda).

- [ ] **Step 4: Commit y push**

```bash
git add handoff.md
git commit -m "docs(handoff): registrar productos fiados y pasos pendientes"
git push origin main
```
Expected: `main -> main` sin errores. Recordar al usuario que la migración se aplica al arrancar el contenedor y que `/caja` falla hasta entonces (la consulta de deudas pendientes necesita la tabla).
