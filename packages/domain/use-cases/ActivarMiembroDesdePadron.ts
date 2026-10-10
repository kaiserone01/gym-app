import { IMemberRepository } from "../ports/IMemberRepository";
import { IMiembroReferenciaRepository } from "../ports/IMiembroReferenciaRepository";
import { IPlanRepository } from "../ports/IPlanRepository";
import { ISuscripcionRepository } from "../ports/ISuscripcionRepository";
import type { Miembro } from "../entities/Miembro";

const MS_POR_DIA = 24 * 60 * 60 * 1000;

export interface ActivarMiembroDeps {
  miembros: IMemberRepository;
  referencias: IMiembroReferenciaRepository;
  planes: IPlanRepository;
  suscripciones: ISuscripcionRepository;
}

export interface ActivarMiembroInput {
  organizacionId: string;
  sucursalId: string;
  cedula: string;
}

// Activación bajo demanda: si la cédula no es miembro pero está en el padrón de ESTA sede, crea el
// Miembro (por regularizar) y su Suscripción a partir del Excel. Nunca crea un Pago. Devuelve el
// miembro (existente o recién creado) o null si no hay nada que activar. Punto único de entrada para
// el kiosco y el panel; el llamador decide si lo envuelve en una transacción.
export async function activarMiembroPorCedula(deps: ActivarMiembroDeps, input: ActivarMiembroInput): Promise<Miembro | null> {
  const existente = await deps.miembros.buscarPorOrganizacionYCedula(input.organizacionId, input.cedula);
  if (existente) return existente;

  const referencia = await deps.referencias.buscarPorCedula(input.organizacionId, input.cedula);
  if (!referencia || referencia.sucursalId !== input.sucursalId) return null;

  const plan = referencia.planNombre
    ? ((await deps.planes.listarPorOrganizacion(input.organizacionId)).find((p) => p.nombre === referencia.planNombre) ?? null)
    : null;

  const miembro = await deps.miembros.crear({
    organizacionId: input.organizacionId,
    sucursalId: referencia.sucursalId,
    nombre: referencia.nombre,
    cedula: referencia.cedula,
    fechaInscripcion: null,
    fechaNacimiento: referencia.fechaNacimiento,
    celular: referencia.celular,
    fotoUrl: null,
    entrenadorId: null,
    planId: plan?.id ?? null,
    precioPlan: referencia.precioPlanUSD ?? plan?.precioUSD ?? 0,
    fechaUltimoPago: referencia.fechaUltimoPago,
    fechaVencimiento: referencia.fechaVencimiento,
    porRegularizar: true,
    vieneDelExcel: true,
  });

  if (plan && referencia.fechaVencimiento) {
    await deps.suscripciones.crear({
      miembroId: miembro.id,
      planId: plan.id,
      inicio: new Date(referencia.fechaVencimiento.getTime() - plan.diasCiclo * MS_POR_DIA),
      fin: referencia.fechaVencimiento,
      fechaLimiteAbono: null,
    });
  }

  return miembro;
}
