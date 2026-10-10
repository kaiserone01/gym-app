// Decide qué fechas de la ficha del miembro cambiaron respecto de las que cargó el formulario.
// Las fechas llegan como texto "aaaa-mm-dd" (o "" si el campo quedó vacío); null = el campo no se envió
// (el miembro no puede ajustar fechas) y entonces se omite siempre.
// Fecha local a las 00:00 (`new Date(`${texto}T00:00:00`)`), igual que el resto de fechas editables de la ficha;
// la inscripción se guarda aparte, como inicio del día de Caracas.
export function calcularCambiosFechas(entrada: {
  vencimiento: string | null;
  vencimientoOriginal: string | null;
  pago: string | null;
  pagoOriginal: string | null;
}): { fechaVencimiento?: Date; fechaUltimoPago?: Date | null } {
  const cambios: { fechaVencimiento?: Date; fechaUltimoPago?: Date | null } = {};

  // Un vencimiento no se vacía: vacío o igual al original = sin cambio.
  if (entrada.vencimiento && entrada.vencimiento !== entrada.vencimientoOriginal) {
    cambios.fechaVencimiento = new Date(`${entrada.vencimiento}T00:00:00`);
  }

  // La fecha de pago sí se puede vaciar (null).
  if (entrada.pago !== null && entrada.pago !== (entrada.pagoOriginal ?? "")) {
    cambios.fechaUltimoPago = entrada.pago ? new Date(`${entrada.pago}T00:00:00`) : null;
  }

  return cambios;
}
