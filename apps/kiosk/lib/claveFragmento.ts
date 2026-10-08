// Clave de la sucursal que la APK de Android TV pasa en la URL de inicio: `/config#clave=<codificada>`.
// Va en el fragmento (no en la query) para que no llegue al servidor ni a sus logs.
export function claveDeFragmento(hash: string): string | null {
  const clave = new URLSearchParams(hash.replace(/^#/, "")).get("clave")?.trim();
  return clave ? clave : null;
}
