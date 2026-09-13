import { Sucursal } from "../entities/Sucursal";

export interface ISucursalRepository {
  buscarPorApiKey(apiKey: string): Promise<Sucursal | null>;
}
