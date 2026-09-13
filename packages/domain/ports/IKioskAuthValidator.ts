import { Sucursal } from "../entities/Sucursal";

export interface IKioskAuthValidator {
  validar(apiKey: string): Promise<Sucursal | null>;
}
