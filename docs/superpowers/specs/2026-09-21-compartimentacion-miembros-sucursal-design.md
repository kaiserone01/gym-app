# Compartimentación de miembros por sucursal — Diseño

## Contexto

Hoy `/miembros` lista TODOS los miembros de la organización sin filtrar por
sucursal (solo muestra la sucursal como columna informativa), y cualquier
operación sobre un miembro por id (`/miembros/[id]`, editar, registrar pago,
dar de baja/reactivar) funciona sin chequear si ese miembro pertenece a la
`sucursalActivaId` de la sesión — confirmado explorando el código, no es
una suposición. El esquema de datos ya soporta la separación
(`Miembro.sucursalId` nullable = "Ambas" solo si `Plan.multisede`), pero
ningún caso de uso de dominio la aplica todavía.

La caja (`Turno`) ya está correctamente separada por sucursal desde el
trabajo de la sesión anterior (`obtenerTurnoAbiertoParaUsuario(sucursalActivaId, ...)`)
— no requiere cambios en este plan.

Separar métodos de pago por sucursal queda explícitamente fuera de
alcance (pedido del usuario).

## Reglas

1. **Listado**: un usuario solo ve miembros de su `sucursalActivaId`, más
   los miembros multisede (`sucursalId === null`) de la organización. Para
   ver/operar miembros de otra sucursal, debe cerrar sesión y volver a
   entrar eligiendo esa sucursal (mismo patrón ya establecido para
   `sucursalActivaId`).
2. **Multisede**: un miembro con `sucursalId === null` (permitido solo si
   su `Plan.multisede === true`) es visible y operable desde cualquier
   sucursal.
3. **Acceso directo por id**: un miembro no-multisede de otra sucursal no
   es accesible ni editable aunque se conozca su URL/id directamente —
   bloqueo tanto en lectura como en escritura, con mensaje explícito
   (no un 404 genérico).
4. **Pago de un miembro multisede**: el pago se registra siempre contra la
   `sucursalActivaId` de quien cobra (la caja abierta ahí) — comportamiento
   ya existente (`Pago.sucursalId`), sin cambios.
5. **SOCIO**: sujeto a las mismas reglas que cualquier otro rol. Aunque
   ve todas las sucursales en el selector de login, una vez dentro su
   sesión queda fija a una sola `sucursalActivaId` — sin excepción para
   ver miembros de la sucursal no activa.
6. **Crear miembro**: la sucursal del nuevo miembro queda fija a la
   `sucursalActivaId` de la sesión — sin selector. Si el plan elegido es
   multisede, se puede marcar "Ambas"; nunca se puede elegir otra sucursal
   específica de la organización.
7. **Editar miembro**: mismo criterio que crear — el selector de sucursal
   en edición solo ofrece la sucursal activa (y "Ambas" si el plan lo
   permite), nunca una sucursal distinta. Mudar a un miembro de sede
   requiere iniciar sesión en la sede destino.

## Punto único de validación (dominio)

Para evitar repetir el chequeo en cada page/action/route (patrón "un solo
camino de código" ya establecido), la validación de pertenencia a sucursal
vive dentro de los casos de uso de dominio que resuelven un miembro por id,
no en la capa de `apps/web-admin`.

### Nuevo error de dominio

```typescript
// packages/domain/use-cases/ObtenerMiembro.ts (y reexportado donde haga falta)
export class MiembroFueraDeSucursalError extends Error {
  constructor(public readonly sucursalNombre: string) {
    super(`Este miembro pertenece a ${sucursalNombre}. Inicia sesión en esa sucursal para verlo o editarlo.`);
  }
}
```

### Casos de uso a modificar

Todos reciben un nuevo parámetro obligatorio `sucursalActivaId: string` y
lanzan `MiembroFueraDeSucursalError` si `miembro.sucursalId !== null &&
miembro.sucursalId !== sucursalActivaId`:

- `obtenerMiembro` (`packages/domain/use-cases/ObtenerMiembro.ts`)
- `actualizarMiembro` (`packages/domain/use-cases/ActualizarMiembro.ts`) —
  cubre también `darDeBajaAction`/`reactivarAction`, que ya pasan por acá
- `registrarPago` (`packages/domain/use-cases/RegistrarPago.ts`) — punto de
  escritura real; sin este chequeo, un form manipulado podría registrar un
  pago a un miembro de otra sucursal

Para construir el mensaje de error con el nombre de la sucursal, estos
casos de uso necesitan resolver el nombre de `miembro.sucursalId` — se
inyecta `sucursales: ISucursalRepository` en sus `deps` (ya existe el
puerto, solo se agrega como dependencia en los sitios que no lo tenían).

`RegistrarCheckIn` NO se toca — usa `buscarPorOrganizacionYCedula`, no
`buscarPorId`, y ya valida sucursal internamente contra el kiosco.

### Listado (`listarMiembros`)

```typescript
// packages/domain/use-cases/ListarMiembros.ts
export async function listarMiembros(
  deps: { miembros: IMemberRepository },
  organizacionId: string,
  sucursalActivaId: string
): Promise<Miembro[]> {
  const todos = await deps.miembros.listarPorOrganizacion(organizacionId);
  return todos.filter((m) => m.sucursalId === null || m.sucursalId === sucursalActivaId);
}
```

Filtro en memoria (no una nueva query Prisma) — listas de miembros por
organización son chicas, y evita tocar `IMemberRepository`/Prisma. Se
aplica igual en los 4 call sites: `/miembros`, `/caja`, `/pagos/nuevo`,
`/api/miembros` (GET) — ningún consumidor ve miembros de otra sucursal,
incluida la ruta API.

## UI

### `/miembros/[id]` — acceso a miembro de otra sucursal

Página de error dedicada (reemplaza el formulario), mostrando el mensaje
de `MiembroFueraDeSucursalError` y un botón "Volver a miembros". Se
distingue de "no encontrado" (`MiembroNoEncontradoError`, sigue siendo
`notFound()`).

### `FormularioMiembro.tsx` — selector de sucursal

Hoy es un `<select>` con todas las sucursales de la organización
(`sucursales` prop). Cambia a:

- **Creación**: sin selector visible. Campo oculto fijo a
  `sucursalActivaId`. Si el plan elegido tiene `multisede === true`, se
  muestra un toggle/checkbox "Disponible en ambas sedes" que alterna entre
  `sucursalActivaId` y `null` (ID_AMBAS_SEDES) — nunca ofrece otra sede
  puntual.
- **Edición**: mismo criterio — sin selector de sedes específicas, solo el
  toggle multisede si el plan lo permite.

El prop `sucursales: SucursalResumen[]` deja de usarse para poblar el
selector.

### `SelectorMetodoPago.tsx` — eliminar el selector "Sede del pago"

Hoy existe un selector aparte, "Sede del pago", visible cuando hay más de
una `opcionesSede` (para planes multisede, ofrece TODAS las sucursales de
la organización — contradice la regla 4). Se elimina: el pago se registra
siempre en `sucursalActivaId`, sin excepción, incluso para miembros
multisede. Se quitan `opcionesSede`, el estado `sucursalId` del
componente, el `<select>` correspondiente, y los props
`sucursalesOrganizacion`/`sucursalesVisibles` que ya no tengan otro uso en
ese componente — se resuelve en el plan de implementación cuáles quedan
realmente sin consumidores tras este cambio.

### Validación server-side (no solo UI)

`crearMiembroAction`/`actualizarMiembroAction` no deben confiar en el
`sucursalId` que llega del `FormData` del cliente. Al construir el input
para `crearMiembro`/`actualizarMiembro`, el `sucursalId` se resuelve
server-side a partir de `sucursalActivaId` de la sesión (o `null` si el
usuario marcó el toggle multisede y el plan lo permite) — nunca se toma
literal el valor que venga del formulario para una sede específica que no
sea la activa.

## Fuera de alcance (explícito)

- Métodos de pago por sucursal.
- Caja/Turno — ya está separado, sin cambios.
- `RegistrarCheckIn`/kiosco — ya valida sucursal por su cuenta.
- Estadísticas de check-in (`/estadisticas`) — sigue siendo org-wide, no
  mencionado en las reglas pedidas.
- Mover un miembro entre sedes de forma expresa (un flujo tipo
  "transferir sede") — no se pide; mudar a alguien de sede implica volver
  a crearlo o editarlo desde la sesión de la sede destino.
