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

// Instante real en que empieza el día calendario de Caracas (UTC-4, sin horario de verano).
export function inicioDelDiaCaracas(ahora: Date): Date {
  return new Date(diaCalendarioCaracas(ahora).getTime() + 4 * 3_600_000);
}

// ¿Hoy (día calendario de Caracas) es el cumpleaños? fechaNacimiento se guarda como fecha local a las
// 00:00, igual que fechaInscripcion, y se lee con getters locales. Quien nació un 29 de febrero solo
// cumple los años bisiestos.
export function esCumpleanos(fechaNacimiento: Date | null, ahora: Date): boolean {
  if (!fechaNacimiento) return false;
  const hoy = diaCalendarioCaracas(ahora);
  return fechaNacimiento.getMonth() === hoy.getUTCMonth() && fechaNacimiento.getDate() === hoy.getUTCDate();
}

// El padrón guarda las fechas a medianoche UTC; recibe una así y devuelve ese mismo día calendario a las
// 00:00 de Caracas (el servidor lee las fechas con getters locales en esa zona). Caracas fue UTC-4:30
// entre 2007-12-09 y 2016-05-01, así que el desfase se calcula con Intl, sin depender del huso del servidor.
const PARTES_CARACAS = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Caracas",
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function relojDeCaracasComoUtc(instante: Date): number {
  const p = Object.fromEntries(PARTES_CARACAS.formatToParts(instante).map((x) => [x.type, Number(x.value)]));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}

export function medianocheCaracasDeFechaUtc(fecha: Date): Date {
  const deseado = Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate());
  let candidato = new Date(deseado + 4 * 3_600_000);
  for (let i = 0; i < 2; i++) {
    const diferencia = deseado - relojDeCaracasComoUtc(candidato);
    if (diferencia === 0) break;
    candidato = new Date(candidato.getTime() + diferencia);
  }
  return candidato;
}
