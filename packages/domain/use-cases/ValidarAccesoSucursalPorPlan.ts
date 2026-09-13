import { ISuscripcionRepository } from "../ports/ISuscripcionRepository";
import { EstadoCheckIn } from "../entities/CheckIn";

export interface ValidarAccesoSucursalPorPlanDeps {
  suscripciones: ISuscripcionRepository;
}

export async function validarAccesoSucursalPorPlan(
  deps: ValidarAccesoSucursalPorPlanDeps,
  miembroId: string,
  sucursalId: string,
  ahora: Date = new Date()
): Promise<EstadoCheckIn> {
  const suscripcion = await deps.suscripciones.buscarActivaVigentePorMiembro(miembroId, ahora);

  // Sin suscripción activa vigente: se registra igual el check-in (no bloquear
  // la operación física), pero como "vencido" (ADR v2 §13.1, regla 3).
  if (!suscripcion) {
    return "vencido";
  }

  if (suscripcion.plan.tipoAcceso === "TODA_LA_ORGANIZACION") {
    return "activo";
  }

  // SEDE_UNICA o LISTA_CERRADA: válido solo si esta Sucursal está en
  // PlanSucursalAcceso (ADR v2 §13.1, regla 2). Si no, se trata igual que
  // "vencido" — ver Global Constraints del plan.
  const tieneAcceso = await deps.suscripciones.tieneAccesoASucursal(suscripcion.plan.id, sucursalId);
  return tieneAcceso ? "activo" : "vencido";
}
