// Fórmula de prorrateo al cambiar de plan sin que medie un pago nuevo:
// se conserva la fecha de inicio original de la Suscripción activa y se
// escala el tiempo ya transcurrido a la duración del nuevo plan. Nunca
// devuelve una fecha anterior a "ahora" (no se retro-vence al miembro).
export function prorratearVencimiento(
  inicioOriginal: Date,
  ahora: Date,
  diasCicloViejo: number,
  diasCicloNuevo: number
): Date {
  const diasTranscurridos = Math.max(
    0,
    (ahora.getTime() - inicioOriginal.getTime()) / (24 * 60 * 60 * 1000)
  );

  const diasNuevos = Math.round((diasTranscurridos / diasCicloViejo) * diasCicloNuevo);
  const vencimiento = new Date(inicioOriginal);
  vencimiento.setDate(vencimiento.getDate() + diasNuevos);

  return vencimiento < ahora ? ahora : vencimiento;
}
