import {
  FRASE_BIENVENIDA,
  FRASE_BIENVENIDA_NEUTRA,
  FRASE_BIENVENIDO,
  FRASE_CUMPLEANOS,
} from "./frases";

// Mismos valores que el enum `Genero` del servidor (el kiosco no importa paquetes de dominio).
export type Genero = "MASCULINO" | "FEMENINO";

// Texto con que la ficha real saluda al miembro. `genero` y `esCumpleanos` pueden faltar (miembros sin
// género definido o un API viejo que no los envía): en ese caso se saluda en neutro. El cumpleaños manda
// sobre el saludo y es igual para todos.
export function textoSaludo(genero: Genero | null | undefined, esCumpleanos: boolean | undefined): string {
  if (esCumpleanos) return FRASE_CUMPLEANOS;
  if (genero === "MASCULINO") return FRASE_BIENVENIDO;
  if (genero === "FEMENINO") return FRASE_BIENVENIDA;
  return FRASE_BIENVENIDA_NEUTRA;
}
