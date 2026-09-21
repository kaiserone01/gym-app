# Modal multi-step "Registrar pago" en Caja Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir "Registrar pago" en Caja en una modal de 4 pasos con
barra de progreso: buscar miembro, ver ficha de membresía con proyección
de vencimiento, pagar, y confirmación final — sin tocar el flujo de pago
existente fuera de Caja.

**Architecture:** Componente cliente nuevo `ModalRegistrarPagoCaja.tsx`
maneja un wizard de 4 pasos en memoria, reusando `SelectorMiembroModal`
(Paso 1) y `SelectorMetodoPago` (Paso 3) tal como existen hoy.
`FormularioPago.tsx` no se toca — sigue siendo el flujo de un solo paso
para `/pagos/nuevo` y `/miembros/[id]`. `registrarPagoAction` se extiende
de forma aditiva para devolver `fechaFinCiclo` real del pago creado.

**Tech Stack:** Next.js App Router (Server Components + Client Components,
Server Actions), TypeScript, arquitectura hexagonal (dominio sin cambios
en este plan — únicamente se lee `Pago.fechaFinCiclo`, ya existente).

**Spec:** `docs/superpowers/specs/2026-09-21-modal-registrar-pago-caja-design.md`

## Global Constraints

- `FormularioPago.tsx` NO se convierte en multi-step — sigue usándose tal
  cual en `/pagos/nuevo` y `/miembros/[id]`, sin cambios.
- Solo se puede renovar el plan vigente del miembro — no se puede cambiar
  de plan ni ajustar precio desde la modal, salvo la única excepción:
  miembro sin `planId` asignado, donde el Paso 2 permite elegir un plan
  (sin la opción "Personalizado").
- No hay framework de tests en este repo — verificación por
  `npx tsc --noEmit -p apps/web-admin/tsconfig.json` tras cada tarea. La
  verificación visual real (`/run` en navegador) no es posible en este
  entorno — debe quedar pendiente para el usuario, no se debe declarar
  "probado" sin haberlo corrido.
- Commits: mensaje único en español, sin body, sin firmas/atribución
  (CLAUDE.md regla 3).
- Cualquier cambio a `SelectorMetodoPago`, `RegistrarPago` (dominio),
  cálculo de tasa BCV, o separación de caja por sucursal — fuera de
  alcance, no tocar.

---

### Task 1: Extraer `diasHastaVencimiento`/`DiasDisponibles` a módulo compartido

**Files:**
- Create: `apps/web-admin/app/(panel)/miembros/vencimiento.ts`
- Modify: `apps/web-admin/app/(panel)/miembros/ListaMiembros.tsx`

**Interfaces:**
- Produces: `diasHastaVencimiento(fechaVencimiento: Date): number` y
  `DiasDisponibles({ fechaVencimiento }: { fechaVencimiento: Date | null }): JSX.Element`
  — mismas firmas y comportamiento que hoy en `ListaMiembros.tsx`, solo
  movidas de archivo.

- [ ] **Step 1: Crear el módulo compartido**

```typescript
// apps/web-admin/app/(panel)/miembros/vencimiento.ts

// Días entre hoy y fechaVencimiento, redondeado a días completos — positivo
// si falta para vencer, negativo si ya venció.
export function diasHastaVencimiento(fechaVencimiento: Date): number {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const vencimiento = new Date(fechaVencimiento);
  vencimiento.setHours(0, 0, 0, 0);
  return Math.round((vencimiento.getTime() - hoy.getTime()) / (24 * 60 * 60 * 1000));
}

export function DiasDisponibles({ fechaVencimiento }: { fechaVencimiento: Date | null }) {
  if (!fechaVencimiento) {
    return <span style={{ color: "var(--gx-muted)" }}>Sin pagos registrados</span>;
  }

  const dias = diasHastaVencimiento(fechaVencimiento);

  if (dias < 0) {
    return (
      <span style={{ color: "var(--gx-bad)" }}>
        Vencido hace {Math.abs(dias)} {Math.abs(dias) === 1 ? "día" : "días"}
      </span>
    );
  }

  return (
    <span style={{ color: "var(--gx-ink)" }}>
      {dias} {dias === 1 ? "día" : "días"}
    </span>
  );
}
```

Nota: este archivo usa JSX (el componente `DiasDisponibles`), así que
debe llamarse `vencimiento.tsx`, no `.ts` — usar esa extensión en el
nombre real del archivo pese a lo indicado en el título del Step.

- [ ] **Step 2: Actualizar `ListaMiembros.tsx` para usar el módulo**

Quitar de `ListaMiembros.tsx` las funciones locales `diasHastaVencimiento`
y `DiasDisponibles` (líneas actuales 30-82 del archivo), y agregar el
import:

```typescript
import { diasHastaVencimiento, DiasDisponibles } from "./vencimiento";
```

(`diasHastaVencimiento` puede quedar sin uso directo en este archivo tras
la extracción si `ListaMiembros.tsx` solo usaba `DiasDisponibles` — revisar
con grep antes de importarla si no hace falta; si no se usa, no importar
ese nombre para evitar un import muerto).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p apps/web-admin/tsconfig.json`
Expected: 0 errores nuevos.

- [ ] **Step 4: Commit**

```bash
git add "apps/web-admin/app/(panel)/miembros/vencimiento.tsx" "apps/web-admin/app/(panel)/miembros/ListaMiembros.tsx"
git commit -m "refactor: extrae el calculo de dias de vencimiento a un modulo compartido"
```

---

### Task 2: Crear `proyeccionRenovacion.ts`

**Files:**
- Create: `apps/web-admin/app/(panel)/caja/proyeccionRenovacion.ts`

**Interfaces:**
- Produces: `calcularProyeccionRenovacion(fechaVencimiento: Date | null, frecuencia: FrecuenciaPago): ProyeccionRenovacion`
- Produces: `interface ProyeccionRenovacion { diasDelPlan: number; diasTotalesTrasPago: number; adelantandoCuota: boolean; fechaProximoVencimiento: Date; }`

- [ ] **Step 1: Escribir el módulo**

```typescript
// apps/web-admin/app/(panel)/caja/proyeccionRenovacion.ts
// Réplica intencional de la lógica en packages/domain/use-cases/RegistrarPago.ts
// (base = activa && activa.fin > ahora ? activa.fin : ahora; fin = base +
// DURACION_DIAS_POR_FRECUENCIA[plan.frecuencia]) — mismo criterio, para
// que lo mostrado ANTES de pagar coincida con lo que el backend aplica.
import { DURACION_DIAS_POR_FRECUENCIA, type FrecuenciaPago } from "@gym-app/domain/entities/Plan";

export interface ProyeccionRenovacion {
  diasDelPlan: number;
  diasTotalesTrasPago: number;
  adelantandoCuota: boolean;
  fechaProximoVencimiento: Date;
}

export function calcularProyeccionRenovacion(
  fechaVencimiento: Date | null,
  frecuencia: FrecuenciaPago
): ProyeccionRenovacion {
  const ahora = new Date();
  const diasDelPlan = DURACION_DIAS_POR_FRECUENCIA[frecuencia];
  const vigente = fechaVencimiento !== null && fechaVencimiento > ahora;
  const base = vigente ? fechaVencimiento : ahora;

  const fechaProximoVencimiento = new Date(base);
  fechaProximoVencimiento.setDate(fechaProximoVencimiento.getDate() + diasDelPlan);

  const diasTotalesTrasPago = Math.round(
    (fechaProximoVencimiento.getTime() - ahora.getTime()) / (24 * 60 * 60 * 1000)
  );

  return { diasDelPlan, diasTotalesTrasPago, adelantandoCuota: vigente, fechaProximoVencimiento };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p apps/web-admin/tsconfig.json`
Expected: 0 errores (archivo nuevo sin consumidores todavía).

- [ ] **Step 3: Commit**

```bash
git add "apps/web-admin/app/(panel)/caja/proyeccionRenovacion.ts"
git commit -m "feat: calculo de proyeccion de renovacion replicando la logica del backend"
```

---

### Task 3: Agregar `frecuencia` y `fechaVencimiento` a las interfaces reducidas

**Files:**
- Modify: `apps/web-admin/app/(panel)/caja/SelectorMiembroModal.tsx`
- Modify: `apps/web-admin/app/(panel)/pagos/FormularioPago.tsx`

**Interfaces:**
- Produces: `PlanParaModal` (en `SelectorMiembroModal.tsx`) gana
  `frecuencia: FrecuenciaPago`.
- Produces: `MiembroConPlan` (en `SelectorMiembroModal.tsx`) gana
  `fechaVencimiento: Date | null`.
- Produces: `PlanParaSelector` (en `FormularioPago.tsx`) gana
  `frecuencia: FrecuenciaPago`.

- [ ] **Step 1: `SelectorMiembroModal.tsx` — agregar los campos**

```typescript
import type { FrecuenciaPago } from "@gym-app/domain/entities/Plan";

// Solo los campos que este modal necesita mostrar del plan — evita atar
// este componente al tipo Plan completo del dominio (activo, etc. no se
// usa acá). frecuencia sí hace falta: calcularProyeccionRenovacion (Paso 2
// del modal de Caja) la necesita para saber la duración del plan.
export interface PlanParaModal {
  id: string;
  nombre: string;
  precioUSD: number;
  multisede: boolean;
  frecuencia: FrecuenciaPago;
}
```

```typescript
export interface MiembroConPlan {
  id: string;
  nombre: string;
  cedula: string;
  fotoUrl: string | null;
  fechaVencimiento: Date | null;
  plan: PlanParaModal | undefined;
}
```

En el `useMemo` de `resultados`, agregar el campo al objeto mapeado:

```typescript
  const resultados = useMemo(() => {
    if (!busquedaAplicada) return [];
    return miembros
      .filter((m) => `${m.nombre} ${m.cedula}`.toLowerCase().includes(busquedaAplicada))
      .slice(0, 20)
      .map((m) => ({
        id: m.id,
        nombre: m.nombre,
        cedula: m.cedula,
        fotoUrl: m.fotoUrl,
        fechaVencimiento: m.fechaVencimiento,
        plan: m.planId ? planesPorId.get(m.planId) : undefined,
      }));
  }, [miembros, busquedaAplicada, planesPorId]);
```

`planesPorId` se construye desde el prop `planes: PlanParaModal[]` — quien
llame a `SelectorMiembroModal` debe pasar `frecuencia` en cada elemento
(ver Task 5, donde `caja/page.tsx` arma esa lista desde `Plan[]` completo,
que ya trae `frecuencia`).

- [ ] **Step 2: Quitar el bloqueo de miembros sin plan asignado**

Hallazgo durante la exploración del código (no estaba en el spec): hoy
`SelectorMiembroModal` deshabilita el botón de un miembro sin plan
(`disabled={sinPlan}`, con el texto "Sin plan asignado" en rojo) — esto
contradice la excepción acordada (miembro sin plan debe poder elegirse, y
el Paso 2 del modal de Caja le deja asignar uno). Se quita ese bloqueo:

```typescript
          <div className="flex flex-col gap-2">
            {resultados.map((miembro) => {
              return (
                <button
                  key={miembro.id}
                  type="button"
                  onClick={() => onSeleccionar(miembro)}
                  className="flex items-center gap-3 rounded-lg border-2 p-3 text-left transition-colors duration-150"
                  style={{ borderColor: "var(--gx-edge)" }}
                >
                  <Avatar fotoUrl={miembro.fotoUrl} nombre={miembro.nombre} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium" style={{ color: "var(--gx-ink)" }}>
                      {miembro.nombre}
                    </p>
                    <p className="text-sm" style={{ color: "var(--gx-muted)" }}>
                      {miembro.cedula}
                    </p>
                  </div>
                  <div className="text-right text-sm">
                    {!miembro.plan ? (
                      <span style={{ color: "var(--gx-muted)" }}>Sin plan asignado</span>
                    ) : (
                      <>
                        <p style={{ color: "var(--gx-ink)" }}>{miembro.plan.nombre}</p>
                        <p className="font-semibold" style={{ color: "var(--gx-accent)" }}>
                          ${miembro.plan.precioUSD.toFixed(2)}
                        </p>
                      </>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
```

Cambios respecto al original: se quita `const sinPlan = !miembro.plan;`
(inline ahora), se quita `disabled={sinPlan}` y las clases
`disabled:cursor-not-allowed disabled:opacity-60`, el `onClick` ya no
condiciona con `!sinPlan &&`, y el texto "Sin plan asignado" pasa de
`--gx-bad` (rojo, indicaba bloqueo) a `--gx-muted` (gris, es solo
informativo — el Paso 2 del modal de Caja lo resuelve). El uso de
`miembro.plan!` con non-null assertion se reemplaza por el chequeo normal
del `if`.

Este cambio de comportamiento (dejar de bloquear) es intencional y
afecta también a `/pagos/nuevo`/`/miembros/[id]` en el caso borde de un
miembro sin plan seleccionado ahí — antes no se podía elegir un miembro
sin plan desde ningún lado que use `SelectorMiembroModal`; ahora si se
elige, el `planFijoEfectivo` en `FormularioPago.tsx` queda `undefined` y
ese formulario ya maneja ese caso mostrando
"Elegí un miembro para ver su plan y monto a cobrar." (ver
`FormularioPago.tsx` línea ~211-216) — no requiere cambios ahí, es
comportamiento ya existente para ese caso.

- [ ] **Step 3: `FormularioPago.tsx` — agregar `frecuencia` a `PlanParaSelector`**

```typescript
import type { FrecuenciaPago } from "@gym-app/domain/entities/Plan";

export interface PlanParaSelector {
  id: string;
  nombre: string;
  precioUSD: number;
  multisede: boolean;
  frecuencia: FrecuenciaPago;
}
```

(el resto de `FormularioPago.tsx` no cambia — este campo se usará desde
`ModalRegistrarPagoCaja.tsx` en la Task 6, no dentro de este archivo).

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p apps/web-admin/tsconfig.json`
Expected: nuevo error en `caja/page.tsx` (arma `PlanParaModal`/`PlanParaSelector`
sin `frecuencia` todavía al pasar `planesActivos` como `Plan[]` completo —
en realidad `Plan[]` YA trae `frecuencia`, así que si no hay error acá es
porque TypeScript infiere estructuralmente que `Plan` satisface la
interfaz ampliada; si aparece un error de tipo, es la señal de que el
`Plan[]` pasado no tiene el campo, y hay que revisar el import de la
entidad de dominio usada en `caja/page.tsx`).

- [ ] **Step 5: Commit**

```bash
git add "apps/web-admin/app/(panel)/caja/SelectorMiembroModal.tsx" "apps/web-admin/app/(panel)/pagos/FormularioPago.tsx"
git commit -m "feat: SelectorMiembroModal permite elegir miembros sin plan asignado"
```

---

### Task 4: Exportar `DURACION_MS` desde `FeedbackOverlay`

**Files:**
- Modify: `packages/ui/components/FeedbackOverlay.tsx`

**Interfaces:**
- Produces: `export const DURACION_MS = 4000;` (ya existe como constante
  interna sin exportar — solo se le agrega `export`).

- [ ] **Step 1: Exportar la constante**

```typescript
export const DURACION_MS = 4000;
```

(reemplaza la línea `const DURACION_MS = 4000;` ya existente — el resto
del archivo sigue igual, sin más cambios).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p apps/web-admin/tsconfig.json`
Expected: 0 errores (cambio aditivo, no rompe usos internos del archivo).

- [ ] **Step 3: Commit**

```bash
git add packages/ui/components/FeedbackOverlay.tsx
git commit -m "feat: exporta DURACION_MS del overlay de feedback"
```

---

### Task 5: Extender `registrarPagoAction` para devolver `fechaFinCiclo`

**Files:**
- Modify: `apps/web-admin/app/(panel)/pagos/actions.ts`

**Interfaces:**
- Produces: `EstadoFormularioPago` gana el campo opcional
  `fechaFinCiclo?: string` (ISO).
- Consumes: el valor de retorno de `registrarPago(...)` (`Pago`, con
  `fechaFinCiclo: Date | null`), hoy ignorado por completo por esta
  Server Action.

- [ ] **Step 1: Agregar el campo a la interfaz**

```typescript
export interface EstadoFormularioPago {
  error?: string;
  // Solo se completa cuando la acción NO redirige (origen "miembro" o
  // "caja", ver más abajo) — el formulario sigue montado en la misma
  // página, así que el éxito viaja por acá en vez de por ?ok= en la URL.
  ok?: string;
  // Fecha real de fin de ciclo tras el pago (ISO) — solo presente junto
  // con `ok`. La usa el Paso 4 del modal de Caja para mostrar la fecha de
  // vencimiento resultante sin recalcularla en el cliente.
  fechaFinCiclo?: string;
}
```

- [ ] **Step 2: Capturar el resultado de `registrarPago` y devolverlo**

Reemplazar:

```typescript
  try {
    await registrarPago(
```

por:

```typescript
  let pago;
  try {
    pago = await registrarPago(
```

Y al final de la función, reemplazar:

```typescript
  return { ok: "Pago registrado." };
```

por:

```typescript
  return { ok: "Pago registrado.", fechaFinCiclo: pago.fechaFinCiclo?.toISOString() };
```

(el `redirect(...)` para el caso `origen !== "miembro" && origen !== "caja"`
sigue exactamente igual, sin cambios — solo se usa `pago` en el `return`
final que ya existía).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p apps/web-admin/tsconfig.json`
Expected: 0 errores (`pago` se usa antes del único `return` que lo
necesita; el bloque `catch` no lo usa).

- [ ] **Step 4: Commit**

```bash
git add "apps/web-admin/app/(panel)/pagos/actions.ts"
git commit -m "feat: registrarPagoAction devuelve la fecha de fin de ciclo del pago"
```

---

### Task 6: Componente `ModalRegistrarPagoCaja.tsx` — estructura, barra de progreso, Pasos 1 y 2

**Files:**
- Create: `apps/web-admin/app/(panel)/caja/ModalRegistrarPagoCaja.tsx`

**Interfaces:**
- Consumes: `SelectorMiembroModal`, `MiembroConPlan`, `PlanParaModal`
  (Task 3); `calcularProyeccionRenovacion` (Task 2); `DiasDisponibles`
  (Task 1); `formatearBs` (`../tasaBcvFija`, ya existente).
- Produces: `ModalRegistrarPagoCaja({ miembros, planes, metodosPago, tasaActual, onCerrar }): JSX.Element`
  — el componente completo, exportado para uso en Task 8.

- [ ] **Step 1: Crear el archivo con el esqueleto de wizard y la barra de progreso**

```tsx
"use client";

import { useState } from "react";
import type { Miembro } from "@gym-app/domain/entities/Miembro";
import type { MetodoPago } from "@gym-app/domain/entities/MetodoPago";
import { Button } from "@gym-app/ui/components/Button";
import { SelectorMiembroModal, type MiembroConPlan, type PlanParaModal } from "./SelectorMiembroModal";
import { calcularProyeccionRenovacion } from "./proyeccionRenovacion";
import { DiasDisponibles } from "../miembros/vencimiento";
import { formatearBs } from "../tasaBcvFija";

type Paso = 1 | 2 | 3 | 4;

const TITULOS_PASO: Record<Paso, string> = {
  1: "Elegí un miembro",
  2: "Estado de la membresía",
  3: "Método de pago",
  4: "Pago registrado",
};

function BarraProgreso({ paso }: { paso: Paso }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      {([1, 2, 3, 4] as Paso[]).map((n) => (
        <div key={n} className="flex flex-1 items-center gap-2">
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
            style={
              n <= paso
                ? { background: "var(--gx-accent)", color: "var(--gx-accent-ink)" }
                : { background: "var(--gx-surface-2)", color: "var(--gx-muted)" }
            }
          >
            {n}
          </div>
          {n < 4 && (
            <div
              className="h-0.5 flex-1"
              style={{ background: n < paso ? "var(--gx-accent)" : "var(--gx-edge)" }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

export function ModalRegistrarPagoCaja({
  miembros,
  planes,
  metodosPago,
  tasaActual,
  onCerrar,
}: {
  miembros: Miembro[];
  planes: PlanParaModal[];
  metodosPago: MetodoPago[];
  tasaActual: number | null;
  onCerrar: () => void;
}) {
  const [paso, setPaso] = useState<Paso>(1);
  const [miembroElegido, setMiembroElegido] = useState<MiembroConPlan | null>(null);
  const [planElegidoId, setPlanElegidoId] = useState<string | null>(null);
  const [confirmandoCierre, setConfirmandoCierre] = useState(false);
  const [fechaFinCicloFinal, setFechaFinCicloFinal] = useState<Date | null>(null);

  function pedirCierre() {
    if (paso === 1 || paso === 4) {
      onCerrar();
      return;
    }
    setConfirmandoCierre(true);
  }

  const planEfectivo: PlanParaModal | undefined =
    miembroElegido?.plan ?? (planElegidoId ? planes.find((p) => p.id === planElegidoId) : undefined);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "color-mix(in srgb, black 60%, transparent)" }}
      role="dialog"
      aria-modal="true"
      aria-label="Registrar pago"
      onClick={pedirCierre}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-y-auto rounded-2xl border-2 p-6"
        style={{ borderColor: "var(--gx-accent)", background: "var(--gx-surface)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold" style={{ color: "var(--gx-ink)" }}>
            {TITULOS_PASO[paso]}
          </h3>
          <button
            type="button"
            onClick={pedirCierre}
            aria-label="Cerrar"
            className="rounded-full p-1.5 text-sm transition-colors duration-150 hover:bg-[var(--gx-surface-2)]"
            style={{ color: "var(--gx-muted)" }}
          >
            ✕
          </button>
        </div>

        <BarraProgreso paso={paso} />

        {confirmandoCierre && (
          <div
            className="mb-4 rounded-lg border-2 p-4"
            style={{ borderColor: "var(--gx-bad)", background: "var(--gx-surface-2)" }}
          >
            <p className="text-sm" style={{ color: "var(--gx-ink)" }}>
              ¿Descartar este pago en curso? Se perderá la selección hecha hasta ahora.
            </p>
            <div className="mt-3 flex gap-2">
              <Button
                type="button"
                variant="secundario"
                className="flex-1"
                onClick={() => setConfirmandoCierre(false)}
              >
                Seguir aquí
              </Button>
              <Button type="button" variant="peligro" className="flex-1" onClick={onCerrar}>
                Descartar
              </Button>
            </div>
          </div>
        )}

        {paso === 1 && (
          <ContenidoPaso1
            miembros={miembros}
            planes={planes}
            onSeleccionar={(m) => {
              setMiembroElegido(m);
              setPlanElegidoId(null);
              setPaso(2);
            }}
          />
        )}
      </div>
    </div>
  );
}
```

Nota: `ContenidoPaso1` se define en el Step 2 de esta misma tarea, en el
mismo archivo. El componente principal queda incompleto (sin Pasos 2-4)
hasta las Tasks 7 y 8 — este Step solo establece el esqueleto, la barra
de progreso y el manejo de cierre/confirmación, que no dependen de los
demás pasos.

- [ ] **Step 2: Agregar `ContenidoPaso1` (reuso de `SelectorMiembroModal` sin su propio overlay)**

`SelectorMiembroModal` ya trae su propio `fixed inset-0` — para usarlo
como CONTENIDO de un paso (no como modal superpuesta aparte), se necesita
una variante embebida. Se opta por extraer la lógica de búsqueda a un
subcomponente reusado por ambos (el `SelectorMiembroModal` standalone
para `/pagos/nuevo`/`FormularioPago`, y este `ContenidoPaso1` para la
modal de Caja) — evita duplicar la lógica de filtro.

Agregar a `SelectorMiembroModal.tsx` (mismo archivo de Task 3) un export
adicional con el contenido sin el wrapper de overlay:

```typescript
// apps/web-admin/app/(panel)/caja/SelectorMiembroModal.tsx
// Agregar al final del archivo, después de SelectorMiembroModal:

/**
 * Contenido de búsqueda de SelectorMiembroModal, sin el wrapper de overlay
 * fijo — para insertar como paso de un wizard más grande (ver
 * ModalRegistrarPagoCaja, Paso 1) en vez de como modal superpuesta propia.
 */
export function BuscadorMiembro({
  miembros,
  planes,
  onSeleccionar,
}: {
  miembros: Miembro[];
  planes: PlanParaModal[];
  onSeleccionar: (miembro: MiembroConPlan) => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  const planesPorId = useMemo(() => new Map(planes.map((p) => [p.id, p])), [planes]);

  const busquedaAplicada = busqueda.trim().length >= MINIMO_CARACTERES_BUSQUEDA ? busqueda.trim().toLowerCase() : "";

  const resultados = useMemo(() => {
    if (!busquedaAplicada) return [];
    return miembros
      .filter((m) => `${m.nombre} ${m.cedula}`.toLowerCase().includes(busquedaAplicada))
      .slice(0, 20)
      .map((m) => ({
        id: m.id,
        nombre: m.nombre,
        cedula: m.cedula,
        fotoUrl: m.fotoUrl,
        fechaVencimiento: m.fechaVencimiento,
        plan: m.planId ? planesPorId.get(m.planId) : undefined,
      }));
  }, [miembros, busquedaAplicada, planesPorId]);

  return (
    <>
      <label className="flex flex-col gap-1.5 text-sm" style={{ color: "var(--gx-muted)" }}>
        Nombre o cédula
        <input
          type="text"
          autoFocus
          placeholder="Mínimo 3 caracteres..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="min-h-11 rounded-lg border px-3 outline-none transition-colors duration-150 focus:border-[var(--gx-accent)]"
          style={{ background: "var(--gx-surface-2)", borderColor: "var(--gx-edge)", color: "var(--gx-ink)" }}
        />
      </label>

      <div className="mt-4 flex-1 overflow-y-auto">
        {busquedaAplicada === "" && (
          <p className="py-8 text-center text-sm" style={{ color: "var(--gx-muted)" }}>
            Escribí al menos 3 caracteres para buscar.
          </p>
        )}

        {busquedaAplicada !== "" && resultados.length === 0 && (
          <p className="py-8 text-center text-sm" style={{ color: "var(--gx-muted)" }}>
            Ningún miembro coincide con "{busqueda.trim()}".
          </p>
        )}

        <div className="flex flex-col gap-2">
          {resultados.map((miembro) => (
            <button
              key={miembro.id}
              type="button"
              onClick={() => onSeleccionar(miembro)}
              className="flex items-center gap-3 rounded-lg border-2 p-3 text-left transition-colors duration-150"
              style={{ borderColor: "var(--gx-edge)" }}
            >
              <Avatar fotoUrl={miembro.fotoUrl} nombre={miembro.nombre} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium" style={{ color: "var(--gx-ink)" }}>
                  {miembro.nombre}
                </p>
                <p className="text-sm" style={{ color: "var(--gx-muted)" }}>
                  {miembro.cedula}
                </p>
              </div>
              <div className="text-right text-sm">
                {!miembro.plan ? (
                  <span style={{ color: "var(--gx-muted)" }}>Sin plan asignado</span>
                ) : (
                  <>
                    <p style={{ color: "var(--gx-ink)" }}>{miembro.plan.nombre}</p>
                    <p className="font-semibold" style={{ color: "var(--gx-accent)" }}>
                      ${miembro.plan.precioUSD.toFixed(2)}
                    </p>
                  </>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
```

Y refactorizar `SelectorMiembroModal` (el componente original, usado por
`FormularioPago.tsx`) para que internamente use `BuscadorMiembro` en vez
de duplicar la lógica:

```typescript
export function SelectorMiembroModal({
  miembros,
  planes,
  onSeleccionar,
  onCerrar,
}: {
  miembros: Miembro[];
  planes: PlanParaModal[];
  onSeleccionar: (miembro: MiembroConPlan) => void;
  onCerrar: () => void;
}) {
  useEffect(() => {
    function alPresionarTecla(e: KeyboardEvent) {
      if (e.key === "Escape") onCerrar();
    }
    document.addEventListener("keydown", alPresionarTecla);
    return () => document.removeEventListener("keydown", alPresionarTecla);
  }, [onCerrar]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "color-mix(in srgb, black 60%, transparent)" }}
      role="dialog"
      aria-modal="true"
      aria-label="Seleccionar miembro"
      onClick={onCerrar}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-2xl border-2 p-6"
        style={{ borderColor: "var(--gx-accent)", background: "var(--gx-surface)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold" style={{ color: "var(--gx-ink)" }}>
            Seleccionar miembro
          </h3>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="rounded-full p-1.5 text-sm transition-colors duration-150 hover:bg-[var(--gx-surface-2)]"
            style={{ color: "var(--gx-muted)" }}
          >
            ✕
          </button>
        </div>

        <div className="mt-4 flex flex-1 flex-col overflow-hidden">
          <BuscadorMiembro miembros={miembros} planes={planes} onSeleccionar={onSeleccionar} />
        </div>
      </div>
    </div>
  );
}
```

(la clase `mt-4` que antes estaba en el `<label>` directo pasa al
contenedor `<div>` que envuelve `BuscadorMiembro`, para conservar el
mismo espaciado visual).

- [ ] **Step 3: Agregar `ContenidoPaso1` en `ModalRegistrarPagoCaja.tsx`**

```tsx
function ContenidoPaso1({
  miembros,
  planes,
  onSeleccionar,
}: {
  miembros: Miembro[];
  planes: PlanParaModal[];
  onSeleccionar: (miembro: MiembroConPlan) => void;
}) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <BuscadorMiembro miembros={miembros} planes={planes} onSeleccionar={onSeleccionar} />
    </div>
  );
}
```

Agregar el import correspondiente en `ModalRegistrarPagoCaja.tsx`:

```typescript
import { BuscadorMiembro, type MiembroConPlan, type PlanParaModal } from "./SelectorMiembroModal";
```

(reemplaza el import parcial del Step 1 de esta tarea, que solo traía
`SelectorMiembroModal` — ya no se usa ese componente aquí, se usa
directamente `BuscadorMiembro`; se quita el import de
`SelectorMiembroModal` en este archivo).

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p apps/web-admin/tsconfig.json`
Expected: 0 errores en `SelectorMiembroModal.tsx`. `ModalRegistrarPagoCaja.tsx`
puede tener errores esperables por variables declaradas pero aún no usadas
(`planEfectivo`, `fechaFinCicloFinal`, `setFechaFinCicloFinal`) — se
resuelven en la Task 7. Confirmar que NINGÚN error sea de tipo
"Cannot find module" o de props faltantes en `BuscadorMiembro`/
`SelectorMiembroModal`.

- [ ] **Step 5: Commit**

```bash
git add "apps/web-admin/app/(panel)/caja/SelectorMiembroModal.tsx" "apps/web-admin/app/(panel)/caja/ModalRegistrarPagoCaja.tsx"
git commit -m "feat: esqueleto del modal multi-step de registrar pago con paso 1"
```

---

### Task 7: `ModalRegistrarPagoCaja.tsx` — Paso 2 (ficha de membresía)

**Files:**
- Modify: `apps/web-admin/app/(panel)/caja/ModalRegistrarPagoCaja.tsx`

**Interfaces:**
- Consumes: `calcularProyeccionRenovacion` (Task 2), `DiasDisponibles`
  (Task 1), `formatearBs` (ya existente).
- Produces: `ContenidoPaso2` (componente interno del archivo).

- [ ] **Step 1: Agregar función local de formato de fecha**

Reusa el mismo patrón que `FormularioMiembro.tsx` (no exportado desde
ahí, se duplica localmente — es una función pura de una línea, no amerita
extraer un módulo compartido para esto):

```typescript
function formatearFechaCorta(fecha: Date): string {
  return new Date(fecha).toLocaleDateString("es-VE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function iniciales(nombre: string): string {
  return nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join("");
}

function Avatar({ fotoUrl, nombre }: { fotoUrl: string | null; nombre: string }) {
  return (
    <div
      className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full text-lg font-semibold"
      style={{ background: "var(--gx-surface-2)", color: "var(--gx-muted)" }}
    >
      {fotoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- foto de miembro servida desde R2, dominio externo
        <img src={fotoUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        iniciales(nombre || "?")
      )}
    </div>
  );
}
```

(este `Avatar` local usa tamaño 64px, distinto del de `SelectorMiembroModal.tsx`
que es 44px para las filas de resultado — son componentes con nombre igual
pero en archivos distintos, cada uno con su propio tamaño; no hay colisión
porque no se exportan ni se importan entre sí).

- [ ] **Step 2: Agregar `ETIQUETA_FRECUENCIA` para mostrar "/mensual" etc.**

```typescript
import type { FrecuenciaPago } from "@gym-app/domain/entities/Plan";

const ETIQUETA_FRECUENCIA: Record<FrecuenciaPago, string> = {
  SEMANAL: "semanal",
  QUINCENAL: "quincenal",
  MENSUAL: "mensual",
};
```

- [ ] **Step 3: Agregar `ContenidoPaso2`**

```tsx
function ContenidoPaso2({
  miembro,
  planes,
  planElegidoId,
  onElegirPlan,
  tasaActual,
  onVolver,
  onContinuar,
}: {
  miembro: MiembroConPlan;
  planes: PlanParaModal[];
  planElegidoId: string | null;
  onElegirPlan: (id: string) => void;
  tasaActual: number | null;
  onVolver: () => void;
  onContinuar: (plan: PlanParaModal) => void;
}) {
  const planEfectivo = miembro.plan ?? planes.find((p) => p.id === planElegidoId);

  const proyeccion = planEfectivo
    ? calcularProyeccionRenovacion(miembro.fechaVencimiento, planEfectivo.frecuencia)
    : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Avatar fotoUrl={miembro.fotoUrl} nombre={miembro.nombre} />
        <div className="min-w-0">
          <p className="truncate font-semibold" style={{ color: "var(--gx-ink)" }}>
            {miembro.nombre}
          </p>
          <p className="text-sm" style={{ color: "var(--gx-muted)" }}>
            {miembro.cedula}
          </p>
        </div>
      </div>

      <div className="flex justify-between text-sm">
        <span style={{ color: "var(--gx-muted)" }}>Vencimiento</span>
        <DiasDisponibles fechaVencimiento={miembro.fechaVencimiento} />
      </div>

      {planEfectivo ? (
        <div className="rounded-lg border p-3 text-sm" style={{ borderColor: "var(--gx-edge)", background: "var(--gx-surface-2)" }}>
          <div className="flex justify-between">
            <span style={{ color: "var(--gx-muted)" }}>Plan</span>
            <span className="font-medium" style={{ color: "var(--gx-ink)" }}>
              {planEfectivo.nombre}
            </span>
          </div>
          <div className="mt-1 flex justify-between">
            <span style={{ color: "var(--gx-muted)" }}>Precio</span>
            <span className="font-semibold" style={{ color: "var(--gx-ink)" }}>
              ${planEfectivo.precioUSD.toFixed(2)}/{ETIQUETA_FRECUENCIA[planEfectivo.frecuencia]}
              {tasaActual !== null && ` · Bs. ${formatearBs(planEfectivo.precioUSD * tasaActual)}`}
            </span>
          </div>
        </div>
      ) : (
        <label className="flex flex-col gap-1.5 text-sm" style={{ color: "var(--gx-muted)" }}>
          Este miembro no tiene un plan asignado — elegí uno para continuar
          <select
            value={planElegidoId ?? ""}
            onChange={(e) => onElegirPlan(e.target.value)}
            className="min-h-11 rounded-lg border px-3 outline-none focus:border-[var(--gx-accent)]"
            style={{ background: "var(--gx-surface-2)", borderColor: "var(--gx-edge)", color: "var(--gx-ink)" }}
          >
            <option value="">Seleccioná un plan</option>
            {planes.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.nombre} — ${plan.precioUSD.toFixed(2)}
              </option>
            ))}
          </select>
        </label>
      )}

      {proyeccion && (
        <div className="rounded-lg border p-3 text-sm" style={{ borderColor: "var(--gx-edge)" }}>
          <p style={{ color: "var(--gx-ink)" }}>
            Al pagar la renovación, disfrutará de <strong>{proyeccion.diasDelPlan} días</strong>
            {proyeccion.adelantandoCuota && (
              <> ({proyeccion.diasTotalesTrasPago} días en total, incluyendo los días restantes)</>
            )}
            .
          </p>
          <p className="mt-1" style={{ color: "var(--gx-muted)" }}>
            Próximo vencimiento: {formatearFechaCorta(proyeccion.fechaProximoVencimiento)}
          </p>
        </div>
      )}

      <div className="mt-2 flex gap-2">
        <Button type="button" variant="secundario" className="flex-1" onClick={onVolver}>
          Volver
        </Button>
        <Button
          type="button"
          className="flex-1"
          disabled={!planEfectivo}
          onClick={() => planEfectivo && onContinuar(planEfectivo)}
        >
          Continuar
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Integrar `ContenidoPaso2` en el componente principal**

En `ModalRegistrarPagoCaja`, reemplazar el bloque final (que hoy solo
renderiza `paso === 1`) por:

```tsx
        {paso === 1 && (
          <ContenidoPaso1
            miembros={miembros}
            planes={planes}
            onSeleccionar={(m) => {
              setMiembroElegido(m);
              setPlanElegidoId(null);
              setPaso(2);
            }}
          />
        )}

        {paso === 2 && miembroElegido && (
          <ContenidoPaso2
            miembro={miembroElegido}
            planes={planes}
            planElegidoId={planElegidoId}
            onElegirPlan={setPlanElegidoId}
            tasaActual={tasaActual}
            onVolver={() => setPaso(1)}
            onContinuar={(plan) => {
              setPlanElegidoId(plan.id);
              setPaso(3);
            }}
          />
        )}
```

`planEfectivo` (declarado en el Step 1 de la Task 6, dentro del
componente principal) ya no hace falta ahí — se recalcula dentro de
`ContenidoPaso2`. Quitar esa variable no usada de
`ModalRegistrarPagoCaja` si el linter/typecheck la marca como no usada.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p apps/web-admin/tsconfig.json`
Expected: 0 errores. `fechaFinCicloFinal`/`setFechaFinCicloFinal` siguen
sin usarse todavía — error esperado hasta la Task 8, que sí los consume.

- [ ] **Step 6: Commit**

```bash
git add "apps/web-admin/app/(panel)/caja/ModalRegistrarPagoCaja.tsx"
git commit -m "feat: paso 2 del modal de pago muestra ficha y proyeccion de vencimiento"
```

---

### Task 8: `ModalRegistrarPagoCaja.tsx` — Pasos 3 y 4, secuencia post-pago

**Files:**
- Modify: `apps/web-admin/app/(panel)/caja/ModalRegistrarPagoCaja.tsx`

**Interfaces:**
- Consumes: `SelectorMetodoPago` (sin cambios), `registrarPagoAction`/
  `EstadoFormularioPago` (Task 5), `useFeedback`/`DURACION_MS` (Task 4).
- Produces: `ContenidoPaso3`, `ContenidoPaso4` (componentes internos).

- [ ] **Step 1: Imports adicionales**

```typescript
import { useActionState, useEffect } from "react";
import { useFeedback, DURACION_MS } from "@gym-app/ui/components/FeedbackOverlay";
import { SelectorMetodoPago } from "../pagos/SelectorMetodoPago";
import { registrarPagoAction } from "../pagos/actions";
```

(`useState` ya estaba importado desde React en el Step 1 de la Task 6;
agregar `useActionState` y `useEffect` a esa misma línea de import de
`"react"` en vez de una línea aparte).

- [ ] **Step 2: Agregar `ContenidoPaso3`**

```tsx
function ContenidoPaso3({
  miembroId,
  planId,
  monto,
  metodosPago,
  onVolver,
  onPagoRegistrado,
}: {
  miembroId: string;
  planId: string;
  monto: number;
  metodosPago: MetodoPago[];
  onVolver: () => void;
  onPagoRegistrado: (fechaFinCicloISO: string | undefined) => void;
}) {
  const [estado, enviar, enviando] = useActionState(registrarPagoAction, {});
  const { mostrarExito, mostrarError } = useFeedback();
  const [seleccionMetodo, setSeleccionMetodo] = useState<{
    metodoPagoId: string | null;
    metodo: string;
    tasaCambio: number | null;
    numeroOperacion: string;
  }>({ metodoPagoId: null, metodo: "", tasaCambio: null, numeroOperacion: "" });

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

  return (
    <form action={enviar} className="flex flex-col gap-4">
      <input type="hidden" name="miembroId" value={miembroId} />
      <input type="hidden" name="planId" value={planId} />
      <input type="hidden" name="monto" value={monto} />
      <input type="hidden" name="origen" value="caja" />
      <input type="hidden" name="metodo" value={seleccionMetodo.metodo} />
      <input type="hidden" name="metodoPagoId" value={seleccionMetodo.metodoPagoId ?? ""} />
      <input type="hidden" name="tasaCambio" value={seleccionMetodo.tasaCambio ?? ""} />
      <input type="hidden" name="numeroOperacion" value={seleccionMetodo.numeroOperacion} />

      <SelectorMetodoPago metodos={metodosPago} monto={monto} onCambio={setSeleccionMetodo} />

      <div className="mt-2 flex gap-2">
        <Button type="button" variant="secundario" className="flex-1" onClick={onVolver} disabled={enviando}>
          Volver
        </Button>
        <Button type="submit" className="flex-1" disabled={enviando || !seleccionMetodo.metodoPagoId}>
          {enviando ? "Registrando..." : "Registrar pago"}
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Agregar `ContenidoPaso4`**

```tsx
function ContenidoPaso4({
  miembro,
  planNombre,
  fechaFinCiclo,
  onCerrar,
}: {
  miembro: MiembroConPlan;
  planNombre: string;
  fechaFinCiclo: Date | null;
  onCerrar: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Avatar fotoUrl={miembro.fotoUrl} nombre={miembro.nombre} />
        <div className="min-w-0">
          <p className="truncate font-semibold" style={{ color: "var(--gx-ink)" }}>
            {miembro.nombre}
          </p>
          <p className="text-sm" style={{ color: "var(--gx-muted)" }}>
            {miembro.cedula}
          </p>
        </div>
      </div>

      <div className="flex justify-between text-sm">
        <span style={{ color: "var(--gx-muted)" }}>Nuevo vencimiento</span>
        <DiasDisponibles fechaVencimiento={fechaFinCiclo} />
      </div>

      {fechaFinCiclo && (
        <p className="text-right text-sm" style={{ color: "var(--gx-muted)" }}>
          {formatearFechaCorta(fechaFinCiclo)}
        </p>
      )}

      <div className="flex justify-between text-sm">
        <span style={{ color: "var(--gx-muted)" }}>Plan</span>
        <span className="font-medium" style={{ color: "var(--gx-ink)" }}>
          {planNombre}
        </span>
      </div>

      <Button type="button" className="mt-2" onClick={onCerrar}>
        Cerrar
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Integrar Pasos 3 y 4 en el componente principal**

Agregar tras el bloque de `paso === 2` (Task 7 Step 4):

```tsx
        {paso === 3 && miembroElegido && planElegidoId && (
          <ContenidoPaso3
            miembroId={miembroElegido.id}
            planId={planElegidoId}
            monto={
              (miembroElegido.plan ?? planes.find((p) => p.id === planElegidoId))?.precioUSD ?? 0
            }
            metodosPago={metodosPago}
            onVolver={() => setPaso(2)}
            onPagoRegistrado={(fechaFinCicloISO) => {
              setFechaFinCicloFinal(fechaFinCicloISO ? new Date(fechaFinCicloISO) : null);
              setPaso(4);
            }}
          />
        )}

        {paso === 4 && miembroElegido && (
          <ContenidoPaso4
            miembro={miembroElegido}
            planNombre={
              (miembroElegido.plan ?? planes.find((p) => p.id === planElegidoId))?.nombre ?? "—"
            }
            fechaFinCiclo={fechaFinCicloFinal}
            onCerrar={onCerrar}
          />
        )}
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p apps/web-admin/tsconfig.json`
Expected: 0 errores en todo el archivo — todas las variables de estado
declaradas en la Task 6 (`fechaFinCicloFinal`, `setFechaFinCicloFinal`)
ahora tienen consumidor.

- [ ] **Step 6: Commit**

```bash
git add "apps/web-admin/app/(panel)/caja/ModalRegistrarPagoCaja.tsx"
git commit -m "feat: pasos 3 y 4 del modal de pago, cobro y confirmacion final"
```

---

### Task 9: Integrar la modal en `/caja` — botón, layout, cierre de la card

**Files:**
- Create: `apps/web-admin/app/(panel)/caja/BotonRegistrarPagoCaja.tsx`
- Modify: `apps/web-admin/app/(panel)/caja/page.tsx`

**Interfaces:**
- Consumes: `ModalRegistrarPagoCaja` (Tasks 6-8).
- Produces: `BotonRegistrarPagoCaja({ miembros, planes, metodosPago, tasaActual }): JSX.Element`
  — wrapper cliente que administra el `useState` de apertura/cierre
  (necesario porque `caja/page.tsx` es Server Component).

- [ ] **Step 1: Crear `BotonRegistrarPagoCaja.tsx`**

```tsx
"use client";

import { useState } from "react";
import type { Miembro } from "@gym-app/domain/entities/Miembro";
import type { MetodoPago } from "@gym-app/domain/entities/MetodoPago";
import { Button } from "@gym-app/ui/components/Button";
import { ModalRegistrarPagoCaja } from "./ModalRegistrarPagoCaja";
import type { PlanParaModal } from "./SelectorMiembroModal";

export function BotonRegistrarPagoCaja({
  miembros,
  planes,
  metodosPago,
  tasaActual,
}: {
  miembros: Miembro[];
  planes: PlanParaModal[];
  metodosPago: MetodoPago[];
  tasaActual: number | null;
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
          onCerrar={() => setModalAbierta(false)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: Modificar `caja/page.tsx`**

Quitar los imports de `FormularioPago` y `registrarPagoAction` (ya no se
usan en este archivo), agregar el de `BotonRegistrarPagoCaja`:

```typescript
import { BotonRegistrarPagoCaja } from "./BotonRegistrarPagoCaja";
```

(quitar `import { FormularioPago } from "../pagos/FormularioPago";` y
`import { registrarPagoAction } from "../pagos/actions";` — confirmar con
grep que ningún otro lugar de este archivo los sigue usando antes de
quitarlos; `registrarPagoAction` en particular NO se usa en ningún otro
lado de `caja/page.tsx` tras este cambio).

Reemplazar el bloque de la card "Registrar pago":

```tsx
          {esPropio ? (
            <Card className="text-sm">
              <h2 className="mb-3 font-semibold" style={{ color: "var(--gx-ink)" }}>
                Registrar pago
              </h2>
              <BotonRegistrarPagoCaja
                miembros={miembrosActivos}
                planes={planesActivos}
                metodosPago={metodosPago}
                tasaActual={tasaActual}
              />
            </Card>
          ) : (
            <div>
              <AvisoCajaAjena
                usuarioNombre={turnoAbierto.turno.usuarioNombre ?? "otro usuario"}
                abiertoEn={turnoAbierto.turno.abiertoEn}
              />
            </div>
          )}
```

(se quita `lg:col-span-2 lg:row-span-2` de ambas ramas — la card y el
aviso de caja ajena pasan a tamaño natural de una columna, según lo
acordado en el spec).

Actualizar el comentario del bento grid que describe el layout (líneas
~103-106 del archivo original):

```tsx
        {/* Bento grid en desktop: las 3 cards de la fila superior
            (Registrar pago, Abierto desde, Resumen por método) tienen el
            mismo ancho. Pagos/egresos del turno y arqueo van a todo el
            ancho debajo. En mobile todo se apila en una sola columna. */}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p apps/web-admin/tsconfig.json`
Expected: 0 errores en todo el proyecto.

- [ ] **Step 4: Grep de verificación**

```bash
grep -n "FormularioPago\|registrarPagoAction" "apps/web-admin/app/(panel)/caja/page.tsx"
```

Expected: sin resultados (ambos imports y usos quedaron completamente
reemplazados por `BotonRegistrarPagoCaja`).

- [ ] **Step 5: Commit**

```bash
git add "apps/web-admin/app/(panel)/caja/BotonRegistrarPagoCaja.tsx" "apps/web-admin/app/(panel)/caja/page.tsx"
git commit -m "feat: la card de registrar pago en caja abre el modal multi-step"
```

---

### Task 10: Verificación final

**Files:** ninguno (solo verificación, sin cambios de código).

- [ ] **Step 1: Typecheck completo**

Run: `npx tsc --noEmit -p apps/web-admin/tsconfig.json`
Expected: 0 errores.

- [ ] **Step 2: Grep de residuos**

```bash
grep -rn "sinPlan" apps/web-admin --include="*.tsx"
```

Expected: sin resultados (la variable se eliminó en la Task 3 Step 2; si
aparece, es un residuo del refactor que hay que limpiar).

- [ ] **Step 3: Confirmar que `FormularioPago.tsx` sigue funcionando igual fuera de Caja**

```bash
grep -n "FormularioPago" "apps/web-admin/app/(panel)/pagos/nuevo/page.tsx" "apps/web-admin/app/(panel)/miembros/[id]/page.tsx"
```

Expected: ambos archivos siguen importando y usando `FormularioPago` sin
cambios de props respecto a como estaba antes de este plan (no se tocó
ninguno de los dos en ninguna tarea).

- [ ] **Step 4: Nota de verificación manual pendiente**

Este plan no incluye verificación visual en navegador (`/run`) porque no
es posible en el entorno de ejecución de este plan. Antes de dar por
cerrado el trabajo, alguien con acceso a la app corriendo debe probar
manualmente en `/caja`:
1. Abrir la modal, buscar un miembro con plan vigente y vencido, y otro
   con plan vigente al día — confirmar los textos/colores del Paso 2.
2. Un miembro sin plan asignado — confirmar que aparece en el buscador
   (ya no bloqueado) y que el Paso 2 deja elegir un plan.
3. Completar un pago real y confirmar que el Paso 4 muestra la fecha de
   vencimiento correcta, coincidente con lo que luego se ve en la ficha
   del miembro en `/miembros/[id]`.
4. Cerrar la modal a mitad de flujo (Pasos 2 y 3) y confirmar que pide
   confirmación; cerrar en Paso 1 y Paso 4 y confirmar que no la pide.
5. Confirmar visualmente el nuevo layout de las 3 cards de la fila
   superior de `/caja` (incluyendo el caso "caja ajena", con
   `AvisoCajaAjena` en vez del botón).

No hay commit en esta tarea — es solo verificación y una nota para la
siguiente sesión/persona.
