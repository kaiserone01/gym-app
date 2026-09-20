-- Pago.fechaInicioCiclo / Pago.fechaFinCiclo

ALTER TABLE "Pago" ADD COLUMN "fechaInicioCiclo" TIMESTAMP(3);
ALTER TABLE "Pago" ADD COLUMN "fechaFinCiclo" TIMESTAMP(3);
