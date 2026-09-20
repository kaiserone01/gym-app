import type { PrismaClient } from "@gym-app/db/generated/prisma/client";
import type { IPlanRepository } from "@gym-app/domain/ports/IPlanRepository";
import type { Plan, DatosNuevoPlan, CambiosPlan, FrecuenciaPago } from "@gym-app/domain/entities/Plan";

type FilaPlan = {
  id: string;
  organizacionId: string;
  nombre: string;
  frecuencia: Plan["frecuencia"];
  incluyeEntrenador: boolean;
  precioUSD: { toNumber(): number };
  multisede: boolean;
  activo: boolean;
};

function mapear(plan: FilaPlan): Plan {
  return {
    id: plan.id,
    organizacionId: plan.organizacionId,
    nombre: plan.nombre,
    frecuencia: plan.frecuencia,
    incluyeEntrenador: plan.incluyeEntrenador,
    precioUSD: plan.precioUSD.toNumber(),
    multisede: plan.multisede,
    activo: plan.activo,
  };
}

export class PrismaPlanRepository implements IPlanRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listarPorOrganizacion(organizacionId: string): Promise<Plan[]> {
    const planes = await this.prisma.plan.findMany({
      where: { organizacionId },
      orderBy: { nombre: "asc" },
    });

    return planes.map(mapear);
  }

  async buscarPorId(organizacionId: string, id: string): Promise<Plan | null> {
    const plan = await this.prisma.plan.findUnique({ where: { id } });

    if (!plan || plan.organizacionId !== organizacionId) return null;

    return mapear(plan);
  }

  async crear(datos: DatosNuevoPlan): Promise<Plan> {
    const plan = await this.prisma.plan.create({
      data: {
        organizacionId: datos.organizacionId,
        nombre: datos.nombre,
        frecuencia: datos.frecuencia,
        incluyeEntrenador: datos.incluyeEntrenador,
        precioUSD: datos.precioUSD,
        multisede: datos.multisede,
      },
    });

    return mapear(plan);
  }

  async actualizar(organizacionId: string, id: string, cambios: CambiosPlan): Promise<Plan | null> {
    const actual = await this.prisma.plan.findUnique({ where: { id } });

    if (!actual || actual.organizacionId !== organizacionId) {
      return null;
    }

    const plan = await this.prisma.plan.update({ where: { id }, data: cambios });

    return mapear(plan);
  }

  async contarSuscripcionesActivasVigentes(planId: string, ahora: Date): Promise<number> {
    return this.prisma.suscripcion.count({
      where: { planId, estado: "ACTIVA", fin: { gte: ahora } },
    });
  }

  async actualizarFrecuenciaYEntrenador(
    id: string,
    frecuencia: FrecuenciaPago,
    incluyeEntrenador: boolean
  ): Promise<Plan> {
    const plan = await this.prisma.plan.update({
      where: { id },
      data: { frecuencia, incluyeEntrenador },
    });

    return mapear(plan);
  }
}
