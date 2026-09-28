-- AlterEnum
-- IF NOT EXISTS a propósito, mismo patrón que la migración de DIARIO
-- (20260924000000_frecuencia_diario): si alguien ya corrió esto a mano
-- contra la base, no debe fallar al aplicarse después.
--
-- Estos 3 valores no pueden USARSE (en un UPDATE/WHERE, etc.) en la misma
-- transacción que los crea — Postgres no lo permite. Por eso viven en su
-- propia migración, separada de la que agrega y backfillea Plan.diasCiclo
-- (ver 20260927221701_plan_dias_ciclo/migration.sql).
ALTER TYPE "FrecuenciaPago" ADD VALUE IF NOT EXISTS 'SEMESTRAL';
ALTER TYPE "FrecuenciaPago" ADD VALUE IF NOT EXISTS 'ANUAL';
ALTER TYPE "FrecuenciaPago" ADD VALUE IF NOT EXISTS 'PERSONALIZADO';
