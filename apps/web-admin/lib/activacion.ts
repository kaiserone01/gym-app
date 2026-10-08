import { prisma } from "@/lib/prisma";
import { PrismaMemberRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMemberRepository";
import { PrismaMiembroReferenciaRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMiembroReferenciaRepository";
import { PrismaPlanRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPlanRepository";
import { PrismaSuscripcionRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSuscripcionRepository";
import { activarMiembroPorCedula, type ActivarMiembroInput } from "@gym-app/domain/use-cases/ActivarMiembroDesdePadron";
import type { Miembro } from "@gym-app/domain/entities/Miembro";

// Miembro + Suscripción se crean en una sola transacción. Si dos peticiones activan la misma cédula a
// la vez, la unicidad (organizacionId, cedula) hace fallar a la segunda: se relee y se devuelve el que
// ya existe en vez de propagar el error.
export async function activarMiembroEnTransaccion(input: ActivarMiembroInput): Promise<Miembro | null> {
  try {
    return await prisma.$transaction((tx) =>
      activarMiembroPorCedula(
        {
          miembros: new PrismaMemberRepository(tx),
          referencias: new PrismaMiembroReferenciaRepository(tx),
          planes: new PrismaPlanRepository(tx),
          suscripciones: new PrismaSuscripcionRepository(tx),
        },
        input
      )
    );
  } catch (error) {
    const existente = await new PrismaMemberRepository(prisma).buscarPorOrganizacionYCedula(input.organizacionId, input.cedula);
    if (existente) return existente;
    throw error;
  }
}
