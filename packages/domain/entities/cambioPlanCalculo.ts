import { diaCalendarioCaracas, sumarDias } from "../utils/fechaCaracas";

export type ModoCambioPlan = "AJUSTAR_VENCIMIENTO" | "CICLO_COMPLETO";

export interface DatosCambioPlan {
  hoy: Date;
  precioViejo: number;
  diasCicloViejo: number;
  fechaVencimientoActual: Date;
  precioNuevo: number;
  diasCicloNuevo: number;
  modo: ModoCambioPlan;
}

export interface ResultadoCambioPlan {
  diasRestantes: number;
  valorNoConsumidoCentavos: number;
  // Solo AJUSTAR_VENCIMIENTO: cuántos días del plan nuevo equivalen al
  // valor no consumido. En CICLO_COMPLETO, 0 (no aplica).
  diasNuevos: number;
  nuevoVencimiento: Date;
  // Solo CICLO_COMPLETO: el precio completo del plan nuevo, en centavos.
  // Nunca negativo, nunca "acredita" — el valor no consumido que exceda
  // este monto queda documentado en valorNoConsumidoCentavos para
  // auditoría, pero no se descuenta ni se devuelve como crédito acá (ver
  // regla 5 del diseño acordado). 0 en AJUSTAR_VENCIMIENTO.
  montoCobradoCentavos: number;
}

// El plan nuevo es de cortesía ($0) y todavía queda tiempo pagado del plan
// viejo — bloqueado por defecto (regla 6 del diseño acordado): nunca se
// regala el tiempo restante ni se divide entre una tarifa de 0.
export class PlanCortesiaConTiempoRestanteError extends Error {
  constructor() {
    super("No se puede cambiar a un plan de cortesía mientras quede tiempo pagado del plan actual.");
  }
}

const MS_POR_DIA = 86_400_000;

export function calcularCambioPlan(datos: DatosCambioPlan): ResultadoCambioPlan {
  const hoyCaracas = diaCalendarioCaracas(datos.hoy);
  const vencimientoCaracas = diaCalendarioCaracas(datos.fechaVencimientoActual);

  const diasRestantes = Math.max(
    0,
    Math.round((vencimientoCaracas.getTime() - hoyCaracas.getTime()) / MS_POR_DIA)
  );

  if (datos.precioNuevo === 0 && diasRestantes > 0) {
    throw new PlanCortesiaConTiempoRestanteError();
  }

  const valorNoConsumidoCentavos = Math.round(
    ((datos.precioViejo * 100) / datos.diasCicloViejo) * diasRestantes
  );

  const tarifaNuevaCentavos = (datos.precioNuevo * 100) / datos.diasCicloNuevo;
  const diasNuevos = tarifaNuevaCentavos > 0 ? Math.round(valorNoConsumidoCentavos / tarifaNuevaCentavos) : 0;

  if (datos.modo === "AJUSTAR_VENCIMIENTO") {
    const nuevoVencimiento = sumarDias(hoyCaracas, diasNuevos);
    return { diasRestantes, valorNoConsumidoCentavos, diasNuevos, nuevoVencimiento, montoCobradoCentavos: 0 };
  }

  // CICLO_COMPLETO: se cobra el precio completo del plan nuevo y el
  // vencimiento avanza diasNuevos (el valor no consumido convertido a días
  // del plan nuevo, igual que en AJUSTAR_VENCIMIENTO) MÁS un ciclo completo
  // — el valor no consumido nunca se pierde ni se devuelve como crédito acá
  // (ver regla 5 del diseño acordado; un saldo a favor persistido es
  // responsabilidad del caller, no de esta función pura).
  const montoCobradoCentavos = Math.round(datos.precioNuevo * 100);
  const nuevoVencimiento = sumarDias(hoyCaracas, diasNuevos + datos.diasCicloNuevo);

  return { diasRestantes, valorNoConsumidoCentavos, diasNuevos, nuevoVencimiento, montoCobradoCentavos };
}
