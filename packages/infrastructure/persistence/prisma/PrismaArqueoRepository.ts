import type { PrismaClient } from "@gym-app/db/generated/prisma/client";
import type { IArqueoRepository } from "@gym-app/domain/ports/IArqueoRepository";
import type { ArqueoLinea, DatosNuevaArqueoLinea } from "@gym-app/domain/entities/ArqueoLinea";

type FilaArqueo = {
  id: string;
  turnoId: string;
  metodo: string;
  montoEsperado: { toNumber(): number };
  montoContado: { toNumber(): number };
  diferencia: { toNumber(): number };
  nota: string | null;
};

function mapear(fila: FilaArqueo): ArqueoLinea {
  return {
    id: fila.id,
    turnoId: fila.turnoId,
    metodo: fila.metodo,
    montoEsperado: fila.montoEsperado.toNumber(),
    montoContado: fila.montoContado.toNumber(),
    diferencia: fila.diferencia.toNumber(),
    nota: fila.nota,
  };
}

export class PrismaArqueoRepository implements IArqueoRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async crearLineas(lineas: DatosNuevaArqueoLinea[]): Promise<ArqueoLinea[]> {
    await this.prisma.arqueoLinea.createMany({
      data: lineas.map((l) => ({
        turnoId: l.turnoId,
        metodo: l.metodo,
        montoEsperado: l.montoEsperado,
        montoContado: l.montoContado,
        diferencia: l.diferencia,
        nota: l.nota,
      })),
    });
    return this.listarPorTurno(lineas[0]?.turnoId ?? "");
  }

  async listarPorTurno(turnoId: string): Promise<ArqueoLinea[]> {
    const lineas = await this.prisma.arqueoLinea.findMany({ where: { turnoId } });
    return lineas.map(mapear);
  }
}
