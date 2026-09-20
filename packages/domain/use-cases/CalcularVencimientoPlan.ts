import { DURACION_DIAS_POR_FRECUENCIA, FrecuenciaPago } from "../entities/Plan";

// Fórmula de prorrateo al cambiar de plan sin que medie un pago nuevo:
// se conserva la fecha de inicio original de la Suscripción activa y se
// escala el tiempo ya transcurrido a la duración del nuevo plan. Nunca
// devuelve una fecha anterior a "ahora" (no se retro-vence al miembro).
export function prorratearVencimiento(
  inicioOriginal: Date,
  ahora: Date,
  frecuenciaVieja: FrecuenciaPago,
  frecuenciaNueva: FrecuenciaPago
): Date {
  const diasTranscurridos = Math.max(
    0,
    (ahora.getTime() - inicioOriginal.getTime()) / (24 * 60 * 60 * 1000)
  );
  const duracionVieja = DURACION_DIAS_POR_FRECUENCIA[frecuenciaVieja];
  const duracionNueva = DURACION_DIAS_POR_FRECUENCIA[frecuenciaNueva];

  const diasNuevos = Math.round((diasTranscurridos / duracionVieja) * duracionNueva);
  const vencimiento = new Date(inicioOriginal);
  vencimiento.setDate(vencimiento.getDate() + diasNuevos);

  return vencimiento < ahora ? ahora : vencimiento;
}
