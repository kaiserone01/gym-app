import { ICheckInRepository } from "../ports/ICheckInRepository";
import { EstadisticaCheckInPorSucursal } from "../entities/CheckIn";

export interface ObtenerEstadisticasCheckInDeps {
  checkIns: ICheckInRepository;
}

export interface ObtenerEstadisticasCheckInInput {
  organizacionId: string;
  desde: Date;
  hasta: Date;
}

export async function obtenerEstadisticasCheckIn(
  deps: ObtenerEstadisticasCheckInDeps,
  input: ObtenerEstadisticasCheckInInput
): Promise<EstadisticaCheckInPorSucursal[]> {
  return deps.checkIns.contarPorSucursalYRangoDeFechas(input.organizacionId, input.desde, input.hasta);
}
