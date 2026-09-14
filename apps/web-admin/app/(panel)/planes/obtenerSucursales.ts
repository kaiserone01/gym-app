import { prisma } from "@/lib/prisma";
import { PrismaSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSucursalRepository";
import { listarSucursales } from "@gym-app/domain/use-cases/ListarSucursales";
import type { SucursalResumen } from "@gym-app/domain/entities/SucursalResumen";

export async function obtenerSucursalesDeLaOrganizacion(organizacionId: string): Promise<SucursalResumen[]> {
  return listarSucursales({ sucursales: new PrismaSucursalRepository(prisma) }, organizacionId);
}
