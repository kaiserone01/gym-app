import { ISesionRepository } from "../ports/ISesionRepository";
import { IUsuarioAdminRepository } from "../ports/IUsuarioAdminRepository";
import { UsuarioAdmin } from "../entities/UsuarioAdmin";

export interface ValidarSesionDeps {
  sesiones: ISesionRepository;
  usuarios: IUsuarioAdminRepository;
}

export interface SesionValidada {
  usuario: UsuarioAdmin;
  sucursalActivaId: string;
}

export async function validarSesion(deps: ValidarSesionDeps, token: string): Promise<SesionValidada | null> {
  const sesion = await deps.sesiones.buscarPorToken(token);

  if (!sesion) {
    return null;
  }

  if (sesion.expiraEn <= new Date()) {
    await deps.sesiones.eliminarPorToken(token);
    return null;
  }

  const usuario = await deps.usuarios.buscarPorIdSinOrganizacion(sesion.usuarioId);
  if (!usuario) {
    return null;
  }

  return { usuario, sucursalActivaId: sesion.sucursalActivaId };
}
