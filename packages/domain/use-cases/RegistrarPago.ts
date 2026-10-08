import { randomUUID } from "node:crypto";
import { IPagoRepository } from "../ports/IPagoRepository";
import { ISuscripcionRepository } from "../ports/ISuscripcionRepository";
import { IMemberRepository } from "../ports/IMemberRepository";
import { IPlanRepository } from "../ports/IPlanRepository";
import { ITurnoRepository } from "../ports/ITurnoRepository";
import { ISucursalRepository } from "../ports/ISucursalRepository";
import { IReglaAbonoRepository } from "../ports/IReglaAbonoRepository";
import { ITasaCambioRepository } from "../ports/ITasaCambioRepository";
import {
  Pago,
  pagosVigentesDelCiclo,
  totalPagado,
  validarLineasDePago,
  LineasDePagoInvalidasError,
  MAX_DIAS_ATRAS_PAGO_RETROACTIVO,
} from "../entities/Pago";
import { RolUsuario } from "../entities/UsuarioAdmin";
import { IAuthorizationService } from "../ports/IAuthorizationService";
import { resolverReglaAbono, calcularMontoMinimoAbono, calcularFechaLimiteAbono } from "../entities/ReglaAbono";
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

export { LineasDePagoInvalidasError };

// El plan tiene permitePagoParcial=false — no se puede registrar un abono
// (monto menor al precio del plan) contra él. El pago combinado NO está
// sujeto a esta restricción (ver diseño acordado).
export class AbonoNoPermitidoError extends Error {
  constructor() {
    super("Este plan no admite pagos parciales (abonos) — el monto debe cubrir el precio completo.");
  }
}

// El monto acumulado del ciclo (tras este pago) no alcanza el mínimo que
// exige la regla de abono efectiva (del plan o de su frecuencia).
export class AbonoMenorAlMinimoError extends Error {
  constructor(minimoUSD: number) {
    super(`El abono mínimo para este plan es $${minimoUSD.toFixed(2)}.`);
  }
}

// Pago con fecha pasada fuera de lo permitido: solo con el aviso "Por regularizar" activo.
export class PagoRetroactivoNoDisponibleError extends Error {
  constructor() {
    super("Solo se puede registrar un pago con fecha pasada a un miembro con el aviso \"Por regularizar\".");
  }
}

export class FechaPagoInvalidaError extends Error {
  constructor() {
    super(`La fecha del pago debe estar entre hoy y los últimos ${MAX_DIAS_ATRAS_PAGO_RETROACTIVO} días.`);
  }
}

// Un pago con fecha pasada reemplaza el ciclo: debe cubrir el precio del plan completo.
export class PagoRetroactivoIncompletoError extends Error {
  constructor() {
    super("Un pago con fecha pasada debe cubrir el precio completo del plan (no admite abonos).");
  }
}

export class SinTasaParaFechaError extends Error {
  constructor() {
    super("No hay tasa de cambio BCV registrada para esa fecha ni anterior: no se puede calcular el monto en bolívares.");
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
  reglasAbono: IReglaAbonoRepository;
  // Solo para pagos retroactivos: tasa BCV de la fecha del pago.
  tasas?: ITasaCambioRepository;
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
  // Pago con fecha pasada (solo con el aviso "Por regularizar"). Si es de hoy, se ignora.
  fechaPago?: Date;
}

export async function registrarPago(deps: RegistrarPagoDeps, input: DatosRegistrarPago): Promise<Pago[]> {
  if (!(await deps.autorizacion.tienePermiso(input.registradoPorId, "PAGOS", "CREAR"))) {
    throw new RolNoAutorizadoError();
  }

  validarLineasDePago(input.lineas, "conAbono");

  const miembro = await deps.miembros.buscarPorId(input.organizacionId, input.miembroId);
  if (!miembro) {
    throw new MiembroNoEncontradoError();
  }

  if (miembro.sucursalId !== null && miembro.sucursalId !== input.sucursalId) {
    const sucursal = await deps.sucursales.buscarPorId(input.organizacionId, miembro.sucursalId);
    throw new MiembroFueraDeSucursalError(sucursal?.nombre ?? "otra sucursal");
  }

  const plan = await deps.planes.buscarPorId(input.organizacionId, input.planId);
  if (!plan) {
    throw new PlanNoEncontradoError();
  }
  if (!plan.activo) {
    throw new PlanInactivoError();
  }

  // Miembro.precioPlan es el precio acordado del plan que el miembro tiene
  // asignado ahora mismo — solo sirve como "precio objetivo del ciclo"
  // cuando este pago es para ESE mismo plan. Si input.planId es otro (un
  // cambio de plan hecho desde acá, sin pasar por "Cambiar de
  // plan"/CambiarPlanConPago), miembro.precioPlan queda del plan viejo y no
  // corresponde usarlo para decidir si esto es un abono parcial, el mínimo
  // exigido, etc. — se usa el precio de lista del plan nuevo (ver bug
  // reportado: un abono menor al precio nuevo, pero mayor al precio viejo,
  // se aceptaba como pago total).
  const huboCambioDePlan = miembro.planId !== input.planId;
  const precioObjetivo = huboCambioDePlan ? plan.precioUSD : miembro.precioPlan;

  const montoTotal = input.lineas.reduce((suma, linea) => suma + linea.monto, 0);

  // Saldo a favor (generado por un cambio de plan a la baja, ver
  // CambiarPlanConPago) — se descuenta automáticamente del monto que este
  // pago necesita cubrir, sin importar el plan de este pago. Nunca deja
  // el saldo negativo; el consumo se persiste junto con el resto de los
  // cambios de este pago (más abajo), no antes, para no gastarlo si el
  // pago falla por otra validación.
  const saldoDisponible = miembro.saldoAFavorUSD;
  const saldoAConsumir = Math.min(saldoDisponible, montoTotal > 0 ? montoTotal : precioObjetivo);

  if (precioObjetivo > 0 && montoTotal <= 0 && saldoAConsumir < precioObjetivo) {
    throw new MontoInvalidoError();
  }

  const ahora = new Date();

  const inicioDeHoy = new Date(ahora);
  inicioDeHoy.setHours(0, 0, 0, 0);
  if (input.fechaPago && input.fechaPago < inicioDeHoy) {
    return registrarPagoRetroactivo(deps, input, {
      miembro,
      plan,
      huboCambioDePlan,
      precioObjetivo,
      montoTotal,
      saldoAConsumir,
      saldoDisponible,
      fechaPago: input.fechaPago,
      ahora,
    });
  }

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
    pagosDelCicloAbierto.length > 0 && totalPagado(pagosDelCicloAbierto) < precioObjetivo;

  let base: Date;
  let fin: Date;

  if (esAbonoDeCicloAbierto) {
    fin = activa!.fin;
    base = pagosDelCicloAbierto[0].fechaInicioCiclo ?? activa!.inicio;
  } else {
    base = activa && activa.fin > ahora ? activa.fin : ahora;
    fin = new Date(base);
    fin.setDate(fin.getDate() + plan.diasCiclo);
  }

  // Motor de reglas de abono: solo aplica cuando el pago resultante deja
  // el ciclo sin saldar (es decir, es un abono real, no un pago total).
  // montoTotal ya viene calculado más arriba como suma de input.lineas.
  const montoAcumuladoDelCiclo =
    (esAbonoDeCicloAbierto ? totalPagado(pagosDelCicloAbierto) : 0) + montoTotal + saldoAConsumir;
  const esAbonoParcial = montoAcumuladoDelCiclo < precioObjetivo;

  let fechaLimiteAbonoCalculada: Date | null = null;

  if (esAbonoParcial) {
    if (!plan.permitePagoParcial) {
      throw new AbonoNoPermitidoError();
    }

    const reglaFrecuencia = await deps.reglasAbono.buscarPorOrganizacionYFrecuencia(
      input.organizacionId,
      plan.frecuencia
    );
    const reglaEfectiva = resolverReglaAbono(
      { minimoAbonoTipo: plan.minimoAbonoTipo, minimoAbonoValor: plan.minimoAbonoValor },
      reglaFrecuencia
    );
    const diasDelCiclo = plan.diasCiclo;
    const montoMinimo = calcularMontoMinimoAbono(reglaEfectiva, precioObjetivo, diasDelCiclo);

    if (montoAcumuladoDelCiclo < montoMinimo) {
      throw new AbonoMenorAlMinimoError(montoMinimo);
    }

    fechaLimiteAbonoCalculada = calcularFechaLimiteAbono(
      reglaEfectiva,
      montoAcumuladoDelCiclo,
      precioObjetivo,
      base,
      diasDelCiclo
    );
  }

  if (esAbonoDeCicloAbierto) {
    await deps.suscripciones.actualizarFechaLimiteAbono(activa!.id, fechaLimiteAbonoCalculada);
  } else {
    if (activa) {
      await deps.suscripciones.extenderFin(activa.id, fin);
      await deps.suscripciones.actualizarFechaLimiteAbono(activa.id, fechaLimiteAbonoCalculada);
    } else {
      await deps.suscripciones.crear({
        miembroId: input.miembroId,
        planId: input.planId,
        inicio: ahora,
        fin,
        fechaLimiteAbono: fechaLimiteAbonoCalculada,
      });
    }

    // Cuando este pago corresponde a un plan distinto al que el miembro
    // tenía asignado (p. ej. un cambio de plan hecho desde acá en vez de
    // "Cambiar de plan"/CambiarPlanConPago), Miembro.precioPlan también se
    // sincroniza con el precio del plan nuevo — si no, queda con el precio
    // del plan viejo aunque planId ya haya cambiado (bug reportado:
    // "Mensual con entrenador" mostrando el precio de "Semanal"). Si es el
    // mismo plan de siempre, no se toca — preserva un precio negociado
    // manualmente en la ficha del miembro.
    await deps.miembros.actualizar(input.organizacionId, input.miembroId, {
      planId: input.planId,
      ...(huboCambioDePlan ? { precioPlan: plan.precioUSD } : {}),
    });
    await deps.miembros.actualizarFechasPago(input.miembroId, ahora, fin);
  }

  if (saldoAConsumir > 0) {
    await deps.miembros.actualizar(input.organizacionId, input.miembroId, {
      saldoAFavorUSD: saldoDisponible - saldoAConsumir,
    });
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

// Pago con fecha pasada: regulariza el ciclo del último pago de un miembro migrado (aviso "Por
// regularizar"). Mismo flujo de siempre (líneas, métodos, monto) con una sola variación: la fecha. No se enlaza a
// ningún turno (no entra en arqueos), la tasa de las líneas en Bs es la BCV de esa fecha y el ciclo nuevo
// reemplaza al anterior: vencimiento = fecha del pago + días del plan. Apaga el aviso.
async function registrarPagoRetroactivo(
  deps: RegistrarPagoDeps,
  input: DatosRegistrarPago,
  ctx: {
    miembro: { id: string; porRegularizar: boolean };
    plan: { diasCiclo: number; precioUSD: number };
    huboCambioDePlan: boolean;
    precioObjetivo: number;
    montoTotal: number;
    saldoAConsumir: number;
    saldoDisponible: number;
    fechaPago: Date;
    ahora: Date;
  }
): Promise<Pago[]> {
  if (!ctx.miembro.porRegularizar) throw new PagoRetroactivoNoDisponibleError();

  const limite = new Date(ctx.ahora);
  limite.setDate(limite.getDate() - MAX_DIAS_ATRAS_PAGO_RETROACTIVO);
  if (ctx.fechaPago < limite) throw new FechaPagoInvalidaError();

  if (ctx.montoTotal + ctx.saldoAConsumir < ctx.precioObjetivo) throw new PagoRetroactivoIncompletoError();

  // La tasa de cada línea en Bs se reemplaza por la BCV de la fecha del pago (la del formulario es la de hoy).
  let tasaDelDia: number | null = null;
  if (input.lineas.some((linea) => linea.tasaCambio !== null)) {
    const tasa = await deps.tasas?.buscarMasCercanaAnterior(ctx.fechaPago);
    if (!tasa) throw new SinTasaParaFechaError();
    tasaDelDia = tasa.valor;
  }

  const fin = new Date(ctx.fechaPago);
  fin.setDate(fin.getDate() + ctx.plan.diasCiclo);

  const planId = input.planId;
  const ajustada = await deps.suscripciones.ajustarCicloMasReciente(input.miembroId, ctx.fechaPago, fin, planId);
  if (!ajustada) {
    await deps.suscripciones.crear({ miembroId: input.miembroId, planId, inicio: ctx.fechaPago, fin, fechaLimiteAbono: null });
  }
  await deps.miembros.actualizar(input.organizacionId, input.miembroId, {
    planId,
    ...(ctx.huboCambioDePlan ? { precioPlan: ctx.plan.precioUSD } : {}),
  });
  await deps.miembros.actualizarFechasPago(input.miembroId, ctx.fechaPago, fin);
  if (ctx.saldoAConsumir > 0) {
    await deps.miembros.actualizar(input.organizacionId, input.miembroId, {
      saldoAFavorUSD: ctx.saldoDisponible - ctx.saldoAConsumir,
    });
  }

  const grupoPagoId = input.lineas.length > 1 ? randomUUID() : null;
  const pagosCreados: Pago[] = [];
  for (const linea of input.lineas) {
    const tasaCambio = linea.tasaCambio !== null ? tasaDelDia : null;
    pagosCreados.push(
      await deps.pagos.crear({
        miembroId: input.miembroId,
        sucursalId: input.sucursalId,
        turnoId: null,
        registradoPorId: input.registradoPorId,
        monto: linea.monto,
        metodo: linea.metodo,
        metodoPagoId: linea.metodoPagoId,
        numeroOperacion: linea.numeroOperacion,
        tasaCambio,
        montoBs: tasaCambio !== null ? linea.monto * tasaCambio : null,
        fechaInicioCiclo: ctx.fechaPago,
        fechaFinCiclo: fin,
        grupoPagoId,
        fechaPago: ctx.fechaPago,
      })
    );
  }
  return pagosCreados;
}
