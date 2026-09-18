import { Turno, DatosNuevoTurno } from "../entities/Turno";

export interface ITurnoRepository {
  crear(datos: DatosNuevoTurno): Promise<Turno>;
  buscarPorId(organizacionId: string, id: string): Promise<Turno | null>;
  buscarAbiertoPorSucursal(sucursalId: string): Promise<Turno | null>;
  cerrar(id: string, cerradoEn: Date): Promise<Turno>;
  listarPorOrganizacionYRango(organizacionId: string, desde: Date, hasta: Date): Promise<Turno[]>;
}
