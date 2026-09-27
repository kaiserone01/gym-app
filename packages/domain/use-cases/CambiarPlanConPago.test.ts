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

// Fakes en memoria — reproducen el caso real reportado (Luis Castro) sin
// tocar Prisma/DB, para probar el use-case completo de punta a punta
// (misma fórmula que usa la vista previa del frontend, ver diseño acordado:
// "el backend recalcula siempre y nunca confía en valores del cliente").

function crearFakes(estadoInicial: { miembro: Miembro; suscripcion: Suscripcion; planes: Plan[] }) {
  const miembros = new Map<string, Miembro>([[estadoInicial.miembro.id, estadoInicial.miembro]]);
  const suscripciones = new Map<string, Suscripcion>([[estadoInicial.suscripcion.id, estadoInicial.suscripcion]]);
  const planes = new Map<string, Plan>(estadoInicial.planes.map((p) => [p.id, p]));
  const pagosCreados: DatosNuevoPago[] = [];

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

  const deps: CambiarPlanConPagoDeps = {
    pagos: pagoRepo,
    suscripciones: suscripcionRepo,
    miembros: memberRepo,
    planes: planRepo,
    turnos: turnoRepo,
    sucursales: sucursalRepo,
    autorizacion,
  };

  return { deps, miembros, suscripciones, pagosCreados };
}

function crearPlan(datos: {
  id: string;
  nombre: string;
  frecuencia: FrecuenciaPago;
  precioUSD: number;
  incluyeEntrenador?: boolean;
}): Plan {
  return {
    id: datos.id,
    organizacionId: "org-1",
    nombre: datos.nombre,
    frecuencia: datos.frecuencia,
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

  test("Solo ajustar vencimiento: guarda 27/03/2027 tanto en el Miembro como en la Suscripción", async () => {
    const { miembro, suscripcion } = crearMiembroConSuscripcion({
      id: "miembro-castro",
      nombre: "Luis Castro",
      cedula: "99374526",
      plan: planViejo,
      vencimiento: vencimientoOriginal,
    });
    const { deps, miembros, suscripciones } = crearFakes({ miembro, suscripcion, planes: [planViejo, planNuevo] });

    const restaurarReloj = fijarReloj(HOY_ISO);
    try {
      const resultado = await cambiarPlanConPago(deps, {
        organizacionId: "org-1",
        miembroId: miembro.id,
        planNuevoId: planNuevo.id,
        modo: "AJUSTAR_VENCIMIENTO",
        metodo: null,
        metodoPagoId: null,
        numeroOperacion: null,
        tasaCambio: null,
        sucursalId: "sucursal-1",
        registradoPorId: "usuario-1",
        rolUsuario: "SOCIO",
        entrenadorId: null,
      });

      const esperado = new Date("2027-03-27T00:00:00Z");

      expect(resultado.nuevoVencimiento).toEqual(esperado);
      expect(resultado.diferencia).toBe(0);

      // El bug reportado (E1): el vencimiento se guarda en la Suscripción
      // pero NUNCA se propaga a Miembro.fechaVencimiento en modo
      // AJUSTAR_VENCIMIENTO (diferencia siempre 0 en ese modo) — el
      // miembro seguía viendo el vencimiento viejo tras recargar.
      expect(miembros.get(miembro.id)!.fechaVencimiento).toEqual(esperado);
      expect(suscripciones.get(suscripcion.id)!.fin).toEqual(esperado);
      expect(miembros.get(miembro.id)!.planId).toBe(planNuevo.id);
    } finally {
      restaurarReloj();
    }
  });

  test("Ciclo completo: cobra $8.00 y vence 03/04/2027, guardado en Miembro y Suscripción", async () => {
    const { miembro, suscripcion } = crearMiembroConSuscripcion({
      id: "miembro-castro-ciclo",
      nombre: "Luis Castro",
      cedula: "99374526",
      plan: planViejo,
      vencimiento: vencimientoOriginal,
    });
    const { deps, miembros, suscripciones } = crearFakes({ miembro, suscripcion, planes: [planViejo, planNuevo] });

    const restaurarReloj = fijarReloj(HOY_ISO);
    try {
      const resultado = await cambiarPlanConPago(deps, {
        organizacionId: "org-1",
        miembroId: miembro.id,
        planNuevoId: planNuevo.id,
        modo: "CICLO_COMPLETO",
        metodo: "efectivo_usd",
        metodoPagoId: "metodo-1",
        numeroOperacion: null,
        tasaCambio: null,
        sucursalId: "sucursal-1",
        registradoPorId: "usuario-1",
        rolUsuario: "SOCIO",
        entrenadorId: null,
      });

      const esperado = new Date("2027-04-03T00:00:00Z");

      expect(resultado.diferencia).toBe(8);
      expect(resultado.nuevoVencimiento).toEqual(esperado);
      expect(resultado.pago).not.toBeNull();
      expect(resultado.pago!.monto).toBe(8);

      expect(miembros.get(miembro.id)!.fechaVencimiento).toEqual(esperado);
      expect(suscripciones.get(suscripcion.id)!.fin).toEqual(esperado);
      expect(miembros.get(miembro.id)!.planId).toBe(planNuevo.id);
    } finally {
      restaurarReloj();
    }
  });
});

describe("cambiarPlanConPago — caso Luis Mendoza (Corporativo -> Plan Viejo, Solo ajustar)", () => {
  test("9 días restantes: guarda 06/10/2026 en el Miembro y en la Suscripción", async () => {
    const planViejo = crearPlan({ id: "plan-corporativo", nombre: "Corporativo", frecuencia: "MENSUAL", precioUSD: 22 });
    const planNuevo = crearPlan({ id: "plan-viejo", nombre: "Plan Viejo", frecuencia: "MENSUAL", precioUSD: 20 });
    const vencimientoOriginal = new Date("2026-10-05T16:00:00Z"); // 9 días desde el 26/09

    const { miembro, suscripcion } = crearMiembroConSuscripcion({
      id: "miembro-mendoza",
      nombre: "Luis Mendoza",
      cedula: "11111111",
      plan: planViejo,
      vencimiento: vencimientoOriginal,
    });
    const { deps, miembros, suscripciones } = crearFakes({ miembro, suscripcion, planes: [planViejo, planNuevo] });

    const restaurarReloj = fijarReloj(HOY_ISO);
    try {
      const resultado = await cambiarPlanConPago(deps, {
        organizacionId: "org-1",
        miembroId: miembro.id,
        planNuevoId: planNuevo.id,
        modo: "AJUSTAR_VENCIMIENTO",
        metodo: null,
        metodoPagoId: null,
        numeroOperacion: null,
        tasaCambio: null,
        sucursalId: "sucursal-1",
        registradoPorId: "usuario-1",
        rolUsuario: "SOCIO",
        entrenadorId: null,
      });

      const esperado = new Date("2026-10-06T00:00:00Z");

      expect(resultado.diferencia).toBe(0);
      expect(resultado.nuevoVencimiento).toEqual(esperado);
      expect(miembros.get(miembro.id)!.fechaVencimiento).toEqual(esperado);
      expect(suscripciones.get(suscripcion.id)!.fin).toEqual(esperado);
    } finally {
      restaurarReloj();
    }
  });
});
