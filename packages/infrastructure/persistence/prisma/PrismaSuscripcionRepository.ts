import type { PrismaClient } from "@gym-app/db/generated/prisma/client";
import type { ISuscripcionRepository } from "@gym-app/domain/ports/ISuscripcionRepository";
import type { Suscripcion } from "@gym-app/domain/entities/Suscripcion";

type FilaSuscripcion = {
  id: string;
  miembroId: string;
  planId: string;
  inicio: Date;
  fin: Date;
  fechaLimiteAbono: Date | null;
  estado: Suscripcion["estado"];
};

function mapear(suscripcion: FilaSuscripcion): Suscripcion {
  return {
    id: suscripcion.id,
    miembroId: suscripcion.miembroId,
    planId: suscripcion.planId,
    inicio: suscripcion.inicio,
    fin: suscripcion.fin,
    fechaLimiteAbono: suscripcion.fechaLimiteAbono,
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
      orderBy: { fin: "desc" },
    });

    if (!suscripcion) return null;

    return mapear(suscripcion);
  }

  async buscarActivaVigentePorMiembroYPlan(miembroId: string, planId: string, fecha: Date): Promise<Suscripcion | null> {
    const suscripcion = await this.prisma.suscripcion.findFirst({
      where: {
        miembroId,
        planId,
        estado: "ACTIVA",
        fin: { gte: fecha },
      },
      orderBy: { fin: "desc" },
    });

    if (!suscripcion) return null;

    return mapear(suscripcion);
  }

  async listarActivasVigentesPorPlan(planId: string, fecha: Date): Promise<Suscripcion[]> {
    const suscripciones = await this.prisma.suscripcion.findMany({
      where: { planId, estado: "ACTIVA", fin: { gte: fecha } },
    });

    return suscripciones.map(mapear);
  }

  async extenderFin(id: string, nuevoFin: Date): Promise<Suscripcion> {
    const suscripcion = await this.prisma.suscripcion.update({
      where: { id },
      data: { fin: nuevoFin },
    });

    return mapear(suscripcion);
  }

  async cambiarPlan(id: string, planId: string): Promise<Suscripcion> {
    const suscripcion = await this.prisma.suscripcion.update({
      where: { id },
      data: { planId },
    });

    return mapear(suscripcion);
  }

  async crear(datos: {
    miembroId: string;
    planId: string;
    inicio: Date;
    fin: Date;
    fechaLimiteAbono: Date | null;
  }): Promise<Suscripcion> {
    const suscripcion = await this.prisma.suscripcion.create({
      data: {
        miembroId: datos.miembroId,
        planId: datos.planId,
        inicio: datos.inicio,
        fin: datos.fin,
        fechaLimiteAbono: datos.fechaLimiteAbono,
        estado: "ACTIVA",
      },
    });

    return mapear(suscripcion);
  }

  async actualizarFechaLimiteAbono(id: string, fechaLimiteAbono: Date | null): Promise<Suscripcion> {
    const suscripcion = await this.prisma.suscripcion.update({
      where: { id },
      data: { fechaLimiteAbono },
    });

    return mapear(suscripcion);
  }
}
