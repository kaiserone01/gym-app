import type { PrismaClient } from "@gym-app/db/generated/prisma/client";
import type { ITurnoRepository } from "@gym-app/domain/ports/ITurnoRepository";
import type { Turno, DatosNuevoTurno } from "@gym-app/domain/entities/Turno";

type FilaTurno = {
  id: string;
  organizacionId: string;
  sucursalId: string;
  usuarioId: string;
  fondoInicialUSD: { toNumber(): number };
  fondoInicialBs: { toNumber(): number };
  abiertoEn: Date;
  cerradoEn: Date | null;
  estado: "ABIERTO" | "CERRADO";
};

function mapear(fila: FilaTurno): Turno {
  return {
    id: fila.id,
    organizacionId: fila.organizacionId,
    sucursalId: fila.sucursalId,
    usuarioId: fila.usuarioId,
    fondoInicialUSD: fila.fondoInicialUSD.toNumber(),
    fondoInicialBs: fila.fondoInicialBs.toNumber(),
    abiertoEn: fila.abiertoEn,
    cerradoEn: fila.cerradoEn,
    estado: fila.estado,
  };
}

export class PrismaTurnoRepository implements ITurnoRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async crear(datos: DatosNuevoTurno): Promise<Turno> {
    const turno = await this.prisma.turno.create({
      data: {
        organizacionId: datos.organizacionId,
        sucursalId: datos.sucursalId,
        usuarioId: datos.usuarioId,
        fondoInicialUSD: datos.fondoInicialUSD,
        fondoInicialBs: datos.fondoInicialBs,
      },
    });
    return mapear(turno);
  }

  async buscarPorId(organizacionId: string, id: string): Promise<Turno | null> {
    const turno = await this.prisma.turno.findFirst({ where: { id, organizacionId } });
    return turno ? mapear(turno) : null;
  }

  async buscarAbiertoPorSucursal(sucursalId: string): Promise<Turno | null> {
    const turno = await this.prisma.turno.findFirst({
      where: { sucursalId, estado: "ABIERTO" },
    });
    return turno ? mapear(turno) : null;
  }

  async cerrar(id: string, cerradoEn: Date): Promise<Turno> {
    const turno = await this.prisma.turno.update({
      where: { id },
      data: { estado: "CERRADO", cerradoEn },
    });
    return mapear(turno);
  }

  async listarPorOrganizacionYRango(organizacionId: string, desde: Date, hasta: Date): Promise<Turno[]> {
    const turnos = await this.prisma.turno.findMany({
      where: { organizacionId, abiertoEn: { gte: desde, lte: hasta } },
      orderBy: { abiertoEn: "desc" },
    });
    return turnos.map(mapear);
  }
}
