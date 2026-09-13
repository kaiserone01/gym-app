import { Sesion } from "../entities/Sesion";

export interface ISesionRepository {
  crear(datos: { usuarioId: string; token: string; expiraEn: Date }): Promise<Sesion>;
  buscarPorToken(token: string): Promise<Sesion | null>;
  eliminarPorToken(token: string): Promise<void>;
}
