-- AlterEnum
ALTER TYPE "ModuloPermiso" ADD VALUE 'EN_SALA';

-- AlterTable
ALTER TABLE "CheckIn" ADD COLUMN     "salidaAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "CheckIn_sucursalId_fechaHora_idx" ON "CheckIn"("sucursalId", "fechaHora");
