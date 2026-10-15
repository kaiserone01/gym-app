export const CARPETA_VITRINA = "vitrina";
// Los nombres de objeto llevan un UUID nuevo en cada subida: una URL ya vista nunca cambia de contenido.
export const CACHE_CONTROL_INMUTABLE = "public, max-age=31536000, immutable";

// Nombre de objeto simple: sin subcarpetas, ni "..", ni query string ni fragmento.
const NOMBRE_SEGURO = /^[A-Za-z0-9._-]+$/;

// ¿La URL es de un archivo de la vitrina en nuestro bucket? Impide guardar, inspeccionar o borrar URLs ajenas.
export function esUrlDeVitrina(url: string): boolean {
  const base = process.env.R2_PUBLIC_URL;
  const prefijo = base ? `${base}/${CARPETA_VITRINA}/` : null;
  if (!prefijo || !url.startsWith(prefijo)) return false;
  const nombre = url.slice(prefijo.length);
  return NOMBRE_SEGURO.test(nombre) && !nombre.includes("..");
}
