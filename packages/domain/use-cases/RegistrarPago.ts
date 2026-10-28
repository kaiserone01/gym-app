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
  MAX_DIAS_ATRAS_PAGO_FECHADO,
  MAX_MESES_POR_PAGO,
  toleranciaDiferenciaPagoUSD,
} from "../entities/Pago";
import { RolUsuario } from "../entities/UsuarioAdmin";
import { IAuthorizationService } from "../ports/IAuthorizationService";
import { resolverReglaAbono, calcularMontoMinimoAbono, calcularFechaLimiteAbono } from "../entities/ReglaAbono";
import type { Plan } from "../entities/Plan";
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

export class MesesInvalidosError extends Error {
  constructor() {
    super(`Los meses a pagar deben ser un número entero entre 1 y ${MAX_MESES_POR_PAGO}.`);
  }
}

// Con más de un mes el pago debe cubrir el total (varios métodos sí, abonos por cuotas no).
export class MesesRequierenPagoCompletoError extends Error {
  constructor() {
    super("Para pagar más de un mes el monto debe cubrir el total de los meses (puedes repartirlo en varios métodos).");
  }
}

// Más de un mes solo si el ciclo vigente no tiene un abono pendiente.
export class MesesNoDisponiblesError extends Error {
  constructor() {
    super("No se pueden sumar meses mientras haya un abono pendiente en el ciclo vigente: cobra primero ese saldo.");
  }
}

export class FechaPagoInvalidaError extends Error {
  constructor(maxDias: number = MAX_DIAS_ATRAS_PAGO_RETROACTIVO) {
    super(`La fecha del pago debe estar entre hoy y los últimos ${maxDias} días.`);
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
  // Bs realmente recibidos (lo que tecleó el cajero): se guarda tal cual si coincide con monto × tasa a un centavo
  // de dólar; el monto en USD queda redondeado a centavos y la tasa no es rígida (ver montoBsDeLinea).
  montoBs?: number | null;
}

// Monto en Bs de una línea: el recibido de verdad si cuadra con el USD (dentro de un centavo de dólar), si no el calculado.
function montoBsDeLinea(linea: DatosLineaPago, tasa: number | null): number | null {
  if (tasa === null) return null;
  const calculado = linea.monto * tasa;
  return linea.montoBs != null && Math.abs(linea.montoBs - calculado) <= 0.01 * tasa ? linea.montoBs : calculado;
}

// Crédito que de verdad hace falta para completar lo que falta del ciclo después de este pago (nunca más que eso).
function saldoNecesario(saldoDisponible: number, faltante: number, montoTotal: number): number {
  return Math.min(saldoDisponible, Math.max(0, Math.round((faltante - montoTotal) * 100) / 100));
}

// Lo que sobra del precio del ciclo y el cajero eligió guardar como saldo a favor (0 si no aplica).
function excedenteASaldo(input: DatosRegistrarPago, montoAcumulado: number, precioObjetivo: number): number {
  return input.excedenteASaldoAFavor ? Math.max(0, Math.round((montoAcumulado - precioObjetivo) * 100) / 100) : 0;
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
  // Pago con fecha pasada: hasta 365 días con el aviso "Por regularizar" o con primerPagoDeInscripcion, hasta 90 para el
  // resto de los miembros. Si es de hoy, se ignora.
  fechaPago?: Date;
  // Primer pago de un miembro que se acaba de inscribir con fecha pasada: permite fechaPago sin el aviso "Por regularizar".
  primerPagoDeInscripcion?: boolean;
  // Si lo pagado supera el precio del ciclo, el sobrante se guarda como saldo a favor del miembro (el próximo pago lo
  // descuenta). Sin esto, el sobrante es de otro cobro (wifi, etc.) y solo queda registrado en el pago.
  excedenteASaldoAFavor?: boolean;
  // Meses que cubre este pago (1 a 6, por defecto 1): el precio y la duración del ciclo se multiplican. Con más de un
  // mes el pago debe ser completo (sin abonos), pero puede repartirse en varios métodos.
  meses?: number;
}

// Valida un abono parcial (el plan debe admitirlo y el monto acumulado cubrir el mínimo de la regla) y devuelve hasta
// cuándo da acceso lo acumulado (null si ninguna regla aplica, o si el faltante entra en la tolerancia: acceso completo).
async function evaluarAbonoParcial(
  deps: RegistrarPagoDeps,
  organizacionId: string,
  plan: Plan,
  precioObjetivo: number,
  montoAcumulado: number,
  base: Date
): Promise<Date | null> {
  if (precioObjetivo - montoAcumulado <= toleranciaDiferenciaPagoUSD(precioObjetivo)) return null;
  if (!plan.permitePagoParcial) {
    throw new AbonoNoPermitidoError();
  }

  const reglaFrecuencia = await deps.reglasAbono.buscarPorOrganizacionYFrecuencia(organizacionId, plan.frecuencia);
  const reglaEfectiva = resolverReglaAbono(
    { minimoAbonoTipo: plan.minimoAbonoTipo, minimoAbonoValor: plan.minimoAbonoValor },
    reglaFrecuencia
  );
  const montoMinimo = calcularMontoMinimoAbono(reglaEfectiva, precioObjetivo, plan.diasCiclo);

  if (montoAcumulado < montoMinimo) {
    throw new AbonoMenorAlMinimoError(montoMinimo);
  }

  return calcularFechaLimiteAbono(reglaEfectiva, montoAcumulado, precioObjetivo, base, plan.diasCiclo);
}

export async function registrarPago(deps: RegistrarPagoDeps, input: DatosRegistrarPago): Promise<Pago[]> {
  if (!(await deps.autorizacion.tienePermiso(input.registradoPorId, "PAGOS", "CREAR"))) {
    throw new RolNoAutorizadoError();
  }

  validarLineasDePago(input.lineas, "conAbono");

  const meses = input.meses ?? 1;
  if (!Number.isInteger(meses) || meses < 1 || meses > MAX_MESES_POR_PAGO) throw new MesesInvalidosError();

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
  const precioMes = huboCambioDePlan ? plan.precioUSD : miembro.precioPlan;
  const precioObjetivo = precioMes * meses;

  const montoTotal = input.lineas.reduce((suma, linea) => suma + linea.monto, 0);

  // Saldo a favor (generado por un cambio de plan a la baja o por un pago de más guardado como crédito) — se
  // descuenta automáticamente de lo que este pago necesita cubrir, sin importar el plan de este pago, y solo en lo
  // que hace falta (ver saldoNecesario): si el efectivo ya cubre el ciclo, el crédito no se toca. Nunca deja
  // el saldo negativo; el consumo se persiste junto con el resto de los cambios de este pago (más abajo), no
  // antes, para no gastarlo si el pago falla por otra validación.
  const saldoDisponible = miembro.saldoAFavorUSD;

  const ahora = new Date();

  const inicioDeHoy = new Date(ahora);
  inicioDeHoy.setHours(0, 0, 0, 0);
  if (input.fechaPago && input.fechaPago < inicioDeHoy) {
    const saldoAConsumir = saldoNecesario(saldoDisponible, precioObjetivo, montoTotal);
    if (precioObjetivo > 0 && montoTotal <= 0 && saldoAConsumir < precioObjetivo) throw new MontoInvalidoError();
    return registrarPagoRetroactivo(deps, input, {
      miembro,
      plan,
      huboCambioDePlan,
      precioObjetivo,
      meses,
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
    pagosDelCicloAbierto.length > 0 && totalPagado(pagosDelCicloAbierto) < precioMes;
  if (meses > 1 && esAbonoDeCicloAbierto) throw new MesesNoDisponiblesError();
  const pagadoPrevio = esAbonoDeCicloAbierto ? totalPagado(pagosDelCicloAbierto) : 0;
  const saldoAConsumir = saldoNecesario(saldoDisponible, precioObjetivo - pagadoPrevio, montoTotal);
  if (precioObjetivo > 0 && montoTotal <= 0 && pagadoPrevio + saldoAConsumir < precioObjetivo) {
    throw new MontoInvalidoError();
  }

  let base: Date;
  let fin: Date;

  if (esAbonoDeCicloAbierto) {
    fin = activa!.fin;
    base = pagosDelCicloAbierto[0].fechaInicioCiclo ?? activa!.inicio;
  } else {
    base = activa && activa.fin > ahora ? activa.fin : ahora;
    fin = new Date(base);
    fin.setDate(fin.getDate() + plan.diasCiclo * meses);
  }

  // Motor de reglas de abono: solo aplica cuando el pago resultante deja
  // el ciclo sin saldar (es decir, es un abono real, no un pago total).
  // montoTotal ya viene calculado más arriba como suma de input.lineas.
  const montoAcumuladoDelCiclo = pagadoPrevio + montoTotal + saldoAConsumir;
  const esAbonoParcial = montoAcumuladoDelCiclo < precioObjetivo;
  if (meses > 1 && precioObjetivo - montoAcumuladoDelCiclo > toleranciaDiferenciaPagoUSD(precioObjetivo)) {
    throw new MesesRequierenPagoCompletoError();
  }

  const fechaLimiteAbonoCalculada = esAbonoParcial
    ? await evaluarAbonoParcial(deps, input.organizacionId, plan, precioObjetivo, montoAcumuladoDelCiclo, base)
    : null;

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

  const saldoFinal = Math.round((saldoDisponible - saldoAConsumir + excedenteASaldo(input, montoAcumuladoDelCiclo, precioObjetivo)) * 100) / 100;
  if (saldoFinal !== saldoDisponible) {
    await deps.miembros.actualizar(input.organizacionId, input.miembroId, { saldoAFavorUSD: saldoFinal });
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
      montoBs: montoBsDeLinea(linea, linea.tasaCambio),
      fechaInicioCiclo: base,
      fechaFinCiclo: fin,
      grupoPagoId,
    });
    pagosCreados.push(pago);
  }

  return pagosCreados;
}

// Pago con fecha pasada. Mismo flujo de siempre (líneas, métodos, monto) con una sola variación: la fecha. No se
// enlaza a ningún turno (no entra en arqueos), la tasa de las líneas en Bs es la BCV de esa fecha y no admite abonos.
// Regularizando (aviso "Por regularizar" o primer pago de un miembro nuevo) el ciclo nuevo reemplaza al anterior:
// vencimiento = fecha del pago + días del plan, y se apaga el aviso. Para un miembro normal el ciclo se suma al
// vigente en esa fecha, o arranca ese día si ya estaba vencido.
async function registrarPagoRetroactivo(
  deps: RegistrarPagoDeps,
  input: DatosRegistrarPago,
  ctx: {
    miembro: { id: string; porRegularizar: boolean };
    plan: Plan;
    huboCambioDePlan: boolean;
    precioObjetivo: number;
    meses: number;
    montoTotal: number;
    saldoAConsumir: number;
    saldoDisponible: number;
    fechaPago: Date;
    ahora: Date;
  }
): Promise<Pago[]> {
  // Regularizar (miembro migrado o primer pago de un miembro nuevo): el ciclo se reemplaza y el tope es amplio. Un
  // miembro normal que paga un día anterior: el ciclo se suma al vigente (o arranca ese día) y el tope es corto.
  const regulariza = ctx.miembro.porRegularizar || !!input.primerPagoDeInscripcion;
  const maxDias = regulariza ? MAX_DIAS_ATRAS_PAGO_RETROACTIVO : MAX_DIAS_ATRAS_PAGO_FECHADO;
  const limite = new Date(ctx.ahora);
  limite.setDate(limite.getDate() - maxDias);
  if (ctx.fechaPago < limite) throw new FechaPagoInvalidaError(maxDias);

  // Solo el primer pago de un miembro nuevo puede ser un abono (queda con plazo de acceso desde esa fecha);
  // el resto de los pagos con fecha pasada deben cubrir el precio completo.
  const montoAcumulado = ctx.montoTotal + ctx.saldoAConsumir;
  const esAbonoParcial = montoAcumulado < ctx.precioObjetivo;
  const faltaMasQueLaTolerancia = ctx.precioObjetivo - montoAcumulado > toleranciaDiferenciaPagoUSD(ctx.precioObjetivo);
  if (faltaMasQueLaTolerancia && ctx.meses > 1) throw new MesesRequierenPagoCompletoError();
  if (faltaMasQueLaTolerancia && !input.primerPagoDeInscripcion) throw new PagoRetroactivoIncompletoError();
  const fechaLimiteAbono = esAbonoParcial
    ? await evaluarAbonoParcial(deps, input.organizacionId, ctx.plan, ctx.precioObjetivo, montoAcumulado, ctx.fechaPago)
    : null;

  // La tasa de cada línea en Bs se reemplaza por la BCV de la fecha del pago (la del formulario es la de hoy).
  let tasaDelDia: number | null = null;
  if (input.lineas.some((linea) => linea.tasaCambio !== null)) {
    const tasa = await deps.tasas?.buscarMasCercanaAnterior(ctx.fechaPago);
    if (!tasa) throw new SinTasaParaFechaError();
    tasaDelDia = tasa.valor;
  }

  const planId = input.planId;
  let inicioCiclo = ctx.fechaPago;
  let fin: Date;
  if (regulariza) {
    fin = new Date(ctx.fechaPago);
    fin.setDate(fin.getDate() + ctx.plan.diasCiclo * ctx.meses);
    const ajustada = await deps.suscripciones.ajustarCicloMasReciente(input.miembroId, ctx.fechaPago, fin, planId);
    if (!ajustada) {
      await deps.suscripciones.crear({ miembroId: input.miembroId, planId, inicio: ctx.fechaPago, fin, fechaLimiteAbono });
    }
  } else {
    const activa = await deps.suscripciones.buscarActivaVigentePorMiembroYPlan(input.miembroId, planId, ctx.fechaPago);
    if (activa) inicioCiclo = activa.fin;
    fin = new Date(inicioCiclo);
    fin.setDate(fin.getDate() + ctx.plan.diasCiclo * ctx.meses);
    if (activa) {
      await deps.suscripciones.extenderFin(activa.id, fin);
      await deps.suscripciones.actualizarFechaLimiteAbono(activa.id, null);
    } else {
      await deps.suscripciones.crear({ miembroId: input.miembroId, planId, inicio: inicioCiclo, fin, fechaLimiteAbono: null });
    }
  }
  await deps.miembros.actualizar(input.organizacionId, input.miembroId, {
    planId,
    ...(ctx.huboCambioDePlan ? { precioPlan: ctx.plan.precioUSD } : {}),
  });
  await deps.miembros.actualizarFechasPago(input.miembroId, ctx.fechaPago, fin);
  const saldoFinal = Math.round((ctx.saldoDisponible - ctx.saldoAConsumir + excedenteASaldo(input, montoAcumulado, ctx.precioObjetivo)) * 100) / 100;
  if (saldoFinal !== ctx.saldoDisponible) {
    await deps.miembros.actualizar(input.organizacionId, input.miembroId, { saldoAFavorUSD: saldoFinal });
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
        montoBs: montoBsDeLinea(linea, tasaCambio),
        fechaInicioCiclo: inicioCiclo,
        fechaFinCiclo: fin,
        grupoPagoId,
        fechaPago: ctx.fechaPago,
      })
    );
  }
  return pagosCreados;
}
