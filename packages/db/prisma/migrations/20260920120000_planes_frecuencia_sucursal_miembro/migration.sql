-- Rediseño de Plan: deja de estar anclado a sucursal (tipoAcceso,
-- PlanSucursalAcceso) y pasa a tipificarse por frecuencia de pago
-- (SEMANAL|QUINCENAL|MENSUAL) + incluyeEntrenador. El Miembro pasa a
-- tener una sucursal asignada (Miembro.sucursalId, determina dónde puede
-- hacer check-in) y un plan vigente (Miembro.planId), reemplazando el
-- campo Miembro.planTipo.

-- ── 1. Nuevo enum de frecuencia ──────────────────────────────────────────
CREATE TYPE "FrecuenciaPago" AS ENUM ('SEMANAL', 'QUINCENAL', 'MENSUAL');

-- ── 2. Plan: agregar columnas nuevas (nullable primero, para poder poblar) ─
ALTER TABLE "Plan" ADD COLUMN "frecuencia" "FrecuenciaPago";
ALTER TABLE "Plan" ADD COLUMN "incluyeEntrenador" BOOLEAN NOT NULL DEFAULT false;

-- Mapeo por nombre de los planes existentes (acordado con el negocio):
UPDATE "Plan" SET "frecuencia" = 'SEMANAL', "incluyeEntrenador" = false WHERE "nombre" = 'Semanal';
UPDATE "Plan" SET "frecuencia" = 'MENSUAL', "incluyeEntrenador" = false WHERE "nombre" = 'Corporativo';
UPDATE "Plan" SET "frecuencia" = 'MENSUAL', "incluyeEntrenador" = false WHERE "nombre" = 'Mensual sin entrenador';
UPDATE "Plan" SET "frecuencia" = 'MENSUAL', "incluyeEntrenador" = true WHERE "nombre" = 'Mensual con entrenador';
UPDATE "Plan" SET "frecuencia" = 'MENSUAL', "incluyeEntrenador" = false WHERE "nombre" = 'VIP Multi-sede';
-- Cualquier otro Plan no cubierto por el mapeo anterior: default MENSUAL sin entrenador.
UPDATE "Plan" SET "frecuencia" = 'MENSUAL' WHERE "frecuencia" IS NULL;

ALTER TABLE "Plan" ALTER COLUMN "frecuencia" SET NOT NULL;

-- ── 3. Drop de tipoAcceso / PlanSucursalAcceso (ya no aplica) ────────────
ALTER TABLE "Plan" DROP COLUMN "tipoAcceso";
DROP TABLE "PlanSucursalAcceso";
DROP TYPE "TipoAccesoPlan";

-- ── 4. Miembro: agregar planId (nullable, sin dato histórico confiable) ──
ALTER TABLE "Miembro" ADD COLUMN "planId" TEXT;
ALTER TABLE "Miembro" ADD CONSTRAINT "Miembro_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id");

-- Backfill best-effort: el plan vigente es el de la Suscripción ACTIVA
-- más reciente de cada miembro (si tiene una).
UPDATE "Miembro" m
SET "planId" = s."planId"
FROM (
  SELECT DISTINCT ON ("miembroId") "miembroId", "planId"
  FROM "Suscripcion"
  WHERE "estado" = 'ACTIVA'
  ORDER BY "miembroId", "createdAt" DESC
) s
WHERE m."id" = s."miembroId";

-- ── 5. Miembro: agregar sucursalId (obligatoria) ─────────────────────────
ALTER TABLE "Miembro" ADD COLUMN "sucursalId" TEXT;

-- Backfill: la sucursal "Sede Principal" de la organización del miembro;
-- si no existe una con ese nombre exacto, la sucursal más antigua
-- (createdAt más bajo) de esa organización.
UPDATE "Miembro" m
SET "sucursalId" = COALESCE(
  (SELECT "id" FROM "Sucursal" WHERE "organizacionId" = m."organizacionId" AND "nombre" = 'Sede Principal' LIMIT 1),
  (SELECT "id" FROM "Sucursal" WHERE "organizacionId" = m."organizacionId" ORDER BY "createdAt" ASC LIMIT 1)
);

ALTER TABLE "Miembro" ALTER COLUMN "sucursalId" SET NOT NULL;
ALTER TABLE "Miembro" ADD CONSTRAINT "Miembro_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id");

-- ── 6. Miembro: drop de planTipo (con/sin entrenador ahora vive en Plan) ─
ALTER TABLE "Miembro" DROP COLUMN "planTipo";
DROP TYPE "PlanTipo";
