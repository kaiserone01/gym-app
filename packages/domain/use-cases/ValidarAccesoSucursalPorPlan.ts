import { ISuscripcionRepository } from "../ports/ISuscripcionRepository";
import { EstadoCheckIn } from "../entities/CheckIn";

export interface ValidarAccesoDeps {
  suscripciones: ISuscripcionRepository;
}

// Cuántos milisegundos tiene un día — usado para calcular el límite del
// período de gracia sin depender de setDate (evita problemas de huso
// horario al comparar contra "ahora").
const MS_POR_DIA = 24 * 60 * 60 * 1000;

// El acceso ya no depende del Plan (que dejó de estar anclado a
// sucursal): primero se valida que el miembro esté haciendo check-in en
// SU sucursal asignada, y solo después si tiene una Suscripcion activa
// vigente.
export async function validarAccesoSucursal(
  deps: ValidarAccesoDeps,
  miembroId: string,
  sucursalIdDelMiembro: string | null,
  sucursalIdDelCheckIn: string,
  fechaVencimientoMiembro: Date | null,
  diasGracia: number,
  ahora: Date = new Date()
): Promise<EstadoCheckIn> {
  // sucursalIdDelMiembro === null significa "Ambas" (miembro con Plan
  // multisede) — pasa la validación de sede sin importar en qué sucursal
  // de la organización haga check-in.
  if (sucursalIdDelMiembro !== null && sucursalIdDelMiembro !== sucursalIdDelCheckIn) {
    return "sucursal_incorrecta";
  }

  const suscripcion = await deps.suscripciones.buscarActivaVigentePorMiembro(miembroId, ahora);

  if (suscripcion) {
    return "activo";
  }

  // Sin suscripción activa vigente: se registra igual el check-in (no
  // bloquear la operación física). Si todavía está dentro del período
  // de gracia de la sucursal FÍSICA donde ocurre el check-in, se marca
  // "en_gracia" en vez de "vencido" — los días de gracia empiezan a
  // contar el día SIGUIENTE al vencimiento (vencimiento 31/08,
  // diasGracia=3 → en_gracia hasta el 03/09 inclusive; 04/09 en
  // adelante ya es "vencido").
  if (fechaVencimientoMiembro && diasGracia > 0) {
    const limiteGracia = new Date(fechaVencimientoMiembro.getTime() + diasGracia * MS_POR_DIA);
    if (ahora.getTime() > fechaVencimientoMiembro.getTime() && ahora.getTime() <= limiteGracia.getTime()) {
      return "en_gracia";
    }
  }

  return "vencido";
}
