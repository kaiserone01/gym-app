import type { PrismaClient } from "@gym-app/db/generated/prisma/client";
import type { IMemberRepository } from "@gym-app/domain/ports/IMemberRepository";
import type { Miembro } from "@gym-app/domain/entities/Miembro";

export class PrismaMemberRepository implements IMemberRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async buscarPorOrganizacionYCedula(organizacionId: string, cedula: string): Promise<Miembro | null> {
    const miembro = await this.prisma.miembro.findUnique({
      where: { organizacionId_cedula: { organizacionId, cedula } },
      include: { entrenador: true },
    });

    if (!miembro) return null;

    return {
      id: miembro.id,
      organizacionId: miembro.organizacionId,
      nombre: miembro.nombre,
      cedula: miembro.cedula,
      fotoUrl: miembro.fotoUrl,
      entrenadorNombre: miembro.entrenador?.nombre ?? null,
      planTipo: miembro.planTipo,
    };
  }
}
