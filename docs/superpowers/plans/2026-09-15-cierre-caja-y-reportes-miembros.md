# Cierre de Caja y Reportes de Miembros Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Digitalizar el libro de caja físico del dueño (tabla diaria de pagos con alta/renovación, desglose por método, total) como una pantalla `/caja` con acción de cierre que sella el día, más filtros y reporte imprimible en `/miembros`.

**Architecture:** `Pago` gana `numeroOperacion` (solo relevante para Pago Móvil). Un modelo nuevo `CierreCaja` guarda el "sello" de un día ya cerrado (total + desglose por método, congelado al momento del cierre) — pero la tabla detallada de un día (o semana/mes) siempre se recalcula en vivo a partir de `Pago` por rango de fecha, cerrado o no; `CierreCaja` no duplica esas filas, solo marca que ese día ya no se puede volver a cerrar. "Alta" vs "renovación" se calcula comparando cada pago contra el historial completo del miembro (si es el primero, es alta) — no es un campo guardado. `/miembros` no cambia su modelo de datos: los filtros son sobre los datos ya cargados, y "imprimir" es `window.print()` con una hoja de estilos `print:` de Tailwind (sin PDF del lado del servidor).

**Tech Stack:** Sin dependencias nuevas.

**Spec:** Decisiones de esta sesión, resumidas:

| Decisión | Resultado |
|---|---|
| Alcance de "Monto semanal/mensual/diario" | El reporte de caja se puede ver por día, semana o mes (selector de período) — no es un desglose por tipo de plan. |
| Tipo de cierre | Acción real ("Cerrar caja") que sella el total del día — no se puede cerrar dos veces el mismo día. No bloquea cargar un pago atrasado después (ese pago simplemente no entra al total ya sellado). |
| Alta vs renovación | Calculado en el momento del reporte (primer pago histórico del miembro = alta), no es un campo nuevo en `Pago`. |
| Alcance de organización vs sucursal | El cierre es por Organización completa, igual que `Pago`/`Miembro` hoy (no existe el concepto de "sucursal de un pago" en el schema actual) — si más adelante hace falta un cierre por sucursal, es un cambio de schema aparte. |
| Filtros de Miembros | Nombre/cédula, rango de fecha de inscripción, rango de fecha de vencimiento — todo sobre lo ya cargado, sin cambios de query al repositorio. |
| Impresión | `window.print()` + CSS `print:hidden` de Tailwind para ocultar sidebar/filtros/acciones — sin generar PDF en el servidor. |

## Global Constraints

- **No se toca `ListarPagos`** (ya usado por `/pagos` y `/miembros/[id]/pagos`) — el reporte de caja usa un caso de uso nuevo (`obtenerReporteCaja`) sobre un método nuevo del repositorio (`listarPorOrganizacionYRango`), en paralelo, sin modificar el camino existente.
- **`CierreCaja` no guarda las filas del día** — solo el total y el desglose por método al momento de cerrar. La tabla detallada siempre se recalcula desde `Pago` por rango de fecha (cerrado o no), así que un día cerrado se puede seguir viendo/imprimiendo con el mismo detalle que uno abierto.
- **Sin matriz de permisos todavía** — cualquier usuario logueado puede cerrar caja, igual que hoy cualquier usuario logueado puede hacer cualquier otra acción del panel (fuera de "crear UsuarioAdmin es exclusivo de DUENO"). Graduar esto es trabajo aparte, ya documentado como pendiente en el roadmap.
- **Este entorno no tiene acceso a la base de datos real** — la migración se escribe a mano seguida a la última migración existente; el usuario la aplica con `npx prisma migrate dev` en su máquina.
- Nunca ejecutar `git commit`/`git push` automáticamente salvo instrucción explícita del usuario.

---

## Pre-flight: lo que ya existe y se reutiliza

- `packages/domain/entities/Pago.ts`, `IPagoRepository`, `PrismaPagoRepository`, `RegistrarPago` (Plan 6) — se extienden, no se reescriben desde cero.
- `apps/web-admin/app/(panel)/metodosPago.ts` (`METODOS_PAGO`) — se reutiliza para las etiquetas de método en el reporte de caja.
- `apps/web-admin/app/(panel)/pagos/FormularioPago.tsx` y `apps/web-admin/app/(panel)/miembros/FormularioMiembro.tsx` — ya tienen el patrón de campos condicionales según el método de pago (el bloque de tasa/monto en Bs) — el campo de número de operación sigue el mismo patrón.
- `apps/web-admin/app/(panel)/layout.tsx` (`Sidebar`) — se le agrega un ítem nuevo, no se reestructura.
- `Miembro.fechaInscripcion`/`fechaVencimiento`/`createdAt` (ya existen) — la base de los filtros de `/miembros`.

---

### Task 1: Schema — `Pago.numeroOperacion` + modelo `CierreCaja`

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/20260915120000_cierre_caja_y_numero_operacion/migration.sql`

**Interfaces:** ninguna — solo schema/migración.

- [ ] **Step 1: Agregar `numeroOperacion` al modelo `Pago`**

Buscar el modelo `Pago` y agregar el campo después de `metodo`:

```prisma
  metodo     String
  numeroOperacion String? // últimos 4 dígitos del pago móvil — solo cuando metodo = "pago_movil"
```

- [ ] **Step 2: Agregar el modelo `CierreCaja` y su relación en `Organizacion`**

Agregar `cierresCaja CierreCaja[]` al final de las relaciones de `model Organizacion` (junto a `planes`/`tema`), y agregar el modelo nuevo después de `model Pago`:

```prisma
model CierreCaja {
  id             String       @id @default(cuid())
  organizacionId String
  organizacion   Organizacion @relation(fields: [organizacionId], references: [id])
  fecha          DateTime // medianoche del día que cubre este cierre
  totalUSD       Decimal      @db.Decimal(10, 2)
  desglose       Json // { [metodo: string]: number } — total por método, en USD
  cerradoEn      DateTime     @default(now())

  @@unique([organizacionId, fecha])
}
```

- [ ] **Step 3: Migración a mano**

```sql
-- AlterTable
ALTER TABLE "Pago" ADD COLUMN     "numeroOperacion" TEXT;

-- CreateTable
CREATE TABLE "CierreCaja" (
    "id" TEXT NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "totalUSD" DECIMAL(10,2) NOT NULL,
    "desglose" JSONB NOT NULL,
    "cerradoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CierreCaja_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CierreCaja_organizacionId_fecha_key" ON "CierreCaja"("organizacionId", "fecha");

-- AddForeignKey
ALTER TABLE "CierreCaja" ADD CONSTRAINT "CierreCaja_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

- [ ] **Step 4: Regenerar el cliente de Prisma**

Run: `cd packages/db && npx prisma generate`
Expected: exit 0 — esto NO requiere conexión a la base de datos real, solo lee `schema.prisma`.

- [ ] **Step 5: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations/20260915120000_cierre_caja_y_numero_operacion
git commit -m "feat: agrega Pago.numeroOperacion y el modelo CierreCaja"
```

---

### Task 2: `numeroOperacion` en dominio e infraestructura de `Pago`

**Files:**
- Modify: `packages/domain/entities/Pago.ts`
- Modify: `packages/domain/ports/IPagoRepository.ts`
- Modify: `packages/domain/use-cases/RegistrarPago.ts`
- Modify: `packages/infrastructure/persistence/prisma/PrismaPagoRepository.ts`

**Interfaces:**
- Produces: `IPagoRepository.listarPorOrganizacionYRango` — consumido por la Tarea 3.

- [ ] **Step 1: `packages/domain/entities/Pago.ts`**

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
  numeroOperacion: string | null;
  tasaCambio: number | null;
  fechaPago: Date;
}

export interface DatosNuevoPago {
  miembroId: string;
  monto: number;
  metodo: string;
  numeroOperacion: string | null;
  tasaCambio: number | null;
}
```

- [ ] **Step 2: `packages/domain/ports/IPagoRepository.ts`**

```typescript
import { Pago, DatosNuevoPago } from "../entities/Pago";

export interface IPagoRepository {
  crear(datos: DatosNuevoPago): Promise<Pago>;
  listarPorMiembro(miembroId: string): Promise<Pago[]>;
  listarPorOrganizacion(organizacionId: string): Promise<Pago[]>;
  listarPorOrganizacionYRango(organizacionId: string, desde: Date, hasta: Date): Promise<Pago[]>;
}
```

- [ ] **Step 3: `packages/domain/use-cases/RegistrarPago.ts` — agregar `numeroOperacion` a `DatosRegistrarPago` y pasarlo al crear el pago**

En la interfaz `DatosRegistrarPago`, agregar después de `metodo`:

```typescript
  metodo: string;
  numeroOperacion: string | null;
```

En el `deps.pagos.crear({...})` al final de la función, agregar `numeroOperacion: input.numeroOperacion,` junto a `metodo: input.metodo`.

- [ ] **Step 4: `packages/infrastructure/persistence/prisma/PrismaPagoRepository.ts` — reemplazo completo**

```typescript
import type { PrismaClient } from "@gym-app/db/generated/prisma/client";
import type { IPagoRepository } from "@gym-app/domain/ports/IPagoRepository";
import type { Pago, DatosNuevoPago } from "@gym-app/domain/entities/Pago";

type FilaPago = {
  id: string;
  miembroId: string;
  monto: { toNumber(): number };
  metodo: string;
  numeroOperacion: string | null;
  tasaCambio: { toNumber(): number } | null;
  fechaPago: Date;
};

function mapear(pago: FilaPago): Pago {
  return {
    id: pago.id,
    miembroId: pago.miembroId,
    monto: pago.monto.toNumber(),
    metodo: pago.metodo,
    numeroOperacion: pago.numeroOperacion,
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
      include: { miembro: { select: { nombre: true } } },
      orderBy: { fechaPago: "asc" },
    });

    return pagos.map((pago) => ({ ...mapear(pago), miembroNombre: pago.miembro.nombre }));
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add packages/domain/entities/Pago.ts packages/domain/ports/IPagoRepository.ts packages/domain/use-cases/RegistrarPago.ts packages/infrastructure/persistence/prisma/PrismaPagoRepository.ts
git commit -m "feat: agrega numeroOperacion a Pago y listarPorOrganizacionYRango"
```

---

### Task 3: Dominio de `CierreCaja` (cerrar + reporte)

**Files:**
- Create: `packages/domain/entities/CierreCaja.ts`
- Create: `packages/domain/ports/ICierreCajaRepository.ts`
- Create: `packages/domain/use-cases/CerrarCaja.ts`
- Create: `packages/domain/use-cases/ObtenerReporteCaja.ts`
- Create: `packages/infrastructure/persistence/prisma/PrismaCierreCajaRepository.ts`

**Interfaces:**
- Consumes: `IPagoRepository.listarPorOrganizacionYRango` (Tarea 2).
- Produces: `cerrarCaja`, `obtenerReporteCaja`, `PrismaCierreCajaRepository` — consumidos por la Tarea 6.

- [ ] **Step 1: `packages/domain/entities/CierreCaja.ts`**

```typescript
export interface CierreCaja {
  id: string;
  organizacionId: string;
  fecha: Date;
  totalUSD: number;
  desglosePorMetodo: Record<string, number>;
  cerradoEn: Date;
}

export interface DatosNuevoCierreCaja {
  organizacionId: string;
  fecha: Date;
  totalUSD: number;
  desglosePorMetodo: Record<string, number>;
}
```

- [ ] **Step 2: `packages/domain/ports/ICierreCajaRepository.ts`**

```typescript
import { CierreCaja, DatosNuevoCierreCaja } from "../entities/CierreCaja";

export interface ICierreCajaRepository {
  buscarPorFecha(organizacionId: string, fecha: Date): Promise<CierreCaja | null>;
  crear(datos: DatosNuevoCierreCaja): Promise<CierreCaja>;
  listarPorOrganizacion(organizacionId: string): Promise<CierreCaja[]>;
}
```

- [ ] **Step 3: `packages/domain/use-cases/CerrarCaja.ts`**

```typescript
import { ICierreCajaRepository } from "../ports/ICierreCajaRepository";
import { IPagoRepository } from "../ports/IPagoRepository";
import { CierreCaja } from "../entities/CierreCaja";

export class DiaYaCerradoError extends Error {
  constructor() {
    super("Ya existe un cierre de caja para este día.");
  }
}

function inicioDelDia(fecha: Date): Date {
  const dia = new Date(fecha);
  dia.setHours(0, 0, 0, 0);
  return dia;
}

function finDelDia(fecha: Date): Date {
  const dia = new Date(fecha);
  dia.setHours(23, 59, 59, 999);
  return dia;
}

export async function cerrarCaja(
  deps: { cierres: ICierreCajaRepository; pagos: IPagoRepository },
  input: { organizacionId: string; fecha: Date }
): Promise<CierreCaja> {
  const fecha = inicioDelDia(input.fecha);

  const existente = await deps.cierres.buscarPorFecha(input.organizacionId, fecha);
  if (existente) {
    throw new DiaYaCerradoError();
  }

  const pagos = await deps.pagos.listarPorOrganizacionYRango(input.organizacionId, fecha, finDelDia(fecha));

  const desglosePorMetodo: Record<string, number> = {};
  let totalUSD = 0;
  for (const pago of pagos) {
    totalUSD += pago.monto;
    desglosePorMetodo[pago.metodo] = (desglosePorMetodo[pago.metodo] ?? 0) + pago.monto;
  }

  return deps.cierres.crear({ organizacionId: input.organizacionId, fecha, totalUSD, desglosePorMetodo });
}
```

- [ ] **Step 4: `packages/domain/use-cases/ObtenerReporteCaja.ts`**

```typescript
import { IPagoRepository } from "../ports/IPagoRepository";
import { Pago } from "../entities/Pago";

export interface FilaReporteCaja {
  pagoId: string;
  miembroId: string;
  miembroNombre: string;
  monto: number;
  metodo: string;
  numeroOperacion: string | null;
  fechaPago: Date;
  esAlta: boolean;
}

export interface ReporteCaja {
  filas: FilaReporteCaja[];
  totalUSD: number;
  desglosePorMetodo: Record<string, number>;
}

// "Alta" = el primer pago histórico de ese miembro. Para saberlo hace
// falta su historial completo, no solo el del rango pedido — se pide una
// vez por miembro distinto en el rango (no una vez por fila) y se cachea
// acá. A la escala actual (un gym, pocos pagos por día) es suficiente; si
// el volumen crece mucho, esto se resuelve con una consulta agregada.
export async function obtenerReporteCaja(
  deps: { pagos: IPagoRepository },
  input: { organizacionId: string; desde: Date; hasta: Date }
): Promise<ReporteCaja> {
  const pagos = await deps.pagos.listarPorOrganizacionYRango(input.organizacionId, input.desde, input.hasta);

  const historialesPorMiembro = new Map<string, Pago[]>();
  const filas: FilaReporteCaja[] = [];
  const desglosePorMetodo: Record<string, number> = {};
  let totalUSD = 0;

  for (const pago of pagos) {
    if (!historialesPorMiembro.has(pago.miembroId)) {
      historialesPorMiembro.set(pago.miembroId, await deps.pagos.listarPorMiembro(pago.miembroId));
    }
    const historial = historialesPorMiembro.get(pago.miembroId)!;
    const primerPago = historial.reduce((min, p) => (p.fechaPago < min.fechaPago ? p : min), historial[0]);

    totalUSD += pago.monto;
    desglosePorMetodo[pago.metodo] = (desglosePorMetodo[pago.metodo] ?? 0) + pago.monto;

    filas.push({
      pagoId: pago.id,
      miembroId: pago.miembroId,
      miembroNombre: pago.miembroNombre ?? "",
      monto: pago.monto,
      metodo: pago.metodo,
      numeroOperacion: pago.numeroOperacion,
      fechaPago: pago.fechaPago,
      esAlta: primerPago.id === pago.id,
    });
  }

  return { filas, totalUSD, desglosePorMetodo };
}
```

- [ ] **Step 5: `packages/infrastructure/persistence/prisma/PrismaCierreCajaRepository.ts`**

```typescript
import type { PrismaClient } from "@gym-app/db/generated/prisma/client";
import type { ICierreCajaRepository } from "@gym-app/domain/ports/ICierreCajaRepository";
import type { CierreCaja, DatosNuevoCierreCaja } from "@gym-app/domain/entities/CierreCaja";

type FilaCierreCaja = {
  id: string;
  organizacionId: string;
  fecha: Date;
  totalUSD: { toNumber(): number };
  desglose: unknown;
  cerradoEn: Date;
};

function mapear(fila: FilaCierreCaja): CierreCaja {
  return {
    id: fila.id,
    organizacionId: fila.organizacionId,
    fecha: fila.fecha,
    totalUSD: fila.totalUSD.toNumber(),
    desglosePorMetodo: fila.desglose as Record<string, number>,
    cerradoEn: fila.cerradoEn,
  };
}

export class PrismaCierreCajaRepository implements ICierreCajaRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async buscarPorFecha(organizacionId: string, fecha: Date): Promise<CierreCaja | null> {
    const cierre = await this.prisma.cierreCaja.findUnique({
      where: { organizacionId_fecha: { organizacionId, fecha } },
    });

    return cierre ? mapear(cierre) : null;
  }

  async crear(datos: DatosNuevoCierreCaja): Promise<CierreCaja> {
    const cierre = await this.prisma.cierreCaja.create({
      data: {
        organizacionId: datos.organizacionId,
        fecha: datos.fecha,
        totalUSD: datos.totalUSD,
        desglose: datos.desglosePorMetodo,
      },
    });

    return mapear(cierre);
  }

  async listarPorOrganizacion(organizacionId: string): Promise<CierreCaja[]> {
    const cierres = await this.prisma.cierreCaja.findMany({
      where: { organizacionId },
      orderBy: { fecha: "desc" },
    });

    return cierres.map(mapear);
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add packages/domain/entities/CierreCaja.ts packages/domain/ports/ICierreCajaRepository.ts packages/domain/use-cases/CerrarCaja.ts packages/domain/use-cases/ObtenerReporteCaja.ts packages/infrastructure/persistence/prisma/PrismaCierreCajaRepository.ts
git commit -m "feat: agrega el dominio de CierreCaja (cerrar día + reporte por rango)"
```

---

### Task 4: Número de operación en "Registrar Pago"

**Files:**
- Modify: `apps/web-admin/app/(panel)/pagos/FormularioPago.tsx`
- Modify: `apps/web-admin/app/(panel)/pagos/actions.ts`

**Interfaces:**
- Consumes: `registrarPago` con `numeroOperacion` (Tarea 2).

- [ ] **Step 1: `FormularioPago.tsx` — agregar el campo condicional después del bloque de tasa de cambio en Bs**

```tsx
      {esPagoEnBs && (
        <>
          <input type="hidden" name="tasaCambio" value={TASA_BCV_FIJA} />
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-neutral-500">Tasa BCV (fija, prueba)</span>
              <span className="font-medium text-neutral-900">Bs. {TASA_BCV_FIJA}</span>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-neutral-500">Monto en bolívares</span>
              <span className="font-semibold text-neutral-900">
                {montoBs !== null ? `Bs. ${formatearBs(montoBs)}` : "—"}
              </span>
            </div>
          </div>
        </>
      )}

      {metodo === "pago_movil" && (
        <Input
          name="numeroOperacion"
          label="Número de operación (últimos 4 dígitos)"
          required
          maxLength={4}
          pattern="[0-9]{4}"
        />
      )}
```

- [ ] **Step 2: `actions.ts` — parsear y validar `numeroOperacion`**

En `registrarPagoAction`, después de `const tasaCambioRaw = ...`:

```typescript
  const numeroOperacion = formData.get("numeroOperacion")?.toString().trim() || null;

  if (metodo === "pago_movil" && !numeroOperacion) {
    return { error: "El número de operación es requerido para pagos móviles." };
  }
```

Y agregar `numeroOperacion,` dentro del objeto que se pasa a `registrarPago(...)`, junto a `metodo`.

- [ ] **Step 3: Commit**

```bash
git add "apps/web-admin/app/(panel)/pagos/FormularioPago.tsx" "apps/web-admin/app/(panel)/pagos/actions.ts"
git commit -m "feat: pide número de operación cuando el método de pago es Pago Móvil"
```

---

### Task 5: Número de operación en "Primer pago" (Nuevo Miembro)

**Files:**
- Modify: `apps/web-admin/app/(panel)/miembros/FormularioMiembro.tsx`
- Modify: `apps/web-admin/app/(panel)/miembros/actions.ts`

**Interfaces:**
- Consumes: `crearMiembro`/`registrarPago` con `numeroOperacion`.

- [ ] **Step 1: `FormularioMiembro.tsx` — estado nuevo**

Junto a `const [metodoPago, setMetodoPago] = useState("");`, agregar:

```tsx
  const [numeroOperacion, setNumeroOperacion] = useState("");
```

- [ ] **Step 2: Hidden input siempre montado dentro del `<form>`**

Junto a los otros hidden inputs de `!esEdicion`:

```tsx
        {!esEdicion && (
          <>
            <input type="hidden" name="metodo" value={metodoPago} />
            <input type="hidden" name="tasaCambio" value={tasaCambioActual} />
            <input type="hidden" name="numeroOperacion" value={metodoPago === "pago_movil" ? numeroOperacion : ""} />
          </>
        )}
```

- [ ] **Step 3: Campo visible en la tarjeta "Primer pago" del panel derecho**

Después del `<select>` de método de pago, antes del bloque de Bs:

```tsx
                {metodoPago === "pago_movil" && (
                  <Input
                    form={idFormulario}
                    label="Número de operación (últimos 4 dígitos)"
                    required
                    maxLength={4}
                    pattern="[0-9]{4}"
                    value={numeroOperacion}
                    onChange={(e) => setNumeroOperacion(e.target.value)}
                  />
                )}
```

- [ ] **Step 4: `actions.ts` (miembros) — parsear y pasar `numeroOperacion`**

En `crearMiembroAction`, junto a `const tasaCambioRaw = ...`:

```typescript
  const numeroOperacion = formData.get("numeroOperacion")?.toString().trim() || null;

  if (metodo === "pago_movil" && !numeroOperacion) {
    return { error: "El número de operación es requerido para pagos móviles." };
  }
```

Y agregar `numeroOperacion,` en el objeto que se pasa a `registrarPago(...)`.

- [ ] **Step 5: Commit**

```bash
git add "apps/web-admin/app/(panel)/miembros/FormularioMiembro.tsx" "apps/web-admin/app/(panel)/miembros/actions.ts"
git commit -m "feat: pide número de operación en el primer pago cuando es Pago Móvil"
```

---

### Task 6: Pantalla `/caja`

**Files:**
- Create: `apps/web-admin/app/(panel)/BotonImprimir.tsx`
- Create: `apps/web-admin/app/(panel)/caja/actions.ts`
- Create: `apps/web-admin/app/(panel)/caja/page.tsx`
- Modify: `apps/web-admin/app/(panel)/layout.tsx`

**Interfaces:**
- Consumes: `obtenerReporteCaja`, `cerrarCaja`, `PrismaCierreCajaRepository` (Tarea 3).
- Produces: `BotonImprimir` — reutilizado por la Tarea 7.

- [ ] **Step 1: `apps/web-admin/app/(panel)/BotonImprimir.tsx`**

```tsx
"use client";

import { Button } from "@gym-app/ui/components/Button";

export function BotonImprimir() {
  return (
    <Button type="button" variant="secundario" onClick={() => window.print()}>
      Imprimir
    </Button>
  );
}
```

- [ ] **Step 2: `apps/web-admin/app/(panel)/caja/actions.ts`**

```typescript
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaPagoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPagoRepository";
import { PrismaCierreCajaRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaCierreCajaRepository";
import { cerrarCaja, DiaYaCerradoError } from "@gym-app/domain/use-cases/CerrarCaja";

export async function cerrarCajaAction(formData: FormData): Promise<void> {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const fechaTexto = formData.get("fecha")?.toString();
  if (!fechaTexto) redirect("/caja");

  try {
    await cerrarCaja(
      { cierres: new PrismaCierreCajaRepository(prisma), pagos: new PrismaPagoRepository(prisma) },
      { organizacionId: usuario.organizacionId, fecha: new Date(`${fechaTexto}T00:00:00`) }
    );
  } catch (error) {
    if (!(error instanceof DiaYaCerradoError)) {
      throw error;
    }
    // Ya estaba cerrado (ej. doble clic) — no es un error real, seguimos.
  }

  revalidatePath("/caja");
  redirect(`/caja?fecha=${fechaTexto}&periodo=dia`);
}
```

- [ ] **Step 3: `apps/web-admin/app/(panel)/caja/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaPagoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPagoRepository";
import { PrismaCierreCajaRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaCierreCajaRepository";
import { obtenerReporteCaja } from "@gym-app/domain/use-cases/ObtenerReporteCaja";
import { Button } from "@gym-app/ui/components/Button";
import { METODOS_PAGO } from "../metodosPago";
import { BotonImprimir } from "../BotonImprimir";
import { cerrarCajaAction } from "./actions";

function formatearFechaISO(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

function inicioDelDia(fecha: Date): Date {
  const d = new Date(fecha);
  d.setHours(0, 0, 0, 0);
  return d;
}

function finDelDia(fecha: Date): Date {
  const d = new Date(fecha);
  d.setHours(23, 59, 59, 999);
  return d;
}

function inicioDeSemana(fecha: Date): Date {
  const d = inicioDelDia(fecha);
  const dia = d.getDay(); // 0 = domingo
  const diff = dia === 0 ? 6 : dia - 1; // semana empieza lunes
  d.setDate(d.getDate() - diff);
  return d;
}

function finDeSemana(fecha: Date): Date {
  const d = inicioDeSemana(fecha);
  d.setDate(d.getDate() + 6);
  return finDelDia(d);
}

function inicioDeMes(fecha: Date): Date {
  return new Date(fecha.getFullYear(), fecha.getMonth(), 1);
}

function finDeMes(fecha: Date): Date {
  return finDelDia(new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0));
}

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

  const { fecha: fechaTexto, periodo = "dia" } = await searchParams;
  const fechaBase = fechaTexto ? new Date(`${fechaTexto}T00:00:00`) : new Date();

  const { desde, hasta } =
    periodo === "semana"
      ? { desde: inicioDeSemana(fechaBase), hasta: finDeSemana(fechaBase) }
      : periodo === "mes"
        ? { desde: inicioDeMes(fechaBase), hasta: finDeMes(fechaBase) }
        : { desde: inicioDelDia(fechaBase), hasta: finDelDia(fechaBase) };

  const reporte = await obtenerReporteCaja(
    { pagos: new PrismaPagoRepository(prisma) },
    { organizacionId: usuario.organizacionId, desde, hasta }
  );

  const cierreDelDia =
    periodo === "dia"
      ? await new PrismaCierreCajaRepository(prisma).buscarPorFecha(usuario.organizacionId, inicioDelDia(fechaBase))
      : null;

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <h1 className="text-2xl font-semibold">Cierre de Caja</h1>
        <BotonImprimir />
      </div>

      <form method="get" className="mb-6 flex flex-wrap items-end gap-4 print:hidden">
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

      <p className="mb-4 text-sm text-neutral-500">
        {formatearFechaISO(desde)} — {formatearFechaISO(hasta)}
        {cierreDelDia && <span className="ml-2 font-medium text-green-700">✓ Día cerrado</span>}
      </p>

      <table className="mb-6 w-full border-collapse text-left">
        <thead>
          <tr className="border-b text-sm text-neutral-500">
            <th className="py-2">Fecha</th>
            <th className="py-2">Miembro</th>
            <th className="py-2">Tipo</th>
            <th className="py-2">Método</th>
            <th className="py-2">N° operación</th>
            <th className="py-2">Monto (USD)</th>
          </tr>
        </thead>
        <tbody>
          {reporte.filas.map((fila) => (
            <tr key={fila.pagoId} className="border-b">
              <td className="py-2">{new Date(fila.fechaPago).toLocaleDateString("es-VE")}</td>
              <td className="py-2">{fila.miembroNombre}</td>
              <td className="py-2">{fila.esAlta ? "Alta" : "Renovación"}</td>
              <td className="py-2">{nombreMetodo(fila.metodo)}</td>
              <td className="py-2">{fila.numeroOperacion ?? "—"}</td>
              <td className="py-2">${fila.monto.toFixed(2)}</td>
            </tr>
          ))}

          {reporte.filas.length === 0 && (
            <tr>
              <td colSpan={6} className="py-8 text-center text-neutral-500">
                Sin pagos en este período.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="mb-6 flex flex-col gap-1 rounded-xl border border-neutral-200 p-5 text-sm">
        {Object.entries(reporte.desglosePorMetodo).map(([metodo, monto]) => (
          <div key={metodo} className="flex justify-between">
            <span className="text-neutral-500">{nombreMetodo(metodo)}</span>
            <span className="font-medium text-neutral-900">${monto.toFixed(2)}</span>
          </div>
        ))}
        <div className="mt-2 flex justify-between border-t border-neutral-200 pt-2 text-base">
          <span className="font-semibold text-neutral-700">Total</span>
          <span className="font-bold text-neutral-900">${reporte.totalUSD.toFixed(2)}</span>
        </div>
      </div>

      {periodo === "dia" && !cierreDelDia && (
        <form action={cerrarCajaAction} className="print:hidden">
          <input type="hidden" name="fecha" value={formatearFechaISO(fechaBase)} />
          <Button type="submit">Cerrar caja de este día</Button>
        </form>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Agregar "Caja" al sidebar en `apps/web-admin/app/(panel)/layout.tsx`**

En el array de `items` de `<Sidebar>`, agregar `{ href: "/caja", label: "Caja" },` (por ejemplo entre "Pagos" y "Planes").

- [ ] **Step 5: Ocultar el sidebar al imprimir, en `packages/ui/components/Sidebar.tsx`**

Agregar `print:hidden` a la clase del `<nav>`:

```tsx
    <nav className="w-56 shrink-0 border-r border-neutral-200 bg-neutral-50 p-4 print:hidden">
```

- [ ] **Step 6: Commit**

```bash
git add "apps/web-admin/app/(panel)/BotonImprimir.tsx" "apps/web-admin/app/(panel)/caja" "apps/web-admin/app/(panel)/layout.tsx" packages/ui/components/Sidebar.tsx
git commit -m "feat: agrega la pantalla /caja (reporte día/semana/mes + cierre + imprimir)"
```

---

### Task 7: Filtros e impresión en `/miembros`

**Files:**
- Modify: `apps/web-admin/app/(panel)/miembros/page.tsx`

**Interfaces:**
- Consumes: `BotonImprimir` (Tarea 6).

- [ ] **Step 1: Reemplazo completo del archivo**

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaMemberRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMemberRepository";
import { listarMiembros } from "@gym-app/domain/use-cases/ListarMiembros";
import { Button } from "@gym-app/ui/components/Button";
import { EstadoToggle } from "./EstadoToggle";
import { BotonImprimir } from "../BotonImprimir";

interface Filtros {
  nombre?: string;
  inscritoDesde?: string;
  inscritoHasta?: string;
  venceDesde?: string;
  venceHasta?: string;
}

export default async function PaginaMiembros({ searchParams }: { searchParams: Promise<Filtros> }) {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const filtros = await searchParams;

  const todos = await listarMiembros({ miembros: new PrismaMemberRepository(prisma) }, usuario.organizacionId);

  const miembros = todos.filter((miembro) => {
    if (
      filtros.nombre &&
      !`${miembro.nombre} ${miembro.cedula}`.toLowerCase().includes(filtros.nombre.toLowerCase())
    ) {
      return false;
    }

    const inscripcion = miembro.fechaInscripcion ?? miembro.createdAt;
    if (filtros.inscritoDesde && inscripcion < new Date(`${filtros.inscritoDesde}T00:00:00`)) return false;
    if (filtros.inscritoHasta && inscripcion > new Date(`${filtros.inscritoHasta}T23:59:59`)) return false;

    if (filtros.venceDesde) {
      if (!miembro.fechaVencimiento || miembro.fechaVencimiento < new Date(`${filtros.venceDesde}T00:00:00`)) {
        return false;
      }
    }
    if (filtros.venceHasta) {
      if (!miembro.fechaVencimiento || miembro.fechaVencimiento > new Date(`${filtros.venceHasta}T23:59:59`)) {
        return false;
      }
    }

    return true;
  });

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <h1 className="text-2xl font-semibold">Miembros</h1>
        <div className="flex gap-2">
          <BotonImprimir />
          <Link href="/miembros/nuevo">
            <Button>Nuevo miembro</Button>
          </Link>
        </div>
      </div>

      <form method="get" className="mb-6 flex flex-wrap items-end gap-4 print:hidden">
        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          Nombre o cédula
          <input
            type="text"
            name="nombre"
            defaultValue={filtros.nombre}
            className="rounded border border-neutral-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          Inscrito desde
          <input
            type="date"
            name="inscritoDesde"
            defaultValue={filtros.inscritoDesde}
            className="rounded border border-neutral-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          Inscrito hasta
          <input
            type="date"
            name="inscritoHasta"
            defaultValue={filtros.inscritoHasta}
            className="rounded border border-neutral-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          Vence desde
          <input
            type="date"
            name="venceDesde"
            defaultValue={filtros.venceDesde}
            className="rounded border border-neutral-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          Vence hasta
          <input
            type="date"
            name="venceHasta"
            defaultValue={filtros.venceHasta}
            className="rounded border border-neutral-300 px-3 py-2"
          />
        </label>
        <Button type="submit">Filtrar</Button>
        <Link href="/miembros" className="text-sm text-neutral-500 hover:underline">
          Limpiar
        </Link>
      </form>

      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b text-sm text-neutral-500">
            <th className="py-2">Nombre</th>
            <th className="py-2">Cédula</th>
            <th className="py-2">Plan</th>
            <th className="py-2">Vence</th>
            <th className="py-2">Estado</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {miembros.map((miembro) => (
            <tr key={miembro.id} className="border-b">
              <td className="py-2">{miembro.nombre}</td>
              <td className="py-2">{miembro.cedula}</td>
              <td className="py-2">
                {miembro.planTipo === "CON_ENTRENADOR" ? "Con entrenador" : "Sin entrenador"}
              </td>
              <td className="py-2">
                {miembro.fechaVencimiento
                  ? new Date(miembro.fechaVencimiento).toLocaleDateString("es-VE")
                  : "—"}
              </td>
              <td className="py-2">
                <EstadoToggle id={miembro.id} activo={miembro.activo} />
              </td>
              <td className="py-2">
                <Link href={`/miembros/${miembro.id}`} className="text-sm font-medium text-blue-600 hover:underline">
                  Editar
                </Link>
              </td>
            </tr>
          ))}

          {miembros.length === 0 && (
            <tr>
              <td colSpan={6} className="py-8 text-center text-neutral-500">
                Ningún miembro coincide con los filtros.
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
git add "apps/web-admin/app/(panel)/miembros/page.tsx"
git commit -m "feat: agrega filtros (nombre, inscripción, vencimiento) e imprimir a /miembros"
```

---

### Task 8: Build + verificación de tipos (sin DB)

**Files:** ninguno — tarea de verificación.

- [ ] **Step 1: Verificar tipos**

Run: `cd apps/web-admin && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 2: Build**

Run: `cd /home/user/gym-app && npx turbo run build --filter=web-admin`
Expected: exit 0, con `/caja` y `/miembros` en las rutas listadas.

- [ ] **Step 3: Lint**

Run: `npx turbo run lint --filter=web-admin`
Expected: exit 0.

- [ ] **Step 4: No hay commit en esta tarea** — solo verificación.

---

### Task 9: Verificación del usuario contra la base real (requiere migración)

**Files:** ninguno — tarea de verificación.

- [ ] **Step 1: Aplicar la migración**

```bash
cd packages/db
npx prisma migrate dev
```

Expected: detecta y aplica `20260915120000_cierre_caja_y_numero_operacion`, regenera el cliente.

- [ ] **Step 2: Registrar un pago con Pago Móvil**

Desde `/pagos/nuevo` o desde la ficha de un miembro, elegir método "Pago Móvil". Expected: aparece el campo "Número de operación (últimos 4 dígitos)", obligatorio; si se deja vacío, el formulario no deja avanzar.

- [ ] **Step 3: Ver `/caja` del día de hoy**

Expected: aparece el pago recién registrado, marcado como "Renovación" (o "Alta" si era la primera vez que pagaba ese miembro), con el N° de operación visible, y el total al pie coincide.

- [ ] **Step 4: Cambiar a vista "Semana" y "Mes"**

Expected: la tabla se actualiza para mostrar todos los pagos del rango correspondiente, con el mismo total recalculado.

- [ ] **Step 5: Cerrar la caja del día**

Click en "Cerrar caja de este día". Expected: aparece "✓ Día cerrado" y el botón de cerrar desaparece. Volver a cargar la página del mismo día: debe seguir marcado como cerrado (no se puede cerrar dos veces).

- [ ] **Step 6: Probar los filtros de `/miembros`**

Filtrar por nombre, por rango de fecha de inscripción, y por rango de vencimiento (por separado y combinados). Expected: la tabla se reduce correctamente en cada caso; "Limpiar" vuelve a mostrar todos.

- [ ] **Step 7: Probar "Imprimir" en `/caja` y `/miembros`**

Expected: el diálogo de impresión del navegador muestra solo la tabla y los totales, sin sidebar ni formularios de filtro/acciones.

- [ ] **Step 8: No hay commit en esta tarea** — es solo verificación.

---

## Fuera de alcance de este plan (explícitamente diferido)

- Cierre de caja por Sucursal (hoy `Pago` no tiene noción de sucursal — sería un cambio de schema aparte).
- Restringir quién puede cerrar caja (matriz de permisos, todavía no existe en el proyecto).
- Bloquear el registro de pagos con fecha dentro de un día ya cerrado.
- Exportar el reporte de caja o de miembros a PDF/Excel real (por ahora solo impresión del navegador).
- Editar o anular un `CierreCaja` ya creado.
- Reflejar en `CierreCaja.desglose` el desglose "alta vs renovación" (queda solo en la vista, no en el snapshot guardado).

## Execution Handoff

Dos opciones de ejecución:

**1. Subagent-Driven (recomendado)** — un subagente fresco por tarea, revisión entre tareas.

**2. Inline Execution** — ejecuto las Tareas 1–8 yo mismo en esta sesión (no requieren la base de datos real, incluyendo la Tarea 1 que solo escribe schema/migración a mano), y la Tarea 9 la corres tú.

¿Cuál prefieres?
