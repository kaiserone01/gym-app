import { describe, expect, test } from "vitest";
import {
  registrarPago,
  FechaPagoInvalidaError,
  PagoRetroactivoIncompletoError,
  PagoRetroactivoNoDisponibleError,
  SinTasaParaFechaError,
  type RegistrarPagoDeps,
  type DatosRegistrarPago,
} from "./RegistrarPago";
import type { DatosNuevoPago, Pago } from "../entities/Pago";

const DIA = 24 * 60 * 60 * 1000;

function crearDeps(opciones: { porRegularizar?: boolean; tasa?: number | null; hayActiva?: boolean } = {}) {
  const { porRegularizar = true, tasa = 40, hayActiva = true } = opciones;
  const pagos: DatosNuevoPago[] = [];
  const ciclos: { inicio: Date; fin: Date; planId?: string }[] = [];
  const creadas: unknown[] = [];
  const fechasMiembro: { pago: Date; fin: Date }[] = [];
  const fechasTasa: Date[] = [];

  const deps = {
    pagos: {
      crear: async (datos: DatosNuevoPago) => {
        pagos.push(datos);
        return datos as unknown as Pago;
      },
      listarPorMiembro: async () => [],
    },
    suscripciones: {
      buscarActivaVigentePorMiembroYPlan: async () => null,
      extenderFin: async () => undefined,
      actualizarFechaLimiteAbono: async () => undefined,
      ajustarCicloMasReciente: async (_m: string, inicio: Date, fin: Date, planId?: string) => {
        ciclos.push({ inicio, fin, planId });
        return hayActiva;
      },
      crear: async (datos: unknown) => {
        creadas.push(datos);
      },
    },
    miembros: {
      buscarPorId: async () => ({ id: "m1", sucursalId: "s1", planId: "plan1", precioPlan: 25, saldoAFavorUSD: 0, porRegularizar }),
      actualizar: async () => null,
      actualizarFechasPago: async (_id: string, pago: Date, fin: Date) => {
        fechasMiembro.push({ pago, fin });
      },
    },
    planes: { buscarPorId: async () => ({ id: "plan1", activo: true, precioUSD: 25, diasCiclo: 30, frecuencia: "MENSUAL", permitePagoParcial: true }) },
    turnos: { buscarAbiertoPorSucursal: async () => ({ id: "turno-hoy" }) },
    sucursales: {},
    autorizacion: { tienePermiso: async () => true },
    reglasAbono: { buscarPorOrganizacionYFrecuencia: async () => null },
    tasas: {
      buscarMasCercanaAnterior: async (fecha: Date) => {
        fechasTasa.push(fecha);
        return tasa === null ? null : { valor: tasa };
      },
    },
  } as unknown as RegistrarPagoDeps;
  return { deps, pagos, ciclos, creadas, fechasMiembro, fechasTasa };
}

const hace = (dias: number) => new Date(Date.now() - dias * DIA);

function input(extra: Partial<DatosRegistrarPago> = {}): DatosRegistrarPago {
  return {
    organizacionId: "org",
    miembroId: "m1",
    planId: "plan1",
    lineas: [{ monto: 25, metodo: "Pago Móvil", metodoPagoId: "mp1", numeroOperacion: "123", tasaCambio: 99 }],
    sucursalId: "s1",
    registradoPorId: "u1",
    rolUsuario: "SOCIO",
    fechaPago: hace(10),
    ...extra,
  };
}

describe("registrarPago con fecha pasada (aviso 'Por regularizar')", () => {
  test("usa la tasa BCV de la fecha elegida (no la del formulario), sin turno, con ciclo = fecha + días del plan", async () => {
    const { deps, pagos, ciclos, fechasMiembro, fechasTasa } = crearDeps();
    const fecha = hace(10);
    await registrarPago(deps, input({ fechaPago: fecha }));

    expect(fechasTasa).toEqual([fecha]);
    expect(pagos).toHaveLength(1);
    expect(pagos[0]).toMatchObject({
      monto: 25,
      tasaCambio: 40,
      montoBs: 1000,
      turnoId: null,
      fechaPago: fecha,
      registradoPorId: "u1",
    });
    expect(pagos[0].fechaFinCiclo!.getTime() - fecha.getTime()).toBe(30 * DIA);
    expect(ciclos).toEqual([{ inicio: fecha, fin: pagos[0].fechaFinCiclo, planId: "plan1" }]);
    expect(fechasMiembro).toEqual([{ pago: fecha, fin: pagos[0].fechaFinCiclo }]);
  });

  test("una línea en USD no lleva tasa ni busca la del día", async () => {
    const { deps, pagos, fechasTasa } = crearDeps();
    await registrarPago(
      deps,
      input({ lineas: [{ monto: 25, metodo: "Efectivo USD", metodoPagoId: "mp2", numeroOperacion: null, tasaCambio: null }] })
    );
    expect(pagos[0]).toMatchObject({ tasaCambio: null, montoBs: null });
    expect(fechasTasa).toEqual([]);
  });

  test("sin suscripción previa crea una nueva con inicio en la fecha del pago", async () => {
    const { deps, creadas } = crearDeps({ hayActiva: false });
    await registrarPago(deps, input());
    expect(creadas).toHaveLength(1);
  });

  test("sin el aviso activo no se permite", async () => {
    const { deps, pagos } = crearDeps({ porRegularizar: false });
    await expect(registrarPago(deps, input())).rejects.toBeInstanceOf(PagoRetroactivoNoDisponibleError);
    expect(pagos).toEqual([]);
  });

  test("más de 365 días atrás → FechaPagoInvalidaError", async () => {
    const { deps } = crearDeps();
    await expect(registrarPago(deps, input({ fechaPago: hace(400) }))).rejects.toBeInstanceOf(FechaPagoInvalidaError);
  });

  test("un abono (no cubre el precio del plan) se rechaza", async () => {
    const { deps, pagos } = crearDeps();
    await expect(
      registrarPago(deps, input({ lineas: [{ monto: 10, metodo: "Pago Móvil", metodoPagoId: "mp1", numeroOperacion: "1", tasaCambio: 99 }] }))
    ).rejects.toBeInstanceOf(PagoRetroactivoIncompletoError);
    expect(pagos).toEqual([]);
  });

  test("sin tasa BCV para esa fecha ni anterior → SinTasaParaFechaError y no registra nada", async () => {
    const { deps, pagos } = crearDeps({ tasa: null });
    await expect(registrarPago(deps, input())).rejects.toBeInstanceOf(SinTasaParaFechaError);
    expect(pagos).toEqual([]);
  });

  test("una fecha de hoy se trata como pago normal (con turno)", async () => {
    const { deps, pagos, fechasTasa } = crearDeps({ porRegularizar: false });
    await registrarPago(deps, input({ fechaPago: new Date() }));
    expect(pagos[0].turnoId).toBe("turno-hoy");
    expect(fechasTasa).toEqual([]);
  });
});
