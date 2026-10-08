export const MAX_FRASES_REPOSO = 30;
export const MAX_LARGO_FRASE_REPOSO = 60;
export const OPACIDAD_MINIMA = 20;
export const OPACIDAD_MAXIMA = 100;

// Frases de la ficha en reposo: recorta, descarta vacías y duplicadas, y respeta los topes de largo y cantidad.
export function normalizarFrasesReposo(entrada: readonly string[]): string[] {
  const vistas = new Set<string>();
  for (const cruda of entrada) {
    const frase = cruda.trim().slice(0, MAX_LARGO_FRASE_REPOSO).trim();
    if (frase) vistas.add(frase);
  }
  return [...vistas].slice(0, MAX_FRASES_REPOSO);
}

// Opacidad del fondo de la ficha en reposo: entero entre el mínimo (legibilidad) y 100; sin número válido, 100.
export function limitarOpacidad(valor: unknown): number {
  if (valor === null || valor === undefined || valor === "") return OPACIDAD_MAXIMA;
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return OPACIDAD_MAXIMA;
  return Math.min(OPACIDAD_MAXIMA, Math.max(OPACIDAD_MINIMA, Math.round(numero)));
}
