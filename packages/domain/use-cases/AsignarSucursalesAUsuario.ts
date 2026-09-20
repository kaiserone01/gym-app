import { IUsuarioAdminRepository } from "../ports/IUsuarioAdminRepository";
import { IUsuarioSucursalRepository } from "../ports/IUsuarioSucursalRepository";
import { ISucursalRepository } from "../ports/ISucursalRepository";
import { RolUsuario } from "../entities/UsuarioAdmin";

export class RolNoAutorizadoError extends Error {
  constructor() {
    super("Solo el socio puede administrar usuarios.");
  }
}

export class UsuarioNoEncontradoError extends Error {
  constructor() {
    super("No se encontró el usuario.");
  }
}

export class SucursalInvalidaError extends Error {
  constructor() {
    super("Alguna de las sucursales indicadas no existe en tu organización.");
  }
}

export async function asignarSucursalesAUsuario(
  deps: {
    usuarios: IUsuarioAdminRepository;
    usuarioSucursales: IUsuarioSucursalRepository;
    sucursales: ISucursalRepository;
  },
  input: { organizacionId: string; rolSolicitante: RolUsuario; usuarioId: string; sucursalIds: string[] }
): Promise<void> {
  if (input.rolSolicitante !== "SOCIO") {
    throw new RolNoAutorizadoError();
  }

  const existente = await deps.usuarios.buscarPorId(input.organizacionId, input.usuarioId);
  if (!existente) {
    throw new UsuarioNoEncontradoError();
  }

  // Aislamiento entre organizaciones: las sucursales deben ser de esta organización.
  if (input.sucursalIds.length > 0) {
    const sucursalesDeLaOrganizacion = await deps.sucursales.listarPorOrganizacion(input.organizacionId);
    const idsValidos = new Set(sucursalesDeLaOrganizacion.map((s) => s.id));
    if (input.sucursalIds.some((id) => !idsValidos.has(id))) {
      throw new SucursalInvalidaError();
    }
  }

  await deps.usuarioSucursales.reemplazarTodas(input.usuarioId, input.sucursalIds);
}
