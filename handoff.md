# Handoff — gym-app

## Objetivo
Migrar `gym-app` de app única a monorepo Turborepo y de schema single-tenant (`Gym`) a SaaS multi-tenant (`Organizacion → Sucursal → Miembro` con `Plan`/`Suscripcion`/`RolUsuario`/`RegistroAuditoria`), siguiendo el ADR-001 (v1 + v2) y ejecutando ambos planes con superpowers (`writing-plans` + `executing-plans`). Incluye corregir el `Dockerfile` de despliegue en Easypanel y validar el endpoint `/api/checkin` extremo a extremo contra una base de datos real.

## Estado actual — TODO completado y verificado
- **Plan 1** (`docs/superpowers/plans/2026-09-13-turborepo-monorepo-scaffold.md`): monorepo Turborepo con `apps/web-admin` + `packages/*`. Completo.
- **Plan 2** (`docs/superpowers/plans/2026-09-13-schema-organizacion-sucursal.md`): las 8 tareas completas:
  1. Topología de `packages/*` corregida para igualar la v1 del ADR (`domain/{entities,use-cases,ports}`, `domain-custom`, `infrastructure/{exchange-rate,persistence/prisma,auth}`, `db`, `design-system`, `theming`, `ui`, `config`).
  2. `prisma/` movido a `packages/db` (único dueño de `schema.prisma` y del cliente generado).
  3. `schema.prisma` reescrito con el modelo SaaS multi-tenant completo, aprobado por el usuario.
  4. Migración `20260913024831_organizacion_sucursal_plan_suscripcion` creada y aplicada contra la base real (`31.220.56.1:5456/gym-pg`, confirmada como base de prueba descartable).
  5. `apps/web-admin/lib/prisma.ts` apunta a `@gym-app/db` y carga `.env` desde la raíz del monorepo explícitamente.
  6. `packages/db/prisma/seed.ts` reescrito y corrido con éxito contra la base real.
  7. `app/api/checkin/route.ts` adaptado a `Sucursal`/`Organizacion`, con idempotencia (ventana de 2 min, responde con el CheckIn existente en vez de duplicar).
  8. Build (`turbo run build`) y las 4 pruebas manuales del endpoint, verificadas contra la base real por el usuario: miembro activo ✅, idempotencia confirmada en Prisma Studio (2 llamadas idénticas → 1 sola fila en `CheckIn`) ✅, miembro vencido ✅, sucursal inexistente → 404 ✅.
- `Dockerfile` de producción (Easypanel) corregido tras la reestructuración de `packages/*` (rutas `COPY` + `prisma generate` desde `packages/db`) y verificado con un build real en Easypanel.
- Todo commiteado y pusheado directo a `main` (y a la rama de sesión `claude/gifted-hawking-ikltak`), según instrucción explícita del usuario de trabajar siempre sobre `main`.

## Archivos y cambios (acumulado de ambos planes)
- **Monorepo:** `turbo.json`, `package.json` raíz (`workspaces`, `packageManager`), `apps/web-admin/` (contenido movido desde la raíz), `packages/db|domain|domain-custom|infrastructure|design-system|theming|ui|config/`.
- **Schema:** `packages/db/schema.prisma`, `packages/db/prisma/migrations/20260913024831_organizacion_sucursal_plan_suscripcion/`, `packages/db/prisma/seed.ts`, `packages/db/prisma7.config.ts` (carga `.env` de la raíz explícitamente).
- **App:** `apps/web-admin/lib/prisma.ts`, `apps/web-admin/app/api/checkin/route.ts`.
- **Despliegue:** `Dockerfile` (producción, Easypanel), `packages/db/Dockerfile.migrate` (temporal, para correr migraciones desde un servidor con red hacia la DB — ya no se necesita, se puede borrar).
- **Documentación:** `docs/adr/ADR-001-gym-app-sesion.md` (v1), `docs/adr/ADR-001-gym-app-sesion-v2.md`, `docs/adr/handoff.md`, `docs/superpowers/plans/*.md` (2 planes).
- **Eliminados:** `AGENTS.md`, el modelo `Gym` completo, la migración `20260908121026_init` (obsoleta).

## Intentos fallidos / desvíos resueltos (los más relevantes)
- Este sandbox no tiene salida TCP hacia la base de datos (solo HTTPS vía proxy) — todas las operaciones que tocan la DB real (`migrate dev`, `db seed`, pruebas del endpoint) las corrió el usuario en su máquina local, no yo.
- `Dockerfile` de producción quedó desactualizado tras renombrar `packages/database` → `packages/db` (Easypanel lo detectó al reconstruir automático) — corregido.
- `packages/db/Dockerfile.migrate` usaba `--skip-seed`, flag que no existe en Prisma 7.10 (`migrate reset` solo tiene `-f/--force`) — corregido con `|| true` para tolerar el auto-seed fallido contra una base aún sin tablas.
- La migración vieja (`20260908121026_init`, modelo `Gym`) seguía en el repo tras moverla con `git mv` en vez de borrarla — causó que el primer `migrate dev` del usuario la reaplicara y confundiera el diff. Se eliminó.
- `apps/web-admin/lib/prisma.ts` no cargaba `.env` de la raíz del monorepo (Next.js solo carga `.env` de su propia carpeta) — causaba `ECONNREFUSED` al correr `next dev` fuera de Turborepo. Corregido con `dotenv.config()` explícito apuntando a la raíz.

## Próximos pasos
1. **Borrar `packages/db/Dockerfile.migrate`** (o dejarlo, es inofensivo) — ya cumplió su propósito.
2. **Plan de dominio hexagonal** (explícitamente diferido en el Plan 2): `ValidarAccesoSucursalPorPlan` como caso de uso real, redefinir `estadoAlMomento` en función de `Suscripcion` en vez de `Miembro.fechaVencimiento`, `IKioskAuthValidator` (el `sucursalId` sigue viajando sin firmar en el body — hallazgo 🔴 crítico del ADR v1 §3.1, aún no cerrado), y los adaptadores en `packages/infrastructure` (hoy vacío).
3. **Integración real de la API BCV** (`BcvApiAdapter`, `apps/worker`, `ActualizarTasaDiaria`) — la tabla `TasaCambio` existe pero nada la llena todavía. Proveedor aprobado: API no oficial tipo pydolarve/dolarapi (sin URL concreta fijada aún).
4. **Login del panel admin** — `bcryptjs` está en las dependencias correctas de `packages/db`, pero no existe ninguna ruta de login en `apps/web-admin` todavía.
5. Enforcement de que `GERENTE` no pueda crear `UsuarioAdmin` de rol `RECEPCION` (regla de autorización aprobada, sin implementar — depende del plan de dominio hexagonal).
