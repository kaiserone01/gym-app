-- MetodoPago + Plan.multisede + Miembro.sucursalId nullable + Pago.metodoPagoId

-- 1. Enum TipoMetodoPago
CREATE TYPE "TipoMetodoPago" AS ENUM ('EFECTIVO', 'PAGO_MOVIL', 'TRANSFERENCIA', 'PUNTO_VENTA', 'BIOPAGO', 'CRIPTO');

-- 2. Tabla MetodoPago
CREATE TABLE "MetodoPago" (
    "id" TEXT NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "tipo" "TipoMetodoPago" NOT NULL,
    "nombreBanco" TEXT,
    "logoUrl" TEXT,
    "moneda" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "codigoBanco" TEXT,
    "telefono" TEXT,
    "rif" TEXT,
    "numeroCuenta" TEXT,
    "beneficiario" TEXT,
    "qrUrl" TEXT,
    "walletDireccion" TEXT,
    "walletUsuario" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetodoPago_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "MetodoPago" ADD CONSTRAINT "MetodoPago_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3. Plan.multisede
ALTER TABLE "Plan" ADD COLUMN "multisede" BOOLEAN NOT NULL DEFAULT false;

-- 4. Miembro.sucursalId nullable (drop NOT NULL, keep FK)
ALTER TABLE "Miembro" ALTER COLUMN "sucursalId" DROP NOT NULL;

-- 5. Pago.metodoPagoId
ALTER TABLE "Pago" ADD COLUMN "metodoPagoId" TEXT;
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_metodoPagoId_fkey" FOREIGN KEY ("metodoPagoId") REFERENCES "MetodoPago"("id") ON DELETE SET NULL ON UPDATE CASCADE;
