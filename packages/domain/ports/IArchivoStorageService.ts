export interface SubidaPrefirmada {
  /** URL a la que el navegador hace PUT con `cabeceras` exactamente como vienen. */
  urlSubida: string;
  /** URL pública definitiva del archivo, una vez subido. */
  urlPublica: string;
  clave: string;
  cabeceras: Record<string, string>;
}

export interface IArchivoStorageService {
  /**
   * Sube un archivo binario y devuelve la URL pública para acceder a él.
   * @param carpeta Prefijo lógico dentro del storage (p. ej. "miembros").
   * @param nombreArchivo Nombre final del archivo, incluida la extensión.
   * @param contenido Contenido binario del archivo.
   * @param contentType Tipo MIME del archivo (p. ej. "image/jpeg").
   * @param cacheControl Cabecera Cache-Control del objeto (opcional).
   */
  subir(carpeta: string, nombreArchivo: string, contenido: Buffer, contentType: string, cacheControl?: string): Promise<string>;

  /** URL firmada para que el navegador suba un archivo grande directo al storage (sin pasar por el servidor). */
  urlPrefirmada(carpeta: string, nombreArchivo: string, contentType: string, cacheControl: string): Promise<SubidaPrefirmada>;

  /** Tamaño y tipo reales de un archivo ya subido, o null si no existe. */
  inspeccionar(urlPublica: string): Promise<{ bytes: number; contentType: string } | null>;

  /** Borra un archivo a partir de su URL pública. Solo acepta URLs del propio bucket. */
  eliminar(urlPublica: string): Promise<void>;
}
