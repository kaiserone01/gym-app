import { IUsuarioAdminRepository } from "../ports/IUsuarioAdminRepository";
import { IAuthorizationService } from "../ports/IAuthorizationService";
import { UsuarioAdmin, CambiosUsuarioAdmin, RolUsuario } from "../entities/UsuarioAdmin";

export class RolNoAutorizadoError extends Error {
  constructor() {
    super("Solo el dueño puede administrar usuarios.");
  }
}

export class UsuarioNoEncontradoError extends Error {
  constructor() {
    super("No se encontró el usuario.");
  }
}

export class AutoDesactivacionError extends Error {
  constructor() {
    super("No podés darte de baja a vos mismo.");
  }
}

export async function actualizarUsuarioAdmin(
  deps: { usuarios: IUsuarioAdminRepository },
  input: {
    organizacionId: string;
    rolSolicitante: RolUsuario;
    usuarioIdSolicitante: string;
    id: string;
    cambios: CambiosUsuarioAdmin;
  }
): Promise<UsuarioAdmin> {
  if (input.rolSolicitante !== "DUENO") {
    throw new RolNoAutorizadoError();
  }

  // Evita el lockout irreversible: nadie puede desactivar su propia cuenta.
  if (input.cambios.activo === false && input.id === input.usuarioIdSolicitante) {
    throw new AutoDesactivacionError();
  }

  const actualizado = await deps.usuarios.actualizar(input.organizacionId, input.id, input.cambios);
  if (!actualizado) {
    throw new UsuarioNoEncontradoError();
  }

  return actualizado;
}
