# Handoff — gym-app

## Objetivo
Migrar `gym-app` de app única a monorepo Turborepo, de schema single-tenant a SaaS multi-tenant, de lógica inline a arquitectura hexagonal, y agregar login/sesión al panel admin — siguiendo el ADR-001 (v1 + v2) y `docs/ROADMAP.md`, con superpowers (`writing-plans` + `executing-plans`).

## Estado actual — 4 planes, 3 completos al 100%
- **Plan 1** (Turborepo scaffold), **Plan 2** (schema Organizacion/Sucursal), **Plan 3** (dominio hexagonal, `docs/superpowers/plans/2026-09-13-dominio-hexagonal-checkin.md`): las 3 completas y verificadas contra la base real. Ver commits previos para el detalle.
- **Plan 4** (login/sesión del panel admin, `docs/superpowers/plans/2026-09-13-login-sesion-admin.md`): **Tareas 1–9 completas y verificadas** (schema + código + build + lint, sin tocar la DB real). **Tarea 10 pendiente** (requiere red hacia `31.220.56.1:5456` — la corre el usuario):
  1. Modelo `Sesion` agregado al schema (tabla nueva, sin backfill necesario — pendiente de migrar contra la DB real).
  2–3. `packages/domain`: entidad `Sesion`, puertos `IPasswordHasher`/`ISesionRepository`, extensión de `IUsuarioAdminRepository` (`buscarPorId`, `buscarCredencialesPorEmail`), casos de uso `IniciarSesion`/`CerrarSesion`/`ValidarSesion`.
  4. `packages/infrastructure`: `BcryptPasswordHasher`, `PrismaSesionRepository`, extensión de `PrismaUsuarioAdminRepository`.
  5. `apps/web-admin/lib/sesion.ts` — helper `obtenerUsuarioDeSesion` (lee cookie httpOnly, valida contra la DB).
  6. Rutas `POST /api/auth/login` (cookie httpOnly, 7 días) y `POST /api/auth/logout`.
  7. `POST /api/usuarios` — expone `CrearUsuarioAdmin` (ya existente del Plan 3) protegido por sesión.
  8. `/login` — página mínima (formulario email/password).
  9. Build (`turbo run build`, 5 rutas nuevas visibles: `/api/auth/login`, `/api/auth/logout`, `/api/usuarios`, `/login`) + lint, todo en verde, sin advertencia de ciclo.
- Todo commiteado y pusheado a `main` y a `claude/gifted-hawking-ikltak`.

## Archivos y cambios (Plan 4)
- **Creados:** `packages/domain/entities/Sesion.ts`, `packages/domain/ports/{IPasswordHasher,ISesionRepository}.ts`, `packages/domain/use-cases/{IniciarSesion,CerrarSesion,ValidarSesion}.ts`, `packages/infrastructure/auth/BcryptPasswordHasher.ts`, `packages/infrastructure/persistence/prisma/PrismaSesionRepository.ts`, `apps/web-admin/lib/sesion.ts`, `apps/web-admin/app/api/auth/{login,logout}/route.ts`, `apps/web-admin/app/api/usuarios/route.ts`, `apps/web-admin/app/login/page.tsx`.
- **Modificados:** `packages/db/prisma/schema.prisma` (+modelo `Sesion`), `packages/domain/ports/IUsuarioAdminRepository.ts` (+2 métodos), `packages/infrastructure/{package.json,persistence/prisma/PrismaUsuarioAdminRepository.ts}`.

## Próximos pasos
1. **Tarea 10 del Plan 4 (bloqueante, requiere tu máquina):**
   - `cd packages\db && npx prisma migrate dev --name sesion_admin` (tabla nueva, no debería repetir el drama del `apiKey` — sin filas existentes que backfillear)
   - `git add packages/db/prisma/migrations && git commit -m "..." && git push origin main`
   - `npm run dev`
   - Probar con `curl` (comandos exactos en la Tarea 10 del plan): login con credenciales malas → 401, login correcto (`admin@gymdemo.com`/`admin1234`) guardando cookie con `-c cookies.txt`, `/api/usuarios` sin sesión → 401, `/api/usuarios` con sesión (DUENO crea RECEPCION) → 201, logout, y confirmar que la sesión cerrada ya no sirve.
   - Probar `/login` en el navegador.
2. Una vez cerrado el Plan 4, marcar el bloqueador #1 de `docs/ROADMAP.md` como completo y decidir el siguiente ítem (los otros 2 🔴 bloqueadores dependen de este: endpoints de gestión de Miembro/Pago/Suscripción).
3. **Recordatorio operativo:** después de cualquier cambio a `schema.prisma`, correr `npx prisma generate` en cada máquina antes de usar el cliente (no se versiona).
4. `packages/db/Dockerfile.migrate` sigue en el repo, inofensivo, se puede borrar cuando se confirme que ya no hace falta.

## Intentos fallidos / desvíos resueltos — historial acumulado (planes anteriores)
- Dependencia circular `packages/db ↔ packages/infrastructure` (Plan 3) — resuelto moviendo un script de verificación a `apps/web-admin/scripts/`.
- `@default(uuid())` de Prisma no aplica a una columna requerida en tabla con filas existentes, ni de forma confiable en runtime con el motor `client-engine-runtime` de Prisma 7 — desde el Plan 3 en adelante, cualquier valor tipo token/uuid se genera explícito en código (`randomUUID()`/`randomBytes()`), nunca vía `@default(...)` del schema. El modelo `Sesion` del Plan 4 ya sigue esta regla (`token` sin default en el schema).
- BOM de PowerShell (`Set-Content -Encoding utf8`) rompe migraciones SQL — usar `[System.IO.File]::WriteAllText(..., New-Object System.Text.UTF8Encoding $false)` si hace falta editar un `.sql` a mano en Windows.
- Cliente de Prisma no se versiona — correr `npx prisma generate` en cada máquina tras cualquier cambio de schema.
