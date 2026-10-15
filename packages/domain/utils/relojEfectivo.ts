// Hora que la TV usa para decidir qué mostrar. Algunos equipos pierden la hora al desenchufarse; el servidor
// manda su hora con cada manifiesto y la TV guarda la última, así el reloj nunca retrocede de ella.
export function instanteEfectivo(relojTv: Date, servidorAhoraGuardado: Date | null): Date {
  const guardadoValido = servidorAhoraGuardado !== null && !Number.isNaN(servidorAhoraGuardado.getTime());
  if (Number.isNaN(relojTv.getTime())) return guardadoValido ? servidorAhoraGuardado : relojTv;
  if (!guardadoValido) return relojTv;
  return relojTv.getTime() >= servidorAhoraGuardado.getTime() ? relojTv : servidorAhoraGuardado;
}
