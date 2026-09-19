import { IUsuarioAdminRepository } from "../ports/IUsuarioAdminRepository";
import { IPasswordHasher } from "../ports/IPasswordHasher";

export interface CambiarPasswordDeps {
  usuarios: IUsuarioAdminRepository;
  hasher: IPasswordHasher;
}

export interface CambiarPasswordInput {
  usuarioId: string;
  passwordActual: string;
  passwordNueva: string;
}

export class PasswordActualIncorrectaError extends Error {
  constructor() {
    super("La contraseña actual es incorrecta.");
  }
}

export class PasswordNuevaInvalidaError extends Error {
  constructor() {
    super("La nueva contraseña debe tener al menos 8 caracteres.");
  }
}

export async function cambiarPassword(
  deps: CambiarPasswordDeps,
  input: CambiarPasswordInput
): Promise<void> {
  if (input.passwordNueva.length < 8) {
    throw new PasswordNuevaInvalidaError();
  }

  const hashActual = await deps.usuarios.buscarPasswordHashPorId(input.usuarioId);
  if (!hashActual) {
    throw new PasswordActualIncorrectaError();
  }

  const esValida = await deps.hasher.comparar(input.passwordActual, hashActual);
  if (!esValida) {
    throw new PasswordActualIncorrectaError();
  }

  const nuevoHash = await deps.hasher.hash(input.passwordNueva);
  await deps.usuarios.actualizarPassword(input.usuarioId, nuevoHash);
}
