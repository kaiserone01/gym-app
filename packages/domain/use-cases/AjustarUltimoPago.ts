import { IMemberRepository } from "../ports/IMemberRepository";
import { IPlanRepository } from "../ports/IPlanRepository";
import { ISuscripcionRepository } from "../ports/ISuscripcionRepository";
import { ISucursalRepository } from "../ports/ISucursalRepository";
import { IPagoRepository } from "../ports/IPagoRepository";
import { ITasaCambioRepository } from "../ports/ITasaCambioRepository";
import { IAuthorizationService } from "../ports/IAuthorizationService";
import { MAX_DIAS_ATRAS_ULTIMO_PAGO } from "../entities/Pago";
import { MiembroFueraDeSucursalError } from "./ObtenerMiembro";
import { MiembroNoEncontradoError } from "./ActualizarMiembro";
import { RolNoAutorizadoError } from "./RegistrarPago";

const MS_POR_DIA = 24 * 60 * 60 * 1000;
export const METODO_AJUSTE_ULTIMO_PAGO = "Ajuste de último pago";

export class AjusteNoDisponibleError extends Error {
  constructor() {
    super("Este miembro no tiene pendiente el ajuste del último pago.");
  }
}

export class DiasAtrasInvalidosError extends Error {
  constructor() {
    super(`Indica cuántos días atrás fue el último pago (de 0 a ${MAX_DIAS_ATRAS_ULTIMO_PAGO}).`);
  }
}

export class SinTasaParaFechaError extends Error {
  constructor() {
    super("No hay tasa de cambio BCV registrada para esa fecha ni anterior: no se puede calcular el monto en bolívares.");
  }
}

export class MiembroSinPlanError extends Error {
  constructor() {
    super("El miembro no tiene un plan asignado: no se puede calcular el vencimiento.");
  }
}

// Solo disponible mientras el miembro tenga el aviso "Ajustar último pago" (fecha migrada no confiable).
// Registra, nominativamente y a nombre de quien lo hace, un pago con fecha pasada — sin turno ni arqueo —
// por el monto del plan del miembro (Miembro.precioPlan), convertido a Bs con la tasa BCV de esa fecha (o la
// más cercana anterior). Recalcula el ciclo: vencimiento = fecha del pago + días del plan. Apaga el aviso.
export async function ajustarUltimoPago(
  deps: {
    miembros: IMemberRepository;
    planes: IPlanRepository;
    suscripciones: ISuscripcionRepository;
    sucursales: ISucursalRepository;
    pagos: IPagoRepository;
    tasas: ITasaCambioRepository;
    autorizacion: IAuthorizationService;
  },
  input: {
    organizacionId: string;
    miembroId: string;
    sucursalActivaId: string;
    diasAtras: number;
    registradoPorId: string;
  }
): Promise<{ fechaPago: Date; fechaVencimiento: Date }> {
  if (!(await deps.autorizacion.tienePermiso(input.registradoPorId, "PAGOS", "CREAR"))) {
    throw new RolNoAutorizadoError();
  }
  if (!Number.isInteger(input.diasAtras) || input.diasAtras < 0 || input.diasAtras > MAX_DIAS_ATRAS_ULTIMO_PAGO) {
    throw new DiasAtrasInvalidosError();
  }

  const miembro = await deps.miembros.buscarPorId(input.organizacionId, input.miembroId);
  if (!miembro) throw new MiembroNoEncontradoError();
  if (miembro.sucursalId !== null && miembro.sucursalId !== input.sucursalActivaId) {
    const sucursal = await deps.sucursales.buscarPorId(input.organizacionId, miembro.sucursalId);
    throw new MiembroFueraDeSucursalError(sucursal?.nombre ?? "otra sucursal");
  }
  if (!miembro.ajustarFecha) throw new AjusteNoDisponibleError();
  if (!miembro.planId) throw new MiembroSinPlanError();

  const plan = await deps.planes.buscarPorId(input.organizacionId, miembro.planId);
  if (!plan) throw new MiembroSinPlanError();

  const fechaPago = new Date(Date.now() - input.diasAtras * MS_POR_DIA);
  const fechaVencimiento = new Date(fechaPago.getTime() + plan.diasCiclo * MS_POR_DIA);

  // Sin monto (cortesía) no hay nada que convertir. Si hay monto, la tasa es obligatoria: no se inventa.
  const monto = miembro.precioPlan;
  let tasaCambio: number | null = null;
  if (monto > 0) {
    const tasa = await deps.tasas.buscarMasCercanaAnterior(fechaPago);
    if (!tasa) throw new SinTasaParaFechaError();
    tasaCambio = tasa.valor;
  }

  await deps.pagos.crear({
    miembroId: miembro.id,
    sucursalId: input.sucursalActivaId,
    turnoId: null,
    registradoPorId: input.registradoPorId,
    monto,
    metodo: METODO_AJUSTE_ULTIMO_PAGO,
    metodoPagoId: null,
    numeroOperacion: null,
    tasaCambio,
    montoBs: tasaCambio !== null ? monto * tasaCambio : null,
    fechaInicioCiclo: fechaPago,
    fechaFinCiclo: fechaVencimiento,
    grupoPagoId: null,
    fechaPago,
  });
  await deps.suscripciones.ajustarCicloMasReciente(miembro.id, fechaPago, fechaVencimiento);
  // Al final: apaga el aviso. Si algo falla antes, el aviso sigue y se puede reintentar.
  await deps.miembros.actualizarFechasPago(miembro.id, fechaPago, fechaVencimiento);

  return { fechaPago, fechaVencimiento };
}
