import { IMemberRepository } from "../ports/IMemberRepository";
import { IPlanRepository } from "../ports/IPlanRepository";
import { ISuscripcionRepository } from "../ports/ISuscripcionRepository";
import { ISucursalRepository } from "../ports/ISucursalRepository";
import { Miembro, CambiosMiembro } from "../entities/Miembro";
import { prorratearVencimiento } from "./CalcularVencimientoPlan";
import { MiembroFueraDeSucursalError } from "./ObtenerMiembro";

export { MiembroFueraDeSucursalError };

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

export async function actualizarMiembro(
  deps: {
    miembros: IMemberRepository;
    planes: IPlanRepository;
    suscripciones: ISuscripcionRepository;
    sucursales: ISucursalRepository;
  },
  input: { organizacionId: string; id: string; sucursalActivaId: string; cambios: CambiosMiembro }
): Promise<Miembro> {
  const antes = await deps.miembros.buscarPorId(input.organizacionId, input.id);
  if (!antes) {
    throw new MiembroNoEncontradoError();
  }

  if (antes.sucursalId !== null && antes.sucursalId !== input.sucursalActivaId) {
    const sucursal = await deps.sucursales.buscarPorId(input.organizacionId, antes.sucursalId);
    throw new MiembroFueraDeSucursalError(sucursal?.nombre ?? "otra sucursal");
  }

  const cambiaDePlan =
    input.cambios.planId !== undefined && input.cambios.planId !== null && input.cambios.planId !== antes.planId;

  const actualizado = await deps.miembros.actualizar(input.organizacionId, input.id, input.cambios);
  if (!actualizado) {
    throw new MiembroNoEncontradoError();
  }

  // Si el miembro cambió de Plan (sin que medie un pago nuevo) y tiene una
  // Suscripcion activa vigente del plan anterior, se prorratea su
  // vencimiento a la duración del nuevo plan (ver diseño acordado). Si no
  // tiene suscripción activa, no hay nada que recalcular.
  if (cambiaDePlan && antes.planId) {
    const ahora = new Date();
    const activa = await deps.suscripciones.buscarActivaVigentePorMiembroYPlan(input.id, antes.planId, ahora);

    if (activa) {
      const [planViejo, planNuevo] = await Promise.all([
        deps.planes.buscarPorId(input.organizacionId, antes.planId),
        deps.planes.buscarPorId(input.organizacionId, input.cambios.planId as string),
      ]);

      if (!planNuevo) {
        throw new PlanNoEncontradoError();
      }

      if (planViejo) {
        const nuevoFin = prorratearVencimiento(activa.inicio, ahora, planViejo.frecuencia, planNuevo.frecuencia);
        await deps.suscripciones.extenderFin(activa.id, nuevoFin);
      }
    }
  }

  return actualizado;
}
