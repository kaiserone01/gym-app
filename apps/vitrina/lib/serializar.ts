// Envuelve una tarea asíncrona para que nunca corran dos a la vez sin perder avisos: si llega una llamada mientras hay
// una ejecución en curso, se anota y la tarea se repite UNA vez más al terminar (varias llamadas se fusionan en una).
// Un error de la tarea no bloquea las siguientes llamadas.
export function crearSerializador(tarea: () => Promise<void>): () => Promise<void> {
  let enCurso: Promise<void> | null = null;
  let pendiente = false;
  return () => {
    if (enCurso) {
      pendiente = true;
      return enCurso;
    }
    enCurso = (async () => {
      try {
        do {
          pendiente = false;
          try {
            await tarea();
          } catch (error) {
            console.warn("[vitrina] la tarea falló:", error);
          }
        } while (pendiente);
      } finally {
        enCurso = null;
      }
    })();
    return enCurso;
  };
}
