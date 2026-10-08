import { claveDeFragmento } from "./claveFragmento";

const CLAVE_STORAGE = "kiosco_api_key";

export function obtenerApiKey(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(CLAVE_STORAGE);
}

export function guardarApiKey(apiKey: string): void {
  window.localStorage.setItem(CLAVE_STORAGE, apiKey);
}

// La APK de Android TV abre el kiosco con `#clave=<clave>` en la raíz (`/config` no se sirve como ruta
// propia con `serve -s`: devuelve la página de inicio y perdería el fragmento). Si viene, se guarda y se
// borra de la barra de direcciones y del historial. Devuelve true si guardó una clave.
export function guardarClaveDelFragmento(): boolean {
  const clave = claveDeFragmento(window.location.hash);
  if (!clave) return false;
  guardarApiKey(clave);
  window.history.replaceState(null, "", window.location.pathname);
  return true;
}
