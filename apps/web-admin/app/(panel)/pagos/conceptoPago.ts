import type { Pago } from "@gym-app/domain/entities/Pago";

// Qué mostrar como "de quién/por qué" es un pago: el miembro, o el nombre
// del producto cuando es una venta de producto (Pago sin miembro).
export function conceptoPago(pago: Pick<Pago, "miembroId" | "miembroNombre" | "productoNombre" | "cantidad">): string {
  if (pago.productoNombre) {
    return `${pago.productoNombre}${pago.cantidad && pago.cantidad > 1 ? ` × ${pago.cantidad}` : ""}`;
  }
  return pago.miembroNombre ?? pago.miembroId ?? "—";
}
