import { Sucursal } from "../entities/Sucursal";
import { SucursalResumen } from "../entities/SucursalResumen";

export interface ISucursalRepository {
  buscarPorApiKey(apiKey: string): Promise<Sucursal | null>;
  listarPorOrganizacion(organizacionId: string): Promise<SucursalResumen[]>;
}
