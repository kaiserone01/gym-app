import { describe, expect, test } from "vitest";
import { cambiarPlanConPago, type CambiarPlanConPagoDeps } from "./CambiarPlanConPago";
import type { IMemberRepository } from "../ports/IMemberRepository";
import type { ISuscripcionRepository } from "../ports/ISuscripcionRepository";
import type { IPlanRepository } from "../ports/IPlanRepository";
import type { IPagoRepository } from "../ports/IPagoRepository";
import type { ITurnoRepository } from "../ports/ITurnoRepository";
import type { ISucursalRepository } from "../ports/ISucursalRepository";
import type { IAuthorizationService } from "../ports/IAuthorizationService";
import type { Miembro, CambiosMiembro } from "../entities/Miembro";
import type { Suscripcion } from "../entities/Suscripcion";
import type { Plan, FrecuenciaPago } from "../entities/Plan";
import type { Pago, DatosNuevoPago } from "../entities/Pago";
import type { ICambioPlanAuditoriaRepository } from "../ports/ICambioPlanAuditoriaRepository";
import type { CambioPlanAuditoria, DatosNuevoCambioPlanAuditoria } from "../entities/CambioPlanAuditoria";

// Fakes en memoria — reproducen el caso real reportado (Luis Castro) sin
// tocar Prisma/DB, para probar el use-case completo de punta a punta
// (misma fórmula que usa la vista previa del frontend, ver diseño acordado:
// "el backend recalcula siempre y nunca confía en valores del cliente").

function crearFakes(estadoInicial: { miembro: Miembro; suscripcion: Suscripcion; planes: Plan[] }) {
  const miembros = new Map<string, Miembro>([[estadoInicial.miembro.id, estadoInicial.miembro]]);
  const suscripciones = new Map<string, Suscripcion>([[estadoInicial.suscripcion.id, estadoInicial.suscripcion]]);
  const planes = new Map<string, Plan>(estadoInicial.planes.map((p) => [p.id, p]));
  const pagosCreados: DatosNuevoPago[] = [];
  const auditoriasCreadas: DatosNuevoCambioPlanAuditoria[] = [];

  const memberRepo: IMemberRepository = {
    buscarPorOrganizacionYCedula: async () => null,
    buscarPorId: async (_org, id) => miembros.get(id) ?? null,
    listarPorOrganizacion: async () => [...miembros.values()],
    crear: async () => {
      throw new Error("no usado en este test");
    },
    actualizar: async (_org, id, cambios: CambiosMiembro) => {
      const actual = miembros.get(id);
      if (!actual) return null;
      const actualizado = { ...actual, ...cambios };
      miembros.set(id, actualizado);
      return actualizado;
    },
    eliminarConHistorial: async (_org, id) => {
      miembros.delete(id);
    },
    actualizarFechasPago: async (id, fechaUltimoPago, fechaVencimiento) => {
      const actual = miembros.get(id);
      if (!actual) return;
      miembros.set(id, { ...actual, fechaUltimoPago, fechaVencimiento });
    },
  };

  const suscripcionRepo: ISuscripcionRepository = {
    buscarActivaVigentePorMiembro: async (miembroId, fecha) => {
      const s = [...suscripciones.values()].find(
        (s) => s.miembroId === miembroId && s.estado === "ACTIVA" && s.fin.getTime() > fecha.getTime()
      );
      return s ?? null;
    },
    buscarActivaVigentePorMiembroYPlan: async () => null,
    ajustarCicloMasReciente: async () => false,
    listarActivasVigentesPorPlan: async () => [],
    extenderFin: async (id, nuevoFin) => {
      const actual = suscripciones.get(id)!;
      const actualizado = { ...actual, fin: nuevoFin };
      suscripciones.set(id, actualizado);
      return actualizado;
    },
    crear: async () => {
      throw new Error("no usado en este test");
    },
    cambiarPlan: async (id, planId) => {
      const actual = suscripciones.get(id)!;
      const actualizado = { ...actual, planId };
      suscripciones.set(id, actualizado);
      return actualizado;
    },
    actualizarFechaLimiteAbono: async (id, fechaLimiteAbono) => {
      const actual = suscripciones.get(id)!;
      const actualizado = { ...actual, fechaLimiteAbono };
      suscripciones.set(id, actualizado);
      return actualizado;
    },
  };

  const planRepo: IPlanRepository = {
    listarPorOrganizacion: async () => [...planes.values()],
    buscarPorId: async (_org, id) => planes.get(id) ?? null,
    crear: async () => {
      throw new Error("no usado en este test");
    },
    actualizar: async () => null,
    contarSuscripcionesActivasVigentes: async () => 0,
    actualizarFrecuenciaYEntrenador: async (id) => planes.get(id)!,
    eliminar: async () => {},
  };

  const pagoRepo: IPagoRepository = {
    listarConCicloAbierto: async () => [],
    crear: async (datos) => {
      pagosCreados.push(datos);
      const pago: Pago = {
        id: `pago-${pagosCreados.length}`,
        miembroId: datos.miembroId,
        sucursalId: datos.sucursalId,
        turnoId: datos.turnoId,
        registradoPorId: datos.registradoPorId,
        monto: datos.monto,
        metodo: datos.metodo,
        metodoPagoId: datos.metodoPagoId,
        numeroOperacion: datos.numeroOperacion,
        tasaCambio: datos.tasaCambio,
        montoBs: datos.montoBs,
        fechaPago: new Date(),
        fechaInicioCiclo: datos.fechaInicioCiclo,
        fechaFinCiclo: datos.fechaFinCiclo,
        anuladoEn: null,
        anuladoPorId: null,
        motivoAnulacion: null,
        grupoPagoId: datos.grupoPagoId,
      };
      return pago;
    },
    listarPorMiembro: async () => [],
    listarPorOrganizacion: async () => [],
    listarPorOrganizacionYRango: async () => [],
    listarPorTurno: async () => [],
    contarVigentesPorGrupo: async () => 0,
    buscarPorId: async () => null,
    anular: async () => {
      throw new Error("no usado en este test");
    },
  };

  const turnoRepo: ITurnoRepository = {
    crear: async () => {
      throw new Error("no usado en este test");
    },
    buscarPorId: async () => null,
    buscarAbiertoPorSucursal: async () => null,
    buscarAbiertoEntreSucursales: async () => null,
    buscarUltimoCerradoPorSucursal: async () => null,
    cerrar: async () => {
      throw new Error("no usado en este test");
    },
    listarPorOrganizacionYRango: async () => [],
    listarFechasConTurno: async () => [],
  };

  const sucursalRepo: ISucursalRepository = {
    buscarPorApiKey: async () => null,
    buscarPorId: async () => null,
    listarPorOrganizacion: async () => [],
    crear: async () => {
      throw new Error("no usado en este test");
    },
    actualizar: async () => null,
  };

  const autorizacion: IAuthorizationService = {
    puedeCrearUsuarioConRol: () => true,
    tienePermiso: async () => true,
  };

  const auditoriaRepo: ICambioPlanAuditoriaRepository = {
    crear: async (datos) => {
      auditoriasCreadas.push(datos);
      const registro: CambioPlanAuditoria = {
        id: `auditoria-${auditoriasCreadas.length}`,
        ...datos,
        fecha: new Date(),
      };
      return registro;
    },
  };

  const deps: CambiarPlanConPagoDeps = {
    pagos: pagoRepo,
    suscripciones: suscripcionRepo,
    miembros: memberRepo,
    planes: planRepo,
    turnos: turnoRepo,
    sucursales: sucursalRepo,
    autorizacion,
    auditoria: auditoriaRepo,
  };

  return { deps, miembros, suscripciones, pagosCreados, auditoriasCreadas };
}

const DIAS_CICLO_DE_PRUEBA: Record<FrecuenciaPago, number> = {
  DIARIO: 1,
  SEMANAL: 7,
  QUINCENAL: 15,
  MENSUAL: 30,
  SEMESTRAL: 180,
  ANUAL: 365,
  PERSONALIZADO: 0,
};

function crearPlan(datos: {
  id: string;
  nombre: string;
  frecuencia: FrecuenciaPago;
  precioUSD: number;
  incluyeEntrenador?: boolean;
  diasCiclo?: number;
}): Plan {
  return {
    id: datos.id,
    organizacionId: "org-1",
    nombre: datos.nombre,
    frecuencia: datos.frecuencia,
    diasCiclo: datos.diasCiclo ?? DIAS_CICLO_DE_PRUEBA[datos.frecuencia],
    incluyeEntrenador: datos.incluyeEntrenador ?? false,
    precioUSD: datos.precioUSD,
    multisede: false,
    activo: true,
    permitePagoParcial: true,
    minimoAbonoTipo: null,
    minimoAbonoValor: null,
  };
}

function crearMiembroConSuscripcion(datos: {
  id: string;
  nombre: string;
  cedula: string;
  plan: Plan;
  vencimiento: Date;
}) {
  const miembro: Miembro = {
    id: datos.id,
    organizacionId: "org-1",
    sucursalId: "sucursal-1",
    nombre: datos.nombre,
    cedula: datos.cedula,
    fechaInscripcion: null,
    fechaNacimiento: null,
    celular: null,
    fotoUrl: null,
    entrenadorId: null,
    entrenadorNombre: null,
    planId: datos.plan.id,
    precioPlan: datos.plan.precioUSD,
    saldoAFavorUSD: 0,
    fechaUltimoPago: null,
    fechaVencimiento: datos.vencimiento,
    activo: true,
    createdAt: new Date("2026-01-01T00:00:00Z"),
  };
  const suscripcion: Suscripcion = {
    id: `suscripcion-${datos.id}`,
    miembroId: miembro.id,
    planId: datos.plan.id,
    inicio: new Date("2026-01-01T00:00:00Z"),
    fin: datos.vencimiento,
    fechaLimiteAbono: null,
    estado: "ACTIVA",
  };
  return { miembro, suscripcion };
}

// Fija Date.now()/`new Date()` a "hoy" = 2026-09-26 en Caracas (mediodía
// UTC, mismo ancla que cambioPlanCalculo.test.ts) — el use-case usa
// `new Date()` internamente para "ahora". Devuelve una función para
// restaurar el reloj real; SIEMPRE debe llamarse en un `finally`.
function fijarReloj(isoUtc: string): () => void {
  const RealDate = Date;
  class DateFija extends RealDate {
    constructor(...args: ConstructorParameters<typeof RealDate>) {
      if (args.length === 0) {
        super(isoUtc);
      } else {
        // @ts-expect-error -- spread de argumentos variádicos hacia el constructor real de Date
        super(...args);
      }
    }
    static now() {
      return new RealDate(isoUtc).getTime();
    }
  }
  // @ts-expect-error -- reemplazo global de Date solo dentro del test que llama a esto
  global.Date = DateFija;
  return () => {
    global.Date = RealDate;
  };
}

const HOY_ISO = "2026-09-26T16:00:00Z";

describe("cambiarPlanConPago — caso Luis Castro (E1: vista previa vs guardado)", () => {
  const planViejo = crearPlan({ id: "plan-sin-entrenador", nombre: "Sin entrenador", frecuencia: "MENSUAL", precioUSD: 25 });
  const planNuevo = crearPlan({ id: "plan-semanal", nombre: "Semanal", frecuencia: "SEMANAL", precioUSD: 8 });
  const vencimientoOriginal = new Date("2027-06-02T16:00:00Z");

  test("V > precioNuevo: excedente absorbido en días, sin cobro, guardado en Miembro y Suscripción", async () => {
    const { miembro, suscripcion } = crearMiembroConSuscripcion({
      id: "miembro-castro",
      nombre: "Luis Castro",
      cedula: "99374526",
      plan: planViejo,
      vencimiento: vencimientoOriginal,
    });
    const { deps, miembros, suscripciones, pagosCreados, auditoriasCreadas } = crearFakes({
      miembro,
      suscripcion,
      planes: [planViejo, planNuevo],
    });

    const restaurarReloj = fijarReloj(HOY_ISO);
    try {
      // 249 días restantes de un plan $25/30d -> V = $207.50, muy por
      // encima del precio del plan nuevo ($8/7d) — cae en el camino de
      // "excedente absorbido en días".
      const resultado = await cambiarPlanConPago(deps, {
        organizacionId: "org-1",
        miembroId: miembro.id,
        planNuevoId: planNuevo.id,
        origen: "CAJA",
        // Sin líneas de pago: no debe hacer falta, porque no hay nada que
        // cobrar cuando el excedente se absorbe en días.
        lineas: [],
        sucursalId: "sucursal-1",
        registradoPorId: "usuario-1",
        rolUsuario: "SOCIO",
        entrenadorId: null,
      });

      expect(resultado.diferencia).toBe(0);
      expect(resultado.pagos).toHaveLength(0);
      // No debe haberse creado ningún Pago — ni siquiera uno de $0.
      expect(pagosCreados).toHaveLength(0);

      const esperado = miembros.get(miembro.id)!.fechaVencimiento;
      expect(esperado).not.toBeNull();
      expect(resultado.nuevoVencimiento).toEqual(esperado);
      expect(suscripciones.get(suscripcion.id)!.fin).toEqual(esperado);
      expect(miembros.get(miembro.id)!.planId).toBe(planNuevo.id);

      // Registro de auditoría (regla 11): un registro por cambio, con el
      // snapshot exacto del cálculo aplicado, sin pago asociado.
      expect(auditoriasCreadas).toHaveLength(1);
      expect(auditoriasCreadas[0]).toMatchObject({
        organizacionId: "org-1",
        miembroId: miembro.id,
        planAnteriorId: planViejo.id,
        planNuevoId: planNuevo.id,
        vencimientoAnterior: vencimientoOriginal,
        vencimientoNuevo: esperado,
        diasRestantes: 249,
        valorNoConsumidoCentavos: 20750,
        precioAnteriorCentavos: 2500,
        diasCicloAnterior: 30,
        precioNuevoCentavos: 800,
        diasCicloNuevo: 7,
        montoCobradoCentavos: 0,
        modo: "CICLO_COMPLETO",
        origen: "CAJA",
        pagoId: null,
        registradoPorId: "usuario-1",
      });
    } finally {
      restaurarReloj();
    }
  });

  test("V < precioNuevo: cobra la diferencia y vence hoy + diasCicloNuevo, guardado en Miembro y Suscripción", async () => {
    const vencimientoCorto = new Date("2026-10-06T16:00:00Z"); // 10 días desde el 26/09
    const { miembro, suscripcion } = crearMiembroConSuscripcion({
      id: "miembro-castro-ciclo",
      nombre: "Luis Castro",
      cedula: "99374526",
      plan: planViejo,
      vencimiento: vencimientoCorto,
    });
    const planNuevoCaro = crearPlan({ id: "plan-con-entrenador", nombre: "Con entrenador", frecuencia: "MENSUAL", precioUSD: 30 });
    const { deps, miembros, suscripciones, auditoriasCreadas } = crearFakes({
      miembro,
      suscripcion,
      planes: [planViejo, planNuevoCaro],
    });

    const restaurarReloj = fijarReloj(HOY_ISO);
    try {
      // V = 10 * (25/30) = $8.33. precioNuevo = $30. Diferencia = $21.67.
      const resultado = await cambiarPlanConPago(deps, {
        organizacionId: "org-1",
        miembroId: miembro.id,
        planNuevoId: planNuevoCaro.id,
        origen: "CAJA",
        lineas: [{ monto: 21.67, metodo: "efectivo_usd", metodoPagoId: "metodo-1", numeroOperacion: null, tasaCambio: null }],
        sucursalId: "sucursal-1",
        registradoPorId: "usuario-1",
        rolUsuario: "SOCIO",
        entrenadorId: null,
      });

      const esperado = new Date("2026-10-26T00:00:00Z"); // hoy (26/09) + 30 días

      expect(resultado.diferencia).toBe(21.67);
      expect(resultado.nuevoVencimiento).toEqual(esperado);
      expect(resultado.pagos).toHaveLength(1);
      expect(resultado.pagos[0].monto).toBe(21.67);

      expect(miembros.get(miembro.id)!.fechaVencimiento).toEqual(esperado);
      expect(suscripciones.get(suscripcion.id)!.fin).toEqual(esperado);
      expect(miembros.get(miembro.id)!.planId).toBe(planNuevoCaro.id);

      // Con cobro real, la auditoría queda enlazada al primer Pago creado (regla 11).
      expect(auditoriasCreadas).toHaveLength(1);
      expect(auditoriasCreadas[0].montoCobradoCentavos).toBe(2167);
      expect(auditoriasCreadas[0].pagoId).toBe(resultado.pagos[0].id);
      expect(auditoriasCreadas[0].modo).toBe("CICLO_COMPLETO");
    } finally {
      restaurarReloj();
    }
  });

  test("V < precioNuevo, pago combinado (2 métodos que suman exacto): crea 2 pagos con el mismo grupoPagoId", async () => {
    const vencimientoCorto = new Date("2026-10-06T16:00:00Z"); // 10 días desde el 26/09
    const { miembro, suscripcion } = crearMiembroConSuscripcion({
      id: "miembro-castro-combinado",
      nombre: "Luis Castro",
      cedula: "99374526",
      plan: planViejo,
      vencimiento: vencimientoCorto,
    });
    const planNuevoCaro = crearPlan({ id: "plan-con-entrenador-combinado", nombre: "Con entrenador", frecuencia: "MENSUAL", precioUSD: 30 });
    const { deps, pagosCreados, auditoriasCreadas } = crearFakes({
      miembro,
      suscripcion,
      planes: [planViejo, planNuevoCaro],
    });

    const restaurarReloj = fijarReloj(HOY_ISO);
    try {
      // Diferencia = $21.67, dividida en dos métodos distintos.
      const resultado = await cambiarPlanConPago(deps, {
        organizacionId: "org-1",
        miembroId: miembro.id,
        planNuevoId: planNuevoCaro.id,
        origen: "CAJA",
        lineas: [
          { monto: 10, metodo: "efectivo_usd", metodoPagoId: "metodo-1", numeroOperacion: null, tasaCambio: null },
          { monto: 11.67, metodo: "punto_de_venta", metodoPagoId: "metodo-2", numeroOperacion: "OP-1", tasaCambio: null },
        ],
        sucursalId: "sucursal-1",
        registradoPorId: "usuario-1",
        rolUsuario: "SOCIO",
        entrenadorId: null,
      });

      expect(resultado.diferencia).toBe(21.67);
      expect(resultado.pagos).toHaveLength(2);
      expect(pagosCreados).toHaveLength(2);
      expect(pagosCreados[0].grupoPagoId).not.toBeNull();
      expect(pagosCreados[0].grupoPagoId).toBe(pagosCreados[1].grupoPagoId);
      expect(auditoriasCreadas).toHaveLength(1);
      expect(auditoriasCreadas[0].pagoId).toBe(resultado.pagos[0].id);
    } finally {
      restaurarReloj();
    }
  });

  test("V < precioNuevo, líneas que no suman exacto: lanza MontoLineasNoCubreObjetivoError", async () => {
    const vencimientoCorto = new Date("2026-10-06T16:00:00Z");
    const { miembro, suscripcion } = crearMiembroConSuscripcion({
      id: "miembro-castro-lineas-incompletas",
      nombre: "Luis Castro",
      cedula: "99374526",
      plan: planViejo,
      vencimiento: vencimientoCorto,
    });
    const planNuevoCaro = crearPlan({ id: "plan-con-entrenador-incompleto", nombre: "Con entrenador", frecuencia: "MENSUAL", precioUSD: 30 });
    const { deps } = crearFakes({ miembro, suscripcion, planes: [planViejo, planNuevoCaro] });

    const restaurarReloj = fijarReloj(HOY_ISO);
    try {
      // Diferencia real = $21.67, pero las líneas solo suman $15 — no debe
      // tratarse como abono parcial (no existe abono sobre esta diferencia).
      await expect(
        cambiarPlanConPago(deps, {
          organizacionId: "org-1",
          miembroId: miembro.id,
          planNuevoId: planNuevoCaro.id,
          origen: "CAJA",
          lineas: [{ monto: 15, metodo: "efectivo_usd", metodoPagoId: "metodo-1", numeroOperacion: null, tasaCambio: null }],
          sucursalId: "sucursal-1",
          registradoPorId: "usuario-1",
          rolUsuario: "SOCIO",
          entrenadorId: null,
        })
      ).rejects.toThrow("La suma de las líneas de pago no coincide con el monto a cobrar.");
    } finally {
      restaurarReloj();
    }
  });

  test("V < precioNuevo sin líneas de pago: lanza MetodoPagoRequeridoError", async () => {
    const vencimientoCorto = new Date("2026-10-06T16:00:00Z");
    const { miembro, suscripcion } = crearMiembroConSuscripcion({
      id: "miembro-castro-sin-metodo",
      nombre: "Luis Castro",
      cedula: "99374526",
      plan: planViejo,
      vencimiento: vencimientoCorto,
    });
    const planNuevoCaro = crearPlan({ id: "plan-con-entrenador-2", nombre: "Con entrenador", frecuencia: "MENSUAL", precioUSD: 30 });
    const { deps } = crearFakes({ miembro, suscripcion, planes: [planViejo, planNuevoCaro] });

    const restaurarReloj = fijarReloj(HOY_ISO);
    try {
      await expect(
        cambiarPlanConPago(deps, {
          organizacionId: "org-1",
          miembroId: miembro.id,
          planNuevoId: planNuevoCaro.id,
          origen: "CAJA",
          lineas: [],
          sucursalId: "sucursal-1",
          registradoPorId: "usuario-1",
          rolUsuario: "SOCIO",
          entrenadorId: null,
        })
      ).rejects.toThrow("Elegí un método de pago para cobrar la diferencia.");
    } finally {
      restaurarReloj();
    }
  });
});

describe("cambiarPlanConPago — caso Luis Mendoza (Corporativo -> Plan Viejo, V == precioNuevo)", () => {
  test("V == precioNuevo: sin cobro, avanza un ciclo normal, guardado en el Miembro y en la Suscripción", async () => {
    const planViejo = crearPlan({ id: "plan-corporativo", nombre: "Corporativo", frecuencia: "MENSUAL", precioUSD: 22 });
    // 9 días restantes de $22/30d -> V = $6.60. Plan nuevo con precio exacto
    // igual a V para probar el caso "V == precioNuevo" del use-case completo.
    const planNuevo = crearPlan({ id: "plan-igual-a-v", nombre: "Igual a V", frecuencia: "MENSUAL", precioUSD: 6.6 });
    const vencimientoOriginal = new Date("2026-10-05T16:00:00Z"); // 9 días desde el 26/09

    const { miembro, suscripcion } = crearMiembroConSuscripcion({
      id: "miembro-mendoza",
      nombre: "Luis Mendoza",
      cedula: "11111111",
      plan: planViejo,
      vencimiento: vencimientoOriginal,
    });
    const { deps, miembros, suscripciones, pagosCreados } = crearFakes({ miembro, suscripcion, planes: [planViejo, planNuevo] });

    const restaurarReloj = fijarReloj(HOY_ISO);
    try {
      const resultado = await cambiarPlanConPago(deps, {
        organizacionId: "org-1",
        miembroId: miembro.id,
        planNuevoId: planNuevo.id,
        origen: "CAJA",
        lineas: [],
        sucursalId: "sucursal-1",
        registradoPorId: "usuario-1",
        rolUsuario: "SOCIO",
        entrenadorId: null,
      });

      const esperado = new Date("2026-10-26T00:00:00Z"); // hoy (26/09) + 30 días, sin días extra

      expect(resultado.diferencia).toBe(0);
      expect(resultado.pagos).toHaveLength(0);
      expect(pagosCreados).toHaveLength(0);
      expect(resultado.nuevoVencimiento).toEqual(esperado);
      expect(miembros.get(miembro.id)!.fechaVencimiento).toEqual(esperado);
      expect(suscripciones.get(suscripcion.id)!.fin).toEqual(esperado);
    } finally {
      restaurarReloj();
    }
  });
});
