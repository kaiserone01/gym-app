import { prisma } from "@/lib/prisma";
import { PrismaCheckInRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaCheckInRepository";
import { PrismaSuscripcionRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSuscripcionRepository";
import { PrismaSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSucursalRepository";
import { listarEnSala } from "@gym-app/domain/use-cases/ListarEnSala";

export function consultarEnSala(organizacionId: string, sucursalId: string) {
  return listarEnSala(
    {
      checkIns: new PrismaCheckInRepository(prisma),
      suscripciones: new PrismaSuscripcionRepository(prisma),
      sucursales: new PrismaSucursalRepository(prisma),
    },
    { organizacionId, sucursalId }
  );
}
