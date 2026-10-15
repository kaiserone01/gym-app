import type { ManifiestoVitrina } from "@gym-app/domain/entities/Vitrina";
import { urlsDeManifiesto } from "@gym-app/domain/services/manifiestoVitrina";
import type { Almacen } from "./almacen";

export interface ResultadoSincronizacion {
  completo: boolean;
  descargadas: string[];
  eliminadas: string[];
  fallidas: string[];
}

// Deja el almacén con exactamente lo que pide el manifiesto: descarga lo que falta y borra lo que sobra. Si alguna
// descarga falla NO borra nada (lo anterior sigue disponible para lo que aún se muestra) y devuelve completo=false:
// quien llama conserva el manifiesto viejo y reintenta.
// Orden seguro: descargas → `alCompletar` (quien llama adopta y persiste el manifiesto nuevo) → borrados. Así nada que
// siga en uso por el manifiesto anterior se borra antes de que el nuevo esté guardado. Si `alCompletar` lanza, no se
// borra nada.
export async function sincronizar(
  manifiesto: ManifiestoVitrina,
  almacen: Almacen,
  alCompletar?: (manifiesto: ManifiestoVitrina) => void | Promise<void>
): Promise<ResultadoSincronizacion> {
  const necesarias = urlsDeManifiesto(manifiesto);
  const guardadas = new Set(await almacen.listar());

  const descargadas: string[] = [];
  const fallidas: string[] = [];
  for (const url of necesarias) {
    if (guardadas.has(url)) continue;
    try {
      await almacen.guardar(url);
      descargadas.push(url);
    } catch (error) {
      console.warn("[vitrina] no se pudo descargar", url, error);
      fallidas.push(url);
    }
  }

  const eliminadas: string[] = [];
  if (fallidas.length === 0) {
    await alCompletar?.(manifiesto);
    const vigentes = new Set(necesarias);
    for (const url of guardadas) {
      if (vigentes.has(url)) continue;
      try {
        await almacen.eliminar(url);
        eliminadas.push(url);
      } catch (error) {
        console.warn("[vitrina] no se pudo borrar", url, error);
      }
    }
  }
  return { completo: fallidas.length === 0, descargadas, eliminadas, fallidas };
}
