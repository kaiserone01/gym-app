-- AlterTable
ALTER TABLE "Pago" ADD COLUMN     "numeroOperacion" TEXT;

-- CreateTable
CREATE TABLE "CierreCaja" (
    "id" TEXT NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "totalUSD" DECIMAL(10,2) NOT NULL,
    "desglose" JSONB NOT NULL,
    "cerradoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CierreCaja_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CierreCaja_organizacionId_fecha_key" ON "CierreCaja"("organizacionId", "fecha");

-- AddForeignKey
ALTER TABLE "CierreCaja" ADD CONSTRAINT "CierreCaja_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
