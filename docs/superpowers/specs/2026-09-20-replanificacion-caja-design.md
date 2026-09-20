# Replanificación de Caja — Diseño

## Contexto

Hoy `/caja` mezcla dos flujos muy distintos en una sola ruta:

1. **Sin turno abierto**: un formulario para abrir turno, seguido de un reporte histórico con selector de fecha + período (Día/Semana/Mes) que agrupa turnos pasados con sus pagos, egresos y arqueo.
2. **Con turno abierto**: la operación del turno en curso — resumen por método, registrar pagos, registrar egresos, y el arqueo de cierre.

Esto tiene varios problemas identificados por el dueño del producto:

- El "Período" de la vista histórica (Día/Semana/Mes) no es lo que un operador de caja entiende por período — para él el período es el turno mismo, delimitado por el reloj real del día en que trabaja.
- Abrir un turno permite imprimir, cuando no hay nada que imprimir ahí (el reporte imprimible es el histórico, no el formulario de apertura).
- Un SOCIO sin sede fija (`usuario.sucursalId === null`) no puede elegir sucursal al abrir turno porque el código nunca le pasa la lista real de sucursales al formulario — bug.
- No hay ningún indicador visible de la fecha/hora actual ni de la tasa BCV vigente durante la operación de caja.
- El cálculo de "hoy"/"ahora" en el sistema depende de la zona horaria del proceso Node, no está fijado a Venezuela (UTC-4) en ningún lado.
- El ítem "Caja" en el menú lateral no está inmediatamente debajo de "Miembros".

## Alcance

Este documento cubre:

1. Reordenar "Caja" en el menú (debajo de "Miembros").
2. Reloj + tasa BCV visibles en todo el panel administrativo.
3. `TZ=America/Caracas` fijado globalmente vía variable de entorno.
4. Corregir el bug de selección de sucursal al abrir turno.
5. Simplificar `/caja` (sin turno abierto) a solo el formulario de apertura, sin el reporte histórico ni el botón de imprimir.
6. Migrar el reporte histórico a `/pagos`, renombrada "Histórico de Pagos": reemplaza el listado plano actual, con un selector de rango de fechas en español que deshabilita días/meses/años sin actividad, atajos rápidos (Día/Semana/Mes en curso), y el rango elegido persistido en la URL.

**Fuera de alcance** (explícitamente declinado o diferido):

- Eliminar la sección Pagos como tal — se conserva, solo cambia su contenido y nombre visible.
- Exportar el Histórico de Pagos a Excel/XLS — reemplaza al botón Imprimir que se quita, pero se trata como una tarea separada después de este plan.
- Rediseñar la pantalla de "turno activo" (resumen, egresos, arqueo) — solo se toca lo necesario para que siga funcionando; su formulario de "Registrar pago" ya usa el componente unificado (`FormularioPago` + `SelectorMetodoPago`) desde antes de este plan, no requiere cambios.
- Fijar el timezone en cada punto del código con un helper explícito — se resuelve con una variable de entorno de proceso, no tocando lógica de negocio.

## Menú: reordenar Caja

`(panel)/layout.tsx` — el array de items del `Sidebar` pasa de:

```
Miembros, Pagos, Caja, Estadísticas, [Configuraciones]
```

a:

```
Miembros, Caja, Pagos, Estadísticas, [Configuraciones]
```

Sin cambios en `NavegacionMobile`/`MasSheet` (Caja ya está en la bottom tab bar de mobile, no en "Más").

## Reloj + tasa BCV

Nuevo componente cliente `RelojYTasa` (en `packages/ui/components/`), montado en `(panel)/layout.tsx` junto a la topbar/`BarraUsuario`, visible en todas las pantallas del panel (no solo Caja).

- **Reloj**: `useState` + `setInterval(1000)` actualizando un `Date` en el cliente; formateado con `toLocaleString("es-VE", { dateStyle: "short", timeStyle: "medium" })`. Es hora del navegador del operador, no requiere llamada al servidor — coherente con que la fecha/hora "real" del sistema para abrir/cerrar turno la fija el servidor vía `TZ` (ver abajo), este reloj es solo informativo.
- **Tasa BCV**: `fetch("/api/tasa-cambio")` al montar el componente; si la respuesta es 404 (`SinTasaDisponibleError`), se omite el bloque de tasa sin romper el reloj. No hay requisito de refresco periódico explícito — se trae una vez al montar (la tasa BCV no cambia varias veces por sesión de uso).

## Timezone: `TZ=America/Caracas`

Se agrega `TZ=America/Caracas` a la configuración de entorno de los 3 apps que corren en Node (`apps/web-admin`, `apps/kiosk`, `apps/worker`) — tanto en `.env`/`.env.local` de desarrollo como en la configuración de despliegue (donde corran en producción). Node.js respeta esta variable para toda operación de fecha/hora del proceso (`new Date()`, `.getHours()`, `.toLocaleString()`, cálculos de "hoy") sin necesidad de tocar código. Esto fija de raíz el cálculo de "current day"/"current time" que usan `abrirTurno`/`cerrarTurno` (vía el default `abiertoEn @default(now())` de Prisma, que corre en el proceso Node del backend) y cualquier otro cálculo de fecha del sistema.

**Nota de despliegue**: si el hosting usado no permite fijar variables de entorno de proceso (poco común), sería necesario revisar esta pieza — se asume que sí se puede, es el mecanismo estándar en Node/Vercel/Docker.

## Bug de sucursal al abrir turno

Nuevo helper `obtenerSucursalesVisiblesParaTurno(usuario: UsuarioAdmin): Promise<SucursalResumen[]>` en `apps/web-admin/app/(panel)/caja/`, con la misma lógica que el ya existente `obtenerSucursalesVisiblesParaMiembro` (en `miembros/obtenerSucursalesVisibles.ts`): SOCIO ve todas las sucursales de la organización; Gerente/Recepción ven solo las que tienen asignadas vía `UsuarioSucursal`.

`caja/page.tsx` (rama sin turno abierto) llama a este helper y decide:

- Si el usuario ya tiene `sucursalId` fijo (la mayoría de Gerente/Recepción con una sola sede asignada como default): se usa esa, sin mostrar selector (`requiereSucursal=false`), igual que hoy.
- Si `sucursalId` es `null` (SOCIO, o alguien sin sede default) y la lista visible tiene más de una sucursal: se muestra el selector con esas sucursales reales (`requiereSucursal=true`, `sucursales={lista real}` — hoy se le pasa `[]` siempre, ese es el bug).
- Si la lista visible tiene exactamente una sucursal: se toma esa por defecto sin preguntar, aunque `sucursalId` sea `null` — no se muestra selector.

## `/caja`: simplificación

La rama "sin turno abierto" de `caja/page.tsx` deja de calcular/mostrar `obtenerReporteCaja`, el selector Fecha/Período, y `<BotonImprimir />`. Queda reducida a:

```
PageHeader "Abrir turno"
FormularioAbrirTurno (con sucursales reales, sin botón imprimir — ya no lo tenía este formulario en sí, era el header de la página el que lo mostraba)
```

El `searchParams` de `fecha`/`periodo` deja de usarse en esta ruta. Los helpers `inicioDeSemana`/`finDeSemana`/`inicioDeMes`/`finDeMes` de `fechas.ts` se reutilizan en Histórico de Pagos (ver abajo), no se eliminan.

La rama "con turno abierto" (turno activo) no cambia.

## `/pagos` → "Histórico de Pagos"

- Mismo URL (`/pagos`), cambia el label del menú y el `PageHeader` de "Pagos" a "Histórico de Pagos".
- El contenido reemplaza el listado plano actual por el reporte que hoy vive en `/caja`: reutiliza `obtenerReporteCaja(deps, { organizacionId, desde, hasta })` tal cual existe (turnos del rango con pagos/egresos/arqueo agrupados, más "ajustes fuera de turno"), con las mismas reglas de ocultar bloques vacíos (sin egresos, sin pagos, etc.) que ya tiene el código movido.

### Selector de rango de fechas

Nuevo componente `SelectorRangoFechas` (cliente, en `packages/ui/components/` o junto a la página de Histórico de Pagos), construido sobre `react-day-picker` (nueva dependencia) en modo rango (`mode="range"`), localizado a español vía el locale `es` de `react-day-picker`/`date-fns`.

- **Días deshabilitados**: se le pasa el conjunto de fechas con actividad (ver caso de uso nuevo abajo); cualquier día fuera de ese conjunto se deshabilita (no clickeable, estilo visual atenuado). Por construcción, un mes o año sin ningún día activo queda con todos sus días deshabilitados — no hace falta lógica aparte para "ocultar meses/años", basta con deshabilitar día por día y dejar que el usuario navegue el calendario con normalidad (ve el mes vacío, pero no puede seleccionar nada ahí).
- **Atajos rápidos**: botones "Hoy", "Esta semana", "Este mes" al lado del calendario — cada uno fija `desde`/`hasta` al rango correspondiente (reutilizando `inicioDelDia`/`finDelDia`/`inicioDeSemana`/`finDeSemana`/`inicioDeMes`/`finDeMes` de `fechas.ts`) y actualiza la URL.
- **Persistencia en URL**: el rango elegido se refleja en `?desde=YYYY-MM-DD&hasta=YYYY-MM-DD` vía `router.replace` (no `push`, para no ensuciar el historial de navegación en cada cambio de fecha). Al cargar la página, si hay `desde`/`hasta` en la URL se usan; si no, el rango por defecto es "hoy".

### Días con actividad — nuevo caso de uso

`ITurnoRepository` gana un nuevo método:

```ts
listarFechasConTurno(organizacionId: string): Promise<Date[]>
```

Implementado en `PrismaTurnoRepository` con una consulta que agrupa por día (`SELECT DISTINCT DATE(abiertoEn) ...` vía Prisma raw query o `groupBy` con truncado de fecha), devolviendo un `Date` por cada día distinto en que se abrió al menos un turno en esa organización — sin límite de rango (se calcula sobre todo el historial; el volumen de turnos por gimnasio es bajo — como mucho unos pocos por día — así que esta consulta es liviana incluso a varios años de historia).

Nuevo caso de uso `obtenerDiasConActividad(deps: { turnos: ITurnoRepository }, organizacionId: string): Promise<Date[]>` — wrapper fino sobre el repositorio, siguiendo el patrón ya usado por el resto de los casos de uso de este código base.

`pagos/page.tsx` llama a este caso de uso y le pasa el resultado a `SelectorRangoFechas` como los días habilitados.

## Resumen de archivos afectados

**Nuevos:**
- `apps/web-admin/app/(panel)/caja/obtenerSucursalesVisiblesParaTurno.ts`
- `packages/ui/components/RelojYTasa.tsx`
- `packages/ui/components/SelectorRangoFechas.tsx` (o ubicado junto a `pagos/`, a decidir en el plan)
- `packages/domain/use-cases/ObtenerDiasConActividad.ts`

**Modificados:**
- `apps/web-admin/app/(panel)/layout.tsx` — orden de menú, monta `RelojYTasa`
- `apps/web-admin/app/(panel)/caja/page.tsx` — simplificación de la rama sin turno abierto
- `apps/web-admin/app/(panel)/caja/FormularioAbrirTurno.tsx` — posible ajuste menor de props si cambia la forma de pasar sucursales
- `apps/web-admin/app/(panel)/pagos/page.tsx` — nuevo contenido (reporte por turnos + selector de rango)
- `packages/domain/ports/ITurnoRepository.ts` — nuevo método `listarFechasConTurno`
- `packages/infrastructure/persistence/prisma/PrismaTurnoRepository.ts` — implementación del nuevo método
- `apps/web-admin/.env` / `.env.local` (y equivalentes de `kiosk`/`worker`) — `TZ=America/Caracas`
- `packages/ui/package.json` — nueva dependencia `react-day-picker`

## Riesgos y notas

- `react-day-picker` es una dependencia nueva — se verificará compatibilidad con React 19 al implementar (peer deps del paquete ya declaran soporte `>=16.8.0`, rango abierto).
- El cambio de `TZ` afecta *todo* el sistema (no solo Caja) porque es una variable de proceso — es un cambio deliberado y de bajo riesgo (Node.js respeta esta variable de forma nativa), pero conviene verificar tras desplegar que ningún reporte/cálculo existente asumía silenciosamente otra zona horaria.
