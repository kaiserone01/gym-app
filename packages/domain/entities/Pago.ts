export interface Pago {
  id: string;
  miembroId: string;
  miembroNombre?: string;
  miembroPrecioPlan?: number;
  sucursalId: string;
  turnoId: string | null;
  registradoPorId: string;
  registradoPorNombre?: string;
  monto: number;
  metodo: string;
  metodoPagoId: string | null;
  numeroOperacion: string | null;
  tasaCambio: number | null;
  montoBs: number | null;
  fechaPago: Date;
  fechaInicioCiclo: Date | null;
  fechaFinCiclo: Date | null;
  anuladoEn: Date | null;
  anuladoPorId: string | null;
  motivoAnulacion: string | null;
  // Correlaciona las N filas de un mismo pago combinado (ver
  // registrarPago) — null en pagos de una sola línea.
  grupoPagoId: string | null;
}

export interface DatosNuevoPago {
  miembroId: string;
  sucursalId: string;
  turnoId: string | null;
  registradoPorId: string;
  monto: number;
  metodo: string;
  metodoPagoId: string | null;
  numeroOperacion: string | null;
  tasaCambio: number | null;
  montoBs: number | null;
  fechaInicioCiclo: Date;
  fechaFinCiclo: Date;
  grupoPagoId: string | null;
}

// Pagos de fondos fraccionados/mixtos ("abonos") — varios Pago pueden
// compartir el mismo ciclo (misma fechaFinCiclo) hasta completar el precio
// del plan. Estos dos helpers son la única fuente de verdad de "qué pagos
// pertenecen a este ciclo" y "cuánto suman" — los usa tanto RegistrarPago
// (para decidir si un pago nuevo arranca un ciclo o completa uno abierto)
// como las pantallas que muestran el saldo pendiente y agrupan los abonos.
export function pagosVigentesDelCiclo(pagos: Pago[], fechaFinCiclo: Date): Pago[] {
  return pagos.filter((pago) => !pago.anuladoEn && pago.fechaFinCiclo?.getTime() === fechaFinCiclo.getTime());
}

export function totalPagado(pagos: Pago[]): number {
  return pagos.reduce((suma, pago) => suma + pago.monto, 0);
}

export interface DatosLineaPago {
  monto: number;
  metodo: string;
  metodoPagoId: string | null;
  numeroOperacion: string | null;
  tasaCambio: number | null;
}

// Un pago combinado sin líneas, o con alguna línea en $0/negativo o sin
// método, no tiene forma de saber a qué método imputar cada monto — se
// rechaza acá, no solo en la UI, porque un FormData armado a mano podría
// saltarse la validación del cliente. Única excepción: una sola línea en
// $0 (pago de cortesía), que cada caller valida contra su propio precio
// antes de llegar acá.
export class LineasDePagoInvalidasError extends Error {
  constructor() {
    super("Cada línea del pago necesita un monto mayor a $0 y un método.");
  }
}

// Modo "exacto" (CambiarPlanConPago): la diferencia de un cambio de plan
// se paga completa, aunque combinando varios métodos — no existe abono
// parcial sobre esa diferencia (ver diseño acordado). Si la suma de las
// líneas no coincide exactamente con el monto a cobrar, se rechaza.
export class MontoLineasNoCubreObjetivoError extends Error {
  constructor() {
    super("La suma de las líneas de pago no coincide con el monto a cobrar.");
  }
}

// Única fuente de verdad para validar líneas de un pago (una o varias,
// según la modalidad). Dos modos:
// - "conAbono" (RegistrarPago.ts): permite que la suma quede por debajo
//   del precio del plan — es un abono parcial válido, cuyo mínimo lo
//   valida ReglaAbono.ts más adelante en ese use-case.
// - "exacto" (CambiarPlanConPago.ts): exige que la suma coincida
//   exactamente con `montoObjetivo` — no hay abono parcial sobre la
//   diferencia de un cambio de plan.
export function validarLineasDePago(
  lineas: DatosLineaPago[],
  modo: "conAbono" | "exacto",
  montoObjetivo?: number
): void {
  const esCortesia = lineas.length === 1 && lineas[0].monto <= 0;

  if (!esCortesia) {
    if (lineas.length === 0 || lineas.some((linea) => linea.monto <= 0 || !linea.metodo)) {
      throw new LineasDePagoInvalidasError();
    }
  }

  if (modo === "exacto" && montoObjetivo !== undefined) {
    const suma = lineas.reduce((total, linea) => total + linea.monto, 0);
    if (Math.abs(suma - montoObjetivo) >= 0.01) {
      throw new MontoLineasNoCubreObjetivoError();
    }
  }
}
