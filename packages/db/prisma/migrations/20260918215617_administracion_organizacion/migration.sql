-- CreateEnum
CREATE TYPE "ModuloPermiso" AS ENUM ('MIEMBROS', 'PAGOS', 'PLANES', 'CAJA', 'USUARIOS', 'SUCURSALES');

-- CreateEnum
CREATE TYPE "AccionPermiso" AS ENUM ('VER', 'CREAR', 'EDITAR', 'ELIMINAR');

-- AlterTable
ALTER TABLE "Sucursal" ADD COLUMN     "activo" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "UsuarioAdmin" ADD COLUMN     "activo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "nombre" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "PermisoUsuario" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "modulo" "ModuloPermiso" NOT NULL,
    "accion" "AccionPermiso" NOT NULL,

    CONSTRAINT "PermisoUsuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsuarioSucursal" (
    "usuarioId" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,

    CONSTRAINT "UsuarioSucursal_pkey" PRIMARY KEY ("usuarioId","sucursalId")
);

-- CreateIndex
CREATE UNIQUE INDEX "PermisoUsuario_usuarioId_modulo_accion_key" ON "PermisoUsuario"("usuarioId", "modulo", "accion");

-- AddForeignKey
ALTER TABLE "PermisoUsuario" ADD CONSTRAINT "PermisoUsuario_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "UsuarioAdmin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsuarioSucursal" ADD CONSTRAINT "UsuarioSucursal_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "UsuarioAdmin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsuarioSucursal" ADD CONSTRAINT "UsuarioSucursal_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
