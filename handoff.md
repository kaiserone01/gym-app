# Handoff — gym-app

## Objetivo
Migrar `gym-app` de app única a monorepo Turborepo, de schema single-tenant a SaaS multi-tenant, y de lógica inline a arquitectura hexagonal (`packages/domain`/`packages/infrastructure`) para el flujo de check-in, siguiendo el ADR-001 (v1 + v2) con superpowers (`writing-plans` + `executing-plans`).

## Estado actual — 3 planes completos y verificados
- **Plan 1** (Turborepo scaffold), **Plan 2** (schema Organizacion/Sucursal), **Plan 3** (`docs/superpowers/plans/2026-09-13-dominio-hexagonal-checkin.md`, dominio hexagonal): **las 12 tareas del Plan 3 completas**, incluida la Tarea 12 (migración + seed + verificación de autorización + pruebas del endpoint) corrida por el usuario contra la base real (`31.220.56.1:5456/gym-pg`).
- Resumen del Plan 3: `Sucursal.apiKey` (autenticación del kiosco por header), `packages/domain` (5 entidades, 7 puertos, 3 casos de uso, `AuthorizationService`), `packages/infrastructure` (4 adaptadores Prisma + `KioskTokenValidator`), `app/api/checkin/route.ts` reescrito delgado (el estado ahora sale de `Suscripcion`/`Plan`, no de `Miembro.fechaVencimiento`; el kiosco ya no manda `sucursalId` en el body).
- **Pruebas manuales verificadas contra la DB real por el usuario:**
  - Script `verificar-autorizacion.ts`: DUENO crea RECEPCION ✅ / GERENTE rechazado al intentarlo ✅.
  - `/api/checkin` con `X-Kiosk-Api-Key` válida → `estado: activo` (Rayza Aray) ✅.
  - Sin header → `401 {"error":"Falta el header X-Kiosk-Api-Key."}` ✅.
  - Header inválido → `401 {"error":"API key de sucursal inválida."}` ✅.
  - Idempotencia (misma llamada repetida) → misma respuesta ✅.
  - Miembro sin `Suscripcion` (Julio César Bastidas) → `estado: vencido` ✅.
- Todo commiteado y pusheado a `main` y a `claude/gifted-hawking-ikltak`.

## Archivos y cambios (Plan 3)
- **Creados:** `packages/domain/entities/{Sucursal,Miembro,Suscripcion,CheckIn,UsuarioAdmin}.ts`, `packages/domain/ports/*.ts` (7 puertos), `packages/domain/use-cases/{RegistrarCheckIn,ValidarAccesoSucursalPorPlan,CrearUsuarioAdmin}.ts`, `packages/domain/services/AuthorizationService.ts`, `packages/infrastructure/persistence/prisma/*.ts` (4 adaptadores), `packages/infrastructure/auth/KioskTokenValidator.ts`, `apps/web-admin/scripts/verificar-autorizacion.ts`.
- **Modificados:** `packages/db/prisma/schema.prisma` (+`Sucursal.apiKey`), `packages/db/prisma/seed.ts` (apiKey explícito, Suscripcion de Rodrigo Lara), `apps/web-admin/{package.json,next.config.ts,app/api/checkin/route.ts}`, `packages/infrastructure/package.json`.
- **Migración nueva:** `packages/db/prisma/migrations/20260913035019_sucursal_api_key/` (con backfill manual — ver desvíos abajo).

## Intentos fallidos / desvíos resueltos (Plan 3)
- **Dependencia circular real** detectada por Turborepo (`packages/db ↔ packages/infrastructure`) — el script de verificación se movió de `packages/db` a `apps/web-admin/scripts/` (las apps son hojas del grafo).
- **`@default(uuid())` de Prisma no se puede aplicar a una columna requerida en una tabla con filas existentes** — Prisma se negó a generar la migración directa; hubo que usar `migrate dev --create-only` y editar el SQL a mano: agregar la columna opcional, `UPDATE ... SET apiKey = gen_random_uuid()::text` para la fila existente, y solo entonces `SET NOT NULL` + el índice único.
- **BOM en el archivo editado:** `Set-Content -Encoding utf8` de PowerShell agrega un BOM que Postgres no puede parsear (`syntax error at or near "﻿"`) — se resolvió escribiendo el archivo con `[System.IO.File]::WriteAllText(..., New-Object System.Text.UTF8Encoding $false)`.
- **Migración fallida a mitad de aplicar** (por el problema del `@default`) dejó `_prisma_migrations` en estado inconsistente — se resolvió con `npx prisma migrate resolve --rolled-back <nombre>` antes de reintentar.
- **`@default(uuid())` tampoco se aplicó en runtime** al crear una `Sucursal` nueva vía `prisma.sucursal.create()` (motor `client-engine-runtime` de Prisma 7) — se resolvió generando el valor explícito en `seed.ts` con `randomUUID()` de `node:crypto`, en vez de depender del default del schema.
- **Cliente de Prisma desactualizado en la máquina del usuario** tras el cambio de schema (el cliente generado no se versiona) — causó `Unknown argument apiKey`; se resolvió con `npx prisma generate`.
- **Servidor de desarrollo viejo corriendo en el puerto 3000** desde una sesión anterior (con el código pre-hexagonal) — hubo que matarlo (`taskkill`) antes de levantar el nuevo, para no probar contra código stale.
- Verifiqué en este sandbox (sin DB) que el output `standalone` de Next.js empaqueta correctamente `@gym-app/domain`/`@gym-app/infrastructure` dentro del bundle (Turbopack los inlinea, no quedan como `node_modules/@gym-app/*` separados — confirmado corriendo el `server.js` compilado y golpeándolo con `curl`, no crasheó).

## Próximos pasos
1. **Borrar `packages/db/Dockerfile.migrate`** — ya cumplió su propósito (opcional, es inofensivo dejarlo).
2. Fuera de alcance del Plan 3, explícitamente diferido:
   - Integración real de la API BCV (`BcvApiAdapter`/`apps/worker`/`ActualizarTasaDiaria`) — la tabla `TasaCambio` existe pero nada la llena.
   - Endpoint HTTP para `CrearUsuarioAdmin` — no hay login/sesión de panel admin todavía; exponerlo sin protección sería inseguro.
   - Matriz de permisos más allá de "crear UsuarioAdmin es exclusivo de DUENO".
   - Rotación/regeneración de `apiKey` de una `Sucursal` ya creada.
3. **Nota para el próximo schema change:** después de cualquier cambio a `packages/db/prisma/schema.prisma`, correr `npx prisma generate` en cada máquina antes de usar el cliente — no se versiona, y un cliente desactualizado falla de forma confusa (`Unknown argument`).
