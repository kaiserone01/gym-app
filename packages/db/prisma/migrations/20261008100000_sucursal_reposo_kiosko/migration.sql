-- AlterTable
ALTER TABLE "Sucursal" ADD COLUMN     "reposoFrases" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "reposoImagenUrl" TEXT,
ADD COLUMN     "reposoOpacidad" INTEGER NOT NULL DEFAULT 100;
