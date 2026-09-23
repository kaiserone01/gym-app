import { IUsuarioAdminRepository } from "../ports/IUsuarioAdminRepository";
import { RolUsuario } from "../entities/UsuarioAdmin";

export class RolNoAutorizadoError extends Error {
  constructor() {
    super("Solo el socio puede eliminar usuarios.");
  }
}

export class UsuarioNoEncontradoError extends Error {
  constructor() {
    super("No se encontró el usuario.");
  }
}

export class AutoEliminacionError extends Error {
  constructor() {
    super("No podés eliminar tu propio usuario.");
  }
}

export class UsuarioConHistorialError extends Error {
  constructor() {
    super("No se puede eliminar: el usuario tiene turnos, pagos o miembros asignados en el sistema.");
  }
}

export async function eliminarUsuarioAdmin(
  deps: { usuarios: IUsuarioAdminRepository },
  input: { organizacionId: string; rolSolicitante: RolUsuario; usuarioIdSolicitante: string; id: string }
): Promise<void> {
  if (input.rolSolicitante !== "SOCIO") {
    throw new RolNoAutorizadoError();
  }

  if (input.id === input.usuarioIdSolicitante) {
    throw new AutoEliminacionError();
  }

  const existente = await deps.usuarios.buscarPorId(input.organizacionId, input.id);
  if (!existente) {
    throw new UsuarioNoEncontradoError();
  }

  // Borrado físico (ver IUsuarioAdminRepository.eliminar) — sin onDelete: Cascade
  // en turnos/pagos/miembros asignados, cualquier historial asociado hace que
  // la base rechace el delete por integridad referencial. Se traduce a un
  // error de dominio legible en vez de dejar que el 500 crudo llegue al cliente.
  try {
    await deps.usuarios.eliminar(input.id);
  } catch {
    throw new UsuarioConHistorialError();
  }
}
