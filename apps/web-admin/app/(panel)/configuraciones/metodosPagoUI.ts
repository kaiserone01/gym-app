import type { TipoMetodoPago } from "@gym-app/domain/entities/MetodoPago";

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
