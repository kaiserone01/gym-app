import { Turno, DatosNuevoTurno } from "../entities/Turno";

export interface ITurnoRepository {
  crear(datos: DatosNuevoTurno): Promise<Turno>;
  buscarPorId(organizacionId: string, id: string): Promise<Turno | null>;
  buscarAbiertoPorSucursal(sucursalId: string): Promise<Turno | null>;
  // Para un SOCIO (sin sucursalId fijo, ve varias sucursales): busca el
  // turno abierto entre esa lista, sin importar en cuál esté — solo puede
  // haber uno abierto a la vez por sucursal, así que a lo sumo hay un
  // resultado real entre todas (ver bug de /caja: la página no podía
  // encontrar el turno recién abierto porque solo miraba usuario.sucursalId).
  buscarAbiertoEntreSucursales(sucursalIds: string[]): Promise<Turno | null>;
  cerrar(id: string, cerradoEn: Date): Promise<Turno>;
  listarPorOrganizacionYRango(organizacionId: string, desde: Date, hasta: Date): Promise<Turno[]>;
  // Un Date por cada día distinto (en la zona horaria del servidor, ver
  // TZ=America/Caracas) en que se abrió al menos un turno de esta
  // organización — usado para deshabilitar días sin actividad en el
  // calendario de Histórico de Pagos.
  listarFechasConTurno(organizacionId: string): Promise<Date[]>;
}
