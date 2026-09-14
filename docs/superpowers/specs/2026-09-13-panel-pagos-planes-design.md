# Panel Admin — Pagos y Planes (UI real) — Design Spec

**Fecha:** 2026-09-13
**Estado:** Aprobado por el usuario en sesión de brainstorming, listo para `writing-plans`.

## Contexto

El Plan 9 (panel-admin-miembros) construyó la primera UI real del panel admin (`apps/web-admin`), cubriendo solo `Miembro`. El sidebar del panel ya tiene enlaces a "Pagos" y "Planes" que hoy dan 404 — este spec cierra esa brecha, extendiendo el mismo patrón arquitectónico (Server Components + Server Actions llamando directo a los casos de uso de dominio, sin pasar por `/api/*`) a `Pago` y `Plan`.

Todo el dominio subyacente (`CrearPlan`, `ActualizarPlan`, `RegistrarPago`, `ListarPlanes`) ya existe y está probado desde el Plan 6 — este trabajo es principalmente de UI, más dos piezas de dominio nuevas/extendidas descritas abajo.

## Decisiones de esta sesión

| Decisión | Resultado |
|---|---|
| Cómo se registra un pago | **Ambas entradas** al mismo flujo: botón "Registrar pago" en `/miembros/[id]` (miembro preseleccionado) y formulario propio en `/pagos/nuevo` (elegir miembro desde cero). |
| Sucursales para `Plan.tipoAcceso` SEDE_UNICA/LISTA_CERRADA | Se agrega `ListarSucursales` al dominio ahora (no existía ningún caso de uso para listar sucursales) — sin él la UI no puede ofrecer selección real. |
| Historial de pagos | **Ambos**: listado global en `/pagos` (todos los pagos de la organización, más reciente primero) y sección de historial dentro de `/miembros/[id]` (solo los de ese miembro). |
| Ubicación del historial en la ficha de un miembro | Sección en la misma página, debajo del formulario de edición existente — no pestañas separadas. |
| Edición de `Plan` — `tipoAcceso`/sucursales | Se muestran como **solo lectura** en el formulario de edición (deshabilitados), mismo patrón que la cédula en `FormularioMiembro`. Son inmutables en el dominio desde el Plan 6. |
| Selector de Plan en "Registrar pago" | Solo planes **activos** — el dominio ya rechaza pagos contra un plan inactivo (`PlanInactivoError`, 400); no tiene sentido ofrecer una opción que sabemos que va a fallar. |
| Campo `metodo` del formulario de pago | Selector (`<select>`) con opciones fijas típicas de Venezuela (Efectivo USD, Efectivo VES, Transferencia, Zelle, Binance/USDT, Pago Móvil) — el dominio sigue tratándolo como `string` libre, solo se restringen los valores desde la UI. |
| Alta de pago en `/pagos` | Subpágina `/pagos/nuevo`, mismo patrón que `/miembros/nuevo` (no embebido en el listado). |
| `GET /api/pagos` (API REST existente) | Se extiende para aceptar listar **sin** `miembroId` (historial global) — compatible hacia atrás, sigue aceptando `?miembroId=` igual que antes. |
| Testing | Mismo patrón que todos los planes anteriores: sin suite de tests unitarios nueva, verificación `tsc --noEmit` + `turbo build` + `turbo lint`, y una tarea final de prueba manual contra la base real que corre el usuario. |

## Alcance

**Incluye:**
- Pantalla `/planes`: listado, alta (`/planes/nuevo`), edición (`/planes/[id]`)
- Pantalla `/pagos`: listado global, alta (`/pagos/nuevo`)
- Extensión de `/miembros/[id]`: sección de historial de pagos + botón "Registrar pago" (mismo formulario que `/pagos/nuevo`, con miembro preseleccionado)
- Dominio nuevo: `ListarSucursales` (con una entidad `SucursalResumen` que **nunca** expone `apiKey`)
- Dominio extendido: `ListarPagos` acepta `miembroId` opcional; sin él, lista todos los pagos de la organización
- `GET /api/pagos` extendida para aceptar listar sin `miembroId`

**Fuera de alcance (diferido explícitamente):**
- Editar/cancelar un `Pago` ya registrado (el dominio no lo soporta; no se agrega aquí)
- Rotación de `apiKey` de `Sucursal` (ya listado como pendiente en el ROADMAP, no relacionado con este plan salvo que `ListarSucursales` cuidadosamente nunca la expone)
- Dashboard/resumen financiero (totales, gráficos) — esto es un listado simple, no un dashboard
- Filtros/búsqueda/paginación en `/pagos` o `/planes` — mismo criterio que Miembros, se agrega cuando el volumen lo justifique
- Conversión USD↔VES en el formulario de pago (existe `ConvertirMontoUSDaVES` en el dominio desde el Plan 7, pero no tiene consumidor real todavía — se integra en un plan aparte si se decide usarlo aquí)
- Theming/dark mode completo — sigue diferido a `packages/theming` (mismo ruling que Plan 9)

## Diseño técnico

### Dominio (`packages/domain`)

**`entities/Pago.ts`** — se agrega un campo opcional:
```typescript
export interface Pago {
  id: string;
  miembroId: string;
  miembroNombre?: string; // solo poblado por el listado global (denormalizado, igual que Miembro.entrenadorNombre)
  monto: number;
  metodo: string;
  tasaCambio: number | null;
  fechaPago: Date;
}
```

**`entities/SucursalResumen.ts`** (nuevo):
```typescript
export interface SucursalResumen {
  id: string;
  nombre: string;
}
```
Nunca incluye `apiKey` — es una entidad separada de `Sucursal`, no un subconjunto de campos opcionales sobre la misma interfaz, para que sea estructuralmente imposible filtrar el campo sensible por accidente.

**`ports/ISucursalRepository.ts`** — se agrega un método, sin tocar `buscarPorApiKey`:
```typescript
listarPorOrganizacion(organizacionId: string): Promise<SucursalResumen[]>
```
**Nota confirmada (no placeholder):** `buscarPorApiKey` es un método del puerto sin ninguna implementación en el código hoy — la validación real del kiosco usa un puerto y adaptador distintos (`IKioskAuthValidator`/`KioskTokenValidator`, con su propio `prisma.sucursal.findUnique({ where: { apiKey } })`). No existe ningún `PrismaSucursalRepository` en el repo. Este plan crea ese archivo por primera vez, implementando ambos métodos del puerto (incluyendo `buscarPorApiKey`, aunque nada lo invoque todavía — se deja implementado porque el puerto lo exige, no se elimina el método del puerto sin que el usuario lo pida explícitamente, ya que podría tener un consumidor futuro planeado que este plan no conoce).

**`ports/IPagoRepository.ts`** — se agrega:
```typescript
listarPorOrganizacion(organizacionId: string): Promise<Pago[]>
```

**`use-cases/ListarSucursales.ts`** (nuevo):
```typescript
export async function listarSucursales(
  deps: { sucursales: ISucursalRepository },
  organizacionId: string
): Promise<SucursalResumen[]> {
  return deps.sucursales.listarPorOrganizacion(organizacionId);
}
```

**`use-cases/ListarPagos.ts`** (modificado) — `miembroId` pasa a opcional:
```typescript
export async function listarPagos(
  deps: { pagos: IPagoRepository; miembros: IMemberRepository },
  input: { organizacionId: string; miembroId?: string }
): Promise<Pago[]> {
  if (!input.miembroId) {
    return deps.pagos.listarPorOrganizacion(input.organizacionId);
  }

  const miembro = await deps.miembros.buscarPorId(input.organizacionId, input.miembroId);
  if (!miembro) {
    throw new MiembroNoEncontradoError();
  }

  return deps.pagos.listarPorMiembro(input.miembroId);
}
```

### Infraestructura (`packages/infrastructure`)

**`PrismaSucursalRepository.ts`** (nuevo — hoy no existe ningún archivo con este nombre ni ninguna implementación de `ISucursalRepository` en el repo):
```typescript
export class PrismaSucursalRepository implements ISucursalRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async buscarPorApiKey(apiKey: string): Promise<Sucursal | null> {
    const sucursal = await this.prisma.sucursal.findUnique({ where: { apiKey } });
    if (!sucursal) return null;
    return sucursal;
  }

  async listarPorOrganizacion(organizacionId: string): Promise<SucursalResumen[]> {
    const sucursales = await this.prisma.sucursal.findMany({
      where: { organizacionId },
      select: { id: true, nombre: true }, // select explícito — apiKey nunca sale de la query
      orderBy: { nombre: "asc" },
    });
    return sucursales;
  }
}
```
Este archivo es independiente de `KioskTokenValidator.ts` (que implementa un puerto distinto, `IKioskAuthValidator`, y sigue siendo el mecanismo real de autenticación del kiosco) — no se toca ni se fusiona con él.

**`PrismaPagoRepository.ts`** (modificado) — se agrega `listarPorOrganizacion`, con join a `Miembro` para scoping y para traer el nombre:
```typescript
async listarPorOrganizacion(organizacionId: string): Promise<Pago[]> {
  const pagos = await this.prisma.pago.findMany({
    where: { miembro: { organizacionId } },
    include: { miembro: { select: { nombre: true } } },
    orderBy: { fechaPago: "desc" },
  });

  return pagos.map((p) => ({ ...mapear(p), miembroNombre: p.miembro.nombre }));
}
```

### API REST (`apps/web-admin/app/api/pagos/route.ts`)

`GET` se modifica: `miembroId` deja de ser requerido. Sin él, llama a `listarPagos` sin ese campo (listado global). Con él, comportamiento idéntico al actual.

### UI nueva (`apps/web-admin/app/(panel)`)

```
planes/
  actions.ts          — crearPlanAction, actualizarPlanAction
  FormularioPlan.tsx  — alta: nombre, tipoAcceso, precioUSD, sucursales (checkbox list, solo si tipoAcceso ≠ TODA_LA_ORGANIZACION)
                         edición: mismos campos pero tipoAcceso y sucursales deshabilitados/solo-lectura
  page.tsx            — listado (nombre, tipoAcceso, precioUSD, activo/inactivo, link editar)
  nuevo/page.tsx
  [id]/page.tsx

pagos/
  actions.ts          — registrarPagoAction
  FormularioPago.tsx  — selector de miembro (deshabilitado + preseleccionado si se pasa miembroIdFijo),
                         selector de plan (solo activos de la organización),
                         selector de método (opciones fijas),
                         monto, tasaCambio (opcional)
  page.tsx            — listado global (fecha, miembro, plan si se puede resolver, monto, método)
  nuevo/page.tsx

miembros/[id]/page.tsx  (modificado, no recreado)
  — se agrega una sección debajo del formulario existente: historial de pagos de ese miembro
    (listarPagos con miembroId) + FormularioPago renderizado inline en esa misma página,
    con miembroIdFijo=miembro.id (deshabilita y preselecciona el selector de miembro).
    No hay navegación a pagos/nuevo desde acá — es el mismo componente FormularioPago,
    la página simplemente le pasa la prop miembroIdFijo. Al enviar, revalidatePath tanto
    "/miembros/[id]" (refresca el historial recién agregado) como "/pagos" (si el listado
    global está cacheado). Esto evita duplicar el formulario entre dos rutas.
```

`packages/ui` no gana componentes nuevos. El checkbox-list de sucursales en `FormularioPlan` se construye con `<input type="checkbox">` HTML plano dentro del formulario (sin envolver en un componente de `packages/ui`) — es una lista de checkboxes específica de este formulario, no un patrón que otra pantalla vaya a reutilizar todavía; se promueve a un componente compartido solo si un plan futuro repite la misma necesidad (YAGNI).

### Manejo de errores

Mismo patrón que `EstadoFormularioMiembro`: cada Server Action devuelve `{ error?: string }`, capturando los errores de dominio ya existentes:
- `crearPlanAction`: `SucursalesRequeridasError`, `SucursalInvalidaError`
- `actualizarPlanAction`: `PlanNoEncontradoError`
- `registrarPagoAction`: `MiembroNoEncontradoError`, `PlanNoEncontradoError`, `PlanInactivoError`

### Constraints globales (heredadas del Plan 9, siguen aplicando)

- `organizacionId` siempre de la sesión server-side (`obtenerUsuarioDeSesionActual()`), nunca del cliente
- `tipoAcceso` y sucursales de un `Plan` son inmutables tras la creación
- Nunca ejecutar `git commit`/`git push` automáticamente salvo instrucción explícita del usuario

## Verificación

- `tsc --noEmit` en `apps/web-admin`
- `turbo run build --filter=web-admin` (deben aparecer `/planes`, `/planes/nuevo`, `/planes/[id]`, `/pagos`, `/pagos/nuevo` en el resumen de rutas)
- `turbo run lint --filter=web-admin`
- Tarea final de prueba manual contra la base real y en el navegador — la corre el usuario, igual que el Plan 9
