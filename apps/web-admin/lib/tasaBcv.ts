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

// Resultado de obtenerTasaVigenteFresca: además de la tasa/estado, indica si
// la sincronización que se intentó en esta misma llamada falló — la usan las
// Server Actions de cobro (Etapa 3) para distinguir "el BCV publicó una tasa
// nueva" (tasaNueva) de "no se pudo verificar nada ahora mismo" (bloquea y
// avisa igual, pero con mensaje distinto).
export interface TasaVigenteFresca extends TasaVigente {
  sincronizacionFallida: boolean;
}

export function crearOrquestadorTasa(deps: {
  sincronizar: (versionConocida: string | null) => Promise<{ version: string | null }>;
  obtenerVigente: () => Promise<TasaVigente>;
  programar: (tarea: () => Promise<unknown>) => void; // en producción: after() de next/server
  ahoraMs: () => number;
}) {
  let ultimoIntento = 0;
  let versionConocida: string | null = null;
  let enCurso: Promise<boolean> | null = null; // resuelve a true si la sincronización falló

  function sincronizarUnaVez(): Promise<boolean> {
    enCurso ??= deps
      .sincronizar(versionConocida)
      .then((r) => {
        versionConocida = r.version; // solo tras persistir con éxito
        return false;
      })
      .catch((e) => {
        console.warn("[tasa-bcv] sincronización fallida:", e);
        return true;
      })
      .finally(() => {
        enCurso = null;
      });
    return enCurso;
  }

  async function obtenerTasaVigenteFresca(opciones?: { forzar?: boolean }): Promise<TasaVigenteFresca> {
    let vigente: TasaVigente;
    try {
      vigente = await deps.obtenerVigente(); // puede lanzar SinTasaDisponibleError con la tabla vacía
    } catch (error) {
      if (!(error instanceof SinTasaDisponibleError)) throw error;
      ultimoIntento = deps.ahoraMs();
      const resultado = await Promise.race([
        sincronizarUnaVez(),
        new Promise<"timeout">((r) => setTimeout(() => r("timeout"), TIMEOUT_BLOQUEANTE_MS)),
      ]);
      vigente = await deps.obtenerVigente(); // si sigue sin haber tasa, se propaga aquí.
      return { ...vigente, sincronizacionFallida: resultado === true };
    }

    const toca = opciones?.forzar || deps.ahoraMs() - ultimoIntento >= INTERVALO_MIN_MS;
    if (!toca) return { ...vigente, sincronizacionFallida: false };
    ultimoIntento = deps.ahoraMs();
    if (vigente.estado === "DESACTUALIZADA" || opciones?.forzar) {
      const resultado = await Promise.race([
        sincronizarUnaVez(),
        new Promise<"timeout">((r) => setTimeout(() => r("timeout"), TIMEOUT_BLOQUEANTE_MS)),
      ]);
      vigente = await deps.obtenerVigente();
      return { ...vigente, sincronizacionFallida: resultado === true };
    }
    deps.programar(sincronizarUnaVez);
    return { ...vigente, sincronizacionFallida: false };
  }

  return { obtenerTasaVigenteFresca, sincronizarUnaVez };
}

// Tolerancia de redondeo al comparar la tasa del formulario contra la del
// servidor — mismo criterio que Decimal(12,4) en el schema de Prisma.
const TOLERANCIA_TASA = 0.0001;

export type ResultadoValidarTasaCobro =
  | { ok: true; tasa: number }
  | { ok: false; error: string; tasaNueva: number }
  | { ok: false; error: string; fallaTemporal: true; tasaGuardada: number };

// Compara la tasa que mandó el cliente (campo oculto del formulario) contra
// la última publicada, ya verificada en caliente (forzar: true). Devuelve
// siempre la tasa a usar para registrar — nunca la del formulario, salvo que
// coincida con la del servidor (Etapa 3, Tarea 3.1).
export function validarTasaCobro(tasaFormulario: number, fresca: TasaVigenteFresca): ResultadoValidarTasaCobro {
  if (fresca.sincronizacionFallida) {
    return {
      ok: false,
      error: "No se pudo verificar la tasa BCV en este momento.",
      fallaTemporal: true,
      tasaGuardada: fresca.tasa.valor,
    };
  }
  if (Math.abs(tasaFormulario - fresca.tasa.valor) > TOLERANCIA_TASA) {
    return {
      ok: false,
      error: `La tasa BCV cambió a Bs. ${fresca.tasa.valor}. Revisa el monto y confirma de nuevo.`,
      tasaNueva: fresca.tasa.valor,
    };
  }
  return { ok: true, tasa: fresca.tasa.valor };
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
