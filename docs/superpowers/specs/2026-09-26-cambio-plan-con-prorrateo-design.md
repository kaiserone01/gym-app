# Cambio de plan con prorrateo en cualquier sentido — Diseño

## Contexto

`FormularioCambiarPlan` (usado tanto en la ficha del miembro como, desde la
sesión anterior, en el Paso 2 del wizard de Caja) permite subir o bajar de
plan a mitad de ciclo cobrando "solo la diferencia" entre `precioNuevo` y
`precioViejo`, sin mover el vencimiento. Esa fórmula solo tiene sentido
entre planes de la MISMA frecuencia (dos mensuales, dos semanales...), así
que hoy el selector filtra los planes de otra frecuencia y
`cambiarPlanConPago` lanza `FrecuenciaDistintaError` si igual se intenta.

En la práctica esto bloquea un caso de uso real: un miembro con plan
Semanal que quiere pasar a Mensual (o viceversa) a mitad de ciclo. El
usuario pidió explícitamente que el cambio de plan funcione "en cualquier
sentido" (subir o bajar, cualquier frecuencia), aplicando el prorrateo
correcto según los días ya consumidos del ciclo actual, cobrando si hace
falta o dejando saldo a favor si sobra.

## Fórmula de prorrateo

Dado un cambio de plan a mitad de ciclo:

```
diasRestantes      = max(0, díasEntre(ahora, fechaVencimientoActual))
valorNoConsumido   = diasRestantes × (precioViejo / diasDelCicloViejo)
precioPorDiaNuevo  = precioNuevo / diasDelCicloNuevo
```

`valorNoConsumido` es cuánto vale, en USD, la porción del ciclo viejo que
el miembro pagó pero todavía no "consumió" (los días que le quedaban).
`diasDelCicloX` viene de `DURACION_DIAS_POR_FRECUENCIA` (ya existente en
`packages/domain/entities/Plan.ts`).

Sin ciclo vigente (miembro vencido, o nunca pagó), no hay nada que
prorratear — `cambiarPlanConPago` sigue lanzando `SinCicloVigenteError`
exactamente como hoy; ese caso ya está cubierto por el selector simple sin
cobro que Caja usa cuando no hay ciclo vigente (implementado en la sesión
anterior).

### Modo A — "Solo ajustar vencimiento"

El valor no consumido se convierte a días equivalentes del plan nuevo, sin
ningún tope de ciclo y sin cobrar ni acreditar nada — el valor siempre se
traduce en tiempo de vigencia, nunca en dinero sobrante:

```
diasNuevos      = valorNoConsumido / precioPorDiaNuevo
nuevoVencimiento = ahora + diasNuevos
```

Ejemplo (Semanal $8, 7 días → Mensual $30, 30 días, con 3 días restantes):
`valorNoConsumido = 3 × (8/7) = $3.43`; `diasNuevos = 3.43 / (30/30) =
3.43`; el miembro queda con vencimiento `ahora + 3.43 días`, sin cobrar
nada.

Ejemplo inverso (Mensual $30 → Semanal $8, con 20 días restantes):
`valorNoConsumido = 20 × (30/30) = $20`; `diasNuevos = 20 / (8/7) = 17.5`
días de vigencia — más que un ciclo semanal normal (7 días), y eso es
correcto: en Modo A no hay tope, el valor completo se refleja como tiempo,
nunca se genera saldo a favor.

### Modo B — "Pagar ciclo completo del nuevo"

El vencimiento pasa a ser un ciclo completo del plan nuevo desde hoy,
cobrando o acreditando la diferencia entre su precio y el valor no
consumido:

```
nuevoVencimiento = ahora + diasDelCicloNuevo
diferencia       = precioNuevo - valorNoConsumido
```

- `diferencia > 0`: se cobra ese monto completo, en un solo pago con un
  solo método (igual que el cobro de diferencia actual) — no admite abono
  parcial, mantiene el cambio de plan como una operación atómica simple.
- `diferencia < 0`: se acredita `|diferencia|` como saldo a favor del
  miembro (ver próxima sección) — no se cobra nada en este cambio.
- `diferencia === 0`: no se cobra ni acredita nada.

Ejemplo (Mensual $30 → Semanal $8, con 20 días restantes, Modo B):
`valorNoConsumido = $20`; `diferencia = 8 - 20 = -$12` → se acreditan $12
de saldo a favor, y el vencimiento pasa a `ahora + 7 días` (un ciclo
semanal completo).

## Saldo a favor persistente

No existe hoy ningún concepto de crédito en el dominio. Se agrega:

### `Miembro` — nuevo campo

```prisma
saldoAFavorUSD Decimal @db.Decimal(10, 2) @default(0)
```

### Consumo automático en `RegistrarPago`

Antes de exigir que `montoTotal` cubra el precio del plan, si
`miembro.saldoAFavorUSD > 0`, se descuenta del monto que el pago necesita
cubrir (nunca por debajo de 0) y se reduce el saldo en lo efectivamente
consumido. Esto aplica a cualquier pago normal futuro del miembro, sea cual
sea el plan — el crédito no está atado al plan que lo generó. Se refleja
en la UI de registro de pago (Paso 2/3 del wizard, y el formulario de pago
en la ficha del miembro) como una línea informativa: "Saldo a favor: $X —
se descuenta automáticamente de este pago".

El saldo se **genera** únicamente desde `cambiarPlanConPago` en Modo B con
`diferencia < 0`. No hay otro flujo que lo modifique en esta spec.

## Elimina `FrecuenciaDistintaError`

Deja de tener sentido: el prorrateo ya maneja cualquier combinación de
frecuencias. Se elimina la excepción y su chequeo en
`cambiarPlanConPago`. El selector de plan nuevo (`FormularioCambiarPlan`,
tanto en la ficha del miembro como en Caja) deja de filtrar por
`frecuencia === frecuenciaActual` — muestra todos los planes activos menos
el actual.

## `cambiarPlanConPago` — nueva firma

```ts
export interface DatosCambiarPlanConPago {
  organizacionId: string;
  miembroId: string;
  planNuevoId: string;
  modo: "AJUSTAR_VENCIMIENTO" | "CICLO_COMPLETO"; // Modo A / Modo B
  metodo: string | null;       // solo se usa si modo=CICLO_COMPLETO y diferencia > 0
  metodoPagoId: string | null;
  numeroOperacion: string | null;
  tasaCambio: number | null;
  sucursalId: string;
  registradoPorId: string;
  rolUsuario: RolUsuario;
  entrenadorId: string | null;
}

export interface ResultadoCambioPlan {
  pago: Pago | null;
  diferencia: number;       // positiva = se cobró; negativa = se acreditó; 0 = ninguna de las dos
  nuevoVencimiento: Date;
  saldoAFavorGenerado: number; // 0 salvo Modo B con diferencia < 0
}
```

Lógica interna:

1. Validaciones existentes sin cambios (miembro, sucursal, plan nuevo
   activo, entrenador si el plan nuevo lo requiere, ciclo vigente).
2. Ya NO se valida `planViejo.frecuencia !== planNuevo.frecuencia`.
3. Calcular `diasRestantes`, `valorNoConsumido` con la fórmula de arriba,
   usando `activa.fin` como vencimiento actual y `planViejo.precioUSD` (o
   `miembro.precioPlan` si `planViejo` no se encuentra, igual que hoy).
4. Según `input.modo`:
   - `AJUSTAR_VENCIMIENTO`: calcular `nuevoVencimiento` (Modo A), sin pago
     ni crédito.
   - `CICLO_COMPLETO`: calcular `nuevoVencimiento` y `diferencia` (Modo B).
     Si `diferencia > 0`, exigir `metodo`/`metodoPagoId`
     (`MetodoPagoRequeridoError`, sin cambios) y crear el `Pago` por ese
     monto. Si `diferencia < 0`, sumar `|diferencia|` a
     `miembro.saldoAFavorUSD` (sin crear ningún `Pago`).
5. `deps.suscripciones.extenderFin(activa.id, nuevoVencimiento)` (nuevo:
   antes no se tocaba `fin`, ahora siempre se actualiza, en ambos modos).
6. `deps.miembros.actualizar(...)` con `planId`, `precioPlan`,
   `entrenadorId` si aplica, y `fechaVencimiento` (vía
   `actualizarFechasPago`, ya existente) — igual que un pago normal.

## UI — `FormularioCambiarPlan`

- El `<select>` de plan nuevo deja de filtrar por frecuencia — se listan
  todos los planes activos salvo el actual, mostrando su frecuencia junto
  al nombre para que el cajero entienda que puede cruzar frecuencias
  (ej. "Mensual — $30.00 (mensual)").
- Al elegir un plan nuevo, se muestran en vivo AMBOS resultados calculados
  client-side (réplica intencional de la fórmula, mismo patrón que
  `proyeccionAbono.ts`/`proyeccionRenovacion.ts`):
  - Modo A: "Solo ajustar vencimiento — nuevo vencimiento: [fecha], sin
    costo adicional."
  - Modo B: "Pagar ciclo completo del nuevo — vencimiento: [fecha],
    [cobra $X / acredita $X como saldo a favor / sin costo adicional]."
- Dos botones de confirmación al final, uno por modo: "Solo ajustar
  vencimiento" y "Pagar ciclo completo del nuevo — cobrar $X" (el label
  del segundo botón cambia dinámicamente: "cobrar $X" / "acreditar $X a
  favor" / sin sufijo si la diferencia da $0).
- El selector de método de pago solo aparece si se va a confirmar en Modo
  B Y la diferencia calculada en ese modo es positiva — igual criterio
  visual que hoy (`requierePago`), pero evaluado solo para el modo B.
- El bloque de entrenador (si el plan nuevo lo requiere) se muestra
  siempre que haya un plan nuevo elegido, sin importar el modo — un
  cambio de entrenador no depende de si se cobra o no.

## Archivos a tocar

- `packages/db/prisma/schema.prisma` — campo `Miembro.saldoAFavorUSD` +
  migración.
- `packages/domain/entities/Miembro.ts` — campo nuevo en la interfaz.
- `packages/domain/use-cases/CambiarPlanConPago.ts` — nueva fórmula, nueva
  firma (`modo`, `nuevoVencimiento`, `saldoAFavorGenerado`), elimina
  `FrecuenciaDistintaError`.
- `packages/domain/use-cases/RegistrarPago.ts` — consumo automático de
  `saldoAFavorUSD` antes de validar el monto.
- `packages/infrastructure/persistence/prisma/PrismaMemberRepository.ts` —
  leer/actualizar `saldoAFavorUSD`.
- `apps/web-admin/app/(panel)/pagos/actions.ts` — `cambiarPlanAction` pasa
  `modo` desde el formData; `registrarPagoAction` no cambia su firma (el
  descuento de saldo ocurre dentro del use-case).
- `apps/web-admin/app/(panel)/miembros/FormularioCambiarPlan.tsx` — quita
  el filtro de frecuencia, agrega la réplica cliente de la fórmula
  (nuevo archivo `calcularProrrateoPlan.ts`, mismo patrón que
  `proyeccionAbono.ts`), dos botones de confirmación.
- `apps/web-admin/app/(panel)/caja/ModalRegistrarPagoCaja.tsx` — sin
  cambios estructurales (ya usa `FormularioCambiarPlan` con
  `origen="caja"`, heredará el nuevo comportamiento automáticamente);
  agregar la línea informativa de saldo a favor en el Paso 3 si
  `miembro.saldoAFavorUSD > 0`.
- Formulario de pago normal (`apps/web-admin/app/(panel)/pagos/FormularioPago.tsx`
  o equivalente) — misma línea informativa de saldo a favor.

## Casos de uso cubiertos

1. Subir de plan (Semanal → Mensual), Modo A: vencimiento se extiende
   proporcionalmente, sin cobro.
2. Subir de plan, Modo B: cobra la diferencia entre el precio del nuevo
   ciclo completo y el valor no consumido.
3. Bajar de plan (Mensual → Semanal), Modo A: vencimiento se extiende más
   allá de un ciclo normal del plan nuevo (sin tope), sin cobro.
4. Bajar de plan, Modo B: acredita el excedente como saldo a favor, deja
   un ciclo completo del plan nuevo.
5. Cambio entre planes de igual precio-por-día (cualquier frecuencia):
   Modo A no mueve nada más que la fecha exacta; Modo B da diferencia $0.
6. Saldo a favor generado en un cambio se consume automáticamente en el
   próximo pago del miembro, sea cual sea el plan de ese pago.
7. Sin ciclo vigente: sigue rechazado con `SinCicloVigenteError`, sin
   prorrateo — se usa el selector simple sin cobro ya existente.
8. Plan nuevo con entrenador requerido: se exige el entrenador en ambos
   modos, igual que hoy.

## Verificación

Sin test runner en este repo — verificación vía `tsc --noEmit` como
compile gate, y trazas manuales de `calcularProrrateoPlan` (dominio y su
réplica cliente) cubriendo los 8 casos de arriba con números concretos.
Prueba manual end-to-end (a cargo del usuario, sin acceso a
navegador/DB desde el entorno de implementación): cambiar un miembro real
de Semanal a Mensual en Modo A y verificar el nuevo vencimiento calculado;
repetir en Modo B y verificar el cobro; bajar de plan en Modo B y verificar
que `saldoAFavorUSD` se acredita y se descuenta solo en el siguiente pago.
