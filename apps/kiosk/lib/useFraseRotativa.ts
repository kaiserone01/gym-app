import { useEffect, useState } from "react";
import { crearBolsa } from "./bolsaFrases";

const INTERVALO_MS = 4_500;
// Debe coincidir con la transición de .frase-salida en globals.css.
const SALIDA_MS = 300;

// Frase actual de la bolsa barajada. `saliendo` es true los últimos 300 ms antes del cambio para
// que la ficha anime la salida. La primera frase es la primera de la lista (no aleatoria) para no
// diferir entre el prerender y el cliente.
export function useFraseRotativa(frases: readonly string[]): { frase: string; saliendo: boolean } {
  const [frase, setFrase] = useState(frases[0]);
  const [saliendo, setSaliendo] = useState(false);

  useEffect(() => {
    const siguiente = crearBolsa(frases);
    let cambio: ReturnType<typeof setTimeout> | undefined;

    const temporizador = setInterval(() => {
      setSaliendo(true);
      cambio = setTimeout(() => {
        setFrase(siguiente());
        setSaliendo(false);
      }, SALIDA_MS);
    }, INTERVALO_MS);

    return () => {
      clearInterval(temporizador);
      clearTimeout(cambio);
    };
  }, [frases]);

  return { frase, saliendo };
}
