import { IPlanRepository } from "../ports/IPlanRepository";
import { ISuscripcionRepository } from "../ports/ISuscripcionRepository";
import { Plan, FrecuenciaPago } from "../entities/Plan";
import { RolUsuario } from "../entities/UsuarioAdmin";
import { prorratearVencimiento } from "./CalcularVencimientoPlan";

export class RolNoAutorizadoError extends Error {
  constructor() {
    super("Solo el socio puede cambiar la frecuencia o el entrenador de un plan.");
  }
}

export class PlanNoEncontradoError extends Error {
  constructor() {
    super("No se encontró el plan.");
  }
}

export class ConfirmacionInvalidaError extends Error {
  constructor() {
    super("Debés tipear el nombre exacto del plan para confirmar el cambio.");
  }
}

export interface ActualizarFrecuenciaPlanDeps {
  planes: IPlanRepository;
  suscripciones: ISuscripcionRepository;
}

export interface ActualizarFrecuenciaPlanInput {
  organizacionId: string;
  rolSolicitante: RolUsuario;
  planId: string;
  frecuencia: FrecuenciaPago;
  incluyeEntrenador: boolean;
  // Debe coincidir exactamente con el nombre actual del Plan (confirmación
  // de doble alerta antes de un cambio masivo).
  confirmacion: string;
  // true = no recalcular ninguna Suscripción activa vigente (se deja tal
  // cual); false = prorratear el vencimiento de todas según la nueva frecuencia.
  exonerar: boolean;
}

export async function actualizarFrecuenciaPlan(
  deps: ActualizarFrecuenciaPlanDeps,
  input: ActualizarFrecuenciaPlanInput
): Promise<Plan> {
  if (input.rolSolicitante !== "SOCIO") {
    throw new RolNoAutorizadoError();
  }

  const plan = await deps.planes.buscarPorId(input.organizacionId, input.planId);
  if (!plan) {
    throw new PlanNoEncontradoError();
  }

  if (input.confirmacion.trim() !== plan.nombre) {
    throw new ConfirmacionInvalidaError();
  }

  const frecuenciaVieja = plan.frecuencia;
  const actualizado = await deps.planes.actualizarFrecuenciaYEntrenador(
    input.planId,
    input.frecuencia,
    input.incluyeEntrenador
  );

  if (!input.exonerar && frecuenciaVieja !== input.frecuencia) {
    const ahora = new Date();
    const activas = await deps.suscripciones.listarActivasVigentesPorPlan(input.planId, ahora);

    for (const suscripcion of activas) {
      const nuevoFin = prorratearVencimiento(suscripcion.inicio, ahora, frecuenciaVieja, input.frecuencia);
      await deps.suscripciones.extenderFin(suscripcion.id, nuevoFin);
    }
  }

  return actualizado;
}
