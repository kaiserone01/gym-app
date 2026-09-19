import { CheckIn, EstadisticaCheckInPorSucursal, EstadoCheckIn } from "../entities/CheckIn";

export interface ICheckInRepository {
  buscarRecientePorMiembroYSucursal(
    miembroId: string,
    sucursalId: string,
    desde: Date
  ): Promise<CheckIn | null>;
  crear(datos: { sucursalId: string; miembroId: string; estadoAlMomento: EstadoCheckIn }): Promise<CheckIn>;
  contarPorSucursalYRangoDeFechas(
    organizacionId: string,
    desde: Date,
    hasta: Date
  ): Promise<EstadisticaCheckInPorSucursal[]>;
}
