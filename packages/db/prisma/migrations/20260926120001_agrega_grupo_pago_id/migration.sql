-- AlterTable
ALTER TABLE "Pago" ADD COLUMN "grupoPagoId" TEXT;

-- CreateIndex
CREATE INDEX "Pago_grupoPagoId_idx" ON "Pago"("grupoPagoId");
