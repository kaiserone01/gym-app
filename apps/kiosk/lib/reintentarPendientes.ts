import { registrarCheckIn, ErrorCheckIn } from "./api";
import { listarPendientes, quitarPendiente } from "./colaPendientes";

// Reintenta cada pendiente en orden de encolado. Si uno falla de nuevo por
// red, se corta ahí mismo — la red probablemente sigue caída, no tiene
// sentido seguir intentando los siguientes en esta pasada (se reintentará
// en el próximo evento "online"). Si el servidor SÍ responde (aunque sea
// con un error, ej. cédula que ya no existe), se descarta igual: ya
// obtuvo una respuesta real, reintentar no la va a cambiar.
export function reintentarPendientes(apiKey: string): Promise<void> {
  // Una sola pasada a la vez: el temporizador y el evento "online" pueden coincidir y reenviarían la misma cédula dos veces.
  enCurso ??= pasada(apiKey).finally(() => {
    enCurso = null;
  });
  return enCurso;
}

let enCurso: Promise<void> | null = null;

async function pasada(apiKey: string): Promise<void> {
  const pendientes = await listarPendientes();

  for (const pendiente of pendientes) {
    try {
      await registrarCheckIn(apiKey, pendiente.cedula);
      await quitarPendiente(pendiente.id);
    } catch (error) {
      if (error instanceof ErrorCheckIn) {
        await quitarPendiente(pendiente.id);
        continue;
      }
      return;
    }
  }
}
