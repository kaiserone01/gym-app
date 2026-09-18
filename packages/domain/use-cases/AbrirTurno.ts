import { ITurnoRepository } from "../ports/ITurnoRepository";
import { Turno } from "../entities/Turno";
import { RolUsuario } from "../entities/UsuarioAdmin";

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

export interface DatosAbrirTurno {
  organizacionId: string;
  sucursalId: string;
  usuarioId: string;
  rolUsuario: RolUsuario;
  fondoInicialUSD: number;
  fondoInicialBs: number;
}

export async function abrirTurno(
  deps: { turnos: ITurnoRepository },
  input: DatosAbrirTurno
): Promise<Turno> {
  if (input.rolUsuario === "ENTRENADOR") {
    throw new RolNoAutorizadoError();
  }

  const abierto = await deps.turnos.buscarAbiertoPorSucursal(input.sucursalId);
  if (abierto) {
    throw new TurnoYaAbiertoError();
  }

  return deps.turnos.crear({
    organizacionId: input.organizacionId,
    sucursalId: input.sucursalId,
    usuarioId: input.usuarioId,
    fondoInicialUSD: input.fondoInicialUSD,
    fondoInicialBs: input.fondoInicialBs,
  });
}
