-- CreateTable
CREATE TABLE "MiembroReferencia" (
    "id" TEXT NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "cedula" TEXT NOT NULL,
    "numeroFila" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "status" TEXT,
    "fNacimiento" TEXT,
    "celular" TEXT,
    "fVenc" TEXT,
    "fechaPago" TEXT,
    "plan" TEXT,
    "fechaVencimiento" TIMESTAMP(3),
    "fechaUltimoPago" TIMESTAMP(3),
    "fechaNacimiento" TIMESTAMP(3),
    "planNombre" TEXT,
    "precioPlanUSD" DECIMAL(10,2),
    "archivoOrigen" TEXT NOT NULL,
    "importadoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "camposEditados" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "editadoAt" TIMESTAMP(3),
    "editadoPor" TEXT,

    CONSTRAINT "MiembroReferencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MiembroReferencia_sucursalId_idx" ON "MiembroReferencia"("sucursalId");

-- CreateIndex
CREATE UNIQUE INDEX "MiembroReferencia_organizacionId_cedula_key" ON "MiembroReferencia"("organizacionId", "cedula");

-- AddForeignKey
ALTER TABLE "MiembroReferencia" ADD CONSTRAINT "MiembroReferencia_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiembroReferencia" ADD CONSTRAINT "MiembroReferencia_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

