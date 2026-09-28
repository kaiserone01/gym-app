import { IPagoRepository } from "../ports/IPagoRepository";
import { ISuscripcionRepository } from "../ports/ISuscripcionRepository";
import { IMemberRepository } from "../ports/IMemberRepository";
import { IPlanRepository } from "../ports/IPlanRepository";
import { ITurnoRepository } from "../ports/ITurnoRepository";
import { ISucursalRepository } from "../ports/ISucursalRepository";
import { IAuthorizationService } from "../ports/IAuthorizationService";
import { Pago } from "../entities/Pago";
import { RolUsuario } from "../entities/UsuarioAdmin";
import { MiembroFueraDeSucursalError } from "./ObtenerMiembro";
import { calcularCambioPlan, PlanCortesiaConTiempoRestanteError } from "../entities/cambioPlanCalculo";
import { ICambioPlanAuditoriaRepository } from "../ports/ICambioPlanAuditoriaRepository";
import type { OrigenCambioPlan } from "../entities/CambioPlanAuditoria";
import { validarLineasDePago, LineasDePagoInvalidasError, MontoLineasNoCubreObjetivoError } from "../entities/Pago";
import { randomUUID } from "node:crypto";
import type { DatosLineaPago } from "../entities/Pago";

export { PlanCortesiaConTiempoRestanteError };

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

export class PlanInactivoError extends Error {
  constructor() {
    super("No se puede cambiar a un plan inactivo.");
  }
}

export class RolNoAutorizadoError extends Error {
  constructor() {
    super("Tu rol no tiene permiso para registrar pagos.");
  }
}

// Cambiar de plan sin un ciclo vigente (nunca pagó, o el plan anterior ya
// venció) no tiene "diferencia" que cobrar — ese caso se resuelve
// registrando un pago normal por el precio completo del plan nuevo.
export class SinCicloVigenteError extends Error {
  constructor() {
    super("Este miembro no tiene un ciclo vigente — registrá un pago normal por el precio completo del plan nuevo.");
  }
}

export class MetodoPagoRequeridoError extends Error {
  constructor() {
    super("Elegí un método de pago para cobrar la diferencia.");
  }
}

export { LineasDePagoInvalidasError, MontoLineasNoCubreObjetivoError };

export class EntrenadorRequeridoError extends Error {
  constructor() {
    super("El plan nuevo incluye entrenador — elegí cuál antes de cambiar de plan.");
  }
}

export interface CambiarPlanConPagoDeps {
  pagos: IPagoRepository;
  suscripciones: ISuscripcionRepository;
  miembros: IMemberRepository;
  planes: IPlanRepository;
  turnos: ITurnoRepository;
  sucursales: ISucursalRepository;
  autorizacion: IAuthorizationService;
  auditoria: ICambioPlanAuditoriaRepository;
}

export interface DatosCambiarPlanConPago {
  organizacionId: string;
  miembroId: string;
  planNuevoId: string;
  // Desde dónde se disparó este cambio — se persiste en el registro de
  // auditoría (regla 11 del diseño acordado; ver
  // packages/domain/entities/CambioPlanAuditoria.ts).
  origen: OrigenCambioPlan;
  // Una diferencia de cambio de plan se cobra completa, aunque combinando
  // varios métodos (2+ líneas) — no existe abono parcial sobre esta
  // diferencia (ver diseño acordado, Fase 3). Vacío cuando no hay nada que
  // cobrar (el excedente se absorbió en días o V == precioNuevo).
  lineas: DatosLineaPago[];
  sucursalId: string;
  registradoPorId: string;
  rolUsuario: RolUsuario;
  // Solo se aplica cuando el plan nuevo requiere entrenador (ver diseño
  // acordado) — si no lo requiere, se ignora y el entrenador que el
  // miembro ya tenía asignado (si tenía) queda sin tocar.
  entrenadorId: string | null;
}

export interface ResultadoCambioPlan {
  pagos: Pago[];
  // precioNuevo - V cuando es positivo; 0 si V >= precioNuevo (el
  // excedente se convierte en días, nunca en crédito devuelto).
  diferencia: number;
  nuevoVencimiento: Date;
  // Siempre 0 — CambiarPlanConPago nunca genera saldo a favor. Se mantiene
  // el campo por compatibilidad con los callers existentes.
  saldoAFavorGenerado: number;
}

// Cambia de plan a mitad de ciclo usando calcularCambioPlan (única fuente
// de verdad, compartida con la vista previa del frontend — ver
// packages/domain/entities/cambioPlanCalculo.ts): el valor no consumido del
// plan viejo nunca se pierde, se convierte en días extra del plan nuevo si
// sobra, o se cobra la diferencia si falta. El precio del plan "anterior"
// se toma del plan real de la Suscripcion vigente (no de Miembro.planId,
// que puede haber quedado desincronizado por una edición manual — ver
// diseño acordado sobre el bug de "vuelve a cobrar de menos").
export async function cambiarPlanConPago(
  deps: CambiarPlanConPagoDeps,
  input: DatosCambiarPlanConPago
): Promise<ResultadoCambioPlan> {
  if (!(await deps.autorizacion.tienePermiso(input.registradoPorId, "PAGOS", "CREAR"))) {
    throw new RolNoAutorizadoError();
  }

  const miembro = await deps.miembros.buscarPorId(input.organizacionId, input.miembroId);
  if (!miembro) {
    throw new MiembroNoEncontradoError();
  }

  if (miembro.sucursalId !== null && miembro.sucursalId !== input.sucursalId) {
    const sucursal = await deps.sucursales.buscarPorId(input.organizacionId, miembro.sucursalId);
    throw new MiembroFueraDeSucursalError(sucursal?.nombre ?? "otra sucursal");
  }

  const planNuevo = await deps.planes.buscarPorId(input.organizacionId, input.planNuevoId);
  if (!planNuevo) {
    throw new PlanNoEncontradoError();
  }
  if (!planNuevo.activo) {
    throw new PlanInactivoError();
  }
  if (planNuevo.incluyeEntrenador && !input.entrenadorId) {
    throw new EntrenadorRequeridoError();
  }

  const ahora = new Date();
  const activa = await deps.suscripciones.buscarActivaVigentePorMiembro(input.miembroId, ahora);
  if (!activa) {
    throw new SinCicloVigenteError();
  }

  const planViejo = await deps.planes.buscarPorId(input.organizacionId, activa.planId);

  const precioViejo = planViejo?.precioUSD ?? miembro.precioPlan;
  // Sin plan viejo resoluble, no hay ciclo previo del que partir en una
  // duración distinta — se asume la misma que el plan nuevo para no
  // dividir por un diasCiclo inexistente (caso extremo: el plan viejo fue
  // borrado del catálogo).
  const diasCicloViejo = planViejo?.diasCiclo ?? planNuevo.diasCiclo;

  // El backend SIEMPRE recalcula con calcularCambioPlan — la misma función
  // pura que usa la vista previa del frontend — y nunca confía en un monto
  // o fecha que mande el cliente (ver diseño acordado). Lanza
  // PlanCortesiaConTiempoRestanteError si el plan nuevo es $0 y todavía
  // queda tiempo pagado del plan viejo (regla 6).
  const resultado = calcularCambioPlan({
    hoy: ahora,
    precioViejo,
    diasCicloViejo,
    fechaVencimientoActual: activa.fin,
    precioNuevo: planNuevo.precioUSD,
    diasCicloNuevo: planNuevo.diasCiclo,
  });

  const montoCobrado = resultado.montoCobradoCentavos / 100;

  const pagos: Pago[] = [];

  if (montoCobrado > 0) {
    if (input.lineas.length === 0) {
      throw new MetodoPagoRequeridoError();
    }
    // Modo "exacto": la diferencia se paga completa, aunque combinando
    // varios métodos — no hay abono parcial sobre el cambio de plan (ver
    // diseño acordado, Fase 3).
    validarLineasDePago(input.lineas, "exacto", montoCobrado);

    const turnoAbierto = await deps.turnos.buscarAbiertoPorSucursal(input.sucursalId);
    const grupoPagoId = input.lineas.length > 1 ? randomUUID() : null;

    for (const linea of input.lineas) {
      const pago = await deps.pagos.crear({
        miembroId: input.miembroId,
        sucursalId: input.sucursalId,
        turnoId: turnoAbierto?.id ?? null,
        registradoPorId: input.registradoPorId,
        monto: linea.monto,
        metodo: linea.metodo,
        metodoPagoId: linea.metodoPagoId,
        numeroOperacion: linea.numeroOperacion,
        tasaCambio: linea.tasaCambio,
        montoBs: linea.tasaCambio !== null ? linea.monto * linea.tasaCambio : null,
        fechaInicioCiclo: activa.inicio,
        fechaFinCiclo: resultado.nuevoVencimiento,
        grupoPagoId,
      });
      pagos.push(pago);
    }
  }

  await deps.suscripciones.cambiarPlan(activa.id, input.planNuevoId);
  await deps.suscripciones.extenderFin(activa.id, resultado.nuevoVencimiento);
  // Corrige E1: antes, en modo AJUSTAR_VENCIMIENTO (donde nunca se cobra
  // nada) Miembro.fechaVencimiento NO se actualizaba — solo se tocaba
  // dentro del branch "hubo cobro". El miembro quedaba con el vencimiento
  // viejo aunque la Suscripción sí tuviera el nuevo (vista previa ≠
  // guardado real, ver bug reportado con Luis Castro). Ahora se actualiza
  // siempre, sin importar el modo ni si hubo cobro.
  await deps.miembros.actualizarFechasPago(input.miembroId, ahora, resultado.nuevoVencimiento);
  await deps.miembros.actualizar(input.organizacionId, input.miembroId, {
    planId: input.planNuevoId,
    precioPlan: planNuevo.precioUSD,
    ...(planNuevo.incluyeEntrenador ? { entrenadorId: input.entrenadorId } : {}),
  });

  // Registro de auditoría (regla 11): snapshot exacto de los datos crudos
  // usados en el cálculo (precio y días de ciclo de cada plan, no la
  // tarifa ya derivada) — para que el registro no dependa de una división
  // ya redondeada y se pueda auditar/recalcular sin ambigüedad.
  await deps.auditoria.crear({
    organizacionId: input.organizacionId,
    miembroId: input.miembroId,
    planAnteriorId: activa.planId,
    planNuevoId: input.planNuevoId,
    vencimientoAnterior: activa.fin,
    vencimientoNuevo: resultado.nuevoVencimiento,
    diasRestantes: resultado.diasRestantes,
    valorNoConsumidoCentavos: resultado.valorNoConsumidoCentavos,
    precioAnteriorCentavos: Math.round(precioViejo * 100),
    diasCicloAnterior: diasCicloViejo,
    precioNuevoCentavos: Math.round(planNuevo.precioUSD * 100),
    diasCicloNuevo: planNuevo.diasCiclo,
    diasNuevos: resultado.diasNuevos,
    montoCobradoCentavos: resultado.montoCobradoCentavos,
    // Único camino de cálculo desde esta fase — el valor "AJUSTAR_VENCIMIENTO"
    // del enum se conserva solo para lectura de registros históricos, el
    // código nunca vuelve a escribirlo (0 registros históricos con ese modo,
    // verificado contra producción antes de este cambio).
    modo: "CICLO_COMPLETO",
    origen: input.origen,
    pagoId: pagos[0]?.id ?? null,
    registradoPorId: input.registradoPorId,
  });

  return {
    pagos,
    diferencia: montoCobrado,
    nuevoVencimiento: resultado.nuevoVencimiento,
    saldoAFavorGenerado: 0,
  };
}
