import type { PrismaClient } from "@gym-app/db/generated/prisma/client";
import type { ISucursalRepository } from "@gym-app/domain/ports/ISucursalRepository";
import type { Sucursal } from "@gym-app/domain/entities/Sucursal";
import type { SucursalResumen } from "@gym-app/domain/entities/SucursalResumen";

export class PrismaSucursalRepository implements ISucursalRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async buscarPorApiKey(apiKey: string): Promise<Sucursal | null> {
    const sucursal = await this.prisma.sucursal.findUnique({ where: { apiKey } });

    if (!sucursal) return null;

    return {
      id: sucursal.id,
      organizacionId: sucursal.organizacionId,
      nombre: sucursal.nombre,
      apiKey: sucursal.apiKey,
    };
  }

  async listarPorOrganizacion(organizacionId: string): Promise<SucursalResumen[]> {
    return this.prisma.sucursal.findMany({
      where: { organizacionId },
      select: { id: true, nombre: true },
      orderBy: { nombre: "asc" },
    });
  }
}
