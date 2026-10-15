// Lee un flujo text/event-stream y avisa del nombre de cada evento. Los comentarios (": latido") solo mantienen
// viva la conexión y se ignoran. Resuelve cuando el servidor cierra el flujo y lanza si la lectura se corta.
// `alBytes` se llama con cada trozo recibido (aunque sea un latido): sirve para vigilar el silencio.
export async function leerEventos(
  cuerpo: ReadableStream<Uint8Array>,
  alEvento: (nombre: string) => void,
  alBytes?: () => void
): Promise<void> {
  const lector = cuerpo.getReader();
  const decodificador = new TextDecoder();
  let pendiente = "";
  for (;;) {
    const { done, value } = await lector.read();
    if (done) return;
    alBytes?.();
    // CRLF → LF sobre todo lo acumulado: así un "\r" al final de un trozo se completa con el "\n" del siguiente.
    pendiente = (pendiente + decodificador.decode(value, { stream: true })).replace(/\r\n/g, "\n");
    let corte: number;
    while ((corte = pendiente.indexOf("\n\n")) !== -1) {
      const bloque = pendiente.slice(0, corte);
      pendiente = pendiente.slice(corte + 2);
      const lineas = bloque.split("\n").filter((linea) => !linea.startsWith(":") && linea !== "");
      if (lineas.length === 0) continue;
      const nombre = lineas.find((linea) => linea.startsWith("event:"))?.slice(6).trim() ?? "message";
      alEvento(nombre);
    }
  }
}

// Vigila que lleguen bytes: si pasan `ms` sin que se llame a `latir()`, avisa una vez (conexión half-open).
export function vigilarSilencio(ms: number, alSilencio: () => void): { latir: () => void; parar: () => void } {
  let temporizador = setTimeout(alSilencio, ms);
  return {
    latir: () => {
      clearTimeout(temporizador);
      temporizador = setTimeout(alSilencio, ms);
    },
    parar: () => clearTimeout(temporizador),
  };
}
