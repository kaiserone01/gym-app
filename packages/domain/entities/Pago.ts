export interface Pago {
  id: string;
  // Null en ventas de producto (ver productoId).
  miembroId: string | null;
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
  // Venta de producto: cada Pago es una línea de método de la venta.
  productoId?: string | null;
  productoNombre?: string | null;
  cantidad?: number | null;
}

// Máximo de días hacia atrás para fechar el ajuste del último pago (ver AjustarUltimoPago).
export const MAX_DIAS_ATRAS_ULTIMO_PAGO = 365;

export interface DatosNuevoPago {
  miembroId: string | null;
  sucursalId: string;
  turnoId: string | null;
  registradoPorId: string;
  monto: number;
  metodo: string;
  metodoPagoId: string | null;
  numeroOperacion: string | null;
  tasaCambio: number | null;
  montoBs: number | null;
  fechaInicioCiclo: Date | null;
  fechaFinCiclo: Date | null;
  grupoPagoId: string | null;
  fechaPago?: Date; // solo para el ajuste del último pago (fecha pasada); por defecto, ahora
  productoId?: string | null;
  productoNombre?: string | null;
  cantidad?: number | null;
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

// El monto de las líneas no alcanza para cubrir primero la deuda de productos
// y todavía dejar algo para la membresía (ver repartirLineasPago).
export class MontoNoCubreDeudaError extends Error {
  constructor() {
    super("El monto no alcanza para cubrir la deuda de productos y la membresía.");
  }
}

const aCentavos = (monto: number) => Math.round(monto * 100);

// Reparte las líneas de un mismo cobro en dos grupos: las primeras suman
// exactamente `montoPrimero` (se consumen en orden) y las segundas son el
// resto. La línea del límite se parte en dos conservando método, número de
// operación y tasa. Trabaja en centavos para no acumular error de punto
// flotante. Lanza MontoNoCubreDeudaError si las líneas no llegan a `montoPrimero`.
export function repartirLineasPago(lineas: DatosLineaPago[], montoPrimero: number): [DatosLineaPago[], DatosLineaPago[]] {
  let pendiente = aCentavos(montoPrimero);
  const primeras: DatosLineaPago[] = [];
  const segundas: DatosLineaPago[] = [];

  for (const linea of lineas) {
    const centavos = aCentavos(linea.monto);
    if (pendiente <= 0) {
      segundas.push(linea);
    } else if (centavos <= pendiente) {
      primeras.push(linea);
      pendiente -= centavos;
    } else {
      primeras.push({ ...linea, monto: pendiente / 100 });
      segundas.push({ ...linea, monto: (centavos - pendiente) / 100 });
      pendiente = 0;
    }
  }

  if (pendiente > 0) {
    throw new MontoNoCubreDeudaError();
  }

  return [primeras, segundas];
}
