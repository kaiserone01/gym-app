import { diaCalendarioCaracas, sumarDias } from "../utils/fechaCaracas";

export interface DatosCambioPlan {
  hoy: Date;
  precioViejo: number;
  diasCicloViejo: number;
  fechaVencimientoActual: Date;
  precioNuevo: number;
  diasCicloNuevo: number;
}

export interface ResultadoCambioPlan {
  diasRestantes: number;
  // Valor no consumido del plan viejo, en centavos (V = diasRestantes *
  // tarifaDiariaVieja).
  valorNoConsumidoCentavos: number;
  // Días extra que el excedente (V - precioNuevo) agrega al ciclo base del
  // plan nuevo, cuando V > precioNuevo. 0 en cualquier otro caso.
  diasNuevos: number;
  nuevoVencimiento: Date;
  // precioNuevo - V cuando es positivo (V < precioNuevo); 0 en cualquier
  // otro caso — nunca se acredita dinero en efectivo ni queda saldo
  // separado (ver regla de negocio: único camino de cálculo).
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

// Único camino de cálculo del cambio de plan a mitad de ciclo: siempre en
// USD, siempre un cálculo diferencial en dinero contra el valor no
// consumido del plan viejo (V). No existe una alternativa de "solo mover
// la fecha sin dinero de por medio" — todo cambio de plan pasa por acá.
//
// - V > precioNuevo: el excedente se convierte en días adicionales del
//   plan nuevo, sumados al ciclo base. Nunca se acredita dinero en
//   efectivo ni queda saldo separado.
// - V < precioNuevo: se cobra la diferencia (precioNuevo - V) y el
//   vencimiento avanza un ciclo normal del plan nuevo desde hoy.
// - V == precioNuevo: no se cobra nada, vencimiento avanza un ciclo
//   normal del plan nuevo desde hoy.
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
  const precioNuevoCentavos = Math.round(datos.precioNuevo * 100);

  if (valorNoConsumidoCentavos > precioNuevoCentavos) {
    // Excedente absorbido en días extra del plan nuevo, sin cobro.
    const excedenteCentavos = valorNoConsumidoCentavos - precioNuevoCentavos;
    const tarifaNuevaCentavos = precioNuevoCentavos > 0 ? precioNuevoCentavos / datos.diasCicloNuevo : 0;
    const diasNuevos = tarifaNuevaCentavos > 0 ? Math.round(excedenteCentavos / tarifaNuevaCentavos) : 0;
    const nuevoVencimiento = sumarDias(hoyCaracas, datos.diasCicloNuevo + diasNuevos);
    return { diasRestantes, valorNoConsumidoCentavos, diasNuevos, nuevoVencimiento, montoCobradoCentavos: 0 };
  }

  // V < precioNuevo: cobra la diferencia. V == precioNuevo: no cobra nada.
  // En ambos casos el vencimiento avanza un ciclo normal del plan nuevo
  // desde hoy, sin días extra.
  const montoCobradoCentavos = precioNuevoCentavos - valorNoConsumidoCentavos;
  const nuevoVencimiento = sumarDias(hoyCaracas, datos.diasCicloNuevo);

  return { diasRestantes, valorNoConsumidoCentavos, diasNuevos: 0, nuevoVencimiento, montoCobradoCentavos };
}
