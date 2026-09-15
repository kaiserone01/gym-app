import type { PrismaClient } from "@gym-app/db/generated/prisma/client";
import type { ICierreCajaRepository } from "@gym-app/domain/ports/ICierreCajaRepository";
import type { CierreCaja, DatosNuevoCierreCaja } from "@gym-app/domain/entities/CierreCaja";

type FilaCierreCaja = {
  id: string;
  organizacionId: string;
  fecha: Date;
  totalUSD: { toNumber(): number };
  desglose: unknown;
  cerradoEn: Date;
};

function mapear(fila: FilaCierreCaja): CierreCaja {
  return {
    id: fila.id,
    organizacionId: fila.organizacionId,
    fecha: fila.fecha,
    totalUSD: fila.totalUSD.toNumber(),
    desglosePorMetodo: fila.desglose as Record<string, number>,
    cerradoEn: fila.cerradoEn,
  };
}

export class PrismaCierreCajaRepository implements ICierreCajaRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async buscarPorFecha(organizacionId: string, fecha: Date): Promise<CierreCaja | null> {
    const cierre = await this.prisma.cierreCaja.findUnique({
      where: { organizacionId_fecha: { organizacionId, fecha } },
    });

    return cierre ? mapear(cierre) : null;
  }

  async crear(datos: DatosNuevoCierreCaja): Promise<CierreCaja> {
    const cierre = await this.prisma.cierreCaja.create({
      data: {
        organizacionId: datos.organizacionId,
        fecha: datos.fecha,
        totalUSD: datos.totalUSD,
        desglose: datos.desglosePorMetodo,
      },
    });

    return mapear(cierre);
  }

  async listarPorOrganizacion(organizacionId: string): Promise<CierreCaja[]> {
    const cierres = await this.prisma.cierreCaja.findMany({
      where: { organizacionId },
      orderBy: { fecha: "desc" },
    });

    return cierres.map(mapear);
  }
}
