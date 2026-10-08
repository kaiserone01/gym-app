const URL_API = process.env.NEXT_PUBLIC_API_URL;

export type EstadoCheckIn = "activo" | "en_gracia" | "vencido" | "abono_vencido" | "sucursal_incorrecta";

export interface ResultadoCheckIn {
  nombre: string;
  fotoUrl: string | null;
  entrenador: string | null;
  // ISO 8601 (viaja como JSON); null si el miembro no tiene vencimiento registrado.
  fechaVencimiento: string | null;
  estado: EstadoCheckIn;
  sucursalAsignadaNombre: string;
  sucursalAsignadaDireccion: string | null;
  diasGraciaRestantes: number | null;
  // false cuando la sucursal donde ocurrió el check-in tiene "Días de
  // gracia" en 0 — el concepto de período de gracia no aplica ahí, y la
  // presentación no debe mencionarlo en ningún mensaje.
  tieneGraciaConfigurada: boolean;
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

// Sede y última tasa BCV para la ficha de reposo (GET /api/kiosco/estado).
export interface InfoKiosco {
  sucursalNombre: string;
  tasaBcv: { valor: number; fecha: string } | null;
}

export async function obtenerInfoKiosco(apiKey: string): Promise<InfoKiosco> {
  if (!URL_API) {
    throw new ErrorCheckIn("NEXT_PUBLIC_API_URL no está configurada en este build.", 0);
  }

  const respuesta = await fetch(`${URL_API}/api/kiosco/estado`, { headers: { "X-Kiosk-Api-Key": apiKey } });
  if (!respuesta.ok) {
    throw new ErrorCheckIn(`Error ${respuesta.status} al leer el estado del kiosco.`, respuesta.status);
  }

  return (await respuesta.json()) as InfoKiosco;
}
