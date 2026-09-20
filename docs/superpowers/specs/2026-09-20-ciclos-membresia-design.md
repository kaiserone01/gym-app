# Ciclos de membresía, historial de pagos enriquecido y período de gracia

## Contexto

El panel de Miembros no tiene hoy una vista de "ciclos" de membresía.
`Suscripcion` existe pero se **extiende** en cada pago (no se crea una
fila nueva), así que no hay rastro histórico de los rangos de fechas
anteriores. El historial de pagos (`/miembros/[id]/pagos`) solo muestra
fecha, monto y método — no la tasa aplicada, quién registró el pago, ni
la hora exacta, aunque esos datos ya existen en `Pago`.

Por separado, `Sucursal.diasGracia` existe en el schema y es editable
desde `/sucursales`, pero **no se usa en ninguna lógica de check-in**:
el estado pasa a `"vencido"` el mismo día que vence, sin distinguir si
el miembro sigue dentro del período de gracia de su sede.

## Objetivo

1. Mostrar en la ficha del miembro un bloque de "Ciclos" (períodos de
   membresía) con su rango de fechas y estado.
2. Enriquecer el historial de pagos con tasa aplicada, quién registró
   el pago, hora exacta y el rango del ciclo que ese pago activó.
3. Mostrar la "última fecha de renovación" como dato destacado en la
   ficha.
4. Usar por fin `Sucursal.diasGracia`: nuevo estado de check-in
   `"en_gracia"` cuando el miembro está vencido pero todavía dentro del
   período de gracia de la sede donde hace check-in, con mensaje
   correspondiente en el kiosco.

## Fuera de alcance

- No se toca la lógica de prorrateo/extensión de `Suscripcion` (sigue
  extendiendo la misma fila, sumando el período desde la fecha de
  vencimiento anterior — ya funciona como se espera).
- No se muestra monto a pagar en el kiosco para los estados
  `"en_gracia"`/`"vencido"` — solo el mensaje textual.
- Los pagos registrados **antes** de esta migración no tendrán rango de
  ciclo (`fechaInicioCiclo`/`fechaFinCiclo` quedan `null`) — no se
  reconstruyen retroactivamente.

## Diseño

### 1. Modelo de datos

`Pago` (migración, columnas nullable — no rompe pagos históricos):

```prisma
model Pago {
  // ...existente...
  fechaInicioCiclo DateTime? // inicio real del ciclo que este pago activó/extendió
  fechaFinCiclo    DateTime? // fin real de ese ciclo (mismo valor que Suscripcion.fin tras este pago)
}
```

`EstadoCheckIn` (tipo de dominio en `packages/domain/entities/CheckIn.ts`,
no enum de DB) gana un tercer valor:

```ts
export type EstadoCheckIn = "activo" | "en_gracia" | "vencido" | "sucursal_incorrecta";
```

Sin cambios en `Suscripcion` ni en `Miembro`.

### 2. Dominio

**`RegistrarPago`** (`packages/domain/use-cases/RegistrarPago.ts`): sin
tocar la lógica de prorrateo existente, se captura:

- `base` = inicio real del nuevo ciclo — el valor de `activa.fin` ANTES
  de extenderlo (o `ahora` si no había suscripción activa vigente).
- `fin` = el valor ya calculado (`base + duración del plan`).

Ambos se pasan a `deps.pagos.crear({ ..., fechaInicioCiclo: base,
fechaFinCiclo: fin })`.

**`validarAccesoSucursal`**
(`packages/domain/use-cases/ValidarAccesoSucursalPorPlan.ts`): agrega
parámetros `fechaVencimientoMiembro: Date | null` y `diasGracia:
number` (de la sede física donde ocurre el check-in). Regla:

```
sin suscripción activa vigente:
  si fechaVencimientoMiembro existe Y
     ahora <= fechaVencimientoMiembro + diasGracia días
    → "en_gracia"
  si no
    → "vencido"
```

Los días de gracia empiezan a contar el día SIGUIENTE al vencimiento
(vencimiento 31/08, diasGracia=3 → en_gracia del 01/09 al 03/09
inclusive; 04/09 en adelante ya es "vencido").

**`RegistrarCheckIn`**: ya tiene `deps.sucursales` — pasa
`sucursal.diasGracia` (de la sede física, `input.sucursalId`) y
`miembro.fechaVencimiento` a `validarAccesoSucursal`.

### 3. Kiosco

`apps/kiosk/lib/api.ts`: `EstadoCheckIn` incluye `"en_gracia"`.

`apps/kiosk/components/AccessCard.tsx`:
- `ETIQUETA_ESTADO` agrega: `en_gracia: "Membresía vencida — período de gracia"`.
- Color: `"en_gracia"` usa tono ámbar/advertencia (distinto del rojo de
  `"vencido"` y el verde de `"activo"`).
- Mensaje adicional bajo el estado (sin monto, ya decidido):
  - `en_gracia`: *"Tenés N día(s) de gracia — acercate a recepción a
    renovar tu plan."*
  - `vencido`: *"Tu período de gracia terminó — acercate a recepción a
    renovar tu plan."*
- El endpoint `/api/checkin` debe devolver los días de gracia restantes
  (o la fecha límite) para que el kiosco calcule/muestre N sin tener
  que reimplementar la resta de fechas en el cliente. Se agrega
  `diasGraciaRestantes: number | null` a `RegistrarCheckInResultado`.

### 4. Ficha de miembro — bloque "Ciclos"

Nueva card **"Ciclos"** en `/miembros/[id]`, junto a "Plan de
membresía":

- Lista los últimos 3-5 pagos del miembro que tengan
  `fechaInicioCiclo`/`fechaFinCiclo` no nulos (pagos previos a la
  migración no aparecen).
- Cada fila: rango `dd/mm → dd/mm`, badge de estado — solo el ciclo más
  reciente (por `fechaFinCiclo` descendente) puede ser "VIGENTE"; el
  resto se muestra "VENCIDO".
- Link "Ver todos los ciclos" → `/miembros/[id]/pagos` (historial
  completo ya existente).

Card **"Plan de membresía"**: agrega un dato destacado "Última fecha de
renovación" junto a "Fecha de Vencimiento", con el valor de
`fechaInicioCiclo` del pago más reciente que tenga ese campo (mismo
valor que la fila VIGENTE del bloque Ciclos).

### 5. Historial de pagos enriquecido (`/miembros/[id]/pagos`)

Nuevas columnas en la tabla existente:
- **Hora** (junto a Fecha — `fechaPago` ya tiene el timestamp completo).
- **Tasa aplicada** (`Bs. {tasaCambio}` si no es null, si no "—").
- **Registrado por** (`registradoPorNombre`).
- **Ciclo** (`dd/mm → dd/mm` si `fechaInicioCiclo`/`fechaFinCiclo`
  existen, si no "—").

Cambios de dominio:
- `packages/domain/entities/Pago.ts`: agrega `registradoPorNombre?:
  string`, `fechaInicioCiclo: Date | null`, `fechaFinCiclo: Date |
  null`.
- `packages/infrastructure/persistence/prisma/PrismaPagoRepository.ts`:
  agrega join a `UsuarioAdmin` para `registradoPorNombre` (mismo patrón
  ya usado con `miembro.nombre` en `listarPorOrganizacion`/
  `listarPorMiembro`), y mapea los dos campos de ciclo nuevos.

## Testing

- Verificar contra la DB real (patrón ya usado en el proyecto) que:
  - Un pago nuevo sobre un miembro sin suscripción activa crea
    `fechaInicioCiclo = ahora` y `fechaFinCiclo = ahora + duración`.
  - Un pago nuevo sobre una suscripción activa vigente (con días
    restantes) usa `fechaInicioCiclo = fin anterior` (no "ahora").
  - `validarAccesoSucursal` devuelve `"en_gracia"` dentro de la ventana
    y `"vencido"` fuera de ella, en el límite exacto de días.
  - El bloque de Ciclos y el historial muestran correctamente pagos
    viejos (sin datos de ciclo) junto a pagos nuevos (con datos).
- Build de producción limpio en `web-admin` y `kiosk` (typecheck +
  `next build`).
