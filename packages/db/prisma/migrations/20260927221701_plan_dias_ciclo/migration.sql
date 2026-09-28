-- AlterTable
-- Frecuencias genéricas: diasCiclo pasa a ser la única fuente de verdad de
-- la duración de un ciclo de Plan (reemplaza al mapa hardcodeado
-- DURACION_DIAS_POR_FRECUENCIA en el dominio, eliminado en este mismo
-- cambio). Se agrega nullable primero para poder backfillear sin violar
-- NOT NULL, y se cierra con SET NOT NULL al final de esta misma migración
-- (misma transacción): si el UPDATE de abajo dejara alguna fila sin
-- backfillear (ej. una frecuencia nueva agregada al enum sin actualizar
-- este CASE), el SET NOT NULL falla y la migración entera revierte — el
-- deploy no arranca con datos incompletos, en vez de fallar en silencio.
ALTER TABLE "Plan" ADD COLUMN "diasCiclo" INTEGER;

-- Sin ELSE a propósito: 'PERSONALIZADO' no tiene mapeo fijo (no existen
-- planes con esa frecuencia todavía — recién se agrega en la migración
-- anterior), y cualquier otro valor de frecuencia no contemplado acá debe
-- abortar el UPDATE con un error explícito ("case not found") en vez de
-- dejar la fila en NULL en silencio — mismo criterio de "fallar ruidoso"
-- que el SET NOT NULL de abajo.
UPDATE "Plan" SET "diasCiclo" = CASE "frecuencia"
  WHEN 'DIARIO' THEN 1
  WHEN 'SEMANAL' THEN 7
  WHEN 'QUINCENAL' THEN 15
  WHEN 'MENSUAL' THEN 30
  WHEN 'SEMESTRAL' THEN 180
  WHEN 'ANUAL' THEN 365
END;

ALTER TABLE "Plan" ALTER COLUMN "diasCiclo" SET NOT NULL;
