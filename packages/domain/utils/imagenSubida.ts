// El panel comprime las imágenes antes de subirlas; este tope solo frena subidas anómalas.
export const MAX_BYTES_IMAGEN = 5 * 1024 * 1024;
// Carteles y fotos de la vitrina: hasta 1920 px de lado y 8 MB (un PNG de 1920x1080 puede pasar de 5 MB).
export const MAX_BYTES_IMAGEN_VITRINA = 8 * 1024 * 1024;
export const MAX_LADO_IMAGEN_VITRINA = 1920;

const EXTENSION_POR_TIPO: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// Extensión de un archivo de imagen subido, derivada del tipo MIME (no del nombre, que controla el cliente),
// o null si no es JPEG/PNG/WebP o está vacío o supera el tope de tamaño.
export function extensionDeImagen(contentType: string, bytes: number, maxBytes = MAX_BYTES_IMAGEN): string | null {
  if (bytes <= 0 || bytes > maxBytes) return null;
  return EXTENSION_POR_TIPO[contentType] ?? null;
}
