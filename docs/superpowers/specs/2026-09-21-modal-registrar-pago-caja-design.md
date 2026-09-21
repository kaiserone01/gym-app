# Modal multi-step "Registrar pago" en Caja — Diseño

## Contexto

Hoy en `/caja`, la card "Registrar pago" muestra `FormularioPago` completo
embebido en la página (elegir miembro vía `SelectorMiembroModal`, plan/monto
fijos según su plan vigente, y `SelectorMetodoPago` — todo en un solo
`<form>` con un único submit). Se pide convertir ese flujo en una modal de
4 pasos con barra de progreso, agregando en el medio una ficha informativa
de la membresía del miembro con proyección de vencimiento antes de cobrar,
y una pantalla de confirmación final después de pagar.

Este cambio es exclusivo de Caja. `FormularioPago.tsx` sigue existiendo tal
cual, sin modificar, para sus otros dos consumidores actuales
(`/pagos/nuevo` y `/miembros/[id]`) — no se generaliza a multi-step ahí,
no fue parte de lo pedido.

## Alcance

- **Solo renovar el plan vigente** del miembro — no se puede cambiar de
  plan ni ajustar el precio desde la modal (igual que el comportamiento
  actual de Caja).
- **Excepción puntual:** si el miembro elegido no tiene `planId` asignado
  (`null`), el Paso 2 muestra un selector de plan (mismo `<select>` simple
  de planes activos que ya existe en `FormularioPago.tsx` para el caso sin
  `planFijo` — sin la opción "Personalizado", que es exclusiva de alta/edición
  de miembro). Si ya tiene un plan asignado, no hay selector, solo
  renovación.
- Métodos de pago por sucursal, caja separada por sede, etc. — sin cambios,
  fuera de alcance de este trabajo.

## Arquitectura

Componente nuevo `ModalRegistrarPagoCaja.tsx` en
`apps/web-admin/app/(panel)/caja/`, con estado de wizard
(`paso: 1 | 2 | 3 | 4`) que vive en memoria hasta el submit final del
Paso 3. No es un `<form>` único: cada paso es una pantalla propia dentro
del mismo componente, reusando piezas existentes:

- Paso 1 reusa `SelectorMiembroModal` (ya existe, sin cambios) como
  contenido del paso, no como modal aparte superpuesta.
- Paso 3 reusa `SelectorMetodoPago` (ya existe, sin cambios) dentro de un
  `<form>` que sí dispara el submit real (`registrarPagoAction`).
- El overlay de éxito reusa `useFeedback().mostrarExito` (ya existe,
  global, se autocierra a los 4s) — no se crea una animación nueva.

## Trigger y layout en `/caja`

La card "Registrar pago" dentro de la grilla bento actual
(`caja/page.tsx`) deja de renderizar `<FormularioPago>` embebido. Pasa de
`lg:col-span-2 lg:row-span-2` a tamaño natural (`lg:col-span-1`, sin
`row-span`), mostrando solo un botón "Registrar pago" que abre la modal.
Las 3 cards de esa fila (Registrar pago / Abierto desde / Resumen por
método) quedan del mismo ancho en desktop.

```tsx
<Card className="text-sm">
  <h2 className="mb-3 font-semibold" style={{ color: "var(--gx-ink)" }}>
    Registrar pago
  </h2>
  <Button onClick={() => setModalAbierta(true)}>Registrar pago</Button>
  {modalAbierta && (
    <ModalRegistrarPagoCaja
      miembros={miembrosActivos}
      planes={planesActivos}
      metodosPago={metodosPago}
      tasaActual={tasaActual}
      onCerrar={() => setModalAbierta(false)}
    />
  )}
</Card>
```

El `useState` de `modalAbierta` vive en un wrapper cliente (`caja/page.tsx`
es Server Component — el botón y la modal necesitan un componente cliente
que envuelva ambos; se crea `BotonRegistrarPagoCaja.tsx` para eso, recibe
los mismos datos ya resueltos por la page y los reenvía).

## Barra de progreso

4 puntos numerados horizontal arriba de la modal, conectados por una línea.
El punto del paso activo y los pasos ya completados usan `--gx-accent`; los
pendientes usan `--gx-muted`/`--gx-edge`. Sin porcentaje ni barra continua.

## Paso 1 — Buscar miembro

Reuso literal de `SelectorMiembroModal` (mismo criterio: mínimo 3
caracteres, busca por nombre+cédula, resultados en cards, máximo 20). Al
elegir un miembro (`onSeleccionar`), guarda `MiembroConPlan` en el estado
del wizard y avanza a Paso 2.

Cerrar la modal completa desde este paso (X/Escape/click afuera) cierra
directo, sin confirmar — no hay nada elegido todavía que se pierda.

## Paso 2 — Ficha de membresía

Necesita más datos de los que trae `MiembroConPlan` hoy (`id`, `nombre`,
`cedula`, `fotoUrl`, `plan`) — le falta `fechaVencimiento`. Se extiende esa
interfaz (en `SelectorMiembroModal.tsx`, usada por ambos: el propio
selector y el nuevo Paso 2) agregando el campo, poblado desde el
`Miembro` ya disponible en `caja/page.tsx`:

```typescript
// apps/web-admin/app/(panel)/caja/SelectorMiembroModal.tsx
export interface PlanParaModal {
  id: string;
  nombre: string;
  precioUSD: number;
  multisede: boolean;
  frecuencia: FrecuenciaPago; // nuevo — lo necesita calcularProyeccionRenovacion
}

export interface MiembroConPlan {
  id: string;
  nombre: string;
  cedula: string;
  fotoUrl: string | null;
  fechaVencimiento: Date | null;
  plan: PlanParaModal | undefined;
}
```

(el mapeo en `resultados` dentro de `SelectorMiembroModal.tsx` agrega
`fechaVencimiento: m.fechaVencimiento`; el `planesPorId` de ese mismo
archivo agrega `frecuencia: p.frecuencia` al construir cada `PlanParaModal`
desde el `Plan` completo recibido por prop).

`PlanParaSelector` en `FormularioPago.tsx` (usado para el `<select>` de la
excepción "miembro sin plan") gana el mismo campo `frecuencia` por la
misma razón — ambas interfaces alimentan `calcularProyeccionRenovacion`.

### Contenido de la ficha

1. **Foto + nombre + cédula** — mismo patrón `Avatar`/`iniciales` ya
   usado en `SelectorMiembroModal.tsx` y `ListaMiembros.tsx` (se extrae a
   un módulo compartido si conviene, o se duplica la función pura
   `iniciales`/`Avatar`, igual que ya está duplicada entre esos dos
   archivos hoy — no es una regresión de este cambio).

2. **Estado de vencimiento** — reusa el criterio exacto de
   `ListaMiembros.tsx` (`diasHastaVencimiento`, `DiasDisponibles`):
   - Sin `fechaVencimiento`: "Sin pagos registrados" (color `--gx-muted`).
   - Vencido (`dias < 0`): "Vencido hace N día(s)" en rojo (`--gx-bad`),
     como badge.
   - Vigente: "N día(s)" en `--gx-ink`.

   Estas dos funciones (`diasHastaVencimiento`, `DiasDisponibles`) se
   extraen de `ListaMiembros.tsx` a un módulo compartido
   `apps/web-admin/app/(panel)/miembros/vencimiento.ts` y se reimportan
   en ambos lugares — evita duplicar la fórmula de días, que además
   reutiliza el Paso 2 para calcular la proyección (ver más abajo).

3. **Plan vigente** (si `plan` no es `undefined`): nombre + precio en
   ambas monedas.

   ```tsx
   <div className="flex justify-between">
     <span>Plan</span>
     <span>{plan.nombre}</span>
   </div>
   <div className="flex justify-between">
     <span>Precio</span>
     <span>
       ${plan.precioUSD.toFixed(2)}
       {tasaActual !== null && ` / Bs. ${formatearBs(plan.precioUSD * tasaActual)}`}
     </span>
   </div>
   ```

   `tasaActual` llega como prop desde `caja/page.tsx` (ya se calcula ahí
   hoy para el resumen del turno) hasta `ModalRegistrarPagoCaja`. Si es
   `null` (sin tasa BCV disponible), se omite la conversión a Bs, mismo
   criterio que el resto de la app (`formatearBsConRef`).

   Si `plan` es `undefined` (miembro sin plan asignado): en su lugar, un
   `<select>` de `planes` activos (prop ya recibida, mismo tipo
   `PlanParaSelector` que usa `FormularioPago.tsx`) que al elegir uno
   resuelve el resto de la ficha (precio, proyección) como si fuera el
   plan vigente. Sin esa selección, el botón Continuar queda
   deshabilitado.

4. **Cuadro de proyección** — replica en el cliente la fórmula exacta del
   backend (`packages/domain/use-cases/RegistrarPago.ts`):

   ```typescript
   // apps/web-admin/app/(panel)/caja/proyeccionRenovacion.ts
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

   Esto es una réplica intencional de la lógica en
   `RegistrarPago.ts:79-81` (`base = activa && activa.fin > ahora ? activa.fin : ahora`,
   `fin = base + DURACION_DIAS_POR_FRECUENCIA[plan.frecuencia]`) — mismo
   criterio, mismos nombres de concepto, para que lo mostrado ANTES de
   pagar coincida con lo que el backend va a aplicar. `activa.fin` en el
   backend viene de `Suscripcion`, no de `Miembro.fechaVencimiento`
   directamente, pero ambos deberían estar sincronizados en todo momento
   (`actualizarFechasPago` los mantiene iguales) — se usa
   `Miembro.fechaVencimiento` en el cliente porque es el dato que ya
   viaja en `MiembroConPlan`, sin una consulta extra a `Suscripcion`.

   Render:

   ```tsx
   <div className="rounded-lg border p-3" style={{ borderColor: "var(--gx-edge)", background: "var(--gx-surface-2)" }}>
     <p>
       Al pagar la renovación, disfrutará de <strong>{proyeccion.diasDelPlan} días</strong>
       {proyeccion.adelantandoCuota && (
         <> ({proyeccion.diasTotalesTrasPago} días en total, incluyendo los días restantes)</>
       )}
       .
     </p>
     <p>Próximo vencimiento: {formatearFechaCorta(proyeccion.fechaProximoVencimiento)}</p>
   </div>
   ```

5. **Botón Continuar** — deshabilitado si no hay plan resuelto (ni
   `plan` del miembro ni uno elegido en el selector de excepción). Al
   confirmar, guarda el `planId`/`precioUSD` efectivo en el estado del
   wizard y avanza a Paso 3.

Botón Volver (a Paso 1). Cerrar la modal completa desde acá pide
confirmación (ver sección Cierre).

## Paso 3 — Método de pago

Un `<form>` que envuelve `SelectorMetodoPago` (sin cambios) más los
`<input type="hidden">` ya usados en `FormularioPago.tsx`
(`miembroId`, `planId`, `monto`, `metodo`, `metodoPagoId`, `tasaCambio`,
`numeroOperacion`, `origen="caja"`), con `useActionState(registrarPagoAction, {})`
tal como ya funciona hoy. Botón "Registrar pago" al final, deshabilitado
sin `metodoPagoId`.

Botón Volver (a Paso 2, sin perder la selección de miembro/plan). Cerrar
la modal completa desde acá pide confirmación.

### Extensión de `registrarPagoAction`

Hoy devuelve `{ ok: "Pago registrado." }` sin datos del pago. Se extiende
`EstadoFormularioPago` para incluir el resultado real necesario en el
Paso 4:

```typescript
// apps/web-admin/app/(panel)/pagos/actions.ts
export interface EstadoFormularioPago {
  error?: string;
  ok?: string;
  fechaFinCiclo?: string; // ISO — solo presente cuando ok está seteado
}
```

Y en el cuerpo de `registrarPagoAction`, capturar el `Pago` devuelto por
`registrarPago(...)` (hoy se ignora el valor de retorno) y devolver su
`fechaFinCiclo`:

```typescript
  const pago = await registrarPago(/* ... */);

  // ... revalidatePath(...) sin cambios ...

  if (origen !== "miembro" && origen !== "caja") {
    redirect(conMensajeOk(`/miembros/${miembroId}`, "Pago registrado."));
  }

  return { ok: "Pago registrado.", fechaFinCiclo: pago.fechaFinCiclo?.toISOString() };
```

Este cambio es aditivo (nuevo campo opcional) — no afecta a
`/pagos/nuevo` ni `/miembros/[id]`, que ya ignoran cualquier campo del
estado que no leen.

### Secuencia tras el submit

Al recibir `estado.ok` (vía el mismo `useEffect` que ya dispara
`mostrarExito` en `FormularioPago.tsx`), el wizard:
1. Dispara `mostrarExito("Pago registrado.")` (overlay global existente,
   se autocierra a los 4s) — el wizard NO avanza todavía, queda en Paso 3
   tapado por el overlay.
2. Guarda `estado.fechaFinCiclo` en el estado del wizard.
3. Un `useEffect` con un `setTimeout` de la misma duración que
   `FeedbackOverlay` (`DURACION_MS = 4000`, hoy no exportada — se exporta
   esa constante desde `FeedbackOverlay.tsx` para no duplicar el número
   mágico) avanza el wizard a Paso 4 cuando se cumple.

## Paso 4 — Confirmación final

1. Foto + nombre + cédula (mismo patrón que Paso 2).
2. Nueva fecha de vencimiento (`fechaFinCiclo` devuelto por la action) +
   días disponibles — recalculados con `diasHastaVencimiento`/
   `DiasDisponibles` (el módulo compartido de la sección Paso 2) contra
   esa fecha real, no la proyección del Paso 2.
3. Nombre del plan (el mismo `planId` confirmado en Paso 2).

Botón "Cerrar" — cierra la modal completa y resetea el wizard (para que
la próxima apertura empiece limpia en Paso 1). Sin botón Volver (ya se
pagó, no hay nada que deshacer desde acá).

## Cierre de la modal (X / Escape / click afuera)

- **Paso 1:** cierra directo, sin confirmar (nada elegido todavía).
- **Pasos 2 y 3:** pide confirmación ("¿Descartar este pago en curso?" /
  similar) antes de cerrar — se perdería la selección de miembro/plan/
  método hecha hasta ahí. Confirmar cierra y resetea a Paso 1; cancelar
  mantiene la modal abierta en el paso actual.
- **Paso 4:** cierra directo (ya se pagó, no hay nada en curso que
  descartar) — el único botón visible ahí es "Cerrar".

Nota de consistencia: `PlanParaModal` (en `SelectorMiembroModal.tsx`) y
`PlanParaSelector` (en `FormularioPago.tsx`) tienen la misma forma
estructural — ambas ganan `frecuencia: FrecuenciaPago` en este cambio.
`ModalRegistrarPagoCaja` recibe `planes: PlanParaSelector[]` desde
`caja/page.tsx` (mismo prop `planesActivos` ya usado hoy) y lo reenvía sin
transformar a ambos componentes reusados.

## Archivos afectados (resumen)

- Crear: `apps/web-admin/app/(panel)/caja/ModalRegistrarPagoCaja.tsx`
- Crear: `apps/web-admin/app/(panel)/caja/BotonRegistrarPagoCaja.tsx`
- Crear: `apps/web-admin/app/(panel)/caja/proyeccionRenovacion.ts`
- Crear: `apps/web-admin/app/(panel)/miembros/vencimiento.ts` (extraído de
  `ListaMiembros.tsx`)
- Modify: `apps/web-admin/app/(panel)/miembros/ListaMiembros.tsx` (usa el
  módulo extraído en vez de sus copias locales)
- Modify: `apps/web-admin/app/(panel)/caja/SelectorMiembroModal.tsx`
  (agrega `fechaVencimiento` a `MiembroConPlan`)
- Modify: `apps/web-admin/app/(panel)/caja/page.tsx` (reemplaza
  `<FormularioPago>` embebido por `<BotonRegistrarPagoCaja>`, ajusta
  `col-span`/`row-span` de esa card)
- Modify: `apps/web-admin/app/(panel)/pagos/actions.ts` (`EstadoFormularioPago`
  gana `fechaFinCiclo`, `registrarPagoAction` captura y devuelve el `Pago`)
- Modify: `packages/ui/components/FeedbackOverlay.tsx` (exporta
  `DURACION_MS`)

## Fuera de alcance (explícito)

- `FormularioPago.tsx` NO se convierte en multi-step — sigue usándose tal
  cual en `/pagos/nuevo` y `/miembros/[id]`.
- Cambiar de plan desde la modal (salvo la excepción de miembro sin plan
  asignado).
- Cualquier cambio a `SelectorMetodoPago`, `RegistrarPago` (dominio),
  cálculo de tasa BCV, o separación de caja por sucursal — todo eso ya
  está resuelto y no se toca.
