import { describe, expect, test } from "vitest";
import { calcularAbonosPendientes } from "./ListarAbonosPendientes";
import type { Miembro } from "../entities/Miembro";
import type { Plan } from "../entities/Plan";
import type { Pago } from "../entities/Pago";

const DIA = 24 * 60 * 60 * 1000;
const ahora = new Date("2026-10-05T18:00:00.000Z");

const plan = { id: "p1", nombre: "Corporativo", diasCiclo: 30, precioUSD: 22 } as Plan;
const miembro = (extra: Partial<Miembro> = {}) =>
  ({ id: "m1", nombre: "Andrea Arteaga Lugo", planId: "p1", precioPlan: 22, ...extra }) as Miembro;

const inicio = new Date("2026-10-05T12:00:00.000Z");
const fin = new Date(inicio.getTime() + 30 * DIA);
const pago = (monto: number, extra: Partial<Pago> = {}) =>
  ({ id: `pago-${monto}`, miembroId: "m1", monto, anuladoEn: null, fechaInicioCiclo: inicio, fechaFinCiclo: fin, ...extra }) as Pago;

describe("calcularAbonosPendientes", () => {
  test("abono de $10 sobre un plan de $22: saldo $12 y próximo abono = inicio + días cubiertos por lo abonado", () => {
    const [abono] = calcularAbonosPendientes([miembro()], [plan], [pago(10)], ahora);
    expect(abono).toMatchObject({
      miembroId: "m1",
      planNombre: "Corporativo",
      precioUSD: 22,
      pagadoUSD: 10,
      saldoUSD: 12,
      finCiclo: fin,
    });
    // $22 / 30 días = $0.733 por día → $10 cubren 13 días.
    expect(abono.fechaProximoAbono.getTime()).toBe(inicio.getTime() + 13 * DIA);
  });

  test("suma varios abonos del mismo ciclo", () => {
    const [abono] = calcularAbonosPendientes([miembro()], [plan], [pago(10), pago(5)], ahora);
    expect(abono.pagadoUSD).toBe(15);
    expect(abono.saldoUSD).toBe(7);
  });

  test("un ciclo ya saldado no es una cuenta por cobrar", () => {
    expect(calcularAbonosPendientes([miembro()], [plan], [pago(22)], ahora)).toEqual([]);
  });

  test("ignora pagos anulados, ciclos ya vencidos y miembros sin pagos", () => {
    const anulado = pago(10, { anuladoEn: new Date() });
    const vencido = pago(10, { fechaFinCiclo: new Date(ahora.getTime() - DIA) });
    expect(calcularAbonosPendientes([miembro()], [plan], [anulado, vencido], ahora)).toEqual([]);
    expect(calcularAbonosPendientes([miembro()], [plan], [], ahora)).toEqual([]);
  });

  test("un plan de cortesía ($0) nunca genera saldo", () => {
    expect(calcularAbonosPendientes([miembro({ precioPlan: 0 })], [plan], [pago(0)], ahora)).toEqual([]);
  });
});
