import type { PrismaClient } from "@gym-app/db/generated/prisma/client";
import type { ICheckInRepository } from "@gym-app/domain/ports/ICheckInRepository";
import type { CheckIn, EstadisticaCheckInPorSucursal, EstadoCheckIn } from "@gym-app/domain/entities/CheckIn";

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

  async contarPorSucursalYRangoDeFechas(
    organizacionId: string,
    desde: Date,
    hasta: Date
  ): Promise<EstadisticaCheckInPorSucursal[]> {
    const sucursales = await this.prisma.sucursal.findMany({
      where: { organizacionId },
      select: { id: true, nombre: true },
    });
    const idsDeLaOrganizacion = sucursales.map((s) => s.id);
    if (idsDeLaOrganizacion.length === 0) return [];

    const conteos = await this.prisma.checkIn.groupBy({
      by: ["sucursalId"],
      where: { sucursalId: { in: idsDeLaOrganizacion }, fechaHora: { gte: desde, lte: hasta } },
      _count: { _all: true },
    });

    return sucursales.map((s) => {
      const encontrado = conteos.find((c) => c.sucursalId === s.id);
      return { sucursalId: s.id, nombreSucursal: s.nombre, cantidad: encontrado?._count._all ?? 0 };
    });
  }
}
