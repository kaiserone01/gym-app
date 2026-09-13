# Handoff — gym-app

## Objetivo
Ejecutar (vía superpowers:executing-plans) el plan `docs/superpowers/plans/2026-09-13-turborepo-monorepo-scaffold.md`: convertir el repo de app única a monorepo Turborepo (`apps/web-admin` + `packages/*`), sin tocar `schema.prisma` ni ejecutar migraciones, como paso previo a la redesign SaaS multi-tenant (Organización → Sucursal) descrita en `docs/adr/ADR-001-gym-app-sesion-v2.md`.

## Estado actual
- Tareas 1–6 del plan **completadas y verificadas** en el working tree (sin commits — ver regla de git del proyecto). Nada está aún en el historial de git más allá de lo que ya existía antes de esta sesión.
- Tarea 7 (gate de aprobación de schema) **bloqueada intencionalmente**: no se tocó `schema.prisma`, no hay migraciones nuevas.
- `npm run build` (`turbo run build`) y `npm run lint` (`turbo run lint`) pasan en verde para `apps/web-admin`. Segunda corrida de build confirma `>>> FULL TURBO` (cache hit).

## Archivos y cambios
- **Movidos con `git mv` (historial preservado) a `apps/web-admin/`:** `app/`, `lib/`, `prisma/` (incluye `migrations/` y `seed.ts`), `public/`, `next.config.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `tsconfig.json`, `prisma7.config.ts`.
- **Creados:** `turbo.json`, `apps/web-admin/package.json`, `packages/database/package.json`, `packages/domain/package.json`, `packages/ui/package.json` (+ `.gitkeep` en cada uno), `docs/adr/ADR-001-gym-app-sesion-v2.md`, `docs/adr/handoff.md`, `docs/superpowers/plans/2026-09-13-turborepo-monorepo-scaffold.md`.
- **Modificados:** `package.json` raíz (campo `workspaces`, `packageManager`, scripts delegados a `turbo run`, dependencias movidas a `apps/web-admin/package.json`), `.gitignore` (patrones `/x` → `**/x` para que apliquen dentro de `apps/web-admin`, agregado `.turbo`), `CLAUDE.md` (vaciado — referenciaba `@AGENTS.md`, eliminado).
- **Eliminados:** `AGENTS.md`.
- **Sin modificar:** `prisma/schema.prisma` (solo se movió de ubicación, contenido idéntico), `app/api/checkin/route.ts` (solo se movió, contenido idéntico — el bug de idempotencia conocido sigue presente, sin tocar).

## Intentos fallidos / desvíos resueltos
- Primer `turbo run build` falló: `turbo` requiere el campo `packageManager` en el `package.json` raíz (no estaba en el plan original) — se agregó `"packageManager": "npm@10.9.7"`.
- Segundo intento falló: `Module not found: '../app/generated/prisma/client'` — el cliente Prisma generado nunca se había commiteado (está en `.gitignore`) y no existía tras el `npm install` limpio. Se ejecutó `npx prisma generate` (sin tocar `schema.prisma`, sin migraciones) para regenerarlo — condición preexistente del repo, no causada por el movimiento a monorepo.
- Cache de Turborepo no funcionaba (`0 cached` en la segunda corrida) porque `.gitignore` tenía patrones anclados a la raíz (`/.next/`, `/app/generated/prisma`) que no cubrían `apps/web-admin/.next` ni `apps/web-admin/app/generated/prisma` tras el movimiento. Se cambiaron a patrones recursivos (`**/.next/`, etc.). Confirmado con `>>> FULL TURBO` en la segunda corrida tras el fix.

## Próximos pasos
1. **Decisión del usuario (Tarea 7 del plan, bloqueante):** aprobar u objetar los modelos `Plan`/`Suscripción`/`PlanSucursalAcceso`, el rol `UsuarioAdmin.rol`/`RolUsuario`, `RegistroAuditoria`, la regla de idempotencia de `RegistrarCheckIn` (¿rechazar con 409 o responder con el check-in existente?), y la fuente de la API BCV — todo en `docs/adr/ADR-001-gym-app-sesion-v2.md` secciones 13 y 16.
2. Resolver además: relación `Entrenador`↔`Sucursal`, alcance de `TemaOrganizacion` (¿override por sucursal?), y si `GERENTE` puede crear `UsuarioAdmin` con rol `RECEPCION`.
3. Confirmar la topología de `packages/*` creada en la Tarea 5 (`database`, `domain`, `ui`) contra la sección 5 de la v1 del ADR (no disponible en esta sesión) — corregir nombres/estructura si no coincide.
4. Solo después de 1–3: escribir el plan de seguimiento `docs/superpowers/plans/YYYY-MM-DD-schema-organizacion-sucursal.md` para la migración real de `schema.prisma` (fuera del alcance de este plan).
5. Revisar los commits sugeridos abajo y ejecutarlos manualmente (no se hizo commit automático).
