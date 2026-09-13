const URL_API = process.env.NEXT_PUBLIC_API_URL;

export type EstadoCheckIn = "activo" | "vencido";

export interface ResultadoCheckIn {
  nombre: string;
  fotoUrl: string | null;
  entrenador: string | null;
  planTipo: "SIN_ENTRENADOR" | "CON_ENTRENADOR";
  estado: EstadoCheckIn;
}

// Se lanza cuando el servidor SÍ respondió, pero con un error (401/400/404/500).
// Reintentar esto no cambia nada — nunca se encola en la cola offline.
export class ErrorCheckIn extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

// Si la red falla del todo, fetch nativo lanza un TypeError (no llega a
// haber respuesta) — eso es lo que distingue "sin conexión, reintentar
// después" (no se lanza ErrorCheckIn) de "el servidor respondió que no"
// (se lanza ErrorCheckIn, no es reintentable).
export async function registrarCheckIn(apiKey: string, cedula: string): Promise<ResultadoCheckIn> {
  if (!URL_API) {
    throw new ErrorCheckIn("NEXT_PUBLIC_API_URL no está configurada en este build.", 0);
  }

  const respuesta = await fetch(`${URL_API}/api/checkin`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Kiosk-Api-Key": apiKey,
    },
    body: JSON.stringify({ cedula }),
  });

  const datos = await respuesta.json().catch(() => ({}));

  if (!respuesta.ok) {
    throw new ErrorCheckIn(datos.error ?? `Error ${respuesta.status} al registrar el check-in.`, respuesta.status);
  }

  return datos as ResultadoCheckIn;
}
