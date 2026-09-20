export interface IArchivoStorageService {
  /**
   * Sube un archivo binario y devuelve la URL pública para acceder a él.
   * @param carpeta Prefijo lógico dentro del storage (p. ej. "miembros").
   * @param nombreArchivo Nombre final del archivo, incluida la extensión.
   * @param contenido Contenido binario del archivo.
   * @param contentType Tipo MIME del archivo (p. ej. "image/jpeg").
   */
  subir(carpeta: string, nombreArchivo: string, contenido: Buffer, contentType: string): Promise<string>;
}
