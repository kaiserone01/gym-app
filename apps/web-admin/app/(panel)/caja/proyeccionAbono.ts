// Réplica intencional de RegistrarPago.ts/ReglaAbono.ts — mismo criterio,
// para que lo mostrado ANTES de pagar (mínimo aceptable, fecha límite)
// coincida con lo que el servidor calculará al confirmar. Ver
// packages/domain/entities/ReglaAbono.ts.
import {
  resolverReglaAbono,
  calcularMontoMinimoAbono,
  calcularProrrateoAbono,
  type ReglaAbonoPorFrecuencia,
  type TipoMinimoAbono,
} from "@gym-app/domain/entities/ReglaAbono";
import { DURACION_DIAS_POR_FRECUENCIA, type FrecuenciaPago } from "@gym-app/domain/entities/Plan";

export interface ProyeccionAbono {
  montoMinimo: number;
  // Días que cubre el monto tipeado y la fecha hasta la que alcanza — puro
  // prorrateo, siempre calculado (no depende de que haya una regla de
  // abono configurada, a diferencia de fechaLimiteAbono que sí se
  // persiste/bloquea acceso). null solo si no queda ningún remanente que
  // prorratear (ni del ciclo actual ni de un adelanto al siguiente).
  diasCubiertos: number | null;
  fechaTope: Date | null;
  cumpleMinimo: boolean;
  // Cuánto falta para saldar el ciclo (actual o, si ya está saldado y se
  // está adelantando, el SIGUIENTE) con este monto acumulado — 0 si ya lo
  // cubre exactamente.
  saldoRemanente: number;
  // % del precio del plan que cubre el ciclo que corresponda (actual o el
  // siguiente que se está adelantando) — 0-100.
  porcentajeCubierto: number;
  // true cuando el ciclo vigente ya está saldado al 100% y el monto
  // tipeado es un adelanto sobre el PRÓXIMO ciclo — la UI usa esto para
  // aclarar que la proyección de abajo es sobre ese ciclo siguiente, no
  // sobre el actual (ver diseño acordado).
  esAdelantoCicloSiguiente: boolean;
}

export function calcularProyeccionAbono(
  plan: { minimoAbonoTipo: TipoMinimoAbono | null; minimoAbonoValor: number | null; frecuencia: FrecuenciaPago; precioUSD: number },
  reglasAbono: ReglaAbonoPorFrecuencia[],
  montoAcumulado: number,
  fechaInicioCiclo: Date
): ProyeccionAbono {
  const reglaFrecuencia = reglasAbono.find((r) => r.frecuencia === plan.frecuencia) ?? null;
  const reglaEfectiva = resolverReglaAbono(
    { minimoAbonoTipo: plan.minimoAbonoTipo, minimoAbonoValor: plan.minimoAbonoValor },
    reglaFrecuencia
  );
  const diasDelCiclo = DURACION_DIAS_POR_FRECUENCIA[plan.frecuencia];
  const montoMinimo = calcularMontoMinimoAbono(reglaEfectiva, plan.precioUSD, diasDelCiclo);

  // El ciclo vigente ya está saldado (montoAcumulado >= precioUSD) y el
  // cajero sigue tipeando más — eso es un abono/adelanto sobre el ciclo
  // SIGUIENTE, no el actual. Se prorratea el remanente (lo que sobra por
  // encima del precio del plan) contra un ciclo que arranca justo cuando
  // termina el vigente (fechaInicioCiclo + diasDelCiclo) — mismo criterio
  // de "base" que usa calcularProyeccionRenovacion en el Paso 2.
  const esAdelantoCicloSiguiente = plan.precioUSD > 0 && montoAcumulado >= plan.precioUSD;
  const montoParaProrratear = esAdelantoCicloSiguiente ? montoAcumulado - plan.precioUSD : montoAcumulado;
  const fechaBaseProrrateo = esAdelantoCicloSiguiente
    ? new Date(fechaInicioCiclo.getTime() + diasDelCiclo * 24 * 60 * 60 * 1000)
    : fechaInicioCiclo;

  const prorrateo = calcularProrrateoAbono(montoParaProrratear, plan.precioUSD, fechaBaseProrrateo, diasDelCiclo);

  return {
    montoMinimo,
    diasCubiertos: prorrateo?.diasCubiertos ?? null,
    fechaTope: prorrateo?.fechaTope ?? null,
    cumpleMinimo: montoAcumulado >= montoMinimo,
    saldoRemanente: plan.precioUSD > 0 ? Math.max(0, plan.precioUSD - montoParaProrratear) : 0,
    porcentajeCubierto: plan.precioUSD > 0 ? Math.min(100, (montoParaProrratear / plan.precioUSD) * 100) : 100,
    esAdelantoCicloSiguiente,
  };
}
