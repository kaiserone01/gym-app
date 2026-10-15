// Espera `ms` o hasta que se cancele (lo que ocurra primero); nunca lanza.
export function esperar(ms: number, señal: AbortSignal): Promise<void> {
  return new Promise((resolver) => {
    if (señal.aborted) return resolver();
    const temporizador = setTimeout(resolver, ms);
    señal.addEventListener(
      "abort",
      () => {
        clearTimeout(temporizador);
        resolver();
      },
      { once: true }
    );
  });
}
