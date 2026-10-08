import { useMemo } from "react";
import type { InfoKiosco } from "./api";
import { claveDeFrases, frasesDesdeClave } from "./frasesReposo";

// Frases del reposo: las de la sucursal si hay, si no las predeterminadas. La referencia solo cambia si
// cambia el contenido.
export function useFrasesReposo(reposo: InfoKiosco["reposo"]): readonly string[] {
  const clave = claveDeFrases(reposo?.frases);
  return useMemo(() => frasesDesdeClave(clave), [clave]);
}
