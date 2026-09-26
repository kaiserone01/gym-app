// Motor de reglas de abono: decide el monto mínimo aceptable de un abono
// parcial y el plazo de acceso que otorga, combinando la regla de la
// frecuencia del plan (configurable en /configuraciones/reglas-abono) con
// una regla propia del plan (configurable en /planes), que gana cuando
// ambas están definidas. Ver diseño en
// docs/superpowers/specs/2026-09-26-motor-abonos-y-modalidad-pago-design.md
import type { FrecuenciaPago, TipoMinimoAbono } from "./Plan";

export type { TipoMinimoAbono };

export interface ReglaAbonoEfectiva {
  tipo: TipoMinimoAbono;
  valor: number;
  // De dónde salió la regla aplicada — solo informativo, para mostrar en
  // la UI de dónde proviene el mínimo mostrado (útil al configurar un
  // plan, para saber si está usando su propio valor o el heredado).
  origen: "plan" | "frecuencia";
}

export interface ReglaAbonoPorFrecuencia {
  id: string;
  organizacionId: string;
  frecuencia: FrecuenciaPago;
  activo: boolean;
  tipo: TipoMinimoAbono;
  valor: number;
}

// El plan gana si define su propio mínimo (ambos campos no nulos); si no,
// hereda de la regla de su frecuencia, siempre que esté activa. Si
// ninguno de los dos aplica, no hay regla — el abono se comporta como
// antes de este motor (sin mínimo más allá de $0.01, sin plazo).
export function resolverReglaAbono(
  plan: { minimoAbonoTipo: TipoMinimoAbono | null; minimoAbonoValor: number | null },
  reglaFrecuencia: { activo: boolean; tipo: TipoMinimoAbono; valor: number } | null
): ReglaAbonoEfectiva | null {
  if (plan.minimoAbonoTipo !== null && plan.minimoAbonoValor !== null) {
    return { tipo: plan.minimoAbonoTipo, valor: plan.minimoAbonoValor, origen: "plan" };
  }
  if (reglaFrecuencia?.activo) {
    return { tipo: reglaFrecuencia.tipo, valor: reglaFrecuencia.valor, origen: "frecuencia" };
  }
  return null;
}

// Conversión bidireccional días↔porcentaje, usada tanto en el cálculo del
// motor como en el panel de configuración (para mostrar en vivo el
// equivalente en la otra unidad mientras se configura una regla).
export function diasAPorcentaje(dias: number, diasDelCiclo: number): number {
  if (diasDelCiclo <= 0) return 0;
  return (dias / diasDelCiclo) * 100;
}

export function porcentajeADias(porcentaje: number, diasDelCiclo: number): number {
  return Math.round((porcentaje / 100) * diasDelCiclo);
}

// Monto mínimo de abono en USD que exige la regla efectiva — nunca menos
// que el equivalente a 1 día completo del ciclo, para que un abono válido
// jamás pueda redondear a 0 días de acceso (ver calcularFechaLimiteAbono).
// Sin regla activa, el mínimo es prácticamente nulo ($0.01) — cualquier
// monto positivo es un abono válido, igual que antes de este motor.
export function calcularMontoMinimoAbono(
  regla: ReglaAbonoEfectiva | null,
  precioPlan: number,
  diasDelCiclo: number
): number {
  if (!regla || precioPlan <= 0 || diasDelCiclo <= 0) return 0.01;
  const dias = regla.tipo === "DIAS" ? regla.valor : porcentajeADias(regla.valor, diasDelCiclo);
  const diasEfectivos = Math.max(dias, 1);
  return (precioPlan / diasDelCiclo) * diasEfectivos;
}

// Fecha límite de acceso que otorga el monto ACUMULADO del ciclo (no solo
// el abono más reciente) — null si no hay regla activa, o si el monto ya
// alcanza/supera el precio del plan (ciclo saldado, sin restricción).
export function calcularFechaLimiteAbono(
  regla: ReglaAbonoEfectiva | null,
  montoAcumulado: number,
  precioPlan: number,
  fechaInicioCiclo: Date,
  diasDelCiclo: number
): Date | null {
  if (!regla || precioPlan <= 0 || diasDelCiclo <= 0) return null;
  if (montoAcumulado >= precioPlan) return null;
  const precioPorDia = precioPlan / diasDelCiclo;
  const diasCubiertos = Math.floor(montoAcumulado / precioPorDia);
  const limite = new Date(fechaInicioCiclo);
  limite.setDate(limite.getDate() + diasCubiertos);
  return limite;
}
