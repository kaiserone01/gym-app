import type { PrismaClientOrTx } from "./PrismaClientOrTx";
import type { IDeudaProductoRepository } from "@gym-app/domain/ports/IDeudaProductoRepository";
import type { DeudaProducto, DatosNuevaDeuda, EstadoDeuda } from "@gym-app/domain/entities/DeudaProducto";

type FilaDeuda = {
  id: string;
  organizacionId: string;
  sucursalId: string;
  miembroId: string;
  productoId: string | null;
  productoNombre: string;
  cantidad: number;
  precioUnitarioUSD: { toNumber(): number };
  estado: string;
  registradaPorId: string;
  creadaEn: Date;
  cobradaEn: Date | null;
  grupoPagoId: string | null;
};

function mapear(fila: FilaDeuda, miembroNombre?: string): DeudaProducto {
  return {
    id: fila.id,
    organizacionId: fila.organizacionId,
    sucursalId: fila.sucursalId,
    miembroId: fila.miembroId,
    miembroNombre,
    productoId: fila.productoId,
    productoNombre: fila.productoNombre,
    cantidad: fila.cantidad,
    precioUnitarioUSD: fila.precioUnitarioUSD.toNumber(),
    estado: fila.estado as EstadoDeuda,
    registradaPorId: fila.registradaPorId,
    creadaEn: fila.creadaEn,
    cobradaEn: fila.cobradaEn,
    grupoPagoId: fila.grupoPagoId,
  };
}

export class PrismaDeudaProductoRepository implements IDeudaProductoRepository {
  constructor(private readonly prisma: PrismaClientOrTx) {}

  async crear(datos: DatosNuevaDeuda): Promise<DeudaProducto> {
    return mapear(await this.prisma.deudaProducto.create({ data: datos }));
  }

  async listarPendientesPorOrganizacion(organizacionId: string, sucursalId: string): Promise<DeudaProducto[]> {
    const filas = await this.prisma.deudaProducto.findMany({
      where: { organizacionId, sucursalId, estado: "PENDIENTE" },
      include: { miembro: { select: { nombre: true } } },
      orderBy: { creadaEn: "asc" },
    });
    return filas.map((fila) => mapear(fila, fila.miembro.nombre));
  }

  async listarPendientesPorMiembro(organizacionId: string, miembroId: string, sucursalId: string): Promise<DeudaProducto[]> {
    const filas = await this.prisma.deudaProducto.findMany({
      where: { organizacionId, miembroId, sucursalId, estado: "PENDIENTE" },
      orderBy: { creadaEn: "asc" },
    });
    return filas.map((fila) => mapear(fila));
  }

  async marcarCobradas(ids: string[], cobradaPorId: string, cobradaEn: Date, grupoPagoId: string): Promise<number> {
    const resultado = await this.prisma.deudaProducto.updateMany({
      where: { id: { in: ids }, estado: "PENDIENTE" },
      data: { estado: "COBRADA", cobradaPorId, cobradaEn, grupoPagoId },
    });
    return resultado.count;
  }

  async anular(organizacionId: string, id: string, sucursalId: string, anuladaPorId: string, anuladaEn: Date): Promise<number> {
    const resultado = await this.prisma.deudaProducto.updateMany({
      where: { id, organizacionId, sucursalId, estado: "PENDIENTE" },
      data: { estado: "ANULADA", anuladaPorId, anuladaEn },
    });
    return resultado.count;
  }
}
