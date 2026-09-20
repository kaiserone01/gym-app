import type { PrismaClient } from "@gym-app/db/generated/prisma/client";
import type { IEgresoRepository } from "@gym-app/domain/ports/IEgresoRepository";
import type { Egreso, DatosNuevoEgreso } from "@gym-app/domain/entities/Egreso";

type FilaEgreso = {
  id: string;
  turnoId: string;
  monto: { toNumber(): number };
  moneda: "USD" | "BS";
  tasaCambio: { toNumber(): number } | null;
  montoUSD: { toNumber(): number } | null;
  metodo: string;
  motivo: string;
  registradoEn: Date;
};

function mapear(fila: FilaEgreso): Egreso {
  return {
    id: fila.id,
    turnoId: fila.turnoId,
    monto: fila.monto.toNumber(),
    moneda: fila.moneda,
    tasaCambio: fila.tasaCambio?.toNumber() ?? null,
    montoUSD: fila.montoUSD?.toNumber() ?? null,
    metodo: fila.metodo,
    motivo: fila.motivo,
    registradoEn: fila.registradoEn,
  };
}

export class PrismaEgresoRepository implements IEgresoRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async crear(datos: DatosNuevoEgreso): Promise<Egreso> {
    const egreso = await this.prisma.egreso.create({
      data: {
        turnoId: datos.turnoId,
        monto: datos.monto,
        moneda: datos.moneda,
        tasaCambio: datos.tasaCambio,
        montoUSD: datos.montoUSD,
        metodo: datos.metodo,
        motivo: datos.motivo,
      },
    });
    return mapear(egreso);
  }

  async listarPorTurno(turnoId: string): Promise<Egreso[]> {
    const egresos = await this.prisma.egreso.findMany({
      where: { turnoId },
      orderBy: { registradoEn: "asc" },
    });
    return egresos.map(mapear);
  }
}
