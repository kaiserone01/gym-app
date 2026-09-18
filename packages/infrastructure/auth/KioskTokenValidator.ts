import type { PrismaClient } from "@gym-app/db/generated/prisma/client";
import type { IKioskAuthValidator } from "@gym-app/domain/ports/IKioskAuthValidator";
import type { Sucursal } from "@gym-app/domain/entities/Sucursal";

export class KioskTokenValidator implements IKioskAuthValidator {
  constructor(private readonly prisma: PrismaClient) {}

  async validar(apiKey: string): Promise<Sucursal | null> {
    const sucursal = await this.prisma.sucursal.findUnique({ where: { apiKey } });
    if (!sucursal) return null;

    return {
      id: sucursal.id,
      organizacionId: sucursal.organizacionId,
      nombre: sucursal.nombre,
      direccion: sucursal.direccion,
      diasGracia: sucursal.diasGracia,
      activo: sucursal.activo,
      apiKey: sucursal.apiKey,
    };
  }
}
