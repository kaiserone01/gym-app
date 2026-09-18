import { Sucursal, CambiosSucursal, DatosNuevaSucursal } from "../entities/Sucursal";
import { SucursalResumen } from "../entities/SucursalResumen";

export interface ISucursalRepository {
  buscarPorApiKey(apiKey: string): Promise<Sucursal | null>;
  buscarPorId(organizacionId: string, id: string): Promise<Sucursal | null>;
  listarPorOrganizacion(organizacionId: string): Promise<SucursalResumen[]>;
  crear(datos: DatosNuevaSucursal): Promise<Sucursal>;
  actualizar(organizacionId: string, id: string, cambios: CambiosSucursal): Promise<Sucursal | null>;
}
