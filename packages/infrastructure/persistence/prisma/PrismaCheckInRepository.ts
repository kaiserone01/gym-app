import type { PrismaClient } from "@gym-app/db/generated/prisma/client";
import type { ICheckInRepository } from "@gym-app/domain/ports/ICheckInRepository";
import type { CheckIn, EstadoCheckIn } from "@gym-app/domain/entities/CheckIn";

export class PrismaCheckInRepository implements ICheckInRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async buscarRecientePorMiembroYSucursal(
    miembroId: string,
    sucursalId: string,
    desde: Date
  ): Promise<CheckIn | null> {
    const checkIn = await this.prisma.checkIn.findFirst({
      where: { miembroId, sucursalId, fechaHora: { gte: desde } },
      orderBy: { fechaHora: "desc" },
    });

    if (!checkIn) return null;

    return {
      id: checkIn.id,
      sucursalId: checkIn.sucursalId,
      miembroId: checkIn.miembroId,
      fechaHora: checkIn.fechaHora,
      estadoAlMomento: checkIn.estadoAlMomento as EstadoCheckIn,
    };
  }

  async crear(datos: { sucursalId: string; miembroId: string; estadoAlMomento: EstadoCheckIn }): Promise<CheckIn> {
    const checkIn = await this.prisma.checkIn.create({ data: datos });
    return {
      id: checkIn.id,
      sucursalId: checkIn.sucursalId,
      miembroId: checkIn.miembroId,
      fechaHora: checkIn.fechaHora,
      estadoAlMomento: checkIn.estadoAlMomento as EstadoCheckIn,
    };
  }
}
