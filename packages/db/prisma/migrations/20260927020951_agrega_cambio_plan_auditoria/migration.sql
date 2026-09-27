-- CreateEnum
CREATE TYPE "ModoCambioPlanAuditoria" AS ENUM ('AJUSTAR_VENCIMIENTO', 'CICLO_COMPLETO');

-- CreateEnum
CREATE TYPE "OrigenCambioPlanAuditoria" AS ENUM ('CAJA', 'FICHA_MIEMBRO', 'CAMBIO_FRECUENCIA_PLAN');

-- CreateTable
CREATE TABLE "CambioPlanAuditoria" (
    "id" TEXT NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "miembroId" TEXT NOT NULL,
    "planAnteriorId" TEXT NOT NULL,
    "planNuevoId" TEXT NOT NULL,
    "vencimientoAnterior" DATE NOT NULL,
    "vencimientoNuevo" DATE NOT NULL,
    "diasRestantes" INTEGER NOT NULL,
    "valorNoConsumidoCentavos" INTEGER NOT NULL,
    "precioAnteriorCentavos" INTEGER NOT NULL,
    "diasCicloAnterior" INTEGER NOT NULL,
    "precioNuevoCentavos" INTEGER NOT NULL,
    "diasCicloNuevo" INTEGER NOT NULL,
    "diasNuevos" INTEGER NOT NULL,
    "montoCobradoCentavos" INTEGER NOT NULL,
    "modo" "ModoCambioPlanAuditoria" NOT NULL,
    "origen" "OrigenCambioPlanAuditoria" NOT NULL,
    "pagoId" TEXT,
    "registradoPorId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CambioPlanAuditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CambioPlanAuditoria_miembroId_idx" ON "CambioPlanAuditoria"("miembroId");

-- CreateIndex
CREATE INDEX "CambioPlanAuditoria_organizacionId_fecha_idx" ON "CambioPlanAuditoria"("organizacionId", "fecha");

-- AddForeignKey
ALTER TABLE "CambioPlanAuditoria" ADD CONSTRAINT "CambioPlanAuditoria_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CambioPlanAuditoria" ADD CONSTRAINT "CambioPlanAuditoria_miembroId_fkey" FOREIGN KEY ("miembroId") REFERENCES "Miembro"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CambioPlanAuditoria" ADD CONSTRAINT "CambioPlanAuditoria_planAnteriorId_fkey" FOREIGN KEY ("planAnteriorId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CambioPlanAuditoria" ADD CONSTRAINT "CambioPlanAuditoria_planNuevoId_fkey" FOREIGN KEY ("planNuevoId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CambioPlanAuditoria" ADD CONSTRAINT "CambioPlanAuditoria_pagoId_fkey" FOREIGN KEY ("pagoId") REFERENCES "Pago"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CambioPlanAuditoria" ADD CONSTRAINT "CambioPlanAuditoria_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "UsuarioAdmin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
