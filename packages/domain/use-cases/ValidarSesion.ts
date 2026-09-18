import { ISesionRepository } from "../ports/ISesionRepository";
import { IUsuarioAdminRepository } from "../ports/IUsuarioAdminRepository";
import { UsuarioAdmin } from "../entities/UsuarioAdmin";

export interface ValidarSesionDeps {
  sesiones: ISesionRepository;
  usuarios: IUsuarioAdminRepository;
}

export async function validarSesion(deps: ValidarSesionDeps, token: string): Promise<UsuarioAdmin | null> {
  const sesion = await deps.sesiones.buscarPorToken(token);

  if (!sesion) {
    return null;
  }

  if (sesion.expiraEn <= new Date()) {
    await deps.sesiones.eliminarPorToken(token);
    return null;
  }

  return deps.usuarios.buscarPorIdSinOrganizacion(sesion.usuarioId);
}
