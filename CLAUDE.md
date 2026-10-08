# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# WORKING RULES & WORKFLOW GUIDELINES

## 1. CODE REUSE & LEAN IMPLEMENTATION (NON-NEGOTIABLE)
- **Check Before Creating:** Before writing any new utility, helper, component, or logic, inspect the existing codebase to ensure identical or similar functionality does not already exist. Reuse or refactor existing code whenever possible.
- **Zero Redundancy:** Do NOT duplicate functions, types, schemas, or styles.
- **Minimal Changes:** Write only the strictly necessary code to achieve the stated goal. Avoid speculative generalizations, unnecessary abstractions, premature optimizations, or boilerplate bloat.

## 2. MCP TOOLS USAGE RESTRICTIONS
- **Avoid Chrome DevTools MCP:** Do NOT launch, invoke, or connect to the Chrome DevTools MCP server unless explicitly requested by the user. Prioritize terminal inspection, static analysis, linting, logs, and unit tests.

## 3. CRITICAL GIT COMMIT RULES (NON-NEGOTIABLE)
- **NO SIGNATURES:** You are STRICTLY PROHIBITED from signing commits. NEVER append "Co-Authored-By", "Claude-Session", or any other AI-related metadata/trailers to the commit message.
- **SPANISH ONLY:** All commit messages must be written exclusively in Spanish (Español). Never use English or any other language for commit messages.
- **SUMMARY ONLY:** Provide ONLY a single-line commit summary (subject). NEVER include a commit description body or any blank lines below the summary.

## 4. SESSION CLOSING & HANDOFF PROTOCOL
Before closing or finishing a work session, generate or update a file named `handoff.md` in the root of the project. Keep it strictly factual, concise, and structured into exactly these 5 sections:

1. **Objetivo:** Qué estamos construyendo (1 o 2 líneas).
2. **Estado actual:** Qué funciona ya y qué queda pendiente.
3. **Archivos y cambios:** Qué archivos se modificaron o crearon en esta sesión y qué se hizo en cada uno.
4. **Intentos fallidos:** Enfoques, librerías o soluciones que se intentaron y NO funcionaron (NUNCA elimines entradas previas de esta sección; solo agrega nuevos aprendizajes para evitar loops).
5. **Próximos pasos:** Lista ordenada de las acciones exactas que debe tomar la siguiente sesión.

# COMMANDS

This is a Turborepo monorepo (npm workspaces: `apps/*`, `packages/*`, package manager `npm@10.9.7`).

## Root-level (turbo, runs across all workspaces)
```
npm run dev     # turbo run dev (web-admin on :3000, kiosk on :3001)
npm run build   # turbo run build
npm run lint    # turbo run lint
npm run start   # starts apps/web-admin only
```

## Per-workspace
- `apps/web-admin` — Next.js admin panel. `dev` / `build` / `start` / `lint`.
- `apps/kiosk` — Next.js check-in kiosk. `dev -p 3001` / `build` / `start` / `lint`.
- `apps/worker` — plain TS worker, no Next.js. Only script: `actualizar-tasa` (`tsx src/actualizar-tasa.ts`).
- `packages/db` — Prisma layer. Scripts (run with `npm run <script> --workspace packages/db`):
  - `generate` (prisma generate), `migrate:dev` (prisma migrate dev), `db:seed`
  - `db:limpiar-miembros`, `db:sembrar-prueba`, `db:quitar-permisos-entrenadores` — standalone maintenance scripts run via `tsx`
  - `db:importar-padron` (dry-run) / `db:importar-padron:confirm` (writes) — imports the Excel padrón into `MiembroReferencia` (see below)
  - `test` — `vitest run`
- `packages/domain` — pure business logic, also has `test` (`vitest run`).

## Testing
Vitest (v5), no `vitest.config.ts` — defaults, tests co-located as `*.test.ts` next to source (e.g. `packages/domain/entities/Pago.test.ts`).
```
npm test --workspace packages/domain
npm test --workspace packages/db
npx vitest run path/to/file.test.ts --workspace packages/domain   # single file
```
No root-level aggregate test script — run per workspace.

# ARCHITECTURE

## Hexagonal domain split
- `packages/domain` — pure, framework-free business logic: `entities/`, `use-cases/`, `ports/`, `services/`, `utils/`. This is where core rules live (e.g. `Pago`, `cambioPlanCalculo`, `CambiarPlanConPago`) and where unit tests belong.
- `packages/infrastructure` — implements the ports defined in `domain`: `auth/` (`BcryptPasswordHasher`, `KioskTokenValidator`), `exchange-rate/`, `persistence/prisma/`, `storage/`.
- `packages/domain-custom` — reserved for tenant-specific overrides (currently empty).
- New business logic should default to `packages/domain` (pure, tested) with adapters wired through `packages/infrastructure`, not directly inside the Next.js apps.

## Database (Prisma 7, `packages/db`)
- Schema: `packages/db/prisma/schema.prisma`, provider Postgres, uses the `@prisma/adapter-pg` driver-adapter pattern (`new PrismaPg({ connectionString })` passed into `new PrismaClient({ adapter })`), client generated to `../generated/prisma`.
- Multi-tenant model: `Organizacion` → `Sucursal` → `Miembro` / `Plan` / `Pago` / `Suscripcion` / `Turno` / `CheckIn` / `UsuarioAdmin`, role enum `RolUsuario` (SOCIO/GERENTE/RECEPCION/ENTRENADOR).
- Kiosk auth uses a per-`Sucursal` API key (`X-Kiosk-Api-Key` header), never a raw sucursal id.
- Migrations are dated and named in Spanish under `packages/db/prisma/migrations/`.
- One-off/maintenance scripts live flat in `packages/db/` (not in subfolders) and share the same boilerplate: `dotenv.config({ path: path.resolve(__dirname, "../../.env") })` + Prisma adapter setup, run via `tsx`.

## Padrón Excel y activación bajo demanda
Spec/plan: `docs/superpowers/specs/2026-10-08-padron-excel-activacion-bajo-demanda-design.md` (reemplaza la migración masiva del 2026-09-28, ya retirada).
- `MiembroReferencia` (Prisma) es el padrón: espeja el Excel (`DATA ADRENALINA_*.xlsm`) ligado a la Sede Principal. Solo filas con cédula única y con al menos un dígito; sin cédula o repetida se excluye. Nunca toca `Miembro`.
- `packages/db/importarPadronExcel.ts` (`db:importar-padron`, dry-run por defecto; `--confirm` escribe; `--org=` y `--sucursal=`). Reutiliza `migracion-excel/leerExcel.ts` y `normalizarFila.ts`; la normalización (plan, fechas) vive en `packages/domain/utils/padronExcel.ts`. Escribe `reporte-padron-*.json` (gitignored, contiene PII). Reimportar respeta lo editado a mano (`camposEditados`).
- `activarMiembroPorCedula` (`packages/domain`) crea `Miembro` + `Suscripcion` (sin `Pago`) desde el padrón, con `porRegularizar = true`. Se invoca desde el check-in del kiosco (`registrarCheckIn`, dependencia opcional; kiosco solo dígitos) y desde "Activar desde Excel" en `/miembros` (acepta cédulas alfanuméricas). Solo si la sucursal coincide con la del padrón.
- Menú "Excel" en web-admin: consulta del padrón con filtros por cédula y edición de filas de quien aún no es `Miembro` (`MIEMBROS`/`VER` para ver, `MIEMBROS`/`EDITAR` para editar).
- `Miembro.porRegularizar` reemplazó a `ajustarFecha` (aviso único "Por regularizar"; se apaga al ajustar la fecha o registrar un pago).
- Migraciones pendientes de aplicar en producción: se aplican al arrancar el contenedor tras el deploy; nunca correr `prisma migrate` contra el `.env` local (apunta a producción).

## Next.js apps
- `apps/web-admin/app` — App Router with a `(panel)` route group: `caja`, `cambiar-password`, `configuraciones`, `en-sala`, `miembros`, `pagos`, `planes`, `sucursales`, `usuarios`; plus `app/login` and API route handlers under `app/api/{auth,caja,checkin,miembros,pagos,planes,tasa-cambio,usuarios}`.
- `apps/kiosk` — separate app for member check-in, authenticates via the `Sucursal` API key described above.

## Planning convention
Feature work is generally preceded by a dated plan + design doc under `docs/superpowers/plans/` and `docs/superpowers/specs/` (Spanish filenames), and major architectural decisions are recorded as ADRs under `docs/adr/`. Check these before starting non-trivial features to see if a plan already exists.

## Notes / things to verify if relevant to your task
- No `.env.example` is committed — required environment variables aren't self-documented; grep source for `process.env.` usage if you need the full list.
- There is a stray `app/generated` directory at the repo root (outside `apps/`) — verify whether it's intentional (e.g. leftover Prisma/Next scaffold output) before assuming it's dead code.
- `README.md` is unedited `create-next-app` boilerplate and does not reflect this architecture — do not rely on it.
