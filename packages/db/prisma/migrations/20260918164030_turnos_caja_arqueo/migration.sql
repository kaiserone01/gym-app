/*
  Warnings:

  - You are about to drop the `CierreCaja` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `registradoPorId` to the `Pago` table without a default value. This is not possible if the table is not empty.
  - Added the required column `sucursalId` to the `Pago` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "EstadoTurno" AS ENUM ('ABIERTO', 'CERRADO');

-- CreateEnum
CREATE TYPE "MonedaEgreso" AS ENUM ('USD', 'BS');

-- DropForeignKey
ALTER TABLE "CierreCaja" DROP CONSTRAINT "CierreCaja_organizacionId_fkey";

-- AlterTable
ALTER TABLE "Pago" ADD COLUMN     "anuladoEn" TIMESTAMP(3),
ADD COLUMN     "anuladoPorId" TEXT,
ADD COLUMN     "motivoAnulacion" TEXT,
ADD COLUMN     "registradoPorId" TEXT NOT NULL,
ADD COLUMN     "sucursalId" TEXT NOT NULL,
ADD COLUMN     "turnoId" TEXT;

-- DropTable
DROP TABLE "CierreCaja";

-- CreateTable
CREATE TABLE "Turno" (
    "id" TEXT NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "fondoInicialUSD" DECIMAL(10,2) NOT NULL,
    "fondoInicialBs" DECIMAL(14,2) NOT NULL,
    "abiertoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cerradoEn" TIMESTAMP(3),
    "estado" "EstadoTurno" NOT NULL DEFAULT 'ABIERTO',

    CONSTRAINT "Turno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Egreso" (
    "id" TEXT NOT NULL,
    "turnoId" TEXT NOT NULL,
    "monto" DECIMAL(14,2) NOT NULL,
    "moneda" "MonedaEgreso" NOT NULL,
    "metodo" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "registradoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Egreso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArqueoLinea" (
    "id" TEXT NOT NULL,
    "turnoId" TEXT NOT NULL,
    "metodo" TEXT NOT NULL,
    "montoEsperado" DECIMAL(14,2) NOT NULL,
    "montoContado" DECIMAL(14,2) NOT NULL,
    "diferencia" DECIMAL(14,2) NOT NULL,
    "nota" TEXT,

    CONSTRAINT "ArqueoLinea_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Turno_sucursalId_estado_idx" ON "Turno"("sucursalId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "ArqueoLinea_turnoId_metodo_key" ON "ArqueoLinea"("turnoId", "metodo");

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_turnoId_fkey" FOREIGN KEY ("turnoId") REFERENCES "Turno"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "UsuarioAdmin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_anuladoPorId_fkey" FOREIGN KEY ("anuladoPorId") REFERENCES "UsuarioAdmin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Turno" ADD CONSTRAINT "Turno_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Turno" ADD CONSTRAINT "Turno_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Turno" ADD CONSTRAINT "Turno_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "UsuarioAdmin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Egreso" ADD CONSTRAINT "Egreso_turnoId_fkey" FOREIGN KEY ("turnoId") REFERENCES "Turno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArqueoLinea" ADD CONSTRAINT "ArqueoLinea_turnoId_fkey" FOREIGN KEY ("turnoId") REFERENCES "Turno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
