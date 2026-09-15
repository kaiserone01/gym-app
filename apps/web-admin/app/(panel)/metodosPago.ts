export const METODOS_PAGO: Array<{ value: string; label: string }> = [
  { value: "efectivo_usd", label: "Efectivo (USD)" },
  { value: "efectivo_bs", label: "Efectivo (Bs)" },
  { value: "transferencia", label: "Transferencia" },
  { value: "zelle", label: "Zelle" },
  { value: "binance_usdt", label: "Binance / USDT" },
  { value: "pago_movil", label: "Pago móvil" },
];

// Métodos que pasan por un banco — piden número de operación (últimos 4
// dígitos del comprobante) para poder reclamar si algún pago falla. El
// efectivo en mano no lo necesita, no hay banco de por medio.
export const METODOS_BANCARIOS = ["pago_movil", "transferencia", "zelle", "binance_usdt"];
