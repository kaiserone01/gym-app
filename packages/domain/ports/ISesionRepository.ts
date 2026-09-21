import { Sesion } from "../entities/Sesion";

export interface ISesionRepository {
  crear(datos: { usuarioId: string; token: string; expiraEn: Date; sucursalActivaId: string }): Promise<Sesion>;
  buscarPorToken(token: string): Promise<Sesion | null>;
  eliminarPorToken(token: string): Promise<void>;
}
