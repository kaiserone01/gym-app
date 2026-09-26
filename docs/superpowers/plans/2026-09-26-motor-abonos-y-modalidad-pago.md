# Motor de reglas de abono + modalidad en Paso 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mover el selector de modalidad de pago (total/abono/combinado) al Paso 2 del wizard de Caja, bloquear el monto en modalidad total, y agregar un motor de reglas de abono (mínimo aceptable y plazo de acceso) configurable por frecuencia y por plan, que bloquea el acceso físico en el kiosco cuando el plazo vence sin completar el pago.

**Architecture:** Funciones puras de resolución de reglas en el dominio (`ReglaAbono.ts`), integradas en `RegistrarPago.ts` para calcular y persistir `Suscripcion.fechaLimiteAbono`; ese campo se propaga hasta `ValidarAccesoSucursalPorPlan.ts`/`RegistrarCheckIn.ts` para un nuevo estado de kiosco `"abono_vencido"`. El panel de configuración gana una pestaña `/configuraciones/reglas-abono` (4 filas fijas, una por frecuencia) y el formulario de Plan gana campos opcionales que sobreescriben la regla de su frecuencia. El wizard de Caja se reordena: la modalidad se decide en el Paso 2 y el Paso 3 solo ejecuta lo ya elegido.

**Tech Stack:** TypeScript, Next.js App Router (Server Actions, `useActionState`), Prisma, sin test runner (convención del proyecto — verificación vía `tsc --noEmit`/`next build` y trazas manuales documentadas en cada tarea).

**Spec:** `docs/superpowers/specs/2026-09-26-motor-abonos-y-modalidad-pago-design.md`

## Global Constraints

- Sin test runner en este repo (confirmado, deliberado) — nunca crear archivos `.test.ts`; verificar con `npx tsc --noEmit -p apps/web-admin` (o el paquete que corresponda) y trazas manuales documentadas en el reporte de cada tarea.
- Commits: una sola línea de resumen en español, sin cuerpo, sin firmas/trailers de IA (CLAUDE.md del proyecto).
- Todo texto NUEVO de cara al usuario (kiosco o panel) usa español neutro/venezolano, **sin voseo argentino** — memoria del proyecto `espanol-sin-voseo.md`. Ejemplos: "completa tu pago" (no "completá"), "acércate" (no "acercate" en su forma voseante). No hace falta corregir texto existente que ya tenga voseo salvo que se toque esa línea por otra razón.
- El pago combinado NUNCA se restringe por plan — `permitePagoParcial` solo afecta la modalidad "Abono".
- El plan individual gana siempre sobre la regla de su frecuencia cuando ambos definen un mínimo de abono (`Plan.minimoAbonoTipo`/`minimoAbonoValor` no nulos → se usan esos; si no, se hereda de `ReglaAbonoPorFrecuencia`).
- `Suscripcion.fechaLimiteAbono` se limpia (`null`) en cuanto el monto acumulado del ciclo alcanza o supera `miembro.precioPlan`, sin importar si eso ocurre antes o después de que el plazo ya hubiera vencido — el acceso se reactiva de inmediato al completar el pago.
- `ValidarAccesoSucursalPorPlan.ts` sigue siendo la única fuente de verdad para decidir el `EstadoCheckIn` — ningún otro archivo debe duplicar esa lógica de decisión.

## Review Focus

- Un abono cuyo monto es exactamente igual al mínimo calculado (límite inclusive/exclusive) — debe aceptarse, no rechazarse por un error de comparación `<` vs `<=`.
- Un plan con `minimoAbonoTipo = null` cuya frecuencia tampoco tiene `ReglaAbonoPorFrecuencia.activo = true` — el abono debe comportarse exactamente como hoy (sin mínimo más allá de $0.01, sin plazo), no lanzar un error ni bloquear nada por la ausencia de regla.
- Un miembro cuyo `fechaLimiteAbono` ya venció, que hace check-in en el kiosco, y en la MISMA sesión de caja alguien registra el pago que completa su ciclo — el siguiente check-in debe mostrar `"activo"` de inmediato, no seguir mostrando `"abono_vencido"` por datos obsoletos.
- Un plan con `permitePagoParcial = false` al que, pese a la UI bloqueando la opción, llega un intento de abono directo al servidor (FormData manipulado) — debe rechazarse con `AbonoNoPermitidoError`, no solo bloquearse visualmente.
- El cálculo bidireccional días↔porcentaje en la UI de `/configuraciones/reglas-abono` con un ciclo DIARIO (1 solo día) — `porcentajeADias`/`diasAPorcentaje` no deben producir `NaN`/`Infinity` ni permitir configurar un mínimo mayor a los días totales del ciclo.

---

## Task 1: Migración de esquema — campos de `Plan`, tabla `ReglaAbonoPorFrecuencia`, campo en `Suscripcion`

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: migración en `packages/db/prisma/migrations/`

**Interfaces:**
- Produces: columnas `Plan.permitePagoParcial`, `Plan.minimoAbonoTipo`, `Plan.minimoAbonoValor`; tabla `ReglaAbonoPorFrecuencia`; columna `Suscripcion.fechaLimiteAbono` — disponibles para las tareas de dominio/infraestructura siguientes.

- [ ] **Step 1: Agregar los campos a `Plan`**

En `packages/db/prisma/schema.prisma`, dentro del modelo `Plan`, agregar después de `multisede`:

```prisma
  multisede         Boolean        @default(false)
  activo            Boolean        @default(true)

  // Si este plan admite la modalidad de pago "Abono parcial". El pago
  // combinado (múltiples métodos en un solo cobro) NUNCA se restringe por
  // este campo — es universal para cualquier plan.
  permitePagoParcial Boolean  @default(true)
  // Mínimo de abono propio de este plan — sobreescribe la regla de su
  // frecuencia (ReglaAbonoPorFrecuencia) cuando ambos están definidos.
  // null = este plan no define un mínimo propio, hereda el de su
  // frecuencia (si esa regla está activa).
  minimoAbonoTipo    String?  // "DIAS" | "PORCENTAJE"
  minimoAbonoValor   Decimal? @db.Decimal(10, 2) // días si tipo=DIAS, 0-100 si tipo=PORCENTAJE
```

- [ ] **Step 2: Agregar el modelo `ReglaAbonoPorFrecuencia`**

Agregar como modelo nuevo, cerca de `TemaOrganizacion`:

```prisma
// Regla de abono por defecto para todos los planes de una frecuencia —
// un Plan individual puede sobreescribirla definiendo su propio
// minimoAbonoTipo/minimoAbonoValor (ver Plan). Una fila por cada una de
// las 4 frecuencias, por organización.
model ReglaAbonoPorFrecuencia {
  id               String         @id @default(cuid())
  organizacionId   String
  organizacion     Organizacion   @relation(fields: [organizacionId], references: [id])
  frecuencia       FrecuenciaPago
  // Si esta regla aplica — una frecuencia sin activar se comporta como si
  // no existiera (abono sin mínimo ni plazo, salvo que el plan mismo
  // defina su propio mínimo).
  activo           Boolean        @default(false)
  minimoAbonoTipo  String         // "DIAS" | "PORCENTAJE"
  minimoAbonoValor Decimal        @db.Decimal(10, 2)

  @@unique([organizacionId, frecuencia])
}
```

Agregar la relación inversa en `Organizacion`:

```prisma
model Organizacion {
  // ... campos existentes ...
  reglasAbono ReglaAbonoPorFrecuencia[]
}
```

- [ ] **Step 3: Agregar el campo a `Suscripcion`**

```prisma
model Suscripcion {
  id        String            @id @default(cuid())
  miembroId String
  miembro   Miembro           @relation(fields: [miembroId], references: [id])
  planId    String
  plan      Plan              @relation(fields: [planId], references: [id])
  inicio    DateTime
  fin       DateTime
  // Fecha límite de acceso que otorga el monto abonado hasta ahora en
  // este ciclo — null si el ciclo está saldado al 100%, si el pago fue
  // total, o si ninguna regla de abono aplica. Ver
  // packages/domain/entities/ReglaAbono.ts.
  fechaLimiteAbono DateTime?
  estado    EstadoSuscripcion @default(ACTIVA)
  createdAt DateTime          @default(now())
}
```

- [ ] **Step 4: Generar la migración**

No hay conexión a base de datos disponible en este entorno de implementación (confirmar con `ls ../../.env` desde `packages/db` — si existe y hay red, usar el Step 4a; si no, usar el Step 4b).

**Step 4a (con DB disponible):** `cd packages/db && npx prisma migrate dev --name agrega_reglas_abono`

**Step 4b (sin DB disponible):** escribir a mano la carpeta de migración
`packages/db/prisma/migrations/<timestamp>_agrega_reglas_abono/migration.sql`
(timestamp posterior al de la migración más reciente existente — revisar
`ls packages/db/prisma/migrations/` para no colisionar), con:

```sql
-- AlterTable
ALTER TABLE "Plan" ADD COLUMN "permitePagoParcial" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Plan" ADD COLUMN "minimoAbonoTipo" TEXT;
ALTER TABLE "Plan" ADD COLUMN "minimoAbonoValor" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "Suscripcion" ADD COLUMN "fechaLimiteAbono" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ReglaAbonoPorFrecuencia" (
    "id" TEXT NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "frecuencia" "FrecuenciaPago" NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT false,
    "minimoAbonoTipo" TEXT NOT NULL,
    "minimoAbonoValor" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "ReglaAbonoPorFrecuencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReglaAbonoPorFrecuencia_organizacionId_frecuencia_key" ON "ReglaAbonoPorFrecuencia"("organizacionId", "frecuencia");

-- AddForeignKey
ALTER TABLE "ReglaAbonoPorFrecuencia" ADD CONSTRAINT "ReglaAbonoPorFrecuencia_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

(Ajustar el nombre del enum `"FrecuenciaPago"` exactamente como aparece en el schema si difiere — revisar `enum FrecuenciaPago` en `schema.prisma` antes de escribir el SQL.)

Luego, sin importar 4a o 4b: `cd packages/db && npx prisma generate` (esto SÍ funciona sin conexión a base de datos, solo regenera el cliente TypeScript a partir del schema).

- [ ] **Step 5: Validar el schema**

Run: `cd packages/db && npx prisma validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 6: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations
git commit -m "feat: agrega esquema del motor de reglas de abono"
```

---

## Task 2: Entidades de dominio — `ReglaAbono.ts` (funciones puras del motor de reglas)

**Files:**
- Create: `packages/domain/entities/ReglaAbono.ts`
- Modify: `packages/domain/entities/Plan.ts` (agregar campos nuevos a las interfaces)
- Modify: `packages/domain/entities/Suscripcion.ts` (agregar `fechaLimiteAbono`)

**Interfaces:**
- Consumes: nada (funciones puras, sin dependencias externas).
- Produces:
  ```ts
  export type TipoMinimoAbono = "DIAS" | "PORCENTAJE";
  export interface ReglaAbonoEfectiva { tipo: TipoMinimoAbono; valor: number; origen: "plan" | "frecuencia"; }
  export function resolverReglaAbono(plan, reglaFrecuencia): ReglaAbonoEfectiva | null
  export function diasAPorcentaje(dias: number, diasDelCiclo: number): number
  export function porcentajeADias(porcentaje: number, diasDelCiclo: number): number
  export function calcularMontoMinimoAbono(regla, precioPlan, diasDelCiclo): number
  export function calcularFechaLimiteAbono(regla, montoAcumulado, precioPlan, fechaInicioCiclo, diasDelCiclo): Date | null
  ```
  Task 3 (`RegistrarPago.ts`) y las tareas de UI (Task 8, Task 9) consumen estas funciones y tipos exactos.

- [ ] **Step 1: Escribir `ReglaAbono.ts`**

Crear `packages/domain/entities/ReglaAbono.ts`:

```ts
// Motor de reglas de abono: decide el monto mínimo aceptable de un abono
// parcial y el plazo de acceso que otorga, combinando la regla de la
// frecuencia del plan (configurable en /configuraciones/reglas-abono) con
// una regla propia del plan (configurable en /planes), que gana cuando
// ambas están definidas. Ver diseño en
// docs/superpowers/specs/2026-09-26-motor-abonos-y-modalidad-pago-design.md

export type TipoMinimoAbono = "DIAS" | "PORCENTAJE";

export interface ReglaAbonoEfectiva {
  tipo: TipoMinimoAbono;
  valor: number;
  // De dónde salió la regla aplicada — solo informativo, para mostrar en
  // la UI de dónde proviene el mínimo mostrado (útil al configurar un
  // plan, para saber si está usando su propio valor o el heredado).
  origen: "plan" | "frecuencia";
}

// El plan gana si define su propio mínimo (ambos campos no nulos); si no,
// hereda de la regla de su frecuencia, siempre que esté activa. Si
// ninguno de los dos aplica, no hay regla — el abono se comporta como
// antes de este motor (sin mínimo más allá de $0.01, sin plazo).
export function resolverReglaAbono(
  plan: { minimoAbonoTipo: TipoMinimoAbono | null; minimoAbonoValor: number | null },
  reglaFrecuencia: { activo: boolean; tipo: TipoMinimoAbono; valor: number } | null
): ReglaAbonoEfectiva | null {
  if (plan.minimoAbonoTipo !== null && plan.minimoAbonoValor !== null) {
    return { tipo: plan.minimoAbonoTipo, valor: plan.minimoAbonoValor, origen: "plan" };
  }
  if (reglaFrecuencia?.activo) {
    return { tipo: reglaFrecuencia.tipo, valor: reglaFrecuencia.valor, origen: "frecuencia" };
  }
  return null;
}

// Conversión bidireccional días↔porcentaje, usada tanto en el cálculo del
// motor como en el panel de configuración (para mostrar en vivo el
// equivalente en la otra unidad mientras se configura una regla).
export function diasAPorcentaje(dias: number, diasDelCiclo: number): number {
  if (diasDelCiclo <= 0) return 0;
  return (dias / diasDelCiclo) * 100;
}

export function porcentajeADias(porcentaje: number, diasDelCiclo: number): number {
  return Math.round((porcentaje / 100) * diasDelCiclo);
}

// Monto mínimo de abono en USD que exige la regla efectiva — nunca menos
// que el equivalente a 1 día completo del ciclo, para que un abono válido
// jamás pueda redondear a 0 días de acceso (ver calcularFechaLimiteAbono).
// Sin regla activa, el mínimo es prácticamente nulo ($0.01) — cualquier
// monto positivo es un abono válido, igual que antes de este motor.
export function calcularMontoMinimoAbono(
  regla: ReglaAbonoEfectiva | null,
  precioPlan: number,
  diasDelCiclo: number
): number {
  if (!regla || precioPlan <= 0 || diasDelCiclo <= 0) return 0.01;
  const dias = regla.tipo === "DIAS" ? regla.valor : porcentajeADias(regla.valor, diasDelCiclo);
  const diasEfectivos = Math.max(dias, 1);
  return (precioPlan / diasDelCiclo) * diasEfectivos;
}

// Fecha límite de acceso que otorga el monto ACUMULADO del ciclo (no solo
// el abono más reciente) — null si no hay regla activa, o si el monto ya
// alcanza/supera el precio del plan (ciclo saldado, sin restricción).
export function calcularFechaLimiteAbono(
  regla: ReglaAbonoEfectiva | null,
  montoAcumulado: number,
  precioPlan: number,
  fechaInicioCiclo: Date,
  diasDelCiclo: number
): Date | null {
  if (!regla || precioPlan <= 0 || diasDelCiclo <= 0) return null;
  if (montoAcumulado >= precioPlan) return null;
  const precioPorDia = precioPlan / diasDelCiclo;
  const diasCubiertos = Math.floor(montoAcumulado / precioPorDia);
  const limite = new Date(fechaInicioCiclo);
  limite.setDate(limite.getDate() + diasCubiertos);
  return limite;
}
```

- [ ] **Step 2: Verificar con trazas manuales (sin test runner)**

No hay test runner en este proyecto (convención confirmada) — en vez de un archivo `.test.ts`, escribir un script desechable temporal que importe y ejecute estas funciones con los casos del Review Focus, imprimir los resultados, confirmarlos a mano, y BORRAR el script (no se commitea). Ejemplo de casos a probar en el script:

```ts
// script desechable, ej. packages/domain/verificar_regla_abono_temp.ts — BORRAR después de correrlo
import {
  resolverReglaAbono, calcularMontoMinimoAbono, calcularFechaLimiteAbono, diasAPorcentaje, porcentajeADias,
} from "./entities/ReglaAbono";

// Caso 1: sin regla de plan ni de frecuencia → sin mínimo, sin plazo
console.log("Caso 1:", resolverReglaAbono({ minimoAbonoTipo: null, minimoAbonoValor: null }, null)); // null
console.log("  mínimo:", calcularMontoMinimoAbono(null, 30, 30)); // 0.01
console.log("  límite:", calcularFechaLimiteAbono(null, 10, 30, new Date("2026-01-01"), 30)); // null

// Caso 2: regla de frecuencia activa (10% mínimo), plan sin regla propia
const reglaFrec = { activo: true, tipo: "PORCENTAJE" as const, valor: 10 };
const efectiva = resolverReglaAbono({ minimoAbonoTipo: null, minimoAbonoValor: null }, reglaFrec);
console.log("Caso 2 (hereda frecuencia):", efectiva); // origen: "frecuencia"
console.log("  mínimo para plan $30/30 días:", calcularMontoMinimoAbono(efectiva, 30, 30)); // 10% de 30 días = 3 días = $3

// Caso 3: plan con su propia regla (5 días fijos) sobreescribe la de frecuencia
const efectivaPlan = resolverReglaAbono({ minimoAbonoTipo: "DIAS", minimoAbonoValor: 5 }, reglaFrec);
console.log("Caso 3 (plan gana):", efectivaPlan); // origen: "plan", valor: 5

// Caso 4: abono exactamente igual al mínimo (Review Focus — límite inclusive)
// plan $30/30días, mínimo 3 días = $3 exactos. Un abono de $3.00 debe alcanzar.
console.log("Caso 4 (límite exacto):", calcularMontoMinimoAbono(efectiva, 30, 30) === 3); // true, comparar con >= no con >

// Caso 5: abono que completa el 100% → sin plazo
console.log("Caso 5 (saldado):", calcularFechaLimiteAbono(efectiva, 30, 30, new Date("2026-01-01"), 30)); // null

// Caso 6: ciclo DIARIO (1 día) — no debe dar NaN/Infinity
console.log("Caso 6 (diario):", porcentajeADias(50, 1), diasAPorcentaje(1, 1)); // 1 (redondeado), 100
console.log("  mínimo diario:", calcularMontoMinimoAbono({ tipo: "PORCENTAJE", valor: 50, origen: "frecuencia" }, 3, 1)); // 3 (todo el día)
```

Run: `cd packages/domain && npx tsx verificar_regla_abono_temp.ts` (o desde la raíz con la ruta completa — confirmar qué invocación de `tsx` funciona en este monorepo, puede requerir `npx tsx packages/domain/verificar_regla_abono_temp.ts` desde la raíz)
Expected: los 6 casos imprimen los valores esperados anotados en los comentarios, sin `NaN`/`Infinity`/`undefined`. Documentar la salida real en el reporte de la tarea.

- [ ] **Step 3: Borrar el script desechable**

```bash
rm packages/domain/verificar_regla_abono_temp.ts
```

- [ ] **Step 4: Agregar campos a `Plan.ts`**

En `packages/domain/entities/Plan.ts`:

```ts
import type { TipoMinimoAbono } from "./ReglaAbono";

export interface Plan {
  id: string;
  organizacionId: string;
  nombre: string;
  frecuencia: FrecuenciaPago;
  incluyeEntrenador: boolean;
  precioUSD: number;
  multisede: boolean;
  activo: boolean;
  permitePagoParcial: boolean;
  minimoAbonoTipo: TipoMinimoAbono | null;
  minimoAbonoValor: number | null;
}

export interface DatosNuevoPlan {
  organizacionId: string;
  nombre: string;
  frecuencia: FrecuenciaPago;
  incluyeEntrenador: boolean;
  precioUSD: number;
  multisede: boolean;
  permitePagoParcial: boolean;
  minimoAbonoTipo: TipoMinimoAbono | null;
  minimoAbonoValor: number | null;
}

export interface CambiosPlan {
  nombre?: string;
  precioUSD?: number;
  multisede?: boolean;
  activo?: boolean;
  permitePagoParcial?: boolean;
  minimoAbonoTipo?: TipoMinimoAbono | null;
  minimoAbonoValor?: number | null;
}
```

- [ ] **Step 5: Agregar `fechaLimiteAbono` a `Suscripcion.ts`**

En `packages/domain/entities/Suscripcion.ts`:

```ts
export type EstadoSuscripcion = "ACTIVA" | "VENCIDA" | "CANCELADA" | "PAUSADA";

export interface Suscripcion {
  id: string;
  miembroId: string;
  planId: string;
  inicio: Date;
  fin: Date;
  fechaLimiteAbono: Date | null;
  estado: EstadoSuscripcion;
}
```

- [ ] **Step 6: Verificar compilación**

Run: `npx tsc --noEmit -p apps/web-admin`
Expected: nuevos errores esperados en archivos que aún construyen `DatosNuevoPlan`/`CambiosPlan`/`Suscripcion` sin los campos nuevos (ej. `CrearPlan`/`ActualizarPlan` callers, `PrismaPlanRepository`, `PrismaSuscripcionRepository`) — se resuelven en las Tasks 3-6. No debe haber errores en `ReglaAbono.ts` en sí.

- [ ] **Step 7: Commit**

```bash
git add packages/domain/entities/ReglaAbono.ts packages/domain/entities/Plan.ts packages/domain/entities/Suscripcion.ts
git commit -m "feat: agrega el motor de reglas de abono al dominio"
```

---

## Task 3: Puerto e infraestructura — `IReglaAbonoRepository`, actualizar repos de Plan y Suscripcion

**Files:**
- Create: `packages/domain/ports/IReglaAbonoRepository.ts`
- Create: `packages/infrastructure/persistence/prisma/PrismaReglaAbonoRepository.ts`
- Modify: `packages/infrastructure/persistence/prisma/PrismaPlanRepository.ts`
- Modify: `packages/infrastructure/persistence/prisma/PrismaSuscripcionRepository.ts`
- Modify: `packages/domain/ports/ISuscripcionRepository.ts`

**Interfaces:**
- Consumes: `Plan`, `DatosNuevoPlan`, `CambiosPlan` (Task 2); `Suscripcion` (Task 2); tabla `ReglaAbonoPorFrecuencia` (Task 1).
- Produces:
  ```ts
  export interface IReglaAbonoRepository {
    buscarPorOrganizacionYFrecuencia(organizacionId: string, frecuencia: FrecuenciaPago): Promise<ReglaAbonoPorFrecuencia | null>;
    listarPorOrganizacion(organizacionId: string): Promise<ReglaAbonoPorFrecuencia[]>;
    upsert(organizacionId: string, frecuencia: FrecuenciaPago, datos: { activo: boolean; tipo: TipoMinimoAbono; valor: number }): Promise<ReglaAbonoPorFrecuencia>;
  }
  ```
  Task 4 (`RegistrarPago.ts`) y Task 9 (server actions de configuración) consumen esta interfaz.
  ```ts
  ISuscripcionRepository.crear(datos: { miembroId, planId, inicio, fin, fechaLimiteAbono: Date | null }): Promise<Suscripcion>
  ISuscripcionRepository.actualizarFechaLimiteAbono(id: string, fechaLimiteAbono: Date | null): Promise<Suscripcion>
  ```
  Task 4 consume ambos métodos nuevos/modificados.

- [ ] **Step 1: Definir `ReglaAbonoPorFrecuencia` como entidad de dominio**

Agregar a `packages/domain/entities/ReglaAbono.ts` (mismo archivo de Task 2, al final):

```ts
import type { FrecuenciaPago } from "./Plan";

export interface ReglaAbonoPorFrecuencia {
  id: string;
  organizacionId: string;
  frecuencia: FrecuenciaPago;
  activo: boolean;
  tipo: TipoMinimoAbono;
  valor: number;
}
```

(Nota: importar `FrecuenciaPago` desde `./Plan` puede crear un ciclo si `Plan.ts` a su vez importa `TipoMinimoAbono` desde `ReglaAbono.ts` — Task 2 ya hace esa importación. Verificar al compilar; si TypeScript se queja de importación circular, mover `FrecuenciaPago` a su propio archivo o declarar `ReglaAbonoPorFrecuencia.frecuencia` como `string` con un comentario, ya que en la práctica el importador siempre pasa uno de los 4 valores válidos.)

- [ ] **Step 2: Crear el puerto `IReglaAbonoRepository`**

```ts
// packages/domain/ports/IReglaAbonoRepository.ts
import type { FrecuenciaPago } from "../entities/Plan";
import type { ReglaAbonoPorFrecuencia, TipoMinimoAbono } from "../entities/ReglaAbono";

export interface IReglaAbonoRepository {
  buscarPorOrganizacionYFrecuencia(
    organizacionId: string,
    frecuencia: FrecuenciaPago
  ): Promise<ReglaAbonoPorFrecuencia | null>;
  listarPorOrganizacion(organizacionId: string): Promise<ReglaAbonoPorFrecuencia[]>;
  // Crea o actualiza la regla de una frecuencia — no hay "crear" separado
  // porque siempre hay como máximo una fila por (organizacionId, frecuencia).
  upsert(
    organizacionId: string,
    frecuencia: FrecuenciaPago,
    datos: { activo: boolean; tipo: TipoMinimoAbono; valor: number }
  ): Promise<ReglaAbonoPorFrecuencia>;
}
```

- [ ] **Step 3: Implementar `PrismaReglaAbonoRepository`**

```ts
// packages/infrastructure/persistence/prisma/PrismaReglaAbonoRepository.ts
import type { PrismaClient } from "@gym-app/db/generated/prisma/client";
import type { IReglaAbonoRepository } from "@gym-app/domain/ports/IReglaAbonoRepository";
import type { FrecuenciaPago } from "@gym-app/domain/entities/Plan";
import type { ReglaAbonoPorFrecuencia, TipoMinimoAbono } from "@gym-app/domain/entities/ReglaAbono";

type FilaRegla = {
  id: string;
  organizacionId: string;
  frecuencia: FrecuenciaPago;
  activo: boolean;
  minimoAbonoTipo: string;
  minimoAbonoValor: { toNumber(): number };
};

function mapear(fila: FilaRegla): ReglaAbonoPorFrecuencia {
  return {
    id: fila.id,
    organizacionId: fila.organizacionId,
    frecuencia: fila.frecuencia,
    activo: fila.activo,
    tipo: fila.minimoAbonoTipo as TipoMinimoAbono,
    valor: fila.minimoAbonoValor.toNumber(),
  };
}

export class PrismaReglaAbonoRepository implements IReglaAbonoRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async buscarPorOrganizacionYFrecuencia(
    organizacionId: string,
    frecuencia: FrecuenciaPago
  ): Promise<ReglaAbonoPorFrecuencia | null> {
    const fila = await this.prisma.reglaAbonoPorFrecuencia.findUnique({
      where: { organizacionId_frecuencia: { organizacionId, frecuencia } },
    });
    return fila ? mapear(fila) : null;
  }

  async listarPorOrganizacion(organizacionId: string): Promise<ReglaAbonoPorFrecuencia[]> {
    const filas = await this.prisma.reglaAbonoPorFrecuencia.findMany({ where: { organizacionId } });
    return filas.map(mapear);
  }

  async upsert(
    organizacionId: string,
    frecuencia: FrecuenciaPago,
    datos: { activo: boolean; tipo: TipoMinimoAbono; valor: number }
  ): Promise<ReglaAbonoPorFrecuencia> {
    const fila = await this.prisma.reglaAbonoPorFrecuencia.upsert({
      where: { organizacionId_frecuencia: { organizacionId, frecuencia } },
      create: {
        organizacionId,
        frecuencia,
        activo: datos.activo,
        minimoAbonoTipo: datos.tipo,
        minimoAbonoValor: datos.valor,
      },
      update: {
        activo: datos.activo,
        minimoAbonoTipo: datos.tipo,
        minimoAbonoValor: datos.valor,
      },
    });
    return mapear(fila);
  }
}
```

(El nombre del filtro compuesto `organizacionId_frecuencia` en `findUnique`/`upsert` lo genera Prisma automáticamente a partir de `@@unique([organizacionId, frecuencia])` — verificar el nombre exacto que genera `npx prisma generate` si difiere, revisando el cliente generado en `packages/db/generated/prisma`.)

- [ ] **Step 4: Actualizar `PrismaPlanRepository` con los campos nuevos**

En `packages/infrastructure/persistence/prisma/PrismaPlanRepository.ts`, agregar los 3 campos nuevos a `FilaPlan`, `mapear()`, `crear()`:

```ts
type FilaPlan = {
  id: string;
  organizacionId: string;
  nombre: string;
  frecuencia: Plan["frecuencia"];
  incluyeEntrenador: boolean;
  precioUSD: { toNumber(): number };
  multisede: boolean;
  activo: boolean;
  permitePagoParcial: boolean;
  minimoAbonoTipo: string | null;
  minimoAbonoValor: { toNumber(): number } | null;
};

function mapear(plan: FilaPlan): Plan {
  return {
    id: plan.id,
    organizacionId: plan.organizacionId,
    nombre: plan.nombre,
    frecuencia: plan.frecuencia,
    incluyeEntrenador: plan.incluyeEntrenador,
    precioUSD: plan.precioUSD.toNumber(),
    multisede: plan.multisede,
    activo: plan.activo,
    permitePagoParcial: plan.permitePagoParcial,
    minimoAbonoTipo: plan.minimoAbonoTipo as Plan["minimoAbonoTipo"],
    minimoAbonoValor: plan.minimoAbonoValor ? plan.minimoAbonoValor.toNumber() : null,
  };
}
```

```ts
  async crear(datos: DatosNuevoPlan): Promise<Plan> {
    const plan = await this.prisma.plan.create({
      data: {
        organizacionId: datos.organizacionId,
        nombre: datos.nombre,
        frecuencia: datos.frecuencia,
        incluyeEntrenador: datos.incluyeEntrenador,
        precioUSD: datos.precioUSD,
        multisede: datos.multisede,
        permitePagoParcial: datos.permitePagoParcial,
        minimoAbonoTipo: datos.minimoAbonoTipo,
        minimoAbonoValor: datos.minimoAbonoValor,
      },
    });

    return mapear(plan);
  }
```

(`actualizar()` ya pasa `cambios` directo a `data:` — no necesita cambios, `CambiosPlan` ya tiene los campos opcionales del Step 4 de Task 2.)

- [ ] **Step 5: Actualizar `ISuscripcionRepository` y `PrismaSuscripcionRepository`**

En `packages/domain/ports/ISuscripcionRepository.ts`:

```ts
export interface ISuscripcionRepository {
  buscarActivaVigentePorMiembro(miembroId: string, fecha: Date): Promise<Suscripcion | null>;
  buscarActivaVigentePorMiembroYPlan(miembroId: string, planId: string, fecha: Date): Promise<Suscripcion | null>;
  listarActivasVigentesPorPlan(planId: string, fecha: Date): Promise<Suscripcion[]>;
  extenderFin(id: string, nuevoFin: Date): Promise<Suscripcion>;
  crear(datos: { miembroId: string; planId: string; inicio: Date; fin: Date; fechaLimiteAbono: Date | null }): Promise<Suscripcion>;
  cambiarPlan(id: string, planId: string): Promise<Suscripcion>;
  actualizarFechaLimiteAbono(id: string, fechaLimiteAbono: Date | null): Promise<Suscripcion>;
}
```

En `PrismaSuscripcionRepository.ts`, agregar `fechaLimiteAbono` a `FilaSuscripcion`/`mapear()`, actualizar `crear()`, y agregar el nuevo método:

```ts
type FilaSuscripcion = {
  id: string;
  miembroId: string;
  planId: string;
  inicio: Date;
  fin: Date;
  fechaLimiteAbono: Date | null;
  estado: Suscripcion["estado"];
};

function mapear(suscripcion: FilaSuscripcion): Suscripcion {
  return {
    id: suscripcion.id,
    miembroId: suscripcion.miembroId,
    planId: suscripcion.planId,
    inicio: suscripcion.inicio,
    fin: suscripcion.fin,
    fechaLimiteAbono: suscripcion.fechaLimiteAbono,
    estado: suscripcion.estado,
  };
}
```

```ts
  async crear(datos: {
    miembroId: string;
    planId: string;
    inicio: Date;
    fin: Date;
    fechaLimiteAbono: Date | null;
  }): Promise<Suscripcion> {
    const suscripcion = await this.prisma.suscripcion.create({
      data: {
        miembroId: datos.miembroId,
        planId: datos.planId,
        inicio: datos.inicio,
        fin: datos.fin,
        fechaLimiteAbono: datos.fechaLimiteAbono,
        estado: "ACTIVA",
      },
    });

    return mapear(suscripcion);
  }

  async actualizarFechaLimiteAbono(id: string, fechaLimiteAbono: Date | null): Promise<Suscripcion> {
    const suscripcion = await this.prisma.suscripcion.update({
      where: { id },
      data: { fechaLimiteAbono },
    });

    return mapear(suscripcion);
  }
```

- [ ] **Step 6: Verificar compilación**

Run: `npx tsc --noEmit -p apps/web-admin`
Expected: los errores de `PrismaPlanRepository`/`PrismaSuscripcionRepository`/`ISuscripcionRepository` de la Task 2 ya no aparecen. Quedan pendientes los errores en los CALLERS de `suscripciones.crear(...)` (en `RegistrarPago.ts` y `CambiarPlanConPago.ts`, que aún no pasan `fechaLimiteAbono`) — se resuelven en Task 4. Documentar en el reporte cuáles errores quedan y confirmar que son exactamente los esperados (llamadas a `.crear()` sin el nuevo campo).

- [ ] **Step 7: Commit**

```bash
git add packages/domain/ports/IReglaAbonoRepository.ts packages/domain/ports/ISuscripcionRepository.ts packages/domain/entities/ReglaAbono.ts packages/infrastructure/persistence/prisma/PrismaReglaAbonoRepository.ts packages/infrastructure/persistence/prisma/PrismaPlanRepository.ts packages/infrastructure/persistence/prisma/PrismaSuscripcionRepository.ts
git commit -m "feat: agrega repositorio de reglas de abono y campos en plan/suscripcion"
```

---

## Task 4: `RegistrarPago.ts` — integrar el motor de reglas

**Files:**
- Modify: `packages/domain/use-cases/RegistrarPago.ts`
- Modify: `packages/domain/use-cases/CambiarPlanConPago.ts` (solo para pasar `fechaLimiteAbono: null` en su `suscripciones.crear`, si aplica — revisar si ese caso de uso llama a `crear` o solo a `cambiarPlan`/`extenderFin`)

**Interfaces:**
- Consumes: `resolverReglaAbono`, `calcularMontoMinimoAbono`, `calcularFechaLimiteAbono` (Task 2); `IReglaAbonoRepository.buscarPorOrganizacionYFrecuencia` (Task 3); `ISuscripcionRepository.crear`/`actualizarFechaLimiteAbono` (Task 3); `Plan.permitePagoParcial`/`minimoAbonoTipo`/`minimoAbonoValor` (Task 2).
- Produces: `RegistrarPagoDeps` gana `reglasAbono: IReglaAbonoRepository`; nuevos errores `AbonoNoPermitidoError`, `AbonoMenorAlMinimoError` exportados — Task 5 (server actions) los captura y traduce a mensajes de error del formulario.

- [ ] **Step 1: Revisar el archivo actual completo**

Leer `packages/domain/use-cases/RegistrarPago.ts` en su estado actual (después de las Tasks 1-3, que no lo tocan) para confirmar los nombres exactos de variables (`esAbonoDeCicloAbierto`, `pagosDelCicloAbierto`, `base`, `fin`, `activa`) antes de editarlo — el código de este paso asume esos nombres tal como se vieron en la exploración, pero conviene reconfirmar antes de aplicar cambios sobre el archivo real.

- [ ] **Step 2: Agregar los nuevos errores de dominio**

Agregar cerca de `MontoInvalidoError`:

```ts
// El plan tiene permitePagoParcial=false — no se puede registrar un abono
// (monto menor al precio del plan) contra él. El pago combinado NO está
// sujeto a esta restricción (ver diseño acordado).
export class AbonoNoPermitidoError extends Error {
  constructor() {
    super("Este plan no admite pagos parciales (abonos) — el monto debe cubrir el precio completo.");
  }
}

// El monto acumulado del ciclo (tras este pago) no alcanza el mínimo que
// exige la regla de abono efectiva (del plan o de su frecuencia).
export class AbonoMenorAlMinimoError extends Error {
  constructor(minimoUSD: number) {
    super(`El abono mínimo para este plan es $${minimoUSD.toFixed(2)}.`);
  }
}
```

- [ ] **Step 3: Agregar `reglasAbono` a `RegistrarPagoDeps`**

```ts
export interface RegistrarPagoDeps {
  pagos: IPagoRepository;
  suscripciones: ISuscripcionRepository;
  miembros: IMemberRepository;
  planes: IPlanRepository;
  turnos: ITurnoRepository;
  sucursales: ISucursalRepository;
  autorizacion: IAuthorizationService;
  reglasAbono: IReglaAbonoRepository;
}
```

Agregar el import: `import { IReglaAbonoRepository } from "../ports/IReglaAbonoRepository";` y
`import { resolverReglaAbono, calcularMontoMinimoAbono, calcularFechaLimiteAbono } from "../entities/ReglaAbono";`.

- [ ] **Step 4: Insertar la validación y el cálculo del motor de reglas**

Localizar el bloque donde se decide `esAbonoDeCicloAbierto` y se calcula `base`/`fin` (según la exploración, alrededor de las líneas que manejan la rama `if (esAbonoDeCicloAbierto) { ... } else { ... }`). Después de ese bloque, y antes de crear las filas `Pago`, insertar:

```ts
  // Motor de reglas de abono: solo aplica cuando el pago resultante deja
  // el ciclo sin saldar (es decir, es un abono real, no un pago total).
  // montoTotal ya viene calculado más arriba como suma de input.lineas.
  const montoAcumuladoDelCiclo = esAbonoDeCicloAbierto
    ? totalPagado(pagosDelCicloAbierto) + montoTotal
    : montoTotal;
  const esAbonoParcial = montoAcumuladoDelCiclo < miembro.precioPlan;

  let fechaLimiteAbonoCalculada: Date | null = null;

  if (esAbonoParcial) {
    if (!plan.permitePagoParcial) {
      throw new AbonoNoPermitidoError();
    }

    const reglaFrecuencia = await deps.reglasAbono.buscarPorOrganizacionYFrecuencia(
      input.organizacionId,
      plan.frecuencia
    );
    const reglaEfectiva = resolverReglaAbono(
      { minimoAbonoTipo: plan.minimoAbonoTipo, minimoAbonoValor: plan.minimoAbonoValor },
      reglaFrecuencia
    );
    const diasDelCiclo = DURACION_DIAS_POR_FRECUENCIA[plan.frecuencia];
    const montoMinimo = calcularMontoMinimoAbono(reglaEfectiva, miembro.precioPlan, diasDelCiclo);

    if (montoAcumuladoDelCiclo < montoMinimo) {
      throw new AbonoMenorAlMinimoError(montoMinimo);
    }

    fechaLimiteAbonoCalculada = calcularFechaLimiteAbono(
      reglaEfectiva,
      montoAcumuladoDelCiclo,
      miembro.precioPlan,
      base,
      diasDelCiclo
    );
  }
```

(`base` es la variable que ya representa `fechaInicioCiclo` en el código existente — confirmar el nombre exacto al leer el archivo real en el Step 1. Este bloque debe ubicarse DESPUÉS de que `base`/`fin`/`plan` ya estén resueltos, y ANTES del bucle que crea las filas `Pago`.)

- [ ] **Step 5: Persistir `fechaLimiteAbonoCalculada` en la `Suscripcion`**

En la rama donde se crea una `Suscripcion` nueva (`deps.suscripciones.crear(...)`), agregar el campo:

```ts
    } else {
      await deps.suscripciones.crear({
        miembroId: input.miembroId,
        planId: input.planId,
        inicio: ahora,
        fin,
        fechaLimiteAbono: fechaLimiteAbonoCalculada,
      });
    }
```

En la rama donde se EXTIENDE una suscripción existente (`deps.suscripciones.extenderFin(activa.id, fin)`), agregar justo después una llamada a actualizar la fecha límite:

```ts
    if (activa) {
      await deps.suscripciones.extenderFin(activa.id, fin);
      await deps.suscripciones.actualizarFechaLimiteAbono(activa.id, fechaLimiteAbonoCalculada);
    } else {
      // ... (bloque de crear() de arriba)
    }
```

Y en la rama `esAbonoDeCicloAbierto` (donde NO se extiende el ciclo, solo se suma un abono más al mismo ciclo abierto), agregar también la actualización de la fecha límite sobre la `Suscripcion` activa:

```ts
  if (esAbonoDeCicloAbierto) {
    fin = activa!.fin;
    base = pagosDelCicloAbierto[0].fechaInicioCiclo ?? activa!.inicio;
    await deps.suscripciones.actualizarFechaLimiteAbono(activa!.id, fechaLimiteAbonoCalculada);
  } else {
    // ... (bloque existente)
  }
```

(La llamada a `actualizarFechaLimiteAbono` en la rama `esAbonoDeCicloAbierto` debe ir DESPUÉS del bloque del Step 4 que calcula `fechaLimiteAbonoCalculada` — puede requerir reordenar el código para que el cálculo del motor de reglas ocurra antes de esta rama, no después. Revisar el orden real del archivo y ajustar según hierro falle; el objetivo funcional es: toda rama que decide "el ciclo sigue abierto con esta Suscripcion" termina escribiendo la fecha límite recién calculada en ella.)

- [ ] **Step 6: Verificar compilación**

Run: `npx tsc --noEmit -p apps/web-admin`
Expected: sin errores en `RegistrarPago.ts`. Puede seguir habiendo errores en los 3 callers de `registrarPago` (server actions/API route) si `deps.reglasAbono` no está siendo inyectado todavía — eso se resuelve en Task 5.

- [ ] **Step 7: Trazar manualmente los 3 escenarios del Review Focus relacionados con este archivo**

Sin test runner — documentar en el reporte de la tarea un trazado manual línea por línea (usando los valores concretos de las funciones ya verificadas en Task 2) para:
(a) abono exactamente igual al mínimo → debe aceptarse (comparación `<` estricta, no `<=`, al rechazar).
(b) plan sin regla propia y frecuencia sin regla activa → `esAbonoParcial` sigue funcionando como antes, sin lanzar errores nuevos, `fechaLimiteAbonoCalculada` queda `null`.
(c) plan con `permitePagoParcial=false` y un intento de abono → `AbonoNoPermitidoError` se lanza ANTES de tocar la base de datos (ninguna escritura ocurre).

- [ ] **Step 8: Commit**

```bash
git add packages/domain/use-cases/RegistrarPago.ts
git commit -m "feat: integra el motor de reglas de abono en registrarPago"
```

---

## Task 5: Actualizar los callers de `registrarPago` y `CambiarPlanConPago`

**Files:**
- Modify: `apps/web-admin/app/(panel)/pagos/actions.ts` (`registrarPagoAction`)
- Modify: `apps/web-admin/app/api/pagos/route.ts`
- Modify: `apps/web-admin/app/(panel)/miembros/actions.ts`
- Modify: `packages/domain/use-cases/CambiarPlanConPago.ts` (si llama a `suscripciones.crear`)

**Interfaces:**
- Consumes: `registrarPago` con `RegistrarPagoDeps.reglasAbono` (Task 4); `AbonoNoPermitidoError`, `AbonoMenorAlMinimoError` (Task 4); `PrismaReglaAbonoRepository` (Task 3).
- Produces: los 3 puntos de entrada siguen funcionando, ahora inyectando `reglasAbono: new PrismaReglaAbonoRepository(prisma)` en sus llamadas a `registrarPago`.

- [ ] **Step 1: Agregar `reglasAbono` a las 3 llamadas de `registrarPago`**

En cada uno de los 3 archivos (`pagos/actions.ts`, `api/pagos/route.ts`, `miembros/actions.ts`), en el objeto de dependencias pasado a `registrarPago(...)`, agregar:

```ts
        reglasAbono: new PrismaReglaAbonoRepository(prisma),
```

Junto al import correspondiente: `import { PrismaReglaAbonoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaReglaAbonoRepository";`.

- [ ] **Step 2: Capturar los nuevos errores en `registrarPagoAction`**

En `apps/web-admin/app/(panel)/pagos/actions.ts`, agregar `AbonoNoPermitidoError` y `AbonoMenorAlMinimoError` al import de `@gym-app/domain/use-cases/RegistrarPago` y al `instanceof` chain del catch:

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
  AbonoNoPermitidoError,
  AbonoMenorAlMinimoError,
} from "@gym-app/domain/use-cases/RegistrarPago";
```

```ts
  } catch (error) {
    if (
      error instanceof MiembroNoEncontradoError ||
      error instanceof MiembroFueraDeSucursalError ||
      error instanceof PlanNoEncontradoError ||
      error instanceof PlanInactivoError ||
      error instanceof RolNoAutorizadoError ||
      error instanceof MontoInvalidoError ||
      error instanceof LineasDePagoInvalidasError ||
      error instanceof AbonoNoPermitidoError ||
      error instanceof AbonoMenorAlMinimoError
    ) {
      return { error: error.message };
    }
    throw error;
  }
```

- [ ] **Step 3: Revisar `CambiarPlanConPago.ts`**

Leer el archivo completo y confirmar si llama a `deps.suscripciones.crear(...)` en algún punto (probablemente no — este caso de uso cambia el plan de una suscripción YA existente, usando `cambiarPlan`, no crea una nueva). Si SÍ llama a `crear`, agregar `fechaLimiteAbono: null` a esa llamada (un cambio de plan cobrando diferencia siempre se trata como pago total de la diferencia, nunca como abono — no aplica el motor de reglas aquí). Si NO llama a `crear`, no se necesita ningún cambio en este archivo — documentarlo en el reporte de la tarea.

- [ ] **Step 4: Verificar compilación**

Run: `npx tsc --noEmit -p apps/web-admin`
Expected: sin errores relacionados con `registrarPago`/`reglasAbono`/`ISuscripcionRepository`/`DatosNuevoPlan`/`CambiosPlan` en ninguno de los archivos tocados hasta ahora. Cualquier error restante debe ser en archivos de las Tasks 6-11 todavía no implementadas (documentar cuáles).

- [ ] **Step 5: Commit**

```bash
git add apps/web-admin/app/\(panel\)/pagos/actions.ts apps/web-admin/app/api/pagos/route.ts apps/web-admin/app/\(panel\)/miembros/actions.ts packages/domain/use-cases/CambiarPlanConPago.ts
git commit -m "feat: conecta el motor de reglas de abono a los callers de registrarPago"
```

---

## Task 6: Kiosco — nuevo estado `abono_vencido`

**Files:**
- Modify: `packages/domain/entities/CheckIn.ts`
- Modify: `packages/domain/use-cases/ValidarAccesoSucursalPorPlan.ts`
- Modify: `packages/domain/use-cases/RegistrarCheckIn.ts`
- Modify: `apps/web-admin/app/api/checkin/route.ts`
- Modify: `apps/kiosk/lib/api.ts`
- Modify: `apps/kiosk/components/AccessCard.tsx`

**Interfaces:**
- Consumes: `Suscripcion.fechaLimiteAbono` (Task 2/3); `ISuscripcionRepository.buscarActivaVigentePorMiembro` (ya existente, sin cambios de firma).
- Produces: `EstadoCheckIn` gana `"abono_vencido"` — consumido por `AccessCard.tsx` y cualquier otro lugar que ya haga `switch`/lookup exhaustivo sobre `EstadoCheckIn` (TypeScript señalará esos lugares al compilar, gracias al `Record` exhaustivo en `ETIQUETA_ESTADO`).

- [ ] **Step 1: Agregar el nuevo valor a `EstadoCheckIn`**

En `packages/domain/entities/CheckIn.ts`:

```ts
export type EstadoCheckIn = "activo" | "en_gracia" | "vencido" | "abono_vencido" | "sucursal_incorrecta";
```

- [ ] **Step 2: Modificar `ValidarAccesoSucursalPorPlan.ts`**

Agregar el parámetro `fechaLimiteAbono` y el chequeo, ANTES de devolver `"activo"`:

```ts
export async function validarAccesoSucursal(
  deps: ValidarAccesoDeps,
  miembroId: string,
  sucursalIdDelMiembro: string | null,
  sucursalIdDelCheckIn: string,
  fechaVencimientoMiembro: Date | null,
  diasGracia: number,
  fechaLimiteAbono: Date | null,
  ahora: Date = new Date()
): Promise<EstadoCheckIn> {
  if (sucursalIdDelMiembro !== null && sucursalIdDelMiembro !== sucursalIdDelCheckIn) {
    return "sucursal_incorrecta";
  }

  const suscripcion = await deps.suscripciones.buscarActivaVigentePorMiembro(miembroId, ahora);

  if (suscripcion) {
    // Aunque haya una Suscripcion vigente (fin > ahora), si el ciclo tiene
    // un plazo de abono activo y ya venció sin completarse el pago, el
    // acceso se bloquea igual — el plazo de abono reemplaza la regla
    // anterior de "acceso ilimitado desde el primer abono" (ver diseño
    // acordado, motor de reglas de abono).
    if (fechaLimiteAbono !== null && ahora.getTime() > fechaLimiteAbono.getTime()) {
      return "abono_vencido";
    }
    return "activo";
  }

  if (fechaVencimientoMiembro && diasGracia > 0) {
    const limiteGracia = new Date(fechaVencimientoMiembro.getTime() + diasGracia * MS_POR_DIA);
    if (ahora.getTime() > fechaVencimientoMiembro.getTime() && ahora.getTime() <= limiteGracia.getTime()) {
      return "en_gracia";
    }
  }

  return "vencido";
}
```

- [ ] **Step 3: Modificar `RegistrarCheckIn.ts` para obtener y pasar `fechaLimiteAbono`**

Antes de llamar a `validarAccesoSucursal`, obtener la suscripción activa del miembro (si no se obtuvo ya en otra parte del flujo) para leer su `fechaLimiteAbono`:

```ts
  const ahora = new Date();
  const suscripcionActiva = await deps.suscripciones.buscarActivaVigentePorMiembro(miembro.id, ahora);
  const fechaLimiteAbono = suscripcionActiva?.fechaLimiteAbono ?? null;

  const estado = await validarAccesoSucursal(
    { suscripciones: deps.suscripciones },
    miembro.id,
    miembro.sucursalId,
    input.sucursalId,
    miembro.fechaVencimiento,
    diasGracia,
    fechaLimiteAbono,
    ahora
  );
```

(Nota: `validarAccesoSucursal` YA busca la suscripción activa internamente — esta llamada duplicada es redundante pero necesaria para leer `fechaLimiteAbono` antes de pasarla como parámetro, dado que la función no puede devolver datos adicionales sin cambiar su tipo de retorno. Es una duplicación de una sola consulta liviana, aceptable dado el alcance de este cambio — no se justifica refactorizar la firma de `validarAccesoSucursal` para evitarla.)

- [ ] **Step 4: Verificar compilación**

Run: `npx tsc --noEmit -p apps/web-admin`
Expected: sin errores nuevos en `RegistrarCheckIn.ts`/`ValidarAccesoSucursalPorPlan.ts`.

- [ ] **Step 5: Actualizar el contrato del kiosco**

En `apps/kiosk/lib/api.ts`:

```ts
export type EstadoCheckIn = "activo" | "en_gracia" | "vencido" | "abono_vencido" | "sucursal_incorrecta";
```

- [ ] **Step 6: Actualizar `AccessCard.tsx`**

Agregar la nueva entrada a `ETIQUETA_ESTADO`:

```ts
const ETIQUETA_ESTADO: Record<ResultadoCheckIn["estado"], string> = {
  activo: "Acceso permitido",
  en_gracia: "Membresía vencida — período de gracia",
  vencido: "Membresía vencida",
  abono_vencido: "Plazo de abono vencido",
  sucursal_incorrecta: "Acceso denegado",
};
```

Actualizar el color (mismo rojo que `"vencido"` — según lo confirmado, sin distinguir por severidad visual):

```tsx
  const activo = resultado.estado === "activo";
  const enGracia = resultado.estado === "en_gracia";
  const colorEstado = activo ? "var(--gx-accent)" : enGracia ? "var(--gx-warn)" : "var(--gx-bad)";
  const colorEstadoInk = activo ? "var(--gx-accent-ink)" : enGracia ? "var(--gx-ink)" : "var(--gx-bad-ink)";
```

(Esta lógica de color YA cae en el `else` — "vencido", "abono_vencido" y "sucursal_incorrecta" comparten el mismo rojo por defecto, así que no requiere cambios adicionales más allá de que el ternario siga siendo correcto con el nuevo valor de `estado`.)

Actualizar el bloque del mensaje de detalle para incluir `"abono_vencido"`:

```tsx
              {(resultado.estado === "en_gracia" || resultado.estado === "vencido" || resultado.estado === "abono_vencido") && (
                <p className="border-t pt-4 text-lg font-medium" style={{ borderColor: "var(--gx-edge)", color: "var(--gx-warn)" }}>
                  {resultado.estado === "en_gracia"
                    ? `Tenés ${resultado.diasGraciaRestantes ?? 0} día(s) de gracia — acercate a recepción a renovar tu plan.`
                    : resultado.estado === "abono_vencido"
                      ? "Completa tu pago para reactivar el acceso — acércate a recepción."
                      : resultado.tieneGraciaConfigurada
                        ? "Tu período de gracia terminó — acercate a recepción a renovar tu plan."
                        : "Acercate a recepción a renovar tu plan."}
                </p>
              )}
```

(El texto nuevo de "abono_vencido" usa español sin voseo, según la memoria del proyecto — "Completa tu pago", "acércate", no "Completá"/"acercate" en su forma voseante. El resto de los textos existentes en este bloque, con voseo, NO se tocan — se dejan tal cual, según la propia memoria: no hace falta corregir retroactivamente texto que no se está editando por otra razón. Aquí SÍ se está editando esta línea completa, así que aplica el criterio nuevo únicamente a la rama `abono_vencido` que es texto genuinamente nuevo.)

- [ ] **Step 7: Verificar compilación del kiosco**

Run: `npx tsc --noEmit -p apps/kiosk`
Expected: sin errores.

- [ ] **Step 8: Commit**

```bash
git add packages/domain/entities/CheckIn.ts packages/domain/use-cases/ValidarAccesoSucursalPorPlan.ts packages/domain/use-cases/RegistrarCheckIn.ts apps/kiosk/lib/api.ts apps/kiosk/components/AccessCard.tsx
git commit -m "feat: agrega el estado de plazo de abono vencido al kiosco"
```

---

## Task 7: Panel de configuración — `/configuraciones/reglas-abono`

**Files:**
- Create: `apps/web-admin/app/(panel)/configuraciones/reglas-abono/page.tsx`
- Create: `apps/web-admin/app/(panel)/configuraciones/reglas-abono/FormularioReglaAbono.tsx`
- Create: `apps/web-admin/app/(panel)/configuraciones/reglas-abono/actions.ts`
- Modify: `apps/web-admin/app/(panel)/configuraciones/tabs.ts`

**Interfaces:**
- Consumes: `IReglaAbonoRepository` (Task 3), `PrismaReglaAbonoRepository` (Task 3), `diasAPorcentaje`/`porcentajeADias`/`DURACION_DIAS_POR_FRECUENCIA` (Task 2 y `Plan.ts` existente).
- Produces: nada consumido por otras tareas — es una hoja del árbol.

- [ ] **Step 1: Agregar la pestaña**

En `apps/web-admin/app/(panel)/configuraciones/tabs.ts`:

```ts
export const TABS_CONFIGURACIONES = [
  { href: "/configuraciones/metodos-pago", label: "Métodos de pago" },
  { href: "/configuraciones/reglas-abono", label: "Reglas de abono" },
  { href: "/planes", label: "Planes" },
  { href: "/sucursales", label: "Sucursales" },
  { href: "/usuarios", label: "Usuarios" },
];
```

- [ ] **Step 2: Crear el caso de uso `ListarReglasAbono` (opcional, o inline)**

Dado que esta es una consulta simple de una sola línea (`deps.reglasAbono.listarPorOrganizacion(organizacionId)`), NO hace falta un caso de uso de dominio separado — `page.tsx` puede llamar al repositorio directamente, siguiendo el mismo patrón liviano que otras páginas de configuración simples de este proyecto (revisar si `metodos-pago/page.tsx` usa un caso de uso o llama directo — se vio que SÍ usa `listarMetodosPago`; para consistencia, crear un caso de uso trivial):

```ts
// packages/domain/use-cases/ListarReglasAbono.ts
import { IReglaAbonoRepository } from "../ports/IReglaAbonoRepository";
import { ReglaAbonoPorFrecuencia } from "../entities/ReglaAbono";

export async function listarReglasAbono(
  deps: { reglasAbono: IReglaAbonoRepository },
  organizacionId: string
): Promise<ReglaAbonoPorFrecuencia[]> {
  return deps.reglasAbono.listarPorOrganizacion(organizacionId);
}
```

- [ ] **Step 3: Crear la server action de guardado**

```ts
// apps/web-admin/app/(panel)/configuraciones/reglas-abono/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaReglaAbonoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaReglaAbonoRepository";
import type { FrecuenciaPago } from "@gym-app/domain/entities/Plan";
import type { TipoMinimoAbono } from "@gym-app/domain/entities/ReglaAbono";

export interface EstadoReglaAbono {
  error?: string;
}

export async function actualizarReglaAbonoAction(
  frecuencia: FrecuenciaPago,
  _estadoPrevio: EstadoReglaAbono,
  formData: FormData
): Promise<EstadoReglaAbono> {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario } = sesion;
  if (usuario.rol !== "SOCIO") {
    return { error: "Solo el socio puede configurar las reglas de abono." };
  }

  const activo = formData.get("activo")?.toString() === "on";
  const tipo = formData.get("tipo")?.toString() as TipoMinimoAbono | undefined;
  const valor = Number(formData.get("valor"));

  if (!tipo || Number.isNaN(valor) || valor < 0) {
    return { error: "Tipo y valor son requeridos." };
  }
  if (tipo === "PORCENTAJE" && valor > 100) {
    return { error: "El porcentaje no puede ser mayor a 100." };
  }

  await new PrismaReglaAbonoRepository(prisma).upsert(usuario.organizacionId, frecuencia, {
    activo,
    tipo,
    valor,
  });

  revalidatePath("/configuraciones/reglas-abono");
  return {};
}
```

- [ ] **Step 4: Crear el componente de fila por frecuencia**

```tsx
// apps/web-admin/app/(panel)/configuraciones/reglas-abono/FormularioReglaAbono.tsx
"use client";

import { useActionState, useState } from "react";
import { Button } from "@gym-app/ui/components/Button";
import { Input } from "@gym-app/ui/components/Input";
import { useFeedback } from "@gym-app/ui/components/FeedbackOverlay";
import { diasAPorcentaje, porcentajeADias, type TipoMinimoAbono } from "@gym-app/domain/entities/ReglaAbono";
import { DURACION_DIAS_POR_FRECUENCIA, type FrecuenciaPago } from "@gym-app/domain/entities/Plan";
import type { EstadoReglaAbono } from "./actions";

const ETIQUETA_FRECUENCIA: Record<FrecuenciaPago, string> = {
  DIARIO: "Diario",
  SEMANAL: "Semanal",
  QUINCENAL: "Quincenal",
  MENSUAL: "Mensual",
};

export function FormularioReglaAbono({
  frecuencia,
  valoresIniciales,
  accion,
}: {
  frecuencia: FrecuenciaPago;
  valoresIniciales: { activo: boolean; tipo: TipoMinimoAbono; valor: number } | null;
  accion: (estado: EstadoReglaAbono, formData: FormData) => Promise<EstadoReglaAbono>;
}) {
  const [estado, enviar, enviando] = useActionState(accion, {});
  const { mostrarExito, mostrarError } = useFeedback();
  const diasDelCiclo = DURACION_DIAS_POR_FRECUENCIA[frecuencia];

  const [activo, setActivo] = useState(valoresIniciales?.activo ?? false);
  const [tipo, setTipo] = useState<TipoMinimoAbono>(valoresIniciales?.tipo ?? "DIAS");
  const [valor, setValor] = useState(String(valoresIniciales?.valor ?? ""));

  const valorNumerico = Number(valor) || 0;
  const equivalente =
    tipo === "DIAS"
      ? `≈ ${diasAPorcentaje(valorNumerico, diasDelCiclo).toFixed(0)}%`
      : `≈ ${porcentajeADias(valorNumerico, diasDelCiclo)} día(s)`;

  return (
    <form
      action={async (formData) => {
        const resultado = await enviar(formData);
        if (!estado.error) mostrarExito(`Regla de ${ETIQUETA_FRECUENCIA[frecuencia]} guardada.`);
        return resultado;
      }}
      className="flex flex-col gap-3 rounded-lg border p-4"
      style={{ borderColor: "var(--gx-edge)" }}
    >
      <div className="flex items-center justify-between">
        <h3 className="font-semibold" style={{ color: "var(--gx-ink)" }}>
          {ETIQUETA_FRECUENCIA[frecuencia]}
        </h3>
        <label className="flex items-center gap-2 text-sm" style={{ color: "var(--gx-muted)" }}>
          <input
            type="checkbox"
            name="activo"
            checked={activo}
            onChange={(e) => setActivo(e.target.checked)}
            className="h-5 w-5 accent-[var(--gx-accent)]"
          />
          Activo
        </label>
      </div>

      {estado.error && (
        <p className="text-sm" style={{ color: "var(--gx-bad)" }}>
          {estado.error}
        </p>
      )}

      {activo && (
        <div className="flex items-end gap-3">
          <label className="flex flex-col gap-1.5 text-sm" style={{ color: "var(--gx-muted)" }}>
            Mínimo en
            <select
              name="tipo"
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoMinimoAbono)}
              className="min-h-11 rounded-lg border px-3 outline-none focus:border-[var(--gx-accent)]"
              style={{ background: "var(--gx-surface-2)", borderColor: "var(--gx-edge)", color: "var(--gx-ink)" }}
            >
              <option value="DIAS">Días</option>
              <option value="PORCENTAJE">Porcentaje</option>
            </select>
          </label>

          <Input
            name="valor"
            label={tipo === "DIAS" ? "Días mínimos" : "Porcentaje mínimo"}
            type="number"
            min={0}
            max={tipo === "PORCENTAJE" ? 100 : undefined}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
          />

          <span className="mb-2.5 text-sm" style={{ color: "var(--gx-muted)" }}>
            {equivalente}
          </span>
        </div>
      )}

      <Button type="submit" disabled={enviando} className="self-start">
        {enviando ? "Guardando..." : "Guardar"}
      </Button>
    </form>
  );
}
```

(Revisar la firma exacta de `Input` en `packages/ui/components/Input.tsx` — puede que no acepte `onChange`/`value` directamente como se asume aquí; ajustar según el componente real, siguiendo el mismo patrón que `FormularioPlan.tsx` usa para sus inputs controlados. Revisar también la firma de `useActionState` con acción parcialmente aplicada — este archivo usa un wrapper local `accion` de tipo `(estado, formData) => Promise<...>` para permitir pasar `frecuencia` como argumento fijo desde `page.tsx`, siguiendo el mismo patrón que `actualizarSucursalAction(id, ...)` en `sucursales/actions.ts`; confirmar que el `bind`/wrapper se arma correctamente en `page.tsx`, ej. `actualizarReglaAbonoAction.bind(null, "MENSUAL")`.)

- [ ] **Step 5: Crear la página**

```tsx
// apps/web-admin/app/(panel)/configuraciones/reglas-abono/page.tsx
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaReglaAbonoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaReglaAbonoRepository";
import { listarReglasAbono } from "@gym-app/domain/use-cases/ListarReglasAbono";
import type { FrecuenciaPago } from "@gym-app/domain/entities/Plan";
import { FormularioReglaAbono } from "./FormularioReglaAbono";
import { actualizarReglaAbonoAction } from "./actions";

const FRECUENCIAS: FrecuenciaPago[] = ["DIARIO", "SEMANAL", "QUINCENAL", "MENSUAL"];

export default async function PaginaReglasAbono() {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario } = sesion;

  const reglas = await listarReglasAbono(
    { reglasAbono: new PrismaReglaAbonoRepository(prisma) },
    usuario.organizacionId
  );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm" style={{ color: "var(--gx-muted)" }}>
        Define el monto mínimo de abono y el plazo de acceso que otorga, por
        frecuencia de plan. Un plan individual puede definir su propio
        mínimo en <code>/planes</code>, que sobreescribe esta regla.
      </p>
      {FRECUENCIAS.map((frecuencia) => {
        const regla = reglas.find((r) => r.frecuencia === frecuencia);
        return (
          <FormularioReglaAbono
            key={frecuencia}
            frecuencia={frecuencia}
            valoresIniciales={regla ? { activo: regla.activo, tipo: regla.tipo, valor: regla.valor } : null}
            accion={actualizarReglaAbonoAction.bind(null, frecuencia)}
          />
        );
      })}
    </div>
  );
}
```

- [ ] **Step 6: Verificar compilación**

Run: `npx tsc --noEmit -p apps/web-admin`
Expected: sin errores en los archivos nuevos. Ajustar según los tipos reales de `Input`/`Button`/`useActionState` si difieren de lo asumido.

- [ ] **Step 7: Commit**

```bash
git add apps/web-admin/app/\(panel\)/configuraciones/tabs.ts apps/web-admin/app/\(panel\)/configuraciones/reglas-abono packages/domain/use-cases/ListarReglasAbono.ts
git commit -m "feat: agrega el panel de configuracion de reglas de abono"
```

---

## Task 8: `FormularioPlan.tsx` — checkbox y mínimo propio del plan

**Files:**
- Modify: `apps/web-admin/app/(panel)/planes/FormularioPlan.tsx`
- Modify: `apps/web-admin/app/(panel)/planes/actions.ts`
- Modify: `apps/web-admin/app/(panel)/planes/page.tsx` y `apps/web-admin/app/(panel)/planes/[id]/page.tsx` (pasar los nuevos valores iniciales)

**Interfaces:**
- Consumes: `Plan.permitePagoParcial`/`minimoAbonoTipo`/`minimoAbonoValor` (Task 2); `DURACION_DIAS_POR_FRECUENCIA` (existente); `diasAPorcentaje`/`porcentajeADias` (Task 2).
- Produces: `crearPlanAction`/`actualizarPlanAction` ahora leen y persisten los 3 campos nuevos.

- [ ] **Step 1: Extender `ValoresFormularioPlan` y agregar los controles**

En `FormularioPlan.tsx`:

```ts
export interface ValoresFormularioPlan {
  nombre: string;
  frecuencia: FrecuenciaPago;
  incluyeEntrenador: boolean;
  precioUSD: number;
  multisede: boolean;
  permitePagoParcial: boolean;
  minimoAbonoTipo: TipoMinimoAbono | null;
  minimoAbonoValor: number | null;
}
```

Agregar después del checkbox de `multisede` (fuera del bloque `{!esEdicion && (...)}`, ya que a diferencia de frecuencia/entrenador, esto SÍ debe poder editarse después de crear el plan):

```tsx
        <label className="flex min-h-11 items-center gap-2 text-sm" style={{ color: "var(--gx-muted)" }}>
          <input
            type="checkbox"
            name="permitePagoParcial"
            checked={permitePagoParcial}
            onChange={(e) => setPermitePagoParcial(e.target.checked)}
            className="h-5 w-5 accent-[var(--gx-accent)]"
          />
          Permite pago parcial (abono)
        </label>

        {permitePagoParcial && (
          <div className="flex flex-col gap-2 rounded-lg border p-3" style={{ borderColor: "var(--gx-edge)" }}>
            <label className="flex items-center gap-2 text-sm" style={{ color: "var(--gx-muted)" }}>
              <input
                type="checkbox"
                checked={tieneMinimoPropio}
                onChange={(e) => setTieneMinimoPropio(e.target.checked)}
                className="h-5 w-5 accent-[var(--gx-accent)]"
              />
              Mínimo de abono personalizado para este plan
            </label>

            {tieneMinimoPropio ? (
              <div className="flex items-end gap-3">
                <select
                  name="minimoAbonoTipo"
                  value={minimoAbonoTipo}
                  onChange={(e) => setMinimoAbonoTipo(e.target.value as TipoMinimoAbono)}
                  className="min-h-11 rounded-lg border px-3 outline-none focus:border-[var(--gx-accent)]"
                  style={{ background: "var(--gx-surface-2)", borderColor: "var(--gx-edge)", color: "var(--gx-ink)" }}
                >
                  <option value="DIAS">Días</option>
                  <option value="PORCENTAJE">Porcentaje</option>
                </select>
                <Input
                  name="minimoAbonoValor"
                  label={minimoAbonoTipo === "DIAS" ? "Días mínimos" : "Porcentaje mínimo"}
                  type="number"
                  min={0}
                  value={minimoAbonoValor}
                  onChange={(e) => setMinimoAbonoValor(e.target.value)}
                />
              </div>
            ) : (
              <p className="text-xs" style={{ color: "var(--gx-muted)" }}>
                Usa el mínimo configurado en Configuraciones → Reglas de abono
                para la frecuencia {ETIQUETA_FRECUENCIA[valoresIniciales?.frecuencia ?? "MENSUAL"]}.
              </p>
            )}
          </div>
        )}
```

Agregar el estado correspondiente al inicio del componente:

```ts
  const [permitePagoParcial, setPermitePagoParcial] = useState(valoresIniciales?.permitePagoParcial ?? true);
  const [tieneMinimoPropio, setTieneMinimoPropio] = useState(valoresIniciales?.minimoAbonoTipo !== null && valoresIniciales?.minimoAbonoTipo !== undefined);
  const [minimoAbonoTipo, setMinimoAbonoTipo] = useState<TipoMinimoAbono>(valoresIniciales?.minimoAbonoTipo ?? "DIAS");
  const [minimoAbonoValor, setMinimoAbonoValor] = useState(String(valoresIniciales?.minimoAbonoValor ?? ""));
```

Importar `TipoMinimoAbono` desde `@gym-app/domain/entities/ReglaAbono` y `Input` (ya importado).

Cuando `tieneMinimoPropio` es `false`, el submit NO debe enviar `minimoAbonoTipo`/`minimoAbonoValor` (para que la server action los guarde como `null`) — agregar campos hidden solo cuando `tieneMinimoPropio` es `true`, o que la action interprete la ausencia del campo como `null` (ver Step 2).

- [ ] **Step 2: Actualizar `crearPlanAction`/`actualizarPlanAction`**

En `apps/web-admin/app/(panel)/planes/actions.ts`:

```ts
  const permitePagoParcial = formData.get("permitePagoParcial")?.toString() === "on";
  const minimoAbonoTipoRaw = formData.get("minimoAbonoTipo")?.toString();
  const minimoAbonoValorRaw = formData.get("minimoAbonoValor")?.toString();
  const minimoAbonoTipo = minimoAbonoTipoRaw === "DIAS" || minimoAbonoTipoRaw === "PORCENTAJE" ? minimoAbonoTipoRaw : null;
  const minimoAbonoValor = minimoAbonoTipo !== null && minimoAbonoValorRaw ? Number(minimoAbonoValorRaw) : null;
```

Agregar estos 3 valores al objeto pasado a `crearPlan`/`actualizarPlan` (vía `cambios`/`DatosNuevoPlan`).

- [ ] **Step 3: Pasar los valores iniciales desde las páginas de listado/edición**

En `apps/web-admin/app/(panel)/planes/[id]/page.tsx`, agregar los 3 campos nuevos al objeto `valoresIniciales` pasado a `FormularioPlan`. Revisar `planes/page.tsx` por si también construye un objeto similar (probablemente no, esa es la lista, no el formulario).

- [ ] **Step 4: Verificar compilación**

Run: `npx tsc --noEmit -p apps/web-admin`
Expected: sin errores en los archivos de `planes/`.

- [ ] **Step 5: Commit**

```bash
git add apps/web-admin/app/\(panel\)/planes
git commit -m "feat: agrega permite pago parcial y minimo de abono al formulario de plan"
```

---

## Task 9: Wizard — mover el selector de modalidad al Paso 2, bloquear monto en Total

**Files:**
- Modify: `apps/web-admin/app/(panel)/caja/ModalRegistrarPagoCaja.tsx`
- Modify: `apps/web-admin/app/(panel)/caja/SelectorMiembroModal.tsx` (extender `PlanParaModal`)
- Modify: `apps/web-admin/app/(panel)/caja/BotonRegistrarPagoCaja.tsx` y `apps/web-admin/app/(panel)/caja/page.tsx` (mapear los campos nuevos de `Plan` a `PlanParaModal`)

**Interfaces:**
- Consumes: `Plan.permitePagoParcial`/`minimoAbonoTipo`/`minimoAbonoValor` (Task 2); `calcularMontoMinimoAbono`/`calcularFechaLimiteAbono` (Task 2, réplica cliente).
- Produces: `ModalRegistrarPagoCaja` gana estado `modalidadElegida` en el componente padre, pasado a `ContenidoPaso2` y `ContenidoPaso3` — Task 10 (panel flotante) consume el estado `lineasCombinadas` que ya vive en `ContenidoPaso3` sin cambios de tipo.

- [ ] **Step 1: Extender `PlanParaModal`**

En `apps/web-admin/app/(panel)/caja/SelectorMiembroModal.tsx`:

```ts
export interface PlanParaModal {
  id: string;
  nombre: string;
  precioUSD: number;
  multisede: boolean;
  frecuencia: FrecuenciaPago;
  permitePagoParcial: boolean;
  minimoAbonoTipo: TipoMinimoAbono | null;
  minimoAbonoValor: number | null;
}
```

(Importar `TipoMinimoAbono` desde `@gym-app/domain/entities/ReglaAbono`.)

- [ ] **Step 2: Actualizar el mapeo en `caja/page.tsx`**

Revisar cómo se construye el array `planesActivos`/`planes` que llega a `BotonRegistrarPagoCaja` — si `listarPlanes` ya devuelve `Plan[]` completo (con los 3 campos nuevos gracias a Task 2/3), y `PlanParaModal` es un subtipo estructural de `Plan`, es posible que no haga falta ningún mapeo explícito — TypeScript solo exige que el objeto tenga AL MENOS esos campos. Confirmar leyendo el código real; si hay un `.map()` explícito que construye `PlanParaModal` campo por campo, agregar los 3 nuevos ahí.

- [ ] **Step 3: Mover el selector de modalidad a `ContenidoPaso2`**

En `ModalRegistrarPagoCaja.tsx`, agregar estado de modalidad en el componente padre `ModalRegistrarPagoCaja`:

```ts
  const [modalidadElegida, setModalidadElegida] = useState<"total" | "abono" | "combinado">("total");
```

En `ContenidoPaso2`, agregar el selector (mismo patrón visual de 3 botones que ya existe en `ContenidoPaso3` hoy — moverlo tal cual, con sus estilos), recibiendo `modalidadElegida`/`onCambiarModalidad` como props nuevas, y deshabilitando "Abono" cuando `planEfectivo.permitePagoParcial === false`:

```tsx
      {planEfectivo && (
        <div className="flex gap-2">
          {(
            [
              { valor: "total" as const, etiqueta: "Pago total" },
              { valor: "abono" as const, etiqueta: "Abono parcial", deshabilitado: !planEfectivo.permitePagoParcial },
              { valor: "combinado" as const, etiqueta: "Pago combinado" },
            ]
          ).map((opcion) => (
            <button
              key={opcion.valor}
              type="button"
              disabled={opcion.deshabilitado}
              onClick={() => !opcion.deshabilitado && onCambiarModalidad(opcion.valor)}
              className="min-h-11 flex-1 rounded-lg border px-3 text-sm font-medium transition-colors duration-150 disabled:opacity-40"
              style={
                modalidadElegida === opcion.valor
                  ? { borderColor: "var(--gx-accent)", background: "var(--gx-accent)", color: "var(--gx-accent-ink)" }
                  : { borderColor: "var(--gx-edge)", color: "var(--gx-ink)" }
              }
            >
              {opcion.etiqueta}
            </button>
          ))}
        </div>
      )}
      {planEfectivo && !planEfectivo.permitePagoParcial && (
        <p className="text-xs" style={{ color: "var(--gx-muted)" }}>
          Este plan no admite abonos — solo pago total o combinado.
        </p>
      )}
```

Quitar el bloque equivalente de `ContenidoPaso3` (el selector de 3 botones que hoy vive ahí).

- [ ] **Step 4: Pasar `modalidadElegida` a `ContenidoPaso3` y quitar su propio estado de modalidad**

`ContenidoPaso3` deja de tener su propio `useState<Modalidad>`, recibe `modalidad` como prop desde el padre. El resto de su lógica (líneas, submit, proyección) sigue igual, solo cambia de dónde viene el valor de `modalidad`.

- [ ] **Step 5: Bloquear el monto en modalidad Total**

En la sección donde hoy se renderiza `CurrencyInput` para el "Monto a cobrar"/"Total a pagar", condicionar a que la modalidad NO sea `"total"`:

```tsx
      {montoSugerido > 0 && modalidad !== "total" && (
        <CurrencyInput
          name="montoObjetivo"
          label={modalidad === "combinado" ? "Total a pagar" : "Monto a cobrar"}
          moneda="USD"
          required
          value={montoObjetivoTexto}
          onChange={setMontoObjetivoTexto}
        />
      )}
      {montoSugerido > 0 && modalidad === "total" && (
        <div className="flex justify-between rounded-lg px-3 py-2 text-sm" style={{ background: "var(--gx-surface-2)" }}>
          <span style={{ color: "var(--gx-muted)" }}>Monto a cobrar</span>
          <span className="font-semibold" style={{ color: "var(--gx-ink)" }}>${montoSugerido.toFixed(2)}</span>
        </div>
      )}
```

Y asegurar que `montoObjetivoTexto`/`montoObjetivo` se inicialicen (y se mantengan) en `String(montoSugerido)` cuando `modalidad === "total"`, sin permitir que cambie — el `useEffect`/inicialización que ya existía para resetear el monto al cambiar a "total" (mencionado en el código explorado) debe seguir aplicando, ahora disparado por el cambio de `modalidad` que llega como prop en vez de estado local.

- [ ] **Step 6: Verificar compilación**

Run: `npx tsc --noEmit -p apps/web-admin`
Expected: sin errores.

- [ ] **Step 7: Trazar manualmente los 3 escenarios (sin test runner, sin navegador disponible)**

Documentar en el reporte de la tarea, con el código real ya modificado:
(a) Plan con `permitePagoParcial=false`: el botón "Abono parcial" debe renderizar `disabled`, y su `onClick` no debe ejecutar `onCambiarModalidad` aunque se fuerce el clic (verificar la guarda `!opcion.deshabilitado &&`).
(b) Modalidad Total: confirmar que no se renderiza ningún `CurrencyInput` editable, y que el monto que termina en el `lineas` JSON enviado sigue siendo `montoSugerido` exacto (trazar el camino de datos hasta el input hidden).
(c) Cambiar de Total a Abono y de vuelta a Total: confirmar que el monto vuelve a `montoSugerido` sin quedar con un valor residual de cuando estuvo en modalidad Abono.

- [ ] **Step 8: Commit**

```bash
git add apps/web-admin/app/\(panel\)/caja/ModalRegistrarPagoCaja.tsx apps/web-admin/app/\(panel\)/caja/SelectorMiembroModal.tsx apps/web-admin/app/\(panel\)/caja/BotonRegistrarPagoCaja.tsx apps/web-admin/app/\(panel\)/caja/page.tsx
git commit -m "feat: mueve el selector de modalidad de pago al paso 2 del wizard"
```

---

## Task 10: Validación en vivo del mínimo y plazo de abono (Paso 3, modalidad Abono)

**Files:**
- Create: `apps/web-admin/app/(panel)/caja/proyeccionAbono.ts`
- Modify: `apps/web-admin/app/(panel)/caja/ModalRegistrarPagoCaja.tsx`

**Interfaces:**
- Consumes: `resolverReglaAbono`, `calcularMontoMinimoAbono`, `calcularFechaLimiteAbono` (Task 2); `PlanParaModal.minimoAbonoTipo`/`minimoAbonoValor` (Task 9); regla de frecuencia — necesita llegar al cliente (ver Step 1).

- [ ] **Step 1: Decidir cómo llega la regla de frecuencia al cliente**

El wizard corre en el cliente (`"use client"`) y no puede llamar directo a `IReglaAbonoRepository` (server-only). Opción más simple: `caja/page.tsx` (server component) ya carga los datos antes de renderizar — agregar ahí una llamada a `listarReglasAbono` (Task 7) y pasar el array completo de `ReglaAbonoPorFrecuencia` como prop nueva hasta `ModalRegistrarPagoCaja` (mismo patrón que ya se usa para `metodosPago`/`lineasResumenTurno`). Esto evita crear un endpoint nuevo.

Agregar `reglasAbono: ReglaAbonoPorFrecuencia[]` como prop en la cadena `page.tsx` → `BotonRegistrarPagoCaja` → `ModalRegistrarPagoCaja` → `ContenidoPaso3`.

- [ ] **Step 2: Crear `proyeccionAbono.ts` (réplica cliente del motor de reglas)**

```ts
// Réplica intencional de RegistrarPago.ts/ReglaAbono.ts — mismo criterio,
// para que lo mostrado ANTES de pagar (mínimo aceptable, fecha límite)
// coincida con lo que el servidor calculará al confirmar. Ver
// packages/domain/entities/ReglaAbono.ts.
import {
  resolverReglaAbono,
  calcularMontoMinimoAbono,
  calcularFechaLimiteAbono,
  type ReglaAbonoPorFrecuencia,
  type TipoMinimoAbono,
} from "@gym-app/domain/entities/ReglaAbono";
import { DURACION_DIAS_POR_FRECUENCIA, type FrecuenciaPago } from "@gym-app/domain/entities/Plan";

export interface ProyeccionAbono {
  montoMinimo: number;
  fechaLimite: Date | null;
  cumpleMinimo: boolean;
}

export function calcularProyeccionAbono(
  plan: { minimoAbonoTipo: TipoMinimoAbono | null; minimoAbonoValor: number | null; frecuencia: FrecuenciaPago; precioUSD: number },
  reglasAbono: ReglaAbonoPorFrecuencia[],
  montoAcumulado: number,
  fechaInicioCiclo: Date
): ProyeccionAbono {
  const reglaFrecuencia = reglasAbono.find((r) => r.frecuencia === plan.frecuencia) ?? null;
  const reglaEfectiva = resolverReglaAbono(
    { minimoAbonoTipo: plan.minimoAbonoTipo, minimoAbonoValor: plan.minimoAbonoValor },
    reglaFrecuencia
  );
  const diasDelCiclo = DURACION_DIAS_POR_FRECUENCIA[plan.frecuencia];
  const montoMinimo = calcularMontoMinimoAbono(reglaEfectiva, plan.precioUSD, diasDelCiclo);
  const fechaLimite = calcularFechaLimiteAbono(reglaEfectiva, montoAcumulado, plan.precioUSD, fechaInicioCiclo, diasDelCiclo);

  return { montoMinimo, fechaLimite, cumpleMinimo: montoAcumulado >= montoMinimo };
}
```

- [ ] **Step 3: Consumir la proyección en `ContenidoPaso3` (modalidad Abono)**

Debajo del `CurrencyInput` de monto, cuando `modalidad === "abono"`, mostrar:

```tsx
      {modalidad === "abono" && montoObjetivo > 0 && (
        <p className="text-sm" style={{ color: proyeccionAbono.cumpleMinimo ? "var(--gx-muted)" : "var(--gx-bad)" }}>
          {proyeccionAbono.cumpleMinimo
            ? proyeccionAbono.fechaLimite
              ? `Este abono da acceso hasta el ${proyeccionAbono.fechaLimite.toLocaleDateString("es-VE")}.`
              : "Este monto cubre el plan completo."
            : `El abono mínimo para este plan es $${proyeccionAbono.montoMinimo.toFixed(2)}.`}
        </p>
      )}
```

Calcular `proyeccionAbono` con `calcularProyeccionAbono(planEfectivo, reglasAbono, montoObjetivo, fechaInicioCicloEstimada)`. Para `fechaInicioCicloEstimada`, usar la misma fecha base que ya calcula `proyeccionRenovacion.ts` (revisar cómo el Paso 2 ya obtiene esa fecha y pasarla hacia abajo, o recalcularla inline con el mismo criterio `base = vigente ? fechaVencimiento : ahora`).

Deshabilitar el submit cuando `modalidad === "abono" && !proyeccionAbono.cumpleMinimo`, agregando esa condición al `disabled` del botón "Registrar pago" existente.

- [ ] **Step 4: Verificar compilación**

Run: `npx tsc --noEmit -p apps/web-admin`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add apps/web-admin/app/\(panel\)/caja/proyeccionAbono.ts apps/web-admin/app/\(panel\)/caja/ModalRegistrarPagoCaja.tsx apps/web-admin/app/\(panel\)/caja/BotonRegistrarPagoCaja.tsx apps/web-admin/app/\(panel\)/caja/page.tsx
git commit -m "feat: agrega validacion en vivo del minimo y plazo de abono en el wizard"
```

---

## Task 11: Panel flotante de remanente (modalidad Combinado)

**Files:**
- Create: `apps/web-admin/app/(panel)/caja/PanelRemanentePago.tsx`
- Modify: `apps/web-admin/app/(panel)/caja/ModalRegistrarPagoCaja.tsx`

**Interfaces:**
- Consumes: el estado `lineasCombinadas` y `montoObjetivo` que ya existen en `ContenidoPaso3` (sin cambios de tipo).

- [ ] **Step 1: Crear el componente `PanelRemanentePago`**

```tsx
// apps/web-admin/app/(panel)/caja/PanelRemanentePago.tsx
"use client";

interface LineaMostrada {
  metodo: string;
  monto: number;
}

export function PanelRemanentePago({
  lineas,
  montoObjetivo,
  tasaReferencia,
}: {
  lineas: LineaMostrada[];
  montoObjetivo: number;
  // Tasa Bs/USD a usar para la conversión del remanente — se toma de la
  // primera línea que ya tenga una tasa elegida, o null si ninguna la
  // tiene todavía (en ese caso solo se muestra el remanente en USD).
  tasaReferencia: number | null;
}) {
  const sumaLineas = lineas.reduce((suma, l) => suma + l.monto, 0);
  const remanente = Math.max(0, montoObjetivo - sumaLineas);

  return (
    <div
      className="fixed bottom-6 right-6 z-[60] w-72 rounded-xl border-2 p-4 shadow-2xl"
      style={{ borderColor: "var(--gx-accent)", background: "var(--gx-surface)" }}
    >
      <p className="text-xs font-semibold uppercase" style={{ color: "var(--gx-muted)" }}>
        Distribución del pago
      </p>
      <div className="mt-2 flex flex-col gap-1">
        {lineas
          .filter((l) => l.monto > 0)
          .map((linea, indice) => (
            <div key={indice} className="flex justify-between text-sm">
              <span style={{ color: "var(--gx-muted)" }}>{linea.metodo || "Sin método"}</span>
              <span style={{ color: "var(--gx-ink)" }}>${linea.monto.toFixed(2)}</span>
            </div>
          ))}
      </div>
      <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--gx-edge)" }}>
        {remanente > 0 ? (
          <>
            <p className="text-sm font-semibold" style={{ color: "var(--gx-bad)" }}>
              Faltan ${remanente.toFixed(2)}
            </p>
            {tasaReferencia !== null && (
              <p className="text-xs" style={{ color: "var(--gx-muted)" }}>
                ≈ Bs. {(remanente * tasaReferencia).toFixed(2)}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm font-semibold" style={{ color: "var(--gx-accent)" }}>
            Monto completo
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Renderizar el panel en `ContenidoPaso3` cuando `modalidad === "combinado"`**

```tsx
      {modalidad === "combinado" && (
        <PanelRemanentePago
          lineas={lineasCombinadas.map((l) => ({ metodo: l.seleccion.metodo, monto: Number(l.monto) || 0 }))}
          montoObjetivo={montoObjetivo}
          tasaReferencia={lineasCombinadas.find((l) => l.seleccion.tasaCambio !== null)?.seleccion.tasaCambio ?? null}
        />
      )}
```

Importar `PanelRemanentePago` en `ModalRegistrarPagoCaja.tsx`.

- [ ] **Step 3: Verificar compilación**

Run: `npx tsc --noEmit -p apps/web-admin`
Expected: sin errores.

- [ ] **Step 4: Trazar manualmente (sin test runner, sin navegador)**

Documentar en el reporte: con 2 líneas ingresadas ($10 y $5, objetivo $30), el panel debe mostrar ambas líneas, "Faltan $15.00", y su equivalente en Bs si alguna línea ya tiene tasa elegida. Con la suma exacta al objetivo, debe mostrar "Monto completo" sin remanente negativo.

- [ ] **Step 5: Commit**

```bash
git add apps/web-admin/app/\(panel\)/caja/PanelRemanentePago.tsx apps/web-admin/app/\(panel\)/caja/ModalRegistrarPagoCaja.tsx
git commit -m "feat: agrega el panel flotante de remanente al pago combinado"
```

---

## Verificación final end-to-end

- [ ] `npx tsc --noEmit -p apps/web-admin` y `npx tsc --noEmit -p apps/kiosk` — ambos sin errores nuevos (solo el error preexistente y ajeno de `layout.tsx`/`LayoutProps`, si sigue presente).
- [ ] `cd packages/db && npx prisma validate` y `npx prisma generate`.
- [ ] Si hay conexión a base de datos disponible en el entorno de verificación: aplicar la migración (`npx prisma migrate dev` o `migrate deploy`) y confirmar con una consulta directa que las columnas/tabla nuevas existen.
- [ ] Prueba manual end-to-end (pendiente, a cargo del usuario, sin navegador/DB disponible durante la implementación): configurar una regla de abono para MENSUAL (ej. mínimo 10%), crear o editar un plan mensual con abono permitido, registrar un abono por debajo del mínimo (debe rechazarse con el mensaje del monto exacto), un abono válido (verificar que compila y no rompe el flujo existente de abonos), y confirmar visualmente el reordenamiento del wizard (modalidad en Paso 2, monto fijo en Total, panel flotante en Combinado). Confirmar también el nuevo mensaje del kiosco cuando se simula un `fechaLimiteAbono` vencido.
