import { IUsuarioAdminRepository } from "../ports/IUsuarioAdminRepository";
import { UsuarioAdmin } from "../entities/UsuarioAdmin";

export async function listarUsuariosAdmin(
  deps: { usuarios: IUsuarioAdminRepository },
  organizacionId: string
): Promise<UsuarioAdmin[]> {
  return deps.usuarios.listarPorOrganizacion(organizacionId);
}
