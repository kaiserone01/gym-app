import type { MetodoPago, TipoMetodoPago } from "@gym-app/domain/entities/MetodoPago";

// Metadata puramente visual derivada del tipo — el Badge es automático,
// no un campo editable (ver diseño acordado).
export const ETIQUETA_TIPO_METODO_PAGO: Record<TipoMetodoPago, string> = {
  EFECTIVO: "Efectivo",
  PAGO_MOVIL: "Pago Móvil",
  TRANSFERENCIA: "Transferencia",
  PUNTO_VENTA: "Punto de Venta",
  BIOPAGO: "Biopago",
  CRIPTO: "Cripto",
};

export const TONO_TIPO_METODO_PAGO: Record<TipoMetodoPago, "verde" | "gris" | "ambar" | "rojo"> = {
  EFECTIVO: "verde",
  PAGO_MOVIL: "gris",
  TRANSFERENCIA: "ambar",
  PUNTO_VENTA: "rojo",
  BIOPAGO: "gris",
  CRIPTO: "ambar",
};

// Tipos que admiten múltiples instancias (banco/exchange) — el resto
// (EFECTIVO) es un caso único por moneda, sin "nombreBanco".
export const TIPOS_MULTI_INSTANCIA: TipoMetodoPago[] = ["PAGO_MOVIL", "TRANSFERENCIA", "PUNTO_VENTA", "BIOPAGO", "CRIPTO"];

// El snapshot legible que se guarda en Pago.metodo/Egreso.metodo. Para
// EFECTIVO incluye la moneda ("Efectivo (USD)"/"Efectivo (Bs)") porque una
// organización puede tener un MetodoPago "Efectivo" en USD y otro en Bs, y
// sin la moneda en el string no hay forma de saber cuál fue — rompería el
// cuadre de caja por método en ObtenerResumenTurno (ver
// EFECTIVO_USD/EFECTIVO_BS ahí, que deben coincidir exactamente con este
// formato). Para el resto de tipos es el mismo formato que ya existía.
export function construirNombreMetodo(metodo: MetodoPago): string {
  if (metodo.tipo === "EFECTIVO") {
    return `Efectivo (${metodo.moneda === "USD" ? "USD" : "Bs"})`;
  }
  return `${ETIQUETA_TIPO_METODO_PAGO[metodo.tipo]}${metodo.nombreBanco ? ` - ${metodo.nombreBanco}` : ""}`;
}
