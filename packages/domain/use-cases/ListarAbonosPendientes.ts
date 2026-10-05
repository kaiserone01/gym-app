import { IPagoRepository } from "../ports/IPagoRepository";
import { Pago, pagosVigentesDelCiclo, totalPagado } from "../entities/Pago";
import { calcularProrrateoAbono } from "../entities/ReglaAbono";
import type { Miembro } from "../entities/Miembro";
import type { Plan } from "../entities/Plan";

// Saldo de membresía de un miembro cuyo ciclo vigente no está saldado (abonos parciales): una cuenta por
// cobrar, igual que los productos fiados pero de la membresía.
export interface AbonoPendiente {
  miembroId: string;
  miembroNombre: string;
  planNombre: string;
  precioUSD: number;
  pagadoUSD: number;
  saldoUSD: number;
  inicioCiclo: Date;
  finCiclo: Date;
  // Hasta cuándo alcanza lo abonado (prorrateo del precio entre los días del ciclo): cuándo toca el próximo abono.
  fechaProximoAbono: Date;
}

// Puro: recibe los pagos con ciclo aún abierto de los miembros dados y arma sus saldos pendientes.
export function calcularAbonosPendientes(
  miembros: Miembro[],
  planes: Plan[],
  pagosConCicloAbierto: Pago[],
  ahora: Date
): AbonoPendiente[] {
  const planesPorId = new Map(planes.map((p) => [p.id, p]));
  const pagosPorMiembro = new Map<string, Pago[]>();
  for (const pago of pagosConCicloAbierto) {
    if (!pago.miembroId) continue;
    pagosPorMiembro.set(pago.miembroId, [...(pagosPorMiembro.get(pago.miembroId) ?? []), pago]);
  }

  const abonos: AbonoPendiente[] = [];
  for (const miembro of miembros) {
    const plan = miembro.planId ? planesPorId.get(miembro.planId) : undefined;
    const pagos = pagosPorMiembro.get(miembro.id);
    if (!plan || !pagos || miembro.precioPlan <= 0) continue;

    // Solo el ciclo más reciente que sigue abierto.
    const finCiclo = pagos
      .filter((p) => !p.anuladoEn && p.fechaFinCiclo && p.fechaFinCiclo > ahora)
      .map((p) => p.fechaFinCiclo as Date)
      .sort((a, b) => b.getTime() - a.getTime())[0];
    if (!finCiclo) continue;

    const delCiclo = pagosVigentesDelCiclo(pagos, finCiclo);
    const pagado = totalPagado(delCiclo);
    if (delCiclo.length === 0 || pagado >= miembro.precioPlan) continue;

    const inicioCiclo = delCiclo
      .map((p) => p.fechaInicioCiclo)
      .filter((f): f is Date => f !== null)
      .sort((a, b) => a.getTime() - b.getTime())[0];
    if (!inicioCiclo) continue;

    const prorrateo = calcularProrrateoAbono(pagado, miembro.precioPlan, inicioCiclo, plan.diasCiclo);
    abonos.push({
      miembroId: miembro.id,
      miembroNombre: miembro.nombre,
      planNombre: plan.nombre,
      precioUSD: miembro.precioPlan,
      pagadoUSD: pagado,
      saldoUSD: Math.round((miembro.precioPlan - pagado) * 100) / 100,
      inicioCiclo,
      finCiclo,
      fechaProximoAbono: prorrateo?.fechaTope ?? finCiclo,
    });
  }

  return abonos.sort((a, b) => a.miembroNombre.localeCompare(b.miembroNombre, "es"));
}

export async function listarAbonosPendientes(
  deps: { pagos: IPagoRepository },
  miembros: Miembro[],
  planes: Plan[],
  ahora: Date = new Date()
): Promise<AbonoPendiente[]> {
  if (miembros.length === 0) return [];
  const pagos = await deps.pagos.listarConCicloAbierto(miembros[0].organizacionId, ahora);
  return calcularAbonosPendientes(miembros, planes, pagos, ahora);
}
