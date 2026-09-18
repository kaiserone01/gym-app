import { ArqueoLinea, DatosNuevaArqueoLinea } from "../entities/ArqueoLinea";

export interface IArqueoRepository {
  crearLineas(lineas: DatosNuevaArqueoLinea[]): Promise<ArqueoLinea[]>;
  listarPorTurno(turnoId: string): Promise<ArqueoLinea[]>;
}
