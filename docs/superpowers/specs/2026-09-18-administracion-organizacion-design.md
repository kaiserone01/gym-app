# Administración de Organización: Sucursales, Usuarios y Permisos Granulares — Spec Técnica

## Contexto y objetivo

Ni el ADR-001 (v1 ni v2) contempla una pantalla de gestión de Sucursales. `Sucursal` solo existe como entidad de modelo de datos; hoy las sucursales se crean exclusivamente vía `packages/db/prisma/seed.ts`, sin ningún endpoint ni pantalla en el panel. Tampoco existe gestión de `UsuarioAdmin` más allá de un único endpoint de alta (`POST /api/usuarios`) sin listado, edición, ni baja.

El sistema de autorización actual es mínimo: la única regla real es "solo DUEÑO crea usuarios" (`AuthorizationService.puedeCrearUsuarioConRol`); el resto de restricciones de rol (Caja, Pagos) son comparaciones `if (rol === "X")` repetidas ad-hoc en cada caso de uso, sin una matriz de permisos consultable. El ADR v2 §13.2 anticipaba explícitamente graduar a permisos granulares "cuando un segundo caso de uso real lo exija" — ya llegamos a ese punto.

Esta fase construye: (1) gestión completa de Sucursales desde el panel, (2) gestión completa de Usuarios (alta/edición/baja/reactivación), y (3) una matriz de permisos granular por módulo × acción, con overrides individuales por usuario sobre defaults por rol.

## Decisiones de producto (confirmadas)

1. Un GERENTE puede administrar varias sucursales — se agrega una relación N:N `UsuarioSucursal`, separada del campo `UsuarioAdmin.sucursalId` existente (que se mantiene con un significado más acotado: "sucursal por defecto para operar").
2. Los módulos con permisos granulares son las secciones actuales del panel: Miembros, Pagos, Planes, Caja, Usuarios, Sucursales.
3. La granularidad de acción es Ver / Crear / Editar / Eliminar (CRUD clásico) por módulo.
4. Los roles fijos (DUEÑO/GERENTE/RECEPCION/ENTRENADOR) se mantienen como plantillas que asignan un set de permisos por defecto al crear el usuario; el DUEÑO puede ajustar permisos individuales por usuario después (override granular).
5. Solo DUEÑO puede crear usuarios, asignar sucursales y editar permisos — ningún otro rol gestiona usuarios.
6. Sucursal: los campos editables desde el panel son nombre, dirección y días de gracia. `tasaCambioUSD` (fallback manual de tasa BCV) NO se incluye en el formulario — sigue existiendo en el modelo como fallback técnico interno, nunca editado a mano. `apiKey` se muestra en modo solo-lectura (con botón de copiar) en la pantalla de edición, sin acción de rotación (queda como pendiente ya documentado en el ROADMAP).

## 1. Modelo de datos (Prisma)

```prisma
enum ModuloPermiso {
  MIEMBROS
  PAGOS
  PLANES
  CAJA
  USUARIOS
  SUCURSALES
}

enum AccionPermiso {
  VER
  CREAR
  EDITAR
  ELIMINAR
}

model PermisoUsuario {
  id        String        @id @default(cuid())
  usuarioId String
  usuario   UsuarioAdmin  @relation(fields: [usuarioId], references: [id])
  modulo    ModuloPermiso
  accion    AccionPermiso

  @@unique([usuarioId, modulo, accion])
}

model UsuarioSucursal {
  usuarioId  String
  sucursalId String
  usuario    UsuarioAdmin @relation(fields: [usuarioId], references: [id])
  sucursal   Sucursal     @relation(fields: [sucursalId], references: [id])

  @@id([usuarioId, sucursalId])
}
```

Semántica: la presencia de una fila en `PermisoUsuario` es el único estado — no hay "denegado" explícito, solo ausencia de permiso. `UsuarioSucursal` vacío para un usuario = acceso a toda la organización (misma semántica que hoy tiene `UsuarioAdmin.sucursalId = null`).

**Modificaciones a `UsuarioAdmin`:**
```prisma
model UsuarioAdmin {
  id             String       @id @default(cuid())
  organizacionId String
  organizacion   Organizacion @relation(fields: [organizacionId], references: [id])
  sucursalId     String?      // sucursal por defecto para operar (preselección en formularios) — YA NO es la fuente de verdad de acceso
  sucursal       Sucursal?    @relation(fields: [sucursalId], references: [id])
  nombre         String       @default("")
  rol            RolUsuario
  email          String       @unique
  passwordHash   String
  activo         Boolean      @default(true)
  createdAt      DateTime     @default(now())

  registrosAuditoria RegistroAuditoria[]
  sesiones           Sesion[]
  turnos             Turno[]
  pagosRegistrados   Pago[] @relation("PagosRegistrados")
  pagosAnulados      Pago[] @relation("PagosAnulados")
  permisos           PermisoUsuario[]
  sucursales         UsuarioSucursal[]
}
```

**Modificaciones a `Sucursal`:** se agrega `activo Boolean @default(true)` para baja lógica (mismo patrón que `Miembro`/`Plan`, hoy Sucursal no tiene ningún estado de baja).

```prisma
model Sucursal {
  // ...campos existentes...
  activo Boolean @default(true)
  usuariosConAcceso UsuarioSucursal[]
}
```

**Migración de datos:** al aplicar la migración, para cada `UsuarioAdmin` existente con `sucursalId` no nulo, se crea una fila `UsuarioSucursal` correspondiente (script de backfill, ver plan de tareas) — preserva el acceso actual de RECEPCION/ENTRENADOR sin intervención manual. Para usuarios con `sucursalId = null` (DUEÑO/GERENTE org-wide), no se crea ninguna fila (coincide con "sin filas = toda la organización"). También se poblan los `PermisoUsuario` de cada usuario existente según la matriz de defaults de su `rol` actual (Sección 2), para que nadie pierda acceso al desplegar esta fase.

## 2. Matriz de permisos por defecto (poblada al crear un usuario, o vía backfill de migración)

| Módulo | DUEÑO | GERENTE | RECEPCION | ENTRENADOR |
|---|---|---|---|---|
| MIEMBROS | Ver/Crear/Editar/Eliminar | Ver/Crear/Editar/Eliminar | Ver/Crear/Editar | Ver |
| PAGOS | Ver/Crear/Editar/Eliminar | Ver/Crear/Editar/Eliminar | Ver/Crear | Ver |
| PLANES | Ver/Crear/Editar/Eliminar | Ver/Crear/Editar | Ver | Ver |
| CAJA | Ver/Crear/Editar/Eliminar | Ver/Crear/Editar/Eliminar | Ver/Crear | (ninguno) |
| USUARIOS | Ver/Crear/Editar/Eliminar | Ver | (ninguno) | (ninguno) |
| SUCURSALES | Ver/Crear/Editar/Eliminar | Ver | (ninguno) | (ninguno) |

Mapeo respecto al comportamiento actual: "ELIMINAR" en Pagos = anular pago (ya restringido hoy a DUEÑO/GERENTE, sin cambio funcional); "CREAR"/"EDITAR" en Caja = registrar pago/egreso, abrir/cerrar turno; ausencia de fila CAJA para ENTRENADOR = sin acceso (igual que hoy).

Esta tabla vive como una constante en `packages/domain/use-cases/CrearUsuarioAdmin.ts` (o un módulo dedicado `PermisosPorDefecto.ts`), consultada solo al momento de crear un usuario o durante el backfill de migración — nunca en el chequeo de autorización en caliente, que siempre consulta `PermisoUsuario` real.

## 3. Casos de uso de dominio

**Sucursales** (mismo patrón que `CrearPlan`/`ActualizarPlan`):
- `CrearSucursal({ organizacionId, nombre, direccion, diasGracia })` → crea con `activo: true`, `apiKey` autogenerada (comportamiento actual sin cambios).
- `ActualizarSucursal({ organizacionId, id, cambios: { nombre?, direccion?, diasGracia? } })` — `tasaCambioUSD` y `apiKey` estructuralmente excluidos del tipo `CambiosSucursal` (mismo patrón de "inmutabilidad por forma de tipo" ya usado en `CambiosPlan`).
- `DarDeBajaSucursal` / `ReactivarSucursal` (organizacionId, id) → alternan `activo`.
- `ListarSucursales` ya existe (Plan 10) — se reutiliza, se le agrega que incluya `activo` en `SucursalResumen` para que la UI pueda distinguir estado.

**Usuarios:**
- `ListarUsuariosAdmin(organizacionId)`, `ObtenerUsuarioAdmin(organizacionId, id)` — incluyen `sucursales: SucursalResumen[]` y `permisos: {modulo, accion}[]` resueltos.
- `ActualizarUsuarioAdmin({ organizacionId, id, cambios: { nombre?, activo? } })` — rol y email no editables después de creado (cambiar rol invalidaría la matriz de permisos ya personalizada; cambiar email rompería el login — ambos fuera de alcance, se resuelve dando de baja y recreando).
- `DarDeBajaUsuarioAdmin` / `ReactivarUsuarioAdmin`.
- `AsignarSucursalesAUsuario({ organizacionId, usuarioId, sucursalIds: string[] })` — reemplaza el set completo de `UsuarioSucursal` de ese usuario en una transacción (borra las que ya no están, inserta las nuevas).
- `ActualizarPermisosUsuario({ organizacionId, usuarioId, permisos: {modulo, accion}[] })` — reemplaza el set completo de `PermisoUsuario` de ese usuario en una transacción (mismo patrón que sucursales: diff completo, no altas/bajas incrementales desde el cliente).

Todos los casos de uso de escritura de Usuarios/Sucursales reciben `rolSolicitante: RolUsuario` y lanzan `RolNoAutorizadoError` si `rolSolicitante !== "DUENO"` — regla de negocio (5), aplicada en el dominio, no solo en la Server Action.

**`CrearUsuarioAdmin`** (modificado): al crear, además de la fila `UsuarioAdmin`, materializa en la misma transacción los `PermisoUsuario` de la matriz de defaults según `input.rol`, y los `UsuarioSucursal` según `input.sucursalIds` (nuevo parámetro, reemplaza el actual `sucursalId` único — si viene vacío, el usuario queda con acceso a toda la organización).

**`AuthorizationService` reescrito:**
```ts
interface IAuthorizationService {
  tienePermiso(usuarioId: string, modulo: ModuloPermiso, accion: AccionPermiso): Promise<boolean>;
  puedeCrearUsuarioConRol(rolSolicitante: RolUsuario, rolACrear: RolUsuario): boolean; // sin cambios
}
```
`tienePermiso` consulta `PermisoUsuario` vía un nuevo puerto `IPermisoRepository.tiene(usuarioId, modulo, accion): Promise<boolean>`.

**Migración de los 5 casos de uso existentes que hoy chequean rol directo** (`AbrirTurno`, `CerrarTurno`, `RegistrarPago`, `RegistrarEgreso`, `AnularPago`): cada uno reemplaza su `if (input.rolUsuario === "ENTRENADOR") throw ...` por una llamada a `autorizacion.tienePermiso(input.usuarioId, "CAJA"|"PAGOS", "CREAR"|"EDITAR"|"ELIMINAR")`. Esto implica que estos 5 casos de uso ganan `autorizacion: IAuthorizationService` en sus `deps` y `usuarioId` (ya lo tienen como `registradoPorId`/`anuladoPorId`/`usuarioId` en la mayoría) en su input. Se preserva el mensaje de error y el tipo de excepción (`RolNoAutorizadoError`) para no romper el manejo existente en las Server Actions — solo cambia la fuente de verdad de la decisión.

## 4. Server Actions y pantallas

**Sidebar** (`layout.tsx`): se agregan los links "Usuarios" y "Sucursales", visibles siempre; cada pantalla verifica su propio permiso `VER` al entrar (Server Component) y redirige a `/miembros` con un mensaje si no lo tiene — patrón nuevo, generaliza el chequeo de lectura que hoy ninguna pantalla hace explícitamente.

**`/sucursales`:**
- `page.tsx`: lista (nombre, dirección, días de gracia, activo/inactivo), botón "Nueva sucursal" condicionado a permiso CREAR.
- `nuevo/page.tsx`, `[id]/page.tsx` + `FormularioSucursal.tsx`: nombre/dirección/diasGracia editables; en modo edición, `apiKey` en `<input readOnly>` con botón "Copiar" (usa `navigator.clipboard`, patrón client-side simple).
- `actions.ts`: `crearSucursalAction`, `actualizarSucursalAction`, `darDeBajaSucursalAction`, `reactivarSucursalAction` — mismo patrón que `planes/actions.ts` (verificación de permiso + rol DUEÑO antes de invocar el caso de uso, catch de errores específicos, `revalidatePath`).

**`/usuarios`:**
- `page.tsx`: lista (nombre, email, rol, sucursales asignadas — nombres separados por coma o "Toda la organización" si vacío —, activo/inactivo).
- `nuevo/page.tsx` + `FormularioUsuario.tsx`: nombre, email, password, rol (select), checkboxes de sucursales (deshabilitados/ocultos si rol = DUEÑO, ya que un DUEÑO siempre tiene acceso total).
- `[id]/page.tsx` + `FormularioPermisos.tsx`: nombre y activo editables; checkboxes de sucursales; matriz de checkboxes Módulo (6 filas) × Acción (4 columnas) para el override de permisos, con los valores actuales del usuario premarcados. Rol y email se muestran de solo lectura.
- `actions.ts`: `crearUsuarioAction`, `actualizarUsuarioAction` (nombre/activo), `actualizarSucursalesUsuarioAction`, `actualizarPermisosUsuarioAction`, `darDeBajaUsuarioAction`, `reactivarUsuarioAction`. Todas verifican `usuario.rol === "DUENO"` en la Server Action antes de invocar el caso de uso (defensa en profundidad, igual patrón que el resto del sistema).

**Endpoint REST** (`app/api/usuarios/route.ts`): se agrega `GET` (lista, con el mismo patrón de `obtenerUsuarioDeSesion(req)` + `ListarUsuariosAdmin`) para igualar la simetría que ya tienen Miembros/Planes; `POST` se extiende para aceptar `nombre` y `sucursalIds` en vez de `sucursalId` único.

## Alcance explícitamente fuera de esta spec

- Cambiar el rol o el email de un usuario ya creado (requiere decidir cómo migrar su matriz de permisos personalizada — se resuelve dando de baja y creando de nuevo).
- Rotación/regeneración del `apiKey` de una Sucursal (pendiente ya documentado en el ROADMAP, sin relación con esta fase salvo que ahora se hace visible en el formulario).
- Que un GERENTE pueda gestionar usuarios o permisos dentro de sus propias sucursales — decisión de producto: solo DUEÑO.
- Editar `tasaCambioUSD` desde el panel — sigue siendo un fallback técnico interno.
- Auditoría específica de cambios de permisos (quién cambió qué permiso y cuándo) — el modelo `RegistroAuditoria` genérico ya existe en el schema pero no se conecta en esta fase, igual que en los planes anteriores.
