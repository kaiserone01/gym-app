import { IMetodoPagoRepository } from "../ports/IMetodoPagoRepository";
import { MetodoPago } from "../entities/MetodoPago";

export async function listarMetodosPago(
  deps: { metodosPago: IMetodoPagoRepository },
  organizacionId: string
): Promise<MetodoPago[]> {
  return deps.metodosPago.listarPorOrganizacion(organizacionId);
}

export async function listarMetodosPagoActivos(
  deps: { metodosPago: IMetodoPagoRepository },
  organizacionId: string
): Promise<MetodoPago[]> {
  return deps.metodosPago.listarActivosPorOrganizacion(organizacionId);
}
