-- DropForeignKey
ALTER TABLE "Miembro" DROP CONSTRAINT "Miembro_entrenadorId_fkey";

-- DropForeignKey
ALTER TABLE "Miembro" DROP CONSTRAINT "Miembro_planId_fkey";

-- DropForeignKey
ALTER TABLE "Miembro" DROP CONSTRAINT "Miembro_sucursalId_fkey";

-- AlterTable
ALTER TABLE "Sesion" ADD COLUMN     "sucursalActivaId" TEXT;

-- AddForeignKey
ALTER TABLE "Miembro" ADD CONSTRAINT "Miembro_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Miembro" ADD CONSTRAINT "Miembro_entrenadorId_fkey" FOREIGN KEY ("entrenadorId") REFERENCES "UsuarioAdmin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Miembro" ADD CONSTRAINT "Miembro_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sesion" ADD CONSTRAINT "Sesion_sucursalActivaId_fkey" FOREIGN KEY ("sucursalActivaId") REFERENCES "Sucursal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
