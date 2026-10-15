import type { ManifiestoVitrina } from "@gym-app/domain/entities/Vitrina";
import type { ConfigVitrina } from "./config";
import { leerEventos, vigilarSilencio } from "./sse";

const SILENCIO_MAX_MS = 60_000;

const cabeceras = (config: ConfigVitrina) => ({ "X-Kiosk-Api-Key": config.clave });

export async function pedirManifiesto(config: ConfigVitrina, señal?: AbortSignal): Promise<ManifiestoVitrina> {
  const respuesta = await fetch(`${config.apiUrl}/api/kiosco/vitrina`, { headers: cabeceras(config), signal: señal, cache: "no-store" });
  if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
  return (await respuesta.json()) as ManifiestoVitrina;
}

// Mantiene abierta la conexión de avisos (SSE) hasta que el servidor la cierre o se cancele. `fetch` con stream y
// cabecera (EventSource no admite cabeceras). Lanza si la conexión no se pudo abrir o se cortó.
export async function abrirEventos(
  config: ConfigVitrina,
  oyentes: { alAbrir: () => void; alEvento: () => void },
  señal: AbortSignal
): Promise<void> {
  // El servidor manda un latido cada 25 s: si pasan 60 s sin ningún byte la conexión está muerta (half-open) y se
  // aborta para que quien llama reconecte.
  const interno = new AbortController();
  const abortarInterno = () => interno.abort();
  if (señal.aborted) interno.abort();
  señal.addEventListener("abort", abortarInterno, { once: true });
  const vigia = vigilarSilencio(SILENCIO_MAX_MS, abortarInterno);
  try {
    const respuesta = await fetch(`${config.apiUrl}/api/kiosco/vitrina/eventos`, {
      headers: { ...cabeceras(config), Accept: "text/event-stream" },
      signal: interno.signal,
      cache: "no-store",
    });
    if (!respuesta.ok || !respuesta.body) throw new Error(`HTTP ${respuesta.status}`);
    oyentes.alAbrir();
    await leerEventos(
      respuesta.body,
      (nombre) => {
        if (nombre === "vitrina:cambio") oyentes.alEvento();
      },
      vigia.latir
    );
  } finally {
    vigia.parar();
    señal.removeEventListener("abort", abortarInterno);
  }
}
