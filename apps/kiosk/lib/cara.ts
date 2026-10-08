import type { ResultadoCheckIn } from "./api";

export const UMBRAL_POR_VENCER_DIAS = 5;
const MS_POR_DIA = 24 * 60 * 60 * 1000;

export type CaraFicha =
  | "permitido"
  | "por_vencer"
  | "en_gracia"
  | "vencido"
  | "abono_vencido"
  | "sucursal_incorrecta";

export type Tono = "verde" | "ambar" | "rojo";

export function diasParaVencer(fechaVencimiento: string | null, ahora: Date): number | null {
  if (!fechaVencimiento) return null;
  return Math.ceil((new Date(fechaVencimiento).getTime() - ahora.getTime()) / MS_POR_DIA);
}

// "por_vencer" no existe en el servidor: es un acceso "activo" que vence en pocos días.
export function caraDeResultado(
  resultado: Pick<ResultadoCheckIn, "estado" | "fechaVencimiento">,
  ahora: Date
): { cara: CaraFicha; diasParaVencer: number | null } {
  const dias = diasParaVencer(resultado.fechaVencimiento, ahora);
  if (resultado.estado === "activo") {
    const porVencer = dias !== null && dias <= UMBRAL_POR_VENCER_DIAS;
    return { cara: porVencer ? "por_vencer" : "permitido", diasParaVencer: dias };
  }
  return { cara: resultado.estado, diasParaVencer: dias };
}

export function tonoDeCara(cara: CaraFicha): Tono {
  if (cara === "permitido" || cara === "por_vencer") return "verde";
  return cara === "en_gracia" ? "ambar" : "rojo";
}

export function textoPorVencer(dias: number): string {
  if (dias <= 0) return "Vence hoy";
  return dias === 1 ? "Vence mañana" : `Vence en ${dias} días`;
}
