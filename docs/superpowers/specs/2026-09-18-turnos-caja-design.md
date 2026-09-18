# Rediseño del módulo de Caja: Turnos, Arqueo y Egresos — Spec Técnica

## Contexto y objetivo

El módulo `/caja` actual (`docs/superpowers/plans/2026-09-15-cierre-caja-y-reportes-miembros.md`) implementa un "cierre de caja" global por organización y por día: suma todos los pagos del día sin importar quién cobró, en qué sucursal, ni si hubo salidas de efectivo. No hay concepto de turno, cajero, fondo de caja, ni arqueo físico.

El flujo real del negocio: dos cajeros se turnan por sucursal. Cada uno abre su turno declarando el fondo de caja con el que arranca, cobra durante el turno, puede registrar egresos (salidas de efectivo), y al cerrar cuenta físicamente el efectivo — y concilia también los métodos electrónicos — contra lo que el sistema esperaba. Cualquier diferencia (faltante/sobrante) debe quedar justificada con una nota. El objetivo es una traza financiera impecable, con control de ingresos y egresos.

Los `CierreCaja` existentes en producción son datos de prueba y se descartan sin necesidad de migración de compatibilidad.

## Decisiones de producto (confirmadas con el usuario)

1. Turno: apertura/cierre explícito por el cajero. Un solo cajero activo por sucursal a la vez.
2. Fondo inicial: se declara en USD y Bs por separado al abrir turno.
3. Egresos: los registra el propio cajero durante su turno.
4. Arqueo al cierre: conciliación en todos los métodos de pago, no solo efectivo.
5. Diferencias: exigen nota obligatoria antes de poder cerrar el turno; el cierre no requiere aprobación de un rol superior.
6. Pagos fuera de turno: permitidos, quedan marcados como "ajuste fuera de turno" (no se bloquean).
7. Anulación de pagos: un pago nunca se borra. Solo DUEÑO/GERENTE puede anularlo, con motivo obligatorio.
8. Datos actuales de `CierreCaja`/`Pago` de prueba: se eliminan; no hay migración de compatibilidad.

## 1. Modelo de datos (Prisma)

```prisma
enum EstadoTurno {
  ABIERTO
  CERRADO
}

model Turno {
  id             String       @id @default(cuid())
  organizacionId String
  organizacion   Organizacion @relation(fields: [organizacionId], references: [id])
  sucursalId     String
  sucursal       Sucursal     @relation(fields: [sucursalId], references: [id])
  usuarioId      String
  usuario        UsuarioAdmin @relation(fields: [usuarioId], references: [id])

  fondoInicialUSD Decimal @db.Decimal(10, 2)
  fondoInicialBs  Decimal @db.Decimal(14, 2)

  abiertoEn DateTime    @default(now())
  cerradoEn DateTime?
  estado    EstadoTurno @default(ABIERTO)

  pagos   Pago[]
  egresos Egreso[]
  arqueo  ArqueoLinea[]

  // A lo sumo un turno ABIERTO por sucursal — aplicado en el caso de uso
  // AbrirTurno, no como constraint de base de datos (Prisma no soporta un
  // unique índice condicionado al valor de un campo).
  @@index([sucursalId, estado])
}

enum MonedaEgreso {
  USD
  BS
}

model Egreso {
  id           String       @id @default(cuid())
  turnoId      String
  turno        Turno        @relation(fields: [turnoId], references: [id])
  monto        Decimal      @db.Decimal(14, 2)
  moneda       MonedaEgreso
  metodo       String // "efectivo_usd" | "efectivo_bs" (egresos solo salen de efectivo físico)
  motivo       String
  registradoEn DateTime     @default(now())
}

model ArqueoLinea {
  id            String  @id @default(cuid())
  turnoId       String
  turno         Turno   @relation(fields: [turnoId], references: [id])
  metodo        String
  montoEsperado Decimal @db.Decimal(14, 2)
  montoContado  Decimal @db.Decimal(14, 2)
  diferencia    Decimal @db.Decimal(14, 2) // montoContado - montoEsperado
  nota          String? // obligatoria (validado en el caso de uso) si diferencia != 0

  @@unique([turnoId, metodo])
}
```

Modificaciones a `Pago`:

```prisma
model Pago {
  id              String   @id @default(cuid())
  miembroId       String
  miembro         Miembro  @relation(fields: [miembroId], references: [id])
  sucursalId      String
  sucursal        Sucursal @relation(fields: [sucursalId], references: [id])
  turnoId         String?  // null = fuera de turno (ajuste)
  turno           Turno?   @relation(fields: [turnoId], references: [id])
  registradoPorId String
  registradoPor   UsuarioAdmin @relation(fields: [registradoPorId], references: [id])

  monto           Decimal  @db.Decimal(10, 2)
  metodo          String
  numeroOperacion String?
  tasaCambio      Decimal? @db.Decimal(10, 2)
  fechaPago       DateTime @default(now())

  anuladoEn       DateTime?
  anuladoPorId    String?
  anuladoPor      UsuarioAdmin? @relation("PagosAnulados", fields: [anuladoPorId], references: [id])
  motivoAnulacion String?
}
```

`CierreCaja` se elimina del schema (migración con `DROP TABLE`; los datos existentes son de prueba).

Notas:
- `Decimal(14,2)` en montos de Bs porque los valores en bolívares son órdenes de magnitud mayores que en USD (tasa 850+); ya es la escala usada en `TasaCambio.valor`.
- `sucursalId` en `Pago` se deriva server-side: del turno activo cuando existe, o de `usuario.sucursalId` si el pago queda fuera de turno.
- `ArqueoLinea` tiene una fila por cada método con movimiento en el turno, incluyendo `montoEsperado = 0` si no hubo cobros por ese medio, para visibilidad completa del arqueo.

## 2. Casos de uso de dominio

**`AbrirTurno`**
```ts
interface DatosAbrirTurno {
  organizacionId: string;
  sucursalId: string;
  usuarioId: string;
  rolUsuario: RolUsuario; // ENTRENADOR no puede abrir turno
  fondoInicialUSD: number;
  fondoInicialBs: number;
}
```
- `rolUsuario === "ENTRENADOR"` → `RolNoAutorizadoError`.
- Ya existe `Turno` `ABIERTO` en esa `sucursalId` → `TurnoYaAbiertoError`.

**`RegistrarPago`** (modificado): agrega `sucursalId`, `registradoPorId`, `rolUsuario` al input. `rolUsuario === "ENTRENADOR"` → `RolNoAutorizadoError`. Busca turno `ABIERTO` de `sucursalId` vía `turnos.buscarAbiertoPorSucursal`; si existe, el pago se crea con ese `turnoId`; si no, `turnoId = null` (ajuste fuera de turno, no se bloquea).

**`RegistrarEgreso`**
```ts
interface DatosRegistrarEgreso {
  turnoId: string;
  monto: number;
  moneda: "USD" | "BS";
  metodo: string;
  motivo: string;
  rolUsuario: RolUsuario; // ENTRENADOR no puede
}
```
- Turno debe existir y estar `ABIERTO` → si no, `TurnoCerradoError`.
- `motivo` vacío → `MotivoRequeridoError`.

**`ObtenerResumenTurno`**: input `turnoId`. Retorna el turno, sus pagos agrupados por método, sus egresos, y el `montoEsperado` calculado por método:
- Efectivo: `fondoInicial + Σpagos(metodo) - Σegresos(metodo)`.
- Electrónicos: `Σpagos(metodo) - Σegresos(metodo)` (egresos en método electrónico son un caso raro pero no se descarta).

**`CerrarTurno`**
```ts
interface LineaArqueoInput {
  metodo: string;
  montoContado: number;
  nota?: string;
}
interface DatosCerrarTurno {
  turnoId: string;
  lineas: LineaArqueoInput[];
  rolUsuario: RolUsuario; // ENTRENADOR no puede
}
```
- Turno debe existir y estar `ABIERTO` → si no, `TurnoYaCerradoError`.
- Recalcula `montoEsperado` por método (nunca confía en un valor del cliente).
- `diferencia = montoContado - montoEsperado`; si `diferencia !== 0` y no hay `nota` → `NotaRequeridaError`.
- En una transacción: crea las `ArqueoLinea`, marca `estado = CERRADO`, `cerradoEn = now()`.

**`AnularPago`**
```ts
interface DatosAnularPago {
  pagoId: string;
  organizacionId: string;
  anuladoPorId: string;
  rolAnulador: RolUsuario; // solo DUENO | GERENTE
  motivo: string;
}
```
- `rolAnulador` fuera de `[DUENO, GERENTE]` → `RolNoAutorizadoError`.
- Pago no existe → `PagoNoEncontradoError`. Ya anulado → `PagoYaAnuladoError`. `motivo` vacío → `MotivoRequeridoError`.
- No borra la fila; setea `anuladoEn/anuladoPorId/motivoAnulacion`.
- Fuera de alcance: revertir la extensión de suscripción que el pago haya generado — es una decisión de negocio aparte no pedida en este rediseño; la anulación es solo a efectos de caja/reportes.

**`ObtenerReporteCaja`** (reemplaza el actual): lista turnos por sucursal/rango de fechas con estado, esperado vs. contado, diferencias, y permite drill-down a pagos+egresos de cada turno. Pagos con `turnoId = null` se agrupan aparte como "Ajustes fuera de turno".

## 3. Server Actions y pantallas

**`app/(panel)/caja/actions.ts` (reescrito):**
- `abrirTurnoAction(formData)`: `fondoInicialUSD`, `fondoInicialBs`, y `sucursalId` (de `usuario.sucursalId`, o de un `<select>` si es `null`, caso DUEÑO multi-sede). Atrapa `TurnoYaAbiertoError`/`RolNoAutorizadoError`.
- `registrarEgresoAction(formData)`: `turnoId`, `monto`, `moneda`, `metodo`, `motivo`. Atrapa `TurnoCerradoError`/`MotivoRequeridoError`.
- `cerrarTurnoAction(formData)`: un `montoContado_<metodo>` y `nota_<metodo>` por cada método con movimiento (nombres de campo dinámicos parseados en la action). Atrapa `NotaRequeridaError`, retorna al formulario señalando el método sin justificar.
- `anularPagoAction(formData)`: `pagoId`, `motivo`. Valida `usuario.rol` antes de invocar el caso de uso (defensa en profundidad).

**`app/(panel)/pagos/actions.ts` → `registrarPagoAction`** (modificado): agrega `sucursalId` (de `usuario.sucursalId` o de selector si null) y `registradoPorId: usuario.id` al invocar `registrarPago`.

**Pantallas `/caja`:**
1. Sin turno abierto en la sucursal del usuario → pantalla "Abrir turno" (fondo inicial USD/Bs) + reporte histórico de turnos cerrados con filtro por fecha/rango (igual UX que hoy).
2. Con turno abierto → "Turno activo": fondo inicial, pagos del turno en vivo, egresos con formulario de alta, resumen de esperado por método en tiempo real, botón "Cerrar turno".
3. Arqueo de cierre: una fila por método con movimiento — `montoEsperado` de solo lectura, input `montoContado`; si difieren, aparece el campo de nota, requerido server-side también.
4. Reporte histórico: tabla de pagos por rango, ahora agrupada por turno (cajero + sucursal); pagos `turnoId = null` en sección aparte "Ajustes fuera de turno".

Limpieza de paso: los helpers de fecha duplicados (`inicioDelDia`, `finDelDia`, etc., hoy repetidos entre `page.tsx` y los casos de uso) se extraen a `apps/web-admin/app/(panel)/fechas.ts` compartido.

## 4. Permisos y manejo de errores

| Acción | DUEÑO | GERENTE | RECEPCION | ENTRENADOR |
|---|---|---|---|---|
| Abrir/cerrar turno | ✓ | ✓ | ✓ | ✗ |
| Registrar egreso | ✓ | ✓ | ✓ | ✗ |
| Registrar pago | ✓ | ✓ | ✓ | ✗ |
| Anular pago | ✓ | ✓ | ✗ | ✗ |
| Ver reporte histórico | ✓ (toda la org) | ✓ (sus sucursales) | ✓ (su sucursal) | ✗ |

Se aplica en dos capas: Server Action (mensaje de UX temprano) y caso de uso (fuente de verdad, recibe `rolUsuario`/`rolAnulador` como parte del input).

Errores de dominio nuevos: `TurnoYaAbiertoError`, `TurnoNoEncontradoError`, `TurnoCerradoError`, `TurnoYaCerradoError`, `MotivoRequeridoError`, `NotaRequeridaError`, `RolNoAutorizadoError`, `PagoNoEncontradoError`, `PagoYaAnuladoError`, `SucursalRequeridaError`.

Casos límite:
- Doble submit al abrir turno → segunda llamada choca con `TurnoYaAbiertoError`, se atrapa sin crash (mismo patrón que `DiaYaCerradoError` hoy).
- Doble submit al cerrar turno → `TurnoYaCerradoError`, no-op silencioso.
- Egreso contra un turno recién cerrado en otra pestaña → `TurnoCerradoError`, mensaje claro, formulario no se pierde (`useActionState`).
- Pago registrado justo cuando el turno se cierra: `CerrarTurno` lee pagos y marca `CERRADO` dentro de una transacción Prisma; un pago que llega antes del commit se incluye, uno que llega después queda fuera de turno (comportamiento ya aceptado, punto 6 de las decisiones de producto).

## Alcance explícitamente fuera de esta spec

- Cierre de caja por sucursal a nivel de reporte consolidado multi-sucursal (el turno ya es por sucursal; un dashboard que sume varias sucursales en un solo cierre no se pide aquí).
- Reversión automática de suscripción al anular un pago.
- Aprobación de egresos por un rol superior antes de aplicarse.
- Concurrencia de más de un turno abierto por sucursal (explícitamente descartado por decisión de producto).
- Migración de los `CierreCaja` actuales (se eliminan, son datos de prueba).
