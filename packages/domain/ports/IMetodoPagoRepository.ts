import { MetodoPago, DatosNuevoMetodoPago, CambiosMetodoPago } from "../entities/MetodoPago";

export interface IMetodoPagoRepository {
  listarPorOrganizacion(organizacionId: string): Promise<MetodoPago[]>;
  listarActivosPorOrganizacion(organizacionId: string): Promise<MetodoPago[]>;
  buscarPorId(organizacionId: string, id: string): Promise<MetodoPago | null>;
  crear(datos: DatosNuevoMetodoPago): Promise<MetodoPago>;
  actualizar(organizacionId: string, id: string, cambios: CambiosMetodoPago): Promise<MetodoPago | null>;
}
