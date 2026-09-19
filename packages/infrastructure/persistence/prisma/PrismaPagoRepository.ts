import type { PrismaClient } from "@gym-app/db/generated/prisma/client";
import type { IPagoRepository } from "@gym-app/domain/ports/IPagoRepository";
import type { Pago, DatosNuevoPago } from "@gym-app/domain/entities/Pago";

type FilaPago = {
  id: string;
  miembroId: string;
  sucursalId: string;
  turnoId: string | null;
  registradoPorId: string;
  monto: { toNumber(): number };
  metodo: string;
  numeroOperacion: string | null;
  tasaCambio: { toNumber(): number } | null;
  montoBs: { toNumber(): number } | null;
  fechaPago: Date;
  anuladoEn: Date | null;
  anuladoPorId: string | null;
  motivoAnulacion: string | null;
};

function mapear(pago: FilaPago): Pago {
  return {
    id: pago.id,
    miembroId: pago.miembroId,
    sucursalId: pago.sucursalId,
    turnoId: pago.turnoId,
    registradoPorId: pago.registradoPorId,
    monto: pago.monto.toNumber(),
    metodo: pago.metodo,
    numeroOperacion: pago.numeroOperacion,
    tasaCambio: pago.tasaCambio ? pago.tasaCambio.toNumber() : null,
    montoBs: pago.montoBs ? pago.montoBs.toNumber() : null,
    fechaPago: pago.fechaPago,
    anuladoEn: pago.anuladoEn,
    anuladoPorId: pago.anuladoPorId,
    motivoAnulacion: pago.motivoAnulacion,
  };
}

export class PrismaPagoRepository implements IPagoRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async crear(datos: DatosNuevoPago): Promise<Pago> {
    const pago = await this.prisma.pago.create({
      data: {
        miembroId: datos.miembroId,
        sucursalId: datos.sucursalId,
        turnoId: datos.turnoId,
        registradoPorId: datos.registradoPorId,
        monto: datos.monto,
        metodo: datos.metodo,
        numeroOperacion: datos.numeroOperacion,
        tasaCambio: datos.tasaCambio,
        montoBs: datos.montoBs,
      },
    });
    return mapear(pago);
  }

  async listarPorMiembro(miembroId: string): Promise<Pago[]> {
    const pagos = await this.prisma.pago.findMany({
      where: { miembroId },
      orderBy: { fechaPago: "desc" },
    });
    return pagos.map(mapear);
  }

  async listarPorOrganizacion(organizacionId: string): Promise<Pago[]> {
    const pagos = await this.prisma.pago.findMany({
      where: { miembro: { organizacionId } },
      include: { miembro: { select: { nombre: true } } },
      orderBy: { fechaPago: "desc" },
    });
    return pagos.map((pago) => ({ ...mapear(pago), miembroNombre: pago.miembro.nombre }));
  }

  async listarPorOrganizacionYRango(organizacionId: string, desde: Date, hasta: Date): Promise<Pago[]> {
    const pagos = await this.prisma.pago.findMany({
      where: { miembro: { organizacionId }, fechaPago: { gte: desde, lte: hasta } },
      include: { miembro: { select: { nombre: true, precioPlan: true } } },
      orderBy: { fechaPago: "asc" },
    });
    return pagos.map((pago) => ({
      ...mapear(pago),
      miembroNombre: pago.miembro.nombre,
      miembroPrecioPlan: pago.miembro.precioPlan.toNumber(),
    }));
  }

  async listarPorTurno(turnoId: string): Promise<Pago[]> {
    const pagos = await this.prisma.pago.findMany({
      where: { turnoId },
      include: { miembro: { select: { nombre: true } } },
      orderBy: { fechaPago: "asc" },
    });
    return pagos.map((pago) => ({ ...mapear(pago), miembroNombre: pago.miembro.nombre }));
  }

  async buscarPorId(organizacionId: string, id: string): Promise<Pago | null> {
    const pago = await this.prisma.pago.findFirst({
      where: { id, miembro: { organizacionId } },
      include: { miembro: { select: { nombre: true } } },
    });
    return pago ? { ...mapear(pago), miembroNombre: pago.miembro.nombre } : null;
  }

  async anular(organizacionId: string, id: string, anuladoPorId: string, motivo: string, anuladoEn: Date): Promise<Pago> {
    const existente = await this.prisma.pago.findFirst({ where: { id, miembro: { organizacionId } } });
    if (!existente) {
      throw new Error("No se encontró el pago.");
    }
    const pago = await this.prisma.pago.update({
      where: { id },
      data: { anuladoEn, anuladoPorId, motivoAnulacion: motivo },
    });
    return mapear(pago);
  }
}
