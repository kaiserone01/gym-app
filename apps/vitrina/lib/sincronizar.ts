import type { ManifiestoVitrina } from "@gym-app/domain/entities/Vitrina";
import { urlsDeManifiesto } from "@gym-app/domain/services/manifiestoVitrina";
import type { Almacen } from "./almacen";

// Intentos consecutivos fallidos tras los que una pieza se da por omitida (el reintento es cada 60 s).
export const INTENTOS_PARA_OMITIR = 3;

export type IntentosFallidos = ReadonlyMap<string, number>;

// Cuenta un intento más para cada URL fallida de esta sincronización. Solo conserva las que fallaron ahora: un éxito
// (o una pieza que ya no está en el manifiesto) reinicia su contador.
export function contarIntentos(previos: IntentosFallidos, fallidas: readonly string[]): Map<string, number> {
  return new Map(fallidas.map((url) => [url, (previos.get(url) ?? 0) + 1]));
}

// Hay que adoptar el manifiesto aunque falten piezas cuando TODAS las fallidas llevan al menos INTENTOS_PARA_OMITIR
// intentos seguidos; así una pieza que da 404 o no cabe no congela la TV en el contenido viejo para siempre.
export function debeOmitirFallidas(intentos: IntentosFallidos, fallidas: readonly string[]): boolean {
  return fallidas.length > 0 && fallidas.every((url) => (intentos.get(url) ?? 0) >= INTENTOS_PARA_OMITIR);
}

export interface ResultadoSincronizacion {
  completo: boolean;
  adoptado: boolean;
  descargadas: string[];
  eliminadas: string[];
  fallidas: string[];
}

// Deja el almacén con exactamente lo que pide el manifiesto: descarga lo que falta y borra lo que sobra. Si alguna
// descarga falla NO borra nada (lo anterior sigue disponible para lo que aún se muestra) y devuelve completo=false:
// quien llama conserva el manifiesto viejo y reintenta, salvo que `omitirFallidas(fallidas)` diga que ya se
// reintentaron suficiente: entonces se adopta igual (las piezas fallidas quedan omitidas y se siguen reintentando).
// Orden seguro: descargas → `alCompletar` (quien llama adopta y persiste el manifiesto nuevo) → borrados. Así nada que
// siga en uso por el manifiesto anterior se borra antes de que el nuevo esté guardado. Si `alCompletar` lanza, no se
// borra nada.
export async function sincronizar(
  manifiesto: ManifiestoVitrina,
  almacen: Almacen,
  alCompletar?: (manifiesto: ManifiestoVitrina) => void | Promise<void>,
  omitirFallidas?: (fallidas: string[]) => boolean
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
  const adoptar = fallidas.length === 0 || (omitirFallidas?.(fallidas) ?? false);
  if (adoptar) {
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
  return { completo: fallidas.length === 0, adoptado: adoptar, descargadas, eliminadas, fallidas };
}
