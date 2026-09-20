import { ITurnoRepository } from "../ports/ITurnoRepository";
import { IEgresoRepository } from "../ports/IEgresoRepository";
import { Egreso, MonedaEgreso } from "../entities/Egreso";
import { RolUsuario } from "../entities/UsuarioAdmin";
import { IAuthorizationService } from "../ports/IAuthorizationService";

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

export class TasaRequeridaError extends Error {
  constructor() {
    super("Se requiere la tasa de cambio para registrar un egreso en bolívares.");
  }
}

export interface DatosRegistrarEgreso {
  organizacionId: string;
  sucursalIdUsuario: string | null;
  usuarioIdSolicitante: string;
  turnoId: string;
  rolUsuario: RolUsuario;
  monto: number;
  moneda: MonedaEgreso;
  // Tasa BCV vigente al momento del registro — requerida cuando
  // moneda === "BS" (ver Egreso.tasaCambio/montoUSD), ignorada si es "USD".
  tasaCambio: number | null;
  metodo: string;
  motivo: string;
}

export async function registrarEgreso(
  deps: { turnos: ITurnoRepository; egresos: IEgresoRepository; autorizacion: IAuthorizationService },
  input: DatosRegistrarEgreso
): Promise<Egreso> {
  if (!(await deps.autorizacion.tienePermiso(input.usuarioIdSolicitante, "CAJA", "CREAR"))) {
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

  if (input.moneda === "BS" && (input.tasaCambio === null || input.tasaCambio <= 0)) {
    throw new TasaRequeridaError();
  }

  const tasaCambio = input.moneda === "BS" ? input.tasaCambio : null;
  // Referencia en USD: para USD es el mismo monto; para BS se convierte con
  // la tasa capturada al momento del registro (ver Egreso.montoUSD).
  const montoUSD = input.moneda === "USD" ? input.monto : input.monto / tasaCambio!;

  return deps.egresos.crear({
    turnoId: input.turnoId,
    monto: input.monto,
    moneda: input.moneda,
    tasaCambio,
    montoUSD,
    metodo: input.metodo,
    motivo: input.motivo.trim(),
  });
}
