-- CreateEnum
CREATE TYPE "EstadoDeuda" AS ENUM ('PENDIENTE', 'COBRADA', 'ANULADA');

-- CreateTable
CREATE TABLE "DeudaProducto" (
    "id" TEXT NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "miembroId" TEXT NOT NULL,
    "productoId" TEXT,
    "productoNombre" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precioUnitarioUSD" DECIMAL(10,2) NOT NULL,
    "estado" "EstadoDeuda" NOT NULL DEFAULT 'PENDIENTE',
    "registradaPorId" TEXT NOT NULL,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cobradaEn" TIMESTAMP(3),
    "cobradaPorId" TEXT,
    "grupoPagoId" TEXT,
    "anuladaEn" TIMESTAMP(3),
    "anuladaPorId" TEXT,

    CONSTRAINT "DeudaProducto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeudaProducto_organizacionId_estado_idx" ON "DeudaProducto"("organizacionId", "estado");

-- CreateIndex
CREATE INDEX "DeudaProducto_miembroId_estado_idx" ON "DeudaProducto"("miembroId", "estado");

-- AddForeignKey
ALTER TABLE "DeudaProducto" ADD CONSTRAINT "DeudaProducto_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeudaProducto" ADD CONSTRAINT "DeudaProducto_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeudaProducto" ADD CONSTRAINT "DeudaProducto_miembroId_fkey" FOREIGN KEY ("miembroId") REFERENCES "Miembro"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeudaProducto" ADD CONSTRAINT "DeudaProducto_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeudaProducto" ADD CONSTRAINT "DeudaProducto_registradaPorId_fkey" FOREIGN KEY ("registradaPorId") REFERENCES "UsuarioAdmin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeudaProducto" ADD CONSTRAINT "DeudaProducto_cobradaPorId_fkey" FOREIGN KEY ("cobradaPorId") REFERENCES "UsuarioAdmin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeudaProducto" ADD CONSTRAINT "DeudaProducto_anuladaPorId_fkey" FOREIGN KEY ("anuladaPorId") REFERENCES "UsuarioAdmin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
