const CLAVE_STORAGE = "kiosco_api_key";

export function obtenerApiKey(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(CLAVE_STORAGE);
}

export function guardarApiKey(apiKey: string): void {
  window.localStorage.setItem(CLAVE_STORAGE, apiKey);
}
