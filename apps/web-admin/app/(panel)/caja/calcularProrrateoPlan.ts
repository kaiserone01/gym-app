// Réplica intencional de packages/domain/entities/CambioPlan.ts — mismo
// criterio, para que lo mostrado ANTES de confirmar (ambos modos, en vivo)
// coincida con lo que el backend aplica al elegir uno. Ver diseño en
// docs/superpowers/specs/2026-09-26-cambio-plan-con-prorrateo-design.md.
import { DURACION_DIAS_POR_FRECUENCIA, type FrecuenciaPago } from "@gym-app/domain/entities/Plan";

export type ModoCambioPlan = "AJUSTAR_VENCIMIENTO" | "CICLO_COMPLETO";

export interface ProrrateoPlanCliente {
  diasRestantes: number;
  valorNoConsumido: number;
  nuevoVencimiento: Date;
  diferencia: number;
}

export function calcularProrrateoPlanCliente(datos: {
  precioViejo: number;
  frecuenciaVieja: FrecuenciaPago;
  precioNuevo: number;
  frecuenciaNueva: FrecuenciaPago;
  fechaVencimientoActual: Date;
  ahora: Date;
  modo: ModoCambioPlan;
}): ProrrateoPlanCliente {
  const { precioViejo, frecuenciaVieja, precioNuevo, frecuenciaNueva, fechaVencimientoActual, ahora, modo } = datos;

  const diasDelCicloViejo = DURACION_DIAS_POR_FRECUENCIA[frecuenciaVieja];
  const diasDelCicloNuevo = DURACION_DIAS_POR_FRECUENCIA[frecuenciaNueva];

  const diasRestantesCrudo = (fechaVencimientoActual.getTime() - ahora.getTime()) / (24 * 60 * 60 * 1000);
  const diasRestantes = Math.max(0, diasRestantesCrudo);

  const valorNoConsumido = precioViejo > 0 && diasDelCicloViejo > 0 ? diasRestantes * (precioViejo / diasDelCicloViejo) : 0;

  if (modo === "AJUSTAR_VENCIMIENTO") {
    const precioPorDiaNuevo = diasDelCicloNuevo > 0 ? precioNuevo / diasDelCicloNuevo : 0;
    const diasNuevos = precioPorDiaNuevo > 0 ? valorNoConsumido / precioPorDiaNuevo : 0;
    const nuevoVencimiento = new Date(ahora.getTime() + diasNuevos * 24 * 60 * 60 * 1000);
    return { diasRestantes, valorNoConsumido, nuevoVencimiento, diferencia: 0 };
  }

  const nuevoVencimiento = new Date(ahora);
  nuevoVencimiento.setDate(nuevoVencimiento.getDate() + diasDelCicloNuevo);
  const diferencia = Math.round((precioNuevo - valorNoConsumido) * 100) / 100;

  return { diasRestantes, valorNoConsumido, nuevoVencimiento, diferencia };
}
