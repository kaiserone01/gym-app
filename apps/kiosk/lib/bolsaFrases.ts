function barajar<T>(items: readonly T[], aleatorio: () => number): T[] {
  const copia = [...items];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(aleatorio() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

// "Bolsa barajada": sortea sin repetir hasta agotar la lista y vuelve a barajar; la primera de
// una ronda nueva nunca es la última de la anterior.
export function crearBolsa<T>(items: readonly T[], aleatorio: () => number = Math.random): () => T {
  let cola: T[] = [];
  let ultimo: T | undefined;
  return () => {
    if (cola.length === 0) {
      cola = barajar(items, aleatorio);
      if (items.length > 1 && cola[0] === ultimo) {
        const fin = cola.length - 1;
        [cola[0], cola[fin]] = [cola[fin], cola[0]];
      }
    }
    ultimo = cola.shift() as T;
    return ultimo;
  };
}
