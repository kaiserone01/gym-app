# Handoff — gym-app

## Objetivo
Migrar `gym-app` de app única a monorepo Turborepo, de schema single-tenant a SaaS multi-tenant, de lógica inline a arquitectura hexagonal, agregar login/sesión y CRUD de `Miembro` al panel admin — siguiendo el ADR-001 (v1 + v2) y `docs/ROADMAP.md`, con superpowers (`writing-plans` + `executing-plans`).

## Estado actual — Planes 1–4 completos al 100% (verificados contra la base real); Plan 5 en curso (Tareas 1–6 hechas, Tarea 7 pendiente en la máquina del usuario)
- **Plan 1** (Turborepo scaffold), **Plan 2** (schema Organizacion/Sucursal), **Plan 3** (dominio hexagonal), **Plan 4** (login/sesión del panel admin): completos, ver detalle abajo.
- **Plan 5** (`docs/superpowers/plans/2026-09-13-gestion-miembros.md` — gestión de `Miembro`): Tareas 1–6 completas y verificadas (sin tocar la DB, no requirió migración porque todos los campos de `Miembro` ya existían desde el Plan 2). Tarea 7 (pruebas contra la DB real) queda para el usuario.

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

## Pendiente inmediato — Tarea 7 del Plan 5 (requiere la máquina del usuario, hay red a la DB real)
```powershell
cd packages\db
npx prisma generate
cd ..\..
npm run dev
```
Luego, con el servidor corriendo:
1. Login (`admin@gymdemo.com`/`admin1234`) → guardar la cookie de sesión.
2. `GET /api/miembros` sin cookie → esperar `401`.
3. `GET /api/miembros` con cookie → esperar `200` con la lista actual.
4. `POST /api/miembros` con cookie, cédula nueva → esperar `201`.
5. Repetir el mismo `POST` con la misma cédula → esperar `409 {"error":"Ya existe un miembro con esa cédula en esta organización."}`.
6. `GET /api/miembros/[id]` del miembro creado → esperar `200` con el detalle.
7. `PATCH /api/miembros/[id]` cambiando `celular` → esperar `200` con el campo actualizado.
8. `PATCH /api/miembros/[id]` con `{"activo": false}` (baja lógica) → esperar `200` con `activo: false`.
9. `GET /api/miembros/<id-inexistente>` → esperar `404`.

Si algo falla, pegar la salida completa (igual que en los planes anteriores) para diagnosticar. El error más probable, por patrón repetido en Planes 3 y 4, es cliente de Prisma desactualizado — ya cubierto por el `npx prisma generate` explícito arriba.

## Resumen Planes 1–4 (contexto histórico, sin cambios desde el handoff anterior)
- **Plan 4**: modelo `Sesion` (token opaco, cookie httpOnly, revocable en DB), `IniciarSesion`/`CerrarSesion`/`ValidarSesion`, `BcryptPasswordHasher`/`PrismaSesionRepository`, rutas `/api/auth/login`, `/api/auth/logout`, `/api/usuarios` (protegida, expone `CrearUsuarioAdmin`), página `/login`. Todas las pruebas contra la DB real pasaron (login incorrecto → 401, login correcto → 200 + cookie, `/api/usuarios` sin sesión → 401, con sesión → 201, logout invalida la cookie en DB, página `/login` funciona en navegador).
- **Archivos clave Plan 4:** `packages/domain/entities/Sesion.ts`, `packages/domain/ports/{IPasswordHasher,ISesionRepository}.ts`, `packages/domain/use-cases/{IniciarSesion,CerrarSesion,ValidarSesion}.ts`, `packages/infrastructure/auth/BcryptPasswordHasher.ts`, `packages/infrastructure/persistence/prisma/PrismaSesionRepository.ts`, `apps/web-admin/lib/sesion.ts`, `apps/web-admin/app/api/auth/{login,logout}/route.ts`, `apps/web-admin/app/api/usuarios/route.ts`, `apps/web-admin/app/login/page.tsx`.

## Lecciones a seguir aplicando (repetidas en Planes 3 y 4, siguen vigentes)
- **El cliente de Prisma generado en la máquina del usuario queda desactualizado tras cada cambio de schema.** Regla: después de CUALQUIER `git pull` que traiga cambios a `schema.prisma`, correr `npx prisma generate` explícito antes de `npm run dev`, sin asumir que `migrate dev` ya lo hizo.
- **No usar `@default(uuid())`/similares a nivel de Prisma** para generar valores en creación — generar explícito en código (`randomUUID()`/`randomBytes()` de `node:crypto`).
- Esta sandbox no tiene acceso TCP crudo a la DB real (`31.220.56.1:5456`) — todas las tareas que tocan la DB (migraciones, seed, curl contra el server corriendo) las corre el usuario en su máquina y pega el resultado acá.

## Próximos pasos
`docs/ROADMAP.md` se actualiza cuando el usuario confirme la Tarea 7 del Plan 5. Después de eso, queda:
1. **`Pago`/`Suscripcion`** — plan siguiente, con el diseño ya acordado (`RegistrarPago` crea/extiende la `Suscripcion` `ACTIVA`).
2. Integración real de la API BCV, app de kiosco física, rotación de `apiKey`, matriz de permisos más granular — ver `docs/ROADMAP.md` para el detalle y prioridad de cada uno.
3. `packages/db/Dockerfile.migrate` sigue en el repo, inofensivo, se puede borrar cuando se confirme que ya no hace falta.
