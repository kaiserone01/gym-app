import { CheckIn, CheckInEnSala, EstadoCheckIn } from "../entities/CheckIn";

export interface ICheckInRepository {
  buscarRecientePorMiembroYSucursal(
    miembroId: string,
    sucursalId: string,
    desde: Date
  ): Promise<CheckIn | null>;
  crear(datos: { sucursalId: string; miembroId: string; estadoAlMomento: EstadoCheckIn }): Promise<CheckIn>;
  // Check-ins de la sucursal desde `desde` que todavía no tienen salida, del más reciente al más antiguo.
  listarEnSala(sucursalId: string, desde: Date): Promise<CheckInEnSala[]>;
  // Cierra todos los check-ins abiertos del miembro en esa sucursal desde `desde`.
  marcarSalida(sucursalId: string, miembroId: string, desde: Date, salidaAt: Date): Promise<void>;
}
