// Orquestador del refresco perezoso de la tasa BCV durante el uso del panel
// (Etapa 2 del plan). La lógica pura (`crearOrquestadorTasa`) vive separada
// del cableado con Next.js/Prisma para poder probarla con fakes — ver
// scripts/verificar-tasa-bcv.ts, casos 12-17.
import { after } from "next/server";
import { prisma } from "./prisma";
import { PrismaTasaCambioRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaTasaCambioRepository";
import { BcvApiAdapter } from "@gym-app/infrastructure/exchange-rate/BcvApiAdapter";
import { sincronizarTasas } from "@gym-app/domain/use-cases/SincronizarTasas";
import { obtenerTasaVigente, SinTasaDisponibleError, type TasaVigente } from "@gym-app/domain/use-cases/ObtenerTasaVigente";
import { diaCalendarioCaracas } from "@gym-app/domain/utils/fechaCaracas";

const INTERVALO_MIN_MS = 45 * 60_000; // ETag → casi siempre 304 de 0 bytes
const TIMEOUT_BLOQUEANTE_MS = 2_500;

export function crearOrquestadorTasa(deps: {
  sincronizar: (versionConocida: string | null) => Promise<{ version: string | null }>;
  obtenerVigente: () => Promise<TasaVigente>;
  programar: (tarea: () => Promise<void>) => void; // en producción: after() de next/server
  ahoraMs: () => number;
}) {
  let ultimoIntento = 0;
  let versionConocida: string | null = null;
  let enCurso: Promise<void> | null = null;

  function sincronizarUnaVez(): Promise<void> {
    enCurso ??= deps
      .sincronizar(versionConocida)
      .then((r) => {
        versionConocida = r.version;
      }) // solo tras persistir con éxito
      .catch((e) => console.warn("[tasa-bcv] sincronización fallida:", e))
      .finally(() => {
        enCurso = null;
      });
    return enCurso;
  }

  async function obtenerTasaVigenteFresca(opciones?: { forzar?: boolean }): Promise<TasaVigente> {
    let vigente: TasaVigente;
    try {
      vigente = await deps.obtenerVigente(); // puede lanzar SinTasaDisponibleError con la tabla vacía
    } catch (error) {
      if (!(error instanceof SinTasaDisponibleError)) throw error;
      ultimoIntento = deps.ahoraMs();
      await Promise.race([sincronizarUnaVez(), new Promise((r) => setTimeout(r, TIMEOUT_BLOQUEANTE_MS))]);
      vigente = await deps.obtenerVigente(); // si sigue sin haber tasa, se propaga aquí.
      return vigente;
    }

    const toca = opciones?.forzar || deps.ahoraMs() - ultimoIntento >= INTERVALO_MIN_MS;
    if (!toca) return vigente;
    ultimoIntento = deps.ahoraMs();
    if (vigente.estado === "DESACTUALIZADA" || opciones?.forzar) {
      await Promise.race([sincronizarUnaVez(), new Promise((r) => setTimeout(r, TIMEOUT_BLOQUEANTE_MS))]);
      vigente = await deps.obtenerVigente();
    } else {
      deps.programar(sincronizarUnaVez);
    }
    return vigente;
  }

  return { obtenerTasaVigenteFresca, sincronizarUnaVez };
}

// Instancia singleton de módulo, cableada con las dependencias reales.
export const orquestadorTasa = crearOrquestadorTasa({
  sincronizar: (versionConocida) =>
    sincronizarTasas(
      { servicioTasa: new BcvApiAdapter(), tasas: new PrismaTasaCambioRepository(prisma) },
      { versionConocida, hoy: diaCalendarioCaracas(new Date()) }
    ),
  obtenerVigente: () => obtenerTasaVigente({ tasas: new PrismaTasaCambioRepository(prisma) }, diaCalendarioCaracas(new Date())),
  programar: (tarea) => after(tarea),
  ahoraMs: () => Date.now(),
});
