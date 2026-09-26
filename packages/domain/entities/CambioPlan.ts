// Prorrateo de un cambio de plan a mitad de ciclo — ver diseño en
// docs/superpowers/specs/2026-09-26-cambio-plan-con-prorrateo-design.md.
// Función pura, sin dependencias de infraestructura, para poder
// replicarla client-side (ver apps/web-admin/app/(panel)/caja/calcularProrrateoPlan.ts)
// con el mismo criterio que usa CambiarPlanConPago.ts.
import { DURACION_DIAS_POR_FRECUENCIA, type FrecuenciaPago } from "./Plan";

export type ModoCambioPlan = "AJUSTAR_VENCIMIENTO" | "CICLO_COMPLETO";

export interface DatosProrrateoPlan {
  precioViejo: number;
  frecuenciaVieja: FrecuenciaPago;
  precioNuevo: number;
  frecuenciaNueva: FrecuenciaPago;
  // Vencimiento vigente ANTES del cambio — ya se validó en el caller que
  // hay un ciclo vigente (fechaVencimientoActual > ahora); si no lo
  // hubiera, diasRestantes queda en 0 y valorNoConsumido en $0.
  fechaVencimientoActual: Date;
  ahora: Date;
  modo: ModoCambioPlan;
}

export interface ProrrateoPlan {
  diasRestantes: number;
  valorNoConsumido: number;
  nuevoVencimiento: Date;
  // Positiva = se cobra; negativa = se acredita como saldo a favor; 0 =
  // ninguna de las dos. Siempre 0 en modo AJUSTAR_VENCIMIENTO.
  diferencia: number;
}

export function calcularProrrateoPlan(datos: DatosProrrateoPlan): ProrrateoPlan {
  const {
    precioViejo,
    frecuenciaVieja,
    precioNuevo,
    frecuenciaNueva,
    fechaVencimientoActual,
    ahora,
    modo,
  } = datos;

  const diasDelCicloViejo = DURACION_DIAS_POR_FRECUENCIA[frecuenciaVieja];
  const diasDelCicloNuevo = DURACION_DIAS_POR_FRECUENCIA[frecuenciaNueva];

  const diasRestantesCrudo = (fechaVencimientoActual.getTime() - ahora.getTime()) / (24 * 60 * 60 * 1000);
  const diasRestantes = Math.max(0, diasRestantesCrudo);

  // precioViejo o diasDelCicloViejo en 0 (plan de cortesía) — no hay nada
  // que prorratear, el valor no consumido es $0, nunca se divide por cero.
  const valorNoConsumido = precioViejo > 0 && diasDelCicloViejo > 0 ? diasRestantes * (precioViejo / diasDelCicloViejo) : 0;

  if (modo === "AJUSTAR_VENCIMIENTO") {
    // precioNuevo en 0 (plan de cortesía nuevo) — no hay precio-por-día
    // que convertir, el vencimiento simplemente no se mueve más allá de
    // ahora (sin generar división por cero).
    const precioPorDiaNuevo = diasDelCicloNuevo > 0 ? precioNuevo / diasDelCicloNuevo : 0;
    const diasNuevos = precioPorDiaNuevo > 0 ? valorNoConsumido / precioPorDiaNuevo : 0;
    const nuevoVencimiento = new Date(ahora.getTime() + diasNuevos * 24 * 60 * 60 * 1000);
    return { diasRestantes, valorNoConsumido, nuevoVencimiento, diferencia: 0 };
  }

  // CICLO_COMPLETO
  const nuevoVencimiento = new Date(ahora);
  nuevoVencimiento.setDate(nuevoVencimiento.getDate() + diasDelCicloNuevo);
  const diferencia = Math.round((precioNuevo - valorNoConsumido) * 100) / 100;

  return { diasRestantes, valorNoConsumido, nuevoVencimiento, diferencia };
}
