import { Turno, DatosNuevoTurno } from "../entities/Turno";

export interface ITurnoRepository {
  crear(datos: DatosNuevoTurno): Promise<Turno>;
  buscarPorId(organizacionId: string, id: string): Promise<Turno | null>;
  buscarAbiertoPorSucursal(sucursalId: string): Promise<Turno | null>;
  cerrar(id: string, cerradoEn: Date): Promise<Turno>;
  listarPorOrganizacionYRango(organizacionId: string, desde: Date, hasta: Date): Promise<Turno[]>;
  // Un Date por cada día distinto (en la zona horaria del servidor, ver
  // TZ=America/Caracas) en que se abrió al menos un turno de esta
  // organización — usado para deshabilitar días sin actividad en el
  // calendario de Histórico de Pagos.
  listarFechasConTurno(organizacionId: string): Promise<Date[]>;
}
