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
  // persiste/bloquea acceso). null si el monto ya cubre el plan completo.
  diasCubiertos: number | null;
  fechaTope: Date | null;
  cumpleMinimo: boolean;
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
  const prorrateo = calcularProrrateoAbono(montoAcumulado, plan.precioUSD, fechaInicioCiclo, diasDelCiclo);

  return {
    montoMinimo,
    diasCubiertos: prorrateo?.diasCubiertos ?? null,
    fechaTope: prorrateo?.fechaTope ?? null,
    cumpleMinimo: montoAcumulado >= montoMinimo,
  };
}
