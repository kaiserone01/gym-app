# Motor de reglas de abono + selector de modalidad en Paso 2 — Diseño

## Contexto

El wizard de Caja ya soporta 3 modalidades de pago (total, abono, combinado),
implementadas en la sesión de "Pagos combinados en Caja" (2026-09-26). Pero:

- La modalidad se elige en el Paso 3, mezclada con la captura del método de
  pago — el usuario pidió moverla al Paso 2 ("Estado de la membresía"), como
  parte de la decisión sobre cómo se va a pagar antes de llegar al detalle.
- En modalidad "Total" el monto sigue siendo editable, cuando debería ser
  fijo (el precio del plan, sin posibilidad de cambiarlo).
- El abono parcial no tiene ninguna regla de negocio sobre CUÁNTO se puede
  abonar como mínimo, ni sobre CUÁNTO TIEMPO de acceso da ese abono antes de
  requerir completar el pago — hoy dijiste explícitamente que el acceso es
  ilimitado desde el primer abono, y ahora se pide reemplazar esa regla por
  un plazo calculado, configurable.
- No existe ninguna forma de restringir el abono parcial para planes
  específicos (ej. el plan Diario no debería permitirlo).
- El pago combinado ya tiene su lista de líneas dinámica, pero falta el
  panel flotante que muestra el remanente en vivo mientras se distribuye el
  monto entre métodos.

El objetivo es: mover el selector de modalidad al Paso 2, bloquear el monto
en "Total", agregar un motor de reglas de abono configurable (mínimo de
abono y plazo de acceso, por frecuencia y por plan, con el plan ganando
sobre la frecuencia cuando ambos están configurados), propagar ese plazo
hasta el control de acceso del kiosco, y agregar el panel flotante de
remanente en la modalidad combinado.

## Modelo de datos

### `Plan` — nuevos campos

```prisma
permitePagoParcial Boolean  @default(true)
minimoAbonoTipo    String?  // "DIAS" | "PORCENTAJE" — null = hereda de la frecuencia
minimoAbonoValor   Decimal? @db.Decimal(10, 2) // días si tipo=DIAS, 0-100 si tipo=PORCENTAJE
```

Cuando `permitePagoParcial = false`, la modalidad "Abono" no se ofrece para
ese plan en el wizard, y el servidor rechaza cualquier intento de registrar
un abono contra él (`AbonoNoPermitidoError`). El pago combinado NUNCA se
restringe por plan — es universal, según lo confirmado.

### Nueva tabla `ReglaAbonoPorFrecuencia`

Una fila por frecuencia y organización (patrón similar a `TemaOrganizacion`,
pero con `@@unique` en vez de clave primaria compuesta con la organización,
porque hay 4 filas por organización, no 1):

```prisma
model ReglaAbonoPorFrecuencia {
  id               String         @id @default(cuid())
  organizacionId   String
  organizacion     Organizacion   @relation(fields: [organizacionId], references: [id])
  frecuencia       FrecuenciaPago
  activo           Boolean        @default(false)
  minimoAbonoTipo  String         // "DIAS" | "PORCENTAJE"
  minimoAbonoValor Decimal        @db.Decimal(10, 2)

  @@unique([organizacionId, frecuencia])
}
```

`activo = false` significa "esta frecuencia no tiene plazo de abono
configurado" — un plan de esa frecuencia sin su propio mínimo definido se
comporta como hoy (abono sin plazo, sin mínimo más allá de $0.01).

### `Suscripcion` — nuevo campo

```prisma
fechaLimiteAbono DateTime?
```

`null` = sin plazo activo (ciclo saldado al 100%, pago total, o ninguna
regla de abono aplica). Vive en `Suscripcion` porque representa 1:1 el
ciclo abierto — evita recorrer todos los `Pago` del ciclo para saber si hay
un plazo vigente, y es el lugar natural donde ya vive `fin` (el vencimiento
del ciclo completo).

## Motor de reglas (dominio, funciones puras)

Nuevo archivo `packages/domain/entities/ReglaAbono.ts`:

```ts
export type TipoMinimoAbono = "DIAS" | "PORCENTAJE";

export interface ReglaAbonoEfectiva {
  tipo: TipoMinimoAbono;
  valor: number;
  origen: "plan" | "frecuencia";
}

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

export function diasAPorcentaje(dias: number, diasDelCiclo: number): number {
  return (dias / diasDelCiclo) * 100;
}

export function porcentajeADias(porcentaje: number, diasDelCiclo: number): number {
  return Math.round((porcentaje / 100) * diasDelCiclo);
}

export function calcularMontoMinimoAbono(
  regla: ReglaAbonoEfectiva | null,
  precioPlan: number,
  diasDelCiclo: number
): number {
  if (!regla) return 0.01;
  const dias = regla.tipo === "DIAS" ? regla.valor : porcentajeADias(regla.valor, diasDelCiclo);
  return (precioPlan / diasDelCiclo) * Math.max(dias, 1);
}

export function calcularFechaLimiteAbono(
  regla: ReglaAbonoEfectiva | null,
  montoAcumulado: number,
  precioPlan: number,
  fechaInicioCiclo: Date,
  diasDelCiclo: number
): Date | null {
  if (!regla || montoAcumulado >= precioPlan) return null;
  const precioPorDia = precioPlan / diasDelCiclo;
  const diasCubiertos = Math.floor(montoAcumulado / precioPorDia);
  const limite = new Date(fechaInicioCiclo);
  limite.setDate(limite.getDate() + diasCubiertos);
  return limite;
}
```

**Resolución de conflictos:** el plan gana siempre que tenga su propio
mínimo configurado (`minimoAbonoTipo`/`minimoAbonoValor` no nulos). Si el
plan no define nada, hereda de la regla de su frecuencia (si está activa).
Si ninguno de los dos aplica, el abono se comporta como hoy: sin mínimo
más allá de $0.01, sin plazo (`fechaLimiteAbono` siempre `null`).

**Casos límite cubiertos:**
- Monto que redondearía a 0 días: no puede ocurrir en la práctica, porque
  `calcularMontoMinimoAbono` exige al menos el monto de 1 día antes de
  aceptar el abono — se rechaza antes de llegar a calcular días.
- Abono que alcanza o supera el 100% del plan: `calcularFechaLimiteAbono`
  devuelve `null` de inmediato (el pago se trata como si completara el
  ciclo, sin plazo).
- Abonos sucesivos: cada abono nuevo se calcula sobre el monto acumulado
  TOTAL del ciclo (no solo el nuevo abono), así que el plazo siempre se
  recalcula sobre el estado real, nunca se acumula incorrectamente.

## `RegistrarPago.ts` — integración

Cuando el pago resultante es un abono (monto acumulado del ciclo < precio
del plan, ya sea porque abre un ciclo nuevo con monto parcial o completa
uno abierto):

1. Si `plan.permitePagoParcial === false` → `AbonoNoPermitidoError`.
2. Resolver la regla efectiva (`resolverReglaAbono`) usando el plan y la
   `ReglaAbonoPorFrecuencia` de su frecuencia.
3. Calcular el monto mínimo (`calcularMontoMinimoAbono`); si el monto
   acumulado del ciclo (tras este pago) es menor a ese mínimo →
   `AbonoMenorAlMinimoError` (el mensaje incluye el monto mínimo exacto en
   USD).
4. Si pasa la validación: calcular `fechaLimiteAbono`
   (`calcularFechaLimiteAbono`) sobre el monto acumulado total y
   persistirlo en la `Suscripcion` del ciclo (crear o actualizar según
   corresponda).

Reutiliza `pagosVigentesDelCiclo`/`totalPagado` (ya existentes en
`packages/domain/entities/Pago.ts`) para obtener el monto acumulado.

## Kiosco — nuevo estado `abono_vencido`

`EstadoCheckIn` (en `packages/domain/entities/CheckIn.ts`) gana un cuarto
valor: `"activo" | "en_gracia" | "vencido" | "abono_vencido" |
"sucursal_incorrecta"`. Como `CheckIn.estadoAlMomento` es un `String` libre
en el schema (no un enum de Postgres), esto no requiere migración de base
de datos — solo actualizar el tipo TypeScript y los consumidores.

`ValidarAccesoSucursalPorPlan.ts` recibe un nuevo parámetro
`fechaLimiteAbono: Date | null` de la suscripción activa del miembro, y
evalúa el bloqueo por plazo de abono ANTES de devolver `"activo"`: si hay
una suscripción vigente pero `fechaLimiteAbono !== null && ahora >
fechaLimiteAbono`, devuelve `"abono_vencido"` en vez de `"activo"`.

`AccessCard.tsx` (kiosco): nueva entrada en `ETIQUETA_ESTADO`
("Plazo de abono vencido"), mismo color rojo que `"vencido"` (mismo peso
visual — bloqueo total, según lo confirmado), mensaje de detalle:
*"Completa tu pago para reactivar el acceso — acércate a recepción."*
(sin voseo, ver memoria de preferencias del proyecto).

Al llegar un pago que completa el 100% del ciclo, `fechaLimiteAbono` se
limpia (`null`) inmediatamente — el siguiente check-in vuelve a `"activo"`
sin esperar a un nuevo ciclo, consistente con lo confirmado.

## Panel de configuración — nueva pestaña

`/configuraciones/reglas-abono`, agregada a `TABS_CONFIGURACIONES`
(`apps/web-admin/app/(panel)/configuraciones/tabs.ts`). Una tabla con las 4
frecuencias (Diario/Semanal/Quincenal/Mensual), cada fila con:
- Toggle "Activo".
- Un input numérico + selector de unidad (Días | Porcentaje) — al escribir
  en un modo, el otro se recalcula en vivo y se muestra como referencia
  (ej. "10 días (≈33%)"), usando `diasAPorcentaje`/`porcentajeADias` del
  lado del cliente. Solo se guarda el valor y tipo elegidos como "modo de
  entrada" — el otro es solo referencia visual, no se persiste por separado.

En `FormularioPlan.tsx`: checkbox "Permite pago parcial" (mismo patrón que
`multisede`); si está marcado, un bloque opcional "Mínimo de abono
personalizado para este plan" con el mismo control días↔porcentaje. Si se
deja vacío, una nota muestra el valor heredado de la frecuencia en vivo
("Usa el mínimo de la frecuencia [Mensual]: 10 días (33%)"), o "Sin mínimo
configurado" si la frecuencia tampoco tiene regla activa.

## Wizard — Paso 2 y Paso 3

**Paso 2** (`ContenidoPaso2` en `ModalRegistrarPagoCaja.tsx`) gana el
selector de modalidad (Total / Abono / Combinado), con "Abono" deshabilitado
y una nota explicativa si `planEfectivo.permitePagoParcial === false`. La
elección se pasa como estado nuevo al padre (`ModalRegistrarPagoCaja`) y de
ahí al Paso 3.

**Paso 3** (`ContenidoPaso3`) ya no vuelve a preguntar la modalidad — la
recibe como prop:
- **Total**: el monto se muestra fijo (no editable, sin `CurrencyInput`),
  igual al precio del plan; un solo `SelectorMetodoPago`.
- **Abono**: `CurrencyInput` para "Monto a abonar", con validación en vivo
  del mínimo (mostrando el mensaje del servidor si se envía por debajo) y
  una proyección en vivo de "Esto cubre hasta el [fecha]" usando
  `calcularFechaLimiteAbono` en el cliente (mismo patrón de réplica
  intencional que `proyeccionRenovacion.ts`).
- **Combinado**: sin cambios en la lista de líneas dinámica ya existente,
  más el nuevo panel flotante de remanente (ver abajo).

## Panel flotante de remanente (modalidad Combinado)

Nuevo componente `apps/web-admin/app/(panel)/caja/PanelRemanentePago.tsx`,
fijo en una esquina de la pantalla (`fixed bottom-6 right-6`) mientras la
modalidad combinado esté activa en el Paso 3. Muestra:
- Cada línea ya ingresada: método + monto (USD).
- "Faltan $X — Bs. Y" (remanente = monto objetivo − suma de líneas
  válidas), convertido a Bs con la tasa de la línea más reciente que tenga
  tasa, o la tasa vigente general si ninguna línea la tiene aún.

Reutiliza el estado `lineasCombinadas` que ya existe en
`ModalRegistrarPagoCaja.tsx` — no requiere estado nuevo, solo un componente
de presentación que lo consume.

## Verificación

- Sin test runner en este repo (confirmado, convención documentada) —
  verificación vía `tsc --noEmit`/`next build` como compile gate, y trazas
  manuales de las funciones puras del motor de reglas (casos: sin regla,
  regla de frecuencia sola, regla de plan que sobreescribe la de
  frecuencia, abono por debajo del mínimo, abono que completa el ciclo,
  abonos sucesivos).
- Prueba manual end-to-end pendiente (igual que la sesión anterior de pagos
  combinados): configurar una regla de abono para MENSUAL, crear un plan
  con abono parcial permitido, registrar un abono por debajo del mínimo
  (debe rechazarse), un abono válido (debe fijar `fechaLimiteAbono`),
  simular el paso del tiempo y confirmar que el kiosco bloquea con
  "Plazo de abono vencido", completar el pago y confirmar reactivación
  inmediata.
