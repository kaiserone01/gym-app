# Handoff — gym-app

## Objetivo
Migrar `gym-app` de app única a monorepo Turborepo, de schema single-tenant a SaaS multi-tenant, de lógica inline a arquitectura hexagonal, agregar login/sesión y CRUD de `Miembro` al panel admin — siguiendo el ADR-001 (v1 + v2) y `docs/ROADMAP.md`, con superpowers (`writing-plans` + `executing-plans`).

## Estado actual — Planes 1–5 completos al 100% (verificados contra la base real); Plan 6 en curso (Tareas 1–9 hechas, Tarea 10 pendiente en la máquina del usuario)
- **Plan 1** (Turborepo scaffold), **Plan 2** (schema Organizacion/Sucursal), **Plan 3** (dominio hexagonal), **Plan 4** (login/sesión del panel admin), **Plan 5** (gestión de `Miembro`): completos, ver detalle abajo.
- **Plan 6** (`docs/superpowers/plans/2026-09-13-gestion-pagos-suscripciones.md` — gestión de Pago/Suscripcion/Plan): Tareas 1–9 completas y verificadas sin DB. Tarea 10 (pruebas contra la DB real) queda para el usuario.

## Archivos y cambios (Plan 6 — gestión de Pago/Suscripcion/Plan)
- **Creados:**
  - `packages/domain/entities/Plan.ts` — entidad completa del Plan de acceso a sucursales (`nombre`, `tipoAcceso`, `precioUSD`, `activo`), separada del `Plan` embebido mínimo que ya usaba `Suscripcion.ts` para el check-in (no se tocó ese archivo).
  - `packages/domain/entities/Pago.ts`
  - `packages/domain/ports/{IPlanRepository,IPagoRepository}.ts`
  - `packages/domain/use-cases/{CrearPlan,ListarPlanes,ActualizarPlan,RegistrarPago,ListarPagos}.ts` — `CrearPlan` valida que las `sucursalIds` pertenezcan a la organización (`SucursalInvalidaError`) y que un plan que no es `TODA_LA_ORGANIZACION` tenga al menos una sucursal (`SucursalesRequeridasError`); `RegistrarPago` extiende la `Suscripcion ACTIVA` vigente sumando 30 días desde `max(fin, hoy)` o crea una nueva si no hay ninguna, sincroniza `Miembro.fechaUltimoPago`/`fechaVencimiento`, y rechaza pagos contra un plan `activo:false` (`PlanInactivoError`).
  - `packages/infrastructure/persistence/prisma/{PrismaPlanRepository,PrismaPagoRepository}.ts`
  - `apps/web-admin/app/api/planes/route.ts` (GET lista / POST crea), `apps/web-admin/app/api/planes/[id]/route.ts` (PATCH edita `nombre`/`precioUSD`/`activo` — `tipoAcceso` es inmutable), `apps/web-admin/app/api/pagos/route.ts` (POST registra pago / GET `?miembroId=` historial)
- **Modificados:** `packages/domain/ports/IMemberRepository.ts` (+ `actualizarFechasPago`), `packages/infrastructure/persistence/prisma/PrismaMemberRepository.ts` (implementa), `packages/domain/ports/ISuscripcionRepository.ts` (+ `buscarActivaVigentePorMiembroYPlan`/`extenderFin`/`crear`), `packages/infrastructure/persistence/prisma/PrismaSuscripcionRepository.ts` (implementa, refactorizado con un `mapear()` compartido).
- **Sin migración** — todos los modelos (`Plan`, `Suscripcion`, `Pago`, `PlanSucursalAcceso`) ya existían desde el Plan 2.
- **Verificación sin DB (todo verde):** `tsc --noEmit` en `apps/web-admin`, `turbo run build --filter=web-admin` (rutas `/api/planes`, `/api/planes/[id]`, `/api/pagos` aparecen en el build, sin warning de dependencia circular), `turbo run lint --filter=web-admin`.
- Todo commiteado y pusheado a `main` y a `claude/gifted-hawking-ikltak` (últimos commits: `0b6bf9a`, `19ed4e0`, `326193d`, `d5a636d`, `6ed9898`, `3e3d9e3`, `6fb1dd3`, `d5bb776`).
- **Plan 5 — Tarea 7 (pruebas contra la DB real) verificada por el usuario, los 8 casos pasaron:**
  1. Login → `200` + cookie de sesión ✅
  2. `GET /api/miembros` sin cookie → `401 "No autenticado."` ✅
  3. `POST /api/miembros` → `201`, miembro creado ✅
  4. Repetir el mismo `POST` (misma cédula) → `409 "Ya existe un miembro con esa cédula en esta organización."` ✅
  5. `GET /api/miembros/[id]` → `200` con el detalle completo ✅
  6. `PATCH` cambiando `celular` → `200` con el campo actualizado ✅
  7. `PATCH {"activo": false}` (baja lógica) → `200` con `activo:false` ✅
  8. `GET` de un id inexistente → `404 "No se encontró el miembro."` ✅

## Archivos y cambios (Plan 5 — gestión de Miembro)
- **Modificados:** `packages/domain/entities/Miembro.ts` (agrega `entrenadorNombre`, `fechaVencimiento`, tipos `DatosNuevoMiembro`/`CambiosMiembro`), `packages/domain/ports/IMemberRepository.ts` (agrega `buscarPorId`, `listarPorOrganizacion`, `crear`, `actualizar`), `packages/infrastructure/persistence/prisma/PrismaMemberRepository.ts` (implementa los 4 métodos nuevos, mapeo completo incluyendo `entrenador.nombre` y `precioPlan.toNumber()`).
- **Creados:**
  - `packages/domain/use-cases/CrearMiembro.ts` (+ `CedulaDuplicadaError`)
  - `packages/domain/use-cases/ListarMiembros.ts`
  - `packages/domain/use-cases/ObtenerMiembro.ts` (+ `MiembroNoEncontradoError`)
  - `packages/domain/use-cases/ActualizarMiembro.ts` (+ `MiembroNoEncontradoError` propia)
  - `apps/web-admin/app/api/miembros/route.ts` — GET (lista) / POST (crea, 409 si cédula duplicada), ambas protegidas por sesión
  - `apps/web-admin/app/api/miembros/[id]/route.ts` — GET (detalle, 404 si no existe o es de otra organización) / PATCH (edita campos o da de baja lógica con `{"activo": false}`, 404 si no existe)
- **Decisión de alcance documentada en el plan:** este plan cubre solo `Miembro`. `Pago`/`Suscripcion` quedan para un plan siguiente (ya con el diseño acordado: `RegistrarPago` crea/extiende la `Suscripcion` `ACTIVA` del `Plan` correspondiente).
- **Verificación sin DB (todo verde):** `tsc --noEmit` en `domain` e `infrastructure`, `turbo run build --filter=web-admin` (rutas `/api/miembros` y `/api/miembros/[id]` aparecen en el build, sin warning de dependencia circular), `turbo run lint --filter=web-admin`.
- Todo commiteado y pusheado a `main` y a `claude/gifted-hawking-ikltak` (últimos commits: `40aaac0`, `553ad92`, `2a3d8b0`, `5a50070`, `da260e3`).

## Resumen Planes 1–4 (contexto histórico, sin cambios desde el handoff anterior)
- **Plan 4**: modelo `Sesion` (token opaco, cookie httpOnly, revocable en DB), `IniciarSesion`/`CerrarSesion`/`ValidarSesion`, `BcryptPasswordHasher`/`PrismaSesionRepository`, rutas `/api/auth/login`, `/api/auth/logout`, `/api/usuarios` (protegida, expone `CrearUsuarioAdmin`), página `/login`. Todas las pruebas contra la DB real pasaron (login incorrecto → 401, login correcto → 200 + cookie, `/api/usuarios` sin sesión → 401, con sesión → 201, logout invalida la cookie en DB, página `/login` funciona en navegador).
- **Archivos clave Plan 4:** `packages/domain/entities/Sesion.ts`, `packages/domain/ports/{IPasswordHasher,ISesionRepository}.ts`, `packages/domain/use-cases/{IniciarSesion,CerrarSesion,ValidarSesion}.ts`, `packages/infrastructure/auth/BcryptPasswordHasher.ts`, `packages/infrastructure/persistence/prisma/PrismaSesionRepository.ts`, `apps/web-admin/lib/sesion.ts`, `apps/web-admin/app/api/auth/{login,logout}/route.ts`, `apps/web-admin/app/api/usuarios/route.ts`, `apps/web-admin/app/login/page.tsx`.

## Lecciones a seguir aplicando (repetidas en Planes 3 y 4, siguen vigentes)
- **El cliente de Prisma generado en la máquina del usuario queda desactualizado tras cada cambio de schema.** Regla: después de CUALQUIER `git pull` que traiga cambios a `schema.prisma`, correr `npx prisma generate` explícito antes de `npm run dev`, sin asumir que `migrate dev` ya lo hizo.
- **No usar `@default(uuid())`/similares a nivel de Prisma** para generar valores en creación — generar explícito en código (`randomUUID()`/`randomBytes()` de `node:crypto`).
- Esta sandbox no tiene acceso TCP crudo a la DB real (`31.220.56.1:5456`) — todas las tareas que tocan la DB (migraciones, seed, curl contra el server corriendo) las corre el usuario en su máquina y pega el resultado acá.

## Pendiente inmediato — Tarea 10 del Plan 6 (requiere la máquina del usuario, hay red a la DB real)
Comandos exactos en `docs/superpowers/plans/2026-09-13-gestion-pagos-suscripciones.md`, sección "Task 10". Resumen: regenerar cliente + levantar server → login → `GET /api/planes` (debe listar "Sede Única" del seed) → `POST /api/planes` con `TODA_LA_ORGANIZACION` (201) → `POST /api/planes` con `SEDE_UNICA` sin `sucursalIds` (400 esperado) → `PATCH /api/planes/[id]` (200) → `POST /api/pagos` contra Julio César Bastidas (miembro vencido del seed) y el plan "Sede Única" (201) → `GET /api/miembros/[id]` para confirmar que `fechaVencimiento` quedó en hoy+30 días → `GET /api/pagos?miembroId=` (200 con el historial) → repetir el `POST /api/pagos` inmediatamente (debe extender a hoy+60, no crear otra suscripción) → `POST /api/pagos` con un `planId` inexistente (404 esperado).

Si algo falla, pegar la salida completa para diagnosticar — mismo patrón que todos los planes anteriores.

## Próximos pasos
Una vez confirmada la Tarea 10 del Plan 6, actualizar `docs/ROADMAP.md` para cerrar el último bloqueador 🔴. Después de eso:
1. Integración real de la API BCV, app de kiosco física, rotación de `apiKey`, matriz de permisos más granular — ver `docs/ROADMAP.md` para el detalle y prioridad de cada uno.
2. `packages/db/Dockerfile.migrate` sigue en el repo, inofensivo, se puede borrar cuando se confirme que ya no hace falta.
