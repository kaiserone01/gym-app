-- AlterTable
ALTER TABLE "MiembroReferencia" ADD COLUMN     "colI" TEXT,
ADD COLUMN     "colJ" TEXT,
ADD COLUMN     "colK" TEXT,
ADD COLUMN     "estilos" JSONB,
ADD COLUMN     "resaltado" TEXT,
ADD COLUMN     "resaltadoEditado" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PadronHoja" (
    "id" TEXT NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "encabezados" JSONB NOT NULL,
    "alturaEncabezadoPx" DOUBLE PRECISION NOT NULL,
    "archivoOrigen" TEXT NOT NULL,
    "importadoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PadronHoja_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PadronHoja_organizacionId_sucursalId_key" ON "PadronHoja"("organizacionId", "sucursalId");

-- AddForeignKey
ALTER TABLE "PadronHoja" ADD CONSTRAINT "PadronHoja_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PadronHoja" ADD CONSTRAINT "PadronHoja_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

