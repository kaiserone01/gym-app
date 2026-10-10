-- AlterTable
ALTER TABLE "Miembro" ADD COLUMN     "vieneDelExcel" BOOLEAN NOT NULL DEFAULT false;

-- Relleno inicial: miembros que vienen del Excel (sin fecha de inscripción, por regularizar o presentes en el padrón)
UPDATE "Miembro" SET "vieneDelExcel" = true
WHERE "fechaInscripcion" IS NULL
   OR "porRegularizar" = true
   OR EXISTS (SELECT 1 FROM "MiembroReferencia" r WHERE r."organizacionId" = "Miembro"."organizacionId" AND r."cedula" = "Miembro"."cedula");
