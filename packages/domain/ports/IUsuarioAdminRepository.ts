import { UsuarioAdmin, CambiosUsuarioAdmin, RolUsuario } from "../entities/UsuarioAdmin";

export interface IUsuarioAdminRepository {
  crear(datos: {
    organizacionId: string;
    sucursalId: string | null;
    nombre: string;
    email: string;
    passwordHash: string;
    rol: RolUsuario;
    telefono?: string | null;
    fotoUrl?: string | null;
  }): Promise<UsuarioAdmin>;
  buscarPorId(organizacionId: string, id: string): Promise<UsuarioAdmin | null>;
  buscarPorIdSinOrganizacion(id: string): Promise<UsuarioAdmin | null>;
  buscarCredencialesPorEmail(
    email: string
  ): Promise<{ usuario: UsuarioAdmin; passwordHash: string } | null>;
  listarPorOrganizacion(organizacionId: string): Promise<UsuarioAdmin[]>;
  actualizar(organizacionId: string, id: string, cambios: CambiosUsuarioAdmin): Promise<UsuarioAdmin | null>;
  /**
   * Borrado físico. Usado para compensar una creación parcialmente fallida
   * (ver CrearUsuarioAdmin) y por EliminarUsuarioAdmin (papelera en /usuarios).
   * Sin onDelete: Cascade en el schema — falla si el usuario tiene turnos,
   * pagos o miembros asignados; EliminarUsuarioAdmin traduce eso a un error
   * de dominio legible.
   */
  eliminar(id: string): Promise<void>;
  buscarPasswordHashPorId(id: string): Promise<string | null>;
  actualizarPassword(id: string, passwordHash: string): Promise<void>;
}
