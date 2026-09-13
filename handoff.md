# Handoff — gym-app

## Objetivo
Migrar `gym-app` de app única a monorepo Turborepo, de schema single-tenant a SaaS multi-tenant, de lógica inline a arquitectura hexagonal, y agregar login/sesión al panel admin — siguiendo el ADR-001 (v1 + v2) y `docs/ROADMAP.md`, con superpowers (`writing-plans` + `executing-plans`).

## Estado actual — 4 planes completos al 100%, verificados contra la base real
- **Plan 1** (Turborepo scaffold), **Plan 2** (schema Organizacion/Sucursal), **Plan 3** (dominio hexagonal), **Plan 4** (login/sesión del panel admin, `docs/superpowers/plans/2026-09-13-login-sesion-admin.md`): las 10 tareas del Plan 4 completas.
- Resumen del Plan 4: modelo `Sesion` (token opaco, cookie httpOnly, revocable en DB), `IniciarSesion`/`CerrarSesion`/`ValidarSesion`, `BcryptPasswordHasher`/`PrismaSesionRepository`, rutas `/api/auth/login`, `/api/auth/logout`, `/api/usuarios` (protegida, expone `CrearUsuarioAdmin`), página `/login`.
- **Pruebas verificadas contra la DB real por el usuario:**
  - Login con password incorrecto → `401 {"error":"Email o contraseña incorrectos."}` ✅
  - Login correcto (`admin@gymdemo.com`/`admin1234`) → `200` con `usuario` y cookie de sesión ✅
  - `/api/usuarios` sin sesión → `401 {"error":"No autenticado."}` ✅
  - `/api/usuarios` con sesión (DUENO crea RECEPCION) → `201` con el usuario creado ✅
  - Logout → `{"ok":true}`, y la misma cookie ya no sirve después (`401`) — confirma que la sesión se borra realmente en la DB, no solo del lado del cliente ✅
  - Página `/login` en el navegador → login exitoso, redirige a `/` ✅
- Todo commiteado y pusheado a `main` y a `claude/gifted-hawking-ikltak`.

## Archivos y cambios (Plan 4)
- **Creados:** `packages/domain/entities/Sesion.ts`, `packages/domain/ports/{IPasswordHasher,ISesionRepository}.ts`, `packages/domain/use-cases/{IniciarSesion,CerrarSesion,ValidarSesion}.ts`, `packages/infrastructure/auth/BcryptPasswordHasher.ts`, `packages/infrastructure/persistence/prisma/PrismaSesionRepository.ts`, `apps/web-admin/lib/sesion.ts`, `apps/web-admin/app/api/auth/{login,logout}/route.ts`, `apps/web-admin/app/api/usuarios/route.ts`, `apps/web-admin/app/login/page.tsx`.
- **Modificados:** `packages/db/prisma/schema.prisma` (+modelo `Sesion`), `packages/domain/ports/IUsuarioAdminRepository.ts` (+2 métodos), `packages/infrastructure/{package.json,persistence/prisma/PrismaUsuarioAdminRepository.ts}`.
- **Migración nueva:** `packages/db/prisma/migrations/20260913042925_sesion_admin/` — tabla nueva, sin backfill necesario, se aplicó directo sin el drama del `apiKey`.

## Intento fallido / desvío resuelto (Plan 3 y 4, mismo patrón — anotarlo bien para la próxima)
- **El cliente de Prisma generado en la máquina del usuario queda desactualizado tras cada cambio de schema** — pasó dos veces (Tarea 12 del Plan 3 con `apiKey`, Tarea 10 del Plan 4 con `Sesion`). Aunque `prisma migrate dev` en teoría regenera el cliente automáticamente, en la práctica falló silenciosamente en ambos casos (`Unknown argument apiKey` / `Cannot read properties of undefined (reading 'create')` en `prisma.sesion`). **Regla a seguir de ahora en adelante: después de CUALQUIER `git pull` que traiga cambios a `schema.prisma`, correr `npx prisma generate` explícito antes de `npm run dev`, sin asumir que `migrate dev` ya lo hizo.**

## Próximos pasos
`docs/ROADMAP.md` está actualizado — los 2 primeros bloqueadores 🔴 (login/sesión, endpoint de `CrearUsuarioAdmin`) ya están en verde. Queda:
1. **Endpoints de gestión de `Miembro`/`Pago`/`Suscripcion`** — hoy solo se crean vía `seed.ts`. Es el próximo bloqueador natural antes de tener un panel admin usable.
2. Integración real de la API BCV, app de kiosco física, rotación de `apiKey`, matriz de permisos más granular — ver `docs/ROADMAP.md` para el detalle y prioridad de cada uno.
3. `packages/db/Dockerfile.migrate` sigue en el repo, inofensivo, se puede borrar cuando se confirme que ya no hace falta.
