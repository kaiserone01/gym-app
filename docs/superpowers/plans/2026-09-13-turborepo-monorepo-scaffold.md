# Turborepo Monorepo Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the single-app `gym-app` Next.js repo into a Turborepo monorepo (`apps/web-admin` + shared `packages/*`) without changing any runtime behavior, as the first step toward the SaaS multi-tenant redesign (Organización → Sucursal → Miembro) — with zero touches to `prisma/schema.prisma` and zero migrations.

**Architecture:** `npm` workspaces (`apps/*`, `packages/*`) orchestrated by Turborepo. The existing app moves into `apps/web-admin` byte-for-byte; a `packages/database` package will later own `schema.prisma` (not touched in this plan — see Task 7 gate). No new runtime code, no new dependencies beyond `turbo`.

**Tech Stack:** Next.js 16.3.4, Prisma 7 (`@prisma/adapter-pg`), TypeScript 5, npm workspaces, Turborepo.

**Spec:** `docs/adr/ADR-001-gym-app-sesion-v2.md` (sections 14–16) and `docs/adr/handoff.md`. This plan implements Paso 0–6 of ADR section 15; Task 7 below is the ADR's Paso 7 approval gate, kept as a gate (no schema code) per the ADR's explicit instruction that nothing in section 13 is implemented without user sign-off.

## Global Constraints

- No migration, no `schema.prisma` edit, no `prisma migrate` / `prisma generate` run in this plan (ADR section 15, closing line: "Ningún paso de esta lista toca `schema.prisma` ni ejecuta migraciones").
- `npm run build` must produce byte-identical behavior before and after the move (ADR section 15, step 6).
- Package manager stays `npm` (no switch to pnpm/yarn) — the repo currently has `package-lock.json` only.
- `AGENTS.md` is removed as part of this plan (ADR section 15, step 4) — it documents a `next dev`-managed file that no longer applies once `next dev` runs from `apps/web-admin`, not the repo root.

---

## Pre-flight Verification (already done — do not repeat)

Confirmed against the real repo before writing this plan (closes ADR section 12's "no repo access" gap and executes ADR section 15's Paso 0):

- `prisma/schema.prisma` still has the single-tenant `Gym` model (no `Organizacion`/`Sucursal` — matches ADR's assumption that no migration happened).
- `app/api/checkin/route.ts` confirmed to have **no idempotency check**: a duplicate `POST` creates a duplicate `CheckIn` row (ADR section 3.1 finding, still present, still deferred — not fixed in this plan).
- Root `package.json` has no `workspaces` field yet; no `turbo.json` exists.
- Path alias is `"@/*": ["./*"]` in `tsconfig.json` — this must keep resolving after the move (Task 3 handles it).
- Prisma client output path is `../app/generated/prisma` (relative to `prisma/schema.prisma`) — this must keep pointing inside `apps/web-admin/app/generated/prisma` after the move (Task 3 handles it).

## Assumption flagged for confirmation

ADR section 15 step 5 references "la topología ya definida en la v1 (sección 5)" for empty scaffold folders, but only the v2 diff was provided to this session — v1's section 5 content is not available here. Task 5 below creates a **minimal, reversible** topology (`packages/database`, `packages/domain`, `packages/ui`) inferred from the ADR's own architecture references (hexagonal domain, shared Prisma package, admin panel). **Confirm this matches the v1 topology before Task 5, or provide the v1 section 5 list to replace it.**

---

### Task 1: Add Turborepo tooling

**Files:**
- Modify: `package.json` (root)
- Create: `turbo.json`

**Interfaces:**
- Produces: `turbo` CLI available via `npx turbo`; `build`/`dev`/`lint` pipeline names that Task 6 validates.

- [ ] **Step 1: Install turbo as a root devDependency**

Run: `npm install --save-dev turbo@^2`

- [ ] **Step 2: Verify it installed**

Run: `npx turbo --version`
Expected: prints a `2.x.x` version, exit code 0.

- [ ] **Step 3: Create `turbo.json` with a minimal pipeline**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^lint"]
    }
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json turbo.json
git commit -m "chore: add turborepo tooling"
```

---

### Task 2: Convert root `package.json` into a workspace root

**Files:**
- Modify: `package.json` (root)

**Interfaces:**
- Consumes: nothing from Task 1 besides `turbo` already being a devDependency.
- Produces: `workspaces: ["apps/*", "packages/*"]` field that Task 3 relies on (moving the app into `apps/web-admin` only works as an npm workspace member if this field exists first).

- [ ] **Step 1: Add the `workspaces` field and turbo-delegated scripts**

Replace the root `package.json` `scripts` and add `workspaces`, keeping `name`/`version`/`private` and dependencies as-is for now (Task 3 will strip app-only dependencies out once the code has moved):

```json
{
  "name": "gym-app",
  "version": "0.1.0",
  "private": true,
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "lint": "turbo run lint",
    "start": "npm run start --workspace apps/web-admin"
  },
  "devDependencies": {
    "turbo": "^2.5.0"
  }
}
```

(The exact `turbo` version pinned here must match what `npm install` resolved in Task 1 Step 1 — check `package-lock.json` and use that version string instead of `^2.5.0` if it differs.)

- [ ] **Step 2: Verify npm still resolves the workspace root**

Run: `npm install`
Expected: exits 0, no `workspaces` warning, no dependency errors (there are no `apps/*`/`packages/*` directories yet, which is fine — npm treats a workspaces glob with zero current matches as valid).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: convert root package.json into npm workspace root"
```

---

### Task 3: Move the existing app into `apps/web-admin`

**Files:**
- Create: `apps/web-admin/package.json` (new — see Step 2)
- Move: `app/` → `apps/web-admin/app/`
- Move: `lib/` → `apps/web-admin/lib/`
- Move: `prisma/` → `apps/web-admin/prisma/`
- Move: `public/` → `apps/web-admin/public/`
- Move: `next.config.ts` → `apps/web-admin/next.config.ts`
- Move: `next-env.d.ts` → `apps/web-admin/next-env.d.ts` (if present after a build ran; safe to skip if the file doesn't exist yet — it's gitignored)
- Move: `eslint.config.mjs` → `apps/web-admin/eslint.config.mjs`
- Move: `postcss.config.mjs` → `apps/web-admin/postcss.config.mjs`
- Move: `tsconfig.json` → `apps/web-admin/tsconfig.json`
- Move: `prisma7.config.ts` → `apps/web-admin/prisma7.config.ts`
- Modify: `package.json` (root) — remove app-only dependencies now owned by `apps/web-admin/package.json`

**Interfaces:**
- Consumes: `workspaces` field from Task 2.
- Produces: `apps/web-admin` as an npm workspace member that Task 6's `turbo run build` targets.

- [ ] **Step 1: Move directories and top-level app files with `git mv` (preserves history)**

```bash
mkdir -p apps/web-admin
git mv app apps/web-admin/app
git mv lib apps/web-admin/lib
git mv prisma apps/web-admin/prisma
git mv public apps/web-admin/public
git mv next.config.ts apps/web-admin/next.config.ts
git mv eslint.config.mjs apps/web-admin/eslint.config.mjs
git mv postcss.config.mjs apps/web-admin/postcss.config.mjs
git mv tsconfig.json apps/web-admin/tsconfig.json
git mv prisma7.config.ts apps/web-admin/prisma7.config.ts
```

- [ ] **Step 2: Create `apps/web-admin/package.json` carrying the app-only scripts and dependencies moved out of root**

```json
{
  "name": "web-admin",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint"
  },
  "dependencies": {
    "@prisma/adapter-pg": "^7.10.0",
    "@prisma/client": "^7.10.0",
    "bcryptjs": "^3.0.3",
    "dotenv": "^17.4.2",
    "next": "16.3.4",
    "prisma": "^7.10.0",
    "react": "19.2.8",
    "react-dom": "19.2.8"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/bcryptjs": "^2.4.6",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "eslint": "^9",
    "eslint-config-next": "16.3.4",
    "tailwindcss": "^4",
    "tsx": "^4.23.13",
    "typescript": "^5"
  }
}
```

- [ ] **Step 3: Strip the now-duplicated `dependencies`/`devDependencies` out of the root `package.json`**, leaving only `name`, `version`, `private`, `workspaces`, `scripts`, and the root `devDependencies.turbo` entry from Task 1/2.

- [ ] **Step 4: Reinstall from the repo root so npm relinks the workspace**

Run: `rm -rf node_modules package-lock.json && npm install`
Expected: exits 0; `node_modules/.package-lock.json` (or `package-lock.json` workspaces block) lists `apps/web-admin`.

- [ ] **Step 5: Verify the Prisma client output path still resolves**

Open `apps/web-admin/prisma/schema.prisma`, confirm the `generator client { output = "../app/generated/prisma" }` line is unchanged (relative paths inside a moved directory tree stay correct automatically — this step is a read-only confirmation, not an edit).

Run: `cat apps/web-admin/prisma/schema.prisma | grep output`
Expected: `output   = "../app/generated/prisma"`

- [ ] **Step 6: Verify the `@/*` path alias still resolves from the new location**

Open `apps/web-admin/tsconfig.json`, confirm `"paths": { "@/*": ["./*"] }` is unchanged (it's already relative to the tsconfig's own directory, which is now `apps/web-admin`, so no edit is needed — this is a read-only confirmation).

Run: `cat apps/web-admin/tsconfig.json | grep -A2 '"paths"'`
Expected: `"@/*": ["./*"]` under `apps/web-admin`'s own `paths`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: move app into apps/web-admin workspace"
```

---

### Task 4: Remove `AGENTS.md`

**Files:**
- Delete: `AGENTS.md`
- Modify: `CLAUDE.md` (remove the `@AGENTS.md` import line, since the target no longer exists)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing consumed by later tasks — this is a standalone cleanup task from ADR section 15 step 4.

- [ ] **Step 1: Confirm what generates this file before deleting it**

Run: `cat AGENTS.md`
Expected: header states it documents a fictional "breaking changes" Next.js variant and is "written and re-added by `next dev`" from `node_modules/next/dist/server/lib/generate-agent-files.js` — confirming it's an artifact of running `next dev` from the repo root, which will no longer happen once `next dev` runs from `apps/web-admin` (Task 3).

- [ ] **Step 2: Delete the file and its reference**

```bash
git rm AGENTS.md
```

Edit `CLAUDE.md` to remove the line `@AGENTS.md`, leaving the file empty (or delete `CLAUDE.md` too if the repo's convention is "no file = no extra instructions" — keep it as an empty/placeholder file here since project docs may reference its existence).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove AGENTS.md (generated at repo root by next dev, no longer applicable)"
```

---

### Task 5: Create the empty package topology

**Files:**
- Create: `packages/database/package.json`
- Create: `packages/database/.gitkeep`
- Create: `packages/domain/package.json`
- Create: `packages/domain/.gitkeep`
- Create: `packages/ui/package.json`
- Create: `packages/ui/.gitkeep`

**Interfaces:**
- Consumes: `workspaces: ["apps/*", "packages/*"]` from Task 2.
- Produces: three empty workspace members that stay unpopulated until a future plan (post schema-approval) fills them in. No code in this task — only placeholder `package.json` files so `npm install` recognizes them as workspace members.

**⚠️ Confirm the "Assumption flagged for confirmation" note above before running this task** — this topology is inferred, not copied from the ADR's v1 section 5.

- [ ] **Step 1: Create the three package directories with minimal `package.json` files**

```bash
mkdir -p packages/database packages/domain packages/ui
```

`packages/database/package.json`:
```json
{
  "name": "@gym-app/database",
  "version": "0.0.0",
  "private": true
}
```

`packages/domain/package.json`:
```json
{
  "name": "@gym-app/domain",
  "version": "0.0.0",
  "private": true
}
```

`packages/ui/package.json`:
```json
{
  "name": "@gym-app/ui",
  "version": "0.0.0",
  "private": true
}
```

- [ ] **Step 2: Add a `.gitkeep` to each so the empty directory structure is trackable**

```bash
touch packages/database/.gitkeep packages/domain/.gitkeep packages/ui/.gitkeep
```

- [ ] **Step 3: Reinstall so npm registers the three new workspace members**

Run: `npm install`
Expected: exits 0; no errors about duplicate or invalid workspace names.

- [ ] **Step 4: Commit**

```bash
git add packages
git commit -m "chore: scaffold empty packages/database, packages/domain, packages/ui workspaces"
```

---

### Task 6: Validate the monorepo build end-to-end

**Files:**
- None created or modified — this is a verification-only task.

**Interfaces:**
- Consumes: everything from Tasks 1–5.
- Produces: a green `turbo run build` that later plans can assume works.

- [ ] **Step 1: Run the full build through Turborepo**

Run: `npx turbo run build`
Expected: exits 0; Turborepo reports `apps/web-admin` (and any packages with a `build` script — none yet) as `cache miss, executing` on first run, ending in a `Tasks: 1 successful, 1 total` (or similar) summary line.

- [ ] **Step 2: Run it a second time to confirm caching works**

Run: `npx turbo run build`
Expected: exits 0; Turborepo reports `cache hit` for `apps/web-admin#build` and completes near-instantly.

- [ ] **Step 3: Run lint through Turborepo**

Run: `npx turbo run lint`
Expected: exits 0, same ESLint output `apps/web-admin`'s own `npm run lint` produced before the move (no new warnings introduced by the path change).

- [ ] **Step 4: Diff the build output against pre-move behavior**

There is no automated pre/post snapshot available (the move happens in the same PR), so this step is a manual assertion: confirm `apps/web-admin/.next` was produced (`ls apps/web-admin/.next` exits 0) and that no build step referenced a path outside `apps/web-admin` (grep the build log for `ENOENT` or `Cannot find module` — none should appear).

- [ ] **Step 5: Commit** (only if Step 4 required a fix; otherwise this task has no diff to commit — skip committing and proceed to Task 7)

---

### Task 7: Schema approval gate (STOP — do not write code past this point)

**Files:** none — this task produces no file changes. It is a decision checkpoint, not an implementation step.

**Interfaces:** none.

This task cannot be "completed" by an executor — it can only be reported as blocked until a human answers it. Per ADR section 15 step 7 and section 16, before `packages/database/prisma/schema.prisma` is written (a future plan, not this one), the user must approve, in writing, all of:

1. The `Plan` / `Suscripcion` / `PlanSucursalAcceso` models (ADR section 13.1).
2. The `UsuarioAdmin.rol` enum `RolUsuario` (ADR section 13.2).
3. The `RegistroAuditoria` model (ADR section 13.3).
4. The check-in idempotency window rule for `RegistrarCheckIn` (ADR section 13.4) — **and** resolve whether a duplicate check-in inside the window rejects (409) or silently returns the existing row (ADR section 16, question 2).
5. The BCV rate source (ADR section 13.5 — no default; the user must pick a category or name a concrete provider).

Plus the three modeling questions from ADR section 16 that affect schema shape directly:
- Does `Entrenador` belong to a fixed `Sucursal`, or to the `Organizacion` (assigned to members, not a branch)?
- Does `TemaOrganizacion` ever need a per-`Sucursal` override, or is one brand per Organización a hard rule?
- Can role `GERENTE` create/edit `UsuarioAdmin` rows with role `RECEPCION`, or is that `DUENO`-only?

- [ ] **Step 1: Present these 8 open items to the user and get explicit answers** (this plan does not answer them — they are product decisions, not implementation details).
- [ ] **Step 2: Once answered, write a follow-up plan** (`docs/superpowers/plans/YYYY-MM-DD-schema-organizacion-sucursal.md`) covering the actual `schema.prisma` migration — out of scope for this plan.

---

## Out of scope for this plan (explicitly deferred)

- Fixing the `CheckIn` idempotency bug (`app/api/checkin/route.ts`) — depends on the Task 7 decision (reject vs. silent-return) and lives in the follow-up schema plan.
- Any `schema.prisma` edit or `prisma migrate` run.
- `bcryptjs`/admin-panel login hardening (ADR section 14, risk #5) — noted as a pre-condition for exposing `apps/web-admin` outside a trusted environment, not part of this scaffold.
- Populating `packages/database`, `packages/domain`, `packages/ui` with actual code — they are created empty in Task 5 and stay empty until the follow-up schema plan.

## Execution Handoff

Two execution options:

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
