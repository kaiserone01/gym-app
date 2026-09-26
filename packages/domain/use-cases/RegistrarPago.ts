import { randomUUID } from "node:crypto";
import { IPagoRepository } from "../ports/IPagoRepository";
import { ISuscripcionRepository } from "../ports/ISuscripcionRepository";
import { IMemberRepository } from "../ports/IMemberRepository";
import { IPlanRepository } from "../ports/IPlanRepository";
import { ITurnoRepository } from "../ports/ITurnoRepository";
import { ISucursalRepository } from "../ports/ISucursalRepository";
import { Pago, pagosVigentesDelCiclo, totalPagado } from "../entities/Pago";
import { RolUsuario } from "../entities/UsuarioAdmin";
import { IAuthorizationService } from "../ports/IAuthorizationService";
import { DURACION_DIAS_POR_FRECUENCIA } from "../entities/Plan";
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

export class PlanInactivoError extends Error {
  constructor() {
    super("No se puede registrar un pago contra un plan inactivo.");
  }
}

export class RolNoAutorizadoError extends Error {
  constructor() {
    super("Tu rol no tiene permiso para registrar pagos.");
  }
}

// Un monto en $0 (o negativo) contra un plan que SÍ cuesta algo no es un
// abono válido — sin este chequeo, un $0 tipeado por error (ej. campo
// vaciado sin querer) igual adelantaba el vencimiento y daba acceso
// gratis. Un plan de cortesía real (miembro.precioPlan === 0) sigue
// pudiendo registrar su pago en $0 sin problema.
export class MontoInvalidoError extends Error {
  constructor() {
    super("El monto tiene que ser mayor a $0 — este plan no es de cortesía.");
  }
}

// Un pago combinado sin líneas, o con alguna línea en $0/negativo, no tiene
// forma de saber a qué método imputar cada monto — se rechaza acá, no solo
// en la UI, porque un FormData armado a mano podría saltarse la validación
// del cliente.
export class LineasDePagoInvalidasError extends Error {
  constructor() {
    super("Cada línea del pago combinado necesita un monto mayor a $0 y un método.");
  }
}

export interface RegistrarPagoDeps {
  pagos: IPagoRepository;
  suscripciones: ISuscripcionRepository;
  miembros: IMemberRepository;
  planes: IPlanRepository;
  turnos: ITurnoRepository;
  sucursales: ISucursalRepository;
  autorizacion: IAuthorizationService;
}

export interface DatosLineaPago {
  monto: number;
  metodo: string;
  metodoPagoId: string | null;
  numeroOperacion: string | null;
  tasaCambio: number | null;
}

export interface DatosRegistrarPago {
  organizacionId: string;
  miembroId: string;
  planId: string;
  // Una línea por método — un pago total o un abono simple siguen siendo
  // un array de un solo elemento. Un pago combinado (varios métodos en un
  // mismo cobro) trae 2+ líneas; ver diseño en
  // docs/superpowers/specs/2026-09-26-pagos-combinados-caja-design.md.
  lineas: DatosLineaPago[];
  sucursalId: string;
  registradoPorId: string;
  rolUsuario: RolUsuario;
}

export async function registrarPago(deps: RegistrarPagoDeps, input: DatosRegistrarPago): Promise<Pago[]> {
  if (!(await deps.autorizacion.tienePermiso(input.registradoPorId, "PAGOS", "CREAR"))) {
    throw new RolNoAutorizadoError();
  }

  if (input.lineas.length === 0 || input.lineas.some((linea) => linea.monto <= 0 || !linea.metodo)) {
    // Excepción: una sola línea en $0 sigue siendo válida para planes de
    // cortesía (precioPlan === 0) — se valida más abajo contra
    // miembro.precioPlan, no acá.
    if (!(input.lineas.length === 1 && input.lineas[0].monto <= 0)) {
      throw new LineasDePagoInvalidasError();
    }
  }

  const miembro = await deps.miembros.buscarPorId(input.organizacionId, input.miembroId);
  if (!miembro) {
    throw new MiembroNoEncontradoError();
  }

  if (miembro.sucursalId !== null && miembro.sucursalId !== input.sucursalId) {
    const sucursal = await deps.sucursales.buscarPorId(input.organizacionId, miembro.sucursalId);
    throw new MiembroFueraDeSucursalError(sucursal?.nombre ?? "otra sucursal");
  }

  const montoTotal = input.lineas.reduce((suma, linea) => suma + linea.monto, 0);

  if (miembro.precioPlan > 0 && montoTotal <= 0) {
    throw new MontoInvalidoError();
  }

  const plan = await deps.planes.buscarPorId(input.organizacionId, input.planId);
  if (!plan) {
    throw new PlanNoEncontradoError();
  }
  if (!plan.activo) {
    throw new PlanInactivoError();
  }

  const ahora = new Date();
  const activa = await deps.suscripciones.buscarActivaVigentePorMiembroYPlan(input.miembroId, input.planId, ahora);

  // Pagos fraccionados/mixtos ("abonos"): un ciclo puede juntar varios
  // Pago (distinto método/moneda cada uno) hasta llegar al precio
  // acordado con el miembro. El acceso ya se habilita con el primer
  // abono (el vencimiento se adelanta ahí abajo, como siempre) — lo único
  // que cambia es que, mientras el ciclo vigente no esté saldado, un pago
  // nuevo se suma al MISMO ciclo en vez de abrir uno adicional (ver
  // diseño acordado con el usuario, roadmap punto d). Un pago combinado
  // (2+ líneas en un mismo envío) se evalúa igual: la suma de sus líneas
  // es el "monto" a los efectos de esta decisión.
  let pagosDelCicloAbierto: Pago[] = [];
  if (activa && activa.fin > ahora) {
    const pagosDelMiembro = await deps.pagos.listarPorMiembro(input.miembroId);
    pagosDelCicloAbierto = pagosVigentesDelCiclo(pagosDelMiembro, activa.fin);
  }
  const esAbonoDeCicloAbierto =
    pagosDelCicloAbierto.length > 0 && totalPagado(pagosDelCicloAbierto) < miembro.precioPlan;

  let base: Date;
  let fin: Date;

  if (esAbonoDeCicloAbierto) {
    fin = activa!.fin;
    base = pagosDelCicloAbierto[0].fechaInicioCiclo ?? activa!.inicio;
  } else {
    base = activa && activa.fin > ahora ? activa.fin : ahora;
    fin = new Date(base);
    fin.setDate(fin.getDate() + DURACION_DIAS_POR_FRECUENCIA[plan.frecuencia]);

    if (activa) {
      await deps.suscripciones.extenderFin(activa.id, fin);
    } else {
      await deps.suscripciones.crear({ miembroId: input.miembroId, planId: input.planId, inicio: ahora, fin });
    }

    await deps.miembros.actualizar(input.organizacionId, input.miembroId, { planId: input.planId });
    await deps.miembros.actualizarFechasPago(input.miembroId, ahora, fin);
  }

  const turnoAbierto = await deps.turnos.buscarAbiertoPorSucursal(input.sucursalId);

  // grupoPagoId solo se genera para pagos combinados (2+ líneas) — un pago
  // de una sola línea no necesita correlacionarse con nada.
  const grupoPagoId = input.lineas.length > 1 ? randomUUID() : null;

  const pagosCreados: Pago[] = [];
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
      fechaInicioCiclo: base,
      fechaFinCiclo: fin,
      grupoPagoId,
    });
    pagosCreados.push(pago);
  }

  return pagosCreados;
}
