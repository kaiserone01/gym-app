# Cambio de plan con prorrateo en cualquier sentido — Plan de implementación

> **Para agentes:** REQUIRED SUB-SKILL: usar superpowers:executing-plans para implementar este plan tarea por tarea.

**Objetivo:** Permitir cambiar de plan a mitad de ciclo en cualquier sentido
(subir o bajar, cualquier frecuencia), prorrateando el valor no consumido
del ciclo actual en dos modos elegibles (solo ajustar vencimiento, o pagar
un ciclo completo del nuevo cobrando/acreditando la diferencia), con un
saldo a favor persistente que se descuenta automáticamente del próximo pago.

**Arquitectura:** Nueva fórmula pura en el dominio
(`packages/domain/use-cases/CambiarPlanConPago.ts`), un campo nuevo
`Miembro.saldoAFavorUSD` consumido automáticamente en `RegistrarPago`, y
una réplica cliente de la fórmula (mismo patrón que `proyeccionAbono.ts`)
para mostrar ambos modos en vivo en `FormularioCambiarPlan`.

**Tech Stack:** Next.js App Router, Server Actions, Prisma (PostgreSQL),
TypeScript sin test runner (verificación vía `tsc --noEmit`).

**Spec:** `docs/superpowers/specs/2026-09-26-cambio-plan-con-prorrateo-design.md`

## Global Constraints

- Sin test runner en este repo — cada tarea verifica con
  `npx tsc --noEmit -p apps/web-admin` y `npx tsc --noEmit -p apps/kiosk`,
  más trazas manuales con un script Node/tsx desechable (escrito, corrido,
  borrado) para las funciones puras de prorrateo.
- Migraciones SQL escritas a mano en
  `packages/db/prisma/migrations/<timestamp>_<nombre>/migration.sql` (no
  se corre `prisma migrate dev` en este entorno) — mismo patrón que
  `20260926130000_agrega_reglas_abono`.
- Commits: una sola línea, en español, sin firmas ni cuerpo (regla del
  proyecto, `CLAUDE.md`).
- `Miembro.saldoAFavorUSD` nunca baja de 0; el consumo automático en
  `RegistrarPago` nunca lo deja negativo.
- El cobro de la diferencia en Modo B nunca admite abono parcial — un solo
  pago, un solo método, igual que el cobro de diferencia actual.
- Sin ciclo vigente, `cambiarPlanConPago` sigue lanzando
  `SinCicloVigenteError` sin ningún cálculo de prorrateo.

## Review Focus

- Miembro con `precioViejo` o `diasDelCicloViejo` en 0 (plan de cortesía)
  — la fórmula no debe dividir por cero al calcular `valorNoConsumido`.
- `diasRestantes` negativo si `activa.fin` ya pasó pero el caller no
  detectó "sin ciclo vigente" correctamente — debe quedar en 0, nunca
  negativo, antes de multiplicar.
- Cambio de plan al mismo plan (`planNuevoId === planActualId`) — ya se
  bloquea en la UI (`disabled` en el `<option>`), pero el use-case no debe
  asumir que nunca llega ese caso desde un FormData armado a mano.
- Modo B con `diferencia` exactamente `0` — no debe pedir método de pago
  ni generar saldo a favor ni crear un `Pago` de $0.
- Saldo a favor mayor al precio del plan del próximo pago — debe cubrir el
  pago completo dejando el resto del saldo disponible, no solo descontar
  hasta $0 el saldo perdiendo el remanente sin usar.

---

## Tarea 1: Migración de base de datos — `Miembro.saldoAFavorUSD`

**Archivos:**
- Modificar: `packages/db/prisma/schema.prisma`
- Crear: `packages/db/prisma/migrations/20260926140000_agrega_saldo_a_favor/migration.sql`

**Interfaces:**
- Produce: columna `Miembro.saldoAFavorUSD` (`Decimal(10,2)`, default `0`,
  `NOT NULL`), consumida por la Tarea 2 (entidad de dominio) y la Tarea 4
  (repositorio Prisma).

- [ ] **Paso 1: Agregar el campo al modelo `Miembro`**

En `packages/db/prisma/schema.prisma`, dentro de `model Miembro` (línea
136, justo después de `precioPlan`):

```prisma
  precioPlan       Decimal      @db.Decimal(10, 2) // precio vigente que paga (puede diferir del precio de catálogo del Plan, ej. "Personalizado")
  saldoAFavorUSD   Decimal      @db.Decimal(10, 2) @default(0) // crédito generado al bajar de plan (ver CambiarPlanConPago) — se descuenta automáticamente del próximo pago (ver RegistrarPago), sin importar el plan de ese pago
  fechaUltimoPago  DateTime?
```

- [ ] **Paso 2: Escribir la migración SQL a mano**

Crear el directorio `packages/db/prisma/migrations/20260926140000_agrega_saldo_a_favor/`
con `migration.sql`:

```sql
-- AlterTable
ALTER TABLE "Miembro" ADD COLUMN "saldoAFavorUSD" DECIMAL(10,2) NOT NULL DEFAULT 0;
```

- [ ] **Paso 3: Verificar que el cliente Prisma generado reconoce el campo**

Run: `cd packages/db && npx prisma generate`
Expected: termina sin error, imprime "Generated Prisma Client".

- [ ] **Paso 4: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations/20260926140000_agrega_saldo_a_favor
git commit -m "agrega saldoAFavorUSD al miembro para el credito de cambio de plan"
```

---

## Tarea 2: Entidad `Miembro` y puerto `IMemberRepository`

**Archivos:**
- Modificar: `packages/domain/entities/Miembro.ts`
- Modificar: `packages/domain/ports/IMemberRepository.ts` (sin cambios de
  firma — `CambiosMiembro` ya cubre el caso, ver Paso 1)

**Interfaces:**
- Consume: nada nuevo.
- Produce: `Miembro.saldoAFavorUSD: number`, `CambiosMiembro.saldoAFavorUSD?: number`
  — consumidos por la Tarea 3 (`RegistrarPago`) y la Tarea 5
  (`CambiarPlanConPago`).

- [ ] **Paso 1: Agregar el campo a `Miembro`, `DatosNuevoMiembro` y `CambiosMiembro`**

En `packages/domain/entities/Miembro.ts`:

```ts
export interface Miembro {
  id: string;
  organizacionId: string;
  sucursalId: string | null;
  nombre: string;
  cedula: string;
  fechaInscripcion: Date | null;
  fechaNacimiento: Date | null;
  celular: string | null;
  fotoUrl: string | null;
  entrenadorId: string | null;
  entrenadorNombre: string | null;
  planId: string | null;
  precioPlan: number;
  saldoAFavorUSD: number;
  fechaUltimoPago: Date | null;
  fechaVencimiento: Date | null;
  activo: boolean;
  createdAt: Date;
}
```

`DatosNuevoMiembro` NO gana el campo — un miembro nuevo siempre arranca en
$0, no hace falta poder fijarlo al crear.

`CambiosMiembro` gana `saldoAFavorUSD?: number` (junto a `precioPlan?`).

- [ ] **Paso 2: Verificar compilación**

Run: `npx tsc --noEmit -p apps/web-admin`
Expected: falla — `PrismaMemberRepository.ts` no mapea el campo nuevo
todavía (Tarea 4). Confirma que el tipo `Miembro` ya lo exige.

- [ ] **Paso 3: Commit**

```bash
git add packages/domain/entities/Miembro.ts
git commit -m "agrega saldoAFavorUSD a la entidad Miembro"
```

---

## Tarea 3: Repositorio Prisma — mapear y actualizar `saldoAFavorUSD`

**Archivos:**
- Modificar: `packages/infrastructure/persistence/prisma/PrismaMemberRepository.ts`

**Interfaces:**
- Consume: `Miembro.saldoAFavorUSD`, `CambiosMiembro.saldoAFavorUSD` (Tarea 2).
- Produce: `PrismaMemberRepository` lee y persiste el campo — consumido
  por la Tarea 6 (`RegistrarPago`) y la Tarea 7 (`CambiarPlanConPago`).

- [ ] **Paso 1: Agregar el campo al tipo `FilaMiembro` y a `mapear()`**

En `packages/infrastructure/persistence/prisma/PrismaMemberRepository.ts`:

```ts
type FilaMiembro = {
  id: string;
  organizacionId: string;
  sucursalId: string | null;
  nombre: string;
  cedula: string;
  fechaInscripcion: Date | null;
  fechaNacimiento: Date | null;
  celular: string | null;
  fotoUrl: string | null;
  entrenadorId: string | null;
  entrenador?: { nombre: string } | null;
  planId: string | null;
  precioPlan: { toNumber(): number };
  saldoAFavorUSD: { toNumber(): number };
  fechaUltimoPago: Date | null;
  fechaVencimiento: Date | null;
  activo: boolean;
  createdAt: Date;
};

function mapear(miembro: FilaMiembro): Miembro {
  return {
    id: miembro.id,
    organizacionId: miembro.organizacionId,
    sucursalId: miembro.sucursalId,
    nombre: miembro.nombre,
    cedula: miembro.cedula,
    fechaInscripcion: miembro.fechaInscripcion,
    fechaNacimiento: miembro.fechaNacimiento,
    celular: miembro.celular,
    fotoUrl: miembro.fotoUrl,
    entrenadorId: miembro.entrenadorId,
    entrenadorNombre: miembro.entrenador?.nombre ?? null,
    planId: miembro.planId,
    precioPlan: miembro.precioPlan.toNumber(),
    saldoAFavorUSD: miembro.saldoAFavorUSD.toNumber(),
    fechaUltimoPago: miembro.fechaUltimoPago,
    fechaVencimiento: miembro.fechaVencimiento,
    activo: miembro.activo,
    createdAt: miembro.createdAt,
  };
}
```

- [ ] **Paso 2: Mapear el campo nuevo en el método `actualizar()`**

Buscar el método `actualizar(organizacionId, id, cambios)` en el mismo
archivo — agregar `saldoAFavorUSD` al objeto `data` que arma para
`prisma.miembro.update`, siguiendo el mismo patrón que `precioPlan`:

```ts
    data: {
      ...(cambios.nombre !== undefined ? { nombre: cambios.nombre } : {}),
      // ... resto de campos existentes sin tocar ...
      ...(cambios.precioPlan !== undefined ? { precioPlan: cambios.precioPlan } : {}),
      ...(cambios.saldoAFavorUSD !== undefined ? { saldoAFavorUSD: cambios.saldoAFavorUSD } : {}),
      ...(cambios.activo !== undefined ? { activo: cambios.activo } : {}),
    },
```

- [ ] **Paso 3: Verificar compilación**

Run: `npx tsc --noEmit -p apps/web-admin`
Expected: pasa sin error relacionado a `PrismaMemberRepository.ts` o
`Miembro`/`CambiosMiembro` (pueden quedar errores de otras tareas
pendientes — solo importa que este archivo ya no los genere).

- [ ] **Paso 4: Commit**

```bash
git add packages/infrastructure/persistence/prisma/PrismaMemberRepository.ts
git commit -m "mapea y persiste saldoAFavorUSD en el repositorio de miembros"
```

---

## Tarea 4: Fórmula de prorrateo pura — `calcularProrrateoPlan`

**Archivos:**
- Crear: `packages/domain/entities/CambioPlan.ts`

**Interfaces:**
- Consume: `DURACION_DIAS_POR_FRECUENCIA` de `packages/domain/entities/Plan.ts`.
- Produce: `calcularProrrateoPlan(...)`, tipo `ProrrateoPlan` — consumidos
  por la Tarea 7 (`CambiarPlanConPago`) y la Tarea 10 (réplica cliente).

- [ ] **Paso 1: Escribir la función pura con ambos modos**

Crear `packages/domain/entities/CambioPlan.ts`:

```ts
// Prorrateo de un cambio de plan a mitad de ciclo — ver diseño en
// docs/superpowers/specs/2026-09-26-cambio-plan-con-prorrateo-design.md.
// Función pura, sin dependencias de infraestructura, para poder
// replicarla client-side (ver apps/web-admin/app/(panel)/caja/calcularProrrateoPlan.ts)
// con el mismo criterio que usa CambiarPlanConPago.ts.
import { DURACION_DIAS_POR_FRECUENCIA, type FrecuenciaPago } from "./Plan";

export type ModoCambioPlan = "AJUSTAR_VENCIMIENTO" | "CICLO_COMPLETO";

export interface DatosProrrateoPlan {
  precioViejo: number;
  frecuenciaVieja: FrecuenciaPago;
  precioNuevo: number;
  frecuenciaNueva: FrecuenciaPago;
  // Vencimiento vigente ANTES del cambio — ya se validó en el caller que
  // hay un ciclo vigente (fechaVencimientoActual > ahora); si no lo
  // hubiera, diasRestantes queda en 0 y valorNoConsumido en $0.
  fechaVencimientoActual: Date;
  ahora: Date;
  modo: ModoCambioPlan;
}

export interface ProrrateoPlan {
  diasRestantes: number;
  valorNoConsumido: number;
  nuevoVencimiento: Date;
  // Positiva = se cobra; negativa = se acredita como saldo a favor; 0 =
  // ninguna de las dos. Siempre 0 en modo AJUSTAR_VENCIMIENTO.
  diferencia: number;
}

export function calcularProrrateoPlan(datos: DatosProrrateoPlan): ProrrateoPlan {
  const {
    precioViejo,
    frecuenciaVieja,
    precioNuevo,
    frecuenciaNueva,
    fechaVencimientoActual,
    ahora,
    modo,
  } = datos;

  const diasDelCicloViejo = DURACION_DIAS_POR_FRECUENCIA[frecuenciaVieja];
  const diasDelCicloNuevo = DURACION_DIAS_POR_FRECUENCIA[frecuenciaNueva];

  const diasRestantesCrudo = (fechaVencimientoActual.getTime() - ahora.getTime()) / (24 * 60 * 60 * 1000);
  const diasRestantes = Math.max(0, diasRestantesCrudo);

  // precioViejo o diasDelCicloViejo en 0 (plan de cortesía) — no hay nada
  // que prorratear, el valor no consumido es $0, nunca se divide por cero.
  const valorNoConsumido = precioViejo > 0 && diasDelCicloViejo > 0 ? diasRestantes * (precioViejo / diasDelCicloViejo) : 0;

  if (modo === "AJUSTAR_VENCIMIENTO") {
    // precioNuevo en 0 (plan de cortesía nuevo) — no hay precio-por-día
    // que convertir, el vencimiento simplemente no se mueve más allá de
    // ahora (sin generar división por cero).
    const precioPorDiaNuevo = diasDelCicloNuevo > 0 ? precioNuevo / diasDelCicloNuevo : 0;
    const diasNuevos = precioPorDiaNuevo > 0 ? valorNoConsumido / precioPorDiaNuevo : 0;
    const nuevoVencimiento = new Date(ahora.getTime() + diasNuevos * 24 * 60 * 60 * 1000);
    return { diasRestantes, valorNoConsumido, nuevoVencimiento, diferencia: 0 };
  }

  // CICLO_COMPLETO
  const nuevoVencimiento = new Date(ahora);
  nuevoVencimiento.setDate(nuevoVencimiento.getDate() + diasDelCicloNuevo);
  const diferencia = Math.round((precioNuevo - valorNoConsumido) * 100) / 100;

  return { diasRestantes, valorNoConsumido, nuevoVencimiento, diferencia };
}
```

- [ ] **Paso 2: Verificar con trazas manuales (script desechable)**

Crear `/tmp/trace-prorrateo.mjs` (o en el scratchpad de la sesión) con los
8 casos de la spec, por ejemplo:

```js
import { calcularProrrateoPlan } from "./packages/domain/entities/CambioPlan.ts";
// (ajustar el import a un require/ts-node según cómo se ejecute en este entorno)

const ahora = new Date("2026-09-26T00:00:00Z");
const venc3dias = new Date("2026-09-29T00:00:00Z"); // 3 días restantes

// Caso 1: Semanal $8 -> Mensual $30, Modo A, 3 días restantes
console.log(calcularProrrateoPlan({
  precioViejo: 8, frecuenciaVieja: "SEMANAL",
  precioNuevo: 30, frecuenciaNueva: "MENSUAL",
  fechaVencimientoActual: venc3dias, ahora, modo: "AJUSTAR_VENCIMIENTO",
}));
// Expected: valorNoConsumido ≈ 3.43, diasRestantes = 3, diferencia = 0,
// nuevoVencimiento ≈ ahora + 3.43 días.
```

Run: `node --experimental-strip-types /tmp/trace-prorrateo.mjs` (o el
runner de TS que use el resto del repo para scripts desechables)
Expected: los 8 casos de la sección "Casos de uso cubiertos" de la spec
dan los números documentados ahí (Semanal→Mensual Modo A sin cobro;
Mensual→Semanal Modo A con 17.5 días sin tope; Mensual→Semanal Modo B con
$12 de crédito; etc.). Borrar el script al terminar.

- [ ] **Paso 3: Commit**

```bash
git add packages/domain/entities/CambioPlan.ts
git commit -m "agrega la formula pura de prorrateo para cambio de plan"
```

---

## Tarea 5: `RegistrarPago` — consumo automático de `saldoAFavorUSD`

**Archivos:**
- Modificar: `packages/domain/use-cases/RegistrarPago.ts`

**Interfaces:**
- Consume: `Miembro.saldoAFavorUSD` (Tarea 2), `IMemberRepository.actualizar`
  con `CambiosMiembro.saldoAFavorUSD` (Tarea 3).
- Produce: `registrarPago` descuenta el saldo antes de validar el monto —
  ningún consumidor externo cambia de firma.

- [ ] **Paso 1: Descontar el saldo antes de validar `montoTotal`**

En `packages/domain/use-cases/RegistrarPago.ts`, la validación actual
(línea ~139):

```ts
  const montoTotal = input.lineas.reduce((suma, linea) => suma + linea.monto, 0);

  if (miembro.precioPlan > 0 && montoTotal <= 0) {
    throw new MontoInvalidoError();
  }
```

Insertar el descuento de saldo ANTES de esa validación, calculando el
monto que efectivamente hace falta después de aplicar el crédito:

```ts
  const montoTotal = input.lineas.reduce((suma, linea) => suma + linea.monto, 0);

  // Saldo a favor (generado por un cambio de plan a la baja, ver
  // CambiarPlanConPago) — se descuenta automáticamente del monto que este
  // pago necesita cubrir, sin importar el plan de este pago. Nunca deja
  // el saldo negativo; el consumo se persiste junto con el resto de los
  // cambios de este pago, no antes (para no gastarlo si el pago falla
  // más abajo por otra validación).
  const saldoDisponible = miembro.saldoAFavorUSD;
  const saldoAConsumir = Math.min(saldoDisponible, montoTotal);
  const montoEfectivoRequerido = montoTotal; // el monto que las líneas deben sumar sigue siendo el precio del plan — el saldo se resta de lo que el MIEMBRO debe poner encima, no del precio en sí (ver Paso 2)
```

Aclaración de diseño para este paso: el saldo no cambia `montoTotal` (eso
es lo que las líneas de pago efectivamente suman); reduce lo que se le
exige al miembro cubrir. Como `registrarPago` valida `montoTotal` contra
`miembro.precioPlan` de forma indirecta (vía `montoAcumuladoDelCiclo` más
abajo, línea ~189), el saldo debe aplicarse ahí: tratar el ciclo como si
ya tuviera `saldoAConsumir` acumulado antes de sumar las líneas de este
pago. Reemplazar:

```ts
  const montoAcumuladoDelCiclo = esAbonoDeCicloAbierto
    ? totalPagado(pagosDelCicloAbierto) + montoTotal
    : montoTotal;
```

por:

```ts
  const montoAcumuladoDelCiclo = (esAbonoDeCicloAbierto ? totalPagado(pagosDelCicloAbierto) : 0) + montoTotal + saldoAConsumir;
```

Y el chequeo de `MontoInvalidoError` (plan pago con monto $0) debe seguir
exigiendo que las LÍNEAS tengan algo positivo salvo que el saldo a favor
cubra el plan entero — actualizar:

```ts
  if (miembro.precioPlan > 0 && montoTotal <= 0 && saldoAConsumir < miembro.precioPlan) {
    throw new MontoInvalidoError();
  }
```

- [ ] **Paso 2: Persistir el consumo del saldo junto con el resto de los cambios del pago**

Donde el use-case ya llama `deps.miembros.actualizar(...)` para actualizar
`planId` (rama `else` del `if (esAbonoDeCicloAbierto)`, línea ~238) y en
la rama de abono de ciclo abierto (que hoy NO llama a
`miembros.actualizar`), agregar el descuento de saldo en AMBAS ramas —
tiene que persistirse siempre que `saldoAConsumir > 0`, sea abono de ciclo
abierto o no:

```ts
  if (saldoAConsumir > 0) {
    await deps.miembros.actualizar(input.organizacionId, input.miembroId, {
      saldoAFavorUSD: saldoDisponible - saldoAConsumir,
    });
  }
```

Colocar esta llamada inmediatamente después del bloque
`if (esAbonoDeCicloAbierto) { ... } else { ... }` ya existente (después de
la línea 240), antes de `const turnoAbierto = ...`.

- [ ] **Paso 3: Verificar compilación**

Run: `npx tsc --noEmit -p apps/web-admin`
Expected: sin errores nuevos originados en `RegistrarPago.ts`.

- [ ] **Paso 4: Trazar manualmente el caso de saldo mayor al precio del plan**

Con un script desechable (o razonamiento manual documentado en el
mensaje de commit/PR si no hay forma de ejecutar el use-case aislado sin
mocks de los 7 repositorios): `miembro.saldoAFavorUSD = 50`,
`miembro.precioPlan = 30`, `input.lineas = []` (monto 0) — debe pasar la
validación de `MontoInvalidoError` (saldoAConsumir=30 cubre precioPlan=30),
`montoAcumuladoDelCiclo = 0 + 0 + 30 = 30 = precioPlan` → NO es abono
parcial, se registra el ciclo completo, y el saldo persistido queda en
`50 - 30 = 20` (no se pierden los $20 restantes).

- [ ] **Paso 5: Commit**

```bash
git add packages/domain/use-cases/RegistrarPago.ts
git commit -m "descuenta automaticamente el saldo a favor al registrar un pago"
```

---

## Tarea 6: `CambiarPlanConPago` — nueva fórmula y firma

**Archivos:**
- Modificar: `packages/domain/use-cases/CambiarPlanConPago.ts`

**Interfaces:**
- Consume: `calcularProrrateoPlan` (Tarea 4), `IMemberRepository.actualizar`
  con `saldoAFavorUSD` (Tarea 3), `ISuscripcionRepository.extenderFin`
  (ya existente).
- Produce: `DatosCambiarPlanConPago.modo`, `ResultadoCambioPlan.nuevoVencimiento`
  y `.saldoAFavorGenerado` — consumidos por la Tarea 8
  (`cambiarPlanAction`).

- [ ] **Paso 1: Eliminar `FrecuenciaDistintaError` y su chequeo**

Quitar la clase `FrecuenciaDistintaError` (líneas 59-70) y el bloque:

```ts
  const planViejo = await deps.planes.buscarPorId(input.organizacionId, activa.planId);
  if (planViejo && planViejo.frecuencia !== planNuevo.frecuencia) {
    throw new FrecuenciaDistintaError();
  }
```

reemplazar por (sin el chequeo de frecuencia, conservando `planViejo` para
el precio):

```ts
  const planViejo = await deps.planes.buscarPorId(input.organizacionId, activa.planId);
```

- [ ] **Paso 2: Agregar `modo` a `DatosCambiarPlanConPago` y calcular con `calcularProrrateoPlan`**

Reemplazar el bloque de cálculo de diferencia actual:

```ts
  const precioViejo = planViejo?.precioUSD ?? miembro.precioPlan;
  const diferencia = Math.round(Math.max(0, planNuevo.precioUSD - precioViejo) * 100) / 100;
```

por:

```ts
  const precioViejo = planViejo?.precioUSD ?? miembro.precioPlan;
  const frecuenciaVieja = planViejo?.frecuencia ?? planNuevo.frecuencia; // sin plan viejo resoluble, no hay ciclo previo que prorratear en frecuencia distinta — se asume la misma para no dividir por una frecuencia inexistente
  const prorrateo = calcularProrrateoPlan({
    precioViejo,
    frecuenciaVieja,
    precioNuevo: planNuevo.precioUSD,
    frecuenciaNueva: planNuevo.frecuencia,
    fechaVencimientoActual: activa.fin,
    ahora,
    modo: input.modo,
  });
  const diferencia = prorrateo.diferencia;
```

Agregar `modo: ModoCambioPlan` a la interfaz `DatosCambiarPlanConPago` (con
el import `import { calcularProrrateoPlan, type ModoCambioPlan } from "../entities/CambioPlan";`),
y `nuevoVencimiento: Date`, `saldoAFavorGenerado: number` a
`ResultadoCambioPlan`.

- [ ] **Paso 3: Cobrar solo si `diferencia > 0`, acreditar si `diferencia < 0`**

Reemplazar el bloque `if (diferencia > 0) { ... }` (líneas 155-179) por:

```ts
  let pago: Pago | null = null;
  let saldoAFavorGenerado = 0;

  if (diferencia > 0) {
    if (!input.metodo || !input.metodoPagoId) {
      throw new MetodoPagoRequeridoError();
    }

    const turnoAbierto = await deps.turnos.buscarAbiertoPorSucursal(input.sucursalId);

    pago = await deps.pagos.crear({
      miembroId: input.miembroId,
      sucursalId: input.sucursalId,
      turnoId: turnoAbierto?.id ?? null,
      registradoPorId: input.registradoPorId,
      monto: diferencia,
      metodo: input.metodo,
      metodoPagoId: input.metodoPagoId,
      numeroOperacion: input.numeroOperacion,
      tasaCambio: input.tasaCambio,
      montoBs: input.tasaCambio !== null ? diferencia * input.tasaCambio : null,
      fechaInicioCiclo: activa.inicio,
      fechaFinCiclo: prorrateo.nuevoVencimiento,
      grupoPagoId: null,
    });

    await deps.miembros.actualizarFechasPago(input.miembroId, ahora, prorrateo.nuevoVencimiento);
  } else if (diferencia < 0) {
    saldoAFavorGenerado = Math.abs(diferencia);
    await deps.miembros.actualizar(input.organizacionId, input.miembroId, {
      saldoAFavorUSD: miembro.saldoAFavorUSD + saldoAFavorGenerado,
    });
  }
```

- [ ] **Paso 4: Extender siempre el vencimiento al `nuevoVencimiento` calculado**

Reemplazar:

```ts
  await deps.suscripciones.cambiarPlan(activa.id, input.planNuevoId);
  await deps.miembros.actualizar(input.organizacionId, input.miembroId, {
    planId: input.planNuevoId,
    precioPlan: planNuevo.precioUSD,
    ...(planNuevo.incluyeEntrenador ? { entrenadorId: input.entrenadorId } : {}),
  });

  return { pago, diferencia };
```

por:

```ts
  await deps.suscripciones.cambiarPlan(activa.id, input.planNuevoId);
  await deps.suscripciones.extenderFin(activa.id, prorrateo.nuevoVencimiento);
  await deps.miembros.actualizar(input.organizacionId, input.miembroId, {
    planId: input.planNuevoId,
    precioPlan: planNuevo.precioUSD,
    ...(planNuevo.incluyeEntrenador ? { entrenadorId: input.entrenadorId } : {}),
  });
  // Si diferencia > 0, actualizarFechasPago (Paso 3) ya dejó
  // fechaVencimiento en prorrateo.nuevoVencimiento — este segundo update
  // de miembros no la toca (no está en CambiosMiembro), así que no hay
  // doble escritura conflictiva.

  return { pago, diferencia, nuevoVencimiento: prorrateo.nuevoVencimiento, saldoAFavorGenerado };
```

- [ ] **Paso 5: Verificar compilación**

Run: `npx tsc --noEmit -p apps/web-admin`
Expected: falla en `apps/web-admin/app/(panel)/pagos/actions.ts` (todavía
no pasa `modo`, Tarea 8) — confirma que la nueva firma se propaga
correctamente como error de tipos, no silenciosamente.

- [ ] **Paso 6: Commit**

```bash
git add packages/domain/use-cases/CambiarPlanConPago.ts
git commit -m "aplica prorrateo real y elimina la restriccion de frecuencia en cambio de plan"
```

---

## Tarea 7: `cambiarPlanAction` — pasar `modo` y exponer `saldoAFavorGenerado`

**Archivos:**
- Modificar: `apps/web-admin/app/(panel)/pagos/actions.ts`

**Interfaces:**
- Consume: `cambiarPlanConPago` con `modo` (Tarea 6).
- Produce: `EstadoCambioPlan.saldoAFavorGenerado` — consumido por la
  Tarea 9 (`FormularioCambiarPlan`).

- [ ] **Paso 1: Quitar el import de `FrecuenciaDistintaError` y su manejo**

En el bloque de imports (líneas 30-40), quitar
`FrecuenciaDistintaError` de la lista. En el `catch` de
`cambiarPlanAction` (línea ~291-303), quitar
`error instanceof FrecuenciaDistintaError ||` de la condición.

- [ ] **Paso 2: Leer `modo` del FormData y pasarlo al use-case**

Después de la línea `const entrenadorId = formData.get("entrenadorId")?.toString() || null;`:

```ts
  const modoRaw = formData.get("modo")?.toString();
  const modo = modoRaw === "CICLO_COMPLETO" ? "CICLO_COMPLETO" : "AJUSTAR_VENCIMIENTO";
```

Agregar `modo,` al objeto que se pasa a `cambiarPlanConPago(...)`.

- [ ] **Paso 3: Exponer `saldoAFavorGenerado` y ajustar el mensaje**

En `EstadoCambioPlan`, agregar `saldoAFavorGenerado?: number;` (junto a
`diferencia?: number;`).

Reemplazar el cálculo del mensaje:

```ts
  const mensaje =
    resultado.diferencia > 0
      ? `Plan cambiado — se cobró la diferencia de $${resultado.diferencia.toFixed(2)}.`
      : "Plan cambiado, sin costo adicional.";
```

por:

```ts
  const mensaje =
    resultado.diferencia > 0
      ? `Plan cambiado — se cobró la diferencia de $${resultado.diferencia.toFixed(2)}.`
      : resultado.saldoAFavorGenerado > 0
        ? `Plan cambiado — se acreditaron $${resultado.saldoAFavorGenerado.toFixed(2)} de saldo a favor.`
        : "Plan cambiado, sin costo adicional.";
```

Y en los dos `return`/`redirect` que usan `mensaje`, agregar
`saldoAFavorGenerado: resultado.saldoAFavorGenerado` al objeto de retorno
con `origen === "caja"`:

```ts
  if (origen === "caja") {
    return { ok: mensaje, diferencia: resultado.diferencia, saldoAFavorGenerado: resultado.saldoAFavorGenerado };
  }
```

- [ ] **Paso 4: Verificar compilación**

Run: `npx tsc --noEmit -p apps/web-admin`
Expected: sin errores originados en `pagos/actions.ts`.

- [ ] **Paso 5: Commit**

```bash
git add apps/web-admin/app/\(panel\)/pagos/actions.ts
git commit -m "propaga el modo de cambio de plan y el saldo a favor generado"
```

---

## Tarea 8: Réplica cliente de la fórmula — `calcularProrrateoPlan.ts`

**Archivos:**
- Crear: `apps/web-admin/app/(panel)/caja/calcularProrrateoPlan.ts`

**Interfaces:**
- Consume: nada del backend — pura réplica de la Tarea 4, mismo patrón
  que `proyeccionAbono.ts`.
- Produce: `calcularProrrateoPlanCliente(...)` — consumido por la Tarea 9
  (`FormularioCambiarPlan`).

- [ ] **Paso 1: Copiar la fórmula como réplica intencional**

Crear `apps/web-admin/app/(panel)/caja/calcularProrrateoPlan.ts`:

```ts
// Réplica intencional de packages/domain/entities/CambioPlan.ts — mismo
// criterio, para que lo mostrado ANTES de confirmar (ambos modos, en vivo)
// coincida con lo que el backend aplica al elegir uno. Ver diseño en
// docs/superpowers/specs/2026-09-26-cambio-plan-con-prorrateo-design.md.
import { DURACION_DIAS_POR_FRECUENCIA, type FrecuenciaPago } from "@gym-app/domain/entities/Plan";

export type ModoCambioPlan = "AJUSTAR_VENCIMIENTO" | "CICLO_COMPLETO";

export interface ProrrateoPlanCliente {
  diasRestantes: number;
  valorNoConsumido: number;
  nuevoVencimiento: Date;
  diferencia: number;
}

export function calcularProrrateoPlanCliente(datos: {
  precioViejo: number;
  frecuenciaVieja: FrecuenciaPago;
  precioNuevo: number;
  frecuenciaNueva: FrecuenciaPago;
  fechaVencimientoActual: Date;
  ahora: Date;
  modo: ModoCambioPlan;
}): ProrrateoPlanCliente {
  const { precioViejo, frecuenciaVieja, precioNuevo, frecuenciaNueva, fechaVencimientoActual, ahora, modo } = datos;

  const diasDelCicloViejo = DURACION_DIAS_POR_FRECUENCIA[frecuenciaVieja];
  const diasDelCicloNuevo = DURACION_DIAS_POR_FRECUENCIA[frecuenciaNueva];

  const diasRestantesCrudo = (fechaVencimientoActual.getTime() - ahora.getTime()) / (24 * 60 * 60 * 1000);
  const diasRestantes = Math.max(0, diasRestantesCrudo);

  const valorNoConsumido = precioViejo > 0 && diasDelCicloViejo > 0 ? diasRestantes * (precioViejo / diasDelCicloViejo) : 0;

  if (modo === "AJUSTAR_VENCIMIENTO") {
    const precioPorDiaNuevo = diasDelCicloNuevo > 0 ? precioNuevo / diasDelCicloNuevo : 0;
    const diasNuevos = precioPorDiaNuevo > 0 ? valorNoConsumido / precioPorDiaNuevo : 0;
    const nuevoVencimiento = new Date(ahora.getTime() + diasNuevos * 24 * 60 * 60 * 1000);
    return { diasRestantes, valorNoConsumido, nuevoVencimiento, diferencia: 0 };
  }

  const nuevoVencimiento = new Date(ahora);
  nuevoVencimiento.setDate(nuevoVencimiento.getDate() + diasDelCicloNuevo);
  const diferencia = Math.round((precioNuevo - valorNoConsumido) * 100) / 100;

  return { diasRestantes, valorNoConsumido, nuevoVencimiento, diferencia };
}
```

- [ ] **Paso 2: Verificar compilación**

Run: `npx tsc --noEmit -p apps/web-admin`
Expected: sin errores en el archivo nuevo.

- [ ] **Paso 3: Commit**

```bash
git add apps/web-admin/app/\(panel\)/caja/calcularProrrateoPlan.ts
git commit -m "agrega la replica cliente de la formula de prorrateo de cambio de plan"
```

---

## Tarea 9: `FormularioCambiarPlan` — dos modos, sin filtro de frecuencia

**Archivos:**
- Modificar: `apps/web-admin/app/(panel)/miembros/FormularioCambiarPlan.tsx`

**Interfaces:**
- Consume: `calcularProrrateoPlanCliente` (Tarea 8), `EstadoCambioPlan.saldoAFavorGenerado`
  (Tarea 7).
- Produce: envía `modo` en el FormData — consumido por `cambiarPlanAction`
  (Tarea 7, ya implementada).

- [ ] **Paso 1: Quitar el filtro de frecuencia**

Reemplazar:

```ts
  const planesMismaFrecuencia = planes.filter((p) => p.frecuencia === frecuenciaActual);
  const planNuevo = planesMismaFrecuencia.find((p) => p.id === planNuevoId) ?? null;
  const diferencia = planNuevo ? Math.round(Math.max(0, planNuevo.precioUSD - precioActual) * 100) / 100 : 0;
  const requierePago = diferencia > 0;
```

por (agregando el estado de modo elegido y ambos cálculos en vivo):

```ts
  const planNuevo = planes.find((p) => p.id === planNuevoId) ?? null;

  const ahora = new Date();
  // fechaVencimientoActual no viaja como prop hoy — se agrega en el Paso 2.
  const prorrateoAjustar = planNuevo
    ? calcularProrrateoPlanCliente({
        precioViejo: precioActual,
        frecuenciaVieja: frecuenciaActual,
        precioNuevo: planNuevo.precioUSD,
        frecuenciaNueva: planNuevo.frecuencia,
        fechaVencimientoActual,
        ahora,
        modo: "AJUSTAR_VENCIMIENTO",
      })
    : null;
  const prorrateoCicloCompleto = planNuevo
    ? calcularProrrateoPlanCliente({
        precioViejo: precioActual,
        frecuenciaVieja: frecuenciaActual,
        precioNuevo: planNuevo.precioUSD,
        frecuenciaNueva: planNuevo.frecuencia,
        fechaVencimientoActual,
        ahora,
        modo: "CICLO_COMPLETO",
      })
    : null;

  const [modoElegido, setModoElegido] = useState<"AJUSTAR_VENCIMIENTO" | "CICLO_COMPLETO" | null>(null);
  const requierePago = modoElegido === "CICLO_COMPLETO" && (prorrateoCicloCompleto?.diferencia ?? 0) > 0;
```

Agregar el import: `import { calcularProrrateoPlanCliente } from "../caja/calcularProrrateoPlan";`

- [ ] **Paso 2: Agregar la prop `fechaVencimientoActual`**

En la firma de `FormularioCambiarPlan`, agregar `fechaVencimientoActual: Date;`
junto a `precioActual: number;`. Actualizar el comentario de
`frecuenciaActual` (que hoy dice "Cobrar solo la diferencia... solo tiene
sentido entre planes de la misma frecuencia") para reflejar que esa
restricción ya no existe:

```ts
  // Precio y vencimiento vigentes del plan actual — la fórmula de
  // prorrateo (calcularProrrateoPlanCliente) los usa para calcular el
  // valor no consumido del ciclo, sin importar la frecuencia del plan
  // nuevo (ver diseño acordado, ya no se restringe a la misma frecuencia).
  frecuenciaActual: FrecuenciaPago;
  fechaVencimientoActual: Date;
```

- [ ] **Paso 3: Quitar el aviso de "solo se muestran planes de la misma frecuencia"**

Quitar el bloque:

```tsx
      {planes.length > planesMismaFrecuencia.length && (
        <p className="text-xs" style={{ color: "var(--gx-muted)" }}>
          Solo se muestran planes de la misma frecuencia que el actual — cobrar la diferencia no mueve el
          vencimiento, así que no aplica entre semanal, quincenal y mensual. Para cambiar a otra frecuencia, usá
          &quot;Registrar pago&quot; por el precio completo.
        </p>
      )}
```

Y reemplazar el `<select>` de plan nuevo (que usaba `planesMismaFrecuencia`)
por `planes`, mostrando la frecuencia en cada opción:

```tsx
      <label className="flex flex-col gap-1.5 text-sm" style={{ color: "var(--gx-muted)" }}>
        Plan nuevo
        <select
          value={planNuevoId}
          onChange={(e) => {
            setPlanNuevoId(e.target.value);
            setModoElegido(null);
          }}
          className="min-h-11 rounded-lg border px-3 outline-none focus:border-[var(--gx-accent)]"
          style={{ background: "var(--gx-surface-2)", borderColor: "var(--gx-edge)", color: "var(--gx-ink)" }}
        >
          <option value="">Seleccioná un plan</option>
          {planes.map((plan) => (
            <option key={plan.id} value={plan.id} disabled={plan.id === planActualId}>
              {plan.nombre} — ${plan.precioUSD.toFixed(2)} ({ETIQUETA_FRECUENCIA[plan.frecuencia]})
              {plan.id === planActualId ? " — plan actual" : ""}
            </option>
          ))}
        </select>
      </label>
```

Necesita un mapa `ETIQUETA_FRECUENCIA` — importarlo o definirlo local
(mismo contenido que en `ModalRegistrarPagoCaja.tsx`):

```ts
const ETIQUETA_FRECUENCIA: Record<FrecuenciaPago, string> = {
  DIARIO: "diario",
  SEMANAL: "semanal",
  QUINCENAL: "quincenal",
  MENSUAL: "mensual",
};
```

- [ ] **Paso 4: Reemplazar el bloque de resumen por los dos cálculos en vivo**

Reemplazar el bloque `{planNuevo && planNuevo.id !== planActualId && (...)}`
(diferencia simple) por:

```tsx
      {planNuevo && planNuevo.id !== planActualId && prorrateoAjustar && prorrateoCicloCompleto && (
        <div className="flex flex-col gap-3">
          <div className="rounded-lg border p-3 text-sm" style={{ borderColor: "var(--gx-edge)", background: "var(--gx-surface-2)" }}>
            <p className="font-semibold" style={{ color: "var(--gx-ink)" }}>
              Solo ajustar vencimiento
            </p>
            <p className="mt-1 text-xs" style={{ color: "var(--gx-muted)" }}>
              Nuevo vencimiento: {prorrateoAjustar.nuevoVencimiento.toLocaleDateString("es-VE")} — sin costo
              adicional.
            </p>
          </div>
          <div className="rounded-lg border p-3 text-sm" style={{ borderColor: "var(--gx-edge)", background: "var(--gx-surface-2)" }}>
            <p className="font-semibold" style={{ color: "var(--gx-ink)" }}>
              Pagar ciclo completo del nuevo
            </p>
            <p className="mt-1 text-xs" style={{ color: "var(--gx-muted)" }}>
              Nuevo vencimiento: {prorrateoCicloCompleto.nuevoVencimiento.toLocaleDateString("es-VE")} —{" "}
              {prorrateoCicloCompleto.diferencia > 0
                ? `se cobra $${prorrateoCicloCompleto.diferencia.toFixed(2)}.`
                : prorrateoCicloCompleto.diferencia < 0
                  ? `se acreditan $${Math.abs(prorrateoCicloCompleto.diferencia).toFixed(2)} de saldo a favor.`
                  : "sin costo adicional."}
            </p>
          </div>
        </div>
      )}
```

- [ ] **Paso 5: Reemplazar el botón único por dos botones de confirmación**

Reemplazar:

```tsx
      <Button type="submit" disabled={enviando || !puedeEnviar}>
        {enviando ? "Guardando..." : requierePago ? "Cobrar diferencia y cambiar plan" : "Cambiar plan"}
      </Button>
```

por (cada botón fija `modoElegido` y envía — como es un único `<form>`,
ambos botones necesitan `name="modo"` con su propio `value`, ya que
`input type="hidden" name="modo"` no puede tener dos valores a la vez):

Quitar el `<input type="hidden" name="modo" ... />` si se había agregado
en el Paso 1 y usar en su lugar el atributo `value` de cada botón submit:

```tsx
      {planNuevo && planNuevo.id !== planActualId && (
        <div className="flex flex-col gap-2">
          <Button
            type="submit"
            name="modo"
            value="AJUSTAR_VENCIMIENTO"
            variant="secundario"
            disabled={enviando || (requiereEntrenador && !entrenadorId)}
            onClick={() => setModoElegido("AJUSTAR_VENCIMIENTO")}
          >
            {enviando && modoElegido === "AJUSTAR_VENCIMIENTO" ? "Guardando..." : "Solo ajustar vencimiento"}
          </Button>
          <Button
            type="submit"
            name="modo"
            value="CICLO_COMPLETO"
            disabled={
              enviando ||
              (requiereEntrenador && !entrenadorId) ||
              (prorrateoCicloCompleto!.diferencia > 0 && !seleccionMetodo.metodoPagoId)
            }
            onClick={() => setModoElegido("CICLO_COMPLETO")}
          >
            {enviando && modoElegido === "CICLO_COMPLETO"
              ? "Guardando..."
              : prorrateoCicloCompleto!.diferencia > 0
                ? `Pagar ciclo completo — cobrar $${prorrateoCicloCompleto!.diferencia.toFixed(2)}`
                : prorrateoCicloCompleto!.diferencia < 0
                  ? `Pagar ciclo completo — acreditar $${Math.abs(prorrateoCicloCompleto!.diferencia).toFixed(2)}`
                  : "Pagar ciclo completo"}
          </Button>
        </div>
      )}
```

Quitar la variable `puedeEnviar` original (ya no se usa un único botón) y
cualquier referencia a ella; el `disabled` de cada botón cubre su propia
condición.

- [ ] **Paso 6: Mostrar el selector de método de pago solo si Modo B tiene diferencia positiva**

El bloque `{requierePago && (<SelectorMetodoPago ... />)}` ya usa la
variable `requierePago` redefinida en el Paso 1
(`modoElegido === "CICLO_COMPLETO" && diferencia > 0`) — sin cambios
adicionales aquí, pero verificar que sigue funcionando: el selector debe
aparecer apenas `prorrateoCicloCompleto.diferencia > 0`, incluso ANTES de
que el cajero haga click en el botón (para que pueda elegir el método
antes de confirmar). Ajustar la condición a solo la diferencia, no al
modo ya elegido:

```tsx
      {planNuevo && (prorrateoCicloCompleto?.diferencia ?? 0) > 0 && (
        <SelectorMetodoPago
          metodos={metodosPago}
          monto={prorrateoCicloCompleto!.diferencia}
          onCambio={setSeleccionMetodo}
          avisoServidor={{ tasaNueva: estado.tasaNueva, fallaTemporal: estado.fallaTemporal, tasaGuardada: estado.tasaGuardada }}
        />
      )}
```

Quitar la variable `requierePago` usada solo para esto y dejar la
condición de los botones (Paso 5) referenciando
`prorrateoCicloCompleto!.diferencia > 0` directamente en vez de
`requierePago`.

- [ ] **Paso 7: Verificar compilación**

Run: `npx tsc --noEmit -p apps/web-admin`
Expected: falla en los dos call sites de `FormularioCambiarPlan`
(ficha del miembro y Caja) que todavía no pasan `fechaVencimientoActual`
(Tarea 10).

- [ ] **Paso 8: Commit**

```bash
git add apps/web-admin/app/\(panel\)/miembros/FormularioCambiarPlan.tsx
git commit -m "agrega los dos modos de cambio de plan y quita el filtro de frecuencia"
```

---

## Tarea 10: Propagar `fechaVencimientoActual` a los dos call sites

**Archivos:**
- Modificar: `apps/web-admin/app/(panel)/miembros/[id]/page.tsx`
- Modificar: `apps/web-admin/app/(panel)/caja/ModalRegistrarPagoCaja.tsx`

**Interfaces:**
- Consume: `FormularioCambiarPlan` con la nueva prop `fechaVencimientoActual`
  (Tarea 9).
- Produce: nada nuevo — cierra la cadena de props.

- [ ] **Paso 1: Ficha del miembro — pasar `miembro.fechaVencimiento`**

En `apps/web-admin/app/(panel)/miembros/[id]/page.tsx`, buscar el call
site de `<FormularioCambiarPlan ... planActualId={miembro.planId} ...>`
(línea ~162) y agregar:

```tsx
                fechaVencimientoActual={miembro.fechaVencimiento ?? new Date()}
```

(`tieneCicloVigente` ya garantiza que el formulario solo se muestra con
`fechaVencimiento` real en el pasado-futuro válido — el fallback a
`new Date()` es solo para satisfacer el tipo `Date` no-nulo cuando TS no
puede inferir el narrowing entre el `if (tieneCicloVigente)` del JSX y el
uso más abajo).

- [ ] **Paso 2: Caja — pasar `miembro.fechaVencimiento`**

En `apps/web-admin/app/(panel)/caja/ModalRegistrarPagoCaja.tsx`, en el
call site dentro de `ContenidoPaso2` (rama `cambiandoPlan && tieneCicloVigente && miembro.plan`):

```tsx
          <FormularioCambiarPlan
            accion={accionCambiarPlan}
            miembroId={miembro.id}
            planes={planes}
            planActualId={miembro.plan.id}
            precioActual={miembro.plan.precioUSD}
            frecuenciaActual={miembro.plan.frecuencia}
            fechaVencimientoActual={miembro.fechaVencimiento ?? new Date()}
            metodosPago={metodosPago}
            entrenadores={entrenadores}
            entrenadorActualId={miembro.entrenadorId}
            origen="caja"
            onCambiado={onCerrar}
          />
```

- [ ] **Paso 3: Verificar compilación completa**

Run: `npx tsc --noEmit -p apps/web-admin`
Expected: sin errores.

Run: `npx tsc --noEmit -p apps/kiosk`
Expected: sin errores (el kiosco no toca este flujo, pero comparte
`@gym-app/domain` — confirma que el campo nuevo en `Miembro` no rompe
nada ahí).

- [ ] **Paso 4: Commit**

```bash
git add apps/web-admin/app/\(panel\)/miembros/\[id\]/page.tsx apps/web-admin/app/\(panel\)/caja/ModalRegistrarPagoCaja.tsx
git commit -m "propaga la fecha de vencimiento actual al formulario de cambio de plan"
```

---

## Tarea 11: Mostrar el saldo a favor en las pantallas de pago

**Archivos:**
- Modificar: `apps/web-admin/app/(panel)/pagos/FormularioPago.tsx`
- Modificar: `apps/web-admin/app/(panel)/caja/ModalRegistrarPagoCaja.tsx`

**Interfaces:**
- Consume: `Miembro.saldoAFavorUSD` (Tarea 2/3), ya presente en
  `MiembroConPlan`/`Miembro` sin cambios de tipo adicionales (agregar el
  campo a `MiembroConPlan` si no está — ver Paso 2).

- [ ] **Paso 1: `FormularioPago.tsx` — línea informativa cuando hay saldo**

`FormularioPago` recibe miembros vía `miembrosConPlan`/`miembroIdFijo` —
localizar dónde se resuelve el miembro elegido actualmente (buscar
`miembroElegido` o similar en el archivo) y, junto al bloque de
`saldoPendiente` ya existente, agregar:

```tsx
      {miembroElegido && miembroElegido.saldoAFavorUSD > 0 && (
        <p
          className="rounded-lg px-3 py-2 text-sm font-medium"
          style={{ background: "color-mix(in srgb, var(--gx-accent) 15%, transparent)", color: "var(--gx-accent)" }}
        >
          Saldo a favor: ${miembroElegido.saldoAFavorUSD.toFixed(2)} — se descuenta automáticamente de este pago.
        </p>
      )}
```

Requiere que `saldoAFavorUSD` esté disponible en el tipo del miembro que
usa este componente (`MiembroConPlan` de `../caja/SelectorMiembroModal`,
ya extendido en la sesión anterior con `sucursalId`/`entrenadorId`) —
agregar `saldoAFavorUSD: number;` a esa interfaz y a su construcción en
`BuscadorMiembro` (`apps/web-admin/app/(panel)/caja/SelectorMiembroModal.tsx`,
mismo bloque `.map((m) => ({...}))` extendido antes).

- [ ] **Paso 2: `ModalRegistrarPagoCaja.tsx` — misma línea en el Paso 2**

En `ContenidoPaso2`, junto al bloque `<div className="flex justify-between">Vencimiento...`,
agregar:

```tsx
      {miembro.saldoAFavorUSD > 0 && (
        <p
          className="rounded-lg px-3 py-2 text-sm font-medium"
          style={{ background: "color-mix(in srgb, var(--gx-accent) 15%, transparent)", color: "var(--gx-accent)" }}
        >
          Saldo a favor: ${miembro.saldoAFavorUSD.toFixed(2)} — se descuenta automáticamente del pago.
        </p>
      )}
```

- [ ] **Paso 3: Verificar compilación**

Run: `npx tsc --noEmit -p apps/web-admin`
Expected: sin errores.

- [ ] **Paso 4: Commit**

```bash
git add apps/web-admin/app/\(panel\)/pagos/FormularioPago.tsx apps/web-admin/app/\(panel\)/caja/ModalRegistrarPagoCaja.tsx apps/web-admin/app/\(panel\)/caja/SelectorMiembroModal.tsx
git commit -m "muestra el saldo a favor del miembro en las pantallas de pago"
```

---

## Verificación final

- `npx tsc --noEmit -p apps/web-admin` limpio.
- `npx tsc --noEmit -p apps/kiosk` limpio.
- Trazas manuales de `calcularProrrateoPlan` (Tarea 4) cubriendo los 8
  casos de la spec, con los números documentados ahí.
- Revisar que ningún caller restante importe `FrecuenciaDistintaError`
  (`grep -rn "FrecuenciaDistintaError" apps/ packages/` debe no dar
  resultados).
- Prueba manual end-to-end (a cargo del usuario, sin acceso a
  navegador/DB desde el entorno de implementación): cambiar un miembro
  real de Semanal a Mensual en Modo A y verificar el vencimiento;
  repetir en Modo B y verificar el cobro; bajar de plan en Modo B y
  verificar que se acredita `saldoAFavorUSD` y se descuenta en el
  siguiente pago (probar que un pago posterior por el precio completo del
  plan efectivamente cobra menos, o nada, según el saldo disponible).
