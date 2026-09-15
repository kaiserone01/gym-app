export const METODOS_PAGO: Array<{ value: string; label: string }> = [
  { value: "efectivo_usd", label: "Efectivo (USD)" },
  { value: "efectivo_bs", label: "Efectivo (Bs)" },
  { value: "pago_movil", label: "Pago móvil" },
  { value: "transferencia_bdv", label: "Transferencia Banco de Venezuela" },
  { value: "transferencia_mercantil", label: "Transferencia Banco Mercantil" },
  { value: "punto_banesco", label: "Punto Banesco" },
  { value: "biopago", label: "BioPago de Venezuela" },
  { value: "punto_tesoro", label: "Punto Banco del Tesoro" },
  { value: "transferencia", label: "Transferencia (otro banco)" },
  { value: "zelle", label: "Zelle" },
  { value: "binance_usdt", label: "Binance / USDT" },
];

// Métodos que pasan por un banco — piden número de operación (últimos 4
// dígitos del comprobante) para poder reclamar si algún pago falla. El
// efectivo en mano no lo necesita, no hay banco de por medio.
export const METODOS_BANCARIOS = [
  "pago_movil",
  "transferencia_bdv",
  "transferencia_mercantil",
  "punto_banesco",
  "biopago",
  "punto_tesoro",
  "transferencia",
  "zelle",
  "binance_usdt",
];
