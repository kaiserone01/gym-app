import { randomBytes } from "node:crypto";
import { IUsuarioAdminRepository } from "../ports/IUsuarioAdminRepository";
import { IPasswordHasher } from "../ports/IPasswordHasher";
import { ISesionRepository } from "../ports/ISesionRepository";
import { UsuarioAdmin } from "../entities/UsuarioAdmin";

const DURACION_SESION_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

export interface IniciarSesionDeps {
  usuarios: IUsuarioAdminRepository;
  hasher: IPasswordHasher;
  sesiones: ISesionRepository;
}

export interface IniciarSesionInput {
  email: string;
  password: string;
  sucursalActivaId: string;
}

export interface IniciarSesionResultado {
  token: string;
  expiraEn: Date;
  usuario: UsuarioAdmin;
}

export class CredencialesInvalidasError extends Error {
  constructor() {
    super("Email o contraseña incorrectos.");
  }
}

export async function iniciarSesion(
  deps: IniciarSesionDeps,
  input: IniciarSesionInput
): Promise<IniciarSesionResultado> {
  const credenciales = await deps.usuarios.buscarCredencialesPorEmail(input.email);

  if (!credenciales) {
    throw new CredencialesInvalidasError();
  }

  const passwordValido = await deps.hasher.comparar(input.password, credenciales.passwordHash);

  if (!passwordValido) {
    throw new CredencialesInvalidasError();
  }

  const token = randomBytes(32).toString("hex");
  const expiraEn = new Date(Date.now() + DURACION_SESION_MS);

  await deps.sesiones.crear({ usuarioId: credenciales.usuario.id, token, expiraEn, sucursalActivaId: input.sucursalActivaId });

  return { token, expiraEn, usuario: credenciales.usuario };
}
