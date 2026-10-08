import { FRASES_REPOSO } from "./frases";

// Las frases de la sucursal se comparan por contenido (clave de texto): el sondeo devuelve un arreglo nuevo
// cada vez y, si se usara su identidad, la rotación de frases se reiniciaría cada 30 s.
const SEPARADOR = "\u0000";

export function claveDeFrases(frases: readonly string[] | undefined): string {
  return (frases ?? []).join(SEPARADOR);
}

export function frasesDesdeClave(clave: string): readonly string[] {
  return clave ? clave.split(SEPARADOR) : FRASES_REPOSO;
}
