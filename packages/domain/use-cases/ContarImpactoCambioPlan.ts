import { IPlanRepository } from "../ports/IPlanRepository";

// Cantidad de Suscripciones ACTIVA vigentes de un Plan — el número que se
// muestra en el modal de doble alerta antes de confirmar un cambio de
// frecuencia/entrenador (ActualizarFrecuenciaPlan).
export async function contarImpactoCambioPlan(
  deps: { planes: IPlanRepository },
  planId: string
): Promise<number> {
  return deps.planes.contarSuscripcionesActivasVigentes(planId, new Date());
}
