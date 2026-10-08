import type { PrismaClient } from "@gym-app/db/generated/prisma/client";
import type { ICheckInRepository } from "@gym-app/domain/ports/ICheckInRepository";
import type { CheckIn, CheckInEnSala, EstadoCheckIn } from "@gym-app/domain/entities/CheckIn";

function aEntidad(checkIn: {
  id: string;
  sucursalId: string;
  miembroId: string;
  fechaHora: Date;
  estadoAlMomento: string;
  salidaAt: Date | null;
}): CheckIn {
  return {
    id: checkIn.id,
    sucursalId: checkIn.sucursalId,
    miembroId: checkIn.miembroId,
    fechaHora: checkIn.fechaHora,
    estadoAlMomento: checkIn.estadoAlMomento as EstadoCheckIn,
    salidaAt: checkIn.salidaAt,
  };
}

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

    return checkIn ? aEntidad(checkIn) : null;
  }

  async crear(datos: { sucursalId: string; miembroId: string; estadoAlMomento: EstadoCheckIn }): Promise<CheckIn> {
    return aEntidad(await this.prisma.checkIn.create({ data: datos }));
  }

  async listarEnSala(sucursalId: string, desde: Date): Promise<CheckInEnSala[]> {
    const filas = await this.prisma.checkIn.findMany({
      where: { sucursalId, fechaHora: { gte: desde }, salidaAt: null },
      orderBy: { fechaHora: "desc" },
      include: { miembro: { include: { plan: { select: { nombre: true } } } } },
    });

    return filas.map((f) => ({
      id: f.id,
      miembroId: f.miembroId,
      fechaHora: f.fechaHora,
      miembro: {
        nombre: f.miembro.nombre,
        fotoUrl: f.miembro.fotoUrl,
        sucursalId: f.miembro.sucursalId,
        fechaVencimiento: f.miembro.fechaVencimiento,
        planNombre: f.miembro.plan?.nombre ?? null,
        ajustarFecha: f.miembro.ajustarFecha,
      },
    }));
  }

  async marcarSalida(sucursalId: string, miembroId: string, desde: Date, salidaAt: Date): Promise<void> {
    await this.prisma.checkIn.updateMany({
      where: { sucursalId, miembroId, fechaHora: { gte: desde }, salidaAt: null },
      data: { salidaAt },
    });
  }
}
