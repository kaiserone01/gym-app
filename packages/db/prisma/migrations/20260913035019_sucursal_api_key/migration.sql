-- AlterTable: agregar como opcional primero (no se puede como NOT NULL directo, la tabla ya tiene filas)
ALTER TABLE "Sucursal" ADD COLUMN     "apiKey" TEXT;

-- Rellenar las filas existentes con un UUID generado por Postgres
UPDATE "Sucursal" SET "apiKey" = gen_random_uuid()::text WHERE "apiKey" IS NULL;

-- Ahora si, hacerla requerida
ALTER TABLE "Sucursal" ALTER COLUMN "apiKey" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Sucursal_apiKey_key" ON "Sucursal"("apiKey");