-- CreateEnum
CREATE TYPE "Genero" AS ENUM ('MASCULINO', 'FEMENINO');

-- AlterTable
ALTER TABLE "Miembro" ADD COLUMN "genero" "Genero";
