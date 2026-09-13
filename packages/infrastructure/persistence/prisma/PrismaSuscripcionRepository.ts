import type { PrismaClient } from "@gym-app/db/generated/prisma/client";
import type { ISuscripcionRepository } from "@gym-app/domain/ports/ISuscripcionRepository";
import type { Suscripcion } from "@gym-app/domain/entities/Suscripcion";

export class PrismaSuscripcionRepository implements ISuscripcionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async buscarActivaVigentePorMiembro(miembroId: string, fecha: Date): Promise<Suscripcion | null> {
    const suscripcion = await this.prisma.suscripcion.findFirst({
      where: {
        miembroId,
        estado: "ACTIVA",
        inicio: { lte: fecha },
        fin: { gte: fecha },
      },
      include: { plan: true },
      orderBy: { fin: "desc" },
    });

    if (!suscripcion) return null;

    return {
      id: suscripcion.id,
      miembroId: suscripcion.miembroId,
      plan: {
        id: suscripcion.plan.id,
        organizacionId: suscripcion.plan.organizacionId,
        tipoAcceso: suscripcion.plan.tipoAcceso,
      },
      inicio: suscripcion.inicio,
      fin: suscripcion.fin,
      estado: suscripcion.estado,
    };
  }

  async tieneAccesoASucursal(planId: string, sucursalId: string): Promise<boolean> {
    const acceso = await this.prisma.planSucursalAcceso.findUnique({
      where: { planId_sucursalId: { planId, sucursalId } },
    });
    return acceso !== null;
  }
}
