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

  // Sesiones creadas antes de que el login pidiera elegir sucursal (ver
  // IniciarSesion) pueden tener sucursalActivaId=null en la base (la
  // columna es opcional ahí, Sesion.sucursalActivaId — ver
  // packages/db/prisma/schema.prisma). Sin esta sucursal, cualquier
  // pantalla del panel truena al intentar buscar el turno abierto
  // (Prisma exige un sucursalId no-null). Se trata como sesión inválida:
  // se elimina y se fuerza un login nuevo, que sí completa el flujo de
  // selección de sucursal antes de crear la sesión.
  if (!sesion.sucursalActivaId) {
    await deps.sesiones.eliminarPorToken(token);
    return null;
  }

  return { usuario, sucursalActivaId: sesion.sucursalActivaId };
}
