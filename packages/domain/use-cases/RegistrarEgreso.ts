import { ITurnoRepository } from "../ports/ITurnoRepository";
import { IEgresoRepository } from "../ports/IEgresoRepository";
import { Egreso, MonedaEgreso } from "../entities/Egreso";
import { RolUsuario } from "../entities/UsuarioAdmin";

export class RolNoAutorizadoError extends Error {
  constructor() {
    super("Tu rol no tiene permiso para realizar esta acción.");
  }
}

export class TurnoCerradoError extends Error {
  constructor() {
    super("No se pueden registrar egresos en un turno cerrado.");
  }
}

export class TurnoNoEncontradoError extends Error {
  constructor() {
    super("No se encontró el turno.");
  }
}

export class MotivoRequeridoError extends Error {
  constructor() {
    super("El motivo del egreso es requerido.");
  }
}

export interface DatosRegistrarEgreso {
  organizacionId: string;
  sucursalIdUsuario: string | null;
  turnoId: string;
  rolUsuario: RolUsuario;
  monto: number;
  moneda: MonedaEgreso;
  metodo: string;
  motivo: string;
}

export async function registrarEgreso(
  deps: { turnos: ITurnoRepository; egresos: IEgresoRepository },
  input: DatosRegistrarEgreso
): Promise<Egreso> {
  if (input.rolUsuario === "ENTRENADOR") {
    throw new RolNoAutorizadoError();
  }

  const turno = await deps.turnos.buscarPorId(input.organizacionId, input.turnoId);
  if (!turno) {
    throw new TurnoNoEncontradoError();
  }
  if (input.sucursalIdUsuario && turno.sucursalId !== input.sucursalIdUsuario) {
    throw new TurnoNoEncontradoError();
  }
  if (turno.estado === "CERRADO") {
    throw new TurnoCerradoError();
  }

  if (!input.motivo.trim()) {
    throw new MotivoRequeridoError();
  }

  return deps.egresos.crear({
    turnoId: input.turnoId,
    monto: input.monto,
    moneda: input.moneda,
    metodo: input.metodo,
    motivo: input.motivo.trim(),
  });
}
