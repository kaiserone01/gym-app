import type { PrismaClientOrTx } from "./PrismaClientOrTx";
import type { IMiembroReferenciaRepository } from "@gym-app/domain/ports/IMiembroReferenciaRepository";
import type { MiembroReferencia, FiltrosReferencia } from "@gym-app/domain/entities/MiembroReferencia";
import type { CambiosCrudosPadron, NormalizadosPadron } from "@gym-app/domain/utils/padronExcel";
import type { Prisma } from "@gym-app/db/generated/prisma/client";

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

  async actualizarEdicion(
    id: string,
    datos: { crudos: CambiosCrudosPadron; normalizados: NormalizadosPadron; camposEditados: string[]; editadoPor: string }
  ) {
    const fila = await this.prisma.miembroReferencia.update({
      where: { id },
      data: { ...datos.crudos, ...datos.normalizados, camposEditados: datos.camposEditados, editadoAt: new Date(), editadoPor: datos.editadoPor },
    });
    return mapearReferencia(fila);
  }

  async listar(organizacionId: string, sucursalId: string, f: FiltrosReferencia) {
    const y: Prisma.MiembroReferenciaWhereInput[] = [];
    if (f.cedula) y.push({ cedula: { contains: f.cedula } });
    if (f.nombre) y.push({ nombre: { contains: f.nombre, mode: "insensitive" } });
    if (f.status) y.push({ status: { contains: f.status, mode: "insensitive" } });
    if (f.plan) y.push({ plan: { contains: f.plan, mode: "insensitive" } });
    if (f.venceDesde) y.push({ fechaVencimiento: { gte: f.venceDesde } });
    if (f.venceHasta) y.push({ fechaVencimiento: { lte: f.venceHasta } });
    if (f.estadoEnSistema === "miembro" || f.estadoEnSistema === "no_miembro") {
      const cedulas = (await this.prisma.miembro.findMany({ where: { organizacionId }, select: { cedula: true } })).map((m) => m.cedula);
      y.push({ cedula: f.estadoEnSistema === "miembro" ? { in: cedulas } : { notIn: cedulas } });
    }
    const where: Prisma.MiembroReferenciaWhereInput = { organizacionId, sucursalId, AND: y };

    const [filas, total] = await Promise.all([
      this.prisma.miembroReferencia.findMany({ where, orderBy: { numeroFila: "asc" }, skip: (f.pagina - 1) * f.porPagina, take: f.porPagina }),
      this.prisma.miembroReferencia.count({ where }),
    ]);
    const miembros = await this.prisma.miembro.findMany({
      where: { organizacionId, cedula: { in: filas.map((r) => r.cedula) } },
      select: { id: true, cedula: true },
    });
    const idPorCedula = new Map(miembros.map((m) => [m.cedula, m.id]));
    return { filas: filas.map((r) => ({ ...mapearReferencia(r), miembroId: idPorCedula.get(r.cedula) ?? null })), total };
  }
}
