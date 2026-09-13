import { UsuarioAdmin, RolUsuario } from "../entities/UsuarioAdmin";

export interface IUsuarioAdminRepository {
  crear(datos: {
    organizacionId: string;
    sucursalId: string | null;
    email: string;
    passwordHash: string;
    rol: RolUsuario;
  }): Promise<UsuarioAdmin>;
  buscarPorId(id: string): Promise<UsuarioAdmin | null>;
  buscarCredencialesPorEmail(
    email: string
  ): Promise<{ usuario: UsuarioAdmin; passwordHash: string } | null>;
}
