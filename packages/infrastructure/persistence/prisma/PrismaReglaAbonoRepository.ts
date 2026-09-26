import type { PrismaClient } from "@gym-app/db/generated/prisma/client";
import type { IReglaAbonoRepository } from "@gym-app/domain/ports/IReglaAbonoRepository";
import type { FrecuenciaPago } from "@gym-app/domain/entities/Plan";
import type { ReglaAbonoPorFrecuencia, TipoMinimoAbono } from "@gym-app/domain/entities/ReglaAbono";

type FilaRegla = {
  id: string;
  organizacionId: string;
  frecuencia: FrecuenciaPago;
  activo: boolean;
  minimoAbonoTipo: string;
  minimoAbonoValor: { toNumber(): number };
};

function mapear(fila: FilaRegla): ReglaAbonoPorFrecuencia {
  return {
    id: fila.id,
    organizacionId: fila.organizacionId,
    frecuencia: fila.frecuencia,
    activo: fila.activo,
    tipo: fila.minimoAbonoTipo as TipoMinimoAbono,
    valor: fila.minimoAbonoValor.toNumber(),
  };
}

export class PrismaReglaAbonoRepository implements IReglaAbonoRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async buscarPorOrganizacionYFrecuencia(
    organizacionId: string,
    frecuencia: FrecuenciaPago
  ): Promise<ReglaAbonoPorFrecuencia | null> {
    const fila = await this.prisma.reglaAbonoPorFrecuencia.findUnique({
      where: { organizacionId_frecuencia: { organizacionId, frecuencia } },
    });
    return fila ? mapear(fila) : null;
  }

  async listarPorOrganizacion(organizacionId: string): Promise<ReglaAbonoPorFrecuencia[]> {
    const filas = await this.prisma.reglaAbonoPorFrecuencia.findMany({ where: { organizacionId } });
    return filas.map(mapear);
  }

  async upsert(
    organizacionId: string,
    frecuencia: FrecuenciaPago,
    datos: { activo: boolean; tipo: TipoMinimoAbono; valor: number }
  ): Promise<ReglaAbonoPorFrecuencia> {
    const fila = await this.prisma.reglaAbonoPorFrecuencia.upsert({
      where: { organizacionId_frecuencia: { organizacionId, frecuencia } },
      create: {
        organizacionId,
        frecuencia,
        activo: datos.activo,
        minimoAbonoTipo: datos.tipo,
        minimoAbonoValor: datos.valor,
      },
      update: {
        activo: datos.activo,
        minimoAbonoTipo: datos.tipo,
        minimoAbonoValor: datos.valor,
      },
    });
    return mapear(fila);
  }
}
