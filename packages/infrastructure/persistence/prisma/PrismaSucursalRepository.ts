import type { PrismaClient } from "@gym-app/db/generated/prisma/client";
import type { ISucursalRepository } from "@gym-app/domain/ports/ISucursalRepository";
import type { Sucursal, CambiosSucursal, DatosNuevaSucursal } from "@gym-app/domain/entities/Sucursal";
import type { SucursalResumen } from "@gym-app/domain/entities/SucursalResumen";

function mapear(sucursal: {
  id: string;
  organizacionId: string;
  nombre: string;
  direccion: string | null;
  diasGracia: number;
  activo: boolean;
  apiKey: string;
}): Sucursal {
  return {
    id: sucursal.id,
    organizacionId: sucursal.organizacionId,
    nombre: sucursal.nombre,
    direccion: sucursal.direccion,
    diasGracia: sucursal.diasGracia,
    activo: sucursal.activo,
    apiKey: sucursal.apiKey,
  };
}

export class PrismaSucursalRepository implements ISucursalRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async buscarPorApiKey(apiKey: string): Promise<Sucursal | null> {
    const sucursal = await this.prisma.sucursal.findUnique({ where: { apiKey } });
    return sucursal ? mapear(sucursal) : null;
  }

  async buscarPorId(organizacionId: string, id: string): Promise<Sucursal | null> {
    const sucursal = await this.prisma.sucursal.findFirst({ where: { id, organizacionId } });
    return sucursal ? mapear(sucursal) : null;
  }

  async listarPorOrganizacion(organizacionId: string): Promise<SucursalResumen[]> {
    return this.prisma.sucursal.findMany({
      where: { organizacionId },
      select: { id: true, nombre: true, activo: true },
      orderBy: { nombre: "asc" },
    });
  }

  async crear(datos: DatosNuevaSucursal): Promise<Sucursal> {
    const sucursal = await this.prisma.sucursal.create({
      data: {
        organizacionId: datos.organizacionId,
        nombre: datos.nombre,
        direccion: datos.direccion,
        diasGracia: datos.diasGracia,
      },
    });
    return mapear(sucursal);
  }

  async actualizar(organizacionId: string, id: string, cambios: CambiosSucursal): Promise<Sucursal | null> {
    const existente = await this.prisma.sucursal.findFirst({ where: { id, organizacionId } });
    if (!existente) return null;

    const sucursal = await this.prisma.sucursal.update({ where: { id }, data: cambios });
    return mapear(sucursal);
  }
}
