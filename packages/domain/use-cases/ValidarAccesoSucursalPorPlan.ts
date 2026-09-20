import { ISuscripcionRepository } from "../ports/ISuscripcionRepository";
import { EstadoCheckIn } from "../entities/CheckIn";

export interface ValidarAccesoDeps {
  suscripciones: ISuscripcionRepository;
}

// El acceso ya no depende del Plan (que dejó de estar anclado a
// sucursal): primero se valida que el miembro esté haciendo check-in en
// SU sucursal asignada, y solo después si tiene una Suscripcion activa
// vigente.
export async function validarAccesoSucursal(
  deps: ValidarAccesoDeps,
  miembroId: string,
  sucursalIdDelMiembro: string,
  sucursalIdDelCheckIn: string,
  ahora: Date = new Date()
): Promise<EstadoCheckIn> {
  if (sucursalIdDelMiembro !== sucursalIdDelCheckIn) {
    return "sucursal_incorrecta";
  }

  const suscripcion = await deps.suscripciones.buscarActivaVigentePorMiembro(miembroId, ahora);

  // Sin suscripción activa vigente: se registra igual el check-in (no bloquear
  // la operación física), pero como "vencido" (ADR v2 §13.1, regla 3).
  return suscripcion ? "activo" : "vencido";
}
