import { IPagoRepository } from "../ports/IPagoRepository";
import { ISuscripcionRepository } from "../ports/ISuscripcionRepository";
import { IMemberRepository } from "../ports/IMemberRepository";
import { IPlanRepository } from "../ports/IPlanRepository";
import { ITurnoRepository } from "../ports/ITurnoRepository";
import { ISucursalRepository } from "../ports/ISucursalRepository";
import { IAuthorizationService } from "../ports/IAuthorizationService";
import { Pago } from "../entities/Pago";
import { RolUsuario } from "../entities/UsuarioAdmin";
import { MiembroFueraDeSucursalError } from "./ObtenerMiembro";

export { MiembroFueraDeSucursalError };

export class MiembroNoEncontradoError extends Error {
  constructor() {
    super("No se encontró el miembro.");
  }
}

export class PlanNoEncontradoError extends Error {
  constructor() {
    super("No se encontró el plan.");
  }
}

export class PlanInactivoError extends Error {
  constructor() {
    super("No se puede cambiar a un plan inactivo.");
  }
}

export class RolNoAutorizadoError extends Error {
  constructor() {
    super("Tu rol no tiene permiso para registrar pagos.");
  }
}

// Cambiar de plan sin un ciclo vigente (nunca pagó, o el plan anterior ya
// venció) no tiene "diferencia" que cobrar — ese caso se resuelve
// registrando un pago normal por el precio completo del plan nuevo.
export class SinCicloVigenteError extends Error {
  constructor() {
    super("Este miembro no tiene un ciclo vigente — registrá un pago normal por el precio completo del plan nuevo.");
  }
}

export class MetodoPagoRequeridoError extends Error {
  constructor() {
    super("Elegí un método de pago para cobrar la diferencia.");
  }
}

export interface CambiarPlanConPagoDeps {
  pagos: IPagoRepository;
  suscripciones: ISuscripcionRepository;
  miembros: IMemberRepository;
  planes: IPlanRepository;
  turnos: ITurnoRepository;
  sucursales: ISucursalRepository;
  autorizacion: IAuthorizationService;
}

export interface DatosCambiarPlanConPago {
  organizacionId: string;
  miembroId: string;
  planNuevoId: string;
  metodo: string | null;
  metodoPagoId: string | null;
  numeroOperacion: string | null;
  tasaCambio: number | null;
  sucursalId: string;
  registradoPorId: string;
  rolUsuario: RolUsuario;
}

export interface ResultadoCambioPlan {
  pago: Pago | null;
  diferencia: number;
}

// Sube (o cambia) de plan A MITAD DE CICLO cobrando solo la diferencia de
// precio, sin extender el vencimiento — el miembro ya pagó por esos días,
// el cambio de plan no se los renueva (ver diseño acordado). El precio del
// plan "anterior" se toma del plan real de la Suscripcion vigente (no de
// Miembro.planId, que puede haber quedado desincronizado por una edición
// manual — ver diseño acordado sobre el bug de "vuelve a cobrar de menos").
export async function cambiarPlanConPago(
  deps: CambiarPlanConPagoDeps,
  input: DatosCambiarPlanConPago
): Promise<ResultadoCambioPlan> {
  if (!(await deps.autorizacion.tienePermiso(input.registradoPorId, "PAGOS", "CREAR"))) {
    throw new RolNoAutorizadoError();
  }

  const miembro = await deps.miembros.buscarPorId(input.organizacionId, input.miembroId);
  if (!miembro) {
    throw new MiembroNoEncontradoError();
  }

  if (miembro.sucursalId !== null && miembro.sucursalId !== input.sucursalId) {
    const sucursal = await deps.sucursales.buscarPorId(input.organizacionId, miembro.sucursalId);
    throw new MiembroFueraDeSucursalError(sucursal?.nombre ?? "otra sucursal");
  }

  const planNuevo = await deps.planes.buscarPorId(input.organizacionId, input.planNuevoId);
  if (!planNuevo) {
    throw new PlanNoEncontradoError();
  }
  if (!planNuevo.activo) {
    throw new PlanInactivoError();
  }

  const ahora = new Date();
  const activa = await deps.suscripciones.buscarActivaVigentePorMiembro(input.miembroId, ahora);
  if (!activa) {
    throw new SinCicloVigenteError();
  }

  const planViejo = await deps.planes.buscarPorId(input.organizacionId, activa.planId);
  const precioViejo = planViejo?.precioUSD ?? miembro.precioPlan;
  const diferencia = Math.round(Math.max(0, planNuevo.precioUSD - precioViejo) * 100) / 100;

  let pago: Pago | null = null;

  if (diferencia > 0) {
    if (!input.metodo || !input.metodoPagoId) {
      throw new MetodoPagoRequeridoError();
    }

    const turnoAbierto = await deps.turnos.buscarAbiertoPorSucursal(input.sucursalId);

    pago = await deps.pagos.crear({
      miembroId: input.miembroId,
      sucursalId: input.sucursalId,
      turnoId: turnoAbierto?.id ?? null,
      registradoPorId: input.registradoPorId,
      monto: diferencia,
      metodo: input.metodo,
      metodoPagoId: input.metodoPagoId,
      numeroOperacion: input.numeroOperacion,
      tasaCambio: input.tasaCambio,
      montoBs: input.tasaCambio !== null ? diferencia * input.tasaCambio : null,
      fechaInicioCiclo: activa.inicio,
      fechaFinCiclo: activa.fin,
    });

    await deps.miembros.actualizarFechasPago(input.miembroId, ahora, activa.fin);
  }

  await deps.suscripciones.cambiarPlan(activa.id, input.planNuevoId);
  await deps.miembros.actualizar(input.organizacionId, input.miembroId, {
    planId: input.planNuevoId,
    precioPlan: planNuevo.precioUSD,
  });

  return { pago, diferencia };
}
