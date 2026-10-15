import type { Almacen } from "./almacen";

const NOMBRE_CACHE = "vitrina-medios";

// Respaldo con la Cache API para correr la vitrina en un navegador (desarrollo). El APK usa AlmacenDisco.
export class AlmacenWeb implements Almacen {
  private readonly urls = new Map<string, string>();

  async iniciar(): Promise<void> {
    const cache = await caches.open(NOMBRE_CACHE);
    for (const peticion of await cache.keys()) {
      const respuesta = await cache.match(peticion);
      if (respuesta) this.urls.set(peticion.url, URL.createObjectURL(await respuesta.blob()));
    }
  }

  rutaLocal(url: string): string | null {
    return this.urls.get(url) ?? null;
  }

  async guardar(url: string): Promise<void> {
    if (this.urls.has(url)) return;
    const respuesta = await fetch(url);
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    const cache = await caches.open(NOMBRE_CACHE);
    await cache.put(url, respuesta.clone());
    this.urls.set(url, URL.createObjectURL(await respuesta.blob()));
  }

  async eliminar(url: string): Promise<void> {
    await (await caches.open(NOMBRE_CACHE)).delete(url);
    const local = this.urls.get(url);
    if (local) URL.revokeObjectURL(local);
    this.urls.delete(url);
  }

  async listar(): Promise<string[]> {
    return [...this.urls.keys()];
  }
}
