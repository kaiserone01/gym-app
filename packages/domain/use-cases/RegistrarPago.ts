import { IPagoRepository } from "../ports/IPagoRepository";
import { ISuscripcionRepository } from "../ports/ISuscripcionRepository";
import { IMemberRepository } from "../ports/IMemberRepository";
import { IPlanRepository } from "../ports/IPlanRepository";
import { ITurnoRepository } from "../ports/ITurnoRepository";
import { Pago } from "../entities/Pago";
import { RolUsuario } from "../entities/UsuarioAdmin";
import { IAuthorizationService } from "../ports/IAuthorizationService";
import { DURACION_DIAS_POR_FRECUENCIA } from "../entities/Plan";

export class MiembroNoEncontradoError extends Error {
  constructor() {
    super("No se encontró el miembro.");
  }
}

export class PlanNoEncontradoError extends Error {
  constructor() {
    super("No se encontró el plan.");
  }
}

export class PlanInactivoError extends Error {
  constructor() {
    super("No se puede registrar un pago contra un plan inactivo.");
  }
}

export class RolNoAutorizadoError extends Error {
  constructor() {
    super("Tu rol no tiene permiso para registrar pagos.");
  }
}

export interface RegistrarPagoDeps {
  pagos: IPagoRepository;
  suscripciones: ISuscripcionRepository;
  miembros: IMemberRepository;
  planes: IPlanRepository;
  turnos: ITurnoRepository;
  autorizacion: IAuthorizationService;
}

export interface DatosRegistrarPago {
  organizacionId: string;
  miembroId: string;
  planId: string;
  monto: number;
  metodo: string;
  numeroOperacion: string | null;
  tasaCambio: number | null;
  sucursalId: string;
  registradoPorId: string;
  rolUsuario: RolUsuario;
}

export async function registrarPago(deps: RegistrarPagoDeps, input: DatosRegistrarPago): Promise<Pago> {
  if (!(await deps.autorizacion.tienePermiso(input.registradoPorId, "PAGOS", "CREAR"))) {
    throw new RolNoAutorizadoError();
  }

  const miembro = await deps.miembros.buscarPorId(input.organizacionId, input.miembroId);
  if (!miembro) {
    throw new MiembroNoEncontradoError();
  }

  const plan = await deps.planes.buscarPorId(input.organizacionId, input.planId);
  if (!plan) {
    throw new PlanNoEncontradoError();
  }
  if (!plan.activo) {
    throw new PlanInactivoError();
  }

  const ahora = new Date();
  const activa = await deps.suscripciones.buscarActivaVigentePorMiembroYPlan(input.miembroId, input.planId, ahora);

  const base = activa && activa.fin > ahora ? activa.fin : ahora;
  const fin = new Date(base);
  fin.setDate(fin.getDate() + DURACION_DIAS_POR_FRECUENCIA[plan.frecuencia]);

  if (activa) {
    await deps.suscripciones.extenderFin(activa.id, fin);
  } else {
    await deps.suscripciones.crear({ miembroId: input.miembroId, planId: input.planId, inicio: ahora, fin });
  }

  await deps.miembros.actualizar(input.organizacionId, input.miembroId, { planId: input.planId });
  await deps.miembros.actualizarFechasPago(input.miembroId, ahora, fin);

  const turnoAbierto = await deps.turnos.buscarAbiertoPorSucursal(input.sucursalId);

  return deps.pagos.crear({
    miembroId: input.miembroId,
    sucursalId: input.sucursalId,
    turnoId: turnoAbierto?.id ?? null,
    registradoPorId: input.registradoPorId,
    monto: input.monto,
    metodo: input.metodo,
    numeroOperacion: input.numeroOperacion,
    tasaCambio: input.tasaCambio,
    montoBs: input.tasaCambio !== null ? input.monto * input.tasaCambio : null,
  });
}
