import { randomUUID } from "node:crypto";
import { IDeudaProductoRepository } from "../ports/IDeudaProductoRepository";
import { IPagoRepository } from "../ports/IPagoRepository";
import { ITurnoRepository } from "../ports/ITurnoRepository";
import { IAuthorizationService } from "../ports/IAuthorizationService";
import { conceptoDeudas, totalDeudas } from "../entities/DeudaProducto";
import { Pago, DatosLineaPago, validarLineasDePago, LineasDePagoInvalidasError, MontoLineasNoCubreObjetivoError } from "../entities/Pago";
import { SinTurnoAbiertoError } from "./VenderProducto";

export { SinTurnoAbiertoError, LineasDePagoInvalidasError, MontoLineasNoCubreObjetivoError };

export class RolNoAutorizadoError extends Error {
  constructor() {
    super("Tu rol no tiene permiso para cobrar deudas.");
  }
}

export class SinDeudasPendientesError extends Error {
  constructor() {
    super("Este miembro no tiene productos pendientes de cobro.");
  }
}

export class DeudasYaCobradasError extends Error {
  constructor() {
    super("Estas deudas ya fueron cobradas o anuladas desde otra caja. Actualiza la lista.");
  }
}

// Si el cobro es solo de algunos productos (el cliente marcó cuáles), se queda con esos; un id que ya no está
// pendiente (cobrado o anulado desde otra caja) invalida el cobro. Sin ids, todas las pendientes.
export function seleccionarDeudas<T extends { id: string }>(pendientes: T[], deudaIds?: string[]): T[] {
  if (!deudaIds) return pendientes;
  const elegidas = pendientes.filter((d) => deudaIds.includes(d.id));
  if (elegidas.length !== new Set(deudaIds).size) throw new DeudasYaCobradasError();
  return elegidas;
}

export interface CobrarDeudasMiembroDeps {
  deudas: IDeudaProductoRepository;
  pagos: IPagoRepository;
  turnos: ITurnoRepository;
  autorizacion: IAuthorizationService;
}

export interface DatosCobrarDeudas {
  organizacionId: string;
  miembroId: string;
  lineas: DatosLineaPago[];
  sucursalId: string;
  registradoPorId: string;
  // Solo estos productos (los marcados en pantalla); sin esto, todos los pendientes del miembro.
  deudaIds?: string[];
}

// Debe correr dentro de una transacción (ver cobrarDeudasAction): si falla
// después de marcar las deudas, se revierte todo.
export async function cobrarDeudasMiembro(deps: CobrarDeudasMiembroDeps, input: DatosCobrarDeudas): Promise<Pago[]> {
  if (!(await deps.autorizacion.tienePermiso(input.registradoPorId, "CAJA", "CREAR"))) {
    throw new RolNoAutorizadoError();
  }

  const deudas = seleccionarDeudas(
    await deps.deudas.listarPendientesPorMiembro(input.organizacionId, input.miembroId, input.sucursalId),
    input.deudaIds
  );
  if (deudas.length === 0) {
    throw new SinDeudasPendientesError();
  }

  // El total lo calcula el servidor; el cliente solo manda cómo lo paga.
  validarLineasDePago(input.lineas, "exacto", totalDeudas(deudas));

  const turnoAbierto = await deps.turnos.buscarAbiertoPorSucursal(input.sucursalId);
  if (!turnoAbierto) {
    throw new SinTurnoAbiertoError();
  }

  const grupoPagoId = randomUUID();
  const cobradas = await deps.deudas.marcarCobradas(
    deudas.map((d) => d.id),
    input.registradoPorId,
    new Date(),
    grupoPagoId
  );
  if (cobradas !== deudas.length) {
    throw new DeudasYaCobradasError();
  }

  const concepto = conceptoDeudas(deudas);
  const pagosCreados: Pago[] = [];
  for (const linea of input.lineas) {
    pagosCreados.push(
      await deps.pagos.crear({
        miembroId: input.miembroId,
        sucursalId: input.sucursalId,
        turnoId: turnoAbierto.id,
        registradoPorId: input.registradoPorId,
        monto: linea.monto,
        metodo: linea.metodo,
        metodoPagoId: linea.metodoPagoId,
        numeroOperacion: linea.numeroOperacion,
        tasaCambio: linea.tasaCambio,
        montoBs: linea.tasaCambio !== null ? linea.monto * linea.tasaCambio : null,
        fechaInicioCiclo: null,
        fechaFinCiclo: null,
        grupoPagoId,
        productoId: null,
        productoNombre: concepto,
        cantidad: null,
      })
    );
  }

  return pagosCreados;
}
