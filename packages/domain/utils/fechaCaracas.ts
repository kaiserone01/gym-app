// Día calendario en America/Caracas, normalizado a medianoche UTC (mismo formato que TasaCambio.fecha).
export function diaCalendarioCaracas(ahora: Date): Date {
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Caracas",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ahora); // "2026-09-26"
  return new Date(`${iso}T00:00:00Z`);
}

export function sumarDias(fecha: Date, dias: number): Date {
  return new Date(fecha.getTime() + dias * 86_400_000);
}
