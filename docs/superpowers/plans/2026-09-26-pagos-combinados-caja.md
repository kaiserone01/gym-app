# Pagos combinados en Caja Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extender el registro de pagos en Caja para soportar pago total, abono parcial, y pago combinado (múltiples métodos en una sola operación), con el conteo/arqueo de turno reaccionando en vivo mientras se captura el pago.

**Architecture:** `registrarPago` pasa a aceptar un array de `lineas` (una por método) en vez de un monto/método plano, generando N filas `Pago` correlacionadas por un nuevo `grupoPagoId` opcional cuando hay más de una línea. El wizard de Caja agrega un selector de modalidad (total/abono/combinado) en su Paso 3, con una lista de líneas editable para el caso combinado, y una proyección en vivo (cálculo puro en cliente) del resumen de turno mientras el usuario distribuye montos.

**Tech Stack:** TypeScript, Next.js App Router (Server Actions, `useActionState`), Prisma, Vitest (o el runner de test ya usado en `packages/domain`).

**Spec:** `docs/superpowers/specs/2026-09-26-pagos-combinados-caja-design.md`

## Global Constraints

- Todos los mensajes de UI, comentarios de código y commits van en español (ver CLAUDE.md del proyecto).
- Commits: una sola línea de resumen en español, sin cuerpo, sin firmas/trailers de IA.
- `registrarPago` sigue siendo la única fuente de verdad para decidir si un pago abre un ciclo nuevo o completa uno abierto (`esAbonoDeCicloAbierto`) — ningún caller debe duplicar esa lógica.
- `ObtenerResumenTurno`/`CerrarTurno` no se modifican: siguen agrupando por el string `metodo` de cada fila `Pago` persistida.
- `grupoPagoId` es opcional y solo se puebla cuando `lineas.length > 1` — un pago de una sola línea (el caso común hoy) no debe cambiar de comportamiento observable.

## Review Focus

- Un pago combinado donde la suma de líneas no coincide con el monto objetivo del formulario (el servidor debe rechazarlo, no solo la UI — un `FormData` manipulado podría saltarse la validación del cliente).
- Un pago combinado con una línea de monto `0` o negativo mezclada con líneas válidas (cada línea debe validarse individualmente, no solo la suma total).
- Un pago combinado donde dos líneas usan el mismo método/tasa en Bs — el conteo (`ObtenerResumenTurno`) debe sumar ambas al mismo `LineaResumenMetodo` sin perder ninguna, ya que ambas comparten el string `metodo`.
- Los tres llamadores existentes de `registrarPago` (server action de Caja/miembro, ruta API `/api/pagos`, y `miembros/actions.ts`) tras el cambio de firma — cada uno debe compilar y seguir devolviendo lo que sus consumidores esperan (`fechaFinCiclo`, el objeto `Pago` completo en la API).
- Un pago combinado que resulta en `esAbonoDeCicloAbierto = true` (la suma de líneas no alcanza el precio del plan) — debe seguir sumándose al ciclo abierto igual que un abono de una sola línea, y las N filas nuevas deben compartir `fechaFinCiclo` con las filas previas del mismo ciclo.

---

## Task 1: Migración de esquema — `Pago.grupoPagoId`

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (modelo `Pago`, alrededor de la línea 189-215)
- Create: migración generada por Prisma en `packages/db/prisma/migrations/`

**Interfaces:**
- Produces: columna `grupoPagoId String?` en la tabla `Pago`, disponible para el resto de las tareas vía el cliente Prisma regenerado.

- [ ] **Step 1: Agregar el campo al schema**

En `packages/db/prisma/schema.prisma`, dentro del modelo `Pago`, agregar después de `fechaFinCiclo`:

```prisma
  fechaInicioCiclo DateTime? // inicio real del ciclo que este pago activó/extendió — null en pagos previos a esta migración
  fechaFinCiclo    DateTime? // fin real de ese ciclo (mismo valor que pasa a ser Suscripcion.fin/Miembro.fechaVencimiento tras este pago)

  // Correlaciona las N filas Pago que se crean en un solo envío de "pago
  // combinado" (múltiples métodos en una misma operación de cobro). Null
  // en pagos de una sola línea (total o abono simple) — no cambia su
  // comportamiento. No reemplaza fechaFinCiclo como mecanismo de
  // agrupación por ciclo; es solo para mostrar/auditar "estas N filas
  // fueron un mismo cobro".
  grupoPagoId      String?

  anuladoEn       DateTime?
```

Agregar el índice al final del modelo, junto a otros `@@index` si existieran (si no hay ninguno, agregar antes del `}` de cierre):

```prisma
  @@index([grupoPagoId])
```

- [ ] **Step 2: Generar la migración**

Run: `cd packages/db && npx prisma migrate dev --name agrega_grupo_pago_id`
Expected: crea una carpeta nueva en `packages/db/prisma/migrations/` con un `ALTER TABLE "Pago" ADD COLUMN "grupoPagoId" TEXT;` y el índice; el comando termina sin error y regenera el cliente Prisma.

- [ ] **Step 3: Validar el schema**

Run: `cd packages/db && npx prisma validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 4: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations
git commit -m "feat: agrega grupoPagoId para correlacionar pagos combinados"
```

---

## Task 2: Dominio — `Pago.grupoPagoId` en entidad y repositorio

**Files:**
- Modify: `packages/domain/entities/Pago.ts`
- Modify: `packages/infrastructure/persistence/prisma/PrismaPagoRepository.ts`
- Test: `packages/domain/entities/Pago.test.ts` (crear si no existe; revisar convención de test runner con `Glob packages/domain/**/*.test.ts` antes de escribir)

**Interfaces:**
- Consumes: nada nuevo (extiende tipos existentes).
- Produces: `Pago.grupoPagoId: string | null`, `DatosNuevoPago.grupoPagoId: string | null` — Task 3 y 4 los usan para crear/leer filas correlacionadas.

- [ ] **Step 1: Escribir el test que falla (paridad de `pagosVigentesDelCiclo` con `grupoPagoId`)**

Crear/editar `packages/domain/entities/Pago.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { pagosVigentesDelCiclo, totalPagado, type Pago } from "./Pago";

function pagoBase(overrides: Partial<Pago>): Pago {
  return {
    id: "pago-1",
    miembroId: "miembro-1",
    sucursalId: "sucursal-1",
    turnoId: null,
    registradoPorId: "usuario-1",
    monto: 10,
    metodo: "Efectivo (USD)",
    metodoPagoId: null,
    numeroOperacion: null,
    tasaCambio: null,
    montoBs: null,
    fechaPago: new Date("2026-01-01"),
    fechaInicioCiclo: new Date("2026-01-01"),
    fechaFinCiclo: new Date("2026-02-01"),
    anuladoEn: null,
    anuladoPorId: null,
    motivoAnulacion: null,
    grupoPagoId: null,
    ...overrides,
  };
}

describe("pagosVigentesDelCiclo con pagos combinados", () => {
  it("incluye todas las líneas de un pago combinado (mismo grupoPagoId, mismo fechaFinCiclo)", () => {
    const finCiclo = new Date("2026-02-01");
    const linea1 = pagoBase({ id: "p1", monto: 15, metodo: "Efectivo (USD)", grupoPagoId: "grupo-1" });
    const linea2 = pagoBase({ id: "p2", monto: 15, metodo: "Punto de Venta", grupoPagoId: "grupo-1" });

    const vigentes = pagosVigentesDelCiclo([linea1, linea2], finCiclo);

    expect(vigentes).toHaveLength(2);
    expect(totalPagado(vigentes)).toBe(30);
  });
});
```

- [ ] **Step 2: Ejecutar el test para confirmar que falla**

Run: `npx vitest run packages/domain/entities/Pago.test.ts`
Expected: FAIL — `grupoPagoId` no existe en el tipo `Pago` (error de TypeScript) o el test falla al compilar.

- [ ] **Step 3: Agregar `grupoPagoId` a las interfaces**

En `packages/domain/entities/Pago.ts`:

```ts
export interface Pago {
  id: string;
  miembroId: string;
  miembroNombre?: string;
  miembroPrecioPlan?: number;
  sucursalId: string;
  turnoId: string | null;
  registradoPorId: string;
  registradoPorNombre?: string;
  monto: number;
  metodo: string;
  metodoPagoId: string | null;
  numeroOperacion: string | null;
  tasaCambio: number | null;
  montoBs: number | null;
  fechaPago: Date;
  fechaInicioCiclo: Date | null;
  fechaFinCiclo: Date | null;
  anuladoEn: Date | null;
  anuladoPorId: string | null;
  motivoAnulacion: string | null;
  // Correlaciona las N filas de un mismo pago combinado (ver
  // registrarPago) — null en pagos de una sola línea.
  grupoPagoId: string | null;
}

export interface DatosNuevoPago {
  miembroId: string;
  sucursalId: string;
  turnoId: string | null;
  registradoPorId: string;
  monto: number;
  metodo: string;
  metodoPagoId: string | null;
  numeroOperacion: string | null;
  tasaCambio: number | null;
  montoBs: number | null;
  fechaInicioCiclo: Date;
  fechaFinCiclo: Date;
  grupoPagoId: string | null;
}
```

(`pagosVigentesDelCiclo` y `totalPagado` no cambian — ya operan sobre `Pago[]` genérico.)

- [ ] **Step 4: Ejecutar el test para confirmar que pasa**

Run: `npx vitest run packages/domain/entities/Pago.test.ts`
Expected: PASS

- [ ] **Step 5: Actualizar `PrismaPagoRepository` para mapear y persistir `grupoPagoId`**

En `packages/infrastructure/persistence/prisma/PrismaPagoRepository.ts`, agregar el campo al tipo `FilaPago`:

```ts
type FilaPago = {
  id: string;
  miembroId: string;
  sucursalId: string;
  turnoId: string | null;
  registradoPorId: string;
  monto: { toNumber(): number };
  metodo: string;
  metodoPagoId: string | null;
  numeroOperacion: string | null;
  tasaCambio: { toNumber(): number } | null;
  montoBs: { toNumber(): number } | null;
  fechaPago: Date;
  fechaInicioCiclo: Date | null;
  fechaFinCiclo: Date | null;
  anuladoEn: Date | null;
  anuladoPorId: string | null;
  motivoAnulacion: string | null;
  grupoPagoId: string | null;
};
```

Agregar `grupoPagoId: pago.grupoPagoId,` dentro de `mapear()`, y `grupoPagoId: datos.grupoPagoId,` dentro del `data: {...}` de `crear()`:

```ts
function mapear(pago: FilaPago): Pago {
  return {
    id: pago.id,
    miembroId: pago.miembroId,
    sucursalId: pago.sucursalId,
    turnoId: pago.turnoId,
    registradoPorId: pago.registradoPorId,
    monto: pago.monto.toNumber(),
    metodo: pago.metodo,
    metodoPagoId: pago.metodoPagoId,
    numeroOperacion: pago.numeroOperacion,
    tasaCambio: pago.tasaCambio ? pago.tasaCambio.toNumber() : null,
    montoBs: pago.montoBs ? pago.montoBs.toNumber() : null,
    fechaPago: pago.fechaPago,
    fechaInicioCiclo: pago.fechaInicioCiclo,
    fechaFinCiclo: pago.fechaFinCiclo,
    anuladoEn: pago.anuladoEn,
    anuladoPorId: pago.anuladoPorId,
    motivoAnulacion: pago.motivoAnulacion,
    grupoPagoId: pago.grupoPagoId,
  };
}
```

```ts
  async crear(datos: DatosNuevoPago): Promise<Pago> {
    const pago = await this.prisma.pago.create({
      data: {
        miembroId: datos.miembroId,
        sucursalId: datos.sucursalId,
        turnoId: datos.turnoId,
        registradoPorId: datos.registradoPorId,
        monto: datos.monto,
        metodo: datos.metodo,
        metodoPagoId: datos.metodoPagoId,
        numeroOperacion: datos.numeroOperacion,
        tasaCambio: datos.tasaCambio,
        montoBs: datos.montoBs,
        fechaInicioCiclo: datos.fechaInicioCiclo,
        fechaFinCiclo: datos.fechaFinCiclo,
        grupoPagoId: datos.grupoPagoId,
      },
    });
    return mapear(pago);
  }
```

- [ ] **Step 6: Verificar compilación de TypeScript**

Run: `npx tsc --noEmit -p packages/infrastructure` (o el comando de type-check ya configurado en el repo, ej. `npm run typecheck` desde la raíz si existe — revisar `package.json` antes de asumir el comando exacto)
Expected: sin errores en `PrismaPagoRepository.ts` (otros archivos que aún no se tocaron, como `RegistrarPago.ts`, fallarán hasta la Task 3 — eso es esperado en este punto, no lo trates como regresión de esta tarea).

- [ ] **Step 7: Commit**

```bash
git add packages/domain/entities/Pago.ts packages/domain/entities/Pago.test.ts packages/infrastructure/persistence/prisma/PrismaPagoRepository.ts
git commit -m "feat: agrega grupoPagoId a la entidad y repositorio de pagos"
```

---

## Task 3: Dominio — `registrarPago` acepta múltiples líneas

**Files:**
- Modify: `packages/domain/use-cases/RegistrarPago.ts`
- Test: `packages/domain/use-cases/RegistrarPago.test.ts` (revisar si ya existe con `Glob packages/domain/use-cases/RegistrarPago.test.ts` — si existe, extenderlo siguiendo su patrón de fakes/mocks en vez de crear uno nuevo desde cero)

**Interfaces:**
- Consumes: `Pago`, `pagosVigentesDelCiclo`, `totalPagado` de `../entities/Pago` (Task 2); `IPagoRepository.crear(datos: DatosNuevoPago): Promise<Pago>` sin cambios de firma (se llama N veces).
- Produces:
  ```ts
  export interface DatosLineaPago {
    monto: number;
    metodo: string;
    metodoPagoId: string | null;
    numeroOperacion: string | null;
    tasaCambio: number | null;
  }

  export interface DatosRegistrarPago {
    organizacionId: string;
    miembroId: string;
    planId: string;
    lineas: DatosLineaPago[];
    sucursalId: string;
    registradoPorId: string;
    rolUsuario: RolUsuario;
  }

  export async function registrarPago(deps: RegistrarPagoDeps, input: DatosRegistrarPago): Promise<Pago[]>
  ```
  Task 4 (server action), la ruta API y `miembros/actions.ts` consumen esta firma nueva.

- [ ] **Step 1: Revisar si ya existe un test para `registrarPago`**

Run: `ls packages/domain/use-cases/RegistrarPago.test.ts` (o `Glob` si preferís la herramienta) para confirmar si existe y ver sus fakes de `RegistrarPagoDeps` antes de escribir el siguiente test — reusar esos fakes en vez de duplicarlos.

- [ ] **Step 2: Escribir el test que falla (pago combinado con 2 líneas)**

Agregar a `packages/domain/use-cases/RegistrarPago.test.ts` (ajustando los fakes al patrón que ya use el archivo si existe; si no existe, crear fakes mínimos como se muestra):

```ts
import { describe, it, expect, vi } from "vitest";
import { registrarPago, type RegistrarPagoDeps } from "./RegistrarPago";

function crearDepsFake(overrides: Partial<RegistrarPagoDeps> = {}): RegistrarPagoDeps {
  const pagosCreados: unknown[] = [];
  return {
    autorizacion: { tienePermiso: vi.fn().mockResolvedValue(true) },
    miembros: {
      buscarPorId: vi.fn().mockResolvedValue({
        id: "miembro-1",
        sucursalId: "sucursal-1",
        precioPlan: 30,
      }),
      actualizar: vi.fn().mockResolvedValue(undefined),
      actualizarFechasPago: vi.fn().mockResolvedValue(undefined),
    },
    planes: {
      buscarPorId: vi.fn().mockResolvedValue({ id: "plan-1", activo: true, frecuencia: "MENSUAL" }),
    },
    suscripciones: {
      buscarActivaVigentePorMiembroYPlan: vi.fn().mockResolvedValue(null),
      crear: vi.fn().mockResolvedValue({ id: "sus-1" }),
      extenderFin: vi.fn().mockResolvedValue(undefined),
    },
    turnos: {
      buscarAbiertoPorSucursal: vi.fn().mockResolvedValue({ id: "turno-1" }),
    },
    sucursales: {
      buscarPorId: vi.fn().mockResolvedValue({ id: "sucursal-1", nombre: "Principal" }),
    },
    pagos: {
      crear: vi.fn().mockImplementation(async (datos) => {
        const pago = { id: `pago-${pagosCreados.length + 1}`, ...datos, fechaPago: new Date(), anuladoEn: null, anuladoPorId: null, motivoAnulacion: null };
        pagosCreados.push(pago);
        return pago;
      }),
      listarPorMiembro: vi.fn().mockResolvedValue([]),
    },
    ...overrides,
  } as unknown as RegistrarPagoDeps;
}

describe("registrarPago con múltiples líneas (pago combinado)", () => {
  it("crea una fila Pago por línea, todas con el mismo grupoPagoId y fechaFinCiclo", async () => {
    const deps = crearDepsFake();

    const pagos = await registrarPago(deps, {
      organizacionId: "org-1",
      miembroId: "miembro-1",
      planId: "plan-1",
      sucursalId: "sucursal-1",
      registradoPorId: "usuario-1",
      rolUsuario: "ADMIN",
      lineas: [
        { monto: 15, metodo: "Efectivo (USD)", metodoPagoId: "mp-1", numeroOperacion: null, tasaCambio: null },
        { monto: 15, metodo: "Punto de Venta", metodoPagoId: "mp-2", numeroOperacion: "123", tasaCambio: null },
      ],
    });

    expect(pagos).toHaveLength(2);
    expect(pagos[0].grupoPagoId).not.toBeNull();
    expect(pagos[0].grupoPagoId).toBe(pagos[1].grupoPagoId);
    expect(pagos[0].fechaFinCiclo).toEqual(pagos[1].fechaFinCiclo);
    expect(pagos.reduce((suma, p) => suma + p.monto, 0)).toBe(30);
  });

  it("no genera grupoPagoId para un pago de una sola línea", async () => {
    const deps = crearDepsFake();

    const pagos = await registrarPago(deps, {
      organizacionId: "org-1",
      miembroId: "miembro-1",
      planId: "plan-1",
      sucursalId: "sucursal-1",
      registradoPorId: "usuario-1",
      rolUsuario: "ADMIN",
      lineas: [{ monto: 30, metodo: "Efectivo (USD)", metodoPagoId: "mp-1", numeroOperacion: null, tasaCambio: null }],
    });

    expect(pagos).toHaveLength(1);
    expect(pagos[0].grupoPagoId).toBeNull();
  });

  it("usa la suma de las líneas para decidir si el pago es un abono del ciclo abierto", async () => {
    const finCicloActual = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const deps = crearDepsFake({
      suscripciones: {
        buscarActivaVigentePorMiembroYPlan: vi.fn().mockResolvedValue({ id: "sus-1", inicio: new Date(), fin: finCicloActual }),
        crear: vi.fn(),
        extenderFin: vi.fn(),
      } as never,
      pagos: {
        crear: vi.fn().mockImplementation(async (datos) => ({ id: "pago-x", ...datos, fechaPago: new Date(), anuladoEn: null, anuladoPorId: null, motivoAnulacion: null })),
        listarPorMiembro: vi.fn().mockResolvedValue([
          {
            id: "pago-previo",
            miembroId: "miembro-1",
            sucursalId: "sucursal-1",
            turnoId: null,
            registradoPorId: "usuario-1",
            monto: 10,
            metodo: "Efectivo (USD)",
            metodoPagoId: "mp-1",
            numeroOperacion: null,
            tasaCambio: null,
            montoBs: null,
            fechaPago: new Date(),
            fechaInicioCiclo: new Date(),
            fechaFinCiclo: finCicloActual,
            anuladoEn: null,
            anuladoPorId: null,
            motivoAnulacion: null,
            grupoPagoId: null,
          },
        ]),
      } as never,
    });

    // precioPlan=30, ya hay $10 pagados del ciclo abierto; esta línea combinada suma $20 más -> completa el plan
    const pagos = await registrarPago(deps, {
      organizacionId: "org-1",
      miembroId: "miembro-1",
      planId: "plan-1",
      sucursalId: "sucursal-1",
      registradoPorId: "usuario-1",
      rolUsuario: "ADMIN",
      lineas: [
        { monto: 10, metodo: "Efectivo (USD)", metodoPagoId: "mp-1", numeroOperacion: null, tasaCambio: null },
        { monto: 10, metodo: "Punto de Venta", metodoPagoId: "mp-2", numeroOperacion: null, tasaCambio: null },
      ],
    });

    // Debe seguir siendo el MISMO ciclo (fechaFinCiclo sin cambios) porque
    // era un abono del ciclo abierto, no una renovación nueva.
    expect(pagos[0].fechaFinCiclo).toEqual(finCicloActual);
    expect(deps.suscripciones.extenderFin).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Ejecutar los tests para confirmar que fallan**

Run: `npx vitest run packages/domain/use-cases/RegistrarPago.test.ts`
Expected: FAIL — `input.lineas` no existe en el tipo actual de `DatosRegistrarPago`, o `input.monto`/`input.metodo` son requeridos y no se están pasando.

- [ ] **Step 4: Reescribir `RegistrarPago.ts` para aceptar `lineas`**

Reemplazar el contenido completo de `packages/domain/use-cases/RegistrarPago.ts`:

```ts
import { randomUUID } from "node:crypto";
import { IPagoRepository } from "../ports/IPagoRepository";
import { ISuscripcionRepository } from "../ports/ISuscripcionRepository";
import { IMemberRepository } from "../ports/IMemberRepository";
import { IPlanRepository } from "../ports/IPlanRepository";
import { ITurnoRepository } from "../ports/ITurnoRepository";
import { ISucursalRepository } from "../ports/ISucursalRepository";
import { Pago, pagosVigentesDelCiclo, totalPagado } from "../entities/Pago";
import { RolUsuario } from "../entities/UsuarioAdmin";
import { IAuthorizationService } from "../ports/IAuthorizationService";
import { DURACION_DIAS_POR_FRECUENCIA } from "../entities/Plan";
import { MiembroFueraDeSucursalError } from "./ObtenerMiembro";

export { MiembroFueraDeSucursalError };

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

// Un monto en $0 (o negativo) contra un plan que SÍ cuesta algo no es un
// abono válido — sin este chequeo, un $0 tipeado por error (ej. campo
// vaciado sin querer) igual adelantaba el vencimiento y daba acceso
// gratis. Un plan de cortesía real (miembro.precioPlan === 0) sigue
// pudiendo registrar su pago en $0 sin problema.
export class MontoInvalidoError extends Error {
  constructor() {
    super("El monto tiene que ser mayor a $0 — este plan no es de cortesía.");
  }
}

// Un pago combinado sin líneas, o con alguna línea en $0/negativo, no tiene
// forma de saber a qué método imputar cada monto — se rechaza acá, no solo
// en la UI, porque un FormData armado a mano podría saltarse la validación
// del cliente.
export class LineasDePagoInvalidasError extends Error {
  constructor() {
    super("Cada línea del pago combinado necesita un monto mayor a $0 y un método.");
  }
}

export interface RegistrarPagoDeps {
  pagos: IPagoRepository;
  suscripciones: ISuscripcionRepository;
  miembros: IMemberRepository;
  planes: IPlanRepository;
  turnos: ITurnoRepository;
  sucursales: ISucursalRepository;
  autorizacion: IAuthorizationService;
}

export interface DatosLineaPago {
  monto: number;
  metodo: string;
  metodoPagoId: string | null;
  numeroOperacion: string | null;
  tasaCambio: number | null;
}

export interface DatosRegistrarPago {
  organizacionId: string;
  miembroId: string;
  planId: string;
  // Una línea por método — un pago total o un abono simple siguen siendo
  // un array de un solo elemento. Un pago combinado (varios métodos en un
  // mismo cobro) trae 2+ líneas; ver diseño en
  // docs/superpowers/specs/2026-09-26-pagos-combinados-caja-design.md.
  lineas: DatosLineaPago[];
  sucursalId: string;
  registradoPorId: string;
  rolUsuario: RolUsuario;
}

export async function registrarPago(deps: RegistrarPagoDeps, input: DatosRegistrarPago): Promise<Pago[]> {
  if (!(await deps.autorizacion.tienePermiso(input.registradoPorId, "PAGOS", "CREAR"))) {
    throw new RolNoAutorizadoError();
  }

  if (input.lineas.length === 0 || input.lineas.some((linea) => linea.monto <= 0 || !linea.metodo)) {
    // Excepción: una sola línea en $0 sigue siendo válida para planes de
    // cortesía (precioPlan === 0) — se valida más abajo contra
    // miembro.precioPlan, no acá.
    if (!(input.lineas.length === 1 && input.lineas[0].monto <= 0)) {
      throw new LineasDePagoInvalidasError();
    }
  }

  const miembro = await deps.miembros.buscarPorId(input.organizacionId, input.miembroId);
  if (!miembro) {
    throw new MiembroNoEncontradoError();
  }

  if (miembro.sucursalId !== null && miembro.sucursalId !== input.sucursalId) {
    const sucursal = await deps.sucursales.buscarPorId(input.organizacionId, miembro.sucursalId);
    throw new MiembroFueraDeSucursalError(sucursal?.nombre ?? "otra sucursal");
  }

  const montoTotal = input.lineas.reduce((suma, linea) => suma + linea.monto, 0);

  if (miembro.precioPlan > 0 && montoTotal <= 0) {
    throw new MontoInvalidoError();
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

  // Pagos fraccionados/mixtos ("abonos"): un ciclo puede juntar varios
  // Pago (distinto método/moneda cada uno) hasta llegar al precio
  // acordado con el miembro. El acceso ya se habilita con el primer
  // abono (el vencimiento se adelanta ahí abajo, como siempre) — lo único
  // que cambia es que, mientras el ciclo vigente no esté saldado, un pago
  // nuevo se suma al MISMO ciclo en vez de abrir uno adicional (ver
  // diseño acordado con el usuario, roadmap punto d). Un pago combinado
  // (2+ líneas en un mismo envío) se evalúa igual: la suma de sus líneas
  // es el "monto" a los efectos de esta decisión.
  let pagosDelCicloAbierto: Pago[] = [];
  if (activa && activa.fin > ahora) {
    const pagosDelMiembro = await deps.pagos.listarPorMiembro(input.miembroId);
    pagosDelCicloAbierto = pagosVigentesDelCiclo(pagosDelMiembro, activa.fin);
  }
  const esAbonoDeCicloAbierto =
    pagosDelCicloAbierto.length > 0 && totalPagado(pagosDelCicloAbierto) < miembro.precioPlan;

  let base: Date;
  let fin: Date;

  if (esAbonoDeCicloAbierto) {
    fin = activa!.fin;
    base = pagosDelCicloAbierto[0].fechaInicioCiclo ?? activa!.inicio;
  } else {
    base = activa && activa.fin > ahora ? activa.fin : ahora;
    fin = new Date(base);
    fin.setDate(fin.getDate() + DURACION_DIAS_POR_FRECUENCIA[plan.frecuencia]);

    if (activa) {
      await deps.suscripciones.extenderFin(activa.id, fin);
    } else {
      await deps.suscripciones.crear({ miembroId: input.miembroId, planId: input.planId, inicio: ahora, fin });
    }

    await deps.miembros.actualizar(input.organizacionId, input.miembroId, { planId: input.planId });
    await deps.miembros.actualizarFechasPago(input.miembroId, ahora, fin);
  }

  const turnoAbierto = await deps.turnos.buscarAbiertoPorSucursal(input.sucursalId);

  // grupoPagoId solo se genera para pagos combinados (2+ líneas) — un pago
  // de una sola línea no necesita correlacionarse con nada.
  const grupoPagoId = input.lineas.length > 1 ? randomUUID() : null;

  const pagosCreados: Pago[] = [];
  for (const linea of input.lineas) {
    const pago = await deps.pagos.crear({
      miembroId: input.miembroId,
      sucursalId: input.sucursalId,
      turnoId: turnoAbierto?.id ?? null,
      registradoPorId: input.registradoPorId,
      monto: linea.monto,
      metodo: linea.metodo,
      metodoPagoId: linea.metodoPagoId,
      numeroOperacion: linea.numeroOperacion,
      tasaCambio: linea.tasaCambio,
      montoBs: linea.tasaCambio !== null ? linea.monto * linea.tasaCambio : null,
      fechaInicioCiclo: base,
      fechaFinCiclo: fin,
      grupoPagoId,
    });
    pagosCreados.push(pago);
  }

  return pagosCreados;
}
```

Nota: la validación combinada de "líneas inválidas" arriba deliberadamente permite el caso preexistente de un pago de $0 en un plan de cortesía (una sola línea con `monto <= 0`) — ese caso ya lo cubre después el chequeo de `miembro.precioPlan > 0 && montoTotal <= 0`. Si `input.lineas.length === 1 && input.lineas[0].monto <= 0`, no se lanza `LineasDePagoInvalidasError` acá; el flujo sigue y `MontoInvalidoError` (o nada, si el plan es de cortesía) se decide más abajo como ya ocurría antes de esta tarea.

- [ ] **Step 5: Ejecutar los tests para confirmar que pasan**

Run: `npx vitest run packages/domain/use-cases/RegistrarPago.test.ts`
Expected: PASS (incluye los tests preexistentes del archivo, si los había — revisá que ninguno haya quedado con la firma vieja `monto/metodo` sin migrar a `lineas: [{...}]`; si alguno rompe por eso, actualizalo a la nueva forma).

- [ ] **Step 6: Commit**

```bash
git add packages/domain/use-cases/RegistrarPago.ts packages/domain/use-cases/RegistrarPago.test.ts
git commit -m "feat: registrarPago acepta multiples lineas para pagos combinados"
```

---

## Task 4: Actualizar los 3 llamadores existentes de `registrarPago`

**Files:**
- Modify: `apps/web-admin/app/(panel)/pagos/actions.ts` (función `registrarPagoAction`)
- Modify: `apps/web-admin/app/api/pagos/route.ts`
- Modify: `apps/web-admin/app/(panel)/miembros/actions.ts`

**Interfaces:**
- Consumes: `registrarPago(deps, input: DatosRegistrarPago): Promise<Pago[]>` (Task 3), `DatosLineaPago`.
- Produces: `registrarPagoAction` acepta un campo `FormData` nuevo llamado `lineas` (JSON serializado) en vez de `monto/metodo/metodoPagoId/numeroOperacion/tasaCambio` planos — Task 6 (UI del wizard) es quien arma ese JSON.

- [ ] **Step 1: Actualizar `registrarPagoAction` para parsear `lineas` como JSON**

En `apps/web-admin/app/(panel)/pagos/actions.ts`, reemplazar el cuerpo de `registrarPagoAction` (líneas 88-175 del archivo original):

```ts
export async function registrarPagoAction(
  _estadoPrevio: EstadoFormularioPago,
  formData: FormData
): Promise<EstadoFormularioPago> {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario, sucursalActivaId } = sesion;

  const miembroId = formData.get("miembroId")?.toString();
  const planId = formData.get("planId")?.toString();
  const lineasRaw = formData.get("lineas")?.toString();
  const origen = formData.get("origen")?.toString();
  // Sede elegida en el selector "Sede del pago" (ver SelectorMetodoPago);
  // si no vino (formularios viejos o sin selector visible), se cae a la
  // sede activa de la sesión.
  const sucursalIdPago = formData.get("sucursalIdPago")?.toString() || sucursalActivaId;

  if (!miembroId || !planId || !lineasRaw) {
    return { error: "Miembro, plan y al menos un método de pago son requeridos." };
  }
  if (!sucursalIdPago) {
    return { error: "No se pudo determinar en qué sucursal se registra el pago." };
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
  if (!Array.isArray(lineas) || lineas.length === 0) {
    return { error: "Agregá al menos una línea de pago." };
  }
  // Un plan de cortesía ($0) no tiene nada que cobrar — el método de pago
  // solo es obligatorio cuando hay un monto real de por medio (ver diseño
  // acordado, membresías con beneficio que no pagan en el gym). Se permite
  // la única excepción de una sola línea en $0 (pago de cortesía); toda
  // otra línea necesita monto > 0 y método elegido.
  const esCortesia = lineas.length === 1 && lineas[0].monto === 0;
  if (!esCortesia && lineas.some((linea) => linea.monto <= 0 || !linea.metodo || !linea.metodoPagoId)) {
    return { error: "Cada línea del pago necesita un monto mayor a $0 y un método." };
  }

  // La tasa BCV se valida por línea que opere en Bs — cada línea puede
  // usar un método distinto, así que cada una se revalida por separado
  // contra el servidor (Etapa 3 del plan de tasa BCV, no se confía en la
  // tasa que mandó el formulario).
  const lineasValidadas: Array<{
    monto: number;
    metodo: string;
    metodoPagoId: string | null;
    numeroOperacion: string | null;
    tasaCambio: number | null;
  }> = [];
  for (const linea of lineas) {
    const validacionTasa = await validarTasaSiEsEnBs(linea.tasaCambio !== null ? String(linea.tasaCambio) : undefined);
    if (!validacionTasa.ok) return validacionTasa.estado;
    lineasValidadas.push({ ...linea, tasaCambio: validacionTasa.tasaCambio });
  }

  let pagos;
  try {
    pagos = await registrarPago(
      {
        pagos: new PrismaPagoRepository(prisma),
        suscripciones: new PrismaSuscripcionRepository(prisma),
        miembros: new PrismaMemberRepository(prisma),
        planes: new PrismaPlanRepository(prisma),
        turnos: new PrismaTurnoRepository(prisma),
        sucursales: new PrismaSucursalRepository(prisma),
        autorizacion: new AuthorizationService(new PrismaPermisoRepository(prisma)),
      },
      {
        organizacionId: usuario.organizacionId,
        miembroId,
        planId,
        lineas: lineasValidadas.map((linea) => ({ ...linea, metodo: linea.metodo || "Cortesía" })),
        sucursalId: sucursalIdPago,
        registradoPorId: usuario.id,
        rolUsuario: usuario.rol,
      }
    );
  } catch (error) {
    if (
      error instanceof MiembroNoEncontradoError ||
      error instanceof MiembroFueraDeSucursalError ||
      error instanceof PlanNoEncontradoError ||
      error instanceof PlanInactivoError ||
      error instanceof RolNoAutorizadoError ||
      error instanceof MontoInvalidoError ||
      error instanceof LineasDePagoInvalidasError
    ) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/pagos");
  revalidatePath(`/miembros/${miembroId}`);
  revalidatePath(`/miembros/${miembroId}/pagos`);
  revalidatePath("/caja");

  if (origen !== "miembro" && origen !== "caja") {
    redirect(conMensajeOk(`/miembros/${miembroId}`, "Pago registrado."));
  }

  // Todas las líneas de un mismo envío comparten fechaFinCiclo — cualquiera
  // sirve para mostrarla en el Paso 4 del wizard.
  return { ok: "Pago registrado.", fechaFinCiclo: pagos[0]?.fechaFinCiclo?.toISOString() };
}
```

Agregar `LineasDePagoInvalidasError` al import existente de `@gym-app/domain/use-cases/RegistrarPago` en la parte superior del archivo:

```ts
import {
  registrarPago,
  MiembroNoEncontradoError,
  MiembroFueraDeSucursalError,
  PlanNoEncontradoError,
  PlanInactivoError,
  RolNoAutorizadoError,
  MontoInvalidoError,
  LineasDePagoInvalidasError,
} from "@gym-app/domain/use-cases/RegistrarPago";
```

- [ ] **Step 2: Actualizar la ruta API `/api/pagos`**

En `apps/web-admin/app/api/pagos/route.ts`, reemplazar el bloque de validación y la llamada a `registrarPago` (líneas ~65-108 del archivo original):

```ts
    if (!body.miembroId || !body.planId || body.monto === undefined || !body.metodo) {
      return NextResponse.json(
        { error: "miembroId, planId, monto y metodo son requeridos." },
        { status: 400 }
      );
    }

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

    // Esta ruta API sigue siendo de una sola línea (no soporta pago
    // combinado desde afuera todavía) — se envuelve el monto/método plano
    // en un array de una sola línea para calzar con la nueva firma de
    // registrarPago.
    const pagos = await registrarPago(
      {
        pagos: new PrismaPagoRepository(prisma),
        suscripciones: new PrismaSuscripcionRepository(prisma),
        miembros: new PrismaMemberRepository(prisma),
        planes: new PrismaPlanRepository(prisma),
        turnos: new PrismaTurnoRepository(prisma),
        sucursales: new PrismaSucursalRepository(prisma),
        autorizacion: new AuthorizationService(new PrismaPermisoRepository(prisma)),
      },
      {
        organizacionId: usuario.organizacionId,
        miembroId: body.miembroId,
        planId: body.planId,
        lineas: [
          {
            monto: body.monto,
            metodo: body.metodo,
            metodoPagoId: body.metodoPagoId ?? null,
            numeroOperacion: body.numeroOperacion ?? null,
            tasaCambio: body.tasaCambio ?? null,
          },
        ],
        sucursalId: sucursalActivaId,
        registradoPorId: usuario.id,
        rolUsuario: usuario.rol,
      }
    );

    return NextResponse.json(pagos[0], { status: 201 });
  } catch (error) {
```

- [ ] **Step 3: Actualizar `miembros/actions.ts`**

En `apps/web-admin/app/(panel)/miembros/actions.ts`, alrededor de la línea 154, envolver el pago inicial del miembro nuevo en `lineas`:

```ts
  try {
    await registrarPago(
      {
        pagos: new PrismaPagoRepository(prisma),
        suscripciones: new PrismaSuscripcionRepository(prisma),
        miembros: new PrismaMemberRepository(prisma),
        planes: new PrismaPlanRepository(prisma),
        turnos: new PrismaTurnoRepository(prisma),
        sucursales: new PrismaSucursalRepository(prisma),
        autorizacion: new AuthorizationService(new PrismaPermisoRepository(prisma)),
      },
      {
        organizacionId: usuario.organizacionId,
        miembroId: miembro.id,
        planId,
        lineas: [
          {
            monto: precioPlan,
            metodo: metodo || "Cortesía",
            metodoPagoId,
            numeroOperacion,
            tasaCambio: validacionTasa.tasaCambio,
          },
        ],
        sucursalId: sucursalIdPago,
        registradoPorId: usuario.id,
        rolUsuario: usuario.rol,
      }
    );
```

(Mantener el resto de la función sin cambios — solo se envuelve el objeto plano en `lineas: [{...}]`; revisar con `Read` los nombres exactos de las variables `metodoPagoId`, `numeroOperacion`, `validacionTasa` ya presentes más arriba en esa función antes de aplicar el cambio, por si difieren levemente del fragmento mostrado acá.)

- [ ] **Step 4: Verificar compilación**

Run: `npx tsc --noEmit` (desde la raíz del monorepo, o el script de typecheck que use el proyecto — confirmar con `cat package.json` si hay un script `typecheck`/`build` más apropiado)
Expected: sin errores de tipos en los 3 archivos tocados ni en `RegistrarPago.ts`.

- [ ] **Step 5: Ejecutar toda la suite de dominio para descartar regresiones**

Run: `npx vitest run packages/domain`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web-admin/app/(panel)/pagos/actions.ts apps/web-admin/app/api/pagos/route.ts apps/web-admin/app/(panel)/miembros/actions.ts
git commit -m "feat: adapta los llamadores de registrarPago a multiples lineas"
```

---

## Task 5: Proyección en vivo del resumen de turno (`proyeccionArqueo.ts`)

**Files:**
- Create: `apps/web-admin/app/(panel)/caja/proyeccionArqueo.ts`
- Test: `apps/web-admin/app/(panel)/caja/proyeccionArqueo.test.ts`

**Interfaces:**
- Consumes: `LineaResumenMetodo` (forma `{ metodo: string; enBs: boolean; montoEsperado: number }`, ya expuesta por `@gym-app/domain/use-cases/ObtenerResumenTurno`).
- Produces:
  ```ts
  export interface LineaEnProgreso {
    metodo: string;
    monto: number;
    enBs: boolean;
  }

  export interface LineaProyectada {
    metodo: string;
    enBs: boolean;
    actual: number;
    proyectado: number;
  }

  export function proyectarResumenTurno(
    lineasActuales: Array<{ metodo: string; enBs: boolean; montoEsperado: number }>,
    lineasEnProgreso: LineaEnProgreso[]
  ): LineaProyectada[]
  ```
  Task 6 (wizard) la consume para mostrar el delta por método mientras se editan las líneas del pago combinado.

- [ ] **Step 1: Escribir el test que falla**

Crear `apps/web-admin/app/(panel)/caja/proyeccionArqueo.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { proyectarResumenTurno } from "./proyeccionArqueo";

describe("proyectarResumenTurno", () => {
  it("suma el monto en progreso al método que ya tenía movimiento", () => {
    const resultado = proyectarResumenTurno(
      [
        { metodo: "Efectivo (USD)", enBs: false, montoEsperado: 50 },
        { metodo: "Punto de Venta", enBs: false, montoEsperado: 0 },
      ],
      [{ metodo: "Efectivo (USD)", monto: 20, enBs: false }]
    );

    const efectivo = resultado.find((l) => l.metodo === "Efectivo (USD)");
    expect(efectivo?.actual).toBe(50);
    expect(efectivo?.proyectado).toBe(70);

    const puntoVenta = resultado.find((l) => l.metodo === "Punto de Venta");
    expect(puntoVenta?.actual).toBe(0);
    expect(puntoVenta?.proyectado).toBe(0);
  });

  it("agrega una línea nueva para un método sin movimiento previo en el turno", () => {
    const resultado = proyectarResumenTurno(
      [{ metodo: "Efectivo (USD)", enBs: false, montoEsperado: 50 }],
      [{ metodo: "Biopago", monto: 15, enBs: false }]
    );

    const biopago = resultado.find((l) => l.metodo === "Biopago");
    expect(biopago).toBeDefined();
    expect(biopago?.actual).toBe(0);
    expect(biopago?.proyectado).toBe(15);
  });

  it("suma varias líneas en progreso del mismo método (dos líneas combinadas con igual método)", () => {
    const resultado = proyectarResumenTurno(
      [{ metodo: "Efectivo (USD)", enBs: false, montoEsperado: 0 }],
      [
        { metodo: "Efectivo (USD)", monto: 10, enBs: false },
        { metodo: "Efectivo (USD)", monto: 5, enBs: false },
      ]
    );

    const efectivo = resultado.find((l) => l.metodo === "Efectivo (USD)");
    expect(efectivo?.proyectado).toBe(15);
  });
});
```

- [ ] **Step 2: Ejecutar el test para confirmar que falla**

Run: `npx vitest run apps/web-admin/app/\(panel\)/caja/proyeccionArqueo.test.ts`
Expected: FAIL — el módulo `proyeccionArqueo.ts` no existe todavía.

- [ ] **Step 3: Implementar `proyeccionArqueo.ts`**

```ts
// Proyección puramente de cliente: mientras el usuario distribuye montos
// entre métodos en el Paso 3 del wizard de Caja (modalidad "pago
// combinado"), esta función calcula cómo quedaría el resumen del turno SIN
// persistir nada — el resumen real se recalcula recién cuando el pago se
// confirma y ObtenerResumenTurno vuelve a correr sobre filas Pago
// guardadas. Ver diseño en
// docs/superpowers/specs/2026-09-26-pagos-combinados-caja-design.md.

export interface LineaEnProgreso {
  metodo: string;
  monto: number;
  enBs: boolean;
}

export interface LineaProyectada {
  metodo: string;
  enBs: boolean;
  actual: number;
  proyectado: number;
}

export function proyectarResumenTurno(
  lineasActuales: Array<{ metodo: string; enBs: boolean; montoEsperado: number }>,
  lineasEnProgreso: LineaEnProgreso[]
): LineaProyectada[] {
  const metodos = new Set<string>([
    ...lineasActuales.map((l) => l.metodo),
    ...lineasEnProgreso.map((l) => l.metodo),
  ]);

  return [...metodos].map((metodo) => {
    const lineaActual = lineasActuales.find((l) => l.metodo === metodo);
    const enBs = lineaActual?.enBs ?? lineasEnProgreso.find((l) => l.metodo === metodo)?.enBs ?? false;
    const actual = lineaActual?.montoEsperado ?? 0;
    const sumaEnProgreso = lineasEnProgreso
      .filter((l) => l.metodo === metodo)
      .reduce((suma, l) => suma + l.monto, 0);

    return { metodo, enBs, actual, proyectado: actual + sumaEnProgreso };
  });
}
```

- [ ] **Step 4: Ejecutar el test para confirmar que pasa**

Run: `npx vitest run apps/web-admin/app/\(panel\)/caja/proyeccionArqueo.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web-admin/app/\(panel\)/caja/proyeccionArqueo.ts apps/web-admin/app/\(panel\)/caja/proyeccionArqueo.test.ts
git commit -m "feat: agrega proyeccion en vivo del resumen de turno"
```

---

## Task 6: Wizard — selector de modalidad y líneas múltiples en Paso 3

**Files:**
- Modify: `apps/web-admin/app/(panel)/caja/ModalRegistrarPagoCaja.tsx` (función `ContenidoPaso3`, líneas 214-313 del archivo original)
- Modify: `apps/web-admin/app/(panel)/caja/BotonRegistrarPagoCaja.tsx`
- Modify: `apps/web-admin/app/(panel)/caja/page.tsx` (paso de `resumen.lineas` hacia el botón/modal)

**Interfaces:**
- Consumes: `registrarPagoAction` (Task 4, espera `FormData` con `miembroId`, `planId`, `origen`, `sucursalIdPago?`, y `lineas` JSON); `SelectorMetodoPago` (`apps/web-admin/app/(panel)/pagos/SelectorMetodoPago.tsx`, sin cambios de contrato); `proyectarResumenTurno` (Task 5); `LineaResumenMetodo` de `@gym-app/domain/use-cases/ObtenerResumenTurno`.
- Produces: `ModalRegistrarPagoCaja` gana una prop nueva `lineasResumenTurno: Array<{ metodo: string; enBs: boolean; montoEsperado: number }>`, que `BotonRegistrarPagoCaja` y `page.tsx` deben propagar.

- [ ] **Step 1: Propagar `lineasResumenTurno` desde `page.tsx` hasta el botón**

En `apps/web-admin/app/(panel)/caja/BotonRegistrarPagoCaja.tsx`, agregar la prop:

```tsx
"use client";

import { useState } from "react";
import type { Miembro } from "@gym-app/domain/entities/Miembro";
import type { MetodoPago } from "@gym-app/domain/entities/MetodoPago";
import type { LineaResumenMetodo } from "@gym-app/domain/use-cases/ObtenerResumenTurno";
import { Button } from "@gym-app/ui/components/Button";
import { ModalRegistrarPagoCaja } from "./ModalRegistrarPagoCaja";
import type { PlanParaModal } from "./SelectorMiembroModal";

export function BotonRegistrarPagoCaja({
  miembros,
  planes,
  metodosPago,
  tasaActual,
  lineasResumenTurno,
}: {
  miembros: Miembro[];
  planes: PlanParaModal[];
  metodosPago: MetodoPago[];
  tasaActual: number | null;
  lineasResumenTurno: LineaResumenMetodo[];
}) {
  const [modalAbierta, setModalAbierta] = useState(false);

  return (
    <>
      <Button onClick={() => setModalAbierta(true)}>Registrar pago</Button>
      {modalAbierta && (
        <ModalRegistrarPagoCaja
          miembros={miembros}
          planes={planes}
          metodosPago={metodosPago}
          tasaActual={tasaActual}
          lineasResumenTurno={lineasResumenTurno}
          onCerrar={() => setModalAbierta(false)}
        />
      )}
    </>
  );
}
```

En `apps/web-admin/app/(panel)/caja/page.tsx`, pasar `resumen.lineas` en el uso de `<BotonRegistrarPagoCaja>` (alrededor de la línea 135):

```tsx
                <BotonRegistrarPagoCaja
                  miembros={miembrosActivos}
                  planes={planesActivos}
                  metodosPago={metodosPago}
                  tasaActual={tasaActual}
                  lineasResumenTurno={resumen.lineas}
                />
```

- [ ] **Step 2: Reescribir `ContenidoPaso3` con selector de modalidad y líneas múltiples**

En `apps/web-admin/app/(panel)/caja/ModalRegistrarPagoCaja.tsx`, agregar el import de `proyectarResumenTurno` y `LineaResumenMetodo` junto a los imports existentes:

```tsx
import { proyectarResumenTurno } from "./proyeccionArqueo";
import type { LineaResumenMetodo } from "@gym-app/domain/use-cases/ObtenerResumenTurno";
```

Reemplazar la función `ContenidoPaso3` completa (líneas 214-313 del archivo original) por:

```tsx
type Modalidad = "total" | "abono" | "combinado";

interface LineaFormulario {
  clave: string;
  monto: string;
  seleccion: { metodoPagoId: string | null; metodo: string; tasaCambio: number | null; numeroOperacion: string };
}

function nuevaLineaVacia(): LineaFormulario {
  return {
    clave: crypto.randomUUID(),
    monto: "",
    seleccion: { metodoPagoId: null, metodo: "", tasaCambio: null, numeroOperacion: "" },
  };
}

function ContenidoPaso3({
  miembroId,
  planId,
  monto: montoSugerido,
  metodosPago,
  lineasResumenTurno,
  onVolver,
  onPagoRegistrado,
}: {
  miembroId: string;
  planId: string;
  // Precio de lista del plan — punto de partida del monto objetivo, que
  // queda editable para poder registrar un abono parcial (pagos
  // fraccionados/mixtos, ver diseño acordado). Acá no se conoce el saldo
  // pendiente real del miembro (ese cálculo vive en su ficha) — quien
  // cobra tiene que saber cuánto pedir si es un abono, no el precio completo.
  monto: number;
  metodosPago: MetodoPago[];
  lineasResumenTurno: LineaResumenMetodo[];
  onVolver: () => void;
  onPagoRegistrado: (fechaFinCicloISO: string | undefined) => void;
}) {
  const [estado, enviar, enviando] = useActionState(registrarPagoAction, {});
  const { mostrarExito, mostrarError } = useFeedback();

  const [modalidad, setModalidad] = useState<Modalidad>(montoSugerido > 0 ? "total" : "total");
  const [montoObjetivoTexto, setMontoObjetivoTexto] = useState(String(montoSugerido));
  const montoObjetivo = Number(montoObjetivoTexto) || 0;

  // Total y abono usan una sola línea; combinado usa el array completo.
  const [lineaUnica, setLineaUnica] = useState<LineaFormulario>(nuevaLineaVacia());
  const [lineasCombinadas, setLineasCombinadas] = useState<LineaFormulario[]>([nuevaLineaVacia(), nuevaLineaVacia()]);

  const lineasActivas = modalidad === "combinado" ? lineasCombinadas : [lineaUnica];
  const sumaLineas = lineasActivas.reduce((suma, l) => suma + (Number(l.monto) || 0), 0);
  const sumaCoincide = modalidad !== "combinado" || Math.abs(sumaLineas - montoObjetivo) < 0.01;

  useEffect(() => {
    if (estado.error) mostrarError(estado.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe reaccionar a un nuevo estado.error, no a mostrarError
  }, [estado.error]);

  useEffect(() => {
    if (!estado.ok) return;
    mostrarExito(estado.ok);
    const temporizador = setTimeout(() => onPagoRegistrado(estado.fechaFinCiclo), DURACION_MS);
    return () => clearTimeout(temporizador);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe reaccionar a un nuevo estado.ok, no a las funciones
  }, [estado.ok]);

  const lineasParaEnviar = lineasActivas
    .filter((l) => Number(l.monto) > 0)
    .map((l) => ({
      monto: Number(l.monto),
      metodo: l.seleccion.metodo,
      metodoPagoId: l.seleccion.metodoPagoId,
      numeroOperacion: l.seleccion.numeroOperacion || null,
      tasaCambio: l.seleccion.tasaCambio,
    }));

  const lineasEnProgreso = lineasActivas
    .filter((l) => Number(l.monto) > 0 && l.seleccion.metodo)
    .map((l) => ({ metodo: l.seleccion.metodo, monto: Number(l.monto), enBs: l.seleccion.tasaCambio !== null }));

  const proyeccion = proyectarResumenTurno(lineasResumenTurno, lineasEnProgreso);
  const proyeccionConMovimiento = proyeccion.filter((l) => l.proyectado !== l.actual);

  const puedeEnviar =
    montoObjetivo === 0 ||
    (sumaCoincide && lineasParaEnviar.length > 0 && lineasParaEnviar.every((l) => l.metodoPagoId));

  return (
    <form action={enviar} className="flex flex-col gap-4 text-base">
      <input type="hidden" name="miembroId" value={miembroId} />
      <input type="hidden" name="planId" value={planId} />
      <input type="hidden" name="origen" value="caja" />
      <input
        type="hidden"
        name="lineas"
        value={JSON.stringify(montoObjetivo === 0 ? [{ monto: 0, metodo: "Cortesía", metodoPagoId: null, numeroOperacion: null, tasaCambio: null }] : lineasParaEnviar)}
      />

      {montoSugerido > 0 && (
        <div className="flex gap-2">
          {(
            [
              { valor: "total" as const, etiqueta: "Pago total" },
              { valor: "abono" as const, etiqueta: "Abono parcial" },
              { valor: "combinado" as const, etiqueta: "Pago combinado" },
            ]
          ).map((opcion) => (
            <button
              key={opcion.valor}
              type="button"
              onClick={() => {
                setModalidad(opcion.valor);
                if (opcion.valor === "total") setMontoObjetivoTexto(String(montoSugerido));
              }}
              className="min-h-11 flex-1 rounded-lg border px-3 text-sm font-medium transition-colors duration-150"
              style={
                modalidad === opcion.valor
                  ? { borderColor: "var(--gx-accent)", background: "var(--gx-accent)", color: "var(--gx-accent-ink)" }
                  : { borderColor: "var(--gx-edge)", color: "var(--gx-ink)" }
              }
            >
              {opcion.etiqueta}
            </button>
          ))}
        </div>
      )}

      {montoSugerido > 0 && (
        <CurrencyInput
          name="montoObjetivo"
          label={modalidad === "combinado" ? "Total a pagar" : "Monto a cobrar"}
          moneda="USD"
          required
          value={montoObjetivoTexto}
          onChange={setMontoObjetivoTexto}
        />
      )}
      {montoSugerido > 0 && montoObjetivo > 0 && montoObjetivo < montoSugerido && (
        <p className="text-sm" style={{ color: "var(--gx-muted)" }}>
          Es menos que el precio del plan (${montoSugerido.toFixed(2)}) — queda como abono, se puede completar
          después desde la ficha del miembro.
        </p>
      )}

      {montoObjetivo > 0 && modalidad !== "combinado" && (
        <SelectorMetodoPago
          metodos={metodosPago}
          monto={montoObjetivo}
          onCambio={(seleccion) => setLineaUnica((prev) => ({ ...prev, monto: String(montoObjetivo), seleccion }))}
          grande
          avisoServidor={{ tasaNueva: estado.tasaNueva, fallaTemporal: estado.fallaTemporal, tasaGuardada: estado.tasaGuardada }}
        />
      )}

      {montoObjetivo > 0 && modalidad === "combinado" && (
        <div className="flex flex-col gap-4">
          {lineasCombinadas.map((linea, indice) => (
            <div key={linea.clave} className="flex flex-col gap-2 rounded-lg border p-3" style={{ borderColor: "var(--gx-edge)" }}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium" style={{ color: "var(--gx-muted)" }}>
                  Línea {indice + 1}
                </span>
                {lineasCombinadas.length > 2 && (
                  <button
                    type="button"
                    onClick={() => setLineasCombinadas((prev) => prev.filter((_, i) => i !== indice))}
                    className="text-sm"
                    style={{ color: "var(--gx-bad)" }}
                  >
                    Quitar
                  </button>
                )}
              </div>
              <CurrencyInput
                name={`monto-linea-${indice}`}
                label="Monto de esta línea"
                moneda="USD"
                value={linea.monto}
                onChange={(valor) =>
                  setLineasCombinadas((prev) => prev.map((l, i) => (i === indice ? { ...l, monto: valor } : l)))
                }
              />
              <SelectorMetodoPago
                metodos={metodosPago}
                monto={Number(linea.monto) || 0}
                onCambio={(seleccion) =>
                  setLineasCombinadas((prev) => prev.map((l, i) => (i === indice ? { ...l, seleccion } : l)))
                }
              />
            </div>
          ))}
          <button
            type="button"
            onClick={() => setLineasCombinadas((prev) => [...prev, nuevaLineaVacia()])}
            className="min-h-11 rounded-lg border px-3 text-sm font-medium"
            style={{ borderColor: "var(--gx-edge)", color: "var(--gx-ink)" }}
          >
            + Agregar línea
          </button>
          <div
            className="flex justify-between rounded-lg px-3 py-2 text-sm"
            style={{ background: sumaCoincide ? "var(--gx-surface-2)" : "var(--gx-bad)" }}
          >
            <span>Total ingresado</span>
            <span className="font-semibold">
              ${sumaLineas.toFixed(2)} / ${montoObjetivo.toFixed(2)}
            </span>
          </div>
        </div>
      )}

      {montoObjetivo === 0 && (
        <p className="text-sm" style={{ color: "var(--gx-muted)" }}>
          Este plan no tiene costo — no hace falta elegir método de pago.
        </p>
      )}

      {proyeccionConMovimiento.length > 0 && (
        <div className="rounded-lg border p-3 text-sm" style={{ borderColor: "var(--gx-edge)" }}>
          <p className="mb-2 font-medium" style={{ color: "var(--gx-muted)" }}>
            Así quedaría el resumen del turno
          </p>
          {proyeccionConMovimiento.map((linea) => (
            <div key={linea.metodo} className="flex justify-between">
              <span style={{ color: "var(--gx-muted)" }}>{linea.metodo}</span>
              <span style={{ color: "var(--gx-ink)" }}>
                {linea.enBs ? `Bs. ${linea.actual.toFixed(2)}` : `$${linea.actual.toFixed(2)}`} →{" "}
                {linea.enBs ? `Bs. ${linea.proyectado.toFixed(2)}` : `$${linea.proyectado.toFixed(2)}`}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-2 flex gap-3">
        <Button
          type="button"
          variant="secundario"
          className="min-h-12 flex-1 text-base"
          onClick={onVolver}
          disabled={enviando}
        >
          Volver
        </Button>
        <Button type="submit" className="min-h-12 flex-1 text-base" disabled={enviando || !puedeEnviar}>
          {enviando ? "Registrando..." : "Registrar pago"}
        </Button>
      </div>
    </form>
  );
}
```

Actualizar el uso de `<ContenidoPaso3>` dentro de `ModalRegistrarPagoCaja` (alrededor de la línea 472-486 del archivo original) para pasar la prop nueva:

```tsx
        {paso === 3 && miembroElegido && planElegidoId && (
          <ContenidoPaso3
            miembroId={miembroElegido.id}
            planId={planElegidoId}
            monto={
              (miembroElegido.plan ?? planes.find((p) => p.id === planElegidoId))?.precioUSD ?? 0
            }
            metodosPago={metodosPago}
            lineasResumenTurno={lineasResumenTurno}
            onVolver={() => setPaso(2)}
            onPagoRegistrado={(fechaFinCicloISO) => {
              setFechaFinCicloFinal(fechaFinCicloISO ? new Date(fechaFinCicloISO) : null);
              setPaso(4);
            }}
          />
        )}
```

Y agregar `lineasResumenTurno` a las props del componente `ModalRegistrarPagoCaja` (alrededor de la línea 363-375 del archivo original):

```tsx
export function ModalRegistrarPagoCaja({
  miembros,
  planes,
  metodosPago,
  tasaActual,
  lineasResumenTurno,
  onCerrar,
}: {
  miembros: Miembro[];
  planes: PlanParaModal[];
  metodosPago: MetodoPago[];
  tasaActual: number | null;
  lineasResumenTurno: LineaResumenMetodo[];
  onCerrar: () => void;
}) {
```

- [ ] **Step 3: Verificar compilación de TypeScript**

Run: `npx tsc --noEmit` (o el script de typecheck del monorepo)
Expected: sin errores en `ModalRegistrarPagoCaja.tsx`, `BotonRegistrarPagoCaja.tsx`, `page.tsx`.

- [ ] **Step 4: Prueba manual — pago total**

Levantar el entorno de desarrollo (`npm run dev` o el script equivalente — confirmar con `package.json`), entrar a `/caja` con un turno abierto, registrar un pago total para un miembro con plan pago. Verificar: modalidad "Pago total" preseleccionada, monto fijo al precio del plan, un solo selector de método, el pago se registra y el Paso 4 muestra la fecha de vencimiento correcta.

- [ ] **Step 5: Prueba manual — abono parcial**

En la misma pantalla, elegir modalidad "Abono parcial", bajar el monto por debajo del precio del plan, un solo método. Verificar el mensaje "queda como abono" y que el pago se registra sin extender la suscripción (repetir el pago para el mismo miembro y confirmar que el segundo pago se suma al mismo ciclo, no abre uno nuevo).

- [ ] **Step 6: Prueba manual — pago combinado**

Elegir modalidad "Pago combinado", dejar el total en el precio del plan, completar 2 líneas con métodos distintos (ej. Efectivo + Punto de Venta) cuya suma sea igual al total. Verificar: el botón "Registrar pago" permanece deshabilitado si la suma no coincide, la proyección del resumen de turno se actualiza en vivo mientras se edita cada línea, y tras confirmar, la sección "Resumen por método" de `/caja` (ya recargada) muestra ambos métodos con sus montos correctos.

- [ ] **Step 7: Commit**

```bash
git add apps/web-admin/app/\(panel\)/caja/ModalRegistrarPagoCaja.tsx apps/web-admin/app/\(panel\)/caja/BotonRegistrarPagoCaja.tsx apps/web-admin/app/\(panel\)/caja/page.tsx
git commit -m "feat: agrega modalidad de pago total, abono y combinado al wizard de caja"
```

---

## Task 7: Test de integración — `obtenerResumenTurno` con pago combinado

**Files:**
- Test: `packages/domain/use-cases/ObtenerResumenTurno.test.ts` (revisar si ya existe con `Glob packages/domain/use-cases/ObtenerResumenTurno.test.ts` antes de escribir; extender sus fakes existentes en vez de duplicar)

**Interfaces:**
- Consumes: `obtenerResumenTurno(deps, input): Promise<ResumenTurno>` sin cambios de firma; `Pago` con `grupoPagoId` (Task 2).

- [ ] **Step 1: Escribir el test que falla**

Agregar a `packages/domain/use-cases/ObtenerResumenTurno.test.ts` (adaptar a los fakes existentes del archivo si ya hay alguno para `ITurnoRepository`/`IPagoRepository`/`IEgresoRepository`):

```ts
import { describe, it, expect, vi } from "vitest";
import { obtenerResumenTurno } from "./ObtenerResumenTurno";
import type { Pago } from "../entities/Pago";

function pagoDeGrupo(overrides: Partial<Pago>): Pago {
  return {
    id: "pago-x",
    miembroId: "miembro-1",
    sucursalId: "sucursal-1",
    turnoId: "turno-1",
    registradoPorId: "usuario-1",
    monto: 15,
    metodo: "Efectivo (USD)",
    metodoPagoId: "mp-1",
    numeroOperacion: null,
    tasaCambio: null,
    montoBs: null,
    fechaPago: new Date(),
    fechaInicioCiclo: new Date(),
    fechaFinCiclo: new Date("2026-02-01"),
    anuladoEn: null,
    anuladoPorId: null,
    motivoAnulacion: null,
    grupoPagoId: "grupo-1",
    ...overrides,
  };
}

describe("obtenerResumenTurno con un pago combinado", () => {
  it("suma cada línea del pago combinado a la línea de su propio método", async () => {
    const linea1 = pagoDeGrupo({ id: "p1", monto: 15, metodo: "Efectivo (USD)" });
    const linea2 = pagoDeGrupo({ id: "p2", monto: 15, metodo: "Punto de Venta" });

    const deps = {
      turnos: {
        buscarPorId: vi.fn().mockResolvedValue({
          id: "turno-1",
          fondoInicialEfectivoUSD: 0,
          fondoInicialEfectivoBs: 0,
        }),
      },
      pagos: { listarPorTurno: vi.fn().mockResolvedValue([linea1, linea2]) },
      egresos: { listarPorTurno: vi.fn().mockResolvedValue([]) },
    } as never;

    const resumen = await obtenerResumenTurno(deps, { organizacionId: "org-1", turnoId: "turno-1" });

    const efectivo = resumen.lineas.find((l) => l.metodo === "Efectivo (USD)");
    const puntoVenta = resumen.lineas.find((l) => l.metodo === "Punto de Venta");
    expect(efectivo?.montoEsperado).toBe(15);
    expect(puntoVenta?.montoEsperado).toBe(15);
  });
});
```

- [ ] **Step 2: Ejecutar el test para confirmar que falla o pasa**

Run: `npx vitest run packages/domain/use-cases/ObtenerResumenTurno.test.ts`
Expected: PASS de inmediato — `obtenerResumenTurno` no necesita cambios de código porque ya agrupa por el string `metodo` (ver diseño). Este test es de regresión, no de una funcionalidad nueva: confirma que la Task 2/3 no rompió este comportamiento. Si falla, es indicio de que `grupoPagoId` interfiere con algo en `ObtenerResumenTurno.ts` — investigar antes de continuar (no debería requerir cambios en ese archivo).

- [ ] **Step 3: Commit**

```bash
git add packages/domain/use-cases/ObtenerResumenTurno.test.ts
git commit -m "test: confirma que el resumen de turno agrupa bien un pago combinado"
```

---

## Verificación final end-to-end

- [ ] Ejecutar toda la suite: `npx vitest run`
- [ ] `cd packages/db && npx prisma validate`
- [ ] Prueba manual completa en `/caja`: pago total, abono parcial, y pago combinado (2 métodos) para el mismo miembro en la misma sesión de turno; confirmar Paso 4 y que el arqueo final (`FormularioArqueo`) muestra cada método por separado con el monto correcto.
