import { describe, expect, test } from "vitest";
import { ajustarUltimoPago, AjusteNoDisponibleError, DiasAtrasInvalidosError, SinTasaParaFechaError } from "./AjustarUltimoPago";
import { RolNoAutorizadoError } from "./RegistrarPago";
import { MiembroFueraDeSucursalError } from "./ObtenerMiembro";
import type { DatosNuevoPago } from "../entities/Pago";

function crearDeps(
  opciones: { permiso?: boolean; ajustarFecha?: boolean; sucursalId?: string | null; precioPlan?: number; tasa?: number | null } = {}
) {
  const { permiso = true, ajustarFecha = true, sucursalId = "s1", precioPlan = 25, tasa = 40 } = opciones;
  const fechasTasa: Date[] = [];
  const pagos: DatosNuevoPago[] = [];
  const ciclos: { inicio: Date; fin: Date }[] = [];
  const fechasMiembro: { pago: Date; fin: Date }[] = [];
  const deps = {
    miembros: {
      buscarPorId: async () => ({ id: "m1", sucursalId, planId: "p1", ajustarFecha, precioPlan }),
      actualizarFechasPago: async (_id: string, pago: Date, fin: Date) => {
        fechasMiembro.push({ pago, fin });
      },
    },
    planes: { buscarPorId: async () => ({ diasCiclo: 30 }) },
    suscripciones: {
      ajustarCicloMasReciente: async (_id: string, inicio: Date, fin: Date) => {
        ciclos.push({ inicio, fin });
      },
    },
    sucursales: { buscarPorId: async () => ({ nombre: "Tipuro" }) },
    pagos: {
      crear: async (datos: DatosNuevoPago) => {
        pagos.push(datos);
        return datos;
      },
    },
    tasas: {
      buscarMasCercanaAnterior: async (fecha: Date) => {
        fechasTasa.push(fecha);
        return tasa === null ? null : { valor: tasa };
      },
    },
    autorizacion: { tienePermiso: async () => permiso },
  } as unknown as Parameters<typeof ajustarUltimoPago>[0];
  return { deps, pagos, ciclos, fechasMiembro, fechasTasa };
}

const input = { organizacionId: "org", miembroId: "m1", sucursalActivaId: "s1", diasAtras: 12, registradoPorId: "u1" };
const DIA = 24 * 60 * 60 * 1000;

describe("ajustarUltimoPago", () => {
  test("registra el pago por el monto del plan con la tasa de esa fecha, sin turno, a nombre del usuario; vencimiento = fecha + días del plan", async () => {
    const { deps, pagos, ciclos, fechasMiembro, fechasTasa } = crearDeps();
    const antes = Date.now();
    const { fechaPago, fechaVencimiento } = await ajustarUltimoPago(deps, input);

    expect(Math.abs(antes - fechaPago.getTime() - 12 * DIA)).toBeLessThan(5000);
    expect(fechaVencimiento.getTime() - fechaPago.getTime()).toBe(30 * DIA);
    expect(pagos).toHaveLength(1);
    expect(pagos[0]).toMatchObject({
      monto: 25,
      tasaCambio: 40,
      montoBs: 1000,
      turnoId: null,
      registradoPorId: "u1",
      miembroId: "m1",
      fechaPago,
    });
    expect(fechasTasa).toEqual([fechaPago]);
    expect(ciclos).toEqual([{ inicio: fechaPago, fin: fechaVencimiento }]);
    expect(fechasMiembro).toEqual([{ pago: fechaPago, fin: fechaVencimiento }]);
  });

  test("sin tasa BCV para esa fecha ni anterior → SinTasaParaFechaError y no registra nada", async () => {
    const { deps, pagos } = crearDeps({ tasa: null });
    await expect(ajustarUltimoPago(deps, input)).rejects.toBeInstanceOf(SinTasaParaFechaError);
    expect(pagos).toEqual([]);
  });

  test("plan de cortesía ($0): registra el pago sin buscar tasa", async () => {
    const { deps, pagos, fechasTasa } = crearDeps({ precioPlan: 0, tasa: null });
    await ajustarUltimoPago(deps, input);
    expect(pagos[0]).toMatchObject({ monto: 0, tasaCambio: null, montoBs: null });
    expect(fechasTasa).toEqual([]);
  });

  test("sin el aviso activo no se puede ajustar", async () => {
    const { deps, pagos } = crearDeps({ ajustarFecha: false });
    await expect(ajustarUltimoPago(deps, input)).rejects.toBeInstanceOf(AjusteNoDisponibleError);
    expect(pagos).toEqual([]);
  });

  test("días fuera de rango o no enteros se rechazan", async () => {
    const { deps } = crearDeps();
    for (const diasAtras of [-1, 366, 2.5, Number.NaN]) {
      await expect(ajustarUltimoPago(deps, { ...input, diasAtras })).rejects.toBeInstanceOf(DiasAtrasInvalidosError);
    }
  });

  test("sin permiso PAGOS/CREAR → RolNoAutorizadoError", async () => {
    const { deps, pagos } = crearDeps({ permiso: false });
    await expect(ajustarUltimoPago(deps, input)).rejects.toBeInstanceOf(RolNoAutorizadoError);
    expect(pagos).toEqual([]);
  });

  test("miembro de otra sucursal → MiembroFueraDeSucursalError", async () => {
    const { deps } = crearDeps({ sucursalId: "s2" });
    await expect(ajustarUltimoPago(deps, input)).rejects.toBeInstanceOf(MiembroFueraDeSucursalError);
  });
});
