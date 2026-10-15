import { Capacitor } from "@capacitor/core";
import { AlmacenDisco } from "./almacenDisco";
import { AlmacenWeb } from "./almacenWeb";

// Dónde viven las piezas (fotos y videos) una vez descargadas. En el APK son archivos en el almacenamiento interno
// de la app; en el navegador (desarrollo) es la Cache API.
export interface Almacen {
  iniciar(): Promise<void>;
  /** URL reproducible de una pieza ya guardada, o null si no está. */
  rutaLocal(url: string): string | null;
  /** Descarga la pieza si falta; lanza si no se pudo (sin red, sin espacio…). */
  guardar(url: string): Promise<void>;
  eliminar(url: string): Promise<void>;
  /** URLs remotas de las piezas guardadas. */
  listar(): Promise<string[]>;
}

export function crearAlmacen(): Almacen {
  return Capacitor.isNativePlatform() ? new AlmacenDisco() : new AlmacenWeb();
}
