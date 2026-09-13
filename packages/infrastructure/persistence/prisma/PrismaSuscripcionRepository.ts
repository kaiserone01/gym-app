import type { PrismaClient } from "@gym-app/db/generated/prisma/client";
import type { ISuscripcionRepository } from "@gym-app/domain/ports/ISuscripcionRepository";
import type { Suscripcion } from "@gym-app/domain/entities/Suscripcion";

type FilaSuscripcion = {
  id: string;
  miembroId: string;
  plan: { id: string; organizacionId: string; tipoAcceso: Suscripcion["plan"]["tipoAcceso"] };
  inicio: Date;
  fin: Date;
  estado: Suscripcion["estado"];
};

function mapear(suscripcion: FilaSuscripcion): Suscripcion {
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

    return mapear(suscripcion);
  }

  async tieneAccesoASucursal(planId: string, sucursalId: string): Promise<boolean> {
    const acceso = await this.prisma.planSucursalAcceso.findUnique({
      where: { planId_sucursalId: { planId, sucursalId } },
    });
    return acceso !== null;
  }

  async buscarActivaVigentePorMiembroYPlan(miembroId: string, planId: string, fecha: Date): Promise<Suscripcion | null> {
    const suscripcion = await this.prisma.suscripcion.findFirst({
      where: {
        miembroId,
        planId,
        estado: "ACTIVA",
        fin: { gte: fecha },
      },
      include: { plan: true },
      orderBy: { fin: "desc" },
    });

    if (!suscripcion) return null;

    return mapear(suscripcion);
  }

  async extenderFin(id: string, nuevoFin: Date): Promise<Suscripcion> {
    const suscripcion = await this.prisma.suscripcion.update({
      where: { id },
      data: { fin: nuevoFin },
      include: { plan: true },
    });

    return mapear(suscripcion);
  }

  async crear(datos: { miembroId: string; planId: string; inicio: Date; fin: Date }): Promise<Suscripcion> {
    const suscripcion = await this.prisma.suscripcion.create({
      data: {
        miembroId: datos.miembroId,
        planId: datos.planId,
        inicio: datos.inicio,
        fin: datos.fin,
        estado: "ACTIVA",
      },
      include: { plan: true },
    });

    return mapear(suscripcion);
  }
}
