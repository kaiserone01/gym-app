import { ITurnoRepository } from "../ports/ITurnoRepository";
import { ISucursalRepository } from "../ports/ISucursalRepository";
import { Turno } from "../entities/Turno";
import { RolUsuario } from "../entities/UsuarioAdmin";
import { IAuthorizationService } from "../ports/IAuthorizationService";

export class RolNoAutorizadoError extends Error {
  constructor() {
    super("Tu rol no tiene permiso para realizar esta acción.");
  }
}

export class TurnoYaAbiertoError extends Error {
  constructor() {
    super("Ya hay un turno abierto en esta sucursal.");
  }
}

export class SucursalNoEncontradaError extends Error {
  constructor() {
    super("La sucursal indicada no existe en tu organización.");
  }
}

export interface DatosAbrirTurno {
  organizacionId: string;
  sucursalId: string;
  usuarioId: string;
  rolUsuario: RolUsuario;
  fondoInicialEfectivoUSD: number;
  fondoInicialEfectivoBs: number;
}

export async function abrirTurno(
  deps: { turnos: ITurnoRepository; sucursales: ISucursalRepository; autorizacion: IAuthorizationService },
  input: DatosAbrirTurno
): Promise<Turno> {
  if (!(await deps.autorizacion.tienePermiso(input.usuarioId, "CAJA", "CREAR"))) {
    throw new RolNoAutorizadoError();
  }

  const sucursalesDeLaOrganizacion = await deps.sucursales.listarPorOrganizacion(input.organizacionId);
  if (!sucursalesDeLaOrganizacion.some((s) => s.id === input.sucursalId)) {
    throw new SucursalNoEncontradaError();
  }

  const abierto = await deps.turnos.buscarAbiertoPorSucursal(input.sucursalId);
  if (abierto) {
    throw new TurnoYaAbiertoError();
  }

  return deps.turnos.crear({
    organizacionId: input.organizacionId,
    sucursalId: input.sucursalId,
    usuarioId: input.usuarioId,
    fondoInicialEfectivoUSD: input.fondoInicialEfectivoUSD,
    fondoInicialEfectivoBs: input.fondoInicialEfectivoBs,
  });
}
