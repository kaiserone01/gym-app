-- AlterTable
ALTER TABLE "Plan" ADD COLUMN "permitePagoParcial" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Plan" ADD COLUMN "minimoAbonoTipo" TEXT;
ALTER TABLE "Plan" ADD COLUMN "minimoAbonoValor" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "Suscripcion" ADD COLUMN "fechaLimiteAbono" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ReglaAbonoPorFrecuencia" (
    "id" TEXT NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "frecuencia" "FrecuenciaPago" NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT false,
    "minimoAbonoTipo" TEXT NOT NULL,
    "minimoAbonoValor" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "ReglaAbonoPorFrecuencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReglaAbonoPorFrecuencia_organizacionId_frecuencia_key" ON "ReglaAbonoPorFrecuencia"("organizacionId", "frecuencia");

-- AddForeignKey
ALTER TABLE "ReglaAbonoPorFrecuencia" ADD CONSTRAINT "ReglaAbonoPorFrecuencia_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
