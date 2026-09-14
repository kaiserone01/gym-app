import { ISucursalRepository } from "../ports/ISucursalRepository";
import { SucursalResumen } from "../entities/SucursalResumen";

export async function listarSucursales(
  deps: { sucursales: ISucursalRepository },
  organizacionId: string
): Promise<SucursalResumen[]> {
  return deps.sucursales.listarPorOrganizacion(organizacionId);
}
