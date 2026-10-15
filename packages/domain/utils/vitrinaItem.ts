import type { DatosVitrinaItem } from "../entities/Vitrina";

export const DURACION_MIN_SEG = 3;
export const DURACION_MAX_SEG = 300;

// Campo numérico de un formulario: vacío → null; con coma o punto decimal; texto no numérico → NaN (que la
// validación rechaza con su mensaje).
export function numeroOpcional(valor: unknown): number | null {
  if (valor === null || valor === undefined) return null;
  const texto = String(valor).trim().replace(",", ".");
  return texto === "" ? null : Number(texto);
}

// Mensaje de error del primer problema de un ítem antes de guardarlo, o null si es válido.
export function validarVitrinaItem(d: DatosVitrinaItem): string | null {
  if (!d.mediaUrl.trim()) return "Falta subir la imagen o el video.";
  if (d.tipo === "ENTRENADOR" && !d.nombre?.trim()) return "El entrenador necesita un nombre.";

  const limites: Array<[string | null, number, string]> = [
    [d.nombre, 60, "El nombre"],
    [d.especialidad, 60, "La especialidad"],
    [d.frase, 120, "La frase"],
    [d.etiqueta, 20, "La etiqueta"],
  ];
  for (const [valor, maximo, que] of limites) {
    if (valor && valor.trim().length > maximo) return `${que} admite hasta ${maximo} caracteres.`;
  }

  for (const [valor, que] of [[d.precioUSD, "El precio"], [d.ofertaUSD, "La oferta"]] as const) {
    if (valor !== null && (!Number.isFinite(valor) || valor < 0)) return `${que} no es un monto válido.`;
  }
  if (d.descuentoPct !== null && (!Number.isFinite(d.descuentoPct) || d.descuentoPct < 0 || d.descuentoPct > 100)) {
    return "El descuento debe estar entre 0 y 100 %.";
  }
  if (d.precioUSD !== null && d.ofertaUSD !== null && d.ofertaUSD > d.precioUSD) {
    return "La oferta no puede ser mayor que el precio.";
  }
  if (d.duracionSeg !== null && (!Number.isInteger(d.duracionSeg) || d.duracionSeg < DURACION_MIN_SEG || d.duracionSeg > DURACION_MAX_SEG)) {
    return `La duración debe ser un número entero entre ${DURACION_MIN_SEG} y ${DURACION_MAX_SEG} segundos.`;
  }
  if (d.inicio && d.fin && d.inicio.getTime() > d.fin.getTime()) return "La fecha de fin es anterior a la de inicio.";
  return null;
}
