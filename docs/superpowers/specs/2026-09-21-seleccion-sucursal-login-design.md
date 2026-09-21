# Selección de sucursal al iniciar sesión — Diseño

## Contexto y problema

Hoy `UsuarioAdmin.sucursalId` (columna fija en base de datos) cumple dos roles a la vez: "sucursal(es) que este usuario puede ver/operar" y "sucursal por default en formularios". Un SOCIO tiene `sucursalId = null` (ve todas las sucursales de la organización vía `UsuarioSucursal`/`obtenerSucursalesVisiblesParaTurno`), pero nada distingue "estoy viendo todo" de "estoy trabajando específicamente en la Sede Tipuro ahora mismo" — por eso dos socios logueados al mismo tiempo en sucursales distintas terminaban compartiendo la misma caja (arreglado en el plan anterior, `2026-09-21-caja-un-solo-usuario.md`, para el caso de la caja específicamente).

Este plan ataca la causa de fondo: cualquier usuario (no solo SOCIO — cualquier rol puede tener más de una sucursal asignada vía `UsuarioSucursal`) que vea más de una sucursal debe **elegir con cuál sucursal trabaja al iniciar sesión**, en una pantalla de botones (no un `<select>`), con el nombre real de cada sucursal (ej. "Sede Principal", "Sede Tipuro"). Esa elección queda fija para toda la sesión (hasta que cierre sesión y vuelva a entrar) y se convierte en la única fuente de "sucursal activa" para Miembros, Caja y Pagos — reemplazando `usuario.sucursalId` en todo el código de scoping.

## Decisiones acordadas (de la sesión de grill-me)

1. La sucursal elegida se guarda en la **sesión** (`Sesion.sucursalActivaId`), no se sobrescribe `usuario.sucursalId`. Dos sesiones del mismo usuario en sucursales distintas no se pisan.
2. Login en dos pasos: credenciales primero, sucursal después (solo si hay más de una opción visible). No se exponen nombres de sucursal antes de autenticar.
3. La sucursal queda fija para toda la duración de la sesión (hasta 7 días o logout). No hay selector para cambiar de sucursal sin volver a loguearse — ya existe un botón de "Cerrar sesión" en `BarraUsuario.tsx`.
4. El paso de selección se muestra a **cualquier rol** con más de una sucursal visible (no es exclusivo de SOCIO) — se reusa `obtenerSucursalesVisiblesParaTurno` tal cual, solo en un momento distinto (login en vez de al entrar a `/caja`). Si la lista tiene exactamente 1 elemento, no se muestra el paso: la sesión se crea directo con esa única sucursal como activa.
5. Los botones de sucursal muestran un indicador de si esa sucursal tiene una caja (turno) abierta ahora mismo, y por quién (nombre) — esta consulta corre después de autenticar (ya sabemos quién es el usuario), nunca antes.
6. **Un solo camino de código**: después de este cambio, absolutamente ningún lugar del código de scoping/defaults lee `usuario.sucursalId` — todos leen la sucursal activa de la sesión. Esto aplica incluso a un usuario con una sola sucursal asignada (esa única sucursal se guarda igual como `sucursalActivaId`, aunque no haya habido botones que elegir).
7. `obtenerUsuarioDeSesion`/`obtenerUsuarioDeSesionActual` devuelven la sucursal activa junto con el usuario en la misma llamada, para que cada página protegida la reciba sin código adicional.

## Fuera de alcance (explícito)

- Borrar la columna `UsuarioAdmin.sucursalId` de la base de datos — queda sin uso funcional después de este plan, pero su eliminación (y la migración de datos que implicaría) es una tarea aparte.
- Un selector de sucursal dentro del panel para cambiar sin re-loguearse.
- Cambios a `AsignarSucursalesAUsuario` o a qué sucursales puede tener asignadas un usuario — eso no cambia.
- Tocar el bug de caja compartida en sí (ya resuelto en el plan anterior) — este plan generaliza la causa de fondo (no había concepto de "sucursal de esta sesión"), pero el gate `esPropio` de esa solución no se modifica.

## Arquitectura

**Antes:**
```
Login (email+password) → cookie con token de sesión
  → obtenerUsuarioDeSesion(token) → UsuarioAdmin (con sucursalId fijo)
  → cada página/action lee usuario.sucursalId directo para scoping/defaults
```

**Después:**
```
Login paso 1 (email+password) → POST /api/auth/login
  → valida credenciales, NO crea sesión todavía
  → calcula sucursalesVisibles (reusa obtenerSucursalesVisiblesParaTurno)
  → si length === 1: crea la sesión ya mismo con esa sucursal como activa,
    setea cookie, responde { requiereSeleccion: false } → cliente navega a /miembros
  → si length > 1: responde { requiereSeleccion: true, sucursales: [...],
    cierresPorSucursal: {...} } (SIN cookie todavía) → cliente muestra botones

Login paso 2 (solo si hubo selección) → POST /api/auth/login/sucursal
  → recibe { email, password, sucursalId } (se reenvían las credenciales:
    no hay sesión de por medio todavía entre el paso 1 y el paso 2 — ver
    "Por qué reenviar credenciales" más abajo)
  → valida credenciales de nuevo, valida que sucursalId esté en
    sucursalesVisibles del usuario, crea la sesión con esa sucursal activa,
    setea cookie en ESTA respuesta (la única de las dos llamadas que setea
    cookie en el camino de selección) → cliente navega a /miembros

obtenerUsuarioDeSesion(token) → { usuario: UsuarioAdmin, sucursalActivaId: string }
  → cada página/action lee sucursalActivaId en vez de usuario.sucursalId
```

**Por qué reenviar credenciales en el paso 2 en vez de un token temporal:** agregar un "token de pre-sesión" de corta duración sería una entidad nueva (con su propio repositorio, expiración, limpieza) solo para cubrir el intervalo entre elegir credenciales y elegir sucursal — normalmente segundos. Reenviar `email`+`password` (ya los tiene el formulario en memoria del lado del cliente, no hay que pedírselos de nuevo al usuario) evita esa complejidad; el costo es una segunda validación de credenciales, que ya es rápida (bcrypt) y no es una operación sensible a re-ejecutar.

## Cambios por capa

### `packages/domain`

- **`Sesion`** (`entities/Sesion.ts`): agrega `sucursalActivaId: string`.
- **`ISesionRepository`**: `crear()` recibe `sucursalActivaId` además de lo que ya recibía.
- **`IniciarSesion.ts`**: `iniciarSesion()` recibe `sucursalActivaId` en el input y lo pasa a `deps.sesiones.crear()`. (Sigue siendo el único punto que crea una `Sesion` — tanto el camino "una sola sucursal" como el paso 2 del login llaman a este mismo caso de uso, con la sucursal ya resuelta de antemano por cada llamador.)
- **`ValidarSesion.ts`**: `validarSesion()` devuelve `{ usuario: UsuarioAdmin; sucursalActivaId: string } | null` en vez de `UsuarioAdmin | null`.
- **Nuevo caso de uso `ObtenerSucursalesVisiblesParaUsuario.ts`** (`packages/domain` no puede importar de `apps/web-admin`, así que la lógica de `obtenerSucursalesVisiblesParaTurno.ts` — hoy en `apps/web-admin/app/(panel)/caja/`, que solo hace `listarSucursales` + filtrar por `UsuarioSucursal` según el rol, sin nada específico de framework — se mueve a domain como caso de uso reutilizable, recibiendo los repositorios por `deps` como cualquier otro caso de uso de esta capa). El archivo viejo en `apps/web-admin/app/(panel)/caja/obtenerSucursalesVisiblesParaTurno.ts` pasa a ser un wrapper de una línea que arma los repositorios Prisma y llama al nuevo caso de uso, para no romper los imports existentes en `caja/page.tsx`, `caja/obtenerTurnoAbiertoParaUsuario.ts` y `api/caja/ultimo-cierre/route.ts` (los tres consumidores actuales, confirmados por grep antes de escribir este plan).

### `packages/infrastructure`

- **`PrismaSesionRepository.crear()`**: agrega `sucursalActivaId` al `data` del `create` y al objeto devuelto.
- **Migration de Prisma**: agrega columna `sucursalActivaId` a `Sesion`, con foreign key a `Sucursal`. Nullable a nivel de columna únicamente por seguridad de migración (filas existentes de sesión no tienen valor); el código de aplicación nunca crea una `Sesion` sin `sucursalActivaId` desde este plan en adelante.

### `apps/web-admin`

- **`lib/sesion.ts`**: `obtenerUsuarioDeSesion`/`obtenerUsuarioDeSesionActual` devuelven `{ usuario, sucursalActivaId } | null`.
- **`app/api/auth/login/route.ts`**: se parte en dos comportamientos (ver Task 3 para el detalle):
  - Si `sucursalesVisibles.length === 1`: crea la sesión directo (comportamiento actual, pero pasando la única sucursal como activa).
  - Si `> 1`: no crea sesión, devuelve la lista + indicador de caja abierta por sucursal.
- **Nueva ruta `app/api/auth/login/sucursal/route.ts`**: recibe `{ email, password, sucursalId }`, revalida credenciales, valida `sucursalId` contra `sucursalesVisibles`, crea la sesión.
- **`app/login/page.tsx`**: agrega el segundo paso (botones de sucursal) cuando el paso 1 lo pide.
- **Todos los call sites que hoy leen `usuario.sucursalId` para scoping/default** (listados abajo) migran a `sucursalActivaId`:
  - `app/(panel)/caja/actions.ts` (`abrirTurnoAction`, `registrarEgresoAction`, `cerrarTurnoAction`)
  - `app/(panel)/caja/obtenerTurnoAbiertoParaUsuario.ts`
  - `app/(panel)/caja/page.tsx`
  - `app/(panel)/miembros/actions.ts`
  - `app/(panel)/miembros/nuevo/page.tsx`
  - `app/(panel)/miembros/[id]/page.tsx`
  - `app/(panel)/pagos/actions.ts`
  - `app/(panel)/pagos/nuevo/page.tsx`
  - `app/api/pagos/route.ts` (incluyendo el `if (!usuario.sucursalId)` de la línea 68, que se reemplaza por una comprobación equivalente sobre `sucursalActivaId` — que, a diferencia de `usuario.sucursalId`, nunca es null para una sesión válida, así que ese `if` deja de ser alcanzable en la práctica pero se mantiene como guardia defensiva de tipos).
- **`obtenerSucursalesVisiblesParaTurno.ts`**: se mueve/re-exporta según lo que decida Task 2 (mantiene su único caso de uso real hoy en `/caja` sin romper nada, y gana un segundo consumidor en login).

## Pantalla de selección de sucursal (paso 2 del login)

- Mismo layout/contenedor que la pantalla de login actual (logo, tarjeta centrada) — cambia el contenido del lado derecho: en vez del formulario de credenciales, una lista de botones grandes, uno por sucursal, con:
  - Nombre de la sucursal (ej. "Sede Principal").
  - Si tiene caja abierta ahora: indicador visual + "Caja abierta por {nombre}" (mismo patrón de aviso ámbar ya usado en `AvisoCajaAjena`/`AvisoCajaCerrada`).
  - Si no tiene caja abierta: sin indicador adicional.
- Un botón "Volver" para corregir credenciales sin recargar la página.
- Clic en un botón de sucursal → llama al paso 2 del login → redirige a `/miembros` igual que el flujo actual.

## Testing

Sin framework de tests en el repo (mismo patrón que el plan anterior) — cada tarea se verifica con scripts `tsx` de un solo uso contra la base real, más typecheck, más verificación manual con `/run` cuando haya UI involucrada (login de dos pasos, botones).
