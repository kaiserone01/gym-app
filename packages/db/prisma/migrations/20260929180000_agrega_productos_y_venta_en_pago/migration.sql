-- DropForeignKey
ALTER TABLE "Pago" DROP CONSTRAINT "Pago_miembroId_fkey";

-- AlterTable
ALTER TABLE "Pago" ALTER COLUMN "miembroId" DROP NOT NULL,
ADD COLUMN     "cantidad" INTEGER,
ADD COLUMN     "productoId" TEXT,
ADD COLUMN     "productoNombre" TEXT;

-- CreateTable
CREATE TABLE "Producto" (
    "id" TEXT NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "costoUSD" DECIMAL(10,2) NOT NULL,
    "fotoUrl" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Producto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Producto_organizacionId_idx" ON "Producto"("organizacionId");

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_miembroId_fkey" FOREIGN KEY ("miembroId") REFERENCES "Miembro"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Producto" ADD CONSTRAINT "Producto_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
