import type { PrismaClientOrTx } from "./PrismaClientOrTx";
import type { IMiembroReferenciaRepository } from "@gym-app/domain/ports/IMiembroReferenciaRepository";
import type { MiembroReferencia, FilaReferenciaConEstado, HojaPadron, EncabezadoColumnaPadron } from "@gym-app/domain/entities/MiembroReferencia";
import type { CambiosCrudosPadron, EstilosPadron, NormalizadosPadron } from "@gym-app/domain/utils/padronExcel";

type FilaReferencia = Omit<MiembroReferencia, "precioPlanUSD" | "estilos"> & { precioPlanUSD: { toNumber(): number } | null; estilos: unknown };

export function mapearReferencia(fila: FilaReferencia): MiembroReferencia {
  return { ...fila, precioPlanUSD: fila.precioPlanUSD?.toNumber() ?? null, estilos: (fila.estilos as EstilosPadron | null) ?? null };
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

  async listarTodas(organizacionId: string, sucursalId: string): Promise<FilaReferenciaConEstado[]> {
    const filas = await this.prisma.miembroReferencia.findMany({ where: { organizacionId, sucursalId }, orderBy: { numeroFila: "asc" } });
    const miembros = await this.prisma.miembro.findMany({
      where: { organizacionId, cedula: { in: filas.map((r) => r.cedula) } },
      select: { id: true, cedula: true },
    });
    const idPorCedula = new Map(miembros.map((m) => [m.cedula, m.id]));
    return filas.map((r) => ({ ...mapearReferencia(r), miembroId: idPorCedula.get(r.cedula) ?? null }));
  }

  async obtenerHoja(organizacionId: string, sucursalId: string): Promise<HojaPadron | null> {
    const hoja = await this.prisma.padronHoja.findUnique({ where: { organizacionId_sucursalId: { organizacionId, sucursalId } } });
    if (!hoja) return null;
    return {
      encabezados: hoja.encabezados as unknown as EncabezadoColumnaPadron[],
      alturaEncabezadoPx: hoja.alturaEncabezadoPx,
      archivoOrigen: hoja.archivoOrigen,
    };
  }

  async actualizarEdicion(
    id: string,
    datos: { crudos: CambiosCrudosPadron; normalizados?: NormalizadosPadron; camposEditados?: string[]; editadoPor: string; resaltado?: string | null }
  ) {
    const fila = await this.prisma.miembroReferencia.update({
      where: { id },
      data: {
        ...datos.crudos,
        ...datos.normalizados,
        ...(datos.camposEditados && { camposEditados: datos.camposEditados }),
        editadoAt: new Date(),
        editadoPor: datos.editadoPor,
        ...(datos.resaltado !== undefined && { resaltado: datos.resaltado, resaltadoEditado: true }),
      },
    });
    return mapearReferencia(fila);
  }
}
