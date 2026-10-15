export interface ConfigVitrina {
  apiUrl: string;
  clave: string;
}

// Clave de la sede en el fragmento de la URL (`#clave=<codificada>`): solo para la vista previa en navegador, donde la
// imagen estática no lleva clave. El fragmento no llega al servidor ni a sus logs.
export function claveDeFragmento(hash: string): string {
  return new URLSearchParams(hash.replace(/^#/, "")).get("clave")?.trim() ?? "";
}

// La URL de web-admin y la clave de la sede las escribe apps/vitrina-tv/capacitor/scripts/preparar.mjs en
// vitrina-config.json dentro del bundle del APK. En la vista previa (apps/vitrina/Dockerfile) el contenedor escribe el
// archivo al arrancar con VITRINA_API_URL y clave vacía, y la clave se toma del fragmento.
export async function cargarConfig(): Promise<ConfigVitrina> {
  const respuesta = await fetch("/vitrina-config.json", { cache: "no-store" });
  if (!respuesta.ok) throw new Error("Falta vitrina-config.json en el bundle.");
  const datos: unknown = await respuesta.json();
  const { apiUrl, clave } = (datos ?? {}) as Partial<ConfigVitrina>;
  if (typeof apiUrl !== "string" || !apiUrl || typeof clave !== "string") throw new Error("vitrina-config.json no es válido.");
  return { apiUrl: apiUrl.replace(/\/+$/, ""), clave: clave || claveDeFragmento(window.location.hash) };
}
