import { FRASE_BIENVENIDA_NEUTRA, FRASE_CUMPLEANOS } from "./frases";

// Texto con que la ficha real saluda al miembro. `esCumpleanos` puede faltar (un API viejo que no lo
// envía): en ese caso se saluda en neutro. El cumpleaños manda sobre el saludo y es igual para todos.
export function textoSaludo(esCumpleanos: boolean | undefined): string {
  return esCumpleanos ? FRASE_CUMPLEANOS : FRASE_BIENVENIDA_NEUTRA;
}
