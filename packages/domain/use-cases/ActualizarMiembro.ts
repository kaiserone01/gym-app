import { IMemberRepository } from "../ports/IMemberRepository";
import { IPlanRepository } from "../ports/IPlanRepository";
import { ISuscripcionRepository } from "../ports/ISuscripcionRepository";
import { ISucursalRepository } from "../ports/ISucursalRepository";
import { Miembro, CambiosMiembro } from "../entities/Miembro";
import { prorratearVencimiento } from "./CalcularVencimientoPlan";
import { MiembroFueraDeSucursalError } from "./ObtenerMiembro";
import { CedulaDuplicadaError } from "./CrearMiembro";

export { MiembroFueraDeSucursalError, CedulaDuplicadaError };

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

export class AjusteFechaNoDisponibleError extends Error {
  constructor() {
    super("Solo se puede ajustar la fecha de vencimiento a un miembro con el aviso \"Ajustar fecha o pago\".");
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

  // La cédula es única por organización: si cambia, no puede ser la de otro miembro.
  if (input.cambios.cedula !== undefined && input.cambios.cedula !== antes.cedula) {
    const existente = await deps.miembros.buscarPorOrganizacionYCedula(input.organizacionId, input.cambios.cedula);
    if (existente && existente.id !== input.id) {
      throw new CedulaDuplicadaError();
    }
  }

  const cambiaDePlan =
    input.cambios.planId !== undefined && input.cambios.planId !== null && input.cambios.planId !== antes.planId;

  // Ajuste manual del vencimiento (solo con el aviso "Ajustar fecha o pago"): se mantiene en sync con la
  // Suscripcion (nunca por separado) y apaga el aviso.
  const nuevoVencimiento = input.cambios.fechaVencimiento ?? null;
  if (nuevoVencimiento && !antes.ajustarFecha) {
    throw new AjusteFechaNoDisponibleError();
  }
  const cambios = nuevoVencimiento ? { ...input.cambios, ajustarFecha: false } : input.cambios;

  const actualizado = await deps.miembros.actualizar(input.organizacionId, input.id, cambios);
  if (!actualizado) {
    throw new MiembroNoEncontradoError();
  }

  if (nuevoVencimiento) {
    const plan = antes.planId ? await deps.planes.buscarPorId(input.organizacionId, antes.planId) : null;
    const inicio = new Date(nuevoVencimiento);
    inicio.setDate(inicio.getDate() - (plan?.diasCiclo ?? 30));
    await deps.suscripciones.ajustarCicloMasReciente(input.id, inicio, nuevoVencimiento);
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
        const nuevoFin = prorratearVencimiento(activa.inicio, ahora, planViejo.diasCiclo, planNuevo.diasCiclo);
        await deps.suscripciones.extenderFin(activa.id, nuevoFin);
      }

      // Sin esto, la Suscripcion activa seguía apuntando al plan viejo por
      // dentro (aunque Miembro.planId ya mostrara el nuevo) — cualquier
      // pago posterior que buscara "la suscripción activa DE ESTE plan"
      // no la encontraba y arrancaba un ciclo nuevo en vez de extender el
      // que ya existía (ver diseño acordado, bug real reportado).
      await deps.suscripciones.cambiarPlan(activa.id, input.cambios.planId as string);
    }
  }

  return actualizado;
}
