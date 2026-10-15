import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { FileTransfer } from "@capacitor/file-transfer";
import type { Almacen } from "./almacen";

const CARPETA = "vitrina";
const CLAVE_INDICE = "vitrina_indice";

interface Entrada {
  archivo: string;
  bytes: number;
}

// Nombre de archivo local: el último tramo de la URL (un UUID único por subida) sin caracteres raros.
const nombreDe = (url: string) => (url.split("?")[0].split("/").pop() ?? "pieza").replace(/[^A-Za-z0-9._-]/g, "_");

export class AlmacenDisco implements Almacen {
  private indice: Record<string, Entrada> = {};
  private readonly rutas = new Map<string, string>();

  async iniciar(): Promise<void> {
    await Filesystem.mkdir({ path: CARPETA, directory: Directory.Data, recursive: true }).catch(() => {});
    try {
      this.indice = JSON.parse(localStorage.getItem(CLAVE_INDICE) ?? "{}") as Record<string, Entrada>;
    } catch {
      this.indice = {};
    }

    const { files } = await Filesystem.readdir({ path: CARPETA, directory: Directory.Data });
    const enDisco = new Set(files.map((f) => f.name));
    const usados = new Set(Object.values(this.indice).map((e) => e.archivo));

    // Huérfanos (descarga interrumpida, índice perdido): se borran.
    for (const nombre of enDisco) {
      if (!usados.has(nombre)) await this.borrarArchivo(nombre);
    }
    // Entradas sin archivo: se olvidan.
    for (const [url, entrada] of Object.entries(this.indice)) {
      if (!enDisco.has(entrada.archivo)) delete this.indice[url];
    }
    for (const [url, entrada] of Object.entries(this.indice)) this.rutas.set(url, await this.rutaDe(entrada.archivo));
    this.guardarIndice();
  }

  rutaLocal(url: string): string | null {
    return this.rutas.get(url) ?? null;
  }

  async guardar(url: string): Promise<void> {
    if (this.indice[url]) return;
    const archivo = nombreDe(url);
    const temporal = `${archivo}.part`;
    await this.borrarArchivo(temporal);

    // Se descarga a un nombre temporal y se renombra al terminar: nunca se reproduce un archivo a medias.
    // Si algo falla se limpian el temporal y el destino, para no dejar restos a medias.
    let size: number;
    try {
      const destino = await Filesystem.getUri({ path: `${CARPETA}/${temporal}`, directory: Directory.Data });
      await FileTransfer.downloadFile({ url, path: destino.uri });
      await Filesystem.rename({
        from: `${CARPETA}/${temporal}`,
        to: `${CARPETA}/${archivo}`,
        directory: Directory.Data,
        toDirectory: Directory.Data,
      });
      ({ size } = await Filesystem.stat({ path: `${CARPETA}/${archivo}`, directory: Directory.Data }));
      // No se compara con Content-Length: downloadFile no lo devuelve. Al menos se descarta un archivo vacío.
      if (size <= 0) throw new Error("descarga vacía");
    } catch (error) {
      await this.borrarArchivo(temporal);
      await this.borrarArchivo(archivo);
      throw error;
    }

    this.indice[url] = { archivo, bytes: size };
    this.rutas.set(url, await this.rutaDe(archivo));
    this.guardarIndice();
  }

  async eliminar(url: string): Promise<void> {
    const entrada = this.indice[url];
    if (!entrada) return;
    await this.borrarArchivo(entrada.archivo);
    delete this.indice[url];
    this.rutas.delete(url);
    this.guardarIndice();
  }

  async listar(): Promise<string[]> {
    return Object.keys(this.indice);
  }

  private async rutaDe(archivo: string): Promise<string> {
    const { uri } = await Filesystem.getUri({ path: `${CARPETA}/${archivo}`, directory: Directory.Data });
    return Capacitor.convertFileSrc(uri);
  }

  private async borrarArchivo(archivo: string): Promise<void> {
    await Filesystem.deleteFile({ path: `${CARPETA}/${archivo}`, directory: Directory.Data }).catch(() => {});
  }

  private guardarIndice(): void {
    try {
      localStorage.setItem(CLAVE_INDICE, JSON.stringify(this.indice));
    } catch {
      // sin localStorage el índice se reconstruye vacío y los archivos huérfanos se limpian al arrancar
    }
  }
}
