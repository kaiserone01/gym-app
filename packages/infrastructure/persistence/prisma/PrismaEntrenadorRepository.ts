import type { PrismaClient } from "@gym-app/db/generated/prisma/client";
import type { IEntrenadorRepository } from "@gym-app/domain/ports/IEntrenadorRepository";
import type { EntrenadorResumen } from "@gym-app/domain/entities/EntrenadorResumen";

export class PrismaEntrenadorRepository implements IEntrenadorRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listarPorOrganizacion(organizacionId: string): Promise<EntrenadorResumen[]> {
    return this.prisma.entrenador.findMany({
      where: { activo: true, sucursal: { organizacionId } },
      select: { id: true, nombre: true },
      orderBy: { nombre: "asc" },
    });
  }
}
