import { Egreso, DatosNuevoEgreso } from "../entities/Egreso";

export interface IEgresoRepository {
  crear(datos: DatosNuevoEgreso): Promise<Egreso>;
  listarPorTurno(turnoId: string): Promise<Egreso[]>;
}
