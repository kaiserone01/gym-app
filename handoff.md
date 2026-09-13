# Handoff — gym-app

## Objetivo
Migrar `gym-app` de app única a monorepo Turborepo, de schema single-tenant a SaaS multi-tenant, y de lógica inline a arquitectura hexagonal (`packages/domain`/`packages/infrastructure`) para el flujo de check-in, siguiendo el ADR-001 (v1 + v2) con superpowers (`writing-plans` + `executing-plans`).

## Estado actual
- **Plan 1** (Turborepo scaffold) y **Plan 2** (schema Organizacion/Sucursal): completos y verificados extremo a extremo contra la base real por el usuario — ver commits previos.
- **Plan 3** (`docs/superpowers/plans/2026-09-13-dominio-hexagonal-checkin.md`, dominio hexagonal): **Tareas 1–11 completas y verificadas** (schema + código + build + lint, todo sin tocar la DB real). **Tarea 12 pendiente** (requiere red hacia `31.220.56.1:5456` — la corre el usuario):
  1. `Sucursal.apiKey` agregado al schema (pendiente de migrar contra la DB real).
  2–6. `packages/domain`: entidades planas, 7 puertos, casos de uso `RegistrarCheckIn`, `ValidarAccesoSucursalPorPlan`, `CrearUsuarioAdmin` + `AuthorizationService`.
  7–8. `packages/infrastructure`: 4 adaptadores Prisma + `KioskTokenValidator`.
  9. `apps/web-admin`: dependencias de workspace + `transpilePackages` en `next.config.ts`.
  10. `app/api/checkin/route.ts` reescrito delgado — el kiosco ahora se autentica con el header `X-Kiosk-Api-Key` (ya no manda `sucursalId` en el body), y el estado (`activo`/`vencido`) ahora sale de `Suscripcion`/`Plan`, no de `Miembro.fechaVencimiento`.
  11. `seed.ts` actualizado (Suscripcion nueva para Rodrigo Lara, imprime `apiKey` en vez de `sucursalId`) + script manual `apps/web-admin/scripts/verificar-autorizacion.ts` para probar `CrearUsuarioAdmin`/`AuthorizationService` sin exponer un endpoint HTTP.
- Verificado en este sandbox (sin DB): `npx tsc --noEmit`, `npx turbo run build --filter=web-admin`, `npx turbo run lint --filter=web-admin`, y una prueba directa del server `standalone` (confirma que Turbopack empaqueta `@gym-app/domain`/`@gym-app/infrastructure` dentro del bundle — no aparecen como `node_modules/@gym-app/*` separados, y eso es correcto, no un bug).
- Todo commiteado y pusheado a `main` y a `claude/gifted-hawking-ikltak`.

## Archivos y cambios (Plan 3)
- **Creados:** `packages/domain/entities/{Sucursal,Miembro,Suscripcion,CheckIn,UsuarioAdmin}.ts`, `packages/domain/ports/*.ts` (7 puertos), `packages/domain/use-cases/{RegistrarCheckIn,ValidarAccesoSucursalPorPlan,CrearUsuarioAdmin}.ts`, `packages/domain/services/AuthorizationService.ts`, `packages/infrastructure/persistence/prisma/*.ts` (4 adaptadores), `packages/infrastructure/auth/KioskTokenValidator.ts`, `apps/web-admin/scripts/verificar-autorizacion.ts`.
- **Modificados:** `packages/db/prisma/schema.prisma` (+`Sucursal.apiKey`), `packages/db/prisma/seed.ts`, `apps/web-admin/{package.json,next.config.ts,lib/prisma.ts no tocado,app/api/checkin/route.ts}`, `packages/infrastructure/package.json`.

## Intentos fallidos / desvíos resueltos
- **Dependencia circular real** detectada por Turborepo: `packages/infrastructure` depende de `@gym-app/db`, y el diseño original ponía el script de verificación dentro de `packages/db` dependiendo de `@gym-app/infrastructure` — ciclo `db → infrastructure → db`. Se movió el script a `apps/web-admin/scripts/` (las apps son hojas del grafo, sin este problema). Confirmado sin advertencia de ciclo tras el fix.
- Verifiqué manualmente que el output `standalone` de Next.js (usado por el `Dockerfile` de producción) sí funciona con los paquetes internos nuevos, corriendo el `server.js` compilado y golpeando `/api/checkin` directamente — no crasheó por módulos faltantes, solo colgó por la falta de red hacia la DB (esperado en este sandbox).

## Próximos pasos
1. **Tarea 12 del Plan 3 (bloqueante, requiere tu máquina):**
   - `cd packages\db && npx prisma migrate dev --name sucursal_api_key`
   - `npx prisma db seed` (anotar la `apiKey` impresa)
   - `cd ..\..\apps\web-admin && npx tsx scripts\verificar-autorizacion.ts` (esperar los 2 ✅)
   - Probar `/api/checkin` con el nuevo contrato: header `X-Kiosk-Api-Key` en vez de `sucursalId` en el body (ver Tarea 12 del plan para los comandos `curl` exactos — incluye casos: sin header, header inválido, idempotencia, vencido).
2. **Borrar `packages/db/Dockerfile.migrate`** — ya cumplió su propósito (opcional, es inofensivo dejarlo).
3. Fuera de alcance del Plan 3, explícitamente diferido: integración real de la API BCV (`BcvApiAdapter`/`apps/worker`), endpoint HTTP para `CrearUsuarioAdmin` (no hay login/sesión de panel admin todavía — exponerlo sin protección sería inseguro), matriz de permisos más allá de "crear UsuarioAdmin es exclusivo de DUENO", rotación de `apiKey` de una Sucursal existente.
