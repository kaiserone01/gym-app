import { UsuarioAdmin, RolUsuario } from "../entities/UsuarioAdmin";

export interface IUsuarioAdminRepository {
  crear(datos: {
    organizacionId: string;
    sucursalId: string | null;
    email: string;
    passwordHash: string;
    rol: RolUsuario;
  }): Promise<UsuarioAdmin>;
}
