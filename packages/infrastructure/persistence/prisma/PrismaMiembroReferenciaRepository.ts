import type { PrismaClientOrTx } from "./PrismaClientOrTx";
import type { IMiembroReferenciaRepository } from "@gym-app/domain/ports/IMiembroReferenciaRepository";
import type { MiembroReferencia } from "@gym-app/domain/entities/MiembroReferencia";

type FilaReferencia = Omit<MiembroReferencia, "precioPlanUSD"> & { precioPlanUSD: { toNumber(): number } | null };

export function mapearReferencia(fila: FilaReferencia): MiembroReferencia {
  return { ...fila, precioPlanUSD: fila.precioPlanUSD?.toNumber() ?? null };
}

export class PrismaMiembroReferenciaRepository implements IMiembroReferenciaRepository {
  constructor(private readonly prisma: PrismaClientOrTx) {}

  async buscarPorCedula(organizacionId: string, cedula: string): Promise<MiembroReferencia | null> {
    const fila = await this.prisma.miembroReferencia.findUnique({
      where: { organizacionId_cedula: { organizacionId, cedula } },
    });
    return fila ? mapearReferencia(fila) : null;
  }

  async existeParaSucursal(organizacionId: string, sucursalId: string): Promise<boolean> {
    const fila = await this.prisma.miembroReferencia.findFirst({ where: { organizacionId, sucursalId }, select: { id: true } });
    return fila !== null;
  }
}
