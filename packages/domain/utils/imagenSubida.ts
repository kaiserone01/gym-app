// El panel comprime las imágenes antes de subirlas; este tope solo frena subidas anómalas.
export const MAX_BYTES_IMAGEN = 5 * 1024 * 1024;

const EXTENSION_POR_TIPO: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// Extensión de un archivo de imagen subido, derivada del tipo MIME (no del nombre, que controla el cliente),
// o null si no es JPEG/PNG/WebP o está vacío o supera el tope de tamaño.
export function extensionDeImagen(contentType: string, bytes: number): string | null {
  if (bytes <= 0 || bytes > MAX_BYTES_IMAGEN) return null;
  return EXTENSION_POR_TIPO[contentType] ?? null;
}
