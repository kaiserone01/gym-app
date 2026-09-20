import type { PrismaClient } from "@gym-app/db/generated/prisma/client";
import type { IEntrenadorRepository } from "@gym-app/domain/ports/IEntrenadorRepository";
import type { EntrenadorResumen } from "@gym-app/domain/entities/EntrenadorResumen";

export class PrismaEntrenadorRepository implements IEntrenadorRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listarPorOrganizacionYSucursal(organizacionId: string, sucursalId: string): Promise<EntrenadorResumen[]> {
    return this.prisma.usuarioAdmin.findMany({
      where: {
        organizacionId,
        rol: "ENTRENADOR",
        activo: true,
        sucursales: { some: { sucursalId } },
      },
      select: { id: true, nombre: true },
      orderBy: { nombre: "asc" },
    });
  }
}
