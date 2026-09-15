import type { PrismaClient } from "@gym-app/db/generated/prisma/client";
import type { IPagoRepository } from "@gym-app/domain/ports/IPagoRepository";
import type { Pago, DatosNuevoPago } from "@gym-app/domain/entities/Pago";

type FilaPago = {
  id: string;
  miembroId: string;
  monto: { toNumber(): number };
  metodo: string;
  numeroOperacion: string | null;
  tasaCambio: { toNumber(): number } | null;
  fechaPago: Date;
};

function mapear(pago: FilaPago): Pago {
  return {
    id: pago.id,
    miembroId: pago.miembroId,
    monto: pago.monto.toNumber(),
    metodo: pago.metodo,
    numeroOperacion: pago.numeroOperacion,
    tasaCambio: pago.tasaCambio ? pago.tasaCambio.toNumber() : null,
    fechaPago: pago.fechaPago,
  };
}

export class PrismaPagoRepository implements IPagoRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async crear(datos: DatosNuevoPago): Promise<Pago> {
    const pago = await this.prisma.pago.create({
      data: {
        miembroId: datos.miembroId,
        monto: datos.monto,
        metodo: datos.metodo,
        numeroOperacion: datos.numeroOperacion,
        tasaCambio: datos.tasaCambio,
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
}
