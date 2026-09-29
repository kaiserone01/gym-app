import { orquestadorTasa } from "@/lib/tasaBcv";
import { SinTasaDisponibleError } from "@gym-app/domain/use-cases/ObtenerTasaVigente";

// Tasa BCV vigente para mostrar el equivalente en Bs de un precio en USD;
// null si todavía no hay ninguna guardada.
export async function obtenerTasaActual(): Promise<number | null> {
  const tasa = await orquestadorTasa.obtenerTasaVigenteFresca().catch((error) => {
    if (error instanceof SinTasaDisponibleError) return null;
    throw error;
  });
  return tasa?.tasa.valor ?? null;
}
