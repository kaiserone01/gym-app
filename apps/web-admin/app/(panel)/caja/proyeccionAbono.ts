// Réplica intencional de RegistrarPago.ts/ReglaAbono.ts — mismo criterio,
// para que lo mostrado ANTES de pagar (mínimo aceptable, fecha límite)
// coincida con lo que el servidor calculará al confirmar. Ver
// packages/domain/entities/ReglaAbono.ts.
import {
  resolverReglaAbono,
  calcularMontoMinimoAbono,
  calcularFechaLimiteAbono,
  type ReglaAbonoPorFrecuencia,
  type TipoMinimoAbono,
} from "@gym-app/domain/entities/ReglaAbono";
import { DURACION_DIAS_POR_FRECUENCIA, type FrecuenciaPago } from "@gym-app/domain/entities/Plan";

export interface ProyeccionAbono {
  montoMinimo: number;
  fechaLimite: Date | null;
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
  const fechaLimite = calcularFechaLimiteAbono(reglaEfectiva, montoAcumulado, plan.precioUSD, fechaInicioCiclo, diasDelCiclo);

  return { montoMinimo, fechaLimite, cumpleMinimo: montoAcumulado >= montoMinimo };
}
