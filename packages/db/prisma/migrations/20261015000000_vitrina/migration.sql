-- CreateEnum
CREATE TYPE "TipoVitrinaItem" AS ENUM ('ENTRENADOR', 'PROMO', 'PRODUCTO');

-- CreateEnum
CREATE TYPE "TipoMedioVitrina" AS ENUM ('IMAGEN', 'VIDEO');

-- AlterTable
ALTER TABLE "Sucursal" ADD COLUMN     "vitrinaDuracionSeg" INTEGER NOT NULL DEFAULT 12,
ADD COLUMN     "vitrinaTransicion" TEXT NOT NULL DEFAULT 'FUNDIDO',
ADD COLUMN     "vitrinaVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "VitrinaItem" (
    "id" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "tipo" "TipoVitrinaItem" NOT NULL,
    "orden" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT false,
    "duracionSeg" INTEGER,
    "inicio" TIMESTAMP(3),
    "fin" TIMESTAMP(3),
    "mediaUrl" TEXT NOT NULL,
    "mediaTipo" "TipoMedioVitrina" NOT NULL,
    "posterUrl" TEXT,
    "precioUSD" DECIMAL(10,2),
    "ofertaUSD" DECIMAL(10,2),
    "descuentoPct" INTEGER,
    "etiqueta" TEXT,
    "mostrarPrecio" BOOLEAN NOT NULL DEFAULT true,
    "mostrarOferta" BOOLEAN NOT NULL DEFAULT true,
    "mostrarDescuento" BOOLEAN NOT NULL DEFAULT true,
    "mostrarEtiqueta" BOOLEAN NOT NULL DEFAULT true,
    "mostrarEquivalenteBs" BOOLEAN NOT NULL DEFAULT true,
    "nombre" TEXT,
    "especialidad" TEXT,
    "frase" TEXT,
    "mostrarMedio" BOOLEAN NOT NULL DEFAULT true,
    "mostrarNombre" BOOLEAN NOT NULL DEFAULT true,
    "mostrarEspecialidad" BOOLEAN NOT NULL DEFAULT true,
    "mostrarFrase" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VitrinaItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VitrinaItem_sucursalId_orden_idx" ON "VitrinaItem"("sucursalId", "orden");

-- AddForeignKey
ALTER TABLE "VitrinaItem" ADD CONSTRAINT "VitrinaItem_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

