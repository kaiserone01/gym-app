// Réplica intencional de la lógica en packages/domain/use-cases/RegistrarPago.ts
// (base = activa && activa.fin > ahora ? activa.fin : ahora; fin = base +
// plan.diasCiclo) — mismo criterio, para que lo mostrado ANTES de pagar
// coincida con lo que el backend aplica.
export interface ProyeccionRenovacion {
  diasDelPlan: number;
  diasTotalesTrasPago: number;
  adelantandoCuota: boolean;
  fechaProximoVencimiento: Date;
}

export function calcularProyeccionRenovacion(
  fechaVencimiento: Date | null,
  diasCicloDelPlan: number
): ProyeccionRenovacion {
  const ahora = new Date();
  const diasDelPlan = diasCicloDelPlan;
  const vigente = fechaVencimiento !== null && fechaVencimiento > ahora;
  const base = vigente ? fechaVencimiento : ahora;

  const fechaProximoVencimiento = new Date(base);
  fechaProximoVencimiento.setDate(fechaProximoVencimiento.getDate() + diasDelPlan);

  const diasTotalesTrasPago = Math.round(
    (fechaProximoVencimiento.getTime() - ahora.getTime()) / (24 * 60 * 60 * 1000)
  );

  return { diasDelPlan, diasTotalesTrasPago, adelantandoCuota: vigente, fechaProximoVencimiento };
}
